import { describe, expect, it } from "bun:test"
import {
	createChartOfAccounts,
	LedgerValidationError,
	type PostingInput,
	validateTransaction,
} from "./index"
import { rng } from "./queries.property.fixtures"

/** Two entities share USD; a third entity holds THB. Each group balances independently. */
const groups = [
	{ entityId: "e1", currency: "USD", ids: ["e1-usd-a", "e1-usd-b"] },
	{ entityId: "e2", currency: "USD", ids: ["e2-usd-a", "e2-usd-b"] },
	{ entityId: "e1", currency: "THB", ids: ["e1-thb-a", "e1-thb-b", "e1-thb-c"] },
	{ entityId: "e2", currency: "JPY", ids: ["e2-jpy-a", "e2-jpy-b"] },
	{ entityId: "e2", currency: "KWD", ids: ["e2-kwd-a", "e2-kwd-b"] },
] as const

const types = ["asset", "liability", "equity", "income", "expense"] as const

const chart = createChartOfAccounts(
	groups.flatMap((g) =>
		g.ids.map((id, i) => ({
			id,
			type: types[i % types.length]!,
			currency: g.currency,
			entityId: g.entityId,
		})),
	),
)

const pick = <T>(items: readonly T[], next: () => number): T =>
	items[Math.floor(next() * items.length)]!

/** Postings for one group that sum to exactly zero, over 2-5 legs. */
const balancedGroup = (group: (typeof groups)[number], next: () => number): PostingInput[] => {
	const postings: PostingInput[] = []
	let sum = 0
	for (let i = 0, legs = 1 + Math.floor(next() * 4); i < legs; i++) {
		const amount = (1 + Math.floor(next() * 1_000_000)) * (next() < 0.5 ? -1 : 1)
		sum += amount
		postings.push({ accountId: pick(group.ids, next), amount, currency: group.currency })
	}
	const closing = sum === 0 ? [1, -1] : [-sum]
	for (const amount of closing) {
		postings.push({ accountId: pick(group.ids, next), amount, currency: group.currency })
	}
	return postings
}

/** Balanced across a random non-empty subset of groups, so single-currency runs occur too. */
const balancedTransaction = (next: () => number): PostingInput[] => {
	const chosen = groups.filter(() => next() < 0.6)
	return (chosen.length > 0 ? chosen : [pick(groups, next)]).flatMap((g) => balancedGroup(g, next))
}

/** +1 or -1, never landing on 0 (that would be ZERO_AMOUNT_POSTING, a different rule). */
const shiftAvoidingZero = (amount: number, next: () => number): number => {
	const delta = next() < 0.5 ? 1 : -1
	return amount + delta === 0 ? -delta : delta
}

const codeOf = (postings: readonly PostingInput[]): string | undefined => {
	try {
		validateTransaction({ id: "t", date: "2026-01-01", postings }, chart)
	} catch (error) {
		if (error instanceof LedgerValidationError) return error.code
		throw error
	}
	return undefined
}

describe("balance invariant (property)", () => {
	it("every generated balanced transaction validates", () => {
		const next = rng(20260101)
		for (let run = 0; run < 500; run++) expect(codeOf(balancedTransaction(next))).toBeUndefined()
	})

	it("shifting any one amount by 1 minor unit is always UNBALANCED_TRANSACTION", () => {
		const next = rng(20260102)
		for (let run = 0; run < 500; run++) {
			const postings = balancedTransaction(next)
			const index = Math.floor(next() * postings.length)
			const amount = postings[index]!.amount
			const delta = shiftAvoidingZero(amount, next)
			const mutated = postings.map((p, i) => (i === index ? { ...p, amount: amount + delta } : p))
			expect(codeOf(mutated)).toBe("UNBALANCED_TRANSACTION")
		}
	})

	it("moving a leg to the other entity's account of the same currency is unbalanced", () => {
		const next = rng(20260103)
		for (let run = 0; run < 200; run++) {
			const postings = balancedGroup(groups[0], next)
			const mutated = postings.map((p, i) => (i === 0 ? { ...p, accountId: "e2-usd-a" } : p))
			expect(codeOf(mutated)).toBe("UNBALANCED_TRANSACTION")
		}
	})
})
