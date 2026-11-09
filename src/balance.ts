import type { BalanceRow } from "./balances"
import { leafBalances } from "./balances"
import type { ChartOfAccounts } from "./chart-map"
import { LedgerValidationError } from "./errors"
import { accountId as toAccountId } from "./ids"
import type { Transaction } from "./transaction"

/**
 * One Leaf Account's Balance up to and including `asOf`: the row `balances` gives for it.
 * Throws `UNKNOWN_ACCOUNT` for an id outside the chart and `NON_LEAF_ACCOUNT` for a Header, whose
 * rollup comes from `headerRollup`.
 */
export const balance = (
	transactions: readonly Transaction[],
	accountId: string,
	asOf: string,
	chart: ChartOfAccounts,
): BalanceRow => {
	const id = toAccountId(accountId)
	if (!chart.has(id)) {
		throw new LedgerValidationError(
			"UNKNOWN_ACCOUNT",
			"accountId",
			accountId,
			"is not in the chart of accounts",
		)
	}
	if (!chart.isLeaf(id)) {
		throw new LedgerValidationError(
			"NON_LEAF_ACCOUNT",
			"accountId",
			accountId,
			"is a header account",
		)
	}
	return leafBalances(transactions, asOf, chart, (account) =>
		account.id === id ? "balance.amount" : `balance[${account.id}]`,
	).find((row) => row.accountId === id)!
}
