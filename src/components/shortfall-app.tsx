'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import {
  ArrowDownToLine, ArrowLeft, ArrowRight, ArrowUpRight, Check, CheckCheck, ChevronDown,
  ChevronRight, CircleAlert, Clock3, FileCheck2, FileText, History, Inbox, Layers3,
  ListChecks, LoaderCircle, LockKeyhole, PackageCheck, Plus, RefreshCw,
  Search, Settings2, ShieldCheck, Upload, Users, X,
} from 'lucide-react';
import type { CaseDocument, CaseRecord, DocumentKind, NewCaseInput, Proposal, WorkspaceResponse } from '@/lib/types';

type View = 'desk' | 'activity';
type ModalName = 'receipt' | 'credit' | 'create' | 'upload' | 'assign' | 'policy' | 'reset' | null;
type Notice = { kind: 'success' | 'error' | 'info'; message: string } | null;
const money = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents % 100 === 0 ? 0 : 2 }).format(cents / 100);
const date = (value: string) => new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
const time = (value: string) => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const initials = (name: string) => name.split(/\s+/).map((part) => part[0]).slice(0, 2).join('').toUpperCase();
const labels: Record<CaseRecord['status'], string> = { needs_review: 'Needs review', awaiting_approval: 'Awaiting approval', queued: 'Processing', on_hold: 'On hold', resolved: 'Resolved' };
const documentLabels: Record<DocumentKind, string> = { purchase_order: 'Purchase order', invoice: 'Invoice', receipt: 'Goods receipt', credit: 'Supplier credit' };
const fieldLabels: Record<string, string> = { quantity: 'Quantity', unitPriceCents: 'Unit price', totalCents: 'Total', sku: 'Item', supplier: 'Supplier', currency: 'Currency', poNumber: 'Purchase order', invoiceNumber: 'Invoice', reference: 'Reference' };
const fieldLabel = (field: string) => fieldLabels[field] || field.replace(/Cents$/, '').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').replace(/^./, (letter) => letter.toUpperCase());

function totals(c: CaseRecord) {
  const receivedUnits = c.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
  const grossCents = c.invoicedUnits * c.unitPriceCents;
  const receivedCents = receivedUnits * c.unitPriceCents;
  const netCents = grossCents - c.appliedCreditCents;
  const pendingCreditCents = c.credits.filter((credit) => !credit.applied).reduce((sum, credit) => sum + credit.amountCents, 0);
  return { receivedUnits, grossCents, receivedCents, netCents, pendingCreditCents, discrepancyCents: Math.max(0, netCents - receivedCents), missingUnits: Math.max(0, c.invoicedUnits - receivedUnits), openPoUnits: Math.max(0, c.orderedUnits - receivedUnits) };
}

class RequestError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...options, headers: { ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...options?.headers } });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new RequestError(payload.error || `Request failed (${response.status}). Please try again.`, response.status);
  return payload as T;
}

function Brand({ compact = false }: { compact?: boolean }) {
  return <div className={`brand ${compact ? 'brand-compact' : ''}`}><span className="brand-mark" aria-hidden="true"><span /><span /><span /></span><span>shortfall<span className="brand-period">.</span></span></div>;
}

function Badge({ status }: { status: CaseRecord['status'] }) {
  return <span className={`status-badge status-${status}`}><span className="status-dot" />{labels[status]}</span>;
}

