import type { BalanceRow } from "./balances"
import { compareRows, leafBalances, leafSums } from "./balances"
import type { ChartOfAccounts } from "./chart-map"
import type { Currency } from "./currency"
import { headerChainOf } from "./hierarchy"
import type { AccountId } from "./ids"
import { inPeriod, parsePeriod } from "./period"
import { toSafeAmount } from "./safe-amount"
import type { Transaction } from "./transaction"

/**
 * One Header Account's raw signed rollup (Debit `+`, Credit `-`) in a descendant Leaf's Currency:
 * its Balance up to a date, or its net movement over a period.
 */
export interface HeaderRollupRow {
	readonly entityId: string
	readonly accountId: AccountId
	readonly currency: Currency
	readonly amount: number
}

interface RollupSlot {
	readonly entityId: string
	readonly accountId: AccountId
	readonly currency: Currency
	sum: bigint
}

/**
 * Fold Leaf rows into one row per `(Header Account, descendant Currency)`, zeros included, sorted.
 * `query` names the call in an `AMOUNT_OVERFLOW` field, so the error points at the caller's output.
 */
const rollupOf = (
	leaves: readonly BalanceRow[],
	chart: ChartOfAccounts,
	query: string,
): readonly HeaderRollupRow[] => {
	const slots = new Map<string, RollupSlot>()
	for (const leaf of leaves) {
		for (const header of headerChainOf(chart, leaf.accountId)) {
			const key = JSON.stringify([header.id, leaf.currency])
			const slot = slots.get(key) ?? {
				entityId: header.entityId,
				accountId: header.id,
				currency: leaf.currency,
				sum: 0n,
			}
			slot.sum += BigInt(leaf.amount)
			slots.set(key, slot)
		}
	}
	return Object.freeze(
		[...slots.values()].sort(compareRows).map(({ entityId, accountId, currency, sum }) =>
			Object.freeze({
				entityId,
				accountId,
				currency,
				amount: toSafeAmount(sum, `${query}[${accountId}/${currency}]`),
			}),
		),
	)
}

/**
 * Every Header Account's rollup up to and including `asOf`, zeros included, sorted. One row per
 * Currency used by its descendant Leaf Accounts, whatever the Header's own Currency says.
 *
 * An Income or Expense Header's amount here is cumulative from the start of the ledger, so it is
 * not a figure for a period; `headerPeriodRollup` is.
 *
 * A Header's amount sums its whole subtree, so a parent's rows contain its child Header's rows:
 * never sum the array across depths. Keep the rows whose Account has no Header ancestor for
 * non-overlapping totals.
 *
 * This is not a whole-Account-Type total: a Leaf with no Header ancestor appears in no row, so
 * total an Account Type from `balances` instead.
 */
export const headerRollup = (
	transactions: readonly Transaction[],
	asOf: string,
	chart: ChartOfAccounts,
): readonly HeaderRollupRow[] =>
	rollupOf(
		leafBalances(transactions, asOf, chart, (account) => `headerRollup[${account.id}]`),
		chart,
		"headerRollup",
	)

/**
 * Every Header Account's rollup over the inclusive period `options.from`–`options.to`, zeros
 * included, sorted: the same rows as `headerRollup`, each summing only the Postings dated inside
 * the period.
 *
 * For an Expense or Income Header that is the figure for the period. For an Asset, Liability or
 * Equity Header it is net movement, not a Balance, and equals `headerRollup(options.to)` minus
 * `headerRollup` at the day before `options.from`. Sums across depths double count here too.
 */
export const headerPeriodRollup = (
	transactions: readonly Transaction[],
	options: { readonly from: string; readonly to: string },
	chart: ChartOfAccounts,
): readonly HeaderRollupRow[] => {
	const period = parsePeriod(options)
	return rollupOf(
		leafSums(
			transactions,
			chart,
			(date) => inPeriod(period, date),
			(account) => `headerPeriodRollup[${account.id}]`,
		),
		chart,
		"headerPeriodRollup",
	)
}
