# Evaluation and release checks

UI release snapshot: 6 November 2026, deployed revision 34bba3a. These results cover local checks, hosted CI, the public Vultr deployment, and the new recording. Earlier live extraction and frozen document-evaluation results retain their original scope. Synthetic fixtures establish specific behavior; they do not establish customer value or general extraction accuracy.

## Observed checks

| Check | Observed result | Scope |
| --- | --- | --- |
| TypeScript and formatting | Passed | Whole repository typecheck and formatting check |
| Hosted CI for 34bba3a | Passed | All 53 tests including configured database integration, 12 API/browser workflows, formatting, typechecking, and production build |
| Regular test suite | All 53 passed locally and in hosted CI, with no database skip | Domain, extraction, budget arithmetic, origin checks, PDF parsing, PCM alignment, session handling, and related deterministic checks |
| Database integration | Passed in the configured suite | Ownership, competing approvals/execution, source serialization, reset accounting, retries, expiry/session limits, and concurrent global/workspace budget admission |
| API/browser suite | All 12 passed locally in 3.1 minutes and in hosted CI | API and UI workflows, strict layout checks, source wrapping/quotes/focus, pagination, navigation, and session lifecycle |
| Full public release suite | All 12 passed in 1.1 minutes | Complete receipt/credit resolution and export; cross-tab logout, old-token HTTP 401, and explicit re-entry; all current API/browser regressions |
| Strict layout regressions | Passed locally, in CI, and publicly | 1280 × 500, 1280 × 550, 1010 × 500, and 390 × 700 |
| Pagination and source reader | Passed | Ten cases, 17 documents, and 23 history events remain reachable without omissions; long source text wraps, selected quotes remain visible, and closing the source returns focus |
| Additional public visual checks | Passed separately at five desktop sizes and on mobile | Desktop: 1280 × 500, 1280 × 550, 1010 × 500, 1366 × 650, and 1440 × 760; no internal Home/Overview scrolling. Mobile: 390 × 700; Home fits, primary action at y=571–615, ordinary page flow of 895 px |
| Live Opus workflow | Passed locally and on the public deployment | Sample receipt and credit uploads, validated evidence, stale approval rejection, worker execution, and final reconciliation |
| Additional deployed CSV smoke | Passed | Live Opus upload, nine exact evidence spans, and expected 2,250-cent hold |
| Production build and deployment | Passed | Linux production build, public HTTPS, fresh session, database health, and worker heartbeat |
| Public visual check | Passed | Desktop/mobile screenshots, no reported browser errors or horizontal overflow |
| Restart/container replacement | Passed publicly | Queued hold and session persisted; replay produced one execution, one task, and 80,000 cents held |
| Backup restoration | Passed in an isolated temporary database | Nine tables, 34 cases, and seven budget reservations restored; temporary database removed and application database unchanged |
| Recorded public workflow, 6 November | Passed | Release 34bba3a; 54 recording cues, 15 exact live source quotes, and correct reconciled ledger/export |
| Published presentation, 6 November | Published; technical metadata, playback, seeking, and readability verified | MP4: 261.04 seconds, 1600 × 900, 25 fps, 13,021,718 bytes; public cover and 54 English VTT cues; action speed factor 1 with 4.84 seconds of idle close time removed |
| Public media delivery/playback | Passed | HTML, MP4, and VTT returned HTTP 200; a 1,024-byte range returned HTTP 206; playback advanced; all nine seek points passed with no JavaScript/media errors or application API calls |

