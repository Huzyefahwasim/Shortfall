export type DocumentKind = 'purchase_order' | 'invoice' | 'receipt' | 'credit';
export type CaseStatus = 'needs_review' | 'awaiting_approval' | 'queued' | 'on_hold' | 'resolved';
export interface Evidence {
  field: string;
  value: string;
  quote: string;
  start: number;
  end: number;
}
export interface CaseDocument {
  id: string;
  kind: DocumentKind;
  reference: string;
  text: string;
  hash: string;
  createdAt: string;
  status: 'verified' | 'pending' | 'needs_review';
  evidence: Evidence[];
  extractionError?: string;
  model?: string;
}
export interface Receipt {
  id: string;
  reference: string;
  quantity: number;
  createdAt: string;
}
export interface Credit {
  id: string;
  reference: string;
  amountCents: number;
  createdAt: string;
  applied: boolean;
}
export interface Proposal {
  id: string;
  sourceRevision: number;
  ledgerRevision: number;
  policyVersion: string;
  type: 'hold' | 'reconcile';
  amountCents: number;
  creditCents: number;
  hash: string;
  createdAt: string;
  status: 'pending' | 'stale' | 'approved' | 'applied';
}
export interface CaseTask {
  id: string;
  title: string;
  owner: string;
  status: 'open' | 'done';
  commandId: string;
}
export interface AuditEvent {
  id: string;
  type: string;
  title: string;
  detail: string;
  actor: string;
  at: string;
  revision: number;
}
export interface Execution {
  id: string;
  proposalId: string;
  type: 'hold' | 'reconcile';
  status: 'queued' | 'applied' | 'cancelled' | 'failed';
  createdAt: string;
  appliedAt?: string;
  beforeHeldCents?: number;
  afterHeldCents?: number;
  error?: string;
}
export interface CaseRecord {
  id: string;
  supplier: string;
  poNumber: string;
  invoiceNumber: string;
  sku: string;
  description: string;
  orderedUnits: number;
  invoicedUnits: number;
  unitPriceCents: number;
  currency: 'USD';
  receipts: Receipt[];
  credits: Credit[];
  heldCents: number;
  appliedCreditCents: number;
  sourceRevision: number;
  ledgerRevision: number;
  status: CaseStatus;
  owner: string;
  reviewer: string;
  createdAt: string;
  updatedAt: string;
  documents: CaseDocument[];
  proposals: Proposal[];
  tasks: CaseTask[];
  history: AuditEvent[];
  executions: Execution[];
  synthetic: boolean;
}
export interface CaseTotals {
  grossCents: number;
  receivedUnits: number;
  receivedCents: number;
  missingUnits: number;
  discrepancyCents: number;
  netCents: number;
  openPoUnits: number;
  pendingCreditCents: number;
}
export interface NewCaseInput {
  supplier: string;
  poNumber: string;
  invoiceNumber: string;
  sku: string;
  description: string;
  orderedUnits: number;
  invoicedUnits: number;
  receivedUnits: number;
  unitPriceCents: number;
}
export interface WorkspaceResponse {
  cases: CaseRecord[];
  workspace: { id: string; name: string; synthetic: boolean };
  service: { workerOnline: boolean; model: string; inferenceEnabled: boolean };
}
export interface ExtractionFields {
  kind: DocumentKind;
  reference: string;
  supplier: string;
  poNumber: string;
  invoiceNumber: string;
  sku: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  currency: string;
  evidence: { field: string; value: string; quote: string }[];
}
