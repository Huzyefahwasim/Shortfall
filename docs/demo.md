# Four-minute demonstration

Open [Shortfall](https://shortfall.95.179.254.189.sslip.io) in a fresh private browser window. Choose **Explore a sample case**; the **Guide** control reopens entry instructions. **Create your own case** opens explicit business-field intake. No account, API key, environment file, or installation is required.

The public Vultr application, three API checks, two browser checks, and live receipt/credit extraction have passed. The [published presentation](https://shortfall.95.179.254.189.sslip.io/submission/) uses real application actions, synthesized narration, and repository evidence. It runs **252.24 seconds (4:12)** at 1600 × 900, 25 fps, and is **15,884,185 bytes**. Technical encoding, delivery, browser playback, all eight seek points, and readable captions are verified.

- [MP4](https://shortfall.95.179.254.189.sslip.io/submission/demo.mp4), [cover](https://shortfall.95.179.254.189.sslip.io/submission/cover.png), and [captions](https://shortfall.95.179.254.189.sslip.io/submission/captions.vtt)
- [Narration](submission/narration.txt), [timing cues](submission/narration-timing.json), and [media credits](submission/media-notes.md)
- [Slide content and speaker notes](submission/slide-content.md); export the presentation as PDF for submission

## Run of show

These are scene planning targets, not exact chapter markers or measurements of application response time. The final presentation runs 4:12. Recorded actions retain their original speed. Only 4.88 seconds of idle capture-close time were removed; narration was normalized separately.

| Time | Action | Visible evidence |
| --- | --- | --- |
| 0:00–0:22 | Explain the receiving discrepancy. | Northstar invoice: 120 × $40 = $4,800; initially 100 units accepted; $800 discrepancy. |
| 0:22–0:45 | Show both entry choices and open the guided sample. | Private workspace, supported inputs, and independent-case entry. |
| 0:45–1:45 | Prepare the $800 hold without approving; upload the late receipt; inspect a source quote; attempt the previous approval. | Receipt RCV-2042 adds ten units; accepted quantity becomes 110; the server rejects the outdated $800 approval. |
| 1:45–2:39 | Approve the revised $400 hold. Upload the supplier credit, review it, then approve credit application and hold release. | Verified execution, net $4,400, held $0, ten PO units open, activity and export. |
| 2:39–3:00 | Show architecture documentation. | Vultr web/API, PostgreSQL, durable worker, and external Opus extraction. |
| 3:00–3:25 | Show the evaluation report and recovery checks. | Frozen baseline, targeted reruns, and fresh holdout remain separate. |
| 3:25–3:42 | Explain buyer and scope. | Existing category comparison; distributor finance manager and $99 pilot price are hypotheses. |
| 3:42–4:00 | Show roadmap, app, and repository. | Operator review, authenticated roles, accounting connector, and judge access. |

## Exact application path

Download the [late receipt](../public/samples/receipt-late.txt) and [supplier credit](../public/samples/credit-note.txt). They match Northstar Components, PO-1042, invoice INV-8821, SKU BR-40. The upload dialog provides these files and fills their type/reference. Other cases require documents matching their own identifiers.

1. Select **Prepare resolution**, inspect the $800 proposal, and **Close review** without approving.
2. Upload the late receipt as **Goods receipt**, reference **RCV-2042**. Wait for **Extraction verified** and inspect a highlighted field.
3. Open the old proposal through **Previous proposals** or **Review previous proposal**. Select **Approve changes**. Show the rejection and unchanged held amount.
4. Select **Prepare updated plan** and approve $400. Wait for **On hold** and inspect the execution history.
5. Upload the credit as **Supplier credit**, reference **CN-8821-01**. Verified import leaves it pending until approval.
6. Select **Prepare resolution** and approve the credit plus hold-release correction. Confirm **Resolved**, net **$4,400**, held **$0**, and **10 PO units open**.
7. Export the reconciliation or case record and refresh to demonstrate persistence.

Do not manually add the late receipt and also upload it under a different reference; those describe two receiving events. The recorded flow uses live extraction for receipt and credit. Initial case documents are labeled recorded samples.

## What the evidence supports

The frozen 24-document baseline accepted 9/12 supported documents exactly and sent three valid CSV files to review. All 12 challenge expectations were met. After a CSV evidence-validation correction, the three targeted reruns passed. Four fresh CSV cases then met their expected outcomes: two accepted with 18/18 critical fields correct, two withheld for review.

Across those separate sets: **28 unique synthetic documents, 31 settled calls, $0.474656**, with no uncertain usage. These are project-authored records with no independent reviewer. Keep the baseline, regression, and fresh holdout separate; do not present a combined accuracy percentage. [Full evaluation](evaluation-results.md)

The regular test run recorded 50 passes and one unconfigured database test skipped; the database integration test passed separately. Full typechecking and formatting checks passed. The latest public suite passed three API and two browser tests in 18.3 seconds. Additional public checks covered fresh own-case entry, the guide, persistence, visitor isolation, and desktop/mobile presentation. An additional deployed CSV upload verified nine exact evidence spans and the expected $22.50 hold. Restart/container replacement, isolated database restoration, and concurrent spending limits were exercised. [Workflow verification](evaluation.md)

The application persists internal ledger changes and follow-up tasks. It does not make payments, update an ERP, or contact suppliers. The sample demonstrates a $400 discrepancy resolved, not recovered cash or measured customer savings.

## Review and failure states

If extraction fails, show its review state. A corrected source should be uploaded using the same document type/reference; retrying an unchanged file does not add missing facts. A manual-entry walkthrough can demonstrate the deterministic workflow and must be described as manual entry. Keep model use within the remaining allowance.

Playback and readability review confirmed the $800 obsolete proposal, $400 current amount, $4,400 net invoice, ten open PO units, and closing credit. The published player returned no JavaScript or media errors. Presentation PDF and event-form completion remain. Standard guidance requires MP4/MOV up to 300 MB and PDF slides; the event form takes precedence. See [submission rules](submission/rules-and-sources.md) and the [judge quickstart](submission/judge-quickstart.md).
