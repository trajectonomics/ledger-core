# 0008. Statement: one Leaf Account's Postings with a running Balance

Status: accepted (issue #54)

## Context

ADR-0003 fixed the shape every query follows, but the seven queries it, ADR-0004 and ADR-0006 define are all aggregates: `balance`, `balances`, `headerRollup`, `headerPeriodRollup`, `netWorth`, `profitAndLoss` and `trialBalance`. None returns a Posting, so nothing answers "what was the Balance after this entry?", and each consumer writes the same reduce itself: take one Account's Postings, order them, accumulate signed Minor Units. That reduce is where the sign convention goes silently wrong — a statement that adds a Credit as if it were a Debit looks plausible and is wrong, which is the failure ADR-0002 exists to prevent.

`traj` has both halves and joins them by hand: `traj balance` gives one Balance per Leaf Account at a date, `traj tx list --account` lists Postings, and nothing shows the Balance after each row, so a person reconciling a bank feed subtracts amounts mentally. This is the first query that returns individual Postings, so the conventions no earlier record covers — row order among one Account's rows, and a result that is not a bare array — are decided here.

## Decisions

- **A query of its own, `statement(transactions, accountId, options, chart)`**, a sibling of `balance`. The chart is the trailing argument (ADR-0003) and `accountId` sits where `balance` puts it, so the two read alike at the call site.
- **`options` is the period itself**, typed `{ readonly from?: string; readonly to: string }`, with no exported options type and no extension bag. The parameter is named `options` so the existing `parsePeriod` error fields (`options.from`, `options.to`) read true (ADR-0006).
- **`from` is optional**, as in `profitAndLoss` (ADR-0003), and an absent `from` means "from the start of the ledger", with `opening: 0`. ADR-0006 made `from` required only to stop `{ to }` being a second spelling of `headerRollup`; no query returns a Leaf Account's Postings from the start, so there is nothing to duplicate, and requiring it would make every caller invent an earliest date.
- **The Account is checked first, then the period, then the scan.** The id is looked up in the chart and checked as a Leaf exactly as `balance` does — `UNKNOWN_ACCOUNT`, `NON_LEAF_ACCOUNT`, both with `field: "accountId"` — so `UNKNOWN_ACCOUNT` beats `INVALID_DATE`, as it does in `balance` today. `parsePeriod` then runs before `scanLedger`, so `INVALID_DATE` and `INVALID_PERIOD` beat every chart error the scan raises (ADR-0006). The period's ends are inclusive.
- **Every Transaction is re-checked against the chart, in the period or not**, through the shared ledger scan (ADR-0003): `UNKNOWN_ACCOUNT`, `NON_LEAF_ACCOUNT`, `CURRENCY_MISMATCH`, `UNBALANCED_TRANSACTION` and `DUPLICATE_TRANSACTION_ID` all still throw. ADR-0007 carved out a reporting form for `chartConflicts` alone; `statement` is a throwing query like the rest, and a caller that wants to know whether a chart can read a ledger asks `chartConflicts` first.
- **One row per Posting on that Account dated inside the period**, each with its own row even when one Transaction carries two Postings on the Account. There are no zero rows: rows list Postings, not Accounts, so an Account with nothing in the period is `opening: 0` (or its carried Balance) with `rows: []`.
- **Only that Account's Postings are summed, and only those dated up to `to`.** A Posting after `to` is re-checked and then ignored; a Posting on any other Leaf Account is never accumulated, so `statement` cannot throw `AMOUNT_OVERFLOW` for a Balance it does not return — `balance` can, because it delegates to `leafBalances` and names `balance[<other leaf>]`. Postings before `from` do reach the check, because `opening` is a returned output (ADR-0003: every output is checked).
- **Rows are ordered by date, then `transactionId` by code unit**, with Postings of one Transaction in their stored order: the sort is stable and ids are unique, so no third key is needed. This is a new rule — ADR-0003 orders account-row collections by `entityId`, `accountId`, `currency`, which names no Posting row — and the caller's array order deliberately does not decide it, because "identical output for any Transaction order" is pinned for every other query and must hold here too. `localeCompare` and `Intl.Collator` stay banned.
- **The result is `{ accountId, entityId, currency, opening, rows }`**, with rows `{ date, transactionId, amount, balance }` carrying the existing brands (`AccountId`, `Currency`, `ISODate`, `TransactionId`). Account, Entity and Currency are constants of one statement, so they sit beside `opening` instead of repeating on every row, as `BalanceRow` must because its rows span Accounts. ADR-0004 rejected "an object with `rows` alone" for a query whose whole content is rows; this object is the `{ rows, totals }` shape with `opening` and the Account's identity in place of totals, and it is allowed here for that reason.
- **Amounts are raw signed Minor Units** (Debit `+`, Credit `-`), `number` out, `bigint` sums (ADR-0003). A row's `amount` needs no narrowing, because a Posting is a safe integer by construction; `balance` is the running raw signed Balance from the start of the ledger through that row, so `opening` plus the row amounts equals the last row's `balance`.
- **Overflow fields are the caller's output paths** (ADR-0003): `statement.opening` for the carried-in Balance, and `statement.rows[<i>].balance` for a row, `i` being the row's index in the returned array. The opening is narrowed before any row, so the reported failure does not depend on which row overflowed first.
- **Nothing is mutable**: the returned object, the rows array and every row are frozen, and no input is mutated.
- **No new `LedgerErrorCode`**: the query adds no rule of its own, and the PR is `feat:` (ADR-0005).
- **Dimensions stay off the rows.** Only P&L takes Dimensions (ADR-0003), and a reconciliation row does not need them; adding a field later is additive.
- **The shared scan gains the Transaction id.** `ScannedPosting` (internal; `ledger-scan.ts` is not re-exported) carries `transactionId`, because each row needs it and a caller-visible map or a second walk would leak a private detail into the module. No public type changes.

## Considered Options

- **One row per Transaction** instead of per Posting. Rejected: the statement answers for one Account, the other legs belong to other Accounts' rows, and a three-leg entry on the Account must stay visible rather than netted.
- **The caller's array order for same-date rows**, as the Idea first proposed. Rejected: it breaks the order-invariance property for `statement` alone, and a statement that reorders when a store returns Transactions differently is a determinism hole in a deterministic package.
- **A required `from`** (ADR-0006's choice). Rejected: no query returns Postings from the start, so `{ to }` duplicates nothing, and requiring a field to guard against a duplicate that does not exist costs every caller an invented date.
- **`accountStatement` as the export name.** Rejected: `rollup` needed its prefix because it took the generic noun for the narrowest meaning; `statement` with an `accountId` is not ambiguous, and the Idea, the Glossary row and the export stay one-to-one.
- **Repeating `entityId`, `accountId` and `currency` on every row**, as `BalanceRow` does. Rejected: they are constants of one statement, and the row keeps the four fields the Idea names.
- **Natural-sign rows or Debit/Credit columns.** Rejected by ADR-0003, which rejected natural-sign statement rows for the reason ADR-0002 gives.
- **A `closing` field.** Rejected: `opening` plus the rows already gives it, and a second spelling of the last row's `balance` can drift from it.
- **`groupBy`/`where` for Dimensions.** Rejected: only P&L takes Dimensions (ADR-0003), and an options bag is the extension point this package does not have.
- **Building the running Balance in `cli` instead.** Rejected: it is core arithmetic — the hand-rolled reduce is where the sign convention goes wrong (ADR-0002) — and the later read-only viewer would write it a second time, disagreeing with `traj` by whenever one of them was fixed.
- **A period-scoped statement whose running Balance starts at the period's first Posting.** Rejected: that figure hides the Balance the caller needs to reconcile the first row, and `opening` is what makes the rows checkable against `balance`.

## Consequences

- `statement` agrees with `balance` by construction: `opening` is `balance` at the day before `from`, and the last row's `balance` is `balance` at `to`; both are property tests, so the two cannot drift.
- The export name, the result fields, the row fields and the row order are published API once released.
- A statement of a Header Account is not available: `headerRollup` and `headerPeriodRollup` answer for the hierarchy, and `statement` throws `NON_LEAF_ACCOUNT` like `balance`.
- `cli` can list one Account's Postings with a running Balance without its own arithmetic; that call is a separate change in `trajectonomics/cli`, not this repository.
