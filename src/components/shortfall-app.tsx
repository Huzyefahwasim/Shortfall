'use client';

import { OperationsConsole } from './operations-console';
import { WorkspaceEntry } from './workspace-entry';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
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
  Layers3,
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
import type {
  CaseDocument,
  CaseRecord,
  DocumentKind,
  NewCaseInput,
  Proposal,
  WorkspaceResponse,
} from '@/lib/types';

type View = 'desk' | 'activity';
type ModalName =
  'receipt' | 'credit' | 'create' | 'upload' | 'assign' | 'policy' | 'reset' | 'end_session' | null;
type Screen = 'home' | 'exceptions' | 'activity';
function locationScreen(): Screen | null {
  const screen = window.location.hash.slice(1);
  return screen === 'home' || screen === 'exceptions' || screen === 'activity' ? screen : null;
}
type Notice = { kind: 'success' | 'error' | 'info'; message: string } | null;
const money = (cents: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: cents % 100 === 0 ? 0 : 2,
  }).format(cents / 100);
const date = (value: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(value));
const time = (value: string) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
const labels: Record<CaseRecord['status'], string> = {
  needs_review: 'Needs review',
  awaiting_approval: 'Awaiting approval',
  queued: 'Processing',
  on_hold: 'On hold',
  resolved: 'Resolved',
};
const documentLabels: Record<DocumentKind, string> = {
  purchase_order: 'Purchase order',
  invoice: 'Invoice',
  receipt: 'Goods receipt',
  credit: 'Supplier credit',
};
const fieldLabels: Record<string, string> = {
  quantity: 'Quantity',
  unitPriceCents: 'Unit price',
  totalCents: 'Total',
  sku: 'Item',
  supplier: 'Supplier',
  currency: 'Currency',
  poNumber: 'Purchase order',
  invoiceNumber: 'Invoice',
  reference: 'Reference',
};
const fieldLabel = (field: string) =>
  fieldLabels[field] ||
  field
    .replace(/Cents$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());

function totals(c: CaseRecord) {
  const receivedUnits = c.receipts.reduce((sum, receipt) => sum + receipt.quantity, 0);
  const grossCents = c.invoicedUnits * c.unitPriceCents;
  const receivedCents = receivedUnits * c.unitPriceCents;
  const netCents = grossCents - c.appliedCreditCents;
  const pendingCreditCents = c.credits
    .filter((credit) => !credit.applied)
    .reduce((sum, credit) => sum + credit.amountCents, 0);
  return {
    receivedUnits,
    grossCents,
    receivedCents,
    netCents,
    pendingCreditCents,
    discrepancyCents: Math.max(0, netCents - receivedCents),
    missingUnits: Math.max(0, c.invoicedUnits - receivedUnits),
    openPoUnits: Math.max(0, c.orderedUnits - receivedUnits),
  };
}