function Dialog({ title, description, onClose, children, wide = false }: { title: string; description?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const el = ref.current; el?.showModal(); return () => el?.close(); }, []);
  return <dialog ref={ref} className={`dialog ${wide ? 'dialog-wide' : ''}`} onCancel={(event) => { event.preventDefault(); onClose(); }} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }} aria-labelledby="dialog-heading">
    <div className="dialog-header"><div><span className="eyebrow">SHORTFALL WORKSPACE</span><h2 id="dialog-heading">{title}</h2>{description && <p>{description}</p>}</div><button className="icon-button" onClick={onClose} aria-label="Close dialog"><X size={20} /></button></div>
    {children}
  </dialog>;
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function ShortfallApp() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const [selected, setSelected] = useState<CaseRecord | null>(null);
  const selectedId = useRef<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialError, setInitialError] = useState('');
  const [busy, setBusy] = useState('');
  const busyRef = useRef(false);
  const requestGeneration = useRef(0);
  const [view, setView] = useState<View>('desk');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [modal, setModal] = useState<ModalName>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [review, setReview] = useState<Proposal | null>(null);
  const [reviewError, setReviewError] = useState('');
  const [tab, setTab] = useState<'evidence' | 'activity'>('evidence');
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [evidenceIndex, setEvidenceIndex] = useState<number | null>(null);
  const [showOldProposals, setShowOldProposals] = useState(false);
  const [mobileCase, setMobileCase] = useState(false);
  const initialized = useRef(false);

  const replaceCase = useCallback((record: CaseRecord) => {
    if (selectedId.current === record.id) setSelected(record);
    setWorkspace((previous) => previous ? { ...previous, cases: previous.cases.some((c) => c.id === record.id) ? previous.cases.map((c) => c.id === record.id ? record : c) : [record, ...previous.cases] } : previous);
  }, []);

  const refresh = useCallback(async () => {
    const generation = requestGeneration.current;
    const data = await api<WorkspaceResponse>('/api/workspace');
    if (generation !== requestGeneration.current) return;
    data.cases.sort((a, b) => Number(a.status === 'resolved') - Number(b.status === 'resolved') || totals(b).discrepancyCents - totals(a).discrepancyCents);
    setWorkspace(data);
    const id = selectedId.current;
    if (id && data.cases.some((c) => c.id === id)) {
      const record = await api<CaseRecord>(`/api/cases/${id}`);
      if (selectedId.current === id && generation === requestGeneration.current) setSelected(record);
    } else if (data.cases[0]) {
      selectedId.current = data.cases[0].id;
      setSelected(data.cases[0]);
    } else { selectedId.current = null; setSelected(null); }
  }, []);

  const initialize = useCallback(async () => {
    setLoading(true); setInitialError('');
    try { await api('/api/session', { method: 'POST', body: '{}' }); await refresh(); }
    catch (error) { setInitialError(error instanceof Error ? error.message : 'Could not open your workspace.'); }
    finally { setLoading(false); }
  }, [refresh]);

  useEffect(() => { if (!initialized.current) { initialized.current = true; void initialize(); } }, [initialize]);
  const pending = workspace?.cases.some((c) => c.status === 'queued' || c.documents.some((d) => d.status === 'pending') || c.executions.some((e) => e.status === 'queued')) ?? false;
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => { if (!busyRef.current) void refresh().catch((error) => setNotice({ kind: 'error', message: error.message })); }, 2000);
    return () => clearInterval(interval);
  }, [pending, refresh]);
  useEffect(() => { if (notice?.kind !== 'success') return; const timeout = setTimeout(() => setNotice(null), 6000); return () => clearTimeout(timeout); }, [notice]);

  async function selectCase(record: CaseRecord) {
    if (busyRef.current) return;
    const generation = requestGeneration.current;
    selectedId.current = record.id; setSelected(record); setDocumentId(null); setEvidenceIndex(null); setShowOldProposals(false); setReview(null); setTab('evidence'); setMobileCase(true);
    try { const updated = await api<CaseRecord>(`/api/cases/${record.id}`); if (selectedId.current === record.id && generation === requestGeneration.current) setSelected(updated); }
    catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Could not refresh case.' }); }
  }

  async function action(payload: Record<string, unknown>, success?: string) {
    if (!selected || busyRef.current) return null;
    const id = selected.id;
    setBusy(String(payload.action)); busyRef.current = true; requestGeneration.current++; setNotice(null);
    try {
      const record = await api<CaseRecord>(`/api/cases/${id}/actions`, { method: 'POST', body: JSON.stringify(payload) });
      replaceCase(record); if (success) setNotice({ kind: 'success', message: success }); return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The action could not be completed.';
      setNotice({ kind: 'error', message });
      if (payload.action === 'approve') setReviewError(message);
      if (error instanceof RequestError && error.status === 409) await refresh().catch(() => {});
      return null;
    } finally { setBusy(''); busyRef.current = false; }
  }

  async function propose() {
    const record = await action({ action: 'propose' });
    if (record) { const latest = record.proposals.at(-1); if (latest) { setReview(latest); setReviewError(''); } }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) || '').trim();
    let record: CaseRecord | null = null;
    if (modal === 'receipt') record = await action({ action: 'receive', quantity: Number(value('quantity')), reference: value('reference'), expectedRevision: selected?.sourceRevision }, 'Receipt recorded. Review the updated discrepancy before approving changes.');
    if (modal === 'credit') record = await action({ action: 'credit', amountCents: Math.round(Number(value('amount')) * 100), reference: value('reference') }, 'Supplier credit recorded. A new reconciliation approval is required.');
    if (modal === 'assign') record = await action({ action: 'assign', owner: value('owner'), reviewer: value('reviewer') }, 'Case assignments updated.');
    if (record) setModal(null);
    if (modal === 'create') {
      setBusy('create'); busyRef.current = true; requestGeneration.current++;
      const input: NewCaseInput = { supplier: value('supplier'), poNumber: value('poNumber'), invoiceNumber: value('invoiceNumber'), sku: value('sku'), description: value('description'), orderedUnits: Number(value('orderedUnits')), invoicedUnits: Number(value('invoicedUnits')), receivedUnits: Number(value('receivedUnits')), unitPriceCents: Math.round(Number(value('unitPrice')) * 100) };
      try {
        const created = await api<CaseRecord>('/api/cases', { method: 'POST', body: JSON.stringify(input) });
        selectedId.current = created.id; setSelected(created); replaceCase(created); setModal(null); setDocumentId(null); setTab('evidence'); setMobileCase(true); setNotice({ kind: 'success', message: `${created.invoiceNumber} added to your workspace.` });
      } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Could not create the case.' }); }
      finally { setBusy(''); busyRef.current = false; }
    }
    if (modal === 'upload' && selected) {
      setBusy('upload'); busyRef.current = true; requestGeneration.current++;
      try {
        const updated = await api<CaseRecord>(`/api/cases/${selected.id}/documents`, { method: 'POST', body: form });
        replaceCase(updated); const uploaded = updated.documents.at(-1); if (uploaded) setDocumentId(uploaded.id); setEvidenceIndex(null); setModal(null); setNotice({ kind: 'info', message: 'Document received. Extraction status will update in the evidence list.' });
      } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Could not upload the document.' }); }
      finally { setBusy(''); busyRef.current = false; }
    }
  }

  const cases = workspace?.cases || [];
  const visibleCases = useMemo(() => cases.filter((c) => (filter === 'all' || (filter === 'open' ? c.status !== 'resolved' : c.status === filter)) && `${c.supplier} ${c.invoiceNumber} ${c.poNumber} ${c.sku}`.toLowerCase().includes(search.toLowerCase())), [cases, filter, search]);
  const totalDiscrepancy = cases.reduce((sum, c) => sum + (c.status === 'resolved' ? 0 : totals(c).discrepancyCents), 0);
  const awaitingCount = cases.filter((c) => c.status === 'awaiting_approval').length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;
  const selectedTotals = selected ? totals(selected) : null;
  const currentDocument = selected?.documents.find((d) => d.id === documentId) || selected?.documents.find((d) => d.kind === 'invoice') || selected?.documents[0];
  const latestProposal = selected?.proposals.at(-1);
  const activeProposal = latestProposal && latestProposal.status === 'pending' && latestProposal.sourceRevision === selected?.sourceRevision && latestProposal.ledgerRevision === selected?.ledgerRevision ? latestProposal : null;
  const allEvents = cases.flatMap((c) => c.history.map((event) => ({ ...event, supplier: c.supplier, caseRecord: c }))).sort((a, b) => b.at.localeCompare(a.at));

  if (loading || initialError) return <div className="boot-screen"><Brand /><div className="boot-content">{loading ? <><LoaderCircle className="spin" size={24} /><h1>Opening your workspace</h1><p>Preparing the exception desk and your sample records.</p></> : <><CircleAlert size={28} /><h1>We couldn’t open the desk.</h1><p>{initialError}</p><button className="button primary" onClick={() => void initialize()}><RefreshCw size={16} />Try again</button></>}</div><span className="boot-footer">FINANCE OPERATIONS, WITH THE EVIDENCE ATTACHED.</span></div>;

  return <div className="app-shell">
    <a href="#main-content" className="skip-link">Skip to workspace</a>
    <aside className="sidebar">
      <Brand />
      <div className="workspace-switch"><span className="workspace-avatar">S</span><div><strong>Operations workspace</strong><span>Private sample environment</span></div><LockKeyhole size={13} /></div>
      <span className="nav-label">WORKSPACE</span>
      <nav aria-label="Main navigation">
        <button className={`nav-item ${view === 'desk' ? 'active' : ''}`} onClick={() => setView('desk')}><Inbox size={18} /><span>Exception desk</span><span className="nav-count">{cases.filter((c) => c.status !== 'resolved').length}</span></button>
        <button className={`nav-item ${view === 'activity' ? 'active' : ''}`} onClick={() => setView('activity')}><History size={18} /><span>Activity log</span></button>
        <button className="nav-item" onClick={() => setModal('policy')}><Settings2 size={18} /><span>Workspace policy</span></button>
      </nav>
      <div className="sidebar-note"><span className="tiny-rule" /><p>Every decision.<br />The evidence behind it.</p><span>From discrepancy to resolution.</span></div>
      <div className="sidebar-bottom"><div className="environment-status"><span className={`service-dot ${workspace?.service.workerOnline ? 'online' : ''}`} />{workspace?.service.workerOnline ? 'Workflow worker online' : 'Worker not connected'}</div><button className="sidebar-reset" onClick={() => setModal('reset')}><RefreshCw size={13} />Reset sample workspace</button><div className="profile"><span className="profile-avatar">FO</span><div><strong>Finance operations</strong><span>Sample workspace</span></div><ChevronDown size={14} /></div></div>
    </aside>

    <main className="main" id="main-content">
      <div className="topbar"><div className="breadcrumbs"><span className="mobile-brand">shortfall.</span><span>Workspace</span><ChevronRight size={13} /><strong>{view === 'desk' ? 'Exception desk' : 'Activity log'}</strong></div><div className="workspace-tag"><span />Synthetic data · Internal ledger</div></div>
      <header className="page-header"><div><div className="eyebrow">ACCOUNTS PAYABLE / OPERATIONS</div><h1>{view === 'desk' ? 'The exception desk' : 'A record of the work'}</h1><p>{view === 'desk' ? 'See what doesn’t match. Resolve it with the evidence.' : 'Every receipt, decision, and verified change in one place.'}</p></div><button className="button primary" onClick={() => setModal('create')}><Plus size={17} />New case</button></header>

      {notice && !modal && !review && <div className={`notice notice-${notice.kind}`} role={notice.kind === 'error' ? 'alert' : 'status'}>{notice.kind === 'error' ? <CircleAlert size={17} /> : notice.kind === 'success' ? <CheckCheck size={17} /> : <Clock3 size={17} />}<span>{notice.message}</span><button className="icon-button" aria-label="Dismiss notification" onClick={() => setNotice(null)}><X size={16} /></button></div>}

      <section className="metrics-strip" aria-label="Workspace totals"><div className="metric"><div className="metric-heading"><span>Open discrepancies</span><span className="metric-glyph amber"><Layers3 size={17} /></span></div><div className="metric-value">{money(totalDiscrepancy)}<span className="metric-note">across {cases.filter((c) => c.status !== 'resolved').length} open cases</span></div></div><div className="metric"><div className="metric-heading"><span>Awaiting approval</span><span className="metric-glyph"><ListChecks size={17} /></span></div><div className="metric-value">{String(awaitingCount).padStart(2, '0')}<span className="metric-note">ready for a human decision</span></div></div><div className="metric"><div className="metric-heading"><span>Ready for export</span><span className="metric-glyph teal"><FileCheck2 size={17} /></span></div><div className="metric-value">{String(resolvedCount).padStart(2, '0')}<span className="metric-note">reconciled invoice exceptions</span></div></div></section>

      {view === 'activity' ? <section className="global-activity panel"><div className="section-title"><div><span className="eyebrow">WORKSPACE HISTORY</span><h2>Activity log <span className="count-badge">{allEvents.length}</span></h2></div><button className="button secondary small" onClick={() => void refresh().catch((e) => setNotice({ kind: 'error', message: e.message }))}><RefreshCw size={14} />Refresh</button></div>{allEvents.length ? allEvents.map((event) => <button className="global-event" key={`${event.caseRecord.id}-${event.id}`} onClick={() => { void selectCase(event.caseRecord); setView('desk'); setTab('activity'); }}><span className="event-icon"><History size={16} /></span><div><strong>{event.title}</strong><p>{event.detail}</p><span>{event.supplier} · {event.actor}</span></div><time>{date(event.at)}<span>{time(event.at)}</span></time><ArrowUpRight size={15} /></button>) : <Empty title="No activity yet" text="Create a case to start its history." />}</section> :
      <div className={`desk-layout ${mobileCase ? 'show-case' : ''}`}>
        <section className="queue panel" aria-label="Invoice exception queue"><div className="queue-heading"><h2>Cases <span className="count-badge">{cases.length}</span></h2><button className="icon-button" aria-label="Refresh cases" onClick={() => void refresh().catch((e) => setNotice({ kind: 'error', message: e.message }))}><RefreshCw size={15} /></button></div><div className="queue-tools"><div className="search-field"><Search size={15} /><input aria-label="Search cases" placeholder="Search supplier or invoice…" value={search} onChange={(e) => setSearch(e.target.value)} /></div><div className="queue-filter"><span className="eyebrow">SHOWING</span><select aria-label="Filter case status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="all">All cases</option><option value="open">Open cases</option><option value="awaiting_approval">Awaiting approval</option><option value="on_hold">On hold</option><option value="resolved">Resolved</option></select></div></div>
          <div className="case-list">{visibleCases.length ? visibleCases.map((c) => <button key={c.id} className={`case-row ${c.id === selected?.id ? 'selected' : ''}`} onClick={() => void selectCase(c)} aria-pressed={c.id === selected?.id}><div className="case-row-top"><span className="supplier-initials">{initials(c.supplier)}</span><span className="case-supplier">{c.supplier}<span>{c.invoiceNumber}</span></span><ChevronRight size={16} /></div><div className="case-row-bottom"><Badge status={c.status} /><strong className={c.status === 'resolved' ? 'resolved-amount' : ''}>{c.status === 'resolved' ? <Check size={15} /> : money(totals(c).discrepancyCents)}</strong></div></button>) : <Empty title="No matching cases" text={cases.length ? 'Try a different search or status.' : 'Add an invoice to start resolving discrepancies.'} />}</div><div className="queue-footer"><LockKeyhole size={13} /><span>Your workspace is isolated from other visitors.</span></div>
        </section>

        {selected && selectedTotals ? <section className="case-workspace" aria-label={`Case ${selected.invoiceNumber}`}>
          <button className="back-to-queue" onClick={() => setMobileCase(false)}><ArrowLeft size={16} />Back to cases</button>
          <div className="case-header"><div><div className="case-kicker"><span>{selected.invoiceNumber}</span><span className="dot-separator">/</span><span>{selected.poNumber}</span></div><h2>{selected.supplier}</h2><p>{selected.description || selected.sku}</p></div><div className="case-header-actions"><Badge status={selected.status} />{selected.status === 'resolved' ? <a href={`/api/cases/${selected.id}/export?format=csv`} download className="button primary"><ArrowDownToLine size={16} />Export reconciliation</a> : <button className="button primary" disabled={!!busy || selected.status === 'queued'} onClick={() => { if (activeProposal) { setReview(activeProposal); setReviewError(''); } else void propose(); }}>{selected.status === 'queued' || busy === 'propose' ? <LoaderCircle size={16} className="spin" /> : <ListChecks size={16} />}{selected.status === 'queued' ? 'Applying changes' : activeProposal ? 'Review proposal' : 'Prepare resolution'}</button>}</div></div>
          <div className="case-owner-row"><button className="owner-control" onClick={() => setModal('assign')}><span className="small-avatar">{initials(selected.owner || 'Unassigned')}</span><span>{selected.owner || 'Assign owner'}</span><ChevronDown size={12} /></button><span className="owner-divider" /><span className="reviewer-label">Reviewer <strong>{selected.reviewer || 'Unassigned'}</strong></span><span className="case-revision">Revision {selected.sourceRevision}</span></div>

          <div className={`discrepancy-banner ${selected.status === 'resolved' ? 'is-resolved' : ''}`}><div className="discrepancy-symbol">{selected.status === 'resolved' ? <CheckCheck size={23} /> : <CircleAlert size={23} />}</div><div><span>{selected.status === 'resolved' ? 'Invoice exception resolved' : 'Quantity discrepancy'}</span><strong>{selected.status === 'resolved' ? `${money(selectedTotals.netCents)} reconciled` : `${selectedTotals.missingUnits} units not yet received`}</strong><p>{selected.status === 'resolved' ? `${selectedTotals.openPoUnits} units remain open on the purchase order.` : `${selected.invoicedUnits} invoiced · ${selectedTotals.receivedUnits} accepted · ${selected.sku}`}</p></div><div className="discrepancy-amount">{money(selectedTotals.discrepancyCents)}<span>{selected.status === 'resolved' ? 'remaining discrepancy' : 'current discrepancy'}</span></div></div>

          <div className="case-tabs"><div role="tablist" aria-label="Case details"><button role="tab" aria-selected={tab === 'evidence'} className={tab === 'evidence' ? 'active' : ''} onClick={() => setTab('evidence')}><FileText size={15} />Evidence & resolution</button><button role="tab" aria-selected={tab === 'activity'} className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}><History size={15} />Activity<span>{selected.history.length}</span></button></div><a href={`/api/cases/${selected.id}/export?format=json`} className="export-link" download><ArrowDownToLine size={14} /><span>Export</span></a></div>

          {tab === 'evidence' ? <>
            <section className="matching-panel panel"><div className="section-title compact"><h3>Three-way match</h3><span className="subtle-label">USD · {selected.sku}</span></div><div className="matching-table"><div className="matching-row matching-labels"><span>DOCUMENT</span><span>UNITS</span><span>AMOUNT</span></div><button className="matching-row" onClick={() => { setDocumentId(selected.documents.find((d) => d.kind === 'purchase_order')?.id || null); setEvidenceIndex(null); }}><span><span className="document-icon"><FileText size={15} /></span>Purchase order</span><span>{selected.orderedUnits}</span><span>{money(selected.orderedUnits * selected.unitPriceCents)}</span></button><button className="matching-row" onClick={() => { setDocumentId(selected.documents.find((d) => d.kind === 'invoice')?.id || null); setEvidenceIndex(null); }}><span><span className="document-icon"><FileText size={15} /></span>Supplier invoice</span><span>{selected.invoicedUnits}</span><span>{money(selectedTotals.grossCents)}</span></button><button className="matching-row received-row" onClick={() => { setDocumentId(selected.documents.find((d) => d.kind === 'receipt')?.id || null); setEvidenceIndex(null); }}><span><span className="document-icon"><PackageCheck size={15} /></span>Accepted receipts</span><span>{selectedTotals.receivedUnits}</span><span>{money(selectedTotals.receivedCents)}</span></button>{selected.credits.length > 0 && <div className="matching-row credit-row"><span><span className="document-icon"><FileCheck2 size={15} /></span>Supplier credits</span><span>{selectedTotals.pendingCreditCents > 0 ? 'Pending' : 'Applied'}</span><span>−{money(selected.credits.reduce((sum, credit) => sum + credit.amountCents, 0))}</span></div>}</div><div className="match-footer"><span><ShieldCheck size={14} />Exact quantities · Zero tolerance</span><button onClick={() => setModal('receipt')} disabled={!!busy || selected.status === 'resolved'}><Plus size={14} />Add receipt</button></div></section>

            <div className="detail-columns"><section className="evidence-panel panel"><div className="section-title compact"><h3>Source documents <span className="count-badge">{selected.documents.length}</span></h3><button className="icon-button" aria-label="Upload supporting document" onClick={() => setModal('upload')}><Upload size={16} /></button></div><div className="document-tabs">{selected.documents.map((doc) => <button key={doc.id} onClick={() => { setDocumentId(doc.id); setEvidenceIndex(null); }} className={currentDocument?.id === doc.id ? 'active' : ''}><FileText size={12} /><span>{documentLabels[doc.kind]}</span>{doc.status === 'pending' && <LoaderCircle size={12} className="spin" />}{doc.status === 'needs_review' && <CircleAlert size={12} />}</button>)}</div>{currentDocument ? <EvidenceDocument document={currentDocument} evidenceIndex={evidenceIndex} onEvidence={setEvidenceIndex} busy={!!busy} onRetry={() => void action({ action: 'retry_document', documentId: currentDocument.id }, 'Document extraction queued for another attempt.')} /> : <Empty title="No source documents" text="Upload a supporting record to attach source evidence to this case." />}<button className="upload-inline" onClick={() => setModal('upload')}><Upload size={14} />Add supporting document<Plus size={14} /></button></section>

            <section className="resolution-panel panel"><div className="section-title compact"><h3>Next action</h3><span className="step-label">{selected.status === 'resolved' ? 'COMPLETE' : 'HUMAN REVIEW'}</span></div><div className="resolution-body">{selected.status === 'resolved' ? <><div className="resolution-icon complete"><CheckCheck size={23} /></div><h4>Ready for export</h4><p>The applied credit and accepted receipts reconcile with the invoice. No payment has been made.</p><div className="resolution-equation"><span>Invoice</span><strong>{money(selectedTotals.grossCents)}</strong><span>Applied credit</span><strong>−{money(selected.appliedCreditCents)}</strong><span className="equation-total">Reconciled amount</span><strong className="equation-total">{money(selectedTotals.netCents)}</strong></div><a className="button primary full" href={`/api/cases/${selected.id}/export?format=csv`} download><ArrowDownToLine size={15} />Export reconciliation</a></> : <><div className="resolution-icon"><ListChecks size={22} /></div><h4>{selectedTotals.pendingCreditCents > 0 ? 'Reconcile supplier credit' : selected.status === 'queued' ? 'Applying approved changes' : selected.status === 'on_hold' ? 'Waiting on a supplier credit' : activeProposal ? 'Review proposed changes' : 'Prepare a resolution'}</h4><p>{selectedTotals.pendingCreditCents > 0 ? 'Review the credit against the latest receipts, then approve the resulting ledger change.' : selected.status === 'queued' ? 'The worker will apply the approved change and verify the resulting records.' : selected.status === 'on_hold' ? `${money(selected.heldCents)} is held in the internal ledger. Record a supplier credit when it arrives.` : 'Review a precise action plan before any changes reach the internal ledger.'}</p><div className="action-summary"><div><span>Internal hold</span><strong>{money(selected.heldCents)}</strong></div><div><span>Unapplied credit</span><strong>{money(selectedTotals.pendingCreditCents)}</strong></div></div>{selected.status === 'queued' ? <div className="processing-label"><LoaderCircle size={16} className="spin" />Waiting for verified execution</div> : activeProposal ? <button className="button primary full" onClick={() => { setReview(activeProposal); setReviewError(''); }}>Review changes<ArrowRight size={15} /></button> : <button className="button primary full" onClick={() => void propose()} disabled={!!busy}>{busy === 'propose' ? <LoaderCircle size={15} className="spin" /> : <ListChecks size={15} />}Prepare action plan</button>}<button className="button secondary full" onClick={() => setModal('credit')} disabled={!!busy}><Plus size={15} />Record supplier credit</button></>}<div className="resolution-footnote"><LockKeyhole size={12} /><span>Approval applies to the current evidence and policy.</span></div></div>{selected.proposals.length > 0 && <div className="previous-proposals"><button onClick={() => setShowOldProposals(!showOldProposals)}><History size={13} />Previous proposals<ChevronDown size={13} className={showOldProposals ? 'rotated' : ''} /></button>{showOldProposals && [...selected.proposals].reverse().map((proposal) => <button className="old-proposal" key={proposal.id} onClick={() => { setReview({ ...proposal }); setReviewError(''); }}><span>Revision {proposal.sourceRevision}<small>{proposal.type === 'hold' ? 'Hold' : 'Reconcile'} · {proposal.status}</small></span><strong>{money(proposal.amountCents)}</strong><ArrowUpRight size={13} /></button>)}</div>}</section></div>
            {selected.tasks.length > 0 && <section className="tasks-panel panel"><div className="section-title compact"><h3>Follow-up work</h3><button className="text-button" onClick={() => setModal('assign')}><Users size={14} />Assign</button></div>{selected.tasks.map((task) => <div className="task-row" key={task.id}><span className={`task-check ${task.status === 'done' ? 'done' : ''}`}>{task.status === 'done' ? <Check size={12} /> : null}</span><div><strong>{task.title}</strong><span>{task.owner || 'Unassigned'}</span></div><span className="subtle-label">{task.status === 'done' ? 'Complete' : 'Open'}</span></div>)}</section>}
          </> : <CaseActivity record={selected} busy={!!busy} onRetry={(commandId) => void action({ action: 'retry', commandId }, 'Execution request checked. Existing completed writes will not be duplicated.')} />}
          <footer className="case-footer"><span><ShieldCheck size={13} />Persisted records. Inspectable decisions.</span><span>Source r{selected.sourceRevision} · Ledger r{selected.ledgerRevision}</span></footer>
        </section> : <section className="empty-workspace panel"><Empty title="Your next resolution starts here" text="Create a case with an invoice, purchase order, and accepted quantity." /><button className="button primary" onClick={() => setModal('create')}><Plus size={16} />Create case</button></section>}
      </div>}
      <footer className="page-footer"><span>SHORTFALL <span className="footer-slash">/</span> FINANCE OPERATIONS</span><span>Built for the work between systems.</span></footer>
    </main>

    {modal && <Dialog title={{ receipt: 'Record accepted goods', credit: 'Record supplier credit', create: 'Open a new case', upload: 'Attach supporting evidence', assign: 'Assign the work', policy: 'Workspace policy', reset: 'Reset this workspace?' }[modal]} description={{ receipt: 'Add a receipt to this case. Existing proposals will need review.', credit: 'Record a credit issued by the supplier. Applying it requires approval.', create: 'Enter a supported invoice and its order details. USD, whole units, no tax.', upload: 'Upload a text document for extraction and source verification.', assign: 'Set the internal owner and reviewer for this case.', policy: 'The rules used to prepare and verify action plans.', reset: 'Replace your cases with the original sample records. This affects only your private workspace.' }[modal]} onClose={() => { if (!busy) setModal(null); }} wide={modal === 'create'}>
      {notice?.kind === 'error' && <div className="dialog-error" role="alert"><CircleAlert size={16} />{notice.message}</div>}
      {modal === 'policy' ? <div className="policy-content"><div className="policy-intro"><ShieldCheck size={24} /><div><strong>Quantity reconciliation</strong><span>Explicit review before ledger changes</span></div></div><dl><div><dt>Supported currency</dt><dd>USD</dd></div><div><dt>Quantity tolerance</dt><dd>0 units</dd></div><div><dt>Approval scope</dt><dd>Current evidence + ledger revision</dd></div><div><dt>Credit application</dt><dd>Human approval required</dd></div><div><dt>Purchase order allocation</dt><dd>One invoice case per order</dd></div><div><dt>Unsupported records</dt><dd>Require review</dd></div></dl><p className="form-note">This workspace uses synthetic records and an internal ledger. It does not send payments or supplier emails.</p><div className="dialog-actions"><button className="button primary" onClick={() => setModal(null)}>Understood</button></div></div> : modal === 'reset' ? <div className="reset-content"><p>New cases, uploaded evidence, approvals, and activity in this workspace will be replaced. Download any reconciliation you want to keep first.</p><div className="dialog-actions"><button className="button secondary" disabled={!!busy} onClick={() => setModal(null)}>Keep workspace</button><button className="button danger" disabled={!!busy} onClick={async () => { setBusy('reset'); busyRef.current = true; requestGeneration.current++; try { await api('/api/session/reset', { method: 'POST', body: '{}' }); selectedId.current = null; await refresh(); setDocumentId(null); setReview(null); setModal(null); setNotice({ kind: 'success', message: 'Your sample workspace has been reset.' }); } catch (error) { setNotice({ kind: 'error', message: error instanceof Error ? error.message : 'Could not reset workspace.' }); } finally { setBusy(''); busyRef.current = false; } }}>{busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Reset sample data</button></div></div> : <form onSubmit={submitForm} className="dialog-form">
        {modal === 'receipt' && <><div className="form-context"><PackageCheck size={17} /><span>{selected?.poNumber}</span><strong>{selectedTotals?.receivedUnits} / {selected?.orderedUnits} units accepted</strong></div><Field label="Accepted quantity"><input name="quantity" type="number" min="1" step="1" required autoFocus placeholder="e.g. 10" /></Field><Field label="Receipt reference"><input name="reference" required maxLength={100} placeholder="e.g. GR-1042" /></Field><p className="form-note">Enter the newly accepted quantity, not the cumulative total. This form records a manual entry.</p>{selected?.poNumber === 'PO-1042' && <button type="button" className="sample-fill" onClick={(event) => { const form = event.currentTarget.form; const quantity = form?.elements.namedItem('quantity') as HTMLInputElement; const reference = form?.elements.namedItem('reference') as HTMLInputElement; if (quantity && reference) { quantity.value = '10'; reference.value = 'RCV-2042'; } }}><PackageCheck size={14} />Fill sample: 10 late units<span>Review before recording</span></button>}</>}
        {modal === 'credit' && <><div className="form-context"><FileCheck2 size={17} /><span>{selected?.invoiceNumber}</span><strong>{money(selectedTotals?.discrepancyCents || 0)} discrepancy</strong></div><Field label="Credit amount (USD)"><input name="amount" type="number" min="0.01" step="0.01" required autoFocus placeholder="e.g. 400.00" /></Field><Field label="Supplier credit reference"><input name="reference" required maxLength={100} placeholder="e.g. CN-2041" /></Field><p className="form-note">This records an existing supplier credit in the sample ledger. It does not issue a credit on the supplier’s behalf.</p></>}
        {modal === 'assign' && <><Field label="Case owner"><input name="owner" defaultValue={selected?.owner || ''} required maxLength={80} autoFocus placeholder="Finance owner" /></Field><Field label="Reviewer"><input name="reviewer" defaultValue={selected?.reviewer || ''} required maxLength={80} placeholder="Approval reviewer" /></Field><p className="form-note">Assignments are internal workflow labels in this sample workspace.</p></>}
        {modal === 'upload' && <><Field label="Document type"><select name="kind" defaultValue="receipt"><option value="receipt">Goods receipt</option><option value="invoice">Supplier invoice</option><option value="purchase_order">Purchase order</option><option value="credit">Supplier credit</option></select></Field><Field label="Document reference"><input name="reference" required maxLength={100} placeholder="Reference printed on the document" /></Field><Field label="File" hint="PDF with text, TXT, CSV, or JSON. Up to 5 MB and 8 PDF pages. Scanned PDFs need manual review."><input name="file" type="file" accept=".pdf,.txt,.json,.csv,text/plain,application/pdf,application/json,text/csv" required /></Field><div className="sample-downloads"><span>SYNTHETIC NORTHSTAR DOCUMENTS</span><a href="/samples/receipt-late.txt" download onClick={(event) => { const form = event.currentTarget.closest('form'); const kind = form?.elements.namedItem('kind') as HTMLSelectElement; const reference = form?.elements.namedItem('reference') as HTMLInputElement; if (kind && reference) { kind.value = 'receipt'; reference.value = 'RCV-2042'; } }}><ArrowDownToLine size={13} />Late receipt · RCV-2042</a><a href="/samples/credit-note.txt" download onClick={(event) => { const form = event.currentTarget.closest('form'); const kind = form?.elements.namedItem('kind') as HTMLSelectElement; const reference = form?.elements.namedItem('reference') as HTMLInputElement; if (kind && reference) { kind.value = 'credit'; reference.value = 'CN-8821-01'; } }}><ArrowDownToLine size={13} />Supplier credit · CN-8821-01</a><p>These files match Northstar, PO-1042. Download the late receipt first; the link fills its type and reference. Select the downloaded file above, then upload it to run extraction. After the discrepancy reaches $400, repeat with the supplier credit.</p></div>{!workspace?.service.inferenceEnabled && <p className="form-note warning-text">Document extraction is not configured. You can use manual receipt and credit entry instead.</p>}</>}
        {modal === 'create' && <><div className="form-grid"><Field label="Supplier"><input name="supplier" required autoFocus maxLength={160} placeholder="Supplier name" /></Field><Field label="Item description"><input name="description" required maxLength={200} placeholder="e.g. Steel mounting brackets" /></Field><Field label="Purchase order reference"><input name="poNumber" required maxLength={100} placeholder="PO-1042" /></Field><Field label="Invoice reference"><input name="invoiceNumber" required maxLength={100} placeholder="INV-2041" /></Field><Field label="Exact SKU"><input name="sku" required maxLength={100} placeholder="BRK-040" /></Field><Field label="Unit price (USD)"><input name="unitPrice" type="number" min="0.01" step="0.01" required placeholder="40.00" /></Field><Field label="Ordered units"><input name="orderedUnits" type="number" min="1" step="1" required placeholder="120" /></Field><Field label="Invoiced units"><input name="invoicedUnits" type="number" min="1" step="1" required placeholder="120" /></Field><Field label="Accepted units so far"><input name="receivedUnits" type="number" min="0" step="1" required defaultValue="0" /></Field></div><p className="form-note">One invoice per purchase order. Split invoicing, taxes, discounts, and foreign exchange are outside this workspace’s policy. New records are labeled synthetic.</p></>}
        <div className="dialog-actions"><button className="button secondary" type="button" disabled={!!busy} onClick={() => setModal(null)}>Cancel</button><button className="button primary" type="submit" disabled={!!busy || (modal === 'upload' && !workspace?.service.inferenceEnabled)}>{busy ? <LoaderCircle size={16} className="spin" /> : modal === 'upload' ? <Upload size={16} /> : <Check size={16} />}{modal === 'create' ? 'Create case' : modal === 'upload' ? 'Upload document' : modal === 'assign' ? 'Save assignments' : 'Record evidence'}</button></div>
      </form>}
    </Dialog>}

    {review && selected && <Dialog title={review.type === 'hold' ? 'Review the proposed hold' : 'Review credit reconciliation'} description="Approve the exact change below. The server checks evidence and policy again before execution." onClose={() => { if (!busy) { setReview(null); setReviewError(''); } }}>
      <div className="proposal-review"><div className="proposal-meta"><span>{selected.invoiceNumber}</span><span>Evidence revision {review.sourceRevision}</span></div>{(review.sourceRevision !== selected.sourceRevision || review.ledgerRevision !== selected.ledgerRevision || review.status === 'stale') && <div className="stale-warning"><CircleAlert size={18} /><div><strong>The evidence has changed.</strong><p>This proposal uses an earlier revision. An approval attempt will be checked against the current records.</p></div></div>}<div className="proposal-amount"><span>{review.type === 'hold' ? 'Proposed internal hold' : 'Credit to reconcile'}</span><strong>{money(review.type === 'hold' ? review.amountCents : review.creditCents)}</strong></div><div className="proposal-diff"><div><span>Current hold</span><strong>{money(selected.heldCents)}</strong></div><ArrowDownToLine size={17} /><div><span>Hold after execution</span><strong>{money(review.amountCents)}</strong></div></div><ul className="proposal-checklist">{review.type === 'hold' ? <><li><Check size={14} />Record the approved hold in the internal ledger</li><li><Check size={14} />Create the dispute and supplier follow-up task</li><li><Check size={14} />Read back and verify the recorded changes</li></> : <><li><Check size={14} />Apply the verified supplier credit</li><li><Check size={14} />{review.amountCents === 0 ? 'Release the hold and resolve the exception' : `Reduce the hold to ${money(review.amountCents)}; keep the exception open`}</li><li><Check size={14} />Keep the remaining purchase order quantity open</li></>}</ul><div className="proposal-policy"><ShieldCheck size={14} /><span>Policy {review.policyVersion} · Ledger revision {review.ledgerRevision}</span></div>{reviewError && <div className="dialog-error" role="alert"><CircleAlert size={17} /><span>{reviewError}</span></div>}<div className="dialog-actions"><button className="button secondary" disabled={!!busy} onClick={() => { setReview(null); setReviewError(''); }}>Close review</button>{reviewError ? <button className="button primary" disabled={!!busy} onClick={() => void propose()}>{busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}Prepare updated plan</button> : <button className="button primary" disabled={!!busy || review.status === 'applied' || review.status === 'approved'} onClick={async () => { const updated = await action({ action: 'approve', proposalId: review.id }); if (updated) { setReview(null); setNotice({ kind: 'info', message: 'Approval recorded. Follow execution in the activity log.' }); } }}>{busy === 'approve' ? <LoaderCircle size={15} className="spin" /> : <Check size={15} />}{review.status === 'applied' ? 'Already applied' : review.status === 'approved' ? 'Already approved' : 'Approve changes'}</button>}</div><p className="form-note">No payment or external message will be sent.</p></div>
    </Dialog>}
  </div>;
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty-state"><Inbox size={25} /><h3>{title}</h3><p>{text}</p></div>;
}

