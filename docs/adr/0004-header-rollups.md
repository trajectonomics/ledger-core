# 0004. Header Rollups: a separate query, per descendant Currency

Status: accepted (issue #14)

## Context

ADR-0003 listed Leaf Accounts only in `balances` and deferred Header rollups to #14, for two reasons: a Header Account may use a different Currency from its children, so a rollup row's Currency is not the account's own; and mixing Header rows into `balances` makes any consumer that sums that array double count. `balance` cannot fill the gap either, because ADR-0003 fixes it to one row in one Currency and a Header may hold several.

What was left open is what a rollup row means: which Headers appear, in which Currency, whether an untouched Header appears at all, and whether the array can be summed.

## Decisions

- **A query of its own, `headerRollup(transactions, asOf, chart)`**, beside the other queries and outside `balances`. It takes the chart as its trailing argument and an inclusive `asOf`, like `balances`, and returns the same shape: a bare, sorted, frozen array of plain rows, never an object with `rows` alone (ADR-0003). No totals, because a total across a Header's Currencies needs FX (ADR-0001) and a total per `(Entity, Currency)` across Headers would mix nesting levels.
- **One row per `(Header Account, Currency of a descendant Leaf Account)`.** The Currency comes from the Leaves below the Header, never from the Header's own declaration, so a THB Header over THB and USD Leaves yields two rows and no THB row is implied by the Header itself. This is the first output in the package where Currency decides an order among one account's rows; ADR-0003's note that `currency` never orders `balances` rows still holds for `balances`.
- **Zero-balance rows are included, seeded from the chart**, one per Header and descendant Currency. That carries ADR-0003's rule ("output shape does not depend on which accounts were touched") to rollups: an untouched Header appears with `amount: 0`, and a chart with no Headers yields an empty array. Every Header has at least one descendant Leaf, because the hierarchy is acyclic and finite.
- **Every Header gets rows, each covering its whole subtree at any depth.** A mid-level Header therefore has a figure, which no other function can give it: `balance` throws `NON_LEAF_ACCOUNT` for a Header id and `balances` never lists one. The consequence is that a parent's rows contain its child Header's rows, so **summing the array across depths double counts**; the JSDoc says so and names the filter that yields non-overlapping Header totals (keep the rows whose Account has no Header ancestor). That filter is the reason the narrower "top of each tree only" shape was not chosen: it is one filter away from this shape, while this shape is not recoverable from it without re-implementing the walk, the grouping and the overflow check.
- **Raw signed amounts, `number` output, `bigint` sums**, each row narrowed against the safe-integer range like every other query, with the overflow `field` naming the output path the caller's call owns: `headerRollup[assets/THB]` for a row — a Header's id alone does not name a row, so the row key carries the Currency, as `totals` keys already do — and `headerRollup[food]` for a Leaf the query reads but does not return. Leaf rows are narrowed first, then Header rows in sorted order, so the reported failure does not depend on hash order. Every Header level is checked, not only the roots.
- **No `kind` field, and no Header rows in `balances`.** The function name is the discriminator: two arrays from two differently named functions cannot be summed by accident, which a `kind` tag on one array would invite. With the tag rejected, the issue's question closes.
- **No new `LedgerErrorCode`.** The query adds no rule of its own: it re-checks every Posting through the shared scan (`UNKNOWN_ACCOUNT`, `NON_LEAF_ACCOUNT`, `CURRENCY_MISMATCH`, `UNBALANCED_TRANSACTION`, `DUPLICATE_TRANSACTION_ID`), parses `asOf` (`INVALID_DATE`) and narrows its sums (`AMOUNT_OVERFLOW`).
- **`balance` keeps throwing `NON_LEAF_ACCOUNT` for a Header id**, as ADR-0003 fixes. One row in one Currency cannot represent a Header holding several, and widening it would change a contract consumers already branch on. The rollup is the only place a Header's amount appears.
- **A rollup is not a whole-Account-Type total.** A Leaf with no Header ancestor appears in no rollup row, so a type total still comes from `balances` filtered by the chart. The query answers for the hierarchy, not for the Account Type.

## Considered Options

- **Header rows in `balances`, tagged with `kind`.** Rejected in ADR-0003 and closed here: the rollup row's Currency is a descendant's, and a tag invites the concatenation that double counts.
- **Only Headers with no Header ancestor.** Rejected: it makes the array summable but leaves every mid-level Header without a figure under any function, and a new Header inserted above an existing one silently deletes existing rows. The view it gives is a one-line filter on this query.
- **Totals on the query.** Rejected: FX is out of scope, and a per-pair total would have to choose a nesting level, which is this same decision again.
- **A depth or direct-children option.** Rejected: an options object is the extension point this package does not have, and the hierarchy is already in the caller's hands.
- **`rollup` as the export name**, taking the generic noun for the narrowest meaning, or `headerBalances`, claiming a Balance a Header does not have. Rejected for `headerRollup`: it is the term this ADR and the Glossary already use, so the export and the vocabulary stay one-to-one.
- **A period rollup (`from`/`to`) built now.** Deferred to its own issue: a Balance at a date is what this issue asks for, and an Income or Expense Header's amount is cumulative from the ledger's start, which ADR-0003's period rules would have to restate.

## Consequences

- Every Account in a chart appears exactly once across the query layer: Leaves in `balances`, Headers in `headerRollup`. Consumers that need a tree read both, plus the chart for structure.
- Summing `headerRollup` across depths overstates by depth. The documented filter is pinned by a property test, so the convention is enforced rather than promised.
- Adding a Header above an existing one adds rows and never removes them, so a consumer's row lookups stay stable as a chart grows.
- A mid-level Header's raw subtree sum can overflow while its parent's does not, and that throws; a roots-only shape would have hidden it.
