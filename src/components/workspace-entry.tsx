'use client';
import { useState } from 'react';
import { ArrowRight, FileText, HelpCircle, LockKeyhole, LogOut, Plus } from 'lucide-react';
import { HelpDialog } from './operations-console';
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
  const [help, setHelp] = useState(false);
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
          <LockKeyhole size={13} />
          Private workspace
        </span>
        {canContinue && (
          <button className="button secondary" onClick={onContinue}>
            Return to workspace
            <ArrowRight size={14} />
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
          <span className="eyebrow">INVOICE OPERATIONS</span>
          <h1>Resolve an invoice exception</h1>
          <p>
            Compare the invoice with accepted goods. Review the evidence, then approve the
            correction.
          </p>
        </div>
        <div className="entry-choices">
          <button className="entry-choice sample-choice" onClick={onExplore}>
            <FileText size={24} />
            <div>
              <strong>Explore a sample case</strong>
              <p>Resolve Northstar’s $800 discrepancy as a late receipt changes the amount.</p>
              <span>
                Open guided example
                <ArrowRight size={15} />
              </span>
            </div>
          </button>
          <button className="entry-choice" onClick={onCreate}>
            <Plus size={24} />
            <div>
              <strong>Create your own case</strong>
              <p>
                Enter a supplier, invoice, order and quantities. Add supporting records when ready.
              </p>
              <span>
                Start a case
                <ArrowRight size={15} />
              </span>
            </div>
          </button>
        </div>
        <div className="entry-footer">
          <p>USD · Whole units · One invoice per order</p>
          <button className="text-button" onClick={() => setHelp(true)}>
            <HelpCircle size={15} />
            How it works & workspace limits
          </button>
        </div>
        <p className="entry-boundary">
          Synthetic records. Internal ledger. No account or API key required.
        </p>
      </main>
      {help && (
        <HelpDialog title="How Shortfall works" onClose={() => setHelp(false)}>
          <ol className="help-steps">
            <li>
              <strong>Start a case.</strong> Use the sample or manually enter invoice and
              purchase-order details.
            </li>
            <li>
              <strong>Inspect Documents.</strong> Upload a text PDF, TXT, CSV or JSON, then select a
              field to read its supporting quote.
            </li>
            <li>
              <strong>Review the change.</strong> Approve against the current evidence. New evidence
              invalidates older proposals.
            </li>
            <li>
              <strong>Verify and export.</strong> Inspect execution receipts and case history in
              Activity.
            </li>
          </ol>
          <p className="form-note">
            The workspace supports exact item identifiers, whole quantities and USD. Split
            invoicing, tax and foreign exchange are outside its policy.
          </p>
          <p className="form-note">
            Records are synthetic and isolated from other visitors. The internal ledger does not
            issue payments, send supplier messages or update an ERP.
          </p>
        </HelpDialog>
      )}
    </div>
  );
}
