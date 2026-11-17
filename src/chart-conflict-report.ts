import { byCodeUnit } from "./compare"
import type { Currency } from "./currency"
import type { AccountId, TransactionId } from "./ids"
import { toSafeAmount } from "./safe-amount"

/**
 * Why a Chart of Accounts cannot read a Posting: `"unknown"` (no such Account), `"header"` (it is a
 * Header Account, which only aggregates) or `"currency"` (the Posting's Currency is another).
 */
export type ChartConflictReason = "unknown" | "header" | "currency"

/** One Account a chart cannot read, and the Postings and Transactions that target it. */
export interface ChartConflictAccountRow {
	readonly accountId: AccountId
	readonly reason: ChartConflictReason
	readonly postings: number
	readonly transactions: number
}

/** One Transaction the chart's Entity assignment leaves not summing to zero per Entity and Currency. */
export interface ChartConflictTransactionRow {
	readonly transactionId: TransactionId
	readonly entityId: string
	readonly currency: Currency
	readonly amount: number
}

/** What a chart can no longer read: empty arrays mean it reads the whole ledger. */
export interface ChartConflicts {
	readonly accounts: readonly ChartConflictAccountRow[]
	readonly transactions: readonly ChartConflictTransactionRow[]
}

/** What the walk counted for one unreadable `(Account, reason)`, as the report reads it. */
export interface AccountTally {
	readonly accountId: AccountId
	readonly reason: ChartConflictReason
	readonly postings: number
	readonly transactions: ReadonlySet<TransactionId>
}

/** One Transaction the chart leaves unbalanced, with its residual before it is narrowed. */
export interface UnbalancedSlot {
	readonly transactionId: TransactionId
	readonly entityId: string
	readonly currency: Currency
	readonly sum: bigint
}

/**
 * Sort and freeze the slots a walk found into the report a caller gets: Account rows by `accountId`
 * then `reason`, Transaction rows by `transactionId`, `entityId`, then `currency`, both by code unit.
 * Residuals are narrowed after sorting, so an `AMOUNT_OVERFLOW` does not depend on hash order.
 */
export const reportOf = (
	accounts: Iterable<AccountTally>,
	transactions: readonly UnbalancedSlot[],
): ChartConflicts => {
	const accountRows = Object.freeze(
		[...accounts]
			.sort((a, b) => byCodeUnit(a.accountId, b.accountId) || byCodeUnit(a.reason, b.reason))
			.map((slot) =>
				Object.freeze({
					accountId: slot.accountId,
					reason: slot.reason,
					postings: slot.postings,
					transactions: slot.transactions.size,
				}),
			),
	)
	const transactionRows = Object.freeze(
		[...transactions]
			.sort(
				(a, b) =>
					byCodeUnit(a.transactionId, b.transactionId) ||
					byCodeUnit(a.entityId, b.entityId) ||
					byCodeUnit(a.currency, b.currency),
			)
			.map((slot) =>
				Object.freeze({
					transactionId: slot.transactionId,
					entityId: slot.entityId,
					currency: slot.currency,
					amount: toSafeAmount(
						slot.sum,
						`chartConflicts.transactions[${slot.transactionId}/${slot.entityId}/${slot.currency}]`,
					),
				}),
			),
	)
	return Object.freeze({ accounts: accountRows, transactions: transactionRows })
}
