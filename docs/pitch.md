# Shortfall spoken pitch

Updated 6 November 2026. Allow about four minutes, including pauses to show the receipt update, rejected approval, and final reconciliation. Use the [eight slide outline](submission/slide-content.md) alongside this script.

## Spoken script

I'm about to approve an eight hundred dollar hold on an invoice. A late receipt arrives, and the right amount drops to four hundred. I built Shortfall so a finance reviewer can see what changed before approving the correction.

Reviewing this manually means checking the invoice against the purchase order and receipts, recalculating when goods arrive, and recording why the amount changed. The next reviewer may have to reconstruct that decision. Existing accounting systems offer matching controls. I'm focusing on the exception itself: the changed evidence, the next action, and the approval needed to finish it.

In Northstar's case, the supplier invoices one hundred and twenty units at forty dollars each: four thousand eight hundred dollars. Receiving has accepted one hundred units, leaving eight hundred dollars unmatched. I prepare that hold, then upload a receipt for ten more units. Claude Opus extracts fields and supporting quotes. Code validates the source and recalculates the discrepancy.

We now have one hundred and ten accepted units and a four hundred dollar gap. I try to approve the old eight hundred dollar proposal. The server rejects it, leaving the ledger unchanged. I approve the revised four hundred dollar hold. The worker records it and creates a supplier follow up task.

Next, I upload a four hundred dollar supplier credit. I review the verified credit and release of the hold, then approve. The result is four thousand four hundred dollars net, zero held, and ten units still open on the purchase order. I can inspect the execution history and export the reconciliation.

I expect reviewers to spend less time finding source values, repeating arithmetic, and explaining previous decisions. They can inspect cited fields, calculated amounts, assignments, and history in one case. The financial goal is less staff time per case, fewer overpayments, and fewer missed credits. Checking current evidence and tracking the credit helps address three risks: approving unreceived quantities, overlooking a credit, or retaining an outdated hold.

Vultr runs the web application, API, PostgreSQL database, and worker. Claude Opus five point five handles extraction; code controls the amounts and approvals. An approved hold survived a container restart with one execution and one task.

The original evaluation accepted nine of twelve supported documents and sent three valid CSVs to review. Twelve documents testing unsupported inputs, wrong references, and embedded instructions produced the expected results. After a validator fix, the three reruns passed, followed by four fresh CSV cases. The report keeps these results separate.

This prototype uses synthetic records and an internal ledger, with no bank or ERP connection. Time and cost savings remain unmeasured; the four hundred dollar correction is not cash saved.

My proposed buyer is a distributor's finance manager. I'll test a ninety nine dollar monthly workspace price with operators, then add authenticated roles and an accounting connector. I'm Huzyefah Wasim. Try a sample or create your own case.

## Presentation cues

1. Show the $800 proposal and explain that a late receipt changes the amount to $400.
2. Explain the manual comparison, recalculation, and handover work, then show the case queue, source records, assignments, and history.
3. Upload the late receipt and inspect a supporting quote.
4. Attempt the old approval, approve the current hold, then verify and approve the credit.
5. Show $4,400 net, $0 held, and ten open PO units before exporting. Explain the expected time benefit and financial checks without calling the correction cash saved.
6. Show the Vultr architecture and the separate evaluation sets.
7. Explain the buyer and proposed pilot price.
8. Close with the application link and the next operator validation step.

Leave time for the model response and approval result. The four minute target describes the presentation, not application response time.

## Evidence behind the pitch

The [document report](evaluation-results.md) preserves the baseline of 24 documents: 74 correct required fields, 24 abstentions, and zero incorrectly accepted fields. It reports the targeted reruns and fresh CSV set separately. Across all three sets, 28 unique documents used 31 settled calls costing $0.474656.

The [verification record](evaluation.md) covers the deployed workflow, restart, restore, budget limits, and browser/API checks. Use its current release results when discussing test counts.

Workflow context: [Microsoft's invoice matching documentation](https://learn.microsoft.com/en-us/dynamics365/finance/accounts-payable/accounts-payable-invoice-matching) describes comparisons among invoices, purchase orders, and receipts, including quantity discrepancies. [Ramp's matching documentation](https://support.ramp.com/hc/en-us/articles/30227975187731-3-Way-Match-with-Ramp-Procurement) explains how received quantities inform bill review and the risk of paying for unreceived goods. These products already provide matching controls.

The manual search, recalculation, and handover work in this pitch describes the workflow targeted here. It is a qualitative assumption to validate with operators, not measured customer behavior or a claim that existing products lack controls. Expected time and cost benefits remain hypotheses. The demonstration verifies a ledger correction, not a bank payment prevented or cash saved.

## Submission links

- [Live application](https://shortfall.95.179.254.189.sslip.io/)
- [Public repository](https://github.com/Huzyefahwasim/vultr-hackathon)
- [Presentation player](https://shortfall.95.179.254.189.sslip.io/submission/)
- [MP4 download](https://shortfall.95.179.254.189.sslip.io/submission/demo.mp4)
- [Cover image](https://shortfall.95.179.254.189.sslip.io/submission/cover.png)
- [Captions](https://shortfall.95.179.254.189.sslip.io/submission/captions.vtt)
- [Form text](submission/entry.json)
- [Slide content and speaker notes](submission/slide-content.md)

Export the completed presentation as PDF. Check the event form after signing in for the exact cutoff, required uploads, and extra fields. [Current submission requirements](submission/rules-and-sources.md)
