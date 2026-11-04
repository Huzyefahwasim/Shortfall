import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addCredit, approve, calculateTotals, createCase, currentDocuments, DomainError, execute, MAX_DOCUMENTS, propose, receive, seedCases } from '../src/lib/domain';

const sample = () => seedCases()[0];
const code = (expected: string) => (error: unknown) => error instanceof DomainError && error.code === expected;

test('quantity comparison uses integer cents and preserves open order quantity', () => {
  const c = sample(); const t = calculateTotals(c);
  assert.equal(t.grossCents, 480000); assert.equal(t.receivedCents, 400000);
  assert.equal(t.discrepancyCents, 80000); assert.equal(t.openPoUnits, 20);
});
test('new unseen values run through the same arithmetic', () => {
  const c = createCase({ supplier: 'New supplier', poNumber: 'P-new', invoiceNumber: 'I-new', sku: 'S-new', description: 'Different goods', orderedUnits: 37, invoicedUnits: 37, receivedUnits: 29, unitPriceCents: 1375 });
  assert.equal(calculateTotals(c).discrepancyCents, 11000);
  assert.equal(propose(c).amountCents, 11000);
});
test('receipt update rejects a proposal before approval', () => {
  const c = sample(); const old = propose(c); receive(c, 10, 'GR-late');
  assert.throws(() => approve(c, old.id), code('STALE_PROPOSAL'));
  assert.equal(c.heldCents, 0); assert.equal(propose(c).amountCents, 40000);
});
test('receipt update after approval cancels the queued command', () => {
  const c = sample(); const command = approve(c, propose(c).id); receive(c, 10, 'GR-late');
  assert.throws(() => execute(c, command), code('STALE_PROPOSAL'));
  assert.equal(c.heldCents, 0); assert.equal(c.executions[0].status, 'cancelled');
});
test('retry after committed execution produces one effect and one follow-up', () => {
  const c = sample(); const proposal = propose(c); const command = approve(c, proposal.id);
  assert.equal(approve(c, proposal.id), command); execute(c, command); execute(c, command);
  assert.equal(c.ledgerRevision, 1); assert.equal(c.heldCents, 80000); assert.equal(c.tasks.length, 1);
  assert.equal(c.history.filter(e => e.type === 'command_applied').length, 1);
});
test('full workflow accepts credit only at approved execution and keeps PO open', () => {
  const c = sample(); receive(c, 10, 'GR-late'); execute(c, approve(c, propose(c).id));
  addCredit(c, 40000, 'CN-400'); assert.equal(c.appliedCreditCents, 0); assert.equal(c.heldCents, 40000);
  const p = propose(c); assert.equal(p.type, 'reconcile'); assert.equal(p.creditCents, 40000);
  execute(c, approve(c, p.id)); const t = calculateTotals(c);
  assert.equal(t.netCents, 440000); assert.equal(t.openPoUnits, 10); assert.equal(c.heldCents, 0);
  assert.equal(c.status, 'resolved'); assert.equal(c.tasks[0].status, 'done');
});
test('credit duplicate is idempotent and cannot cover replacement goods twice', () => {
  const c = sample(); addCredit(c, 80000, 'CN-800'); const rev = c.sourceRevision;
  addCredit(c, 80000, 'CN-800'); assert.equal(c.sourceRevision, rev); assert.equal(c.credits.length, 1);
  assert.throws(() => receive(c, 10, 'GR-too-late'), code('NEEDS_REVIEW'));
  assert.equal(c.receipts.length, 1);
});
test('receipt correction replaces a reference instead of double counting', () => {
  const c = sample(); const reference = c.receipts[0].reference; receive(c, 110, reference);
  assert.equal(c.receipts.length, 1); assert.equal(calculateTotals(c).receivedUnits, 110);
  const revision = c.sourceRevision; receive(c, 110, reference); assert.equal(c.sourceRevision, revision);
});
test('executed hold is preserved until a correction receives new approval', () => {
  const c = sample(); execute(c, approve(c, propose(c).id)); receive(c, 10, 'GR-late');
  assert.equal(c.heldCents, 80000); assert.equal(c.status, 'needs_review');
  execute(c, approve(c, propose(c).id)); assert.equal(c.heldCents, 40000); assert.equal(c.ledgerRevision, 2);
});
test('money, quantity and total bounds reject unsupported values', () => {
  const base = { supplier: 'S', poNumber: 'P', invoiceNumber: 'I', sku: 'X', description: 'Goods', orderedUnits: 1, invoicedUnits: 1, receivedUnits: 0, unitPriceCents: 1 };
  for (const patch of [{ receivedUnits: -1 }, { orderedUnits: 0.5 }, { unitPriceCents: NaN }, { invoicedUnits: 2 }, { orderedUnits: 100000, invoicedUnits: 100000, unitPriceCents: 100000000 }])
    assert.throws(() => createCase({ ...base, ...patch }), DomainError);
});
test('changed payload cannot reuse an approved proposal', () => {
  const c = sample(); const p = propose(c); p.amountCents = 1;
  assert.throws(() => approve(c, p.id), code('STALE_PROPOSAL'));
});
test('pending evidence prevents a new actionable proposal', () => {
  const c = sample(); c.documents[0].status = 'pending';
  assert.throws(() => propose(c), code('EVIDENCE_REQUIRED'));
});
test('corrected latest document supersedes failed evidence of the same kind and reference', () => {
  const c = sample(); const original = c.documents[0]; original.status = 'needs_review';
  c.documents.push({ ...original, id: 'replacement', hash: 'new-hash', status: 'verified' });
  assert.ok(!currentDocuments(c).some(d => d.id === original.id));
  assert.equal(propose(c).amountCents, 80000);
});
test('another document kind cannot replace failed evidence even with the same reference', () => {
  const c = sample(); const original = c.documents[0]; original.status = 'needs_review';
  c.documents.push({ ...original, id: 'wrong-type', kind: 'credit', status: 'verified' });
  assert.throws(() => propose(c), code('EVIDENCE_REQUIRED'));
});
test('late failure on superseded evidence cannot invalidate a current approved proposal', () => {
  const c = sample(); const old = c.documents[0]; old.status = 'pending';
  c.documents.push({ ...old, id: 'replacement-verified', hash: 'new-hash', status: 'verified' });
  const p = propose(c); const command = approve(c, p.id);
  old.status = 'needs_review';
  execute(c, command); assert.equal(c.heldCents, 80000);
});
test('correcting receipt after resolution opens review without silently changing the ledger', () => {
  const c = sample(); receive(c, 10, 'LATE-10'); execute(c, approve(c, propose(c).id));
  addCredit(c, 40000, 'CREDIT-10'); execute(c, approve(c, propose(c).id));
  assert.equal(c.status, 'resolved'); assert.equal(c.appliedCreditCents, 40000);
  receive(c, 90, c.receipts[0].reference);
  assert.equal(c.status, 'needs_review'); assert.equal(c.heldCents, 0);
  assert.equal(c.appliedCreditCents, 40000); assert.equal(calculateTotals(c).discrepancyCents, 40000);
  execute(c, approve(c, propose(c).id)); assert.equal(c.heldCents, 40000);
  assert.equal(calculateTotals(c).netCents, 440000);
});
test('structured receipt and credit intake obey the same source-document cap as uploads', () => {
  const c = sample(); while (c.documents.length < MAX_DOCUMENTS) c.documents.push({ ...c.documents[0], id: `history-${c.documents.length}` });
  assert.throws(() => receive(c, 1, 'NEW-AT-CAP'), code('QUOTA_EXCEEDED'));
  assert.throws(() => addCredit(c, 4000, 'CREDIT-AT-CAP'), code('QUOTA_EXCEEDED'));
  assert.doesNotThrow(() => receive(c, c.receipts[0].quantity, c.receipts[0].reference));
  assert.equal(c.documents.length, MAX_DOCUMENTS); assert.equal(c.credits.length, 0);
});
test('credit balance cannot diverge from its applied source records', () => {
  const c = sample(); c.appliedCreditCents = 40000;
  assert.throws(() => calculateTotals(c), code('NEEDS_REVIEW'));
  assert.throws(() => propose(c), code('NEEDS_REVIEW'));
});
