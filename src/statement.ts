import type { ChartOfAccounts } from "./chart-map"
import { byCodeUnit } from "./compare"
import type { Currency } from "./currency"
import type { ISODate } from "./date"
import { LedgerValidationError } from "./errors"
import type { AccountId, TransactionId } from "./ids"
import { accountId as toAccountId } from "./ids"
import { scanLedger } from "./ledger-scan"
import { inPeriod, parsePeriod } from "./period"
import { toSafeAmount } from "./safe-amount"
import type { Transaction } from "./transaction"

/** One Posting on the statement's Leaf Account, with the raw signed Balance after it. */
export interface StatementRow {
	readonly date: ISODate
	readonly transactionId: TransactionId
	readonly amount: number
	readonly balance: number
}

/** One Leaf Account's Postings over an inclusive period, each with its running Balance. */
export interface Statement {
	readonly accountId: AccountId
	readonly entityId: string
	readonly currency: Currency
	/** Balance before the period; zero when `from` is absent. */
	readonly opening: number
	readonly rows: readonly StatementRow[]
}

const compareRows = (
	a: Pick<StatementRow, "date" | "transactionId">,
	b: Pick<StatementRow, "date" | "transactionId">,
): number => byCodeUnit(a.date, b.date) || byCodeUnit(a.transactionId, b.transactionId)

/**
 * One Leaf Account's Postings over the inclusive period `options.from`–`options.to`, in date order,
 * each with the raw signed Balance (Debit `+`, Credit `-`) after it. `opening` is the Balance before
 * the period, zero when `from` is absent. Throws `UNKNOWN_ACCOUNT` for an id outside the chart and
 * `NON_LEAF_ACCOUNT` for a Header.
 */
export const statement = (
	transactions: readonly Transaction[],
	accountId: string,
	options: { readonly from?: string; readonly to: string },
	chart: ChartOfAccounts,
): Statement => {
	const id = toAccountId(accountId)
	const account = chart.get(id)
	if (!account) {
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
	const period = parsePeriod(options)
	let openingSum = 0n
	const pending: Omit<StatementRow, "balance">[] = []
	for (const { account: postedTo, date, posting, transactionId } of scanLedger(
		transactions,
		chart,
	)) {
		if (postedTo.id !== id) continue
		if (inPeriod(period, date)) pending.push({ date, transactionId, amount: posting.amount })
		else if (period.from !== undefined && date < period.from) openingSum += BigInt(posting.amount)
	}
	const opening = toSafeAmount(openingSum, "statement.opening")
	pending.sort(compareRows)
	let running = openingSum
	const rows = pending.map((row, i) => {
		running += BigInt(row.amount)
		return Object.freeze({
			...row,
			balance: toSafeAmount(running, `statement.rows[${i}].balance`),
		})
	})
	return Object.freeze({
		accountId: id,
		entityId: account.entityId,
		currency: account.currency,
		opening,
		rows: Object.freeze(rows),
	})
}
