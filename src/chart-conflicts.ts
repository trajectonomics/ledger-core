import type {
	AccountTally,
	ChartConflictReason,
	ChartConflicts,
	UnbalancedSlot,
} from "./chart-conflict-report"
import { reportOf } from "./chart-conflict-report"
import type { ChartOfAccounts } from "./chart-map"
import { LedgerValidationError } from "./errors"
import { assertNewTransactionId } from "./ledger-scan"
import type { Posting } from "./posting"
import { validatePosting } from "./posting"
import type { Transaction } from "./transaction"
import { unbalancedGroups } from "./transaction"

/** Map a chart-dependent rejection to the report's reason; any other code is not a chart conflict. */
const reasonOf = (error: LedgerValidationError): ChartConflictReason => {
	switch (error.code) {
		case "UNKNOWN_ACCOUNT":
			return "unknown"
		case "NON_LEAF_ACCOUNT":
			return "header"
		case "CURRENCY_MISMATCH":
			return "currency"
		default:
			throw error
	}
}

/** Count one rejected Posting under its `(accountId, reason)`, with the Transaction it belongs to. */
const count = (
	tallies: Map<string, AccountTally>,
	transaction: Transaction,
	posting: Posting,
	reason: ChartConflictReason,
): void => {
	const key = JSON.stringify([posting.accountId, reason])
	const tally = tallies.get(key)
	tallies.set(key, {
		accountId: posting.accountId,
		reason,
		postings: (tally?.postings ?? 0) + 1,
		transactions: new Set([...(tally?.transactions ?? []), transaction.id]),
	})
}

/** Check every Posting of one Transaction, counting the ones the chart refuses; return the rest. */
const walk = (
	transaction: Transaction,
	chart: ChartOfAccounts,
	at: number,
	tallies: Map<string, AccountTally>,
): readonly Posting[] => {
	const readable: Posting[] = []
	transaction.postings.forEach((posting, index) => {
		try {
			readable.push(validatePosting(posting, chart, `transactions[${at}].postings[${index}]`))
		} catch (error) {
			if (!(error instanceof LedgerValidationError)) throw error
			count(tallies, transaction, posting, reasonOf(error))
		}
	})
	return readable
}

/**
 * What a supplied Chart of Accounts can no longer read of a ledger, as data: one row per Account a
 * Posting targets and the chart refuses, with why, and one per Transaction its Entity assignment
 * leaves unbalanced. An empty report is the go-ahead for a chart edit.
 */
export const chartConflicts = (
	transactions: readonly Transaction[],
	chart: ChartOfAccounts,
): ChartConflicts => {
	const seen = new Set<string>()
	const tallies = new Map<string, AccountTally>()
	const unbalanced: UnbalancedSlot[] = []
	transactions.forEach((transaction, index) => {
		assertNewTransactionId(seen, transaction, index)
		const readable = walk(transaction, chart, index, tallies)
		if (readable.length !== transaction.postings.length) return
		for (const group of unbalancedGroups(readable, chart)) {
			unbalanced.push({ transactionId: transaction.id, ...group })
		}
	})
	return reportOf(tallies.values(), unbalanced)
}
