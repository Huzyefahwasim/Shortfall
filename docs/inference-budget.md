# Model and API budget

Implementation snapshot: 4 November 2026. Shortfall has $200 in Vultr credits and a separate $50 Anthropic allowance. Live receipt and credit extraction succeeded with claude-opus-5-5 through both local and deployed workers. These budgets are not interchangeable.

## Model responsibility

The Node worker extracts fields and exact quotes from purchase orders, invoices, receipts, and credits. Code verifies the fields, calculates discrepancies, selects permitted transitions, and applies approved internal ledger changes. The model has no tools, payment authority, approval permission, or policy-editing access.

The official TypeScript SDK requests structured JSON. Opus 5.5 requires adaptive thinking: the worker uses adaptive mode, omitted thinking display, and low effort. It ignores thinking blocks and persists only validated fields, evidence, and usage metadata. It never switches models automatically. [Model capabilities](https://platform.claude.com/docs/en/models/overview) · [Effort](https://platform.claude.com/docs/en/build-with-claude/effort)

The provider schema permits null source values so the model can abstain. Application validation rejects missing required fields. Absent optional receipt invoice/price/total values use empty/zero representations; they are never inferred.

## Implemented limits

| Control | Limit or behavior |
| --- | --- |
| Document text | 20,000 normalized UTF-8 bytes |
| Complete request input | 8,000 tokens, counted with instructions and output schema |
| Total output | 2,000 tokens including thinking; truncation requires review |
| Provider timeout | 45 seconds per request |
| Automatic attempts | Initial attempt plus one retry per job; no SDK retries |
| Active jobs | Two globally; two active extraction jobs per workspace |
| Reservation | $0.09 per attempt |
| Global admission | $40 committed usage plus reserved/uncertain amounts |
| Workspace admission | $1 committed usage plus reserved/uncertain amounts |
| Workspace call quota | Ten non-released reservations |

The token-count endpoint accepts the same output configuration used for generation. A failed count does not trigger unbounded generation. [Token-count API](https://platform.claude.com/docs/en/api/messages/count_tokens)

PostgreSQL locks one budget row before checking totals and reserving an attempt. Identity includes workspace, job, and attempt. Completed requests settle reported usage. Pre-generation failures release their reservations; lost generation responses retain uncertain reservations. Restarts and demo reset preserve accounting.

The database integration test raced two $0.09 reservations at $39.91 global usage: exactly one succeeded, reaching $40. The same race at $0.91 workspace usage accepted one, reaching $1. An isolated backup restore also preserved seven reservation records from its snapshot.

Cache entries include workspace, content hash, document kind, model, prompt, and schema version. Reuse requires source validation and makes no provider call. A manual extraction retry consumes the same budget even though it creates a new job.

The limiter governs this application only. Unrelated use of the same provider account remains outside it. Use a dedicated project/key and available provider-side controls.

## Separate spending envelopes

| Anthropic allocation | Ceiling |
| --- | ---: |
| Development/evaluation | $15 |
| Rehearsals/judging | $15 |
| Failure/re-evaluation contingency | $10 |
| Unallocated billing headroom | $10 |
| Total | $50 |

Code enforces the combined $40 ceiling, not separate purpose buckets. Keep $10 for taxes, delayed reconciliation, and billing differences. Vultr funds compute and persistence; its allocation appears in the [delivery plan](delivery-plan.md). No Vultr inference adapter exists.

## Cost arithmetic

Configured base rates are $4 per million input tokens and $20 per million output tokens. Accounting uses integer microdollars: input tokens × 4 + output tokens × 20. No prompt caching is requested; unexpected cache-token counters receive conservative additional accounting. [Anthropic pricing](https://platform.claude.com/docs/en/about-claude/pricing)

An 8,000-input/2,000-output request costs $0.072 at those base rates; the application reserves $0.09. Taxes, pricing changes, and other account usage remain outside this calculation.

## Observed live smoke results

Local snapshot on 4 November 2026, using synthetic documents and real provider responses:

| Document | Input tokens | Output tokens | Provider latency | Accounted base cost |
| --- | ---: | ---: | ---: | ---: |
| Late receipt | 1,400 | 298 | 3,156 ms | $0.011560 |
| Supplier credit | 1,468 | 562 | 5,672 ms | $0.017112 |
| Successful pair | 2,868 | 860 | Not an end-to-end timing | $0.028672 |

These are one successful sample per kind, not a latency distribution or accuracy benchmark. After the public smoke and recorded walkthrough on 4 November, nine settled calls totaled $0.113060; two uncertain reservations retained $0.18. These application records are not a reconciled provider invoice. Further testing changes the totals.

The full smoke verified 110 received units, stale $800 approval rejection, a $400 internal hold, approved $400 credit/release, a $4,400 net invoice, and ten open PO units. The public Vultr replay and recorded walkthrough passed the same checks; their calls are included in the aggregate above. [Evaluation](evaluation.md)

## Configuration and failures

The worker reads ANTHROPIC_API_KEY, ANTHROPIC_MODEL=claude-opus-5-5, and optional ANTHROPIC_WORKSPACE_ID. The latter supplies the workspace request header when needed. Keep the key in ignored .env.worker.local, never web configuration, screenshots, exports, or source. [API headers](https://platform.claude.com/docs/en/api/overview)

Diagnostics include only stage, known error class, HTTP status, and validated request ID. They omit raw response bodies, headers, keys, source text, and thinking content. Failed documents remain available for review and bounded retry. Seeded/manual operations remain usable when inference is disabled.
