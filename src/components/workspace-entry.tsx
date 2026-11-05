'use client';

import { ArrowRight, Check, FileText, LockKeyhole, LogOut, Plus, ShieldCheck } from 'lucide-react';

interface EntryProps {
  canContinue: boolean;
  onExplore: () => void;
  onCreate: () => void;
  onContinue: () => void;
  onEndSession?: () => void;
}

export function WorkspaceEntry({
  canContinue,
  onExplore,
  onCreate,
  onContinue,
  onEndSession,
}: EntryProps) {
  return (
    <div className="entry-screen">
      <header className="appbar entry-appbar">
        <div className="wordmark">
          <span className="wordmark-symbol" aria-hidden="true">
            <span />
            <span />
          </span>
          Shortfall<span className="product-area">Payables</span>
        </div>
        <span className="entry-session">
          <LockKeyhole size={14} />
          Private workspace
        </span>
        {canContinue && (
          <button className="button secondary" onClick={onContinue}>
            Return to workspace
            <ArrowRight size={15} />
          </button>
        )}
        {canContinue && onEndSession && (
          <button className="session-control" onClick={onEndSession}>
            <LogOut size={15} />
            End session
          </button>
        )}
      </header>
      <main className="entry-main">
        <div className="entry-introduction">
          <div className="eyebrow">INVOICE EXCEPTION WORKFLOW</div>
          <h1>Resolve an invoice exception</h1>
          <p>
            Compare what was billed with what was received. Inspect the source evidence, then
            approve the exact change to your ledger.
          </p>
        </div>
        <div className="entry-layout">
          <section className="entry-start" aria-label="Choose how to start">
            <h2>Choose a starting point</h2>
            <button className="entry-choice sample-choice" onClick={onExplore}>
              <span className="entry-choice-icon">
                <FileText size={22} />
              </span>
              <span>
                <strong>Explore a sample case</strong>
                <small>
                  Follow Northstar’s invoice from an $800 discrepancy to a verified resolution.
                </small>
              </span>
              <ArrowRight size={20} />
            </button>
            <button className="entry-choice" onClick={onCreate}>
              <span className="entry-choice-icon">
                <Plus size={23} />
              </span>
              <span>
                <strong>Create your own case</strong>
                <small>
                  Enter supplier, order, invoice, item, and quantities. Add supporting documents
                  after setup.
                </small>
              </span>
              <ArrowRight size={20} />
            </button>
            <div className="entry-scope">
              <ShieldCheck size={18} />
              <div>
                <strong>What this workspace supports</strong>
                <p>
                  One invoice per purchase order. Exact item identifiers, whole units, USD, and no
                  tax or foreign exchange.
                </p>
              </div>
            </div>
            <p className="entry-boundary">
              <Check size={14} />
              No account or API key required. Your changes persist when you refresh.
            </p>
          </section>
          <aside className="entry-workflow" aria-label="Workflow guide">
            <h2>Review workflow</h2>
            <ol>
              <li>
                <span>01</span>
                <div>
                  <strong>Set up the case</strong>
                  <p>Start with a sample or enter the invoice and purchase-order details.</p>
                </div>
              </li>
              <li>
                <span>02</span>
                <div>
                  <strong>Inspect the evidence</strong>
                  <p>
                    Upload supporting records. Click extracted fields to check their source text.
                  </p>
                </div>
              </li>
              <li>
                <span>03</span>
                <div>
                  <strong>Review the change</strong>
                  <p>
                    Approve a hold or credit against the current evidence. Changed sources
                    invalidate earlier proposals.
                  </p>
                </div>
              </li>
              <li>
                <span>04</span>
                <div>
                  <strong>Verify and export</strong>
                  <p>
                    Check the recorded changes and download the reconciliation with its history.
                  </p>
                </div>
              </li>
            </ol>
            <div className="entry-data-note">
              <span>SYNTHETIC BUSINESS RECORDS</span>
              <p>
                This workspace uses an internal ledger. It does not issue payments or send supplier
                messages.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
