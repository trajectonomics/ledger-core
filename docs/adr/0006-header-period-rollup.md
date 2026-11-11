# 0006. Header Period Rollup: a second query over an inclusive period

Status: accepted (issue #34)

## Context

ADR-0004 gave every Header Account a rollup at a date, `headerRollup(transactions, asOf, chart)`, and deferred a period form to its own issue. A Balance is cumulative, so an `asOf` rollup is right for Asset, Liability and Equity Headers. For an Income or Expense Header it is cumulative from the start of the ledger, which says "how much so far" and cannot say "Total Expenses for March". No other function can: `balance` throws `NON_LEAF_ACCOUNT` for a Header id and `balances` never lists one.

ADR-0003 already fixes the period rules for the one query that takes a period, `profitAndLoss`. This record reuses them and decides what is new: the export, its parameter, and what the amount means.

## Decisions

- **A second export, `headerPeriodRollup(transactions, options, chart)`.** One function accepting either an `asOf` string or a period object was rejected: the return value's meaning would depend on the argument, which ADR-0003 avoids. `headerRollup` keeps its signature and meaning.
- **`options` is the period itself**, typed `{ readonly from: string; readonly to: string }`, with no exported options type. The parameter is named `options` so the existing `parsePeriod` error fields (`options.from`, `options.to`) read true. "No options object" (ADR-0004) means no extension bag: this object takes no `groupBy`, `where`, depth or filter.
- **`from` is required.** `profitAndLoss` makes it optional so that profit-to-date is expressible, and `headerRollup` already answers that for a Header. An optional `from` would make `{ to }` a second spelling of `headerRollup`. Making a required field optional later is additive and breaks nobody; the reverse is breaking, so required is the reversible choice.
- **The period rules are ADR-0003's, unchanged.** `from` and `to` are inclusive and run through `parseISODate`; `from > to` throws `INVALID_PERIOD` (field `options.from`). The period is parsed before the ledger is scanned, so `INVALID_PERIOD` and `INVALID_DATE` win over chart errors.
- **Every Transaction is re-checked against the chart, in the period or not**, and a duplicate Transaction id throws, as in every query (ADR-0003). Only Postings dated inside the period are summed, so cumulative out-of-period amounts never reach the overflow check. A Reversal counts in the period of its own date.
- **The amount is the sum of Postings dated inside the period** on the Header's descendant Leaf Accounts, per Currency of those Leaves. For an Income or Expense Header that is the figure for the period. For an Asset, Liability or Equity Header it is **net movement**, not a Balance, and equals `headerRollup(to)` minus `headerRollup(day before from)`. The type does not enforce this; the JSDoc and the Glossary state it.
- **Same rows as `headerRollup`**: one per `(Header Account, Currency of a descendant Leaf)`, seeded from the chart, zeros included, whole subtree at any depth, so the array's shape depends only on the chart and a period with nothing posted yields all zeros. The row type `HeaderRollupRow` is reused, as `profitAndLoss` reuses `BalanceRow`. Raw signed amounts, `number` out, `bigint` sums, each narrowed against the safe-integer range. Sorted by `entityId`, `accountId`, `currency` by code unit. No totals, no `kind`.
- **The overflow `field` names the call**, per ADR-0003: `headerPeriodRollup[<headerId>/<currency>]` for a row and `headerPeriodRollup[<leafId>]` for a Leaf the query reads but does not return. Issue #34 wrote "the same `headerRollup[...]` forms"; that is read as the same shape with the caller's own prefix, because ADR-0003 says a query never names another function. Leaf sums are narrowed first, in chart order, then Header rows in sorted order, so the reported failure does not depend on hash order.
- **No new `LedgerErrorCode`.** The query uses `INVALID_DATE`, `INVALID_PERIOD`, the shared scan's codes and `AMOUNT_OVERFLOW`. The PR that adds it is `feat:` (ADR-0005).
- **The non-overlapping recipe carries over.** Parent rows contain child Header rows, so summing across depths double counts; keep the rows whose Account has no Header ancestor. A property test pins it for a period, beside the `asOf` one.
- **Still not a whole-Account-Type total.** A Leaf with no Header ancestor appears in no row.

## Resolves

ADR-0004's last Considered Option, "A period rollup (`from`/`to`) built now. Deferred to its own issue", is built here. ADR-0003 and ADR-0004 are left unedited, so the history stays intact and the trail leads here.

## Considered Options

- **A union parameter on `headerRollup`.** Rejected above.
- **An optional `from`.** Rejected above; it can still be added later without breaking anyone.
- **Restricting the query to Income and Expense Headers.** Rejected: ADR-0004 makes a rollup answer for the hierarchy across every Account Type, and a type filter is one line for the caller.
- **`periodRollup` as the name.** Rejected for the reason ADR-0004 rejected `rollup`: it is the generic noun and drops "Header". `headerPeriodRollup` and the Glossary term stay one-to-one.
- **Positional `from` and `to` arguments.** Rejected: `parsePeriod` and `profitAndLoss` take a period object, and one error-field convention serves both.

## Consequences

- A Header's period figure for a balance-sheet Account Type is a movement, and a consumer who reads it as a Balance is wrong. The documentation is the only guard.
- The export name and the `{ from, to }` shape are published API once released.
- The internal Leaf-sum step takes a date predicate and the Header fold is shared, so `headerRollup` and `headerPeriodRollup` cannot drift apart on sorting, zero seeding or the overflow check.
