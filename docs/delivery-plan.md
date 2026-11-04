# Delivery and submission plan

Updated 4 November 2026. Times use Asia/Karachi (PKT, UTC+5).

The application, custom PostgreSQL worker, and live Opus receipt/credit workflow are implemented. Public deployment, five API/browser checks, live inference, restart/persistence, and isolated restoration passed. A captioned silent video draft is recorded. Broader extraction evaluation and submission packaging remain active.

## Current position

| Work | Status |
| --- | --- |
| Case queue, independent intake, assignments, evidence, approvals, exports | Implemented |
| Custom durable jobs, execution receipts, extraction cache, budget reservations | Implemented |
| Live Opus receipt/credit extraction | Successful local and public smoke runs |
| Stale approval, $400 hold, approved credit/release, $4,400 reconciliation | Successful local and public smoke runs |
| Deterministic and database tests | Passed as described in evaluation |
| Local and public API/browser workflow tests | Three API and two browser tests passed in each environment |
| Database dump and isolated restore | Nine tables, 34 cases, seven budget reservations restored; application database untouched |
| Public Vultr deployment | HTTPS, database/worker health, production build, and five API/browser checks passed |
| Restart/container replacement | Queued $800 hold and session persisted; exactly one execution and task after replay |
| Concurrent budget admission | One of two racing reservations accepted at each global/workspace boundary |
| Held-out extraction evaluation | Pending; no accuracy percentage claimed |
| Video | Public workflow recorded, 1:53.16, captions/no audio; local draft |
| Narration, slide PDF, published video, repository/submission links | Pending final packaging |

