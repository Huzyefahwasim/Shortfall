# Shortfall product scope

Implementation snapshot: 4 November 2026. Shortfall is a working prototype on synthetic records. No accounts-payable operator interviews or customer validation have been completed.

Shortfall helps a finance reviewer resolve invoices for goods a receiving team has not accepted. A persistent queue holds cases across suppliers; each case has source evidence, assignments, proposals, approvals, execution history, and exports.

## Buyer and value hypothesis

The proposed buyer is a finance manager at a small distributor with a separate receiving team. The daily user is an accounts-payable analyst. Receiving staff supply acceptance records; purchasing staff handle supplier follow-up.

The hypothesis is that analysts spend avoidable time finding evidence and rechecking resolutions after colleagues update records. Operator interviews must test that hypothesis, the partial-hold policy, terminology, and required approval boundaries.

- Who owns an invoice when the billed quantity exceeds accepted goods?
- Which records establish acceptance, and how often do they arrive late?
- Does the organization permit partial holds or require holding the entire invoice?
- What evidence allows a reviewer to accept a supplier credit and close an exception?

The sample policy is a demonstration assumption, not general accounting guidance. A proposed $99-per-workspace monthly pilot price remains an unvalidated business hypothesis.

## Implemented experience

| Area | Current behavior |
| --- | --- |
| Queue | Multiple supplier cases, search/status filtering, persistent state |
| Case intake | Explicit business fields create synthetic source records; new amounts use the same engine |
| Evidence | Upload supported text documents, inspect normalized text, and highlight verified extracted quotes |
| Coordination | Assign owner/reviewer labels and track follow-up tasks |
| Proposals | Review exact hold or credit/release amounts with source, policy, and ledger revisions |
| Execution | Require approval, run durable commands, reject stale actions, and preserve results on retry |
| Reconciliation | Apply approved credit/release corrections while keeping outstanding PO units open |
| Export | JSON case records and CSV reconciliation, history, and evidence |
| Public demonstration | Isolated visitor workspaces, reset, limits, and explicit synthetic-data labels |

Assignments demonstrate handoffs; the prototype does not authenticate separate finance and receiving employees. It exposes one fixed policy version, goods-quantity-v1, rather than a configurable policy builder.

## Scope boundary

The supported path has one invoice case per workspace/supplier/purchase-order pair, one item, whole units, explicit USD currency, and an agreed unit price. A unique constraint prevents split invoices from reusing the same receiving allocation.

The application accepts text PDFs, TXT, CSV, and JSON within its limits. It excludes scanned PDFs, taxes, discounts, freight, currency conversion, fractional units, returns, and multi-item allocation. Unsupported or conflicting evidence requires review.

Creating a case manually records declared synthetic inputs. Uploading a document runs live extraction and verifies its linkage to that case. The application does not automatically create an entire business case from an arbitrary invoice upload.

The ledger, follow-up tasks, approvals, and history are real persisted application records. They are internal demonstration records, with no ERP, payment, supplier email, or purchasing-system connection.

## Demonstration case

| Record | Quantity | Unit price | Value |
| --- | ---: | ---: | ---: |
| Purchase order and invoice | 120 | $40 | $4,800 |
| Initial accepted receipt | 100 | $40 | $4,000 |
| Late receipt | 10 | $40 | $400 |
| Supplier credit | 10 | $40 | $400 |

Prepare an $800 hold proposal. Import the late receipt, which reduces the discrepancy to $400. Attempting to approve the old proposal must fail. Approve the revised hold, import and validate the credit, then approve its application and release of the hold.

The net invoice becomes $4,400 for 110 received units. Ten PO units remain open. The application does not cancel those units, establish their receipt, or pay the invoice. [Demo steps](demo.md)

## Positioning

Invoice matching is an established category. [Ramp's accounts-payable product](https://ramp.com/accounts-payable/) and [Zip's agents](https://zip.com/capabilities/superagents) are relevant comparisons. We have not established that either lacks the behaviors demonstrated here.

Shortfall's chosen focus is an inspectable changing-evidence workflow: show the source, reject an obsolete approval, execute a revised action, and verify the resulting ledger and open order quantity. That is a demonstrable product choice, not a first-or-only claim.

The initial platform spans finance review and receiving/purchasing handoffs. The challenge's other focus areas do not require separate sales, HR, or support products in this entry.

## Measurement and next validation

Report actual completion time, corrections, validation failures, and executed results with their sample size. A successful synthetic workflow does not establish customer time savings, recovered cash, reduced losses, or willingness to pay.

The live smoke demonstrated a $400 discrepancy resolved in the sample case. It did not measure operator productivity or broad extraction accuracy. The next steps are public deployment checks, held-out document evaluation, and interviews with finance operators. [Evaluation](evaluation.md)

Future work includes authenticated roles, original-file retention, shared receiving allocations for split invoices, operator-approved policy configuration, and accounting connectors. Each needs its own acceptance criteria.
