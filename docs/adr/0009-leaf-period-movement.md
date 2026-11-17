# 0009. Leaf Period Movement: a query of its own beside the Header period rollup

Status: accepted (issue #52)

## Context

ADR-0003 gave Leaf Accounts cumulative figures only: `balances` and `balance` take an `asOf`.
`profitAndLoss` takes a period, but it covers Income and Expense Accounts alone. ADR-0004 and
ADR-0006 then gave Header Accounts a rollup at a date and over a period, and ADR-0006 records that a
balance-sheet Header's period figure is net movement, not a Balance.

Nothing gave a Leaf Account that figure. A caller who needed "what moved in this account this year"
called `balances` twice and worked out the day before `from` itself — arithmetic `date.ts` does not
export — or seeded a one-child Header Account over each interesting Leaf Account purely to reach
`headerPeriodRollup`.

The gap bites hardest where money that is neither income nor expense lives. Retirement-fund purchases
(RMF, SSF, PVD, GPF, NSF, ThaiESG) and withholding-tax credit accounts are Asset Accounts whose
yearly totals a Thai filer needs for allowances and credits, and `profitAndLoss` cannot see them by
construction. Issue #52 asked for the missing axis.

## Decisions

- **A third query, `movements(transactions, options, chart)`**, beside `balances` and the two Header
  rollups. One function accepting either an `asOf` string or a period was rejected for the reason
  ADR-0006 rejected it for Header rollups: the return value's meaning would depend on the argument.
- **`options` is the period itself**, typed `{ readonly from: string; readonly to: string }`, with no
  exported options type. The parameter is named `options` so the existing `parsePeriod` error fields
  (`options.from`, `options.to`) read true (ADR-0006).
- **`from` is required.** `balances` already answers "from the start of the ledger", so an optional
  `from` would be a second spelling of it. Required is also the reversible direction: making a
  required field optional later breaks nobody, and the reverse does.
- **The name is plural, `movements`, where #52 wrote `movement`.** The Leaf pair is `balances` for
  the array and `balance` for one Account's row, and the plural keeps `movement` free for a
  single-Account form later. `headerRollup`'s singular name for an array does not carry over, because
  it has no single-Header counterpart to reserve.
- **One row per Leaf Account in the chart**, `{ entityId, accountId, currency, amount }`, seeded from
  the chart, zeros included, sorted by `entityId`, `accountId`, then `currency` by code unit through
  `compareRows`. The array's shape therefore depends only on the chart, and Header Accounts never
  appear, so summing the rows never double counts. The row count equals the row count of `balances`
  at any date.
- **The amount is the sum of Postings dated inside `[from, to]`, inclusive, raw signed, whatever the
  Account Type.** For an Income or Expense Leaf Account it is the figure for the period; for an
  Asset, Liability or Equity Leaf Account it is net movement, not a Balance, and equals that Leaf
  Account's Balance at `to` minus its Balance at the day before `from` — the relationship ADR-0006
  states for a Header, pinned for a Leaf by a property test. The type does not enforce it; the JSDoc
  and the Glossary state it.
- **No totals, not even per `(Entity, Currency)`.** The rows of a period sum to zero per pair,
  because every Transaction's Postings sum to zero per pair, so such a total would report a constant.
  A per-Account-Type total is a caller's filter on the chart (ADR-0004), and a total across
  Currencies would need FX (ADR-0001).
- **The period rules are ADR-0003's, unchanged.** `from` and `to` are inclusive and run through
  `parseISODate`; `from > to` throws `INVALID_PERIOD` on `options.from`. The period is parsed before
  the ledger is scanned, so `INVALID_PERIOD` and `INVALID_DATE` win over chart errors. Every
  Transaction is re-checked against the supplied chart in the period or not, and a duplicate
  Transaction id throws (ADR-0003). A Reversal counts in the period of its own date.
- **Only in-period Postings are summed**, so a cumulative overflow never reaches the check: a Leaf
  Account whose Balance exceeds the safe-integer range but whose in-period movement does not returns
  fine, while an in-period overflow that a later Reversal would offset still throws.
- **`bigint` sums narrowed with the existing overflow code**; the `field` is `movements[<leafId>]`,
  because every Leaf the query reads is a row it returns (ADR-0003). Leaves are narrowed in chart
  order, as `leafSums` narrows them, and the rows are sorted after narrowing, so the reported failure
  depends on neither Postings order nor Transaction order.
- **No new `LedgerErrorCode`**, so the pull request that adds it is `feat:` (ADR-0005). The query
  adds no rule of its own.
- **The row type is `BalanceRow`**, reused as `profitAndLoss` reuses it and `headerPeriodRollup`
  reuses `HeaderRollupRow`. Its JSDoc widens to name a movement, so one row type covers either
  figure without a second structurally identical type.
- **It reuses `leafSums`, `parsePeriod`, `inPeriod` and `compareRows`**, so zero seeding, freezing,
  narrowing and sorting are one code path with `balances` and `headerPeriodRollup` and cannot drift.
- **No Dimensions.** Only `profitAndLoss` takes them (ADR-0003), and #52 asks for no split by cost
  centre.

## Considered Options

- **A `kind` tag, or movement rows inside `balances`.** Rejected in ADR-0003 and ADR-0004: one array
  cannot hold two meanings without inviting the summation that double counts, and the function name
  is the discriminator.
- **A period form of `balance` for one Account, instead of the array.** Deferred, not rejected: the
  array is what a report needs, a single-Account form is additive later, and the plural name is taken
  now so that form can take `movement`.
- **`movement` as the export name.** Rejected above, for the reserved singular.
- **`leafPeriodMovements` or `periodMovements`.** Rejected for the reason ADR-0004 rejected `rollup`:
  the longer name restates the scope the rows themselves state, and it reads as a different concept
  from `balances`.
- **Totals on the query.** Rejected above: always zero per pair.
- **Restricting the query to Income and Expense, or to Asset Accounts.** Rejected: a type filter is
  one line for the caller, and the query answers for the axis rather than for one report.
- **Exporting `dayBefore(from)` and letting callers subtract two `balances` calls.** Rejected: it
  puts the period rule in every caller, and ADR-0006's documented workaround would become a second
  implementation of this query.
- **An options bag that also takes `groupBy` / `where`.** Rejected: an options object that accepts
  more than the period is the extension point this package does not have (ADR-0004), and Dimensions
  belong to P&L.

## Consequences

- Every Leaf Account now has a figure for a period and a figure at a date, and every Header Account
  has the same two through the rollup queries. No query asks a caller to subtract two others.
- Leaf rows never overlap, so they can be summed per `(Entity, Currency)` or filtered by Account Type
  without double counting; Header rows still nest by depth and must not be summed across it.
- The export name, the `{ from, to }` shape and the row type are published API once released.
- A consumer who reads a movement row as a Balance is wrong, and the documentation is the only guard
  — the consequence ADR-0006 records for Header rollups.
- This is the primitive a `traj` allowance derivation needs. It carries no tax meaning and no
  consumer, so tax semantics stay with callers.
- `statement` (ADR-0008) lists one Account's Postings with a running Balance, so it can show how a
  movement arose; this query answers one row per Account for a period. Neither duplicates the
  other, and a caller that needs both reads both.
