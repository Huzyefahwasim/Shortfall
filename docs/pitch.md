# Shortfall pitch

Presentation outline, 4 November 2026. [Slide content and speaker notes](submission/slide-content.md) cover the eight-slide pitch. Target about four minutes for the voiceover video, with roughly two minutes of the actual application in the middle. The narration is 501 words; its timing cues allow brief pauses for source updates and approvals.

Use the current finance-console design: ink text, gray surfaces, restrained blue, tabular amounts, and actual application captures. Record the actual application and repository pages for the video.

## Eight video scenes

| Scene | Time | Topic | Main content | Actual footage |
| --- | --- | --- | --- | --- |
| 1 | 0:00–0:22 | Shortfall | Invoice quantity exceptions for finance and receiving. | Current app with one readable case. |
| 2 | 0:22–0:45 | Enter a private demo workspace | No account, key, or setup. Explore a sample case or create your own case. | Fresh entry screen, both choices, then Northstar. |
| 3 | 0:45–1:45 | A late receipt changes the proposed hold | 120 invoiced; 100 received; $800 proposed. Ten more units arrive. Reject the old approval. | Prepare $800, upload receipt, inspect quote, try stale approval. |
| 4 | 1:45–2:39 | Reconcile $4,400 and retain the open order | Approve $400 hold, validate credit, approve release. Net $4,400; 10 PO units open. | Continue through execution, history, and export. |
| 5 | 2:39–3:00 | Vultr runs the workflow | Web/API, PostgreSQL, and worker on Vultr; Opus extracts evidence. | Repository architecture documentation. |
| 6 | 3:00–3:25 | Check the failure paths | Verified workflow checks and separate document-evaluation sets. | Repository evaluation report with verified counts. |
| 7 | 3:25–3:42 | Scope and buyer | Ramp matching, Zip agents, and Shortfall's demonstrated scope. | Repository pitch scope and buyer/pricing hypothesis. |
| 8 | 3:42–4:00 | Validate with operators, then connect accounting | Operator review, authenticated roles, connector; Huzyefah Wasim. | Deployed app and repository README. |

The timestamps are editing targets, not product performance measurements. Preserve visible waiting states; identify any elapsed-time cuts. Verify that judges can open the repository pages shown in the video.

## Slide-ready copy

### 1

**Shortfall**

Invoice quantity exceptions for finance and receiving.

Synthetic records. Live Vultr application.

### 2

**Review the current evidence before approving**

Inspect the source. Review the proposed amount. Approve the change.

A late receipt creates a new evidence revision.

### 3

**A late receipt changes the proposed hold**

120 invoiced × $40 = $4,800\
100 received → $800 discrepancy\
110 received → $400 discrepancy

The server rejects the obsolete $800 approval.

### 4

**Reconcile $4,400 and retain the open order**

$400 internal hold → verified supplier credit → approved release

Net invoice: **$4,400**\
Open purchase order: **10 units**

No payment or ERP write.

### 5

**Vultr runs the workflow**

Browser → Caddy → Next.js web/API\
PostgreSQL: cases, evidence, approvals, durable jobs, execution records\
Node worker → Claude Opus 5.5

Application code validates quoted evidence, integer amounts, and current approvals.

### 6

**Check the failure paths**

| Evidence | Verified scope |
| --- | --- |
| Automated tests and public API/browser checks | See the current verification record; avoid presenting an older test count as current |
| Live Opus receipt and credit | Public deployed workflow |
| Restart/container replacement | One queued hold, one execution, one task |
| Backup restore | Isolated temporary database |
| Competing budget requests | Global $40 and workspace $1 admission limits |

| Document evaluation set | Measured result |
| --- | --- |
| Frozen baseline: 24 documents | 9/12 supported documents accepted exactly; 3 CSVs safely withheld. All 12 challenge expectations met. |
| Targeted regression after CSV correction | Previous 3 failures passed; 24/24 required fields correct. |
| Fresh CSV holdout: 4 documents | 2 supported documents accepted with 18/18 fields correct; 2 correctly withheld. |

The baseline's supported-field counts were **74 correct / 98 required**, **24 abstained**, and **zero incorrectly accepted**. Keep the baseline unchanged and the later checks separate. Across all three sets: 28 unique synthetic documents, 31 settled calls, $0.474656, no uncertain usage. The small corpus and labels were project-authored, with no independent reviewer; they do not establish production accuracy. [Full results and artifacts](evaluation-results.md).

### 7

**A focused workflow in an established category**

| Product | Scope described by its own materials |
| --- | --- |
| Ramp | Match bills, purchase orders, and item receipts; inspect receiving status |
| Zip | Procurement/AP agents with action controls, approvals, and audit history |
| Shortfall | Demonstrated receipt change → stale approval rejection → approved correction |

Target buyer: finance manager at a small distributor.\
Proposed pilot: **$99/workspace/month**, a hypothesis requiring operator validation.

We have not established that a competitor lacks Shortfall's demonstrated behavior. The comparison explains our scope; it does not claim exclusive capabilities.

Sources: [Ramp documentation](https://support.ramp.com/3-way-match-with-ramp-procurement), [Zip Superagents](https://zip.com/capabilities/superagents).

### 8

**Validate with operators, then connect accounting**

1. Review the exception flow with accounts-payable operators.
2. Add authenticated roles and production document retention.
3. Pilot an accounting connector.

Huzyefah Wasim · solo full-stack developer

[Live application](https://shortfall.95.179.254.189.sslip.io) · [Repository](https://github.com/Huzyefahwasim/vultr-hackathon)

## Narration and editorial checks

Use [narration.txt](submission/narration.txt) and [timing cues](submission/narration-timing.json). Segment six describes the measured document checks while preserving the distinction between the initial pass and subsequent CSV checks. Show the report's exact counts while that segment plays.

Use a licensed preset voice if synthesizing narration. Do not imitate the presenter's voice or describe synthesized audio as a live microphone recording. The reviewed rules do not address synthetic narration; they neither explicitly approve it nor specify a disclosure rule. See [rule review](submission/rules-and-sources.md) before final export.

The final video should be MP4/MOV and under 300 MB. Export slides as PDF; an editable PPTX is useful in addition. Do not submit a silent WebM draft as the final presentation.

Keep claims tied to current evidence: synthetic business records, an internal ledger, a live Vultr deployment, measured workflow checks, and unvalidated buyer/pricing assumptions. Do not claim customer savings, recovered cash, universal extraction accuracy, or production accounting integration.
