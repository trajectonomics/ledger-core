# 0001. Core domain model and invariants

Status: accepted (issue #2); amended (issue #26)

## Context

`ledger-core` must make an unbalanced book impossible to record while staying pure (no I/O, clock, randomness, or ID generation) and closed-world (no callbacks or plugin hooks). Amended (issue #26): this sentence used to list "runtime dependencies" as well; the package now has one, see "One runtime dependency" below.

## Decisions

- **Smart constructors, branded outputs.** `createChartOfAccounts` returns a branded `ChartOfAccounts`; `validateTransaction(input, chart)` returns a branded `Transaction`. Only these functions can produce the branded types, so holding one proves the invariants. Both throw `LedgerValidationError` (`code`, `field`, `value`, `reason`) with one distinct `LedgerErrorCode` per rule. We expose a single constructor name, `createChartOfAccounts`, rather than an alias.
- **Money is a signed safe integer of minor units.** Debit `+`, credit `-`. Zero amounts, floats, `NaN`, `Infinity`, and unsafe integers are rejected (`ZERO_AMOUNT_POSTING`, `INVALID_AMOUNT`). Balance sums use `BigInt` so they are exact even near the safe-integer limit. Amended (issue #26): `toMinorUnits` / `fromMinorUnits` no longer carry their own conversion; they delegate to `@trajectonomics/money` (exact decimal expansion, half away from zero), so the same amount is the same Minor Units in every package that uses it. The ledger still parses the Currency first, supplies the digits, allows negative amounts, and reports a shared failure as `INVALID_AMOUNT`.
- **Currencies come from `Intl`.** `Intl.supportedValuesOf("currency")` validates codes and `NumberFormat(...).resolvedOptions().maximumFractionDigits` gives precision, so no currency table ships. Consequence: the accepted set follows the runtime's ICU data (Bun lists more codes than Node; e.g. `CLF` is absent on Node 24). Codes must be uppercase.
- **Balance is per `(entityId, currency)`.** A posting's currency must equal its account's currency (`CURRENCY_MISMATCH`), so a transaction may carry several currencies, but each must net to zero in each entity on its own. There is no FX.
- **Five account types, leaf-only postings.** Opening balances use `equity`. A parent must exist, share entity and type, and form no cycle (`INVALID_ACCOUNT_HIERARCHY`); postings to any account that is some other account's parent fail with `NON_LEAF_ACCOUNT`.
- **Duplicate account ids** in one chart are rejected with `INVALID_ACCOUNT_HIERARCHY`. The issue lists no dedicated code and a duplicate id makes the parent graph ambiguous.
- **Accounts carry no display name.** Labels are the consumer's concern; the core only needs `id`, `type`, `currency`, `entityId`, `parentId`.
- **Validated values are immutable.** Transactions, postings, and dimensions are frozen, and a chart's `set`/`delete`/`clear` throw, so a held value cannot drift out of its invariants.
- **Wire-shape checks belong to the consumer.** The core validates the rules above, not whether an untyped payload has a string `id` or a known `type`; the issue defines no error code for those and consumers translate at their boundary. A non-array `postings` is treated as too few postings.
- **Id brands are nominal tags, not validators.** `accountId()` / `transactionId()` only separate the two id spaces in the type system; ids are opaque caller-supplied strings and are not checked for content.
- **`ChartOfAccounts` is a class with `#private` state, exported as a type only.** Nothing can construct or mutate one outside `createChartOfAccounts`, not even through `Map.prototype`, and its header set is computed at construction, so `chart.isLeaf(id)` can never go stale or fail open.
- **Brands are unforgeable without a cast.** Object brands carry a `private` member (`Nominal<Tag>`), which TypeScript drops from spreads, so `{ ...transaction, postings: [...] }` does not typecheck as a `Transaction`. A deliberate `as` cast still can; that is the escape hatch of any TypeScript API.
- **A header may have a different currency from its children.** The issue requires the same entity and account type only, and a multi-currency summary account is common. Headers hold no postings, so nothing sums across currencies without FX.
- **Currency data is runtime-dependent.** Both the accepted code set and `maximumFractionDigits` come from the runtime's ICU data and may differ by version; Bun also accepts non-currency codes such as `XXX`. Pin one runtime when results must match across systems.
- **Not enforced:** `linkedTo` equal to the transaction's own `id`, and postings that net to zero on a single account. Neither breaks a rule in the issue; reversal and amendment helpers own audit-chain semantics.
- **One runtime dependency.** Amended (issue #26): this bullet used to read "No dependencies". The only runtime dependency is `@trajectonomics/money`, itself pure and dependency-free, for Minor Unit conversion. Still no Zod or JSON Schema; consumers validate their own wire formats and pass plain data in.

## Consequences

Later primitives (queries, reversal/amend helpers) build on `ChartOfAccounts` and `Transaction` and need not re-check these invariants.
