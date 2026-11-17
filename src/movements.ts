import type { BalanceRow } from "./balances"
import { leafSums } from "./balances"
import type { ChartOfAccounts } from "./chart-map"
import { inPeriod, parsePeriod } from "./period"
import type { Transaction } from "./transaction"

/**
 * Every Leaf Account's net movement over the inclusive period `options.from`–`options.to`, zeros
 * included, sorted: the sum of the Postings dated inside the period, raw signed, whatever the
 * Account Type.
 *
 * For an Income or Expense Leaf that is the figure for the period. For an Asset, Liability or
 * Equity Leaf it is net movement, not a Balance, and equals `balance` at `options.to` minus
 * `balance` at the day before `options.from`. Header Accounts never appear, so summing the rows
 * never double counts: their period figures come from `headerPeriodRollup`.
 */
export const movements = (
	transactions: readonly Transaction[],
	options: { readonly from: string; readonly to: string },
	chart: ChartOfAccounts,
): readonly BalanceRow[] => {
	const period = parsePeriod(options)
	return leafSums(
		transactions,
		chart,
		(date) => inPeriod(period, date),
		(account) => `movements[${account.id}]`,
	)
}
