import { describe, expect, it } from "bun:test"
import {
	coveredLeaves,
	headerDescendants,
	nestedChart,
	rootHeaders,
} from "./header-rollup.fixtures"
import type { BalanceRow, Posting, PostingInput, Transaction } from "./index"
import { balances, headerPeriodRollup, headerRollup } from "./index"
import { tx } from "./queries.fixtures"

/** Deterministic mulberry32 PRNG so failures are reproducible. */
const rng =
	(seed: number): (() => number) =>
	() => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}

/** Accounts that can balance each other: same Entity and Currency. */
const groups = [
	{ currency: "THB", ids: ["cash", "savings", "loan", "equity", "salary", "food", "interest"] },
	{ currency: "USD", ids: ["usd-wallet", "equity-usd"] },
	{ currency: "THB", ids: ["other-cash", "other-equity"] },
] as const

const pick = <T>(items: readonly T[], next: () => number): T =>
	items[Math.floor(next() * items.length)]!

const postingsOf = (next: () => number): PostingInput[] => {
	const group = pick(groups, next)
	const legs = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
		accountId: pick(group.ids, next),
		amount: (1 + Math.floor(next() * 1_000_000)) * (next() < 0.5 ? -1 : 1),
		currency: group.currency,
	}))
	const sum = legs.reduce((acc, l) => acc + l.amount, 0)
	const closing = sum === 0 ? [1, -1] : [-sum]
	return [
		...legs,
		...closing.map((amount) => ({
			accountId: pick(group.ids, next),
			amount,
			currency: group.currency,
		})),
	]
}

const ledgerOf = (seed: number): Transaction[] => {
	const next = rng(seed)
	return Array.from({ length: 1 + Math.floor(next() * 12) }, (_, i) =>
		tx(
			`t${i}`,
			`2024-0${1 + Math.floor(next() * 3)}-${10 + Math.floor(next() * 18)}`,
			postingsOf(next),
		),
	)
}

const shuffled = <T>(items: readonly T[], next: () => number): T[] =>
	items
		.map((item) => ({ item, key: next() }))
		.sort((a, b) => a.key - b.key)
		.map(({ item }) => item)

const pairKey = (r: { readonly entityId: string; readonly currency: string }): string =>
	`${r.entityId}/${r.currency}`

const rowKey = (r: BalanceRow, accountId: string): string =>
	`${r.entityId}|${accountId}|${r.currency}`

/** Amount per `(Entity, Account, Currency)`; zero rows are kept, so it pins shape as well. */
const byRow = (rows: readonly BalanceRow[]): Map<string, number> =>
	new Map(rows.map((r) => [rowKey(r, r.accountId), r.amount]))

/** Amount per `(Entity, Currency)`, keeping pairs that net to zero. */
const sumByPair = (rows: readonly BalanceRow[]): Map<string, number> => {
	const sums = new Map<string, number>()
	for (const r of rows) sums.set(pairKey(r), (sums.get(pairKey(r)) ?? 0) + r.amount)
	return sums
}

/** The day before `date`, so a period's opening Header Rollup can be taken. */
const dayBefore = (date: string): string => {
	const d = new Date(`${date}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() - 1)
	return d.toISOString().slice(0, 10)
}

/** Every Posting dated inside `period`, straight from the Transactions. */
const inPeriodPostings = (
	txs: readonly Transaction[],
	span: { readonly from: string; readonly to: string },
): readonly Posting[] =>
	txs.filter((t) => t.date >= span.from && t.date <= span.to).flatMap((t) => t.postings)

/** The Headers that cover `leaf`, written out in the fixture. */
const headersAbove = (leaf: string): readonly string[] =>
	Object.entries(headerDescendants)
		.filter(([, descendants]) => descendants.includes(leaf))
		.map(([header]) => header)

/**
 * Every Header's period total per descendant-Leaf Currency, summed straight from the Transactions:
 * a zero for each pair first, then the in-period Postings of the Leaves that cover it.
 */
const expectedPeriodRows = (txs: readonly Transaction[]): Map<string, number> => {
	const leafRows = balances(txs, period.to, nestedChart)
	const leafRow = (account: string): BalanceRow => leafRows.find((r) => r.accountId === account)!
	const expected = new Map<string, number>()
	for (const [header, descendants] of Object.entries(headerDescendants)) {
		for (const leaf of descendants) expected.set(rowKey(leafRow(leaf), header), 0)
	}
	for (const posting of inPeriodPostings(txs, period)) {
		for (const header of headersAbove(posting.accountId)) {
			const key = rowKey(leafRow(posting.accountId), header)
			expected.set(key, expected.get(key)! + posting.amount)
		}
	}
	return expected
}

const period = { from: "2024-02-01", to: "2024-02-29" }
const seeds = Array.from({ length: 200 }, (_, i) => i + 1)

describe("Header Period Rollup properties", () => {
	it("gives identical output for any Transaction order", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			expect(headerPeriodRollup(shuffled(txs, rng(seed + 1000)), period, nestedChart)).toEqual(
				headerPeriodRollup(txs, period, nestedChart),
			)
		}
	})

	it("a Header's rows equal the in-period Postings of its descendant Leaves", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			expect(byRow(headerPeriodRollup(txs, period, nestedChart)), `seed ${seed}`).toEqual(
				expectedPeriodRows(txs),
			)
		}
	})

	it("the documented non-overlapping subset equals every covered Leaf's in-period amount", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const leafRows = balances(txs, period.to, nestedChart)
			const covered = coveredLeaves.map((leaf) => {
				const row = leafRows.find((r) => r.accountId === leaf)!
				const amount = inPeriodPostings(txs, period)
					.filter((p) => p.accountId === leaf)
					.reduce((sum, p) => sum + p.amount, 0)
				return { ...row, amount }
			})
			const roots = headerPeriodRollup(txs, period, nestedChart).filter((r) =>
				rootHeaders.includes(r.accountId),
			)
			expect(sumByPair(roots), `seed ${seed}`).toEqual(sumByPair(covered))
		}
	})

	it("adjacent periods add up to the whole period", () => {
		const whole = { from: "2024-01-01", to: "2024-03-31" }
		const first = { from: "2024-01-01", to: "2024-01-31" }
		const second = { from: "2024-02-01", to: "2024-03-31" }
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const a = byRow(headerPeriodRollup(txs, first, nestedChart))
			const b = byRow(headerPeriodRollup(txs, second, nestedChart))
			const expected = new Map([...a].map(([key, amount]) => [key, amount + b.get(key)!]))
			expect(byRow(headerPeriodRollup(txs, whole, nestedChart)), `seed ${seed}`).toEqual(expected)
		}
	})

	it("a period rollup equals the difference of two Header Rollups", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const end = byRow(headerRollup(txs, period.to, nestedChart))
			const before = byRow(headerRollup(txs, dayBefore(period.from), nestedChart))
			const expected = new Map([...end].map(([key, amount]) => [key, amount - before.get(key)!]))
			expect(byRow(headerPeriodRollup(txs, period, nestedChart)), `seed ${seed}`).toEqual(expected)
		}
	})
})
