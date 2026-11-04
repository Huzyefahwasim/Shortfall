import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { query, transaction, migrate, closePool } from '../lib/db';
import {
  executeCommand,
  finishExtraction,
  failExtraction,
  failCommand,
  getCaseForWorker,
} from '../lib/service';
import { BudgetLedger, BudgetLimitError } from '../lib/budget';
import { EXTRACTION_MODEL, extractionCacheKey, validateExtraction } from '../lib/extraction';
import { ExtractionProvider } from './provider';
import type { ValidatedExtraction } from '../lib/extraction';

interface Job {
  id: string;
  workspace_id: string;
  case_id: string;
  kind: 'execute_command' | 'extract_document';
  payload: { commandId?: string; documentId?: string; sourceRevision?: number };
  attempts: number;
  max_attempts: number;
}

const LEASE_SECONDS = 120;
const workerId = `worker-${randomUUID()}`;

async function claimJob(): Promise<Job | null> {
  return transaction(async (client) => {
    // Serialize admission only; provider calls and execution run outside this transaction.
    await client.query('SELECT pg_advisory_xact_lock(726814)');
    const active = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM jobs WHERE status='running' AND locked_until > now()",
    );
    if (Number(active.rows[0].count) >= 2) return null;
    const selected = await client.query<Job>(`
      SELECT j.* FROM jobs j
      WHERE ((j.status='queued' AND j.available_at <= now()) OR (j.status='running' AND j.locked_until < now()))
        AND j.attempts < LEAST(j.max_attempts,2)
        AND (SELECT COUNT(*) FROM jobs a WHERE a.workspace_id=j.workspace_id AND a.status='running' AND a.locked_until > now()) < 2
      ORDER BY j.created_at FOR UPDATE OF j SKIP LOCKED LIMIT 1`);
    if (!selected.rows[0]) return null;
    const claimed = await client.query<Job>(
      `
      UPDATE jobs SET status='running',attempts=attempts+1,locked_by=$2,
        locked_until=now()+($3 * interval '1 second'),updated_at=now()
      WHERE id=$1 RETURNING *`,
      [selected.rows[0].id, workerId, LEASE_SECONDS],
    );
    return claimed.rows[0];
  });
}

async function heartbeat(provider: ExtractionProvider): Promise<void> {
  await query(
    `INSERT INTO worker_heartbeats(id,last_seen,model,inference_enabled) VALUES($1,now(),$2,$3)
    ON CONFLICT(id) DO UPDATE SET last_seen=now(),model=$2,inference_enabled=$3`,
    [workerId, EXTRACTION_MODEL, provider.enabled],
  );
}

async function recoverExhausted(): Promise<void> {
  const result =
    await query<Job>(`UPDATE jobs SET status='failed',last_error='Worker lease expired after the final attempt.',
    locked_by=NULL,locked_until=NULL,updated_at=now()
    WHERE status='running' AND locked_until < now() AND attempts >= LEAST(max_attempts,2) RETURNING *`);
  for (const job of result.rows) {
    if (job.kind === 'extract_document' && job.payload.documentId) {
      await failExtraction(
        job.workspace_id,
        job.case_id,
        job.payload.documentId,
        'Extraction stopped after its final attempt. Review the document.',
      );
    } else if (job.kind === 'execute_command' && job.payload.commandId) {
      await failCommand(
        job.workspace_id,
        job.case_id,
        job.payload.commandId,
        'Execution stopped after its final attempt. Review the case.',
      );
    }
  }
}

