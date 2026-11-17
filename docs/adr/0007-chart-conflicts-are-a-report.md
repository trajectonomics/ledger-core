# 0007. Chart conflicts are a report, not a throw

Status: accepted (issue #53)

## Context

`ChartOfAccounts` is one snapshot with no time: its Header Account set is computed once, at construction, from the `parentId`s, and every query then re-checks each Posting against the chart it is handed. A chart edit that is valid in itself can therefore make an existing ledger unreadable, and the failure names a Posting that has been fine for months rather than the edit. ADR-0003's Consequences state it and tell callers to avoid it: *"Changing the chart so a Leaf with Postings becomes a Header makes every query throw `NON_LEAF_ACCOUNT` on the old data. Callers must not turn a Leaf with history into a Header."* Nothing in the package could read that rule, so the only way to discover it was to break the book.

Measured on `main` at `45b853b`, one chart of `bank` (asset, THB) and `salary` (income, THB) and one Simple Entry debiting `bank` 100000: `balances` reads `[bank 100000, salary -100000]`. Adding `{ id: "savings", type: "asset", currency: "THB", parentId: "bank" }` makes the same call throw `NON_LEAF_ACCOUNT`; changing `bank`'s Currency to USD throws `CURRENCY_MISMATCH`; moving `bank` to another Entity throws `UNBALANCED_TRANSACTION`, because the balance check reads each Account's Entity out of the chart. All three are chart-caused.

## Decisions

- **A query of its own, `chartConflicts(transactions, chart)`**, beside the other queries. The chart is the trailing argument (ADR-0002, ADR-0003). There is no `asOf` and no period: the question is about the whole ledger a chart has to read, and a date would let a caller miss Postings the chart also cannot read.
- **The report is an object of two frozen, sorted arrays**, `{ accounts, transactions }`. ADR-0003 fixes a bare array for a query with rows and `{ rows, totals }` for a query with totals; this is a third shape, and it earns its place because an Account row and a Transaction row are different subjects and no single array holds both without a subject discriminator. One call still answers the question, so a caller needs no second query to know whether a chart is readable.
- **One Account row per `(accountId, reason)`**, with `postings` and `transactions` counts: the affected Postings, and the distinct Transactions they belong to. Account rows carry counts and never an amount, so they cannot overflow, and they name no `entityId` or Currency, because an Account the chart does not have has neither.
- **One Transaction row per `(transactionId, entityId, currency)` that does not net**, with the signed residual. The residual is summed with `bigint` and narrowed with the existing helper, and rows are narrowed **after** sorting, so the reported failure does not depend on hash order (ADR-0004's rule, extended here).
- **The reason is a closed union of the package's own words**, `"unknown" | "header" | "currency"`, not the error codes' spellings. ADR-0005 forbids returning a `LedgerErrorCode` as an ordinary value, and a consumer's total `switch` over `LedgerErrorCode` must keep meaning "a call threw".
- **The four chart-dependent rejections are covered, and only those**: `UNKNOWN_ACCOUNT`, `NON_LEAF_ACCOUNT`, `CURRENCY_MISMATCH`, and `UNBALANCED_TRANSACTION` when the chart's Entity assignment causes it. The remaining codes cannot fire for a constructed `Transaction`; its date, amounts and dimensions were already validated, and it has at least two Postings.
- **Every Posting of every Transaction is checked**, each yielding at most one Account row, and the balance check runs only for a Transaction whose Postings are all readable. That is the throwing path's own precedence: a Transaction with a Posting conflict produces Account rows and never a transaction row as well.
- **The rules are shared, not re-implemented.** The report reuses `validatePosting` unchanged; the residual grouping is extracted out of `assertBalanced` and the duplicate-id check out of `scanLedger`, with the existing throws becoming their first failing result. The one place a fourth chart rule could be missed is the code-to-reason map, a `switch` over `LedgerErrorCode` ending in `default: throw error`, so an unmapped rejection still throws instead of quietly becoming a row. The property test pins report-empty against every reading query not throwing.
- **`DUPLICATE_TRANSACTION_ID` still throws.** A duplicate id is a defect in the ledger, not something a chart edit can cause, and every other query already throws on it.
- **No new `LedgerErrorCode`**, so the change is `feat:` (ADR-0005).
- **Two bullets of ADR-0003 are carved out for this one function, and only for it.** "Queries re-check every Posting against the supplied chart, throwing `UNKNOWN_ACCOUNT`, `NON_LEAF_ACCOUNT`, `CURRENCY_MISMATCH` and `UNBALANCED_TRANSACTION`" describes the throwing queries; `chartConflicts` reports those four as rows instead, which is the whole point of the record. "Rows are ordered by `entityId`, `accountId`, then `currency`" also does not fit: an Account absent from the chart has no `entityId` or Currency in it, so Account rows are ordered by `accountId`, then `reason`, both by code unit, and Transaction rows by `transactionId`, `entityId`, then `currency`. `localeCompare` and `Intl.Collator` stay banned. ADR-0003 is otherwise left unedited, as ADR-0005 and ADR-0006 left theirs, so the history stays intact and the trail leads here.

## Considered Options

- **Account rows only, and keep a chart-caused `UNBALANCED_TRANSACTION` a throw.** Rejected: the query would then throw for a chart conflict, which is the one thing it exists to avoid, and no second array means no honest place to put the transaction it could not read.
- **A boolean `canRead(transactions, chart)`.** Rejected: it answers the yes/no and throws away every Account the caller needs for a message.
- **Reporting the reasons as `LedgerErrorCode` members.** Rejected by ADR-0005.
- **Reporting a duplicate Transaction id as a row.** Rejected: it is a ledger defect, not a chart conflict, and every query already throws it.
- **Omitting the residual amount so the query never throws.** Rejected: it would be the only query whose amount is un-narrowed and un-reported, and the caller could not say how far off the Transaction is.
- **Amending ADR-0003 in place.** Rejected on the precedent above; a reader who reaches ADR-0003's consequence needs a pointer forward, not a rewritten record.

## Consequences

- The package now has exactly one place where a rejected Posting is an ordinary value. A future chart rule belongs in the code-to-reason map, or it throws and the property test says so.
- A `cli` guard can refuse `traj account add` before the edit lands, naming the Accounts with history. That call is a separate change in `trajectonomics/cli`; until it lands, the user-facing trap ADR-0003 names stays open.
- Summing across the two arrays is meaningless: they count different subjects, and an Account may have several rows (one per reason).