Public demo: [shortfall.95.179.254.189.sslip.io](https://shortfall.95.179.254.189.sslip.io). Both manual-entry checks and live extraction passed on the deployed web/worker. [Measured results](evaluation.md)

## Deadline

Internal submission target: **7 November 2026, 18:00 PKT**, or an earlier official cutoff if required. The public event lists 3–8 November but no exact submission time in its detailed schedule. Verify the enrolled event dashboard and timezone. Do not count 8 November or a grace period as available build time. [Event](https://lablab.ai/ai-hackathons/vultr-hackathon)

## Remaining sequence

| Date | Work | Exit condition |
| --- | --- | --- |
| 4 Nov | Package verified work | Deployment, extraction, restart, restoration, and draft recording complete |
| 5 Nov | Evaluate document boundaries | Report actual field results and limitations; repeat recovery checks only if relevant changes require it |
| 6 Nov | Freeze features and finish presentation | Final script and slides; repeat relevant checks only after changes or failures |
| 7 Nov | Record, package, and submit | Video/PDF/public links checked and submission confirmed before internal target |

Keep implementation within the original 30–32 focused-hour allowance, then reserve four hours for recording and packaging. Reduce secondary scope when a gate slips. Do not spend the final submission window adding features.

## Scope and cut lines

The demonstration uses one supplier, PO, invoice, line, late receipt, hold, and credit. The engine supports independent cases with different amounts; it does not hardcode the sample outcome.

Keep source evidence, stale-version rejection, approval, durable execution, idempotency, and the public deployment. Defer ERP/email/payment connectors, policy authoring, authenticated enterprise roles, OCR, split invoices, multi-item allocation, and additional exception categories.

The first release permits one invoice per supplier/PO within a workspace. Route a second invoice to review rather than reusing receipt allocations. Owner/reviewer labels support demonstration handoffs; they are not a production authorization model.

## Go/no-go gates

| Gate | Required evidence |
| --- | --- |
| Deployment | Public web and backend run on Vultr; new browser session works |
| Platform behavior | An independent case uses the same engine and preserves its own history after refresh |
| Correctness | Stale approvals fail; retries cannot duplicate effects; credit release requires approval |
| Recovery | A deployed worker restart and database restore preserve the expected records |
| Model quality | Publish measured field results and abstentions; no untested accuracy claims |
| Submission | Public links, video, PDF, license, and event form are complete |

A saved database dump alone does not pass the recovery gate. A successful receipt/credit pair alone does not pass the planned held-out document evaluation.

## Four-minute presentation

Follow [the demonstration script](demo.md). The decisive moment is the rejected $800 approval after a late receipt changes the discrepancy to $400.

Then show the approved $400 hold, verified $400 supplier credit, approved hold-release correction, and resulting $4,400 net invoice. Keep the ten outstanding PO units visible. The application does not initiate payment.

| Judging criterion | Evidence to show |
| --- | --- |
| Technology | Live extracted quotes, deterministic arithmetic, database-backed commands, retry handling, and Vultr architecture |
| Presentation | Clear source amounts, visible rejected approval, completed action, and a concise four-minute explanation |
| Business value | One AP reviewer task and a specific buyer hypothesis; observed results with their limits |
| Originality | The focused changing-evidence workflow, with sourced comparisons and no first-or-only claim |

These are the event's named criteria, without published numeric weights. [Rule book](https://lablab.ai/hackathon-rules)

## Separate budgets

The allocations below are ceilings, not service quotes or an invoice. Resources and inference have now been used; check actual billing and the persisted reservation records before further work.

| Vultr allocation | Ceiling |
| --- | ---: |
| Compute | $30 |
| Backup/storage | $15 |
| Incident allowance | $10 |
| Optional future inference allocation | $25 |
| Unallocated reserve | $120 |
| Total credits | $200 |

The active infrastructure allocation is $55. The optional $25 does not imply an implemented provider fallback. Confirm credit eligibility, remaining balance, expiry, rates, and post-credit billing in the account.

| Anthropic allocation | Ceiling |
| --- | ---: |
| Development/evaluation | $15 |
| Rehearsals/judging | $15 |
| Contingency | $10 |
| Billing headroom | $10 |
| Total separate API budget | $50 |

The application enforces a $40 request-admission ceiling, $1 per workspace, and $0.09 per attempt reservation. Keep $10 for reconciliation/taxes. The [inference document](inference-budget.md) records exact controls and observed usage.

Keep the demo available for the confirmed judging period. Export needed data before retiring resources. Stopped VMs still accrue charges; destruction deletes their data and ends that VM's billing. Separate storage/backups may continue billing. [Vultr billing](https://docs.vultr.com/support/platform/billing/how-am-i-billed-for-my-servers)

## Submission checklist

The repository includes an MIT license. Verify public repository access before submission; a working local checkout does not establish public visibility. Preserve third-party license notices. [Participation terms](https://lablab.ai/terms-of-use)

- [ ] Confirm enrollment, official cutoff, timezone, and authorized submitter.
- [x] Verify the deployed HTTPS URL and manual-entry flow in a fresh session.
- [x] Replay live extraction through the deployed worker before recording.
- [x] Verify the independent-case path through public API workflow tests.
- [x] Verify deployed restart and backup restoration.
- [x] Record the actual public workflow with labeled synthetic data and captions.
- [ ] Add narration and presentation context, then publish the final video.
- [ ] Export the slide presentation as PDF and prepare a 16:9 cover.
- [ ] Enter title, summary, description, Challenge 02, technology tags, and participation mode.
- [ ] Check the actual form's limits; standard guidance uses 5–50 title characters, 50–255 summary characters, and 600–2,000 description characters.
- [ ] Keep the MP4/MOV video under 300 MB and approximately four minutes.
- [ ] Verify public repository access, setup commands, MIT license, and README Vultr explanation.
- [ ] State the input boundary, internal ledger scope, and remaining validation.
- [ ] Submit through LabLab and confirm the dashboard records the entry.
- [ ] Preserve the submitted build and keep the demo available for judging.

The actual event form takes precedence over general guidance. Submit early enough to repair upload or link errors. [Submission guidance](https://lablab.ai/delivering-your-hackathon-solution)