async function performJob(job: Job, provider: ExtractionProvider): Promise<void> {
  if (job.kind === 'execute_command') {
    if (!job.payload.commandId) throw new Error('The execution job is missing its command.');
    await executeCommand(job.workspace_id, job.case_id, job.payload.commandId);
    return;
  }
  if (!job.payload.documentId) throw new Error('The extraction job is missing its document.');
  const record = await getCaseForWorker(job.workspace_id, job.case_id);
  const document = record.documents.find((item) => item.id === job.payload.documentId);
  if (!document) throw new Error('The extraction document is no longer available.');
  if (document.status === 'verified') return;
  const key = extractionCacheKey(document.hash, document.kind);
  const cached = await query<{ result: ValidatedExtraction }>(
    'SELECT result FROM extraction_cache WHERE workspace_id=$1 AND cache_key=$2',
    [job.workspace_id, key],
  );
  let result: ValidatedExtraction;
  if (cached.rows[0]) {
    const withoutOffsets = {
      ...cached.rows[0].result,
      evidence: cached.rows[0].result.evidence.map(({ field, value, quote }) => ({
        field,
        value,
        quote,
      })),
    };
    result = validateExtraction(withoutOffsets, document.text, document.kind);
  } else {
    result = await provider.extract({
      workspaceId: job.workspace_id,
      attemptKey: `${job.workspace_id}:${job.id}:${job.attempts}`,
      kind: document.kind,
      text: document.text,
    });
    await query(
      `INSERT INTO extraction_cache(workspace_id,cache_key,result) VALUES($1,$2,$3::jsonb)
      ON CONFLICT(workspace_id,cache_key) DO NOTHING`,
      [job.workspace_id, key, JSON.stringify(result)],
    );
  }
  await finishExtraction(
    job.workspace_id,
    job.case_id,
    document.id,
    job.payload.sourceRevision ?? record.sourceRevision,
    result,
  );
}

async function processJob(job: Job, provider: ExtractionProvider): Promise<void> {
  const renewal = setInterval(() => {
    void query(
      `UPDATE jobs SET locked_until=now()+($3 * interval '1 second'),updated_at=now()
      WHERE id=$1 AND locked_by=$2 AND status='running'`,
      [job.id, workerId, LEASE_SECONDS],
    ).catch(() => {});
  }, 15_000);
  try {
    await performJob(job, provider);
    await query(
      "UPDATE jobs SET status='completed',locked_by=NULL,locked_until=NULL,last_error=NULL,updated_at=now() WHERE id=$1 AND locked_by=$2 AND status='running'",
      [job.id, workerId],
    );
  } catch (error) {
    const final =
      job.attempts >= Math.min(job.max_attempts, 2) || error instanceof BudgetLimitError;
    const message =
      error instanceof Error &&
      ['ExtractionReviewError', 'ProviderUnavailableError', 'BudgetLimitError'].includes(error.name)
        ? error.message
        : 'The workflow step could not complete. Review the case or retry after service recovery.';
    const updated = await query(
      `UPDATE jobs SET status=$3,last_error=$4,locked_by=NULL,locked_until=NULL,
      available_at=now()+interval '3 seconds',updated_at=now() WHERE id=$1 AND locked_by=$2 AND status='running'`,
      [job.id, workerId, final ? 'failed' : 'queued', message],
    );
    if (updated.rowCount && final && job.kind === 'extract_document' && job.payload.documentId) {
      await failExtraction(job.workspace_id, job.case_id, job.payload.documentId, message);
    } else if (
      updated.rowCount &&
      final &&
      job.kind === 'execute_command' &&
      job.payload.commandId
    ) {
      await failCommand(job.workspace_id, job.case_id, job.payload.commandId, message);
    }
    console.warn(`Worker step ${final ? 'requires review' : 'scheduled for retry'}.`);
  } finally {
    clearInterval(renewal);
  }
}

export async function runWorker(): Promise<void> {
  await migrate();
  const provider = new ExtractionProvider(new BudgetLedger(transaction));
  let stopping = false;
  process.once('SIGTERM', () => {
    stopping = true;
  });
  process.once('SIGINT', () => {
    stopping = true;
  });
  await heartbeat(provider);
  const timer = setInterval(() => {
    void heartbeat(provider).catch(() => {});
  }, 10_000);
  console.info(
    `Worker ready (${workerId}; pid ${process.pid}). Model extraction ${provider.enabled ? 'enabled' : 'disabled'}; ${EXTRACTION_MODEL}; adaptive thinking; low effort.`,
  );
  try {
    while (!stopping) {
      try {
        await recoverExhausted();
        const job = await claimJob();
        if (job) await processJob(job, provider);
        else await sleep(800);
      } catch {
        console.warn('Worker database operation failed; retrying after a short pause.');
        await sleep(2_000);
      }
    }
  } finally {
    clearInterval(timer);
    await query('DELETE FROM worker_heartbeats WHERE id=$1', [workerId]).catch(() => {});
    await closePool();
  }
}
