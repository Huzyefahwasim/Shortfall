# Delivery and submission plan

Updated 6 November 2026. Times use Asia/Karachi (PKT, UTC+5).

Release 34bba3a is deployed with focused Overview, Documents, and Activity views, paginated lists, and a source reader. Hosted CI and configured local checks passed all 53 tests and 12 API/browser workflows. The full public suite passed all 12 workflows; separate desktop and mobile visual checks passed. Earlier live inference, restart/persistence, and isolated restoration checks remain recorded. Document evaluation is complete, with its baseline and later CSV checks separate. The 6 November MP4, cover, and captions are published; technical metadata, recording checks, public playback, and readability are verified. Presentation PDF, enrollment/deadline confirmation, and the event form remain outstanding.

## Current position

| Work | Status |
| --- | --- |
| Case queue, independent intake, assignments, evidence, approvals, exports | Implemented |
| Custom durable jobs, execution receipts, extraction cache, budget reservations | Implemented |
| Live Opus receipt/credit extraction | Successful local and public smoke runs |
| Stale approval, $400 hold, approved credit/release, $4,400 reconciliation | Successful local and public smoke runs |
| Deterministic and database tests | All 53 passed locally and in hosted CI, including configured database integration with no skip |
| Hosted CI | 34bba3a passed 53 tests, 12 API/browser workflows, formatting, typecheck, and production build |
| Local API/browser suite | All 12 passed in 3.1 minutes |
| Full public release suite | All 12 passed in 1.1 minutes, including receipt/credit resolution/export, source quotes/focus, pagination, and session revocation |
| Strict layout and pagination checks | 1280 × 500, 1280 × 550, 1010 × 500, and 390 × 700; ten cases, 17 documents, and 23 history events traversed without omissions |
| Additional public visual checks | Five desktop sizes passed with no internal Home/Overview scrolling; mobile Home fits at 390 × 700 and the primary action remains visible in ordinary page flow |
| Additional deployed CSV smoke | Live Opus extraction verified nine exact evidence spans and the expected $22.50 hold |
| Database dump and isolated restore | Nine tables, 34 cases, seven budget reservations restored; application database untouched |
| Public Vultr deployment | 34bba3a deployed 6 November; HTTPS, health, build, and all 12 public API/browser checks passed |
| Restart/container replacement | Queued $800 hold and session persisted; exactly one execution and task after replay |
| Concurrent budget admission | One of two racing reservations accepted at each global/workspace boundary |
| Document evaluation | 28 unique synthetic documents, 31 settled calls, $0.474656; three evaluation sets reported separately |
| Video and narration | Published 6 November MP4: 261.04 seconds, 1600 × 900 at 25 fps, 13,021,718 bytes; 54 cues, 15 exact source quotes, action speed 1, and 4.84 seconds of idle close time removed. Public playback, nine seek points, and caption readability verified |
| Slide presentation | Slide content and speaker notes available; presentation PDF still to be exported and supplied |
| Cover and final public asset links | [Presentation page](https://shortfall.95.179.254.189.sslip.io/submission/), MP4, cover, and captions published; technical metadata verified |
| Repository visibility | Public access verified; [34bba3a hosted CI passed](https://github.com/Huzyefahwasim/vultr-hackathon/actions/runs/42109353439) |
| Event form | Final fields, assets, and LabLab submission still required |

Public demo: [shortfall.95.179.254.189.sslip.io](https://shortfall.95.179.254.189.sslip.io). Both manual-entry checks and live extraction passed on the deployed web/worker. [Workflow verification](evaluation.md) · [Document evaluation](evaluation-results.md)

## Deadline

Internal submission target: **7 November 2026, 18:00 PKT**, or an earlier official cutoff if required. The public event lists 3–8 November but no exact submission time in its detailed schedule. Verify the enrolled event dashboard and timezone. Do not count 8 November or a grace period as available build time. [Event](https://lablab.ai/ai-hackathons/vultr-hackathon)

## Remaining sequence

| Date | Work | Exit condition |
| --- | --- | --- |
| 6 Nov | Export presentation PDF | Current interface recording, public playback, captions, judge entry, independent case, and public API/browser checks have passed; presentation PDF remains |
| By 7 Nov, 18:00 PKT | Submit | Complete event fields and confirm submission before the internal target or an earlier official cutoff |

Keep implementation within the original 30–32 focused-hour allowance, then reserve four hours for recording and packaging. Reduce secondary scope when a gate slips. Do not spend the final submission window adding features.

## Scope and cut lines

The demonstration uses one supplier, PO, invoice, line, late receipt, hold, and credit. The engine supports independent cases with different amounts; it does not hardcode the sample outcome.

Keep source evidence, stale-version rejection, approval, durable execution, idempotency, and the public deployment. Defer ERP/email/payment connectors, policy authoring, authenticated enterprise roles, OCR, split invoices, multi-item allocation, and additional exception categories.

The first release permits one invoice per supplier/PO within a workspace. Route a second invoice to review rather than reusing receipt allocations. Owner/reviewer labels support demonstration handoffs; they are not a production authorization model.

## Readiness evidence

| Area | Evidence or remaining check |
| --- | --- |
| Deployment | Public web and backend run on Vultr; new browser session works |
| Platform behavior | An independent case uses the same engine and preserves its own history after refresh |
| Interface | Focused Overview, Documents, and Activity views; paginated records; one intentional vertical scroll area for long source text; ordinary mobile page flow |
| Correctness | Stale approvals fail; retries cannot duplicate effects; credit release requires approval |
| Recovery | A deployed worker restart and database restore preserve the expected records |
| Model quality | Published baseline: 9/12 supported documents accepted exactly, three valid CSVs withheld, all 12 challenge expectations met; later checks kept separate |
| Submission | App, repository, 6 November video, cover, captions, and license are available and media playback is verified; presentation PDF, enrollment/deadline confirmation, and event form remain |

Restart and restoration were exercised. The frozen baseline preceded a CSV validation correction; the three targeted reruns passed afterward. A fresh four-document CSV holdout then met its two acceptance and two review expectations. These project-authored synthetic records have no independent reviewer and do not establish customer-document accuracy. [Evaluation artifacts](evaluation-results.md)

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

The [repository](https://github.com/Huzyefahwasim/vultr-hackathon) is public and includes an MIT license. Hosted CI verifies the build and configured test suite. Preserve third-party license notices. [Participation terms](https://lablab.ai/terms-of-use)

- [ ] Confirm enrollment, official cutoff, timezone, and authorized submitter.
- [x] Verify the deployed HTTPS URL and manual-entry flow in a fresh session.
- [x] Replay live extraction through the deployed worker before recording.
- [x] Verify the independent-case path through public API workflow tests.
- [x] Verify deployed restart and backup restoration.
- [x] Record the actual public workflow with labeled synthetic data and captions.
- [x] Generate narration with presentation context and measured evaluation wording.
- [x] Publish the MP4, 16:9 cover, and captions; verify delivery and encoding metadata.
- [x] Publish the recording of release 34bba3a with 54 cues and 15 exact live source quotes.
- [x] Complete public browser playback, all nine seek points, and caption/readability review of the 6 November MP4.
- [ ] Export the presentation as PDF from the [slide content and speaker notes](submission/slide-content.md) and attach it to the event form.
- [ ] Enter title, summary, description, Challenge 02, technology tags, and participation mode.
- [ ] Check the actual form's limits; standard guidance uses 5–50 title characters, 50–255 summary characters, and 600–2,000 description characters.
- [x] Keep the MP4 under 300 MB: 6 November duration 4:21, size approximately 13.0 MB.
- [x] Verify public repository access, setup commands, MIT license, and README Vultr explanation.
- [x] State the input boundary, internal ledger scope, and measured evaluation limits.
- [ ] Submit through LabLab and confirm the dashboard records the entry.
- [ ] Preserve the submitted build and keep the demo available for judging.

The actual event form takes precedence over general guidance. Submit early enough to repair upload or link errors. [Submission guidance](https://lablab.ai/delivering-your-hackathon-solution)
