import type { ChartConflictReason, ChartConflicts, UnbalancedSlot } from "./chart-conflict-report"
import { reportOf } from "./chart-conflict-report"
import type { ChartOfAccounts } from "./chart-map"
import { LedgerValidationError } from "./errors"
import type { AccountId, TransactionId } from "./ids"
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

/** The Postings of one unreadable `(Account, reason)`, counted as the walk goes. */
interface AccountSlot {
	readonly accountId: AccountId
	readonly reason: ChartConflictReason
	postings: number
	readonly transactions: Set<TransactionId>
}

/** Check every Posting of one Transaction, recording the ones the chart refuses. */
const walk = (
	transaction: Transaction,
	chart: ChartOfAccounts,
	at: number,
	accounts: Map<string, AccountSlot>,
): readonly Posting[] => {
	const readable: Posting[] = []
	transaction.postings.forEach((posting, index) => {
		try {
			readable.push(validatePosting(posting, chart, `transactions[${at}].postings[${index}]`))
		} catch (error) {
			if (!(error instanceof LedgerValidationError)) throw error
			record(accounts, transaction, posting, reasonOf(error))
		}
	})
	return readable
}

/** Record one rejected Posting under `(accountId, reason)`, counting Postings and Transactions. */
const record = (
	accounts: Map<string, AccountSlot>,
	transaction: Transaction,
	posting: Posting,
	reason: ChartConflictReason,
): void => {
	const key = JSON.stringify([posting.accountId, reason])
	const slot = accounts.get(key)
	if (slot) {
		slot.postings += 1
		slot.transactions.add(transaction.id)
		return
	}
	accounts.set(key, {
		accountId: posting.accountId,
		reason,
		postings: 1,
		transactions: new Set([transaction.id]),
	})
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
	const accounts = new Map<string, AccountSlot>()
	const unbalanced: UnbalancedSlot[] = []
	transactions.forEach((transaction, index) => {
		assertNewTransactionId(seen, transaction, index)
		const readable = walk(transaction, chart, index, accounts)
		if (readable.length !== transaction.postings.length) return
		for (const group of unbalancedGroups(readable, chart)) {
			unbalanced.push({ transactionId: transaction.id, ...group })
		}
	})
	return reportOf(accounts.values(), unbalanced)
}
