import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { closePool, migrate, query, transaction } from '../src/lib/db';
import { BudgetLedger, BudgetLimitError, GLOBAL_LIMIT_MICROUSD, WORKSPACE_LIMIT_MICROUSD } from '../src/lib/budget';
import { addDocument, caseAction, establishSession, executeCommand, failExtraction, getCase, getWorkspace, newCase, resetWorkspace, sessionHash, sessionWorkspace } from '../src/lib/service';
import { DomainError } from '../src/lib/domain';

test('database transactions preserve ownership, idempotency and source/execution serialization', { skip: !process.env.DATABASE_URL }, async () => {
  // A separate schema keeps a live worker from claiming these test jobs or
  // making model requests. No application rows or spend records are modified.
  const originalUrl = process.env.DATABASE_URL!;
  const schema = `shortfall_test_${randomUUID().replaceAll('-', '')}`;
  await query(`CREATE SCHEMA "${schema}"`); await closePool();
  const isolatedUrl = new URL(originalUrl);
  isolatedUrl.searchParams.set('options', `-c search_path=${schema}`);
  process.env.DATABASE_URL = isolatedUrl.toString();
  try {
  await migrate(); const a = await establishSession(); const b = await establishSession();
  const rateSource = `test-${randomUUID()}`; const rateWorkspaces: string[] = [];
  const reservationId = randomUUID();
  try {
    const c = (await getWorkspace(a.workspaceId)).cases.find(c => c.invoiceNumber === 'INV-8821')!;
    await assert.rejects(() => getCase(b.workspaceId, c.id), e => e instanceof DomainError && e.status === 404);
    await assert.rejects(() => newCase(a.workspaceId, { supplier: c.supplier.toUpperCase(), poNumber: c.poNumber.toLowerCase(), invoiceNumber: 'SECOND', sku: c.sku, description: c.description, orderedUnits: 120, invoicedUnits: 120, receivedUnits: 100, unitPriceCents: 4000 }), e => e instanceof DomainError && e.code === 'DUPLICATE_ORDER');
    let updated = await caseAction(a.workspaceId, c.id, 'propose');
    const proposalId = updated.proposals.at(-1)!.id;
    const approvals = await Promise.all([caseAction(a.workspaceId, c.id, 'approve', { proposalId }), caseAction(a.workspaceId, c.id, 'approve', { proposalId })]);
    const commandId = approvals[0].executions.at(-1)!.id;
    assert.equal(approvals[1].executions.at(-1)!.id, commandId);
    await Promise.all([executeCommand(a.workspaceId, c.id, commandId), executeCommand(a.workspaceId, c.id, commandId)]);
    updated = await getCase(a.workspaceId, c.id); assert.equal(updated.ledgerRevision, 1); assert.equal(updated.tasks.length, 1);
    const commands = await query<{ count: string }>('SELECT count(*) FROM commands WHERE workspace_id=$1 AND case_id=$2', [a.workspaceId, c.id]);
    assert.equal(commands.rows[0].count, '1');

    await query("INSERT INTO inference_reservations(id,workspace_id,attempt_key,amount_microusd,status) VALUES($1,$2,$3,0,'reserved')", [reservationId, a.workspaceId, `test-reset-${reservationId}`]);
    await resetWorkspace(a.workspaceId);
    const preserved = await query('SELECT id FROM inference_reservations WHERE id=$1 AND workspace_id=$2', [reservationId, a.workspaceId]);
    assert.equal(preserved.rowCount, 1, 'reset must not clear inference accounting');
    const fresh = (await getWorkspace(a.workspaceId)).cases.find(c => c.invoiceNumber === 'INV-8821')!;
    updated = await caseAction(a.workspaceId, fresh.id, 'propose');
    updated = await caseAction(a.workspaceId, fresh.id, 'approve', { proposalId: updated.proposals.at(-1)!.id });
    const queued = updated.executions.at(-1)!.id;
    await Promise.allSettled([caseAction(a.workspaceId, fresh.id, 'receive', { quantity: 10, reference: 'RACE-10' }), executeCommand(a.workspaceId, fresh.id, queued)]);
    updated = await getCase(a.workspaceId, fresh.id);
    assert.equal(updated.receipts.reduce((s, r) => s + r.quantity, 0), 110);
    if (updated.heldCents === 80000) {
      const execution = updated.history.findIndex(h => h.type === 'command_applied');
      const receipt = updated.history.findIndex(h => h.type === 'receipt_updated');
      assert.ok(execution >= 0 && execution < receipt, 'an applied hold must precede the source update');
    } else { assert.equal(updated.heldCents, 0); assert.equal(updated.executions[0].status, 'cancelled'); }
    assert.equal((await getWorkspace(b.workspaceId)).cases.length, 3, 'reset cannot touch another workspace');

    updated = await addDocument(a.workspaceId, fresh.id, 'receipt', 'RETRY-RECEIPT', 'Synthetic receipt awaiting extraction.', 'retry-hash');
    const document = updated.documents.at(-1)!;
    await query("UPDATE jobs SET status='failed' WHERE workspace_id=$1 AND case_id=$2 AND kind='extract_document'", [a.workspaceId, fresh.id]);
    await failExtraction(a.workspaceId, fresh.id, document.id, 'Temporary provider error.');
    const revisionBeforeRetry = (await getCase(a.workspaceId, fresh.id)).sourceRevision;
    await assert.rejects(() => caseAction(b.workspaceId, fresh.id, 'retry_document', { documentId: document.id }), e => e instanceof DomainError && e.status === 404);
    updated = await caseAction(a.workspaceId, fresh.id, 'retry_document', { documentId: document.id });
    assert.equal(updated.documents.at(-1)!.status, 'pending'); assert.ok(updated.sourceRevision > revisionBeforeRetry);
    await assert.rejects(() => caseAction(a.workspaceId, fresh.id, 'retry_document', { documentId: document.id }), e => e instanceof DomainError && e.code === 'CONFLICT');
    const jobs = await query<{ count: string }>("SELECT count(*) FROM jobs WHERE workspace_id=$1 AND case_id=$2 AND kind='extract_document' AND status='queued'", [a.workspaceId, fresh.id]);
    assert.equal(jobs.rows[0].count, '1');
    await query("UPDATE sessions SET expires_at=now()-interval '1 second' WHERE token_hash=$1", [sessionHash(b.token)]);
    assert.equal(await sessionWorkspace(b.token), null, 'expired session cannot recover workspace access');
    for (let i = 0; i < 20; i++) { const id = randomUUID(); rateWorkspaces.push(id);
      await query('INSERT INTO workspaces(id,name,creation_source_hash) VALUES($1,$2,$3)', [id, 'Admission test', rateSource]); }
    await assert.rejects(() => establishSession(undefined, rateSource), e => e instanceof DomainError && e.code === 'RATE_LIMITED');
    assert.equal((await establishSession(a.token, rateSource)).created, false, 'existing cookie must bypass new-session admission');

    const budget = new BudgetLedger(transaction);
    const seedId = randomUUID(); const seedWorkspace = randomUUID();
    await query(`INSERT INTO inference_reservations(id,workspace_id,attempt_key,amount_microusd,actual_microusd,status)
      VALUES($1,$2,$3,39910000,39910000,'settled')`, [seedId, seedWorkspace, `global-cap-seed-${seedId}`]);
    const attempts = await Promise.allSettled([
      budget.reserve(a.workspaceId, `global-race-a-${randomUUID()}`),
      budget.reserve(b.workspaceId, `global-race-b-${randomUUID()}`),
    ]);
    const accepted = attempts.filter((result): result is PromiseFulfilledResult<string> => result.status === 'fulfilled');
    const rejected = attempts.filter((result): result is PromiseRejectedResult => result.status === 'rejected');
    assert.equal(accepted.length, 1, 'only one concurrent 90,000-microUSD reservation fits below the global cap');
    assert.equal(rejected.length, 1); assert.ok(rejected[0].reason instanceof BudgetLimitError);
    const total = await query<{ used: string }>(`SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_microusd
      WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END),0)::text AS used FROM inference_reservations`);
    assert.equal(Number(total.rows[0].used), GLOBAL_LIMIT_MICROUSD, 'concurrent reservations cannot exceed $40');

    await query('DELETE FROM inference_reservations WHERE id=ANY($1::uuid[])', [[seedId, ...accepted.map(result => result.value)]]);
    const workspaceSeed = randomUUID();
    await query(`INSERT INTO inference_reservations(id,workspace_id,attempt_key,amount_microusd,actual_microusd,status)
      VALUES($1,$2,$3,910000,910000,'settled')`, [workspaceSeed, a.workspaceId, `workspace-cap-seed-${workspaceSeed}`]);
    const workspaceAttempts = await Promise.allSettled([
      budget.reserve(a.workspaceId, `workspace-race-a-${randomUUID()}`),
      budget.reserve(a.workspaceId, `workspace-race-b-${randomUUID()}`),
    ]);
    assert.equal(workspaceAttempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(workspaceAttempts.filter(result => result.status === 'rejected' && result.reason instanceof BudgetLimitError).length, 1);
    const workspaceTotal = await query<{ used: string }>(`SELECT COALESCE(SUM(CASE WHEN status='settled' THEN actual_microusd
      WHEN status IN ('reserved','uncertain') THEN amount_microusd ELSE 0 END),0)::text AS used
      FROM inference_reservations WHERE workspace_id=$1`, [a.workspaceId]);
    assert.equal(Number(workspaceTotal.rows[0].used), WORKSPACE_LIMIT_MICROUSD, 'workspace reservation races cannot exceed $1');

    await query("UPDATE workspaces SET expires_at=now()-interval '1 second' WHERE id=$1", [a.workspaceId]);
    assert.equal(await sessionWorkspace(a.token), null, 'workspace expiry also invalidates a live session');
    await assert.rejects(() => getCase(a.workspaceId, fresh.id), e => e instanceof DomainError && e.status === 404);
  } finally {
    await query('DELETE FROM inference_reservations WHERE id=$1', [reservationId]);
    await query('DELETE FROM workspaces WHERE id=ANY($1::uuid[])', [[a.workspaceId, b.workspaceId, ...rateWorkspaces]]);
    await closePool();
  }
  } finally {
    await closePool(); process.env.DATABASE_URL = originalUrl;
    await query(`DROP SCHEMA "${schema}" CASCADE`); await closePool();
  }
});
