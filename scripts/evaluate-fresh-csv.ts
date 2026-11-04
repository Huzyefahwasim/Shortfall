import { createHash, randomUUID } from 'node:crypto';
import { access, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { request } from '@playwright/test';
import { BudgetLedger } from '../src/lib/budget';
import { closePool, query, transaction } from '../src/lib/db';
import { PROMPT_VERSION } from '../src/lib/extraction';
import type { DocumentKind } from '../src/lib/types';
import { ExtractionProvider } from '../src/worker/provider';

const directory = 'fixtures/evaluation-csv-fresh-v1';
const outputFile = 'docs/evaluation-fresh-csv.json';
const manifestFile = path.join(directory, 'manifest.json');
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
async function absent(file: string) {
  try {
    await access(file);
    throw new Error(`Existing artifact will not be overwritten: ${file}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
}
if (process.argv.includes('--freeze')) {
  await absent(manifestFile);
  const expected = JSON.parse(await readFile(path.join(directory, 'expected.json'), 'utf8'));
  const sourceHashes: Record<string, string> = {};
  for (const file of ['src/lib/extraction.ts', 'src/lib/budget.ts', 'src/worker/provider.ts'])
    sourceHashes[file] = hash(await readFile(file));
  for (const entry of expected.documents) {
    const raw = await readFile(path.join(directory, entry.file));
    entry.rawSha256 = hash(raw);
    entry.textSha256 = hash(raw.toString('utf8').replaceAll('\r\n', '\n').trim());
  }
  const serialized =
    JSON.stringify({ frozenAt: new Date().toISOString(), sourceHashes, ...expected }, null, 2) +
    '\n';
  await writeFile(manifestFile, serialized);
  await writeFile(path.join(directory, 'manifest.sha256'), hash(serialized) + '\n');
  console.log(
    JSON.stringify({
      frozenDocuments: expected.documents.length,
      manifestSha256: hash(serialized),
    }),
  );
} else {
  if (!process.argv.includes('--live')) throw new Error('Choose --freeze or explicit --live.');
  await absent(outputFile);
  const manifestText = await readFile(manifestFile, 'utf8');
  const manifest = JSON.parse(manifestText);
  if (
    hash(manifestText) !== (await readFile(path.join(directory, 'manifest.sha256'), 'utf8')).trim()
  )
    throw new Error('Fresh corpus manifest changed.');
  for (const [file, sha] of Object.entries(manifest.sourceHashes))
    if (hash(await readFile(file)) !== sha) throw new Error(`Frozen source changed: ${file}`);
  for (const entry of manifest.documents)
    if (hash(await readFile(path.join(directory, entry.file))) !== entry.rawSha256)
      throw new Error(`Frozen document changed: ${entry.id}`);
  const previous = JSON.parse(await readFile('.deploy/evaluation-v1-private.json', 'utf8'));
  const baseURL = process.env.EVALUATION_URL || 'https://shortfall.95.179.254.189.sslip.io';
  const api = await request.newContext({ baseURL, extraHTTPHeaders: { Origin: baseURL } });
  const provider = new ExtractionProvider(new BudgetLedger(transaction));
  const run = {
    runId: randomUUID(),
    startedAt: new Date().toISOString(),
    finishedAt: null as string | null,
    status: 'in_progress',
    model: 'claude-opus-5-5',
    promptVersion: PROMPT_VERSION,
    designation: manifest.designation,
    manifestSha256: hash(manifestText),
    sourceHashes: manifest.sourceHashes,
    results: [] as Record<string, unknown>[],
  };
  const save = () => writeFile(outputFile, JSON.stringify(run, null, 2) + '\n');
  try {
    const response = await api.post('/api/session');
    if (!response.ok()) throw new Error(`Ordinary session creation returned ${response.status()}.`);
    const workspaceId = (await response.json()).workspace.id as string;
    if ((await query('SELECT id FROM workspaces WHERE id=$1', [workspaceId])).rowCount !== 1)
      throw new Error('The API workspace is not in the real accounting database.');
    await writeFile(
      '.deploy/evaluation-fresh-csv-private.json',
      JSON.stringify(
        { workspaceId, storageState: await api.storageState(), runId: run.runId },
        null,
        2,
      ),
    );
    await save();
    const workspaceIds = [
      ...previous.sessions.map((s: { workspaceId: string }) => s.workspaceId),
      workspaceId,
    ];
    for (const entry of manifest.documents) {
      const totals = await query(
        `SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_microusd
        WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END),0)::text AS consumed
        FROM inference_reservations WHERE workspace_id=ANY($1::uuid[])`,
        [workspaceIds],
      );
      if (Number(totals.rows[0].consumed) + 90_000 > 3_000_000)
        throw new Error('Combined evaluation would exceed $3.');
      const text = (await readFile(path.join(directory, entry.file), 'utf8'))
        .replaceAll('\r\n', '\n')
        .trim();
      if (hash(text) !== entry.textSha256) throw new Error('Normalized frozen text changed.');
      const attemptKey = `evaluation-fresh-csv:${run.runId}:${entry.id}`;
      const startedAt = Date.now();
      let fields: Record<string, unknown> | undefined;
      let error: string | undefined;
      let outcome = 'accepted';
      try {
        fields = (await provider.extract({
          workspaceId,
          attemptKey,
          kind: entry.kind as DocumentKind,
          text,
        })) as unknown as Record<string, unknown>;
      } catch (failure) {
        error = failure instanceof Error ? failure.message : 'Unexpected failure.';
        outcome =
          failure instanceof Error && failure.name === 'ExtractionReviewError'
            ? 'review'
            : 'infrastructure_error';
      }
      const names = Object.keys(entry.expectedFields);
      const wrongFields = fields
        ? names.filter((field) => fields![field] !== entry.expectedFields[field])
        : [];
      const usage = (
        await query(
          `SELECT status,amount_microusd::text,actual_microusd::text,
        input_tokens,output_tokens,model,latency_ms FROM inference_reservations WHERE attempt_key=$1`,
          [attemptKey],
        )
      ).rows;
      const result = {
        id: entry.id,
        expectedOutcome: entry.expectedOutcome,
        outcome,
        passed:
          entry.expectedOutcome === 'review'
            ? outcome === 'review'
            : Boolean(fields) && wrongFields.length === 0,
        error,
        wrongFields,
        fields,
        criticalFields: {
          total: names.length,
          correct: fields ? names.length - wrongFields.length : 0,
          wrong: wrongFields.length,
          abstained: fields ? 0 : names.length,
        },
        wallMs: Date.now() - startedAt,
        usage,
      };
      run.results.push(result);
      await save();
      console.log(JSON.stringify({ document: entry.id, outcome, passed: result.passed }));
    }
    run.status = 'complete';
    run.finishedAt = new Date().toISOString();
    await save();
  } finally {
    await api.dispose();
    await closePool();
  }
}
