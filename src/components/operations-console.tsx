'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  History,
  House,
  Inbox,
  Info,
  ListChecks,
  LoaderCircle,
  LockKeyhole,
  LogOut,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import type { CaseDocument, CaseRecord, Proposal, WorkspaceResponse } from '@/lib/types';
type Modal = 'receipt' | 'credit' | 'create' | 'upload' | 'assign' | 'policy' | 'reset' | null;
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
export type CaseTab = 'overview' | 'documents' | 'activity';
interface ConsoleProps {
  onGuide: () => void;
  onEndSession: () => void;
  guideVisible: boolean;
  onHideGuide: () => void;
  workspace: WorkspaceResponse | null;
  selected: CaseRecord | null;
  visibleCases: CaseRecord[];
  caseTotals: Totals | null;
  totalDiscrepancy: number;
  view: 'desk' | 'activity';
  onView: (v: 'desk' | 'activity') => void;
  search: string;
  onSearch: (v: string) => void;
  filter: string;
  onFilter: (v: string) => void;
  busy: string;
  notice: { kind: 'success' | 'error' | 'info'; message: string } | null;
  dismissNotice: () => void;
  onModal: (m: Modal) => void;
  onRefresh: () => void;
  onSelect: (c: CaseRecord) => void;
  mobileCase: boolean;
  onBack: () => void;
  tab: CaseTab;
  onTab: (t: CaseTab) => void;
  currentDocument?: CaseDocument;
  onDocument: (id: string | null) => void;
  renderEvidence: (d: CaseDocument) => ReactNode;
  renderActivity: (c: CaseRecord) => ReactNode;
  activeProposal: Proposal | null | undefined;
  onReview: (p: Proposal) => void;
  onPropose: () => void;
  showOldProposals: boolean;
  onToggleOld: () => void;
}
const money = (n: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100);
const labels = {
  needs_review: 'Needs review',
  awaiting_approval: 'Awaiting approval',
  queued: 'Processing',
  on_hold: 'On hold',
  resolved: 'Resolved',
};
const kinds = {
  purchase_order: 'Purchase order',
  invoice: 'Invoice',
  receipt: 'Goods receipt',
  credit: 'Supplier credit',
};
const stamp = (s: string) =>
  new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(s));
const gap = (c: CaseRecord) =>
  Math.max(
    0,
    c.invoicedUnits * c.unitPriceCents -
      c.receipts.reduce((n, r) => n + r.quantity * c.unitPriceCents, 0) -
      c.appliedCreditCents,
  );
