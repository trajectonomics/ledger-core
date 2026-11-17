import type { Brand } from "./brand"
import type { ChartOfAccounts } from "./chart-map"
import type { Currency } from "./currency"
import type { ISODate } from "./date"
import { parseISODate } from "./date"
import { LedgerValidationError } from "./errors"
import type { TransactionId } from "./ids"
import type { Posting, PostingInput } from "./posting"
import { validatePosting } from "./posting"

/** A transaction as supplied by a caller. The caller supplies `id`; nothing here generates one. */
export interface TransactionInput {
	readonly id: string
	readonly date: string
	readonly postings: readonly PostingInput[]
	/** The transaction this one reverses or amends (append-only audit chain). */
	readonly linkedTo?: string
}

/** A balanced transaction. Only {@link validateTransaction} produces one. */
export type Transaction = Brand<
	{
		readonly id: TransactionId
		readonly date: ISODate
		readonly postings: readonly Posting[]
		readonly linkedTo?: TransactionId
	},
	"Transaction"
>

/** One `(Entity, Currency)` group whose Postings do not sum to zero. */
export interface UnbalancedGroup {
	readonly entityId: string
	readonly currency: Currency
	readonly sum: bigint
}

/**
 * Group Postings by the Entity their Account belongs to and their Currency, keeping the groups that
 * do not net to zero, in first-seen order. Every Posting's Account must be present in `chart`: the
 * Entity is read from it, and callers pass Postings that `validatePosting` just accepted.
 */
export const unbalancedGroups = (
	postings: readonly Posting[],
	chart: ChartOfAccounts,
): readonly UnbalancedGroup[] => {
	const groups = new Map<string, { entityId: string; currency: Currency; sum: bigint }>()
	for (const { accountId, amount, currency } of postings) {
		const entityId = chart.get(accountId)!.entityId
		const key = JSON.stringify([entityId, currency])
		const group = groups.get(key)
		if (group) group.sum += BigInt(amount)
		else groups.set(key, { entityId, currency, sum: BigInt(amount) })
	}
	return [...groups.values()].filter((group) => group.sum !== 0n)
}

const assertBalanced = (postings: readonly Posting[], chart: ChartOfAccounts): void => {
	const unbalanced = unbalancedGroups(postings, chart)[0]
	if (unbalanced) {
		throw new LedgerValidationError(
			"UNBALANCED_TRANSACTION",
			"postings",
			unbalanced.sum.toString(),
			`entity "${unbalanced.entityId}" ${unbalanced.currency} sums to ${unbalanced.sum} instead of 0`,
		)
	}
}

/** Validate a transaction against a chart. Throws {@link LedgerValidationError}. */
export const validateTransaction = (
	input: TransactionInput,
	chart: ChartOfAccounts,
): Transaction => {
	const date = parseISODate(input.date)
	const count = Array.isArray(input.postings) ? input.postings.length : 0
	if (count < 2) {
		throw new LedgerValidationError(
			"SINGLE_POSTING",
			"postings",
			count,
			"needs at least 2 postings",
		)
	}
	const postings = input.postings.map((p, i) => validatePosting(p, chart, `postings[${i}]`))
	assertBalanced(postings, chart)
	return Object.freeze({
		id: input.id as TransactionId,
		date,
		postings: Object.freeze(postings),
		...(input.linkedTo === undefined ? {} : { linkedTo: input.linkedTo as TransactionId }),
	}) as unknown as Transaction
}
