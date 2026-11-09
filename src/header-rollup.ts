import { compareRows, leafBalances } from "./balances"
import type { ChartOfAccounts } from "./chart-map"
import type { Currency } from "./currency"
import { headerChainOf } from "./hierarchy"
import type { AccountId } from "./ids"
import { toSafeAmount } from "./safe-amount"
import type { Transaction } from "./transaction"

/** One Header Account's raw signed rollup (Debit `+`, Credit `-`) in a descendant Leaf's Currency. */
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
 * Every Header Account's rollup up to and including `asOf`, zeros included, sorted. One row per
 * Currency used by its descendant Leaf Accounts, whatever the Header's own Currency says.
 *
 * A Header's amount sums its whole subtree, so a parent's rows contain its child Header's rows:
 * never sum the array across depths. Keep the rows whose Account has no Header ancestor for
 * non-overlapping totals.
 *
 * TODO(#34): a period rollup over `{ from, to }` is a separate query.
 */
export const headerRollup = (
	transactions: readonly Transaction[],
	asOf: string,
	chart: ChartOfAccounts,
): readonly HeaderRollupRow[] => {
	const leaves = leafBalances(transactions, asOf, chart, (account) => `headerRollup[${account.id}]`)
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
				amount: toSafeAmount(sum, `headerRollup[${accountId}/${currency}]`),
			}),
		),
	)
}
