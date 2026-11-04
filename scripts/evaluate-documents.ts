import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { request, type APIRequestContext } from '@playwright/test';
import { BudgetLedger } from '../src/lib/budget';
import { closePool, query, transaction } from '../src/lib/db';
import {
  applyExtraction,
  calculateTotals,
  createCase,
  digest,
  DomainError,
} from '../src/lib/domain';
import { EXTRACTION_MODEL, PROMPT_VERSION, type ValidatedExtraction } from '../src/lib/extraction';
import type {
  CaseRecord,
  DocumentKind,
  ExtractionFields,
  NewCaseInput,
  WorkspaceResponse,
} from '../src/lib/types';
import { ExtractionProvider } from '../src/worker/provider';

// Explicit opt-in: this script makes bounded, paid calls against the actual persisted budget.
if (!process.argv.includes('--live'))
  throw new Error('Pass --live to run the frozen paid evaluation.');
const baseURL = process.env.EVALUATION_URL || 'https://shortfall.95.179.254.189.sslip.io';
const directory = path.resolve('fixtures/evaluation-v1');
const statePath = path.resolve('.deploy/evaluation-v1-private.json');
const reportPath = path.resolve('docs/evaluation-results.json');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
type Fields = Omit<ExtractionFields, 'evidence'>;
interface Entry {
  id: string;
  kind: DocumentKind;
  format: string;
  file: string;
  textFile: string;
  rawSha256: string;
  textSha256: string;
  expectedOutcome: 'accept' | 'review' | 'case_review' | 'safe_parse_or_review';
  expectedFields: Partial<Fields>;
  criticalFields: string[];
  reason: string;
  apiWorkflow?: boolean;
  context?: NewCaseInput;
  family?: number;
}
interface Usage {
  id: string;
  status: string;
  amount_microusd: string;
  actual_microusd: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  model: string | null;
  latency_ms: number | null;
}
interface Result {
  id: string;
  expectedOutcome: Entry['expectedOutcome'];
  route: string;
  outcome: 'accepted' | 'review' | 'case_review' | 'infrastructure_error';
  passed: boolean;
  error?: string;
  fields?: Partial<Fields>;
  criticalFields: { total: number; correct: number; wrong: number; abstained: number };
  wrongFields: string[];
  wallMs: number;
  usage: Usage[];
  evidenceCount?: number;
  caseBinding?: { code: string; ledgerUnchanged: boolean };
}
interface State {
  runId: string;
  startedAt: string;
  finishedAt?: string;
  manifestSha256: string;
  sessions: {
    workspaceId: string;
    storageState: Awaited<ReturnType<APIRequestContext['storageState']>>;
  }[];
  results: Result[];
  inFlight?: string;
  workflow: {
    caseId?: string;
    oldProposalId?: string;
    checks: Record<string, boolean | number | string>;
    error?: string;
  };
}
const manifestText = await readFile(path.join(directory, 'manifest.json'), 'utf8');
const manifest = JSON.parse(manifestText) as {
  frozenAt: string;
  sourceHashes: Record<string, string>;
  documents: Entry[];
};
const manifestHash = hash(manifestText);
if ((await readFile(path.join(directory, 'manifest.sha256'), 'utf8')).trim() !== manifestHash)
  throw new Error('Frozen corpus manifest checksum does not match.');