function EvidenceDocument({ document, evidenceIndex, onEvidence, busy, onRetry }: { document: CaseDocument; evidenceIndex: number | null; onEvidence: (index: number | null) => void; busy: boolean; onRetry: () => void }) {
  const evidence = evidenceIndex === null ? null : document.evidence[evidenceIndex];
  const quoteIndex = evidence ? document.text.indexOf(evidence.quote) : -1;
  const start = evidence && document.text.slice(evidence.start, evidence.end) === evidence.quote ? evidence.start : quoteIndex;
  const end = evidence ? start + evidence.quote.length : -1;
  return <div className="evidence-document"><div className="document-meta"><span>{document.reference}</span><span className={`document-status ${document.status}`}>{document.status === 'verified' ? <Check size={12} /> : document.status === 'pending' ? <LoaderCircle size={12} className="spin" /> : <CircleAlert size={12} />}{document.status === 'verified' ? (document.model ? 'Extraction verified' : 'Recorded sample') : document.status === 'pending' ? 'Extracting' : 'Needs review'}</span></div><div className="document-paper"><div className="paper-brand">{documentLabels[document.kind].toUpperCase()}</div><pre>{evidence && start >= 0 ? <>{document.text.slice(0, start)}<mark>{document.text.slice(start, end)}</mark>{document.text.slice(end)}</> : document.text || 'Source text will appear after extraction.'}</pre><span className="paper-corner" /></div>{document.extractionError && <div className="document-error"><CircleAlert size={16} />{document.extractionError}</div>}{document.status === 'needs_review' && <button className="button secondary full retry-extraction" disabled={busy} onClick={onRetry}><RefreshCw size={15} />Retry extraction</button>}{document.evidence.length > 0 && <div className="evidence-fields"><span className="eyebrow">{document.model ? 'INSPECT EXTRACTED FIELDS' : 'INSPECT RECORDED FIELDS'}</span><div>{document.evidence.map((field, index) => <button key={`${field.field}-${index}`} className={evidenceIndex === index ? 'active' : ''} onClick={() => onEvidence(evidenceIndex === index ? null : index)}><span>{fieldLabel(field.field)}</span><strong>{/Cents$/.test(field.field) && Number.isFinite(Number(field.value)) ? money(Number(field.value)) : field.value}</strong><ArrowUpRight size={11} /></button>)}</div></div>}</div>;
}