The [hosted CI run for 34bba3a](https://github.com/Huzyefahwasim/vultr-hackathon/actions/runs/42109353439) passed all 53 tests, including configured database integration, and all 12 API/browser workflows. The full public suite then passed in 1.1 minutes. The interface separates Overview, Documents, and Activity, uses pagination for record lists, and keeps one intentional vertical scroll area in the document reader. Mobile pages use ordinary vertical flow. Browser workflows use manual entry; separate live smoke runs call the provider.

Public video review checked 3.2, 79.4, 93.3, 108.5, 138, 165, 194, 223, and 259.3 seconds. Amounts, source quotes, business benefits, and closing disclosures were readable. These playback checks are separate from application API/browser tests.

## Live extraction snapshot

The selected model was claude-opus-5-5. Both samples were labeled synthetic.

| Input | Required outcome | Observed result |
| --- | --- | --- |
| Late receipt RCV-2042 | Add 10 received units with valid quotes | Verified; total accepted quantity became 110 |
| Previous $800 proposal | Reject approval after source changed | HTTP 409 |
| Revised proposal | Execute one $400 internal hold after approval | Applied |
| Credit CN-8821-01 | Validate $400 credit and require correction approval | Verified, then approved and applied |
| Final case | Net invoice $4,400; hold zero; ten PO units open | Resolved with those values |

Provider latency was 3,156 ms for the receipt and 5,672 ms for the credit. Input/output tokens were 1,400/298 and 1,468/562 respectively. At configured base rates, this successful pair cost $0.028672. These are provider timings, not complete operator or workflow timings.

Those provider measurements describe the successful local pair. The later public replay also passed: the script observed roughly 4.3 seconds until receipt verification and 6.4 seconds until credit verification, including polling and application overhead. These are different measurements and must not be combined as provider latency.

The small sample supports no p50/p95 latency claim or accuracy percentage. Earlier failures and all reservations remain in the accounting records; the [budget document](inference-budget.md) states the earlier cost snapshot totals.

## Repeat the checks

~~~sh
npx next typegen --webpack
npm run typecheck
npm test
node --env-file=.env.local --import tsx --test tests/api.database.test.ts
npm run build
npm run test:e2e
~~~

Generate route types before typechecking a clean checkout. Start web, worker, and PostgreSQL before browser/API workflow tests. Playwright defaults to Microsoft Edge; PLAYWRIGHT_BROWSER_CHANNEL=chromium selects installed Chromium. Tests create separate synthetic sessions. The database integration test requires DATABASE_URL and does not call the model. Hosted CI uses isolated PostgreSQL and Chromium with inference disabled.

To exercise live inference deliberately:

~~~sh
node scripts/smoke-inference.mjs
~~~

That script uses the running application and worker, uploads the supplied receipt and credit, checks the stale conflict and ledger results, and consumes API allowance. Set TEST_BASE_URL to target another deployment. Its local report is a run artifact, not a credential file.

The reusable recording script is scripts/record-submission.mjs. For restart verification, scripts/smoke-recovery.mjs has prepare and verify phases around a deliberate service replacement. The backup helper scripts/backup-database.sh has passed Linux shell syntax validation; automated offsite scheduling is not configured.

The extended PostgreSQL budget test raced two $0.09 reservations against $39.91 global usage and accepted exactly one, reaching $40. It repeated the race at $0.91 workspace usage and accepted exactly one, reaching $1.

## Correctness boundaries

The policy compares equal-price, whole-unit USD lines:

~~~text
gross cents = invoiced units × unit-price cents
received cents = accepted allocated units × unit-price cents
remaining discrepancy = gross cents − received cents − applied credit cents
net invoice cents = gross cents − applied credit cents
open PO units = ordered units − accepted received units
~~~

Reject negative inputs, over-receipts, over-credits, conflicting identities/prices, or a credit overlapping replacement goods. Preserve the invoice; link credits separately. Closing an invoice exception does not pay it or close an outstanding purchase order.

Test coverage includes source changes before approval and after approval, idempotent command execution, duplicate evidence/credits, source supersession, unsupported inputs, and unrelated case values. The database test exercises competing transactions rather than assuming process order.

Evidence checks require exact unique source quotes, server-calculated offsets, matching field values, explicit USD, and consistent priced-line arithmetic. Structured JSON alone is insufficient.

## Remaining release gates

- [x] Verify HTTPS and a fresh isolated session on the public Vultr deployment.
- [x] Replay live model extraction through the deployed web and worker.
- [x] Verify an independent case through the public API workflow tests.
- [x] Verify persisted state after a deployed worker restart.
- [x] Confirm persistence through container replacement and database recovery from the recorded backup.
- [x] Exercise concurrent budget admission against PostgreSQL and confirm the global cap across workspaces.
- [x] Recheck fresh public own-case entry, guide access, visitor isolation, persistence, and mobile behavior on the deployed build.
- [x] Check expiry/session limits, upload boundaries, and failure states in database integration.
- [x] Verify public repository access and the passing hosted CI run.
- [x] Publish the 6 November narrated MP4, cover, and captions and verify technical metadata and recording checks.
- [x] Complete public browser playback, all nine seek points, and caption/readability review of the new recording.
- [ ] Complete presentation PDF and final event-form verification.

The deployed restart and isolated restoration were exercised, not inferred from local retry tests or the existence of a dump. Public repository access, media publication, recording checks, and public playback are verified. Presentation PDF, enrollment/deadline confirmation, and the event form remain. [Media details](submission/media-notes.md)

## Document-quality evaluation

The [document evaluation report](evaluation-results.md) records 28 unique synthetic documents and 31 settled model calls. A frozen 24-document baseline accepted 9/12 supported documents with all 74 accepted critical fields correct. Three valid CSVs went to review, accounting for 24 abstained fields. All 12 challenge expectations passed.

A CSV evidence correction then passed the three targeted reruns. A separate four-document CSV set, frozen after the correction and before its calls, passed its two supported and two review expectations. The historical baseline remains unchanged; the reruns do not become a retrospective 100% accuracy claim.

The documents and labels are project-authored. Customer documents and independent labeling remain future validation work. Every result includes its outcome, scope, usage, and latency; no failed response was replaced with a stored success.

## Business evidence still to collect

No operator interviews, customer adoption, paid pilots, productivity measurements, or revenue have been established. A manual-versus-assisted comparison must use comparable cases, separate active operator time from model waiting, and state that a solo-builder test uses synthetic data.

For the current sample, the defensible result is "$400 discrepancy resolved." Avoid calling that recovered cash, prevented loss, or proven savings.
