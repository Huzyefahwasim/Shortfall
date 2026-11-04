# Four-minute demonstration

Use a fresh synthetic workspace at [Shortfall](https://shortfall.95.179.254.189.sslip.io). Public HTTPS, five API/browser checks, and live extraction on the deployed worker have passed. Check that the worker is online and extraction enabled before recording.

A recording of the actual public workflow is complete: 1 minute 53.16 seconds, with captions and no audio. Its checks passed. The WebM remains an ignored local draft; it is not published as the final submission. Use scripts/record-demo.mjs to repeat the capture. The four-minute structure below includes the narration and business context still needed for the final presentation.

Download the two sample documents before recording: [late receipt](../public/samples/receipt-late.txt) and [supplier credit](../public/samples/credit-note.txt). They belong to Northstar Components, PO-1042, invoice INV-8821, item BR-40. The upload dialog also supplies download links and fills the sample reference/type.

## Run of show

| Time | Presenter action | Visible evidence |
| --- | --- | --- |
| 0:00–0:25 | Open Northstar and explain the receiving discrepancy. | Invoice: 120 × $40 = $4,800. Accepted: 100 units. Discrepancy: $800. |
| 0:25–0:45 | Select Prepare resolution, inspect the $800 hold, then close review without approving. | Proposal binds to the current evidence and ledger revisions. |
| 0:45–1:15 | Upload receipt-late.txt as Goods receipt, reference RCV-2042. Wait for verified extraction and inspect a highlighted field. | Opus extracted source evidence; accepted quantity becomes 110 and discrepancy becomes $400. |
| 1:15–1:45 | Expand Previous proposals, open the old $800 proposal, and select Approve changes. | The server rejects the outdated approval. No hold is applied. |
| 1:45–2:10 | Select Prepare updated plan, review $400, and approve. | Worker changes the internal held amount from $0 to $400 and records the task/result. |
| 2:10–2:45 | Upload credit-note.txt as Supplier credit, reference CN-8821-01. Inspect its verified source and prepare reconciliation. | Pending $400 credit is separate from the original invoice; the held amount remains until approval. |
| 2:45–3:15 | Approve the credit and hold-release correction. Open activity and export. | Invoice exception resolves; net $4,400, held $0, open PO quantity 10. |
| 3:15–4:00 | Explain Vultr deployment, the buyer, scope, observed tests, and next validation. | Actual workflow and bounded claims, with no payment or ERP write. |

Do not enter a manual late receipt and also upload it under a different reference; those would describe two receiving events. The recording uses the document-upload path for both receipt and credit.

## Suggested narration

"Receiving accepted 100 units, but finance has an invoice for 120. The reviewer needs to resolve the difference without approving an amount based on old evidence."

"The late receipt changes the shortage. This older proposal still says $800. The server refuses it because the evidence changed."

"The reviewer approves $400. The worker writes the internal hold and records the result. When the supplier credit arrives, another approval applies the credit and releases the hold."

"The invoice exception is resolved for $4,400. The remaining ten purchase-order units are still open. No payment has been sent."

Use your own phrasing and speak to the visible action. Describe the data as synthetic and the ledger as internal.

## Evidence and fallback

Both local and public live smoke runs used the selected Opus model for the uploaded receipt and credit. Local provider latencies were about 3.2 and 5.7 seconds for that one pair; they are not a latency benchmark.

If extraction fails, show its review state and retry only within the remaining allowance. A manual-entry walkthrough may demonstrate the deterministic workflow, but label it as manual entry rather than a live extraction run. Record a successful actual run; identify any elapsed-time cuts.

The five public API/browser checks, live receipt/credit workflow, deployed restart/container replacement, and isolated backup restoration have passed. Repeat relevant checks when a change or failure warrants it. Finish narration and verify that the final recording, PDF slides, public URL, and repository links open without the developer's credentials.
