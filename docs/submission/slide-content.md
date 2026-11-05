# Slide content and speaker notes

Eight slides, updated 6 November 2026. Use the slide text on screen and the notes when speaking. Add screenshots from the current application. Export the presentation as PDF for LabLab.

## 1. Shortfall

**The proposed hold was $800. A late receipt makes it $400.**

Review the changed evidence before approving the correction.

Huzyefah Wasim · solo developer

**Visual:** the previous proposal beside the current discrepancy.

**Speaker note:** Open with the reviewer facing two different amounts. Explain how the receipt changed the decision before introducing the architecture.

## 2. Reduce the work around a changed receipt

**Manual review:** compare invoice, order, and receipts; recalculate late changes; explain the decision to the next reviewer.

**With Shortfall:** inspect cited fields, calculated amounts, current approvals, assigned tasks, and shared history in one case.

**Expected time benefit:** less searching, repeated arithmetic, and handover work.

**Visual:** the manual steps beside the matching case views.

**Speaker note:** Existing accounting systems already offer matching controls. This workflow targets the work of resolving a changing exception. Time savings need operator measurement. Judges can open Northstar or create an independent case using the same engine.

Sources: [Microsoft invoice matching](https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/accounts-payable-invoice-matching) · [Ramp received quantity checks](https://support.ramp.com/hc/en-us/articles/30227975187731-3-Way-Match-with-Ramp-Procurement)

## 3. Show the approval that fails

120 invoiced × $40 = **$4,800**

100 received → **$800 discrepancy**

110 received → **$400 discrepancy**

**The server rejects the old $800 approval.**

**Visual:** the receipt quote and the rejected approval.

**Speaker note:** Prepare the old proposal before uploading the receipt. Inspect a field and its source quote. Try the earlier approval and show that the held amount stays at zero.

## 4. Finish the correction

Approve $400 hold → verify $400 credit → approve credit and hold release

**$4,400 net invoice · $0 held · 10 PO units open**

**Financial goal:** fewer overpayments and missed credits through checks on current quantities, recorded credits, and revised approvals.

**Visual:** reconciliation, execution history, and export.

**Speaker note:** These checks address the risk of approving unreceived quantities, overlooking a credit, or retaining an outdated hold. Importing the credit leaves it pending until approval. The $400 correction is not measured cash saved: the prototype has no bank connection. Explain why resolving the invoice leaves ten units open on the purchase order.

## 5. Run the workflow on Vultr

Vultr VM: **Next.js web/API + PostgreSQL + Node worker**

Worker → **Claude Opus 5.5** for fields and source quotes

Code validates evidence, calculates money, and checks the approval revision.

**Visual:** place the application, database, and worker inside the Vultr boundary.

**Speaker note:** Keep the model API outside that boundary. PostgreSQL stores jobs and execution receipts. The restart test resumed one hold with one execution and one task.

## 6. Keep the original test results visible

**Baseline, 24 documents:** 9/12 supported accepted, three sent to review; all 12 documents testing unsupported inputs, wrong case references, and embedded instructions produced the expected result.

**CSV correction, three targeted reruns:** 3/3 accepted, 24/24 required fields correct.

**Fresh CSV set, four documents:** two accepted with 18/18 fields correct; two withheld as expected.

**28 unique documents · 31 calls · $0.474656**

**Visual:** three labeled result blocks.

**Speaker note:** The baseline scored 74 correct critical fields, 24 abstentions, and zero incorrectly accepted fields out of 98 required. Keep the later CSV results separate. I created the synthetic records and labels; there was no independent reviewer. Use the linked verification record for current software test counts.

Sources: [Document evaluation](../evaluation-results.md) · [Workflow verification](../evaluation.md)

## 7. Start with a distributor's finance team

Proposed buyer: **finance manager at a small distributor**

Pilot price to test: **$99 per workspace/month**

Focus: review changed receiving evidence and approve the invoice correction.

**Visual:** buyer, user task, and proposed price.

**Speaker note:** The price needs operator validation. Ramp offers matching across bills, purchase orders, and receipts. Zip offers governed procurement/AP agents. Describe Shortfall's review flow without claiming an exclusive feature.

Sources: [Ramp](https://support.ramp.com/3-way-match-with-ramp-procurement) · [Zip](https://zip.com/capabilities/superagents)

## 8. Try a case, then inspect the result

Next: operator interviews → authenticated roles → accounting connector

Synthetic records and an internal ledger. No payment or ERP update.

[Live application](https://shortfall.95.179.254.189.sslip.io/) · [Repository](https://github.com/Huzyefahwasim/vultr-hackathon)

**Visual:** current app screenshot and a QR code to the application.

**Speaker note:** Ask judges to create a case with different supported values, inspect the evidence, and export the result. Keep customer validation and production integrations as the next steps.

[Complete spoken pitch](../pitch.md) · [Video](https://shortfall.95.179.254.189.sslip.io/submission/) · [Submission fields](entry.json) · [Requirements](rules-and-sources.md)

Workflow note: manual search, recalculation, and handover effort describe the target review scenario, not measured customer behavior. Microsoft and Ramp document matching controls and quantity discrepancies; neither source establishes Shortfall's time or cost savings. Validate those benefits with operators.