function Status({ status }: { status: CaseRecord['status'] }) {
  return (
    <span className={'status-badge status-' + status}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}
export function Pagination({
  label,
  page,
  count,
  size,
  onPage,
}: {
  label: string;
  page: number;
  count: number;
  size: number;
  onPage: (p: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(count / size));
  return (
    <nav className="pagination" aria-label={label}>
      <span>
        {count
          ? `${page * size + 1}–${Math.min(count, (page + 1) * size)} of ${count}`
          : '0 records'}
      </span>
      <div>
        <button aria-label="Previous page" disabled={page === 0} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={16} />
        </button>
        <span>
          {page + 1} / {pages}
        </span>
        <button
          aria-label="Next page"
          disabled={page >= pages - 1}
          onClick={() => onPage(page + 1)}
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
export function HelpDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    return () => d?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog console-dialog"
      aria-labelledby="console-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="dialog-header">
        <h2 id="console-dialog-title">{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <X size={18} />
        </button>
      </div>
      <div className="dialog-body">
        <div className="dialog-scroll">{children}</div>
        <div className="dialog-actions">
          <button className="button secondary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </dialog>
  );
}
export function OperationsConsole(p: ConsoleProps) {
  const { selected: c, caseTotals: t, workspace, visibleCases, tab, currentDocument, busy } = p;
  const [queuePage, setQueuePage] = useState(0),
    [eventPage, setEventPage] = useState(0),
    [documentPage, setDocumentPage] = useState(0),
    [proposalPage, setProposalPage] = useState(0),
    [taskPage, setTaskPage] = useState(0);
  const [help, setHelp] = useState<'guide' | 'details' | 'tasks' | null>(null);
  const documentTrigger = useRef<HTMLButtonElement | null>(null);
  const cases = workspace?.cases || [],
    events = cases
      .flatMap((record) => record.history.map((event) => ({ ...event, record })))
      .sort((a, b) => b.at.localeCompare(a.at));
  const qPage = Math.min(queuePage, Math.max(0, Math.ceil(visibleCases.length / 3) - 1)),
    ePage = Math.min(eventPage, Math.max(0, Math.ceil(events.length / 5) - 1)),
    dPage = Math.min(documentPage, Math.max(0, Math.ceil((c?.documents.length || 0) / 3) - 1));
  const proposals = [...(c?.proposals || [])].reverse(),
    prPage = Math.min(proposalPage, Math.max(0, Math.ceil(proposals.length / 3) - 1));
  const stale = c?.proposals.at(-1)?.status === 'stale' ? c.proposals.at(-1)! : null,
    nextHold = t
      ? (p.activeProposal?.amountCents ?? Math.max(0, t.discrepancyCents - t.pendingCreditCents))
      : 0;
  useEffect(() => setQueuePage(0), [p.search, p.filter]);
  useEffect(() => {
    setDocumentPage(0);
    setProposalPage(0);
    setHelp(null);
    setTaskPage(0);
    documentTrigger.current = null;
  }, [c?.id]);
  useEffect(() => {
    const i = c?.documents.findIndex((d) => d.id === currentDocument?.id) ?? -1;
    if (i >= 0) setDocumentPage(Math.floor(i / 3));
  }, [currentDocument?.id, c?.id]);
  const source = (kind: CaseDocument['kind']) => {
    const d = [...(c?.documents || [])].reverse().find((d) => d.kind === kind);
    p.onTab('documents');
    p.onDocument(d?.id || null);
  };
  const closeSource = () => {
    const id = currentDocument?.id;
    const index = c?.documents.findIndex((document) => document.id === id) ?? -1;
    if (index >= 0) setDocumentPage(Math.floor(index / 3));
    p.onDocument(null);
    requestAnimationFrame(() => {
      const trigger = documentTrigger.current;
      if (trigger?.isConnected && trigger.dataset.documentId === id) trigger.focus();
      else
        [...document.querySelectorAll<HTMLButtonElement>('button[data-document-id]')]
          .find((button) => button.dataset.documentId === id)
          ?.focus();
    });
  };
  const guideText = !c?.proposals.length
    ? 'Prepare the original $800 proposal and inspect it. Close the review, then open Documents and upload the sample late receipt.'
    : t?.receivedUnits === 100
      ? 'Upload RCV-2042 from the sample files in the upload dialog. It records 10 additional accepted units.'
      : stale
        ? 'The receipt changed the gap from $800 to $400. Review the earlier proposal and attempt approval to see the stale-source check.'
        : t && t.pendingCreditCents > 0
          ? 'Prepare a correction, inspect the verified credit and hold release, then approve. The remaining purchase-order quantity stays open.'
          : c?.status === 'resolved'
            ? 'The invoice exception is resolved at $4,400. Ten units remain open on the purchase order. Export the record to inspect its history.'
            : c?.heldCents
              ? 'The $400 hold is recorded. Upload sample supplier credit CN-8821-01. Applying it requires a new approval.'
              : 'Prepare and approve the current $400 hold. Check its execution receipt in Activity.';
  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to workspace
      </a>
      <header className="appbar">
        <button className="wordmark" aria-label="Shortfall home" onClick={p.onGuide}>
          <span className="wordmark-symbol" aria-hidden="true">
            <span />
            <span />
          </span>
          Shortfall<span className="product-area">Payables</span>
        </button>
        <nav className="main-nav" aria-label="Main navigation">
          <button className={p.view === 'desk' ? 'active' : ''} onClick={() => p.onView('desk')}>
            <Inbox size={16} />
            Exceptions
          </button>
          <button
            className={p.view === 'activity' ? 'active' : ''}
            onClick={() => p.onView('activity')}
          >
            <History size={16} />
            Activity
          </button>
          <button onClick={() => p.onModal('policy')}>
            <Settings2 size={16} />
            Policy
          </button>
          <button onClick={p.onGuide}>
            <House size={16} />
            Home
          </button>
        </nav>
        <div className="appbar-end">
          <span className="sample-label">
            <LockKeyhole size={12} />
            Synthetic workspace · Internal ledger
          </span>
          <button
            className="icon-button"
            aria-label="Reset sample workspace"
            onClick={() => p.onModal('reset')}
          >
            <RefreshCw size={16} />
          </button>
          <button className="session-control" onClick={p.onEndSession} disabled={!!busy}>
            <LogOut size={15} />
            End session
          </button>
        </div>
      </header>
      <main className="main" id="main-content" tabIndex={-1}>
        <div className="page-header">
          <h1>{p.view === 'desk' ? 'The exception desk' : 'Workspace activity'}</h1>
          <div className="workspace-summary">
            <span>{cases.length} cases</span>
            <span>
              <strong>{money(p.totalDiscrepancy)}</strong> unreconciled
            </span>
          </div>
          <button className="button primary new-case" onClick={() => p.onModal('create')}>
            <Plus size={15} />
            New case
          </button>
        </div>
        {p.notice && (
          <div
            className={'notice notice-' + p.notice.kind}
            role={p.notice.kind === 'error' ? 'alert' : 'status'}
          >
            <CircleAlert size={15} />
            <span>{p.notice.message}</span>
            <button
              className="icon-button"
              aria-label="Dismiss notification"
              onClick={p.dismissNotice}
            >
              <X size={15} />
            </button>
          </div>
        )}
        {p.view === 'activity' ? (
          <section className="global-activity surface">
            <div className="section-title">
              <h2>Recorded events</h2>
              <button className="button secondary small" onClick={p.onRefresh}>
                <RefreshCw size={14} />
                Refresh
              </button>
            </div>
            <div className="global-event-list">
              {events.slice(ePage * 5, ePage * 5 + 5).map((e) => (
                <button
                  className="global-event"
                  key={e.record.id + '-' + e.id}
                  data-event-id={e.id}
                  onClick={() => {
                    p.onSelect(e.record);
                    p.onView('desk');
                    p.onTab('activity');
                  }}
                >
                  <div>
                    <strong>{e.title}</strong>
                    <span>
                      {e.record.supplier} · {e.record.invoiceNumber}
                    </span>
                  </div>
                  <span className="event-actor">{e.actor}</span>
                  <time>{stamp(e.at)}</time>
                  <ArrowUpRight size={15} />
                </button>
              ))}
              {!events.length && <div className="empty-state">No recorded events yet.</div>}
            </div>
            <Pagination
              label="Workspace activity pagination"
              page={ePage}
              count={events.length}
              size={5}
              onPage={setEventPage}
            />
          </section>
        ) : (
          <div className={'desk-layout ' + (p.mobileCase ? 'show-case' : '')}>
            <section className="queue surface" aria-label="Invoice exception queue">
              <div className="queue-heading">
                <h2>
                  Cases <span className="count-badge">{visibleCases.length}</span>
                </h2>
                <button className="icon-button" aria-label="Refresh cases" onClick={p.onRefresh}>
                  <RefreshCw size={15} />
                </button>
              </div>
              <div className="queue-tools">
                <label className="search-field">
                  <Search size={15} />
                  <input
                    aria-label="Search cases"
                    placeholder="Supplier or invoice"
                    value={p.search}
                    onChange={(e) => p.onSearch(e.target.value)}
                  />
                </label>
                <select
                  aria-label="Filter case status"
                  value={p.filter}
                  onChange={(e) => p.onFilter(e.target.value)}
                >
                  <option value="all">All cases</option>
                  <option value="open">Open cases</option>
                  <option value="awaiting_approval">Awaiting approval</option>
                  <option value="on_hold">On hold</option>
                  <option value="resolved">Resolved</option>
                </select>
              </div>
              <div className="case-list">
                {visibleCases.slice(qPage * 3, qPage * 3 + 3).map((r) => (
                  <button
                    key={r.id}
                    data-case-id={r.id}
                    className={'case-row ' + (c?.id === r.id ? 'selected' : '')}
                    aria-pressed={c?.id === r.id}
                    onClick={() => p.onSelect(r)}
                  >
                    <div className="case-row-top">
                      <span className="case-supplier">{r.supplier}</span>
                      <strong>{money(gap(r))}</strong>
                    </div>
                    <div className="case-row-reference">
                      <span>{r.invoiceNumber}</span>
                      <Status status={r.status} />
                    </div>
                  </button>
                ))}
                {!visibleCases.length && (
                  <div className="empty-state">No matching cases. Change the search or filter.</div>
                )}
              </div>
              <Pagination
                label="Case queue pagination"
                page={qPage}
                count={visibleCases.length}
                size={3}
                onPage={setQueuePage}
              />
            </section>
            {c && t ? (
              <section
                className={'case-workspace surface case-tab-' + tab}
                aria-label={'Case ' + c.invoiceNumber}
              >
                <button className="back-to-queue" onClick={p.onBack}>
                  <ArrowLeft size={15} />
                  Back to cases
                </button>
                <div className="case-header">
                  <div>
                    <h2>{c.supplier}</h2>
                    <span className="case-reference">
                      {c.invoiceNumber} · {c.poNumber} · Source r{c.sourceRevision}
                    </span>
                  </div>
                  <div className="case-header-actions">
                    <Status status={c.status} />
                    <button
                      className="icon-button"
                      aria-label="Case details and assignment"
                      onClick={() => setHelp('details')}
                    >
                      <Info size={17} />
                    </button>
                  </div>
                </div>
                <div className="case-tabs">
                  <div role="tablist" aria-label="Case details">
                    {(['overview', 'documents', 'activity'] as CaseTab[]).map((v) => (
                      <button
                        key={v}
                        role="tab"
                        aria-selected={tab === v}
                        className={tab === v ? 'active' : ''}
                        onClick={() => p.onTab(v)}
                      >
                        {v === 'overview'
                          ? 'Overview'
                          : v === 'documents'
                            ? 'Documents'
                            : 'Activity'}
                        {v === 'documents' && <span>{c.documents.length}</span>}
                      </button>
                    ))}
                  </div>
                  <a
                    className="export-link"
                    href={'/api/cases/' + c.id + '/export?format=json'}
                    download
                  >
                    <ArrowDownToLine size={14} />
                    Export
                  </a>
                </div>
                {tab === 'overview' ? (
                  <div className="case-overview">
                    <div
                      className={
                        'discrepancy-banner ' + (c.status === 'resolved' ? 'is-resolved' : '')
                      }
                    >
                      <div>
                        <span>Invoiced</span>
                        <strong>{money(t.grossCents)}</strong>
                        <small>
                          {c.invoicedUnits} units × {money(c.unitPriceCents)}
                        </small>
                      </div>
                      <div>
                        <span>Accepted</span>
                        <strong>{money(t.receivedCents)}</strong>
                        <small>{t.receivedUnits} units received</small>
                      </div>
                      <div className="gap-summary">
                        <span>{c.status === 'resolved' ? 'Reconciled' : 'Unreconciled'}</span>
                        <strong>
                          {c.status === 'resolved'
                            ? money(t.netCents) + ' reconciled'
                            : money(t.discrepancyCents)}
                        </strong>
                        <small>
                          {c.status === 'resolved'
                            ? t.openPoUnits + ' units remain open on the purchase order.'
                            : t.missingUnits + ' units not yet received'}
                        </small>
                      </div>
                    </div>
                    {stale && (
                      <div className="revision-signal">
                        <span>
                          <strong>Evidence changed.</strong> <s>{money(stale.amountCents)}</s>
                          <ArrowRight size={13} />
                          {money(nextHold)} current hold
                        </span>
                        <button onClick={() => p.onReview(stale)}>
                          Review previous proposal
                          <ArrowUpRight size={13} />
                        </button>
                      </div>
                    )}
                    <div className="overview-grid">
                      <section className="matching-panel">
                        <div className="section-title">
                          <h3>Record comparison</h3>
                          <span>Units · USD</span>
                        </div>
                        <div className="matching-table">
                          {(
                            [
                              {
                                kind: 'purchase_order',
                                label: 'Purchase order',
                                units: c.orderedUnits,
                                amount: c.orderedUnits * c.unitPriceCents,
                              },
                              {
                                kind: 'invoice',
                                label: 'Invoice',
                                units: c.invoicedUnits,
                                amount: t.grossCents,
                              },
                              {
                                kind: 'receipt',
                                label: 'Accepted receipts',
                                units: t.receivedUnits,
                                amount: t.receivedCents,
                              },
                            ] as const
                          ).map((r) => (
                            <button
                              className={
                                'matching-row ' + (r.kind === 'receipt' ? 'received-row' : '')
                              }
                              key={r.kind}
                              onClick={() => source(r.kind)}
                            >
                              <span>
                                {r.label}
                                <ArrowUpRight size={11} />
                              </span>
                              <span>{r.units}</span>
                              <span>{money(r.amount)}</span>
                            </button>
                          ))}
                          {c.credits.length > 0 && (
                            <button
                              className="matching-row credit-row"
                              onClick={() => source('credit')}
                            >
                              <span>Supplier credit</span>
                              <span>{t.pendingCreditCents ? 'Pending' : 'Applied'}</span>
                              <span>
                                −{money(c.credits.reduce((n, x) => n + x.amountCents, 0))}
                              </span>
                            </button>
                          )}
                        </div>
                        <div className="match-footer">
                          <button
                            onClick={() => p.onModal('receipt')}
                            disabled={!!busy || c.status === 'resolved'}
                          >
                            <Plus size={14} />
                            Add receipt
                          </button>
                          <button
                            onClick={() => p.onModal('upload')}
                            aria-label="Upload supporting document"
                          >
                            <Upload size={14} />
                            Upload evidence
                          </button>
                        </div>
                      </section>
                      <section className="resolution-panel">
                        {p.showOldProposals ? (
                          <div className="previous-proposals">
                            <div className="section-title">
                              <h3>Previous proposals</h3>
                              <button
                                className="icon-button"
                                aria-label="Back to current action"
                                onClick={p.onToggleOld}
                              >
                                <X size={16} />
                              </button>
                            </div>
                            {proposals.slice(prPage * 3, prPage * 3 + 3).map((r) => (
                              <button
                                className="old-proposal"
                                key={r.id}
                                onClick={() => p.onReview({ ...r })}
                              >
                                <span>
                                  Revision {r.sourceRevision}
                                  <small>
                                    {r.type === 'hold' ? 'Hold' : 'Reconcile'} · {r.status}
                                  </small>
                                </span>
                                <strong>{money(r.amountCents)}</strong>
                                <ArrowUpRight size={14} />
                              </button>
                            ))}
                            <Pagination
                              label="Proposal history pagination"
                              page={prPage}
                              count={proposals.length}
                              size={3}
                              onPage={setProposalPage}
                            />
                          </div>
                        ) : (
                          <>
                            <div className="section-title">
                              <h3>
                                {c.status === 'resolved'
                                  ? 'Resolution'
                                  : t.pendingCreditCents
                                    ? 'Credit ready for review'
                                    : c.status === 'on_hold'
                                      ? 'Hold recorded'
                                      : 'Next action'}
                              </h3>
                              <span>
                                {c.status === 'queued'
                                  ? 'Processing'
                                  : c.status === 'resolved'
                                    ? 'Verified'
                                    : 'Approval required'}
                              </span>
                            </div>
                            <div className="resolution-body">
                              {c.status === 'resolved' ? (
                                <>
                                  <div className="resolved-summary">
                                    <CheckCheck size={22} />
                                    <strong>{money(t.netCents)}</strong>
                                    <span>Invoice exception resolved</span>
                                  </div>
                                  <p>The remaining order stays open. No payment was made.</p>
                                  <a
                                    className="button primary full"
                                    href={'/api/cases/' + c.id + '/export?format=csv'}
                                    download
                                  >
                                    <ArrowDownToLine size={15} />
                                    Export reconciliation
                                  </a>
                                </>
                              ) : (
                                <>
                                  <div className="ledger-delta">
                                    <div>
                                      <span>Held now</span>
                                      <strong>{money(c.heldCents)}</strong>
                                    </div>
                                    <ArrowRight size={17} />
                                    <div>
                                      <span>
                                        {c.status === 'on_hold' ? 'Current gap' : 'After approval'}
                                      </span>
                                      <strong>{money(nextHold)}</strong>
                                    </div>
                                  </div>
                                  {c.status === 'queued' ? (
                                    <div className="processing-label">
                                      <LoaderCircle size={16} className="spin" />
                                      {workspace?.service.workerOnline
                                        ? 'Verifying execution'
                                        : 'Waiting for worker'}
                                    </div>
                                  ) : c.status === 'on_hold' && !t.pendingCreditCents ? (
                                    <button
                                      className="button primary full"
                                      onClick={() => p.onModal('credit')}
                                    >
                                      <Plus size={15} />
                                      Record supplier credit
                                    </button>
                                  ) : (
                                    <button
                                      className="button primary full"
                                      onClick={() =>
                                        p.activeProposal
                                          ? p.onReview(p.activeProposal)
                                          : p.onPropose()
                                      }
                                      disabled={!!busy}
                                    >
                                      {busy === 'propose' ? (
                                        <LoaderCircle size={15} className="spin" />
                                      ) : (
                                        <ListChecks size={15} />
                                      )}
                                      {p.activeProposal ? 'Review proposal' : 'Prepare resolution'}
                                    </button>
                                  )}
                                </>
                              )}
                            </div>
                          </>
                        )}
                      </section>
                    </div>
                    <div className="overview-tools">
                      {!(c.status === 'on_hold' && !t.pendingCreditCents) && (
                        <button
                          onClick={() => p.onModal('credit')}
                          disabled={!!busy || c.status === 'resolved'}
                        >
                          <Plus size={13} />
                          Record supplier credit
                        </button>
                      )}
                      {proposals.length > 0 && (
                        <button onClick={p.onToggleOld}>
                          <History size={13} />
                          Previous proposals<span>{proposals.length}</span>
                        </button>
                      )}
                      {c.tasks.length > 0 && (
                        <button onClick={() => setHelp('tasks')}>
                          <Users size={13} />
                          Follow-up work<span>{c.tasks.length}</span>
                        </button>
                      )}
                      <button onClick={() => setHelp('guide')}>
                        <Info size={13} />
                        {p.guideVisible && c.poNumber === 'PO-1042'
                          ? 'Guided case'
                          : 'Workflow guide'}
                      </button>
                    </div>
                  </div>
                ) : tab === 'documents' ? (
                  <div className={'documents-workspace ' + (currentDocument ? 'source-open' : '')}>
                    <section className="document-index" aria-label="Case documents">
                      <div className="section-title">
                        <h3>Documents</h3>
                        <button
                          className="button secondary small"
                          aria-label="Upload supporting document"
                          onClick={() => p.onModal('upload')}
                        >
                          <Upload size={14} />
                          Upload
                        </button>
                      </div>
                      <div className="document-list">
                        {c.documents.slice(dPage * 3, dPage * 3 + 3).map((d) => (
                          <button
                            key={d.id}
                            data-document-id={d.id}
                            className={
                              'document-choice ' + (currentDocument?.id === d.id ? 'active' : '')
                            }
                            onClick={(e) => {
                              documentTrigger.current = e.currentTarget;
                              p.onDocument(d.id);
                            }}
                          >
                            <FileText size={18} />
                            <span>
                              <strong>{kinds[d.kind]}</strong>
                              <small>{d.reference}</small>
                            </span>
                            {d.status === 'pending' ? (
                              <LoaderCircle size={15} className="spin" />
                            ) : d.status === 'needs_review' ? (
                              <CircleAlert size={15} />
                            ) : (
                              <ChevronRight size={15} />
                            )}
                          </button>
                        ))}
                      </div>
                      <Pagination
                        label="Documents pagination"
                        page={dPage}
                        count={c.documents.length}
                        size={3}
                        onPage={setDocumentPage}
                      />
                    </section>
                    <section className="evidence-panel" aria-label="Source reader">
                      {currentDocument ? (
                        <>
                          <div className="source-reader-title">
                            <h3>{kinds[currentDocument.kind]}</h3>
                            <button className="text-button" onClick={closeSource}>
                              <ArrowLeft size={14} />
                              Close source
                            </button>
                          </div>
                          {p.renderEvidence(currentDocument)}
                        </>
                      ) : (
                        <div className="source-empty">
                          <FileText size={28} />
                          <h3>Choose a source document</h3>
                          <p>Open a record to read its text and inspect supporting quotes.</p>
                        </div>
                      )}
                    </section>
                  </div>
                ) : (
                  p.renderActivity(c)
                )}
              </section>
            ) : (
              <section className="empty-workspace surface">
                <Inbox size={27} />
                <h2>No case selected</h2>
                <button className="button primary" onClick={() => p.onModal('create')}>
                  Create a case
                </button>
              </section>
            )}
          </div>
        )}
      </main>
      {help && c && t && (
        <HelpDialog
          title={
            help === 'guide'
              ? 'Workflow guide'
              : help === 'details'
                ? 'Case details'
                : 'Follow-up work'
          }
          onClose={() => setHelp(null)}
        >
          {help === 'guide' ? (
            <>
              <p>
                {c.poNumber === 'PO-1042'
                  ? guideText
                  : 'Compare the invoice and accepted receipts, inspect source evidence in Documents, then review and approve the proposed change. New evidence invalidates older proposals.'}
              </p>
              <ol className="help-steps">
                <li>Inspect source records in Documents.</li>
                <li>Prepare and review the current proposal.</li>
                <li>Approve, then verify execution in Activity.</li>
              </ol>
              <p className="form-note">
                Uploaded records use the configured extraction service. Seeded records are synthetic
                manual values.
              </p>
            </>
          ) : help === 'details' ? (
            <>
              <dl className="case-details-list">
                <div>
                  <dt>Supplier</dt>
                  <dd>{c.supplier}</dd>
                </div>
                <div>
                  <dt>Invoice / order</dt>
                  <dd>
                    {c.invoiceNumber} / {c.poNumber}
                  </dd>
                </div>
                <div>
                  <dt>Item</dt>
                  <dd>
                    {c.sku} · {c.description}
                  </dd>
                </div>
                <div>
                  <dt>Owner</dt>
                  <dd>{c.owner}</dd>
                </div>
                <div>
                  <dt>Reviewer</dt>
                  <dd>{c.reviewer}</dd>
                </div>
                <div>
                  <dt>Policy</dt>
                  <dd>USD · Exact whole-unit quantities</dd>
                </div>
              </dl>
              <button
                className="button secondary"
                onClick={() => {
                  setHelp(null);
                  p.onModal('assign');
                }}
              >
                <Users size={15} />
                Assign owner and reviewer
              </button>
            </>
          ) : (
            <>
              {c.tasks.slice(taskPage * 3, taskPage * 3 + 3).map((task) => (
                <div className="task-row" key={task.id}>
                  <span>
                    <strong>{task.title}</strong>
                    <small>{task.owner}</small>
                  </span>
                  <span>{task.status === 'done' ? 'Complete' : 'Open'}</span>
                </div>
              ))}
              <Pagination
                label="Follow-up work pagination"
                page={taskPage}
                count={c.tasks.length}
                size={3}
                onPage={setTaskPage}
              />
              <button
                className="button secondary"
                onClick={() => {
                  setHelp(null);
                  p.onModal('assign');
                }}
              >
                Assign owner and reviewer
              </button>
            </>
          )}
        </HelpDialog>
      )}
    </>
  );
}
