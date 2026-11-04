# Shortfall architecture

Implementation snapshot: 4 November 2026. Public HTTPS, database/worker health, five API/browser checks, and live Opus receipt/credit extraction passed on Vultr. The deployed worker completed the sample reconciliation and rejected the stale approval.

## Processes and persistence

One TypeScript repository runs as a Next.js web/API process and separate Node worker. Docker Compose runs PostgreSQL, migration, web, worker, and Caddy services on one Vultr VM. The application image contains the full Node.js 24 runtime and installed dependencies, running npm start or npm run worker as appropriate. Web owns sessions, input validation, uploads, proposals, approvals, and exports. The worker performs extraction and approved commands.

~~~mermaid
flowchart TD
    Visitor[Browser session] --> Proxy[Caddy HTTPS]
    subgraph Vultr[Vultr VM]
        Proxy --> Web[Next.js UI and API]
        Web --> DB[(PostgreSQL)]
        Worker[Node worker] --> DB
        Migration[Schema migration] --> DB
    end
    Worker --> Model[Anthropic Claude Opus 5.5]
    Web --> Export[CSV and JSON case exports]
~~~

A case's JSONB record contains receipts, credits, normalized source text, evidence spans, proposals, assignments, history, and execution results. Relational tables hold workspaces, hashed sessions, commands, jobs, heartbeats, extraction cache entries, and inference reservations. The prototype retains upload hashes and normalized text, not original file bytes.

The named database volume survives container replacement. Caddy has certificate/configuration volumes. PostgreSQL binds to the VM loopback interface; application containers use the private Compose network. Only the proxy publishes application HTTP/HTTPS ports.

## Intake and evidence

The case form accepts explicit business fields and creates labeled synthetic source records. This manual path does not invoke the model. Visitors can attach supported documents to a case for live extraction.

1. Derive workspace identity from the server-issued session and check request origin.
2. Bound multipart input before parsing. Accept PDF, TXT, CSV, and JSON up to 5 MB.
3. Require PDF text layers and at most eight pages; preserve page markers. Validate UTF-8 for text files, bound CSV/JSON rows, and cap normalized text at 20 KB.
4. Hash original bytes, normalize line endings, and store immutable text with type, reference, and import time. Identical content/type within a case reuses the existing document.
5. Save the extraction job and changed case in one transaction. New evidence invalidates pending approvals.
6. Ask Opus for structured fields and exact quotes. Missing required values cause review.
7. Check field types, currency, quantities, totals, and field-to-quote matches. Locate each unique quote in code and store UTF-16 offsets.
8. Lock the current case and verify business linkage before accepting extraction. A newer document with the same type/reference supersedes the earlier version.

Receipts require reference, supplier, PO, item, quantity, and explicit USD evidence. They may omit invoice reference, price, and total. Invoice/credit documents require invoice linkage and priced-line evidence; purchase orders need no invoice reference. The worker does not infer source fields from case context.

Extraction reads one immutable document. If unrelated evidence changes the case while extraction runs, the backend revalidates that document against the locked current case. It rejects a superseded source or mismatched identifiers. Acceptance increments the source revision and invalidates pending approvals.

Failed or conflicting documents remain in review. The interface supports retrying a current failed document and uploading a corrected replacement. There is no general inline editor for arbitrary extraction fields.

## Deterministic policy

The implemented policy, goods-quantity-v1, supports one invoice case per workspace/supplier/PO, one item, whole units, USD, and a matching unit price. Its version enters the proposal hash. This release has one policy and no policy-authoring interface.

A database uniqueness constraint prevents a second invoice case from reusing a supplier/PO receiving allocation. Split invoicing needs a future shared-allocation design.

Code uses integer cents to calculate invoice value, accepted receipt value, shortage, applied credits, remaining discrepancy, and open PO quantity. It rejects over-receipts, over-credits, conflicting prices, and negative inputs. A hold changes the internal held amount without rewriting the original invoice.

## Approval and execution