for (const entry of manifest.documents) {
  if (
    hash(await readFile(path.join(directory, entry.file))) !== entry.rawSha256 ||
    hash(await readFile(path.join(directory, entry.textFile))) !== entry.textSha256
  )
    throw new Error(`Frozen document changed: ${entry.id}`);
}
for (const [file, expected] of Object.entries(manifest.sourceHashes)) {
  if (hash(await readFile(file)) !== expected) throw new Error(`Baseline source changed: ${file}`);
}
await mkdir('.deploy', { recursive: true });
let state: State;
try {
  state = JSON.parse(await readFile(statePath, 'utf8'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  state = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    manifestSha256: manifestHash,
    sessions: [],
    results: [],
    workflow: { checks: {} },
  };
}
if (state.manifestSha256 !== manifestHash)
  throw new Error('Private run state belongs to a different corpus.');
if (state.finishedAt)
  throw new Error('This baseline run is complete; do not overwrite it with tuned reruns.');
if (state.inFlight)
  throw new Error(`Review interrupted attempt before resuming: ${state.inFlight}`);
const save = () => writeFile(statePath, JSON.stringify(state, null, 2) + '\n');
const contexts: APIRequestContext[] = [];
const provider = new ExtractionProvider(new BudgetLedger(transaction));
if (!provider.enabled) throw new Error('The selected provider is not enabled.');
async function json<T>(
  api: APIRequestContext,
  method: 'get' | 'post',
  url: string,
  data?: unknown,
): Promise<T> {
  const response = await api[method](url, data === undefined ? {} : { data });
  if (!response.ok()) {
    const body = await response.json().catch(() => ({}));
    throw new Error(`API ${response.status()}: ${String(body.code || 'request failed')}`);
  }
  return response.json();
}
async function usage(workspaceId?: string): Promise<Usage[]> {
  return (
    await query<Usage>(
      `SELECT id,status,amount_microusd::text,actual_microusd::text,
    input_tokens,output_tokens,model,latency_ms FROM inference_reservations
    WHERE workspace_id = ANY($1::uuid[]) ORDER BY created_at`,
      [workspaceId ? [workspaceId] : state.sessions.map((s) => s.workspaceId)],
    )
  ).rows;
}
function consumed(rows: Usage[]): number {
  return rows.reduce(
    (sum, row) =>
      sum +
      (row.status === 'settled'
        ? Number(row.actual_microusd)
        : ['reserved', 'uncertain'].includes(row.status)
          ? Number(row.amount_microusd)
          : 0),
    0,
  );
}
async function guard(upcomingCalls: number) {
  if (consumed(await usage()) + upcomingCalls * 90_000 > 3_000_000)
    throw new Error('The evaluation would exceed its separate $3 ceiling.');
}
async function pollCase(api: APIRequestContext, caseId: string, ready: (c: CaseRecord) => boolean) {
  const deadline = Date.now() + 150_000;
  while (Date.now() < deadline) {
    const c = await json<CaseRecord>(api, 'get', `/api/cases/${caseId}`);
    if (ready(c)) return c;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error('The deployed worker did not complete within 150 seconds.');
}
function action(api: APIRequestContext, caseId: string, actionName: string, values = {}) {
  return json<CaseRecord>(api, 'post', `/api/cases/${caseId}/actions`, {
    action: actionName,
    ...values,
  });
}
async function apiExtract(entry: Entry, api: APIRequestContext): Promise<ValidatedExtraction> {
  const workflow = state.workflow;
  if (!workflow.caseId) {
    const c = await json<CaseRecord>(api, 'post', '/api/cases', entry.context);
    workflow.caseId = c.id;
    const proposed = await action(api, c.id, 'propose');
    const proposal = proposed.proposals.at(-1)!;
    workflow.oldProposalId = proposal.id;
    workflow.checks.initialHoldCents = proposal.amountCents;
    workflow.checks.initialHoldCorrect = proposal.amountCents === 18_750;
    await save();
  }
  const caseId = workflow.caseId;
  const uploaded = await api.post(`/api/cases/${caseId}/documents`, {
    multipart: {
      kind: entry.kind,
      reference: String(entry.expectedFields.reference),
      file: {
        name: entry.file,
        mimeType: entry.format === 'pdf' ? 'application/pdf' : 'text/plain',
        buffer: await readFile(path.join(directory, entry.file)),
      },
    },
  });
  if (uploaded.status() !== 202) throw new Error(`Document upload returned ${uploaded.status()}.`);
  const uploadedCase = (await uploaded.json()) as CaseRecord;
  const documentId = uploadedCase.documents.at(-1)!.id;
  const c = await pollCase(
    api,
    caseId,
    (current) => current.documents.find((d) => d.id === documentId)?.status !== 'pending',
  );
  const document = c.documents.find((d) => d.id === documentId)!;
  if (document.status !== 'verified')
    throw new Error(`Document review: ${document.extractionError}`);
  if (document.model !== EXTRACTION_MODEL)
    throw new Error('Document has no verified selected-model extraction.');
  const fields: Record<string, unknown> = {
    kind: entry.kind,
    invoiceNumber: '',
    unitPriceCents: 0,
    totalCents: 0,
  };
  for (const e of document.evidence)
    fields[e.field] = ['quantity', 'unitPriceCents', 'totalCents'].includes(e.field)
      ? Number(e.value)
      : e.value;
  fields.evidence = document.evidence;
  if (entry.kind === 'receipt') {
    const stale = await api.post(`/api/cases/${caseId}/actions`, {
      data: { action: 'approve', proposalId: workflow.oldProposalId },
    });
    workflow.checks.staleApprovalRejected = stale.status() === 409;
    const revised = await action(api, caseId, 'propose');
    const proposal = revised.proposals.at(-1)!;
    workflow.checks.revisedHoldCents = proposal.amountCents;
    workflow.checks.revisedHoldCorrect = proposal.amountCents === 6250;
    await action(api, caseId, 'approve', { proposalId: proposal.id });
    const held = await pollCase(
      api,
      caseId,
      (current) => current.executions.at(-1)?.status === 'applied',
    );
    workflow.checks.heldCentsCorrect = held.heldCents === 6250;
  } else {
    workflow.checks.creditAwaitedApproval = c.appliedCreditCents === 0 && c.heldCents === 6250;
    const proposed = await action(api, caseId, 'propose');
    const proposal = proposed.proposals.at(-1)!;
    await action(api, caseId, 'approve', { proposalId: proposal.id });
    const finalCase = await pollCase(
      api,
      caseId,
      (current) => current.executions.at(-1)?.status === 'applied',
    );
    const totals = calculateTotals(finalCase);
    workflow.checks.finalStatus = finalCase.status;
    workflow.checks.finalNetCents = totals.netCents;
    workflow.checks.openPurchaseOrderUnits = totals.openPoUnits;
    workflow.checks.finalLedgerCorrect =
      finalCase.status === 'resolved' &&
      finalCase.heldCents === 0 &&
      finalCase.appliedCreditCents === 6250 &&
      totals.netCents === 87_500 &&
      totals.openPoUnits === 5;
  }
  await save();
  return fields as unknown as ValidatedExtraction;
}
function score(entry: Entry, fields?: ValidatedExtraction) {
  const wrongFields = fields
    ? entry.criticalFields.filter(
        (field) =>
          (fields as unknown as Record<string, unknown>)[field] !==
          (entry.expectedFields as Record<string, unknown>)[field],
      )
    : [];
  return {
    wrongFields,
    criticalFields: {
      total: entry.criticalFields.length,
      correct: fields ? entry.criticalFields.length - wrongFields.length : 0,
      wrong: wrongFields.length,
      abstained: fields ? 0 : entry.criticalFields.length,
    },
  };
}
function caseBinding(entry: Entry, fields: ValidatedExtraction, text: string) {
  const c = createCase(entry.context!);
  const id = randomUUID();
  c.documents.push({
    id,
    kind: entry.kind,
    reference: fields.reference,
    text,
    hash: digest(text),
    createdAt: new Date().toISOString(),
    status: 'pending',
    evidence: [],
  });
  const before = JSON.stringify(c);
  try {
    applyExtraction(c, id, fields);
    return { code: 'ACCEPTED', ledgerUnchanged: before === JSON.stringify(c) };
  } catch (error) {
    return {
      code: error instanceof DomainError ? error.code : 'UNEXPECTED',
      ledgerUnchanged: before === JSON.stringify(c),
    };
  }
}
function percentile(values: number[], p: number) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];
}
async function report() {
  const rows = await usage();
  const supported = state.results.filter((r) => r.expectedOutcome === 'accept');
  const challenges = state.results.filter((r) => r.expectedOutcome !== 'accept');
  const fieldTotals = supported.reduce(
    (a, r) => ({
      total: a.total + r.criticalFields.total,
      correct: a.correct + r.criticalFields.correct,
      wrong: a.wrong + r.criticalFields.wrong,
      abstained: a.abstained + r.criticalFields.abstained,
    }),
    { total: 0, correct: 0, wrong: 0, abstained: 0 },
  );
  const documentLatencies = state.results.map((r) => r.wallMs);
  const providerLatencies = rows.flatMap((r) => (r.latency_ms === null ? [] : [r.latency_ms]));
  const summary = {
    completedDocuments: state.results.length,
    supported: {
      documents: supported.length,
      acceptedCorrect: supported.filter((r) => r.passed).length,
      reviewed: supported.filter((r) => r.outcome === 'review').length,
      infrastructureErrors: supported.filter((r) => r.outcome === 'infrastructure_error').length,
      criticalFields: fieldTotals,
    },
    challenges: {
      documents: challenges.length,
      passed: challenges.filter((r) => r.passed).length,
      unexpectedAccepted: challenges.filter((r) => r.outcome === 'accepted' && !r.passed).length,
    },
    accounting: {
      settledCalls: rows.filter((r) => r.status === 'settled').length,
      uncertainCalls: rows.filter((r) => r.status === 'uncertain').length,
      reservedCalls: rows.filter((r) => r.status === 'reserved').length,
      releasedPreflight: rows.filter((r) => r.status === 'released').length,
      measuredCostUsd:
        rows.reduce((n, r) => n + (r.status === 'settled' ? Number(r.actual_microusd) : 0), 0) /
        1_000_000,
      accountedIncludingUncertainUsd: consumed(rows) / 1_000_000,
    },
    latencyMs: {
      documentMedian: percentile(documentLatencies, 0.5),
      documentP95: percentile(documentLatencies, 0.95),
      providerMedian: percentile(providerLatencies, 0.5),
      providerP95: percentile(providerLatencies, 0.95),
    },
  };
  const output = {
    version: 1,
    runId: state.runId,
    startedAt: state.startedAt,
    finishedAt: state.finishedAt ?? null,
    status: state.finishedAt ? 'complete' : 'in_progress',
    model: EXTRACTION_MODEL,
    promptVersion: PROMPT_VERSION,
    dataset: {
      path: 'fixtures/evaluation-v1/manifest.json',
      sha256: manifestHash,
      frozenAt: manifest.frozenAt,
      synthetic: true,
      independentlyLabeled: false,
      codeHashes: manifest.sourceHashes,
    },
    methodology:
      'Frozen synthetic first-pass baseline. All paid attempts use ordinary evaluation workspaces and the real global budget. No automatic retry for direct calls; the deployed worker may retry API jobs once. Two documents use the public API; other documents use the identical provider and validator. Case-binding tests use the pure domain transition. Review abstains on the whole extraction; rejected hidden fields are not scored as correct.',
    limits: { hardEvaluationBudgetUsd: 3, inputTokenCap: 8000, outputTokenCap: 2000 },
    summary,
    workflow: { ...state.workflow, caseId: undefined, oldProposalId: undefined },
    results: state.results,
  };
  await writeFile(reportPath, JSON.stringify(output, null, 2) + '\n');
  return summary;
}
try {
  for (let i = 0; i < 3; i++) {
    const existing = state.sessions[i];
    const api = await request.newContext({
      baseURL,
      extraHTTPHeaders: { Origin: baseURL },
      ...(existing ? { storageState: existing.storageState } : {}),
    });
    contexts.push(api);
    if (!existing) {
      const workspace = await json<WorkspaceResponse>(api, 'post', '/api/session');
      state.sessions.push({
        workspaceId: workspace.workspace.id,
        storageState: await api.storageState(),
      });
      await save();
    }
    const found = await query('SELECT id FROM workspaces WHERE id=$1', [
      state.sessions[i].workspaceId,
    ]);
    if (found.rowCount !== 1)
      throw new Error('API workspace is not in the connected accounting database.');
  }
  for (const [index, entry] of manifest.documents.entries()) {
    if (state.results.some((r) => r.id === entry.id)) continue;
    const workspaceIndex = index < 12 ? Math.floor(index / 4) : Math.floor((index - 12) / 4);
    const workspaceId = state.sessions[workspaceIndex].workspaceId;
    await guard(entry.apiWorkflow ? 2 : 1);
    const before = new Set((await usage(workspaceId)).map((u) => u.id));
    state.inFlight = entry.id;
    await save();
    const startedAt = Date.now();
    let fields: ValidatedExtraction | undefined;
    let outcome: Result['outcome'] = 'accepted';
    let errorMessage: string | undefined;
    const text = await readFile(path.join(directory, entry.textFile), 'utf8');
    try {
      fields = entry.apiWorkflow
        ? await apiExtract(entry, contexts[workspaceIndex])
        : await provider.extract({
            workspaceId,
            attemptKey: `evaluation-v1:${state.runId}:${entry.id}`,
            kind: entry.kind,
            text,
          });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected evaluation failure.';
      outcome =
        error instanceof Error &&
        (error.name === 'ExtractionReviewError' || message.startsWith('Document review:'))
          ? 'review'
          : 'infrastructure_error';
      errorMessage = message.slice(0, 500);
      if (entry.apiWorkflow) state.workflow.error = errorMessage;
    }
    const scored = score(entry, fields);
    const binding =
      fields && entry.expectedOutcome === 'case_review'
        ? caseBinding(entry, fields, text)
        : undefined;
    if (binding?.code === 'EVIDENCE_MISMATCH' && binding.ledgerUnchanged) outcome = 'case_review';
    const passed =
      entry.expectedOutcome === 'accept'
        ? outcome === 'accepted' && !scored.wrongFields.length
        : entry.expectedOutcome === 'review'
          ? outcome === 'review'
          : entry.expectedOutcome === 'case_review'
            ? outcome === 'case_review'
            : outcome === 'review' || (outcome === 'accepted' && !scored.wrongFields.length);
    const { evidence: _evidence, ...acceptedFields } = fields || { evidence: undefined };
    state.results.push({
      id: entry.id,
      expectedOutcome: entry.expectedOutcome,
      route: entry.apiWorkflow ? 'public_api_and_worker' : 'provider_and_validator',
      outcome,
      passed,
      error: errorMessage,
      fields: fields ? (acceptedFields as Fields) : undefined,
      ...scored,
      wallMs: Date.now() - startedAt,
      usage: (await usage(workspaceId)).filter((u) => !before.has(u.id)),
      evidenceCount: fields?.evidence.length,
      caseBinding: binding,
    });
    delete state.inFlight;
    await save();
    await report();
    console.log(
      JSON.stringify({ document: entry.id, outcome, passed, completed: state.results.length }),
    );
  }
  state.finishedAt = new Date().toISOString();
  await save();
  console.log(JSON.stringify({ complete: true, summary: await report() }));
} finally {
  for (const context of contexts) await context.dispose();
  await closePool();
}