function CaseActivity({ record, busy, onRetry }: { record: CaseRecord; busy: boolean; onRetry: (commandId: string) => void }) {
  return <div className="activity-content">{record.executions.length > 0 && <section className="execution-panel panel"><div className="section-title compact"><h3>Execution records</h3><span className="subtle-label">READ-BACK VERIFICATION</span></div>{[...record.executions].reverse().map((execution) => <div className="execution-row" key={execution.id}><span className={`execution-symbol ${execution.status}`}>{execution.status === 'applied' ? <CheckCheck size={18} /> : execution.status === 'queued' ? <LoaderCircle size={18} className="spin" /> : <CircleAlert size={18} />}</span><div><strong>{execution.type === 'hold' ? 'Apply approved hold' : 'Reconcile and release hold'}</strong><span>{execution.status === 'applied' ? `${money(execution.beforeHeldCents || 0)} → ${money(execution.afterHeldCents || 0)} held · Verified` : execution.error || execution.status}</span></div><button className="button secondary small" disabled={busy || execution.status === 'queued'} onClick={() => onRetry(execution.id)}><RefreshCw size={12} />{execution.status === 'applied' ? 'Check retry' : 'Retry'}</button></div>)}</section>}<section className="timeline-panel panel"><div className="section-title compact"><h3>Case history</h3><span className="subtle-label">{record.history.length} EVENTS</span></div><div className="timeline">{[...record.history].reverse().map((event, index) => <div className={`timeline-event ${index === 0 ? 'latest' : ''}`} key={event.id}><span className="timeline-point">{index === 0 ? <Check size={10} /> : null}</span><div><div className="timeline-title"><strong>{event.title}</strong><time>{time(event.at)}</time></div><p>{event.detail}</p><span>{event.actor} · {date(event.at)} · Revision {event.revision}</span></div></div>)}{record.history.length === 0 && <Empty title="No case activity yet" text="Recorded actions will appear here." />}</div></section></div>;
}
