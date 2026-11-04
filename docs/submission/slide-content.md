# Slide content and speaker notes

Use the ink/gray/blue finance-console design and actual screenshots. Export the presentation as PDF for submission. Use actual application and repository pages for the separate voiceover video.

## 1. Shortfall

**Invoice quantity exceptions for finance and receiving**

Review current source evidence, approve the exact change, and inspect the executed result.

Visual: one readable crop of the current application.

Speaker note: Introduce the AP reviewer and a late receiving record. Explain the task before discussing architecture.

## 2. A receipt can change the decision

Sources → comparison → approval → execution → reconciliation

Finance and receiving share one case with an owner, reviewer, evidence, and history.

Visual: five-step workflow, with the human approval step visible.

Speaker note: The proposal must remain tied to the records that supported it. New evidence requires another review.

## 3. Reject the obsolete $800 approval

120 invoiced × $40 = $4,800\
100 received → $800 discrepancy\
110 received → $400 discrepancy

The server rejects the previous proposal.

Visual: actual late-receipt upload, source highlight, and stale-approval response.

Speaker note: Show the old proposal before importing the new receipt. Attempt the old approval so the judge sees enforcement.

## 4. Reconcile the invoice; keep the order open

Approve $400 internal hold\
Verify $400 supplier credit\
Approve credit and hold release

**$4,400 net invoice · 10 PO units open**

Visual: actual final ledger, execution history, and export.

Speaker note: Importing the credit does not apply it. Approval precedes execution. This is an internal demonstration ledger with no payment or ERP write.

## 5. Vultr runs the workflow

Caddy → Next.js web/API → PostgreSQL\
Node worker → Claude Opus 5.5

PostgreSQL stores cases, evidence, approvals, durable jobs, and execution receipts.

Visual: one diagram with the Vultr boundary and external model API.

Speaker note: Opus extracts fields and quotes. Code checks evidence, amounts, and current approval versions. The worker keeps the provider key.

## 6. Checks with observable outcomes

| Evaluation set | Observed outcome |
| --- | --- |
| Frozen 24-document baseline | 9/12 supported documents accepted exactly; 3 sent to review. All 12 challenge expectations met. |
| Targeted CSV regression after correction | The 3 previous failures passed; 24/24 required fields correct. |
| Fresh 4-document CSV holdout | 2 supported documents passed with 18/18 fields correct; 2 correctly sent to review. |

28 unique synthetic documents · 31 settled calls · **$0.474656**

Visual: three-row table; keep the original baseline separate from the later CSV checks.

Speaker note: The baseline had 74/98 required fields correct, 24 abstained, and zero incorrectly accepted fields. The later rerun addressed a numeric CSV evidence-validation issue; it is a targeted regression, not held-out accuracy. All sets are small and project-authored, with no independent reviewer. Workflow tests also cover live public receipt/credit execution, restart recovery, isolated backup restoration, and competing budget requests.

Source: [Measured evaluation and reproducible artifacts](../evaluation-results.md). Do not combine the three sets into a single accuracy percentage.

## 7. Scope and buyer

| Product | Published or demonstrated scope |
| --- | --- |
| Ramp | Bills, POs, item receipts, and receiving information |
| Zip | Governed procurement and AP agents |
| Shortfall | Inspect a changing-evidence exception through an approved correction |

Proposed buyer: finance manager at a small distributor.\
Pilot pricing hypothesis: **$99 per workspace/month**.

Speaker note: This is an established category. Our demonstration focuses on a narrow review task; we have not proven competitors lack it. Validate the proposed pilot price with operators.

Sources: [Ramp](https://support.ramp.com/3-way-match-with-ramp-procurement), [Zip](https://zip.com/capabilities/superagents).

## 8. Next steps

Operator review → authenticated roles → accounting connector

Huzyefah Wasim · solo full-stack developer

[Try Shortfall](https://shortfall.95.179.254.189.sslip.io)\
[Read the repository](https://github.com/Huzyefahwasim/vultr-hackathon)

Speaker note: Ask judges to test both the supplied case and their own supported values. Customer validation and production integrations remain next steps.

## Assembly notes

Use [the narration](narration.txt) and [timing cues](narration-timing.json) for the roughly four-minute video. Keep the actual application demonstration near the middle for about two minutes. Source references can appear in small slide footers. The [rule review](rules-and-sources.md) describes required final media formats and the limits of the public narration-policy finding.
