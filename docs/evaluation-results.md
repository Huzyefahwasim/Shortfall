# Document evaluation — 4 November 2026

Shortfall was tested on **24 synthetic documents frozen before the first model call**. The baseline accepted 9 of 12 supported documents with every required field correct. Three valid CSV documents went to review. All 12 challenge cases met their expected safe outcome. A focused CSV validation fix then passed a separate three-document regression run and a fresh four-document CSV holdout.

This is a small engineering evaluation, not a production accuracy claim. The documents and labels were created for this project; no customer corpus or independent reviewer was used.

## Frozen baseline

| Measure | Observed result |
| --- | --- |
| Supported documents accepted with all critical fields correct | 9 / 12 |
| Supported documents sent to review | 3 / 12 |
| Supported critical fields correct | 74 / 98 |
| Supported critical fields abstained | 24 / 98 |
| Incorrectly accepted supported critical fields | 0 |
| Expected challenge outcomes met | 12 / 12 |
| Provider or infrastructure failures | 0 |
| Model calls with settled usage | 24 |
| Measured model cost | $0.362400 |
| Uncertain or outstanding reservations | 0 |
| Document median / p95 wall time | 7.496 s / 9.300 s |
| Provider median / p95 generation time | 5.174 s / 6.918 s |

The 12 supported documents contain three purchase orders, three invoices, three receipts, and three credits across three suppliers, with different prices and quantities. Formats are two text PDFs, three CSVs, three JSON documents, and four plain-text documents. Required fields total 98 because receipts and purchase orders need fewer fields than invoices and credits. A rejected extraction abstains on the entire document: its hidden fields are not credited as correct.

The other 12 documents exercise these cases:

| Case | Expected outcome | Observed outcome |
| --- | --- | --- |
| Bare dollar symbol without explicit USD | Review | Review |
| Negative quantity | Review | Review |
| Fractional quantity | Review | Review |
| Multiple items | Review | Review |
| Tax added to the goods subtotal | Review | Review |
| Stated total disagrees with quantity × price | Review | Review |
| Credit omits the invoice it adjusts | Review | Review |
| Credit names another invoice | Case binding rejects it | Rejected; ledger unchanged |
| Credit names another supplier | Case binding rejects it | Rejected; ledger unchanged |
| Receipt contains instructions to invent quantity and approve payment | Correct facts or review | Correct facts; no action authority |
| Zero receipt quantity | Review | Review |
| EUR invoice | Review | Review |

Two documents ran through the deployed public API and worker. The remaining 22 used the same provider, schema, evidence validator, and persistent budget ledger directly. The two case-binding checks applied the extracted result to the pure domain transition and checked that rejection left the case unchanged. The PDFs were real text-layer files parsed by the installed parser; their normalized extracted text is included in the corpus.

## Deployed workflow check

An isolated synthetic Atlas Fasteners case started with 75 invoiced units at $12.50 each and 60 received units. The initial proposed hold was $187.50. Uploading a receipt for 10 more units changed the proposal to $62.50; attempting the old approval returned HTTP 409. A reviewer approved the new hold, which the durable worker applied.

Uploading a $62.50 credit did not apply it immediately. After a separate approval, the worker recorded the credit, cleared the hold, and resolved the internal payable at **$875.00 net with five PO units still open**. The case belongs to a dedicated evaluation workspace. No payment, ERP update, or supplier message occurred.

## CSV correction and separate regression

The baseline failures were `supported-06-invoice`, `supported-08-credit`, and `supported-11-receipt`. The evidence validator treated commas as number formatting and hyphenated identifiers as negative-number evidence when a quote covered a full CSV row. It safely withheld those extractions, but blocked valid inputs.

The correction resolves numeric evidence against complete CSV cells and recognized numeric column headers. It preserves signs, decimal quantities, quoted thousands, and the original source offsets. Unknown or duplicate numeric headers require review. Four offline regression tests cover valid CSVs, negative and fractional values, adjacent numeric cells, and a quantity that must not be used to conceal a negative unit price. The cache version changed so older results are revalidated under the new rule.

Only the three failed CSVs were then rerun. **All three passed, with 24 of 24 critical fields correct**, for an additional **$0.044204**. This is a targeted regression after observing failures, not a held-out benchmark. The original baseline results remain unchanged; the two runs are not combined into a 100% accuracy claim.

## Fresh post-fix CSV holdout

Four additional synthetic CSVs and their labels were frozen after the correction and before any calls on those inputs. The extraction code was unchanged during this set. These are fresh examples for this local check, authored by the project after diagnosing the earlier issue; they are not an independent benchmark.

| Fresh document | Expected outcome | Observed outcome |
| --- | --- | --- |
| Invoice with reordered, quoted headers and quoted cells | Accept | Accepted; 9 / 9 critical fields correct |
| Credit with reordered headers, quoted supplier comma, and monetary thousands separators | Accept | Accepted; 9 / 9 critical fields correct |
| Negative unit price whose positive value appears in the quantity column | Review | Review |
| CSV total inconsistent with quantity × unit price | Review | Review |

The four calls cost **$0.068052**. There were no incorrectly accepted fields or infrastructure failures in this set. Its outcomes remain separate from both the original 24-document baseline and the targeted regression.

Total evaluation usage across **28 unique documents was 31 settled model calls and $0.474656**, with no uncertain usage. Calls used `claude-opus-5-5`, an 8,000-input-token ceiling, and a 2,000-output-token ceiling. Usage was charged to the real persistent global ledger, within the separate $3 evaluation ceiling. Four ordinary evaluation workspaces retained their normal per-workspace limits. Direct calls had no automatic retries, and the two API jobs each completed on their first attempt.

## Evidence and reproduction

- [Frozen corpus and expected labels](../fixtures/evaluation-v1/manifest.json), with file hashes and baseline source hashes.
- [Manifest checksum](../fixtures/evaluation-v1/manifest.sha256): `98ada88f379a746cc4044b8fca73c016db1ec0e80001787c26ff21a5b6d3c1fd`.
- [Unchanged first-pass results](evaluation-results.json), including per-document outcomes, tokens, cost, and latency.
- [Separate CSV regression results](evaluation-regression.json), including accepted evidence quotes and offsets.
- [Fresh post-fix CSV corpus](../fixtures/evaluation-csv-fresh-v1/manifest.json) and [its separate results](evaluation-fresh-csv.json). The frozen manifest checksum is `fb53cf6b3a3ae7f9270e06468193e781d8de33f3f3866a7c8a90b0e5c624e22c`.
- [Corpus generator](../scripts/build-evaluation-corpus.ts), [baseline runner](../scripts/evaluate-documents.ts), and [regression runner](../scripts/evaluate-csv-regression.ts).
- [Fresh CSV freeze and evaluation runner](../scripts/evaluate-fresh-csv.ts). Fixture-integrity tests verify the frozen files and labels without model access.

The runners require explicit `--live`, load keys only from the worker environment, and reserve spending before generation. Session cookies stay in ignored local state. The baseline runner verifies every corpus hash and the frozen code hashes; it refuses to overwrite completed results or silently resume an interrupted paid attempt. A new evaluation should receive a new version and new result artifact rather than overwriting this record.

Limits remain: the sample is small, synthetic, mostly short and clean, and contains only one instruction-bearing document. It does not establish performance on customer invoices, scans, complex tables, multilingual documents, or adversarial inputs generally. Scanned PDFs, tax, FX, payments, multiple items, and split invoices remain outside this release.