API mutations lock the workspace then the case. Worker execution takes the same case row lock. A source update and command execution therefore serialize on the case.

1. Build a proposal from source revision, ledger revision, policy version, evidence hashes, and exact action values.
2. Show the reviewer the hold or credit/release correction.
3. Recheck the approved proposal and insert its command/job in the same PostgreSQL transaction.
4. Return the previous receipt for an already-applied command. Otherwise recheck approval/version and save ledger, credit, task, history, and command receipt together.
5. Use a unique command per case/proposal to prevent duplicate logical actions.

Source changes invalidate pending proposals and cancel queued commands. If execution obtained the lock first, its applied result remains in history; new evidence requires another approved correction. Cancellation does not reverse an executed hold.

Credits require matching supplier, invoice, PO, item, currency, unique reference, and eligible amount. The reviewer approves credit application and hold release before closure. An outstanding PO balance remains open. No command initiates payment or updates an external ledger.

## Durable worker

The custom PostgreSQL queue claims jobs with FOR UPDATE SKIP LOCKED and serializes global admission with a short advisory lock. Jobs store status, attempts, availability, worker identity, lease expiry, and safe failure text.

- Leases last 120 seconds and renew every 15 seconds.
- Jobs permit two automatic attempts; SDK retries are disabled.
- At most two jobs run globally; a workspace may have two active extraction jobs.
- Expired leases can be reclaimed. Exhausted jobs mark the document or command for review.
- Applied commands return their previous result. Manual command retries preserve identity; extraction retries receive a new attempt identity.
- Heartbeats persist every ten seconds; a heartbeat older than 30 seconds appears offline.

Model calls run outside case transactions. Cache keys include workspace, source hash, document kind, model, prompt version, and schema version. Reused entries undergo source-span validation.

## Model and budget boundary

Only the worker loads ANTHROPIC_API_KEY. Locally it copies DATABASE_URL from .env.local, then loads .env.worker.local without overriding deployment variables. Compose gives the provider file only to the worker. An optional workspace ID supplies the anthropic-workspace-id header.

The selected model is claude-opus-5-5, with adaptive thinking, omitted thinking display, low effort, and structured JSON. Thinking blocks never enter case records, logs, or cache. The worker counts complete input requests, caps tokens, and does not switch models.

A PostgreSQL budget lock serializes $0.09 reservations. Limits are $40 globally, $1 per workspace, and ten workspace attempts. Completed calls settle reported usage; uncertain timeout reservations remain held. Demo reset preserves accounting. [Exact limits](inference-budget.md)

## Demo access and operating boundaries

Visitors receive isolated synthetic workspaces through HttpOnly cookies, Secure on HTTPS, with seven-day expiry. Session lookup checks both session and workspace expiry. Reads, mutations, uploads, reset, and exports use the cookie-derived workspace.

Origin checks protect writes. Limits bound workspace creation, case count, source documents, history, uploads, and inference. Behind the private Caddy upstream, session admission uses a proxy-overwritten client-IP header; arbitrary forwarded headers are not trusted by default.

Owner/reviewer labels demonstrate assignment, not separate authenticated people or enforced separation of duties. History is a transactional application record, not a tamper-proof compliance archive. Real company and personal data are outside this public demo.

## Deployment and remaining checks

Compose runs the schema migration before web/worker startup. Preserve the database volume during image updates. A manual dump restored into an isolated temporary database with nine tables, 34 cases, and seven inference reservations. The temporary database was removed and the application database remained unchanged. The backup helper is scripts/backup-database.sh; its Linux shell syntax was checked. Automated offsite backup remains outstanding.

Public HTTPS, fresh-session isolation, manual-entry reconciliation, live extraction, restart/container replacement, and restoration have passed. A queued $800 hold survived replacement, the session persisted, and replay produced exactly one execution and one task. Use scripts/smoke-recovery.mjs prepare and verify around a deliberate restart. Keep the prior image for rollback. A single VM does not provide high availability. [Evaluation](evaluation.md)