class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    credentials: 'same-origin',
    cache: 'no-store',
    ...options,
    headers: {
      ...(options?.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...options?.headers,
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new RequestError(
      payload.error || `Request failed (${response.status}). Please try again.`,
      response.status,
    );
  return payload as T;
}

function Brand() {
  return (
    <div className="wordmark">
      <span className="wordmark-symbol" aria-hidden="true">
        <span />
        <span />
      </span>
      Shortfall<span className="product-area">Payables</span>
    </div>
  );
}

function Badge({ status }: { status: CaseRecord['status'] }) {
  return (
    <span className={`status-badge status-${status}`}>
      <span className="status-dot" />
      {labels[status]}
    </span>
  );
}

function Dialog({
  title,
  description,
  onClose,
  children,
  wide = false,
}: {
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`dialog ${wide ? 'dialog-wide' : ''}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      aria-labelledby="dialog-heading"
    >
      <div className="dialog-header">
        <div>
          <span className="eyebrow">SHORTFALL WORKSPACE</span>
          <h2 id="dialog-heading">{title}</h2>
          {description && <p>{description}</p>}
        </div>
        <button className="icon-button" onClick={onClose} aria-label="Close dialog">
          <X size={20} />
        </button>
      </div>
      <div className="dialog-body">{children}</div>
    </dialog>
  );
}

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

export function ShortfallApp() {
  const [workspace, setWorkspace] = useState<WorkspaceResponse | null>(null);
  const workspaceRef = useRef<WorkspaceResponse | null>(null);
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
  const [showWelcome, setShowWelcome] = useState(true);
  const [guideVisible, setGuideVisible] = useState(false);
  const checkedWelcome = useRef<string | null>(null);

  const navigate = useCallback((screen: Screen, replace = false) => {
    const target = screen !== 'home' && !workspaceRef.current ? 'home' : screen;
    setShowWelcome(target === 'home');
    if (target !== 'home') setView(target === 'activity' ? 'activity' : 'desk');
    setModal(null);
    setReview(null);
    setReviewError('');
    setNotice(null);
    if (window.location.hash !== '#' + target) {
      const url = window.location.pathname + window.location.search + '#' + target;
      if (replace) window.history.replaceState(null, '', url);
      else window.history.pushState(null, '', url);
    }
  }, []);

  const clearSession = useCallback(() => {
    requestGeneration.current++;
    workspaceRef.current = null;
    selectedId.current = null;
    checkedWelcome.current = null;
    setWorkspace(null);
    setSelected(null);
    setDocumentId(null);
    setEvidenceIndex(null);
    setMobileCase(false);
    setGuideVisible(false);
    setSearch('');
    setFilter('all');
    setShowOldProposals(false);
    navigate('home', true);
  }, [navigate]);

  useEffect(() => {
    const restore = () => {
      const screen = locationScreen();
      // In-page anchors such as the keyboard skip link are not screen navigation.
      if (screen || !window.location.hash) queueMicrotask(() => navigate(screen || 'home', true));
    };
    const endedElsewhere = (event: StorageEvent) => {
      if (event.key === 'shortfall:session-ended' && event.newValue) clearSession();
    };
    window.addEventListener('popstate', restore);
    window.addEventListener('hashchange', restore);
    window.addEventListener('storage', endedElsewhere);
    return () => {
      window.removeEventListener('popstate', restore);
      window.removeEventListener('hashchange', restore);
      window.removeEventListener('storage', endedElsewhere);
    };
  }, [navigate, clearSession]);

  useEffect(() => {
    const id = workspace?.workspace.id;
    if (!id || checkedWelcome.current === id) return;
    checkedWelcome.current = id;
    let seen = false;
    try {
      seen = localStorage.getItem('shortfall:entered:' + id) === '1';
    } catch {
      /* Storage may be disabled. */
    }
    navigate(locationScreen() || (seen ? 'exceptions' : 'home'), true);
  }, [workspace?.workspace.id, navigate]);

  const replaceCase = useCallback((record: CaseRecord) => {
    if (selectedId.current === record.id) setSelected(record);
    setWorkspace((previous) =>
      previous
        ? {
            ...previous,
            cases: previous.cases.some((c) => c.id === record.id)
              ? previous.cases.map((c) => (c.id === record.id ? record : c))
              : [record, ...previous.cases],
          }
        : previous,
    );
  }, []);

  const refresh = useCallback(async () => {
    const generation = requestGeneration.current;
    const data = await api<WorkspaceResponse>('/api/workspace');
    if (generation !== requestGeneration.current) return;
    data.cases.sort(
      (a, b) =>
        Number(a.status === 'resolved') - Number(b.status === 'resolved') ||
        totals(b).discrepancyCents - totals(a).discrepancyCents,
    );
    workspaceRef.current = data;
    setWorkspace(data);
    const id = selectedId.current;
    if (id && data.cases.some((c) => c.id === id)) {
      const record = await api<CaseRecord>(`/api/cases/${id}`);
      if (selectedId.current === id && generation === requestGeneration.current)
        setSelected(record);
    } else if (data.cases[0]) {
      selectedId.current = data.cases[0].id;
      setSelected(data.cases[0]);
    } else {
      selectedId.current = null;
      setSelected(null);
    }
    return data;
  }, []);

  const initialize = useCallback(
    async (create = false) => {
      setLoading(true);
      setInitialError('');
      try {
        if (create) await api('/api/session', { method: 'POST', body: '{}' });
        return await refresh();
      } catch (error) {
        if (error instanceof RequestError && error.status === 401) clearSession();
        else
          setInitialError(
            error instanceof Error ? error.message : 'Could not open your workspace.',
          );
      } finally {
        setLoading(false);
      }
    },
    [refresh, clearSession],
  );

  async function enterWorkspace(mode: 'sample' | 'own') {
    if (busyRef.current) return;
    busyRef.current = true;
    const data = workspaceRef.current || (await initialize(true));
    busyRef.current = false;
    if (!data) return;
    checkedWelcome.current = data.workspace.id;
    try {
      localStorage.setItem('shortfall:entered:' + data.workspace.id, '1');
    } catch {
      /* The session still works without local storage. */
    }
    navigate('exceptions');
    if (mode === 'sample') {
      const sample = data.cases.find((record) => record.poNumber === 'PO-1042');
      if (sample) void selectCase(sample);
      setGuideVisible(true);
    } else {
      setGuideVisible(false);
      setModal('create');
    }
  }

  async function endSession() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy('end_session');
    requestGeneration.current++;
    try {
      await api('/api/session', { method: 'DELETE' });
      try {
        if (workspaceRef.current)
          localStorage.removeItem('shortfall:entered:' + workspaceRef.current.workspace.id);
        localStorage.setItem('shortfall:session-ended', String(Date.now()));
      } catch {
        /* Server revocation remains effective when storage is unavailable. */
      }
      clearSession();
    } catch (error) {
      setNotice({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Could not end the session. Please try again.',
      });
    } finally {
      busyRef.current = false;
      setBusy('');
    }
  }

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      void initialize();
    }
  }, [initialize]);
  const pending =
    workspace?.cases.some(
      (c) =>
        c.status === 'queued' ||
        c.documents.some((d) => d.status === 'pending') ||
        c.executions.some((e) => e.status === 'queued'),
    ) ?? false;
  useEffect(() => {
    if (!pending) return;
    const interval = setInterval(() => {
      if (!busyRef.current)
        void refresh().catch((error) => setNotice({ kind: 'error', message: error.message }));
    }, 2000);
    return () => clearInterval(interval);
  }, [pending, refresh]);
  useEffect(() => {
    if (notice?.kind !== 'success') return;
    const timeout = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timeout);
  }, [notice]);

  async function selectCase(record: CaseRecord) {
    if (busyRef.current) return;
    const generation = requestGeneration.current;
    selectedId.current = record.id;
    setSelected(record);
    setDocumentId(null);
    setEvidenceIndex(null);
    setShowOldProposals(false);
    setReview(null);
    setTab('evidence');
    setMobileCase(true);
    try {
      const updated = await api<CaseRecord>(`/api/cases/${record.id}`);
      if (selectedId.current === record.id && generation === requestGeneration.current)
        setSelected(updated);
    } catch (error) {
      setNotice({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Could not refresh case.',
      });
    }
  }

  async function action(payload: Record<string, unknown>, success?: string) {
    if (!selected || busyRef.current) return null;
    const id = selected.id;
    setBusy(String(payload.action));
    busyRef.current = true;
    requestGeneration.current++;
    setNotice(null);
    try {
      const record = await api<CaseRecord>(`/api/cases/${id}/actions`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      replaceCase(record);
      if (success) setNotice({ kind: 'success', message: success });
      return record;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The action could not be completed.';
      setNotice({ kind: 'error', message });
      if (payload.action === 'approve') setReviewError(message);
      if (error instanceof RequestError && error.status === 409) await refresh().catch(() => {});
      return null;
    } finally {
      setBusy('');
      busyRef.current = false;
    }
  }

  async function propose() {
    const record = await action({ action: 'propose' });
    if (record) {
      const latest = record.proposals.at(-1);
      if (latest) {
        setReview(latest);
        setReviewError('');
      }
    }
  }

  async function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) || '').trim();
    let record: CaseRecord | null = null;
    if (modal === 'receipt')
      record = await action(
        {
          action: 'receive',
          quantity: Number(value('quantity')),
          reference: value('reference'),
          expectedRevision: selected?.sourceRevision,
        },
        'Receipt recorded. Review the updated discrepancy before approving changes.',
      );
    if (modal === 'credit')
      record = await action(
        {
          action: 'credit',
          amountCents: Math.round(Number(value('amount')) * 100),
          reference: value('reference'),
        },
        'Supplier credit recorded. A new reconciliation approval is required.',
      );
    if (modal === 'assign')
      record = await action(
        { action: 'assign', owner: value('owner'), reviewer: value('reviewer') },
        'Case assignments updated.',
      );
    if (record) setModal(null);
    if (modal === 'create') {
      setBusy('create');
      busyRef.current = true;
      requestGeneration.current++;
      const input: NewCaseInput = {
        supplier: value('supplier'),
        poNumber: value('poNumber'),
        invoiceNumber: value('invoiceNumber'),
        sku: value('sku'),
        description: value('description'),
        orderedUnits: Number(value('orderedUnits')),
        invoicedUnits: Number(value('invoicedUnits')),
        receivedUnits: Number(value('receivedUnits')),
        unitPriceCents: Math.round(Number(value('unitPrice')) * 100),
      };
      try {
        const created = await api<CaseRecord>('/api/cases', {
          method: 'POST',
          body: JSON.stringify(input),
        });
        selectedId.current = created.id;
        setSelected(created);
        replaceCase(created);
        setModal(null);
        setDocumentId(null);
        setTab('evidence');
        setMobileCase(true);
        setNotice({
          kind: 'success',
          message: `${created.invoiceNumber} added to your workspace.`,
        });
      } catch (error) {
        setNotice({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not create the case.',
        });
      } finally {
        setBusy('');
        busyRef.current = false;
      }
    }
    if (modal === 'upload' && selected) {
      setBusy('upload');
      busyRef.current = true;
      requestGeneration.current++;
      try {
        const updated = await api<CaseRecord>(`/api/cases/${selected.id}/documents`, {
          method: 'POST',
          body: form,
        });
        replaceCase(updated);
        const uploaded = updated.documents.at(-1);
        if (uploaded) setDocumentId(uploaded.id);
        setEvidenceIndex(null);
        setModal(null);
        setNotice({
          kind: 'info',
          message: 'Document received. Extraction status will update in the evidence list.',
        });
      } catch (error) {
        setNotice({
          kind: 'error',
          message: error instanceof Error ? error.message : 'Could not upload the document.',
        });
      } finally {
        setBusy('');
        busyRef.current = false;
      }
    }
  }

  const cases = workspace?.cases || [];
  const visibleCases = useMemo(
    () =>
      cases.filter(
        (c) =>
          (filter === 'all' ||
            (filter === 'open' ? c.status !== 'resolved' : c.status === filter)) &&
          `${c.supplier} ${c.invoiceNumber} ${c.poNumber} ${c.sku}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ),
    [cases, filter, search],
  );
  const totalDiscrepancy = cases.reduce(
    (sum, c) => sum + (c.status === 'resolved' ? 0 : totals(c).discrepancyCents),
    0,
  );
  const awaitingCount = cases.filter((c) => c.status === 'awaiting_approval').length;
  const resolvedCount = cases.filter((c) => c.status === 'resolved').length;
  const selectedTotals = selected ? totals(selected) : null;
  const currentDocument =
    selected?.documents.find((d) => d.id === documentId) ||
    selected?.documents.find((d) => d.kind === 'invoice') ||
    selected?.documents[0];
  const latestProposal = selected?.proposals.at(-1);
  const activeProposal =
    latestProposal &&
    latestProposal.status === 'pending' &&
    latestProposal.sourceRevision === selected?.sourceRevision &&
    latestProposal.ledgerRevision === selected?.ledgerRevision
      ? latestProposal
      : null;
  const allEvents = cases
    .flatMap((c) => c.history.map((event) => ({ ...event, supplier: c.supplier, caseRecord: c })))
    .sort((a, b) => b.at.localeCompare(a.at));

  if (loading || initialError)
    return (
      <div className="boot-screen">
        <Brand />
        <div className="boot-content">
          {loading ? (
            <>
              <LoaderCircle className="spin" size={24} />
              <h1>Opening your workspace</h1>
              <p>Preparing the exception desk and your sample records.</p>
            </>
          ) : (
            <>
              <CircleAlert size={28} />
              <h1>We couldn’t open the desk.</h1>
              <p>{initialError}</p>
              <button className="button primary" onClick={() => void initialize()}>
                <RefreshCw size={16} />
                Try again
              </button>
            </>
          )}
        </div>
        <span className="boot-footer">FINANCE OPERATIONS</span>
      </div>
    );

  return (
    <div className="app-shell">
      {showWelcome ? (
        <WorkspaceEntry
          canContinue={!!workspace}
          onExplore={() => void enterWorkspace('sample')}
          onCreate={() => void enterWorkspace('own')}
          onContinue={() => navigate(view === 'activity' ? 'activity' : 'exceptions')}
          onEndSession={workspace ? () => setModal('end_session') : undefined}
        />
      ) : (
        <OperationsConsole
          onGuide={() => navigate('home')}
          onEndSession={() => {
            if (!busyRef.current) {
              setNotice(null);
              setModal('end_session');
            }
          }}
          guideVisible={guideVisible}
          onHideGuide={() => setGuideVisible(false)}
          workspace={workspace}
          selected={selected}
          visibleCases={visibleCases}
          caseTotals={selectedTotals}
          totalDiscrepancy={totalDiscrepancy}
          view={view}
          onView={(next) => navigate(next === 'activity' ? 'activity' : 'exceptions')}
          search={search}
          onSearch={setSearch}
          filter={filter}
          onFilter={setFilter}
          busy={busy}
          notice={!modal && !review ? notice : null}
          dismissNotice={() => setNotice(null)}
          onModal={(name) => {
            setNotice(null);
            setModal(name);
          }}
          onRefresh={() =>
            void refresh().catch((error) => setNotice({ kind: 'error', message: error.message }))
          }
          onSelect={(record) => void selectCase(record)}
          mobileCase={mobileCase}
          onBack={() => setMobileCase(false)}
          tab={tab}
          onTab={setTab}
          currentDocument={currentDocument}
          onDocument={(id) => {
            setDocumentId(id);
            setEvidenceIndex(null);
          }}
          renderEvidence={(document) => (
            <EvidenceDocument
              document={document}
              evidenceIndex={evidenceIndex}
              onEvidence={setEvidenceIndex}
              busy={!!busy}
              onRetry={() =>
                void action(
                  { action: 'retry_document', documentId: document.id },
                  'Document extraction queued for another attempt.',
                )
              }
            />
          )}
          renderActivity={(record) => (
            <CaseActivity
              record={record}
              busy={!!busy}
              onRetry={(commandId) =>
                void action(
                  { action: 'retry', commandId },
                  'Execution request checked. Existing completed writes will not be duplicated.',
                )
              }
            />
          )}
          activeProposal={activeProposal}
          onReview={(proposal) => {
            setReview(proposal);
            setReviewError('');
          }}
          onPropose={() => void propose()}
          showOldProposals={showOldProposals}
          onToggleOld={() => setShowOldProposals((shown) => !shown)}
        />
      )}

      {modal && (
        <Dialog
          title={
            {
              receipt: 'Record accepted goods',
              credit: 'Record supplier credit',
              create: 'Open a new case',
              upload: 'Attach supporting evidence',
              assign: 'Assign the work',
              policy: 'Workspace policy',
              reset: 'Reset this workspace?',
              end_session: 'End this session?',
            }[modal]
          }
          description={
            {
              receipt: 'Add a receipt to this case. Existing proposals will need review.',
              credit: 'Record a credit issued by the supplier. Applying it requires approval.',
              create: 'Enter a supported invoice and its order details. USD, whole units, no tax.',
              upload: 'Upload a text document for extraction and source verification.',
              assign: 'Set the internal owner and reviewer for this case.',
              policy: 'The rules used to prepare and verify action plans.',
              reset:
                'Replace your cases with the original sample records. This affects only your private workspace.',
              end_session: 'End access to this private workspace on this browser.',
            }[modal]
          }
          onClose={() => {
            if (!busy) setModal(null);
          }}
          wide={modal === 'create'}
        >
          {notice?.kind === 'error' && (
            <div className="dialog-error" role="alert">
              <CircleAlert size={16} />
              {notice.message}
            </div>
          )}
          {modal === 'policy' ? (
            <div className="policy-content">
              <div className="dialog-scroll">
                <div className="policy-intro">
                  <ShieldCheck size={24} />
                  <div>
                    <strong>Quantity reconciliation</strong>
                    <span>Explicit review before ledger changes</span>
                  </div>
                </div>
                <dl>
                  <div>
                    <dt>Supported currency</dt>
                    <dd>USD</dd>
                  </div>
                  <div>
                    <dt>Quantity tolerance</dt>
                    <dd>0 units</dd>
                  </div>
                  <div>
                    <dt>Approval scope</dt>
                    <dd>Current evidence + ledger revision</dd>
                  </div>
                  <div>
                    <dt>Credit application</dt>
                    <dd>Human approval required</dd>
                  </div>
                  <div>
                    <dt>Purchase order allocation</dt>
                    <dd>One invoice case per order</dd>
                  </div>
                  <div>
                    <dt>Unsupported records</dt>
                    <dd>Require review</dd>
                  </div>
                </dl>
                <p className="form-note">
                  This workspace uses synthetic records and an internal ledger. It does not send
                  payments or supplier emails.
                </p>
              </div>
              <div className="dialog-actions">
                <button className="button primary" onClick={() => setModal(null)}>
                  Understood
                </button>
              </div>
            </div>
          ) : modal === 'reset' ? (
            <div className="reset-content">
              <div className="dialog-scroll">
                <p>
                  New cases, uploaded evidence, approvals, and activity in this workspace will be
                  replaced. Download any reconciliation you want to keep first.
                </p>
              </div>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => setModal(null)}
                >
                  Keep workspace
                </button>
                <button
                  className="button danger"
                  disabled={!!busy}
                  onClick={async () => {
                    setBusy('reset');
                    busyRef.current = true;
                    requestGeneration.current++;
                    try {
                      await api('/api/session/reset', { method: 'POST', body: '{}' });
                      selectedId.current = null;
                      await refresh();
                      setDocumentId(null);
                      setReview(null);
                      setModal(null);
                      setNotice({
                        kind: 'success',
                        message: 'Your sample workspace has been reset.',
                      });
                    } catch (error) {
                      setNotice({
                        kind: 'error',
                        message:
                          error instanceof Error ? error.message : 'Could not reset workspace.',
                      });
                    } finally {
                      setBusy('');
                      busyRef.current = false;
                    }
                  }}
                >
                  {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
                  Reset sample data
                </button>
              </div>
            </div>
          ) : modal === 'end_session' ? (
            <div className="end-session-content">
              <div className="dialog-scroll">
                <p>
                  This workspace has no account or password to sign back in with. Export any records
                  you want to keep before ending the session.
                </p>
                <p>
                  Ending the session removes this browser’s access. It does not delete records or
                  cancel approved work already queued. Starting again opens a new workspace.
                </p>
                <p>
                  To go back and keep your work, close this dialog and choose <strong>Home</strong>.
                </p>
                {selected && (
                  <a
                    className="button secondary"
                    href={`/api/cases/${selected.id}/export`}
                    download
                  >
                    Export current case
                  </a>
                )}
              </div>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  disabled={!!busy}
                  onClick={() => setModal(null)}
                >
                  Keep working
                </button>
                <button
                  className="button danger"
                  disabled={!!busy}
                  onClick={() => void endSession()}
                >
                  {busy === 'end_session' && <LoaderCircle size={15} className="spin" />}
                  End session
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={submitForm} className="dialog-form">
              <div className="dialog-scroll">
                {modal === 'receipt' && (
                  <>
                    <div className="form-context">
                      <PackageCheck size={17} />
                      <span>{selected?.poNumber}</span>
                      <strong>
                        {selectedTotals?.receivedUnits} / {selected?.orderedUnits} units accepted
                      </strong>
                    </div>
                    <Field label="Accepted quantity">
                      <input
                        name="quantity"
                        type="number"
                        min="1"
                        step="1"
                        required
                        autoFocus
                        placeholder="e.g. 10"
                      />
                    </Field>
                    <Field label="Receipt reference">
                      <input name="reference" required maxLength={100} placeholder="e.g. GR-1042" />
                    </Field>
                    <p className="form-note">
                      Enter the newly accepted quantity, not the cumulative total. This form records
                      a manual entry.
                    </p>
                    {selected?.poNumber === 'PO-1042' && (
                      <button
                        type="button"
                        className="sample-fill"
                        onClick={(event) => {
                          const form = event.currentTarget.form;
                          const quantity = form?.elements.namedItem('quantity') as HTMLInputElement;
                          const reference = form?.elements.namedItem(
                            'reference',
                          ) as HTMLInputElement;
                          if (quantity && reference) {
                            quantity.value = '10';
                            reference.value = 'RCV-2042';
                          }
                        }}
                      >
                        <PackageCheck size={14} />
                        Fill sample: 10 late units<span>Review before recording</span>
                      </button>
                    )}
                  </>
                )}
                {modal === 'credit' && (
                  <>
                    <div className="form-context">
                      <FileCheck2 size={17} />
                      <span>{selected?.invoiceNumber}</span>
                      <strong>{money(selectedTotals?.discrepancyCents || 0)} discrepancy</strong>
                    </div>
                    <Field label="Credit amount (USD)">
                      <input
                        name="amount"
                        type="number"
                        min="0.01"
                        step="0.01"
                        required
                        autoFocus
                        placeholder="e.g. 400.00"
                      />
                    </Field>
                    <Field label="Supplier credit reference">
                      <input name="reference" required maxLength={100} placeholder="e.g. CN-2041" />
                    </Field>
                    <p className="form-note">
                      This records an existing supplier credit in the sample ledger. It does not
                      issue a credit on the supplier’s behalf.
                    </p>
                  </>
                )}
                {modal === 'assign' && (
                  <>
                    <Field label="Case owner">
                      <input
                        name="owner"
                        defaultValue={selected?.owner || ''}
                        required
                        maxLength={80}
                        autoFocus
                        placeholder="Finance owner"
                      />
                    </Field>
                    <Field label="Reviewer">
                      <input
                        name="reviewer"
                        defaultValue={selected?.reviewer || ''}
                        required
                        maxLength={80}
                        placeholder="Approval reviewer"
                      />
                    </Field>
                    <p className="form-note">
                      Assignments are internal workflow labels in this sample workspace.
                    </p>
                  </>
                )}
                {modal === 'upload' && (
                  <>
                    <div className="upload-case-context">
                      <span>DOCUMENTS MUST MATCH THIS CASE</span>
                      <strong>{selected?.supplier}</strong>
                      <p>
                        {selected?.poNumber} · {selected?.invoiceNumber} · Item {selected?.sku} ·
                        USD
                      </p>
                      <p>
                        Include these identifiers in the source. Enter the reference exactly as
                        printed on the document.
                      </p>
                    </div>
                    <Field label="Document type">
                      <select name="kind" defaultValue="receipt">
                        <option value="receipt">Goods receipt</option>
                        <option value="invoice">Supplier invoice</option>
                        <option value="purchase_order">Purchase order</option>
                        <option value="credit">Supplier credit</option>
                      </select>
                    </Field>
                    <Field label="Document reference">
                      <input
                        name="reference"
                        required
                        maxLength={100}
                        placeholder="Reference printed on the document"
                      />
                    </Field>
                    <Field
                      label="File"
                      hint="PDF with text, TXT, CSV, or JSON. Up to 5 MB and 8 PDF pages. Scanned PDFs need manual review."
                    >
                      <input
                        name="file"
                        type="file"
                        accept=".pdf,.txt,.json,.csv,text/plain,application/pdf,application/json,text/csv"
                        required
                      />
                    </Field>
                    {selected?.poNumber === 'PO-1042' &&
                    selected?.supplier.toLowerCase().includes('northstar') ? (
                      <div className="sample-downloads">
                        <span>SYNTHETIC NORTHSTAR DOCUMENTS</span>
                        <a
                          href="/samples/receipt-late.txt"
                          download
                          onClick={(event) => {
                            const form = event.currentTarget.closest('form');
                            const kind = form?.elements.namedItem('kind') as HTMLSelectElement;
                            const reference = form?.elements.namedItem(
                              'reference',
                            ) as HTMLInputElement;
                            if (kind && reference) {
                              kind.value = 'receipt';
                              reference.value = 'RCV-2042';
                            }
                          }}
                        >
                          <ArrowDownToLine size={13} />
                          Late receipt · RCV-2042
                        </a>
                        <a
                          href="/samples/credit-note.txt"
                          download
                          onClick={(event) => {
                            const form = event.currentTarget.closest('form');
                            const kind = form?.elements.namedItem('kind') as HTMLSelectElement;
                            const reference = form?.elements.namedItem(
                              'reference',
                            ) as HTMLInputElement;
                            if (kind && reference) {
                              kind.value = 'credit';
                              reference.value = 'CN-8821-01';
                            }
                          }}
                        >
                          <ArrowDownToLine size={13} />
                          Supplier credit · CN-8821-01
                        </a>
                        <p>
                          These files match Northstar, PO-1042. Download the late receipt first; the
                          link fills its type and reference. Select the downloaded file above, then
                          upload it to run extraction. After the discrepancy reaches $400, repeat
                          with the supplier credit.
                        </p>
                      </div>
                    ) : (
                      <details className="source-template">
                        <summary>Required source fields</summary>
                        <p>
                          Use your own TXT, CSV, JSON, or text PDF. Northstar sample downloads
                          belong to the sample case and will not match this case.
                        </p>
                        <pre>{`Document type: Goods receipt (or invoice, purchase order, supplier credit)\nSupplier: ${selected?.supplier}\nPurchase order: ${selected?.poNumber}\nInvoice: ${selected?.invoiceNumber}\nItem: ${selected?.sku}\nCurrency: USD\nReference: [the document's unique reference]\nAccepted quantity: [newly received whole units, for a receipt]\nCredit amount: [USD amount, for a supplier credit]`}</pre>
                        <p>
                          For an invoice or purchase order, include the whole-unit quantity, unit
                          price, and total. Replace the bracketed fields with the actual values for
                          your document.
                        </p>
                      </details>
                    )}
                    {!workspace?.service.inferenceEnabled && (
                      <p className="form-note warning-text">
                        Document extraction is not configured. You can use manual receipt and credit
                        entry instead.
                      </p>
                    )}
                  </>
                )}
                {modal === 'create' && (
                  <>
                    <div className="form-grid">
                      <Field label="Supplier">
                        <input
                          name="supplier"
                          required
                          autoFocus
                          maxLength={160}
                          placeholder="Supplier name"
                        />
                      </Field>
                      <Field label="Item description">
                        <input
                          name="description"
                          required
                          maxLength={200}
                          placeholder="e.g. Steel mounting brackets"
                        />
                      </Field>
                      <Field label="Purchase order reference">
                        <input name="poNumber" required maxLength={100} placeholder="PO-1042" />
                      </Field>
                      <Field label="Invoice reference">
                        <input
                          name="invoiceNumber"
                          required
                          maxLength={100}
                          placeholder="INV-2041"
                        />
                      </Field>
                      <Field label="Exact SKU">
                        <input name="sku" required maxLength={100} placeholder="BRK-040" />
                      </Field>
                      <Field label="Unit price (USD)">
                        <input
                          name="unitPrice"
                          type="number"
                          min="0.01"
                          step="0.01"
                          required
                          placeholder="40.00"
                        />
                      </Field>
                      <Field label="Ordered units">
                        <input
                          name="orderedUnits"
                          type="number"
                          min="1"
                          step="1"
                          required
                          placeholder="120"
                        />
                      </Field>
                      <Field label="Invoiced units">
                        <input
                          name="invoicedUnits"
                          type="number"
                          min="1"
                          step="1"
                          required
                          placeholder="120"
                        />
                      </Field>
                      <Field label="Accepted units so far">
                        <input
                          name="receivedUnits"
                          type="number"
                          min="0"
                          step="1"
                          required
                          defaultValue="0"
                        />
                      </Field>
                    </div>
                    <p className="form-note">
                      One invoice per purchase order. Split invoicing, taxes, discounts, and foreign
                      exchange are outside this workspace’s policy. New records are labeled
                      synthetic.
                    </p>
                  </>
                )}
              </div>
              <div className="dialog-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={!!busy}
                  onClick={() => setModal(null)}
                >
                  Cancel
                </button>
                <button
                  className="button primary"
                  type="submit"
                  disabled={!!busy || (modal === 'upload' && !workspace?.service.inferenceEnabled)}
                >
                  {busy ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : modal === 'upload' ? (
                    <Upload size={16} />
                  ) : (
                    <Check size={16} />
                  )}
                  {modal === 'create'
                    ? 'Create case'
                    : modal === 'upload'
                      ? 'Upload document'
                      : modal === 'assign'
                        ? 'Save assignments'
                        : 'Record evidence'}
                </button>
              </div>
            </form>
          )}
        </Dialog>
      )}

      {review && selected && (
        <Dialog
          title={
            review.type === 'hold' ? 'Review the proposed hold' : 'Review credit reconciliation'
          }
          description="Approve the exact change below. The server checks evidence and policy again before execution."
          onClose={() => {
            if (!busy) {
              setReview(null);
              setReviewError('');
            }
          }}
        >
          <div className="proposal-review">
            <div className="dialog-scroll">
              <div className="proposal-meta">
                <span>{selected.invoiceNumber}</span>
                <span>Evidence revision {review.sourceRevision}</span>
              </div>
              {(review.sourceRevision !== selected.sourceRevision ||
                review.ledgerRevision !== selected.ledgerRevision ||
                review.status === 'stale') && (
                <div className="stale-warning">
                  <CircleAlert size={18} />
                  <div>
                    <strong>The evidence has changed.</strong>
                    <p>
                      This proposal uses an earlier revision. An approval attempt will be checked
                      against the current records.
                    </p>
                  </div>
                </div>
              )}
              <div className="proposal-amount">
                <span>
                  {review.type === 'hold' ? 'Proposed internal hold' : 'Credit to reconcile'}
                </span>
                <strong>
                  {money(review.type === 'hold' ? review.amountCents : review.creditCents)}
                </strong>
              </div>
              <div className="proposal-diff">
                <div>
                  <span>Current hold</span>
                  <strong>{money(selected.heldCents)}</strong>
                </div>
                <ArrowDownToLine size={17} />
                <div>
                  <span>Hold after execution</span>
                  <strong>{money(review.amountCents)}</strong>
                </div>
              </div>
              <ul className="proposal-checklist">
                {review.type === 'hold' ? (
                  <>
                    <li>
                      <Check size={14} />
                      Record the approved hold in the internal ledger
                    </li>
                    <li>
                      <Check size={14} />
                      Create the dispute and supplier follow-up task
                    </li>
                    <li>
                      <Check size={14} />
                      Read back and verify the recorded changes
                    </li>
                  </>
                ) : (
                  <>
                    <li>
                      <Check size={14} />
                      Apply the verified supplier credit
                    </li>
                    <li>
                      <Check size={14} />
                      {review.amountCents === 0
                        ? 'Release the hold and resolve the exception'
                        : `Reduce the hold to ${money(review.amountCents)}; keep the exception open`}
                    </li>
                    <li>
                      <Check size={14} />
                      Keep the remaining purchase order quantity open
                    </li>
                  </>
                )}
              </ul>
              <div className="proposal-policy">
                <ShieldCheck size={14} />
                <span>
                  Policy {review.policyVersion} · Ledger revision {review.ledgerRevision}
                </span>
              </div>
              {reviewError && (
                <div className="dialog-error" role="alert">
                  <CircleAlert size={17} />
                  <span>{reviewError}</span>
                </div>
              )}
              <p className="form-note">No payment or external message will be sent.</p>
            </div>
            <div className="dialog-actions">
              <button
                className="button secondary"
                disabled={!!busy}
                onClick={() => {
                  setReview(null);
                  setReviewError('');
                }}
              >
                Close review
              </button>
              {reviewError ? (
                <button className="button primary" disabled={!!busy} onClick={() => void propose()}>
                  {busy ? <LoaderCircle size={15} className="spin" /> : <RefreshCw size={15} />}
                  Prepare updated plan
                </button>
              ) : (
                <button
                  className="button primary"
                  disabled={!!busy || review.status === 'applied' || review.status === 'approved'}
                  onClick={async () => {
                    const updated = await action({ action: 'approve', proposalId: review.id });
                    if (updated) {
                      setReview(null);
                      setNotice({
                        kind: 'info',
                        message: 'Approval recorded. Follow execution in the activity log.',
                      });
                    }
                  }}
                >
                  {busy === 'approve' ? (
                    <LoaderCircle size={15} className="spin" />
                  ) : (
                    <Check size={15} />
                  )}
                  {review.status === 'applied'
                    ? 'Already applied'
                    : review.status === 'approved'
                      ? 'Already approved'
                      : 'Approve changes'}
                </button>
              )}
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <Inbox size={25} />
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function EvidenceDocument({
  document,
  evidenceIndex,
  onEvidence,
  busy,
  onRetry,
}: {
  document: CaseDocument;
  evidenceIndex: number | null;
  onEvidence: (index: number | null) => void;
  busy: boolean;
  onRetry: () => void;
}) {
  const evidence = evidenceIndex === null ? null : document.evidence[evidenceIndex];
  const quoteRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const quote = quoteRef.current;
    if (!quote) return;
    // Keep the selected quote inside its source panel without moving the application shell.
    const source = quote.closest('pre');
    if (!source) return;
    const quoteBounds = quote.getBoundingClientRect();
    const sourceBounds = source.getBoundingClientRect();
    source.scrollTo({
      top: source.scrollTop + quoteBounds.top - sourceBounds.top - source.clientHeight / 3,
      behavior: 'auto',
    });
  }, [document.id, evidenceIndex]);
  const quoteIndex = evidence ? document.text.indexOf(evidence.quote) : -1;
  const start =
    evidence && document.text.slice(evidence.start, evidence.end) === evidence.quote
      ? evidence.start
      : quoteIndex;
  const end = evidence ? start + evidence.quote.length : -1;
  return (
    <div className="evidence-document">
      <div className="document-meta">
        <span>{document.reference}</span>
        <span className={`document-status ${document.status}`}>
          {document.status === 'verified' ? (
            <Check size={12} />
          ) : document.status === 'pending' ? (
            <LoaderCircle size={12} className="spin" />
          ) : (
            <CircleAlert size={12} />
          )}
          {document.status === 'verified'
            ? document.model
              ? 'Extraction verified'
              : 'Recorded sample'
            : document.status === 'pending'
              ? 'Extracting'
              : 'Needs review'}
        </span>
      </div>
      <div className="document-paper">
        <div className="paper-brand">{documentLabels[document.kind].toUpperCase()}</div>
        <pre>
          {evidence && start >= 0 ? (
            <>
              {document.text.slice(0, start)}
              <mark ref={quoteRef}>{document.text.slice(start, end)}</mark>
              {document.text.slice(end)}
            </>
          ) : (
            document.text || 'Source text will appear after extraction.'
          )}
        </pre>
        <span className="paper-corner" />
      </div>
      {document.extractionError && (
        <div className="document-error">
          <CircleAlert size={16} />
          {document.extractionError}
        </div>
      )}
      {document.status === 'needs_review' && (
        <p className="document-recovery">
          Replace with a corrected document using the same type and reference. Retry extraction is
          for a temporary extraction failure.
        </p>
      )}
      {document.status === 'needs_review' && (
        <button
          className="button secondary full retry-extraction"
          disabled={busy}
          onClick={onRetry}
        >
          <RefreshCw size={15} />
          Retry extraction
        </button>
      )}
      {document.evidence.length > 0 && (
        <div className="evidence-fields">
          <span className="eyebrow">
            {document.model ? 'INSPECT EXTRACTED FIELDS' : 'INSPECT RECORDED FIELDS'}
          </span>
          <div>
            {document.evidence.map((field, index) => (
              <button
                key={`${field.field}-${index}`}
                className={evidenceIndex === index ? 'active' : ''}
                onClick={() => onEvidence(evidenceIndex === index ? null : index)}
              >
                <span>{fieldLabel(field.field)}</span>
                <strong>
                  {/Cents$/.test(field.field) && Number.isFinite(Number(field.value))
                    ? money(Number(field.value))
                    : field.value}
                </strong>
                <ArrowUpRight size={11} />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CaseActivity({
  record,
  busy,
  onRetry,
}: {
  record: CaseRecord;
  busy: boolean;
  onRetry: (commandId: string) => void;
}) {
  return (
    <div className="activity-content">
      {record.executions.length > 0 && (
        <section className="execution-panel panel">
          <div className="section-title compact">
            <h3>Execution records</h3>
            <span className="subtle-label">READ-BACK VERIFICATION</span>
          </div>
          {[...record.executions].reverse().map((execution) => (
            <div className="execution-row" key={execution.id}>
              <span className={`execution-symbol ${execution.status}`}>
                {execution.status === 'applied' ? (
                  <CheckCheck size={18} />
                ) : execution.status === 'queued' ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <CircleAlert size={18} />
                )}
              </span>
              <div>
                <strong>
                  {execution.type === 'hold' ? 'Apply approved hold' : 'Reconcile and release hold'}
                </strong>
                <span>
                  {execution.status === 'applied'
                    ? `${money(execution.beforeHeldCents || 0)} → ${money(execution.afterHeldCents || 0)} held · Verified`
                    : execution.error || execution.status}
                </span>
              </div>
              <button
                className="button secondary small"
                disabled={busy || execution.status === 'queued'}
                onClick={() => onRetry(execution.id)}
              >
                <RefreshCw size={12} />
                {execution.status === 'applied' ? 'Check retry' : 'Retry'}
              </button>
            </div>
          ))}
        </section>
      )}
      <section className="timeline-panel panel">
        <div className="section-title compact">
          <h3>Case history</h3>
          <span className="subtle-label">{record.history.length} EVENTS</span>
        </div>
        <div className="timeline">
          {[...record.history].reverse().map((event, index) => (
            <div className={`timeline-event ${index === 0 ? 'latest' : ''}`} key={event.id}>
              <span className="timeline-point">{index === 0 ? <Check size={10} /> : null}</span>
              <div>
                <div className="timeline-title">
                  <strong>{event.title}</strong>
                  <time>{time(event.at)}</time>
                </div>
                <p>{event.detail}</p>
                <span>
                  {event.actor} · {date(event.at)} · Revision {event.revision}
                </span>
              </div>
            </div>
          ))}
          {record.history.length === 0 && (
            <Empty title="No case activity yet" text="Recorded actions will appear here." />
          )}
        </div>
      </section>
    </div>
  );
}
