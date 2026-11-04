import { randomBytes, randomUUID, createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, transaction } from './db';
import * as domain from './domain';
import type {
  CaseRecord,
  DocumentKind,
  Evidence,
  ExtractionFields,
  NewCaseInput,
  WorkspaceResponse,
} from './types';

const key = (s: string) => s.trim().toLowerCase();
export const sessionHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function sessionWorkspace(token: string | undefined): Promise<string | null> {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const result = await query<{ workspace_id: string }>(
    'SELECT s.workspace_id FROM sessions s JOIN workspaces w ON w.id=s.workspace_id WHERE token_hash=$1 AND s.expires_at>now() AND w.expires_at>now()',
    [sessionHash(token)],
  );
  return result.rows[0]?.workspace_id ?? null;
}
async function insertCase(client: PoolClient, workspaceId: string, c: CaseRecord): Promise<void> {
  await client.query(
    'INSERT INTO cases(id,workspace_id,supplier_key,po_key,data) VALUES($1,$2,$3,$4,$5)',
    [c.id, workspaceId, key(c.supplier), key(c.poNumber), JSON.stringify(c)],
  );
}
export async function establishSession(
  existingToken?: string,
  sourceHash?: string,
): Promise<{ workspaceId: string; token: string; created: boolean }> {
  const existing = await sessionWorkspace(existingToken);
  if (existing && existingToken)
    return { workspaceId: existing, token: existingToken, created: false };
  const workspaceId = randomUUID();
  const token = randomBytes(32).toString('hex');
  await transaction(async (client) => {
    await client.query('SELECT pg_advisory_xact_lock(805105)');
    const count = await client.query<{ recent: string; active: string; same_source: string }>(
      `SELECT
      count(*) FILTER (WHERE created_at>now()-interval '1 hour')::text AS recent,
      count(*) FILTER (WHERE expires_at>now())::text AS active,
      count(*) FILTER (WHERE creation_source_hash=$1 AND created_at>now()-interval '1 hour')::text AS same_source
      FROM workspaces WHERE created_at>now()-interval '1 hour' OR expires_at>now()`,
      [sourceHash ?? null],
    );
    if (
      Number(count.rows[0].recent) >= 40 ||
      Number(count.rows[0].active) >= 500 ||
      (sourceHash && Number(count.rows[0].same_source) >= 20)
    )
      throw new domain.DomainError(
        'New demo workspace capacity reached. Continue in your existing session or try again later.',
        'RATE_LIMITED',
        429,
      );
    await client.query('INSERT INTO workspaces(id,name,creation_source_hash) VALUES($1,$2,$3)', [
      workspaceId,
      'Sample operations',
      sourceHash ?? null,
    ]);
    await client.query('INSERT INTO sessions(token_hash,workspace_id) VALUES($1,$2)', [
      sessionHash(token),
      workspaceId,
    ]);
    for (const c of domain.seedCases()) await insertCase(client, workspaceId, c);
  });
  return { workspaceId, token, created: true };
}
export async function getWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
  const [cases, heartbeat] = await Promise.all([
    query<{ data: CaseRecord }>(
      'SELECT data FROM cases WHERE workspace_id=$1 ORDER BY created_at,id',
      [workspaceId],
    ),
    query<{ online: boolean; model: string; inference_enabled: boolean }>(
      "SELECT last_seen>now()-interval '30 seconds' AS online, model,inference_enabled FROM worker_heartbeats ORDER BY last_seen DESC LIMIT 1",
    ),
  ]);
  return {
    cases: cases.rows.map((r) => r.data),
    workspace: { id: workspaceId, name: 'Sample operations', synthetic: true },
    service: {
      workerOnline: heartbeat.rows[0]?.online ?? false,
      model: heartbeat.rows[0]?.model ?? 'claude-opus-5-5',
      inferenceEnabled: heartbeat.rows[0]?.inference_enabled ?? false,
    },
  };
}
export async function getCaseForWorker(workspaceId: string, caseId: string): Promise<CaseRecord> {
  const result = await query<{ data: CaseRecord }>(
    'SELECT c.data FROM cases c JOIN workspaces w ON w.id=c.workspace_id WHERE c.workspace_id=$1 AND c.id=$2 AND w.expires_at>now()',
    [workspaceId, caseId],
  );
  if (!result.rows[0]) throw new domain.DomainError('Case not found.', 'NOT_FOUND', 404);
  return result.rows[0].data;
}
export const getCase = getCaseForWorker;
async function lockedCase(
  client: PoolClient,
  workspaceId: string,
  caseId: string,
): Promise<CaseRecord> {
  const result = await client.query<{ data: CaseRecord }>(
    'SELECT c.data FROM cases c JOIN workspaces w ON w.id=c.workspace_id WHERE c.workspace_id=$1 AND c.id=$2 AND w.expires_at>now() FOR UPDATE OF c',
    [workspaceId, caseId],
  );
  if (!result.rows[0]) throw new domain.DomainError('Case not found.', 'NOT_FOUND', 404);
  return result.rows[0].data;
}
async function lockWorkspace(client: PoolClient, workspaceId: string): Promise<void> {
  const result = await client.query(
    'SELECT id FROM workspaces WHERE id=$1 AND expires_at>now() FOR UPDATE',
    [workspaceId],
  );
  if (!result.rowCount)
    throw new domain.DomainError(
      'This workspace is no longer available. Start a new demo session.',
      'SESSION_REQUIRED',
      401,
    );
}
async function saveCase(client: PoolClient, workspaceId: string, c: CaseRecord): Promise<void> {
  c.updatedAt = new Date().toISOString();
  await client.query('UPDATE cases SET data=$3,updated_at=now() WHERE workspace_id=$1 AND id=$2', [
    workspaceId,
    c.id,
    JSON.stringify(c),
  ]);
  const cancelled = c.executions.filter((e) => e.status === 'cancelled').map((e) => e.id);
  if (cancelled.length) {
    await client.query(
      "UPDATE commands SET status='cancelled',updated_at=now() WHERE workspace_id=$1 AND case_id=$2 AND id=ANY($3::uuid[]) AND status<>'applied'",
      [workspaceId, c.id, cancelled],
    );
    await client.query(
      "UPDATE jobs SET status='cancelled',updated_at=now() WHERE workspace_id=$1 AND case_id=$2 AND kind='execute_command' AND payload->>'commandId'=ANY($3::text[]) AND status IN ('queued','running')",
      [workspaceId, c.id, cancelled],
    );
  }
}
async function queueJob(
  client: PoolClient,
  workspaceId: string,
  caseId: string,
  kind: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    'INSERT INTO jobs(id,workspace_id,case_id,kind,payload) VALUES($1,$2,$3,$4,$5)',
    [randomUUID(), workspaceId, caseId, kind, JSON.stringify(payload)],
  );
}
export async function newCase(workspaceId: string, input: NewCaseInput): Promise<CaseRecord> {
  const c = domain.createCase(input);
  await transaction(async (client) => {
    await lockWorkspace(client, workspaceId);
    const count = await client.query<{ count: string }>(
      'SELECT count(*) FROM cases WHERE workspace_id=$1',
      [workspaceId],
    );
    if (Number(count.rows[0].count) >= 10)
      throw new domain.DomainError(
        'This demo workspace is limited to ten cases.',
        'QUOTA_EXCEEDED',
        429,
      );
    const existing = await client.query(
      'SELECT id FROM cases WHERE workspace_id=$1 AND supplier_key=$2 AND po_key=$3',
      [workspaceId, key(c.supplier), key(c.poNumber)],
    );
    if (existing.rowCount)
      throw new domain.DomainError(
        'This supplier and purchase order already have a case. Split invoices require manual review.',
        'DUPLICATE_ORDER',
        409,
      );
    await insertCase(client, workspaceId, c);
  });
  return c;
}
export async function resetWorkspace(workspaceId: string): Promise<WorkspaceResponse> {
  await transaction(async (client) => {
    await lockWorkspace(client, workspaceId);
    // Lock in a stable order so concurrent commands finish or observe cancellation first.
    await client.query('SELECT id FROM cases WHERE workspace_id=$1 ORDER BY id FOR UPDATE', [
      workspaceId,
    ]);
    await client.query('DELETE FROM cases WHERE workspace_id=$1', [workspaceId]);
    for (const c of domain.seedCases()) await insertCase(client, workspaceId, c);
    // Budget reservations deliberately survive resets.
  });
  return getWorkspace(workspaceId);
}
export async function caseAction(
  workspaceId: string,
  caseId: string,
  action: string,
  input: Record<string, unknown> = {},
): Promise<CaseRecord> {
  return transaction(async (client) => {
    // Workspace-before-case also prevents a reset/approval deadlock: inserting a
    // command acquires a key-share lock on its workspace foreign key.
    await lockWorkspace(client, workspaceId);
    const c = await lockedCase(client, workspaceId, caseId);
    if (c.history.length >= domain.MAX_CASE_HISTORY)
      throw new domain.DomainError(
        'This case reached its demo activity limit. Reset the workspace to continue.',
        'QUOTA_EXCEEDED',
        429,
      );
    if (action === 'receive')
      domain.receive(
        c,
        domain.integer(input.quantity, 'Receipt quantity', 0, domain.MAX_UNITS),
        domain.label(input.reference, 'Receipt reference'),
        input.expectedRevision === undefined
          ? undefined
          : domain.integer(input.expectedRevision, 'Revision', 1),
      );
    else if (action === 'credit')
      domain.addCredit(
        c,
        domain.integer(input.amountCents, 'Credit amount', 1),
        domain.label(input.reference, 'Credit reference'),
      );
    else if (action === 'propose') domain.propose(c);
    else if (action === 'assign') {
      c.owner = domain.label(input.owner, 'Task owner', 80);
      c.reviewer = domain.label(input.reviewer, 'Reviewer', 80);
      for (const task of c.tasks) if (task.status === 'open') task.owner = c.owner;
      domain.audit(
        c,
        'assignment_changed',
        'Case assignment updated',
        `Owner: ${c.owner}. Reviewer: ${c.reviewer}.`,
      );
    } else if (action === 'retry_document') {
      const documentId = domain.label(input.documentId, 'Document');
      const document = domain.currentDocuments(c).find((d) => d.id === documentId);
      if (!document)
        throw new domain.DomainError(
          'This document is missing or has been replaced by a newer version.',
          'STALE_DOCUMENT',
          409,
        );
      if (document.status !== 'needs_review')
        throw new domain.DomainError(
          'Only a document awaiting review can be retried.',
          'CONFLICT',
          409,
        );
      const active = await client.query<{ count: string }>(
        "SELECT count(*) FROM jobs WHERE workspace_id=$1 AND kind='extract_document' AND status IN ('queued','running')",
        [workspaceId],
      );
      if (Number(active.rows[0].count) >= 2)
        throw new domain.DomainError(
          'Two document jobs are already active. Wait for them to finish.',
          'RATE_LIMITED',
          429,
        );
      document.status = 'pending';
      delete document.extractionError;
      domain.invalidate(c, 'Document extraction was retried.');
      domain.audit(
        c,
        'extraction_retried',
        'Document queued again',
        `${document.reference}: retry uses the same source and the remaining workspace allowance.`,
      );
      await queueJob(client, workspaceId, caseId, 'extract_document', {
        documentId,
        sourceRevision: c.sourceRevision,
      });
    } else if (action === 'approve') {
      const proposalId = domain.label(input.proposalId, 'Proposal');
      const commandId = domain.approve(c, proposalId);
      const inserted = await client.query(
        "INSERT INTO commands(id,workspace_id,case_id,proposal_id,status) VALUES($1,$2,$3,$4,'queued') ON CONFLICT(workspace_id,case_id,proposal_id) DO NOTHING RETURNING id",
        [commandId, workspaceId, caseId, proposalId],
      );
      if (inserted.rowCount)
        await queueJob(client, workspaceId, caseId, 'execute_command', { commandId });
    } else if (action === 'retry') {
      const commandId = domain.label(input.commandId, 'Command');
      const execution = c.executions.find((e) => e.id === commandId);
      if (!execution) throw new domain.DomainError('Command not found.', 'NOT_FOUND', 404);
      if (execution.status === 'applied' || execution.status === 'queued') return c;
      if (execution.status === 'cancelled')
        throw new domain.DomainError(
          'Evidence changed. Generate a new proposal.',
          'STALE_PROPOSAL',
          409,
        );
      const proposal = c.proposals.find((p) => p.id === execution.proposalId);
      if (
        !proposal ||
        proposal.sourceRevision !== c.sourceRevision ||
        proposal.ledgerRevision !== c.ledgerRevision
      )
        throw new domain.DomainError(
          'Evidence changed. Generate a new proposal.',
          'STALE_PROPOSAL',
          409,
        );
      execution.status = 'queued';
      delete execution.error;
      c.status = 'queued';
      await client.query(
        "UPDATE commands SET status='queued',updated_at=now() WHERE workspace_id=$1 AND case_id=$2 AND id=$3",
        [workspaceId, caseId, commandId],
      );
      await queueJob(client, workspaceId, caseId, 'execute_command', { commandId });
      domain.audit(
        c,
        'command_retried',
        'Execution queued again',
        'The worker will reuse the command identity and verify the current approval.',
      );
    } else throw new domain.DomainError('Unknown case action.');
    await saveCase(client, workspaceId, c);
    return c;
  });
}
export async function executeCommand(
  workspaceId: string,
  caseId: string,
  commandId: string,
): Promise<CaseRecord> {
  return transaction(async (client) => {
    const c = await lockedCase(client, workspaceId, caseId);
    domain.execute(c, commandId);
    const receipt = c.executions.find((e) => e.id === commandId)!;
    await client.query(
      "UPDATE commands SET status='applied',receipt=$4,updated_at=now() WHERE workspace_id=$1 AND case_id=$2 AND id=$3",
      [workspaceId, caseId, commandId, JSON.stringify(receipt)],
    );
    await saveCase(client, workspaceId, c);
    return c;
  });
}
export async function failCommand(
  workspaceId: string,
  caseId: string,
  commandId: string,
  message: string,
): Promise<void> {
  await transaction(async (client) => {
    const c = await lockedCase(client, workspaceId, caseId);
    const execution = c.executions.find((e) => e.id === commandId);
    if (!execution || execution.status === 'applied' || execution.status === 'cancelled') return;
    execution.status = 'failed';
    execution.error = message.slice(0, 300);
    c.status = 'needs_review';
    domain.audit(
      c,
      'execution_failed',
      'Execution needs attention',
      execution.error,
      'Workflow worker',
    );
    await client.query(
      "UPDATE commands SET status='failed',updated_at=now() WHERE workspace_id=$1 AND case_id=$2 AND id=$3",
      [workspaceId, caseId, commandId],
    );
    await saveCase(client, workspaceId, c);
  });
}
export async function addDocument(
  workspaceId: string,
  caseId: string,
  kind: DocumentKind,
  reference: string,
  text: string,
  hash: string,
): Promise<CaseRecord> {
  if (!['purchase_order', 'invoice', 'receipt', 'credit'].includes(kind))
    throw new domain.DomainError('Unsupported document kind.');
  if (!text.trim() || text.includes('\0') || Buffer.byteLength(text, 'utf8') > 20_000)
    throw new domain.DomainError('Use a nonempty document with at most 20 KB of extracted text.');
  reference = domain.label(reference, 'Document reference');
  return transaction(async (client) => {
    await lockWorkspace(client, workspaceId);
    const c = await lockedCase(client, workspaceId, caseId);
    if (c.documents.some((d) => d.hash === hash && d.kind === kind)) return c;
    if (c.documents.length >= domain.MAX_DOCUMENTS || c.history.length >= domain.MAX_CASE_HISTORY)
      throw new domain.DomainError(
        'This demo case reached its document or activity limit.',
        'QUOTA_EXCEEDED',
        429,
      );
    const active = await client.query<{ count: string }>(
      "SELECT count(*) FROM jobs WHERE workspace_id=$1 AND kind='extract_document' AND status IN ('queued','running')",
      [workspaceId],
    );
    if (Number(active.rows[0].count) >= 2)
      throw new domain.DomainError(
        'Two document jobs are already active. Wait for them to finish.',
        'RATE_LIMITED',
        429,
      );
    const documentId = randomUUID();
    c.documents.push({
      id: documentId,
      kind,
      reference: domain.label(reference, 'Document reference'),
      text,
      hash,
      createdAt: new Date().toISOString(),
      status: 'pending',
      evidence: [],
    });
    domain.invalidate(c, 'A source document was uploaded.');
    domain.audit(
      c,
      'document_uploaded',
      'Document queued for extraction',
      `${reference}: ${kind.replaceAll('_', ' ')}.`,
      'Demo reviewer',
    );
    await queueJob(client, workspaceId, caseId, 'extract_document', {
      documentId,
      sourceRevision: c.sourceRevision,
    });
    await saveCase(client, workspaceId, c);
    return c;
  });
}
export async function finishExtraction(
  workspaceId: string,
  caseId: string,
  documentId: string,
  expectedRevision: number,
  result: Omit<ExtractionFields, 'evidence'> & { evidence: Evidence[] },
  model = 'claude-opus-5-5',
): Promise<CaseRecord> {
  return transaction(async (client) => {
    const c = await lockedCase(client, workspaceId, caseId);
    const document = c.documents.find((d) => d.id === documentId);
    if (!document) throw new domain.DomainError('Document not found.', 'NOT_FOUND', 404);
    if (document.status === 'verified' && document.model) return c;
    // Extraction reads one immutable document, not a case snapshot. Revalidate its
    // identity against the locked current case before rebasing unrelated revisions.
    if (expectedRevision > c.sourceRevision)
      throw new domain.DomainError('Invalid extraction revision.', 'STALE_DOCUMENT', 409);
    domain.applyExtraction(c, documentId, result);
    document.model = model;
    await saveCase(client, workspaceId, c);
    return c;
  });
}
export async function failExtraction(
  workspaceId: string,
  caseId: string,
  documentId: string,
  message: string,
): Promise<void> {
  await transaction(async (client) => {
    const c = await lockedCase(client, workspaceId, caseId);
    const d = c.documents.find((x) => x.id === documentId);
    if (!d || d.status === 'verified') return;
    d.status = 'needs_review';
    d.extractionError = message.slice(0, 350);
    if (domain.currentDocuments(c).some((latest) => latest.id === documentId)) {
      c.status = 'needs_review';
      domain.audit(
        c,
        'extraction_failed',
        'Document needs review',
        d.extractionError,
        'Document extraction',
      );
    }
    await saveCase(client, workspaceId, c);
  });
}
