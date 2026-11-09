import { describe, expect, it } from "bun:test"
import {
	coveredLeaves,
	headerDescendants,
	nestedChart,
	rootHeaders,
} from "./header-rollup.fixtures"
import type { PostingInput, Transaction } from "./index"
import { balances, headerRollup, netWorth, profitAndLoss, trialBalance } from "./index"
import { chart, tx } from "./queries.fixtures"

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
		...(next() < 0.5 ? { dimensions: { team: pick(["a", "b", "c"], next) } } : {}),
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

const pairKey = (r: { entityId: string; currency: string }): string => `${r.entityId}/${r.currency}`
const byPair = (
	rows: readonly { entityId: string; currency: string; amount: number }[],
): Map<string, number> => new Map(rows.map((r) => [pairKey(r), r.amount]))

/** Sum amounts per `(Entity, Currency)`, keeping pairs that net to zero. */
const sumByPair = (
	rows: readonly { entityId: string; currency: string; amount: number }[],
): Map<string, number> => {
	const sums = new Map<string, number>()
	for (const r of rows) sums.set(pairKey(r), (sums.get(pairKey(r)) ?? 0) + r.amount)
	return sums
}

const seeds = Array.from({ length: 200 }, (_, i) => i + 1)

describe("query properties", () => {
	it("balances sum to zero per Entity and Currency", () => {
		for (const seed of seeds) {
			const sums = new Map<string, number>()
			for (const r of balances(ledgerOf(seed), "2024-12-31", chart)) {
				sums.set(pairKey(r), (sums.get(pairKey(r)) ?? 0) + r.amount)
			}
			for (const sum of sums.values()) expect(sum, `seed ${seed}`).toBe(0)
		}
	})

	it("trial balance columns total the same per Entity and Currency", () => {
		for (const seed of seeds) {
			for (const t of trialBalance(ledgerOf(seed), "2024-12-31", chart).totals) {
				expect(t.debit, `seed ${seed}`).toBe(t.credit)
			}
		}
	})

	it("gives identical output for any Transaction order", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const other = shuffled(txs, rng(seed + 1000))
			const period = { from: "2024-02-01", to: "2024-03-31" }
			expect(balances(other, "2024-02-20", chart)).toEqual(balances(txs, "2024-02-20", chart))
			expect(headerRollup(other, "2024-02-20", nestedChart)).toEqual(
				headerRollup(txs, "2024-02-20", nestedChart),
			)
			expect(trialBalance(other, "2024-02-20", chart)).toEqual(
				trialBalance(txs, "2024-02-20", chart),
			)
			expect(netWorth(other, "2024-02-20", chart)).toEqual(netWorth(txs, "2024-02-20", chart))
			expect(profitAndLoss(other, period, chart)).toEqual(profitAndLoss(txs, period, chart))
			for (const options of [
				{ ...period, groupBy: "team" },
				{ ...period, where: { team: "a" } },
				{ ...period, groupBy: "team", where: { team: "b" } },
			]) {
				expect(profitAndLoss(other, options, chart)).toEqual(profitAndLoss(txs, options, chart))
			}
		}
	})

	it("net worth equals minus raw equity plus profit to date", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const asOf = "2024-02-25"
			const equity = byPair(
				balances(txs, asOf, chart).filter((r) => chart.get(r.accountId)?.type === "equity"),
			)
			const profit = byPair(profitAndLoss(txs, { to: asOf }, chart).totals)
			for (const t of netWorth(txs, asOf, chart).totals) {
				const expected = -(equity.get(pairKey(t)) ?? 0) + (profit.get(pairKey(t)) ?? 0)
				expect(t.amount, `seed ${seed} ${pairKey(t)}`).toBe(expected)
			}
		}
	})

	it("P&L groups sum to the ungrouped totals", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const options = { from: "2024-01-01", to: "2024-12-31" }
			const grouped = profitAndLoss(txs, { ...options, groupBy: "team" }, chart).totals
			const plain = profitAndLoss(txs, options, chart).totals
			expect(grouped, `seed ${seed}`).toEqual(plain)
		}
	})

	it("a Header's rows equal the Balances of its descendant Leaves", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const asOf = "2024-12-31"
			const leafRows = balances(txs, asOf, nestedChart)
			const expected = new Map<string, number>()
			for (const [header, descendants] of Object.entries(headerDescendants)) {
				for (const leaf of descendants) {
					const leafRow = leafRows.find((r) => r.accountId === leaf)!
					const key = `${header}|${pairKey(leafRow)}`
					expected.set(key, (expected.get(key) ?? 0) + leafRow.amount)
				}
			}
			const actual = new Map(
				headerRollup(txs, asOf, nestedChart).map((r) => [`${r.accountId}|${pairKey(r)}`, r.amount]),
			)
			expect(actual, `seed ${seed}`).toEqual(expected)
		}
	})

	it("the documented non-overlapping subset equals every covered Leaf's Balance", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const asOf = "2024-12-31"
			const roots = headerRollup(txs, asOf, nestedChart).filter((r) =>
				rootHeaders.includes(r.accountId),
			)
			const covered = balances(txs, asOf, nestedChart).filter((r) =>
				coveredLeaves.includes(r.accountId),
			)
			expect(sumByPair(roots), `seed ${seed}`).toEqual(sumByPair(covered))
		}
	})
})
