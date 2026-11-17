import type {
	AccountSlot,
	ChartConflictReason,
	ChartConflicts,
	TransactionSlot,
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

interface Rejection {
	readonly posting: Posting
	readonly reason: ChartConflictReason
}

interface Walk {
	readonly rejections: readonly Rejection[]
	readonly readable: readonly Posting[]
}

/** Check every Posting of one Transaction: a Posting the chart refuses yields its reason. */
const walk = (transaction: Transaction, chart: ChartOfAccounts): Walk => {
	const readable: Posting[] = []
	const rejections: Rejection[] = []
	for (const posting of transaction.postings) {
		try {
			readable.push(validatePosting(posting, chart, "postings"))
		} catch (error) {
			if (!(error instanceof LedgerValidationError)) throw error
			rejections.push({ posting, reason: reasonOf(error) })
		}
	}
	return { rejections, readable }
}

/** Record one rejected Posting under `(accountId, reason)`, counting Postings and Transactions. */
const record = (
	accounts: Map<string, AccountSlot>,
	transaction: Transaction,
	{ posting, reason }: Rejection,
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
	const unbalanced: TransactionSlot[] = []
	transactions.forEach((transaction, index) => {
		assertNewTransactionId(seen, transaction, index)
		const { rejections, readable } = walk(transaction, chart)
		for (const rejection of rejections) record(accounts, transaction, rejection)
		if (readable.length !== transaction.postings.length) return
		for (const group of unbalancedGroups(readable, chart)) {
			unbalanced.push({ transactionId: transaction.id, ...group })
		}
	})
	return reportOf(accounts.values(), unbalanced)
}
