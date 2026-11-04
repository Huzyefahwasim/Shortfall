import { createHash, randomUUID } from 'node:crypto';
import type { CaseDocument, CaseRecord, CaseTotals, DocumentKind, Evidence, ExtractionFields, NewCaseInput, Proposal } from './types';

export const POLICY_VERSION = 'goods-quantity-v1';
export const MAX_UNITS = 100_000;
export const MAX_MONEY = 1_000_000_000_000;
export const MAX_DOCUMENTS = 30;
export const MAX_CASE_HISTORY = 300;
export class DomainError extends Error {
  constructor(message: string, public code = 'INVALID_INPUT', public status = 400) { super(message); this.name = 'DomainError'; }
}
export function integer(value: unknown, label: string, min = 0, max = MAX_MONEY): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max)
    throw new DomainError(`${label} must be a whole number between ${min} and ${max}.`);
  return value;
}
export function label(value: unknown, name: string, max = 120): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || /[\x00-\x1f]/.test(value))
    throw new DomainError(`${name} is required and must contain at most ${max} printable characters.`);
  return value.trim();
}
export function digest(value: string | Uint8Array): string { return createHash('sha256').update(value).digest('hex'); }
const now = () => new Date().toISOString();
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function audit(c: CaseRecord, type: string, title: string, detail: string, actor = 'Demo reviewer'): void {
  c.history.push({ id: randomUUID(), type, title, detail, actor, at: now(), revision: c.sourceRevision });
  c.updatedAt = now();
}
export function calculateTotals(c: Pick<CaseRecord, 'orderedUnits' | 'invoicedUnits' | 'unitPriceCents' | 'receipts' | 'credits' | 'appliedCreditCents'>): CaseTotals {
  integer(c.orderedUnits, 'Ordered quantity', 1, MAX_UNITS);
  integer(c.invoicedUnits, 'Invoiced quantity', 1, MAX_UNITS);
  integer(c.unitPriceCents, 'Unit price', 1, 100_000_000);
  if (c.invoicedUnits > c.orderedUnits) throw new DomainError('Invoiced quantity exceeds this purchase order. Review required.', 'NEEDS_REVIEW', 409);
  const receivedUnits = c.receipts.reduce((sum, r) => sum + integer(r.quantity, 'Receipt quantity', 0, MAX_UNITS), 0);
  if (receivedUnits > c.orderedUnits || receivedUnits > c.invoicedUnits)
    throw new DomainError('Receipts exceed the supported invoice allocation. Review required.', 'NEEDS_REVIEW', 409);
  const grossCents = integer(c.invoicedUnits * c.unitPriceCents, 'Invoice total');
  const receivedCents = integer(receivedUnits * c.unitPriceCents, 'Received value');
  const missingUnits = c.invoicedUnits - receivedUnits;
  const creditCents = integer(c.appliedCreditCents, 'Applied credits');
  const recordedCreditCents = c.credits.filter(x => x.applied).reduce((s, x) => s + integer(x.amountCents, 'Applied credit amount', 1), 0);
  if (recordedCreditCents !== creditCents) throw new DomainError('Applied credit records do not match the ledger balance. Review required.', 'NEEDS_REVIEW', 409);
  const pendingCreditCents = c.credits.filter(x => !x.applied).reduce((s, x) => s + integer(x.amountCents, 'Credit amount', 1), 0);
  if (creditCents + pendingCreditCents > missingUnits * c.unitPriceCents)
    throw new DomainError('Goods and credits overlap or credit exceeds the remaining shortage. Review required.', 'NEEDS_REVIEW', 409);
  return { grossCents, receivedUnits, receivedCents, missingUnits, discrepancyCents: grossCents - receivedCents - creditCents,
    netCents: grossCents - creditCents, openPoUnits: c.orderedUnits - receivedUnits, pendingCreditCents };
}
function sourceText(c: CaseRecord, kind: DocumentKind, reference: string, quantity: number, amount: number): string {
  return `SYNTHETIC BUSINESS RECORD\nDocument kind: ${kind}\nReference: ${reference}\nSupplier: ${c.supplier}\nPurchase order: ${c.poNumber}\nInvoice: ${c.invoiceNumber}\nItem: ${c.sku}\nDescription: ${c.description}\nQuantity: ${quantity}\nUnit price: USD ${(c.unitPriceCents / 100).toFixed(2)}\nTotal: USD ${(amount / 100).toFixed(2)}\nCurrency: USD\n`;
}
export function syntheticDocument(c: CaseRecord, kind: DocumentKind, reference: string, quantity: number, amount: number): CaseDocument {
  const text = sourceText(c, kind, reference, quantity, amount);
  const evidence: Evidence[] = [['quantity', `Quantity: ${quantity}`, String(quantity)], ['unitPriceCents', `Unit price: USD ${(c.unitPriceCents / 100).toFixed(2)}`, String(c.unitPriceCents)], ['totalCents', `Total: USD ${(amount / 100).toFixed(2)}`, String(amount)], ['sku', `Item: ${c.sku}`, c.sku]].map(([field, quote, value]) => ({ field, value, quote, start: text.indexOf(quote), end: text.indexOf(quote) + quote.length }));
  return { id: randomUUID(), kind, reference, text, hash: digest(text), createdAt: now(), status: 'verified', evidence };
}
export function createCase(input: NewCaseInput): CaseRecord {
  const c: CaseRecord = { id: randomUUID(), supplier: label(input.supplier, 'Supplier'), poNumber: label(input.poNumber, 'Purchase order'),
    invoiceNumber: label(input.invoiceNumber, 'Invoice'), sku: label(input.sku, 'Item'), description: label(input.description, 'Description', 240),
    orderedUnits: integer(input.orderedUnits, 'Ordered quantity', 1, MAX_UNITS), invoicedUnits: integer(input.invoicedUnits, 'Invoiced quantity', 1, MAX_UNITS),
    unitPriceCents: integer(input.unitPriceCents, 'Unit price', 1, 100_000_000), currency: 'USD', receipts: [], credits: [], heldCents: 0,
    appliedCreditCents: 0, sourceRevision: 1, ledgerRevision: 0, status: 'needs_review', owner: 'Receiving team', reviewer: 'Finance reviewer',
    createdAt: now(), updatedAt: now(), documents: [], proposals: [], tasks: [], history: [], executions: [], synthetic: true };
  const received = integer(input.receivedUnits, 'Received quantity', 0, MAX_UNITS);
  integer(c.orderedUnits * c.unitPriceCents, 'Purchase-order total');
  c.receipts.push({ id: randomUUID(), reference: `${c.poNumber}-GR-001`, quantity: received, createdAt: now() });
  const totals = calculateTotals(c);
  c.documents.push(syntheticDocument(c, 'purchase_order', c.poNumber, c.orderedUnits, c.orderedUnits * c.unitPriceCents),
    syntheticDocument(c, 'invoice', c.invoiceNumber, c.invoicedUnits, totals.grossCents),
    syntheticDocument(c, 'receipt', c.receipts[0].reference, received, totals.receivedCents));
  audit(c, 'case_created', 'Case opened', 'Synthetic source records saved. All ledger changes require reviewer approval.');
  return c;
}
export function seedCases(): CaseRecord[] {
  return [createCase({ supplier: 'Northstar Components', poNumber: 'PO-1042', invoiceNumber: 'INV-8821', sku: 'BR-40', description: 'Precision mounting brackets', orderedUnits: 120, invoicedUnits: 120, receivedUnits: 100, unitPriceCents: 4000 }),
    createCase({ supplier: 'Alder Packaging', poNumber: 'PO-1086', invoiceNumber: 'AP-2940', sku: 'BX-12', description: 'Reusable transit boxes', orderedUnits: 45, invoicedUnits: 45, receivedUnits: 38, unitPriceCents: 1250 }),
    createCase({ supplier: 'Westhaven Supply', poNumber: 'PO-1093', invoiceNumber: 'WS-6009', sku: 'CF-08', description: 'Filter cartridges', orderedUnits: 60, invoicedUnits: 60, receivedUnits: 60, unitPriceCents: 1850 })];
}
export function invalidate(c: CaseRecord, reason: string): void {
  c.sourceRevision++;
  for (const p of c.proposals) if (p.status === 'pending' || p.status === 'approved') p.status = 'stale';
  for (const e of c.executions) if (e.status === 'queued' || e.status === 'failed') { e.status = 'cancelled'; e.error = reason; }
  c.status = 'needs_review';
}
export function receive(c: CaseRecord, quantity: number, reference: string, expectedRevision?: number, makeDocument = true): void {
  integer(quantity, 'Receipt quantity', 0, MAX_UNITS); reference = label(reference, 'Receipt reference');
  if (expectedRevision !== undefined && expectedRevision !== c.sourceRevision) throw new DomainError('The case changed. Refresh before saving this receipt.', 'STALE_SOURCE', 409);
  const previous = c.receipts.find(r => same(r.reference, reference));
  if (previous?.quantity === quantity) return;
  if (makeDocument && c.documents.length >= MAX_DOCUMENTS) throw new DomainError('A demo case supports at most thirty source documents.', 'QUOTA_EXCEEDED', 429);
  const candidate = structuredClone(c);
  const existing = candidate.receipts.find(r => same(r.reference, reference));
  if (existing) existing.quantity = quantity;
  else candidate.receipts.push({ id: randomUUID(), reference, quantity, createdAt: now() });
  calculateTotals(candidate);
  c.receipts = candidate.receipts;
  if (makeDocument) c.documents.push(syntheticDocument(c, 'receipt', reference, quantity, quantity * c.unitPriceCents));
  invalidate(c, 'Receiving evidence changed.');
  audit(c, 'receipt_updated', previous ? 'Receipt corrected' : 'Receipt recorded', `${reference}: ${quantity} accepted units. Earlier approvals are no longer current.`, c.owner);
}
export function addCredit(c: CaseRecord, amountCents: number, reference: string, makeDocument = true): void {
  integer(amountCents, 'Credit amount', 1); reference = label(reference, 'Credit reference');
  if (amountCents % c.unitPriceCents !== 0) throw new DomainError('A quantity credit must cover a whole number of units at the agreed price.', 'NEEDS_REVIEW', 409);
  const previous = c.credits.find(x => same(x.reference, reference));
  if (previous) { if (previous.amountCents === amountCents) return; throw new DomainError('This credit reference already exists with another amount.', 'DUPLICATE_CREDIT', 409); }
  if (makeDocument && c.documents.length >= MAX_DOCUMENTS) throw new DomainError('A demo case supports at most thirty source documents.', 'QUOTA_EXCEEDED', 429);
  const candidate = structuredClone(c);
  candidate.credits.push({ id: randomUUID(), reference, amountCents, createdAt: now(), applied: false });
  calculateTotals(candidate);
  c.credits = candidate.credits;
  if (makeDocument) c.documents.push(syntheticDocument(c, 'credit', reference, amountCents / c.unitPriceCents, amountCents));
  invalidate(c, 'Credit evidence changed.');
  audit(c, 'credit_received', 'Credit ready for review', `${reference}: ${amountCents} cents. Approval is required before linking this credit to the ledger.`, c.reviewer);
}
export function proposalHash(c: CaseRecord, p: Pick<Proposal, 'sourceRevision' | 'ledgerRevision' | 'policyVersion' | 'type' | 'amountCents' | 'creditCents'>): string {
  return digest(JSON.stringify({ caseId: c.id, ...p, documents: currentDocuments(c).map(d => ({ id: d.id, hash: d.hash, status: d.status })),
    receipts: c.receipts, credits: c.credits, heldCents: c.heldCents, appliedCreditCents: c.appliedCreditCents }));
}
export function currentDocuments(c: CaseRecord): CaseDocument[] {
  const latest = new Map<string, CaseDocument>();
  for (const d of c.documents) latest.set(`${d.kind}:${d.reference.toLowerCase()}`, d);
  return [...latest.values()];
}
export function propose(c: CaseRecord): Proposal {
  if (currentDocuments(c).some(d => d.status !== 'verified')) throw new DomainError('Resolve pending or unverified source documents before proposing an action.', 'EVIDENCE_REQUIRED', 409);
  const totals = calculateTotals(c);
  const prior = c.proposals.find(p => p.sourceRevision === c.sourceRevision && p.ledgerRevision === c.ledgerRevision && (p.status === 'pending' || p.status === 'approved'));
  if (prior) return prior;
  const base = { sourceRevision: c.sourceRevision, ledgerRevision: c.ledgerRevision, policyVersion: POLICY_VERSION,
    type: (totals.pendingCreditCents > 0 || totals.discrepancyCents === 0 ? 'reconcile' : 'hold') as Proposal['type'],
    amountCents: totals.discrepancyCents - totals.pendingCreditCents, creditCents: totals.pendingCreditCents };
  const p: Proposal = { id: randomUUID(), ...base, hash: proposalHash(c, base), createdAt: now(), status: 'pending' };
  c.proposals.push(p); c.status = 'awaiting_approval';
  audit(c, 'proposal_created', base.type === 'hold' ? 'Hold proposed' : 'Reconciliation proposed', `Current evidence supports ${base.amountCents} cents held and ${base.creditCents} cents of new credit.`, 'Policy engine');
  return p;
}
function assertCurrent(c: CaseRecord, p: Proposal): void {
  const base = { sourceRevision: p.sourceRevision, ledgerRevision: p.ledgerRevision, policyVersion: p.policyVersion, type: p.type, amountCents: p.amountCents, creditCents: p.creditCents };
  if (p.sourceRevision !== c.sourceRevision || p.ledgerRevision !== c.ledgerRevision || p.policyVersion !== POLICY_VERSION || p.status === 'stale' || p.hash !== proposalHash(c, base))
    throw new DomainError('This proposal is outdated because its evidence or ledger changed. Generate and review a current proposal.', 'STALE_PROPOSAL', 409);
}
export function approve(c: CaseRecord, proposalId: string): string {
  const p = c.proposals.find(x => x.id === proposalId);
  if (!p) throw new DomainError('Proposal not found.', 'NOT_FOUND', 404);
  const existing = c.executions.find(e => e.proposalId === proposalId);
  if (existing?.status === 'applied' || existing?.status === 'queued') return existing.id;
  assertCurrent(c, p);
  if (p.status !== 'pending') throw new DomainError('This proposal cannot be approved again.', 'CONFLICT', 409);
  p.status = 'approved'; c.status = 'queued';
  const commandId = randomUUID();
  c.executions.push({ id: commandId, proposalId, type: p.type, status: 'queued', createdAt: now() });
  audit(c, 'proposal_approved', 'Approval recorded', `Approved evidence revision ${p.sourceRevision}, ledger revision ${p.ledgerRevision}.`, c.reviewer);
  return commandId;
}
export function execute(c: CaseRecord, commandId: string): void {
  const execution = c.executions.find(e => e.id === commandId);
  if (!execution) throw new DomainError('Command not found.', 'NOT_FOUND', 404);
  if (execution.status === 'applied') return;
  if (execution.status === 'cancelled') throw new DomainError('The command was cancelled after evidence changed.', 'STALE_PROPOSAL', 409);
  const p = c.proposals.find(x => x.id === execution.proposalId);
  if (!p || p.status !== 'approved') throw new DomainError('A current approval is required.', 'APPROVAL_REQUIRED', 409);
  assertCurrent(c, p); calculateTotals(c);
  const before = c.heldCents;
  c.appliedCreditCents += p.creditCents;
  if (p.creditCents) for (const credit of c.credits) if (!credit.applied) credit.applied = true;
  c.heldCents = p.amountCents; c.ledgerRevision++;
  const verifiedTotals = calculateTotals(c);
  if (verifiedTotals.discrepancyCents !== c.heldCents) throw new DomainError('The proposed hold does not match the verified ledger balance.', 'NEEDS_REVIEW', 409);
  execution.status = 'applied'; execution.appliedAt = now(); execution.beforeHeldCents = before; execution.afterHeldCents = c.heldCents;
  p.status = 'applied'; c.status = c.heldCents ? 'on_hold' : 'resolved';
  if (c.heldCents && !c.tasks.some(t => t.commandId === commandId))
    c.tasks.push({ id: randomUUID(), title: `Follow up with ${c.supplier} on ${c.invoiceNumber}`, owner: c.owner, status: 'open', commandId });
  if (!c.heldCents) for (const task of c.tasks) task.status = 'done';
  for (const other of c.proposals) if (other.id !== p.id && other.status === 'pending') other.status = 'stale';
  audit(c, 'command_applied', c.heldCents ? 'Internal hold applied' : 'Invoice exception reconciled', `Internal ledger: ${before} → ${c.heldCents} cents held; ${p.creditCents} cents credit accepted. No payment was issued.`, 'Workflow worker');
}
export function applyExtraction(c: CaseRecord, documentId: string, fields: Omit<ExtractionFields, 'evidence'> & { evidence: Evidence[] }): void {
  const d = c.documents.find(x => x.id === documentId);
  if (!d || !currentDocuments(c).some(x => x.id === documentId)) throw new DomainError('A newer version of this document exists.', 'STALE_DOCUMENT', 409);
  const needsInvoice = d.kind === 'invoice' || d.kind === 'credit';
  if (fields.kind !== d.kind || !same(fields.reference, d.reference) || !same(fields.supplier, c.supplier) || !same(fields.poNumber, c.poNumber) || ((needsInvoice || fields.invoiceNumber) && !same(fields.invoiceNumber, c.invoiceNumber)) || !same(fields.sku, c.sku) || fields.currency !== 'USD')
    throw new DomainError('The document does not match this supplier, order, invoice, item, or currency.', 'EVIDENCE_MISMATCH', 409);
  integer(fields.quantity, 'Extracted quantity', 0, MAX_UNITS); integer(fields.unitPriceCents, 'Extracted price', d.kind === 'receipt' ? 0 : 1, 100_000_000); integer(fields.totalCents, 'Extracted total');
  if ((fields.unitPriceCents !== 0 && fields.unitPriceCents !== c.unitPriceCents) || ((d.kind !== 'receipt' || fields.totalCents !== 0) && fields.quantity * (fields.unitPriceCents || c.unitPriceCents) !== fields.totalCents))
    throw new DomainError('The source price or stated total conflicts with this case.', 'EVIDENCE_MISMATCH', 409);
  if (!fields.evidence.length || fields.evidence.some(e => !Number.isInteger(e.start) || !Number.isInteger(e.end) || e.start < 0 || e.end <= e.start || d.text.slice(e.start, e.end) !== e.quote))
    throw new DomainError('Extraction evidence could not be verified.', 'EVIDENCE_MISMATCH', 409);
  if (d.kind === 'purchase_order' && fields.quantity !== c.orderedUnits || d.kind === 'invoice' && fields.quantity !== c.invoicedUnits)
    throw new DomainError('This document disagrees with the declared order or invoice. Review and create a corrected case.', 'EVIDENCE_MISMATCH', 409);
  if (d.kind === 'receipt') receive(c, fields.quantity, d.reference, undefined, false);
  if (d.kind === 'credit') addCredit(c, fields.totalCents, d.reference, false);
  d.status = 'verified'; d.evidence = fields.evidence; delete d.extractionError;
  invalidate(c, 'Document extraction was verified.');
  audit(c, 'extraction_verified', 'Document evidence verified', `${d.reference}: extracted fields matched the source text and case identifiers.`, 'Document extraction');
}
