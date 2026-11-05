# Judge quickstart

Open [Shortfall](https://shortfall.95.179.254.189.sslip.io) in a fresh private/incognito window. You do not need an account, API key, environment file, or local installation. Choose **Explore a sample case** or **Create your own case** to start a private anonymous workspace with a seven-day session. Opening the entry page alone does not create a session. Keeping the same browser session preserves access; a separate private session can start a separate workspace.

The Home/End session behavior below passed local verification on 5 November. Its public deployment is pending.

Use synthetic records. The application records real changes in its internal demonstration ledger; it does not send payments or update an ERP.

## Explore the sample

Choose **Explore a sample case** at the entry screen. **Home** returns to entry while preserving the current workspace; **Return to workspace** resumes it.

1. Open Northstar Components, invoice INV-8821 and purchase order PO-1042. The invoice has 120 units at $40; the initial accepted quantity is 100. Confirm the $800 discrepancy.
2. Select **Prepare resolution**. Inspect the $800 proposal, then close review without approving.
3. Open document upload. Download the [late receipt](https://shortfall.95.179.254.189.sslip.io/samples/receipt-late.txt), choose Goods receipt, and use reference **RCV-2042**. Select the downloaded file and upload.
4. Wait for **Extraction verified**. Inspect a highlighted source quote. Accepted quantity becomes 110 and the discrepancy becomes $400.
5. Expand **Previous proposals**, open the $800 proposal, and attempt **Approve changes**. The server rejects it because the evidence changed; the held amount remains zero.
6. Select **Prepare updated plan**, review the $400 amount, and approve. Wait for **On hold** and inspect the execution record.
7. Upload the [supplier credit](https://shortfall.95.179.254.189.sslip.io/samples/credit-note.txt) as Supplier credit, reference **CN-8821-01**. Wait for verified extraction.
8. Select **Prepare resolution**, review the credit plus hold-release correction, and choose **Approve changes**. Confirm **Resolved**, net invoice **$4,400**, held amount **$0**, and **10 PO units open**.
9. Export the reconciliation or case record and refresh the browser. The saved state remains.

The initial documents are labeled recorded samples. Uploaded receipt/credit documents invoke the live model. Do not add the same receipt manually and upload it under a different reference; that describes two receiving events.

## Create your own case

Choose **Create your own case** at entry or **New case** in the workspace. Enter explicit case fields; the application does not infer a complete case from an arbitrary invoice upload.

A different synthetic example:

| Field | Value |
| --- | --- |
| Supplier | Larch Test Supply |
| Purchase order | PO-JUDGE-45 |
| Invoice | INV-JUDGE-45 |
| Item/SKU | BX-JUDGE |
| Description | Transit boxes |
| Ordered and invoiced units | 45 |
| Initially accepted units | 38 |
| Unit price | $12.50 |

Expected initial discrepancy: **7 × $12.50 = $87.50**. Add a new receipt for three units under a new receipt reference. Accepted quantity becomes 41, leaving **$50** unmatched. A matching $50 quantity credit can reconcile the invoice to **$512.50**, leaving four PO units open, after approval.

Manual entry creates labeled synthetic source records. To test extraction, attach your own supported document with matching supplier, PO, invoice where required, SKU, explicit USD, quantity, and unique document reference. The Northstar download files belong to Northstar and should fail linkage if attached to Larch.

Owner/reviewer fields support assignment. They are labels in this anonymous demo, not separately authenticated employee roles.

## Navigate and end a session

Home, Exceptions, and Activity use `#home`, `#exceptions`, and `#activity`. Browser Back and Forward move between these views without replacing the selected case or session. Case history has its own **Activity** tab. Long records and lists scroll inside their panels, keeping the page and primary actions usable.

To leave the anonymous workspace, choose **End session** and confirm **End session** in the dialog. **Keep working** cancels. Export anything needed first: ending a session revokes its server token, expires its browser cookie, and removes browser access to that workspace. There is no account-based recovery. Approved queued work, stored records, and spending accounting remain. Reload stays on Home; a new session starts only when you explicitly choose Explore or Create again.

## Useful checks

- Open a second private browser session. Its cases and reset are separate.
- Create a second invoice against the same supplier/PO. The application rejects unsupported split invoicing.
- Inspect an applied execution and use **Check retry**. The command keeps its prior result.
- Supply conflicting identifiers or an unsupported source. The case stays in review.
- Reset affects the current workspace's cases; it does not reset model-spend accounting.

The navigation/layout regression checks passed locally at 1280 × 560, 1366 × 650, 1440 × 760, and 390 × 700. They verify bounded page layout, internal scrolling, reachable dialog actions, keyboard access, history, and session ending. These new regression checks are separate from the earlier public workflow tests.

If the file itself needs correction, upload a corrected file using the same document type and reference. This supersedes the current source while preserving its history. **Retry extraction** processes the same source again; it does not repair missing fields. A pending or unverified current document blocks a new proposal.

## Input and operating limits

The first release supports one invoice per supplier/PO, one item, whole units, USD, and an agreed unit price. It excludes taxes, freight, foreign exchange, split invoices, scanned PDFs, and multi-item allocation.

Uploads accept text PDF, TXT, CSV, and JSON: at most 5 MB, eight PDF pages, and 20 KB of extracted text. Model input/output and call quotas are bounded. A workspace permits ten cases, two active extraction jobs, and a $1 inference allowance within the application-wide cap. If extraction allowance is exhausted, the seeded/manual workflow remains available.

The [health endpoint](https://shortfall.95.179.254.189.sslip.io/api/health) reports database availability and worker heartbeat. Vultr hosts the web/API, worker, and PostgreSQL. The worker calls Claude Opus 5.5; source validation, approval checks, arithmetic, and ledger changes run in application code.

[Repository](https://github.com/Huzyefahwasim/vultr-hackathon) · [Architecture](../architecture.md) · [Workflow verification](../evaluation.md) · [Document evaluation](../evaluation-results.md)

The document report preserves three separate sets: the original 24-document baseline, three targeted CSV reruns after a correction, and four fresh CSV holdout documents. It includes expected review outcomes and exact field counts, rather than a combined accuracy claim.
