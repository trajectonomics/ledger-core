import type { Account } from "./account"
import type { ChartOfAccounts } from "./chart-map"
import { byCodeUnit } from "./compare"
import type { Currency } from "./currency"
import type { ISODate } from "./date"
import { parseISODate } from "./date"
import type { AccountId } from "./ids"
import { scanLedger } from "./ledger-scan"
import { toSafeAmount } from "./safe-amount"
import type { Transaction } from "./transaction"

/** One Leaf Account's raw signed Balance (Debit `+`, Credit `-`) in its own Currency. */
export interface BalanceRow {
	readonly entityId: string
	readonly accountId: AccountId
	readonly currency: Currency
	readonly amount: number
}

/** Order rows by `entityId`, `accountId`, then `currency`, by code unit. */
export const compareRows = (
	a: Pick<BalanceRow, "entityId" | "accountId" | "currency">,
	b: Pick<BalanceRow, "entityId" | "accountId" | "currency">,
): number =>
	byCodeUnit(a.entityId, b.entityId) ||
	byCodeUnit(a.accountId, b.accountId) ||
	byCodeUnit(a.currency, b.currency)

/**
 * Every Leaf Account's amount over the Postings `inDate` accepts, zeros included, sorted. `fieldOf`
 * gives the output path an `AMOUNT_OVERFLOW` reports for a Leaf, so it names the query the caller
 * called.
 */
export const leafSums = (
	transactions: readonly Transaction[],
	chart: ChartOfAccounts,
	inDate: (date: ISODate) => boolean,
	fieldOf: (account: Account) => string,
): readonly BalanceRow[] => {
	const sums = new Map<AccountId, bigint>()
	for (const { account, posting, date } of scanLedger(transactions, chart)) {
		if (inDate(date)) sums.set(account.id, (sums.get(account.id) ?? 0n) + BigInt(posting.amount))
	}
	return Object.freeze(
		[...chart.values()]
			.filter((account) => chart.isLeaf(account.id))
			.map((account) =>
				Object.freeze({
					entityId: account.entityId,
					accountId: account.id,
					currency: account.currency,
					amount: toSafeAmount(sums.get(account.id) ?? 0n, fieldOf(account)),
				}),
			)
			.sort(compareRows),
	)
}

/**
 * Every Leaf Account's Balance up to and including `asOf`, zeros included, sorted. `fieldOf` gives
 * the output path an `AMOUNT_OVERFLOW` reports for a Leaf, so it names the query the caller called.
 */
export const leafBalances = (
	transactions: readonly Transaction[],
	asOf: string,
	chart: ChartOfAccounts,
	fieldOf: (account: Account) => string,
): readonly BalanceRow[] => {
	const cutoff = parseISODate(asOf, "asOf")
	return leafSums(transactions, chart, (date) => date <= cutoff, fieldOf)
}

/**
 * Every Leaf Account's Balance up to and including `asOf`, zeros included, sorted. Header
 * Accounts never appear, so summing the rows never double counts: their rollups come from
 * `headerRollup`.
 */
export const balances = (
	transactions: readonly Transaction[],
	asOf: string,
	chart: ChartOfAccounts,
): readonly BalanceRow[] =>
	leafBalances(transactions, asOf, chart, (account) => `balances[${account.id}]`)
