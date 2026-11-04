import { createHash, randomUUID } from 'node:crypto';
import { readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { BudgetLedger } from '../src/lib/budget';
import { closePool, query, transaction } from '../src/lib/db';
import { PROMPT_VERSION } from '../src/lib/extraction';
import type { DocumentKind } from '../src/lib/types';
import { ExtractionProvider } from '../src/worker/provider';

if (!process.argv.includes('--live'))
  throw new Error('Pass --live to run three paid regression calls.');
const outputFile = 'docs/evaluation-regression.json';
try {
  await access(outputFile);
  throw new Error('The regression run already exists; do not silently overwrite measured results.');
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}
const baseline = JSON.parse(await readFile('docs/evaluation-results.json', 'utf8'));
if (baseline.status !== 'complete') throw new Error('Complete the unchanged baseline first.');
const state = JSON.parse(await readFile('.deploy/evaluation-v1-private.json', 'utf8'));
const corpus = JSON.parse(await readFile('fixtures/evaluation-v1/manifest.json', 'utf8'));
const ids = ['supported-06-invoice', 'supported-08-credit', 'supported-11-receipt'];
const provider = new ExtractionProvider(new BudgetLedger(transaction));
const workspaceIds: string[] = state.sessions.map(
  (session: { workspaceId: string }) => session.workspaceId,
);
const sourceHashes: Record<string, string> = {};
for (const file of ['src/lib/extraction.ts', 'src/worker/provider.ts'])
  sourceHashes[file] = createHash('sha256')
    .update(await readFile(file))
    .digest('hex');
const run = {
  runId: randomUUID(),
  startedAt: new Date().toISOString(),
  finishedAt: null as string | null,
  status: 'in_progress',
  model: 'claude-opus-5-5',
  promptVersion: PROMPT_VERSION,
  designation:
    'Targeted regression rerun after inspecting baseline failures. This is not held-out accuracy.',
  baselineManifestSha256: baseline.dataset.sha256,
  sourceHashes,
  change:
    'Numeric CSV evidence now resolves complete source cells against numeric column headers. It preserves signs, fractional quantities, quoted thousands, and exact source offsets.',
  results: [] as Record<string, unknown>[],
};
const save = () => writeFile(outputFile, JSON.stringify(run, null, 2) + '\n');
await save();
try {
  for (const id of ids) {
    const entry = corpus.documents.find((document: { id: string }) => document.id === id);
    const totals = await query(
      `SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_microusd
      WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END),0)::text AS consumed
      FROM inference_reservations WHERE workspace_id=ANY($1::uuid[])`,
      [workspaceIds],
    );
    if (Number(totals.rows[0].consumed) + 90_000 > 3_000_000)
      throw new Error('The combined evaluation would exceed $3.');
    const text = await readFile(path.join('fixtures/evaluation-v1', entry.textFile), 'utf8');
    if (createHash('sha256').update(text).digest('hex') !== entry.textSha256)
      throw new Error('The frozen source document changed.');
    const workspaceId = workspaceIds[entry.family];
    const attemptKey = `evaluation-csv-regression:${run.runId}:${id}`;
    const startedAt = Date.now();
    let fields: Record<string, unknown> | undefined;
    let error: string | undefined;
    try {
      fields = (await provider.extract({
        workspaceId,
        attemptKey,
        kind: entry.kind as DocumentKind,
        text,
      })) as unknown as Record<string, unknown>;
    } catch (failure) {
      error = failure instanceof Error ? failure.message : 'Unexpected regression failure.';
    }
    const wrongFields = fields
      ? entry.criticalFields.filter(
          (field: string) => fields![field] !== entry.expectedFields[field],
        )
      : [];
    const usage = (
      await query(
        `SELECT status,amount_microusd::text,actual_microusd::text,
      input_tokens,output_tokens,model,latency_ms FROM inference_reservations WHERE attempt_key=$1`,
        [attemptKey],
      )
    ).rows;
    const result = {
      id,
      passed: Boolean(fields) && wrongFields.length === 0,
      outcome: fields ? 'accepted' : 'review_or_error',
      error,
      wrongFields,
      criticalFields: {
        total: entry.criticalFields.length,
        correct: fields ? entry.criticalFields.length - wrongFields.length : 0,
        wrong: wrongFields.length,
        abstained: fields ? 0 : entry.criticalFields.length,
      },
      fields,
      wallMs: Date.now() - startedAt,
      usage,
    };
    run.results.push(result);
    await save();
    console.log(JSON.stringify({ document: id, passed: result.passed, outcome: result.outcome }));
  }
  run.status = 'complete';
  run.finishedAt = new Date().toISOString();
  await save();
} finally {
  await closePool();
}
