# Evaluation and release checks

Results snapshot: 4 November 2026. These results cover local checks and the public Vultr deployment. The live model workflow passed both locally and through the deployed web/worker. Synthetic fixtures establish specific behavior; they do not establish customer value or general extraction accuracy.

## Observed checks

| Check | Observed result | Scope |
| --- | --- | --- |
| TypeScript | Passed | Whole repository typecheck |
| Regular test suite | 40 passed; one database test skipped without configuration | Domain, extraction, budget arithmetic, origin checks, PDF parsing, and related deterministic checks |
| Database integration | Passed separately | Ownership, competing approvals/execution, source serialization, reset accounting, retries, expiry/session limits, and concurrent global/workspace budget admission |
| API workflow tests | Three passed locally and on the public deployment | Stale approval, credit reconciliation, duplicate execution, cross-session/origin checks, and a new independent case |
| Browser tests | Two passed locally and on the public deployment | Manual receipt/credit flow, export, refresh persistence, and mobile viewport behavior |
| Live Opus workflow | Passed locally and on the public deployment | Sample receipt and credit uploads, validated evidence, stale approval rejection, worker execution, and final reconciliation |
| Production build and deployment | Passed | Linux production build, public HTTPS, fresh session, database health, and worker heartbeat |
| Public visual check | Passed | Desktop/mobile screenshots, no reported browser errors or horizontal overflow |
| Restart/container replacement | Passed publicly | Queued hold and session persisted; replay produced one execution, one task, and 80,000 cents held |
| Backup restoration | Passed in an isolated temporary database | Nine tables, 34 cases, and seven budget reservations restored; temporary database removed and application database unchanged |
| Recorded public workflow | Passed | 1 minute 53.16 seconds, captioned WebM without audio; local draft, not a published final submission |

The local regular suite and separate database run together exercised 41 tests. The [hosted CI run](https://github.com/Huzyefahwasim/vultr-hackathon/actions/runs/41763975019) then passed all 41 in one invocation, followed by five API/browser tests on Chromium. Browser tests use manual entry and do not claim live inference coverage. The separate live smoke calls the provider.

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

The reusable recording script is scripts/record-demo.mjs. For restart verification, scripts/smoke-recovery.mjs has prepare and verify phases around a deliberate service replacement. The backup helper scripts/backup-database.sh has passed Linux shell syntax validation; automated offsite scheduling is not configured.

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
- [ ] Recheck public visitor isolation, expiry, upload limits, and failure states on the deployed build.
- [ ] Finish narration, slides, final video hosting, and submission-link verification. A captioned silent draft is recorded.

The deployed restart and isolated restoration were exercised, not inferred from local retry tests or the existence of a dump. Hosted CI also passed the typecheck, production build, 41 tests, and five browser/API workflows.

## Document-quality evaluation still to run

The proposed six development cases and twelve held-out cases have not produced a reported evaluation result. Do not describe the 18-case plan as an existing benchmark or claim 95% accuracy.

Before tuning a prompt, prepare labeled single-line documents varying suppliers, references, receipt timing, layouts, missing values, and contradictions. Freeze held-out labels; use a new set if those labels influence tuning. Compare deterministic parsing with model extraction on the same supported inputs.

Record correct fields, wrong fields, missing fields, abstentions, validation failures, token usage, and elapsed time. Include failures in the denominator. A proposed 95% exact-match target remains a target until measured; report its numerator and denominator alongside the result.

If extraction misses the target, restrict supported layouts and keep ambiguous documents in review. Do not replace failed live results with undisclosed stored responses.

## Business evidence still to collect

No operator interviews, customer adoption, paid pilots, productivity measurements, or revenue have been established. A manual-versus-assisted comparison must use comparable cases, separate active operator time from model waiting, and state that a solo-builder test uses synthetic data.

For the current sample, the defensible result is "$400 discrepancy resolved." Avoid calling that recovered cash, prevented loss, or proven savings.
