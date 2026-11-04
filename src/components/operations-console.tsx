'use client';

import type { ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  FileCheck2,
  FileText,
  History,
  Inbox,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  PackageCheck,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { CaseDocument, CaseRecord, Proposal, WorkspaceResponse } from '@/lib/types';

type Modal = 'receipt' | 'credit' | 'create' | 'upload' | 'assign' | 'policy' | 'reset' | null;
type Notice = { kind: 'success' | 'error' | 'info'; message: string } | null;
type Totals = {
  receivedUnits: number;
  grossCents: number;
  receivedCents: number;
  netCents: number;
  pendingCreditCents: number;
  discrepancyCents: number;
  missingUnits: number;
  openPoUnits: number;
};
interface ConsoleProps {
  onGuide: () => void;
  guideVisible: boolean;
  onHideGuide: () => void;
  workspace: WorkspaceResponse | null;
  selected: CaseRecord | null;
  visibleCases: CaseRecord[];
  caseTotals: Totals | null;
  totalDiscrepancy: number;
  view: 'desk' | 'activity';
  onView: (view: 'desk' | 'activity') => void;
  search: string;
  onSearch: (search: string) => void;
  filter: string;
  onFilter: (filter: string) => void;
  busy: string;
  notice: Notice;
  dismissNotice: () => void;
  onModal: (modal: Modal) => void;
  onRefresh: () => void;
  onSelect: (record: CaseRecord) => void;
  mobileCase: boolean;
  onBack: () => void;
  tab: 'evidence' | 'activity';
  onTab: (tab: 'evidence' | 'activity') => void;
  currentDocument?: CaseDocument;
  onDocument: (id: string) => void;
  renderEvidence: (document: CaseDocument) => ReactNode;
  renderActivity: (record: CaseRecord) => ReactNode;
  activeProposal: Proposal | null | undefined;
  onReview: (proposal: Proposal) => void;
  onPropose: () => void;
  showOldProposals: boolean;
  onToggleOld: () => void;
}

const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
const statusLabels = {
  needs_review: 'Needs review',
  awaiting_approval: 'Awaiting approval',
  queued: 'Processing',
  on_hold: 'On hold',
  resolved: 'Resolved',
};
const documentLabels = {
  purchase_order: 'Purchase order',
  invoice: 'Invoice',
  receipt: 'Goods receipt',
  credit: 'Supplier credit',
};
const stamp = (date: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(date));
const gap = (record: CaseRecord) =>
  Math.max(
    0,
    record.invoicedUnits * record.unitPriceCents -
      record.receipts.reduce((sum, receipt) => sum + receipt.quantity * record.unitPriceCents, 0) -
      record.appliedCreditCents,
  );

function Status({ status }: { status: CaseRecord['status'] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {statusLabels[status]}
    </span>
  );
}

function Empty({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="empty-state">
      <Inbox size={24} />
      <h3>{title}</h3>
      <p>{detail}</p>
    </div>
  );
}

export function OperationsConsole(props: ConsoleProps) {
  const {
    onGuide,
    guideVisible,
    onHideGuide,
    workspace,
    selected,
    visibleCases,
    caseTotals: sum,
    totalDiscrepancy,
    view,
    onView,
    search,
    onSearch,
    filter,
    onFilter,
    busy,
    notice,
    dismissNotice,
    onModal,
    onRefresh,
    onSelect,
    mobileCase,
    onBack,
    tab,
    onTab,
    currentDocument,
    onDocument,
    renderEvidence,
    renderActivity,
    activeProposal,
    onReview,
    onPropose,
    showOldProposals,
    onToggleOld,
  } = props;
  const cases = workspace?.cases || [];
  const pendingCases = cases.filter((record) => record.status !== 'resolved').length;
  const latestProposal = selected?.proposals.at(-1);
  const staleProposal = latestProposal?.status === 'stale' ? latestProposal : null;
  const nextHold = sum
    ? (activeProposal?.amountCents ?? Math.max(0, sum.discrepancyCents - sum.pendingCreditCents))
    : 0;
  const events = cases
    .flatMap((record) => record.history.map((event) => ({ ...event, record })))
    .sort((a, b) => b.at.localeCompare(a.at));
  const guideStage =
    selected?.status === 'resolved'
      ? 'complete'
      : !selected?.proposals.length
        ? 'start'
        : sum?.receivedUnits === 100
          ? 'receipt'
          : staleProposal
            ? 'stale'
            : sum && sum.pendingCreditCents > 0
              ? 'reconcile'
              : selected?.heldCents
                ? 'credit'
                : 'review';
  const guideCopy = {
    start: [
      'Start with the original $800 proposal',
      'Prepare the first change and inspect it. Close the review before adding the late receipt.',
    ],
    receipt: [
      'Add the late receiving document',
      'Open the sample files and upload RCV-2042. It records 10 additional accepted units.',
    ],
    stale: [
      'See why the earlier approval is no longer valid',
      'Review the old $800 proposal and attempt approval. The current evidence supports a $400 hold.',
    ],
    review: [
      'Review the current $400 change',
      'Approve the revised proposal, then check the verified execution in Activity.',
    ],
    credit: [
      'Add the supplier’s $400 credit',
      'Open the sample files and upload CN-8821-01. Applying the credit needs a new approval.',
    ],
    reconcile: [
      'Approve the credit reconciliation',
      'Review the credit and hold release. The purchase-order balance must remain open.',
    ],
    complete: [
      'The invoice exception is resolved',
      'Export the $4,400 reconciliation. Ten units remain open on the purchase order.',
    ],
  }[guideStage];

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to workspace
      </a>
      <header className="appbar">
        <a className="wordmark" href="/" aria-label="Shortfall workspace">
          <span className="wordmark-symbol" aria-hidden="true">
            <span />
            <span />
          </span>
          Shortfall<span className="product-area">Payables</span>
        </a>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={view === 'desk' ? 'active' : ''} onClick={() => onView('desk')}>
            <Inbox size={16} />
            Exceptions<span>{pendingCases}</span>
          </button>
          <button
            className={view === 'activity' ? 'active' : ''}
            onClick={() => onView('activity')}
          >
            <History size={16} />
            Activity
          </button>
          <button onClick={() => onModal('policy')}>
            <Settings2 size={16} />
            Policy
          </button>
          <button onClick={onGuide}>
            <ListChecks size={16} />
            Guide
          </button>
        </nav>
        <div className="appbar-end">
          <span className="sample-label">
            <LockKeyhole size={12} />
            Private sample workspace
          </span>
          <button
            className="icon-button"
            aria-label="Reset sample workspace"
            title="Reset sample workspace"
            onClick={() => onModal('reset')}
          >
            <RefreshCw size={16} />
          </button>
        </div>
      </header>

      <main className="main" id="main-content">
        <div className="page-header">
          <div>
            <div className="eyebrow">FINANCE OPERATIONS</div>
            <h1>{view === 'desk' ? 'The exception desk' : 'Workspace activity'}</h1>
          </div>
          <div className="workspace-summary">
            <span>
              <strong>{cases.length}</strong> cases
            </span>
            <span>
              <strong>{money(totalDiscrepancy)}</strong> unreconciled
            </span>
            <span className="runtime-status">
              <span className={`service-dot ${workspace?.service.workerOnline ? 'online' : ''}`} />
              {workspace?.service.workerOnline ? 'Worker online' : 'Worker offline'}
            </span>
          </div>
          <button className="button primary new-case" onClick={() => onModal('create')}>
            <Plus size={16} />
            New case
          </button>
        </div>

        {notice && (
          <div
            className={`notice notice-${notice.kind}`}
            role={notice.kind === 'error' ? 'alert' : 'status'}
          >
            {notice.kind === 'error' ? (
              <CircleAlert size={18} />
            ) : notice.kind === 'success' ? (
              <CheckCheck size={18} />
            ) : (
              <Clock3 size={18} />
            )}
            <span>{notice.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={dismissNotice}
            >
              <X size={16} />
            </button>
          </div>
        )}

        {view === 'activity' ? (
          <section className="global-activity surface">
            <div className="section-title">
              <div>
                <span className="eyebrow">PERSISTED WORKSPACE RECORDS</span>
                <h2>
                  Activity log <span className="count-badge">{events.length}</span>
                </h2>
              </div>
              <button className="button secondary small" onClick={onRefresh}>
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
            <div className="activity-table-head">
              <span>EVENT / CASE</span>
              <span>ACTOR</span>
              <span>RECORDED</span>
            </div>
            {events.length ? (
              events.map((event) => (
                <button
                  className="global-event"
                  key={`${event.record.id}-${event.id}`}
                  onClick={() => {
                    onSelect(event.record);
                    onView('desk');
                    onTab('activity');
                  }}
                >
                  <div>
                    <strong>{event.title}</strong>
                    <p>{event.detail}</p>
                    <span>
                      {event.record.invoiceNumber} · {event.record.supplier}
                    </span>
                  </div>
                  <span className="event-actor">{event.actor}</span>
                  <time>{stamp(event.at)}</time>
                  <ArrowUpRight size={15} />
                </button>
              ))
            ) : (
              <Empty title="No recorded activity" detail="Create a case to begin its history." />
            )}
          </section>
        ) : (
          <div className={`desk-layout ${mobileCase ? 'show-case' : ''}`}>
            <section className="queue surface" aria-label="Invoice exception queue">
              <div className="queue-heading">
                <h2>
                  Work queue <span className="count-badge">{cases.length}</span>
                </h2>
                <button className="icon-button" aria-label="Refresh cases" onClick={onRefresh}>
                  <RefreshCw size={16} />
                </button>
              </div>
              <div className="queue-tools">
                <div className="search-field">
                  <Search size={16} />
                  <input
                    aria-label="Search cases"
                    placeholder="Supplier, invoice or item"
                    value={search}
                    onChange={(event) => onSearch(event.target.value)}
                  />
                </div>
                <div className="queue-filter">
                  <select
                    aria-label="Filter case status"
                    value={filter}
                    onChange={(event) => onFilter(event.target.value)}
                  >
                    <option value="all">All cases</option>
                    <option value="open">Open cases</option>
                    <option value="awaiting_approval">Awaiting approval</option>
                    <option value="on_hold">On hold</option>
                    <option value="resolved">Resolved</option>
                  </select>
                  <span>{visibleCases.length} shown</span>
                </div>
              </div>
              <div className="queue-column-head">
                <span>SUPPLIER / INVOICE</span>
                <span>GAP</span>
              </div>
              <div className="case-list">
                {visibleCases.length ? (
                  visibleCases.map((record) => (
                    <button
                      className={`case-row ${selected?.id === record.id ? 'selected' : ''}`}
                      key={record.id}
                      onClick={() => onSelect(record)}
                      aria-pressed={selected?.id === record.id}
                    >
                      <div className="case-row-top">
                        <span className="case-supplier">{record.supplier}</span>
                        <strong>{money(gap(record))}</strong>
                      </div>
                      <div className="case-row-reference">
                        <span>{record.invoiceNumber}</span>
                        <ChevronRight size={14} />
                      </div>
                      <div className="case-row-bottom">
                        <Status status={record.status} />
                        <span>{record.owner}</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <Empty
                    title="No matching cases"
                    detail={
                      cases.length
                        ? 'Change the search or status filter.'
                        : 'Create a case to compare invoice and receiving records.'
                    }
                  />
                )}
              </div>
              <div className="queue-footer">
                <span className="queue-footer-rule" />
                <strong>Workspace boundary</strong>
                <p>
                  Synthetic documents. Internal ledger. Your cases are isolated from other visitors.
                </p>
              </div>
            </section>

            {selected && sum ? (
              <section
                className="case-workspace surface"
                aria-label={`Case ${selected.invoiceNumber}`}
              >
                <button className="back-to-queue" onClick={onBack}>
                  <ArrowLeft size={16} />
                  Back to cases
                </button>
                <div className="case-header">
                  <div>
                    <div className="case-kicker">
                      <span>INVOICE</span>
                      <span>{selected.invoiceNumber}</span>
                      <span className="case-revision">SOURCE r{selected.sourceRevision}</span>
                    </div>
                    <h2>{selected.supplier}</h2>
                    <p>{selected.description || selected.sku}</p>
                  </div>
                  <div className="case-header-actions">
                    <Status status={selected.status} />
                    {selected.status === 'resolved' ? (
                      <a
                        href={`/api/cases/${selected.id}/export?format=csv`}
                        download
                        className="button primary"
                      >
                        <ArrowDownToLine size={16} />
                        Export reconciliation
                      </a>
                    ) : (
                      <button
                        className="button primary"
                        disabled={!!busy || selected.status === 'queued'}
                        onClick={() => (activeProposal ? onReview(activeProposal) : onPropose())}
                      >
                        {selected.status === 'queued' || busy === 'propose' ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <ListChecks size={16} />
                        )}
                        {selected.status === 'queued'
                          ? 'Applying changes'
                          : activeProposal
                            ? 'Review proposal'
                            : 'Prepare resolution'}
                      </button>
                    )}
                  </div>
                </div>
                {guideVisible && selected.poNumber === 'PO-1042' && (
                  <div className="guided-strip">
                    <span className="guided-index">GUIDED CASE</span>
                    <div>
                      <strong>{guideCopy[0]}</strong>
                      <p>{guideCopy[1]}</p>
                    </div>
                    {guideStage === 'complete' ? (
                      <a
                        className="button secondary small"
                        href={`/api/cases/${selected.id}/export?format=json`}
                        download
                      >
                        Download case record
                        <ArrowDownToLine size={14} />
                      </a>
                    ) : (
                      <button
                        className="button secondary small"
                        disabled={!!busy}
                        onClick={() => {
                          if (guideStage === 'receipt' || guideStage === 'credit')
                            onModal('upload');
                          else if (guideStage === 'stale' && staleProposal) onReview(staleProposal);
                          else if (activeProposal) onReview(activeProposal);
                          else onPropose();
                        }}
                      >
                        {guideStage === 'receipt' || guideStage === 'credit'
                          ? 'Open sample documents'
                          : guideStage === 'stale'
                            ? 'Inspect outdated proposal'
                            : 'Start review'}
                        <ArrowRight size={14} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      aria-label="Hide guided case instructions"
                      onClick={onHideGuide}
                    >
                      <X size={15} />
                    </button>
                  </div>
                )}
                <div className="case-meta">
                  <span>
                    ORDER <strong>{selected.poNumber}</strong>
                  </span>
                  <span>
                    ITEM <strong>{selected.sku}</strong>
                  </span>
                  <button className="owner-control" onClick={() => onModal('assign')}>
                    <Users size={14} />
                    <span>{selected.owner || 'Assign owner'}</span>
                    <ChevronDown size={12} />
                  </button>
                  <span className="reviewer-label">
                    REVIEWER <strong>{selected.reviewer || 'Unassigned'}</strong>
                  </span>
                </div>

                <div
                  className={`discrepancy-banner ${selected.status === 'resolved' ? 'is-resolved' : ''}`}
                >
                  <div>
                    <span>INVOICED</span>
                    <strong>{money(sum.grossCents)}</strong>
                    <small>
                      {selected.invoicedUnits} units × {money(selected.unitPriceCents)}
                    </small>
                  </div>
                  <div>
                    <span>ACCEPTED</span>
                    <strong>{money(sum.receivedCents)}</strong>
                    <small>{sum.receivedUnits} units received</small>
                  </div>
                  <div className="gap-summary">
                    <span>{selected.status === 'resolved' ? 'RECONCILED' : 'UNRECONCILED'}</span>
                    <strong>
                      {selected.status === 'resolved' ? (
                        <>
                          <CheckCheck size={22} />
                          {money(sum.netCents)} reconciled
                        </>
                      ) : (
                        money(sum.discrepancyCents)
                      )}
                    </strong>
                    <small>
                      {selected.status === 'resolved'
                        ? `${sum.openPoUnits} units remain open on the purchase order.`
                        : `${sum.missingUnits} units not yet received`}
                    </small>
                  </div>
                </div>

                {staleProposal && (
                  <div className="revision-signal">
                    <span className="revision-symbol">
                      <History size={18} />
                    </span>
                    <div>
                      <strong>Evidence changed after this proposal</strong>
                      <p>
                        <span>
                          r{staleProposal.sourceRevision} · {money(staleProposal.amountCents)}
                        </span>
                        <ArrowRight size={14} />
                        <span>
                          r{selected.sourceRevision} · {money(nextHold)}
                        </span>
                        <small>proposed hold</small>
                      </p>
                    </div>
                    <button className="button secondary" onClick={() => onReview(staleProposal)}>
                      Review previous proposal
                      <ArrowUpRight size={14} />
                    </button>
                  </div>
                )}

                <div className="case-tabs">
                  <div role="tablist" aria-label="Case details">
                    <button
                      role="tab"
                      aria-selected={tab === 'evidence'}
                      className={tab === 'evidence' ? 'active' : ''}
                      onClick={() => onTab('evidence')}
                    >
                      <FileText size={16} />
                      Evidence & resolution
                    </button>
                    <button
                      role="tab"
                      aria-selected={tab === 'activity'}
                      className={tab === 'activity' ? 'active' : ''}
                      onClick={() => onTab('activity')}
                    >
                      <History size={16} />
                      Activity<span>{selected.history.length}</span>
                    </button>
                  </div>
                  <a
                    className="export-link"
                    href={`/api/cases/${selected.id}/export?format=json`}
                    download
                  >
                    <ArrowDownToLine size={15} />
                    <span>Export</span>
                  </a>
                </div>

                {tab === 'evidence' ? (
                  <>
                    <div className="workbench-grid">
                      <section className="evidence-panel">
                        <div className="section-title compact">
                          <div>
                            <span className="section-index">01</span>
                            <h3>Source evidence</h3>
                            <span className="count-badge">{selected.documents.length}</span>
                          </div>
                          <button
                            className="button secondary small"
                            aria-label="Upload supporting document"
                            onClick={() => onModal('upload')}
                          >
                            <Upload size={15} />
                            Upload
                          </button>
                        </div>
                        <div className="document-tabs">
                          {selected.documents.map((document) => (
                            <button
                              key={document.id}
                              className={currentDocument?.id === document.id ? 'active' : ''}
                              onClick={() => onDocument(document.id)}
                            >
                              <span>{documentLabels[document.kind]}</span>
                              <small>{document.reference}</small>
                              {document.status === 'pending' ? (
                                <LoaderCircle size={13} className="spin" />
                              ) : document.status === 'needs_review' ? (
                                <CircleAlert size={13} />
                              ) : (
                                <Check size={13} />
                              )}
                            </button>
                          ))}
                        </div>
                        {currentDocument ? (
                          renderEvidence(currentDocument)
                        ) : (
                          <Empty
                            title="No supporting documents"
                            detail="Upload a source document or record the accepted quantity."
                          />
                        )}
                        <button className="upload-inline" onClick={() => onModal('upload')}>
                          <Upload size={15} />
                          Add supporting document
                          <Plus size={15} />
                        </button>
                      </section>

                      <div className="record-column">
                        <section className="matching-panel">
                          <div className="section-title compact">
                            <div>
                              <span className="section-index">02</span>
                              <h3>Record comparison</h3>
                            </div>
                            <span className="subtle-label">USD</span>
                          </div>
                          <div className="matching-table">
                            <div className="matching-row matching-labels">
                              <span>RECORD</span>
                              <span>UNITS</span>
                              <span>VALUE</span>
                            </div>
                            <button
                              className="matching-row"
                              onClick={() => {
                                const document = selected.documents.find(
                                  (entry) => entry.kind === 'purchase_order',
                                );
                                if (document) onDocument(document.id);
                              }}
                            >
                              <span>
                                <FileText size={15} />
                                Purchase order
                              </span>
                              <span>{selected.orderedUnits}</span>
                              <span>{money(selected.orderedUnits * selected.unitPriceCents)}</span>
                            </button>
                            <button
                              className="matching-row"
                              onClick={() => {
                                const document = selected.documents.find(
                                  (entry) => entry.kind === 'invoice',
                                );
                                if (document) onDocument(document.id);
                              }}
                            >
                              <span>
                                <FileText size={15} />
                                Invoice
                              </span>
                              <span>{selected.invoicedUnits}</span>
                              <span>{money(sum.grossCents)}</span>
                            </button>
                            <button
                              className="matching-row received-row"
                              onClick={() => {
                                const document = [...selected.documents]
                                  .reverse()
                                  .find((entry) => entry.kind === 'receipt');
                                if (document) onDocument(document.id);
                              }}
                            >
                              <span>
                                <PackageCheck size={15} />
                                Accepted receipts
                              </span>
                              <span>{sum.receivedUnits}</span>
                              <span>{money(sum.receivedCents)}</span>
                            </button>
                            {selected.credits.length > 0 && (
                              <div className="matching-row credit-row">
                                <span>
                                  <FileCheck2 size={15} />
                                  Supplier credit
                                </span>
                                <span>{sum.pendingCreditCents > 0 ? 'Pending' : 'Applied'}</span>
                                <span>
                                  −
                                  {money(
                                    selected.credits.reduce(
                                      (total, credit) => total + credit.amountCents,
                                      0,
                                    ),
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                          <div className="match-footer">
                            <span>
                              <ShieldCheck size={14} />
                              Quantity matching policy
                            </span>
                            <button
                              onClick={() => onModal('receipt')}
                              disabled={!!busy || selected.status === 'resolved'}
                            >
                              <Plus size={15} />
                              Add receipt
                            </button>
                          </div>
                        </section>

                        <section className="resolution-panel">
                          <div className="section-title compact">
                            <div>
                              <span className="section-index">03</span>
                              <h3>
                                {selected.status === 'resolved'
                                  ? 'Resolution'
                                  : 'Approval & execution'}
                              </h3>
                            </div>
                            {selected.status === 'resolved' && <CheckCheck size={17} />}
                          </div>
                          <div className="resolution-body">
                            {selected.status === 'resolved' ? (
                              <>
                                <h4>Ready for export</h4>
                                <p>
                                  The invoice and applied credit match the accepted goods. No
                                  payment has been made.
                                </p>
                                <div className="resolution-equation">
                                  <span>Original invoice</span>
                                  <strong>{money(sum.grossCents)}</strong>
                                  <span>Applied credit</span>
                                  <strong>−{money(selected.appliedCreditCents)}</strong>
                                  <span className="equation-total">Reconciled amount</span>
                                  <strong className="equation-total">{money(sum.netCents)}</strong>
                                </div>
                                <a
                                  className="button primary full"
                                  href={`/api/cases/${selected.id}/export?format=csv`}
                                  download
                                >
                                  <ArrowDownToLine size={16} />
                                  Export reconciliation
                                </a>
                              </>
                            ) : (
                              <>
                                <div className="decision-intro">
                                  <h4>
                                    {sum.pendingCreditCents > 0
                                      ? 'Apply supplier credit'
                                      : selected.status === 'queued'
                                        ? 'Applying approved changes'
                                        : selected.status === 'on_hold'
                                          ? 'Hold recorded'
                                          : activeProposal
                                            ? 'Ready for review'
                                            : 'Proposed ledger change'}
                                  </h4>
                                  <span className="decision-state">
                                    {selected.status === 'queued'
                                      ? 'IN PROGRESS'
                                      : selected.status === 'on_hold'
                                        ? 'VERIFIED'
                                        : 'REVIEW REQUIRED'}
                                  </span>
                                </div>
                                <div className="ledger-delta">
                                  <div>
                                    <span>HELD NOW</span>
                                    <strong>{money(selected.heldCents)}</strong>
                                  </div>
                                  <ArrowRight size={20} />
                                  <div>
                                    <span>
                                      {selected.status === 'on_hold'
                                        ? 'CURRENT GAP'
                                        : 'AFTER APPROVAL'}
                                    </span>
                                    <strong>{money(nextHold)}</strong>
                                  </div>
                                </div>
                                {sum.pendingCreditCents > 0 && (
                                  <div className="credit-pending">
                                    <FileCheck2 size={15} />
                                    <span>
                                      {money(sum.pendingCreditCents)} supplier credit awaiting
                                      approval
                                    </span>
                                  </div>
                                )}
                                <p>
                                  {selected.status === 'queued'
                                    ? 'The worker will apply this approved change and verify the resulting records.'
                                    : selected.status === 'on_hold'
                                      ? 'Follow up with the supplier. Record a credit or updated receipt when it arrives.'
                                      : 'Review the exact change against the current sources. No ledger write happens before approval.'}
                                </p>
                                {selected.status === 'queued' ? (
                                  <div className="processing-label">
                                    <LoaderCircle size={16} className="spin" />
                                    Waiting for verified execution
                                  </div>
                                ) : activeProposal ? (
                                  <button
                                    className="button primary full"
                                    onClick={() => onReview(activeProposal)}
                                  >
                                    Review changes
                                    <ArrowRight size={16} />
                                  </button>
                                ) : (
                                  <button
                                    className="button primary full"
                                    onClick={onPropose}
                                    disabled={!!busy}
                                  >
                                    {busy === 'propose' ? (
                                      <LoaderCircle size={16} className="spin" />
                                    ) : (
                                      <ListChecks size={16} />
                                    )}
                                    Prepare action plan
                                  </button>
                                )}
                                <button
                                  className="button secondary full"
                                  onClick={() => onModal('credit')}
                                  disabled={!!busy}
                                >
                                  <Plus size={16} />
                                  Record supplier credit
                                </button>
                              </>
                            )}
                            <div className="resolution-footnote">
                              <ShieldCheck size={14} />
                              <span>Approval binds to the source and ledger revisions.</span>
                            </div>
                          </div>
                          {selected.proposals.length > 0 && (
                            <div className="previous-proposals">
                              <button onClick={onToggleOld}>
                                <History size={15} />
                                Previous proposals<span>{selected.proposals.length}</span>
                                <ChevronDown
                                  size={15}
                                  className={showOldProposals ? 'rotated' : ''}
                                />
                              </button>
                              {showOldProposals &&
                                [...selected.proposals].reverse().map((proposal) => (
                                  <button
                                    className="old-proposal"
                                    key={proposal.id}
                                    onClick={() => onReview({ ...proposal })}
                                  >
                                    <span>
                                      Revision {proposal.sourceRevision}
                                      <small>
                                        {proposal.type === 'hold' ? 'Hold' : 'Reconcile'} ·{' '}
                                        {proposal.status}
                                      </small>
                                    </span>
                                    <strong>{money(proposal.amountCents)}</strong>
                                    <ArrowUpRight size={14} />
                                  </button>
                                ))}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>
                    {selected.tasks.length > 0 && (
                      <section className="tasks-panel">
                        <div className="section-title compact">
                          <div>
                            <h3>Follow-up work</h3>
                            <span className="count-badge">{selected.tasks.length}</span>
                          </div>
                          <button className="text-button" onClick={() => onModal('assign')}>
                            <Users size={15} />
                            Assign
                          </button>
                        </div>
                        {selected.tasks.map((task) => (
                          <div className="task-row" key={task.id}>
                            <span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>
                              {task.status === 'done' ? <Check size={12} /> : null}
                            </span>
                            <div>
                              <strong>{task.title}</strong>
                              <span>{task.owner || 'Unassigned'}</span>
                            </div>
                            <span className="subtle-label">
                              {task.status === 'done' ? 'Complete' : 'Open'}
                            </span>
                          </div>
                        ))}
                      </section>
                    )}
                  </>
                ) : (
                  renderActivity(selected)
                )}
                <div className="case-footer">
                  <span>
                    <LockKeyhole size={13} />
                    Synthetic data · Internal ledger
                  </span>
                  <span>
                    Source r{selected.sourceRevision}
                    <span className="footer-separator">/</span>Ledger r{selected.ledgerRevision}
                  </span>
                </div>
              </section>
            ) : (
              <section className="empty-workspace surface">
                <Empty
                  title="No case selected"
                  detail="Create an invoice case or select one from the queue."
                />
                <button className="button primary" onClick={() => onModal('create')}>
                  <Plus size={16} />
                  Create case
                </button>
              </section>
            )}
          </div>
        )}
      </main>
    </>
  );
}
