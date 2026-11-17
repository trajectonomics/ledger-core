import type { Account } from "./account"
import type { ChartOfAccounts } from "./chart-map"
import type { ISODate } from "./date"
import { LedgerValidationError } from "./errors"
import type { TransactionId } from "./ids"
import type { Posting } from "./posting"
import type { Transaction } from "./transaction"
import { validateTransaction } from "./transaction"

/** A Posting with the Account it targets and the date and id of its Transaction. */
export interface ScannedPosting {
	readonly account: Account
	readonly posting: Posting
	readonly date: ISODate
	readonly transactionId: TransactionId
}

const recheck = (tx: Transaction, index: number, chart: ChartOfAccounts): Transaction => {
	try {
		return validateTransaction(tx, chart)
	} catch (error) {
		if (!(error instanceof LedgerValidationError)) throw error
		throw new LedgerValidationError(
			error.code,
			`transactions[${index}].${error.field}`,
			error.value,
			error.reason,
		)
	}
}

/**
 * Re-check every Transaction against the supplied chart (a Transaction is not tied to the chart
 * that validated it) and flatten them into Postings. Throws on a duplicate Transaction id.
 */
export const scanLedger = (
	transactions: readonly Transaction[],
	chart: ChartOfAccounts,
): readonly ScannedPosting[] => {
	const seen = new Set<string>()
	return transactions.flatMap((tx, index) => {
		if (seen.has(tx.id)) {
			throw new LedgerValidationError(
				"DUPLICATE_TRANSACTION_ID",
				`transactions[${index}].id`,
				tx.id,
				"is used by an earlier transaction",
			)
		}
		seen.add(tx.id)
		const checked = recheck(tx, index, chart)
		return checked.postings.map((posting) => ({
			account: chart.get(posting.accountId)!,
			posting,
			date: checked.date,
			transactionId: checked.id,
		}))
	})
}
