import { describe, expect, it } from "bun:test"
import type { PostingInput, Transaction } from "./index"
import { balance, statement } from "./index"
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

/** The day before `date`, so a period's opening Balance can be taken. */
const dayBefore = (date: string): string => {
	const d = new Date(`${date}T00:00:00Z`)
	d.setUTCDate(d.getUTCDate() - 1)
	return d.toISOString().slice(0, 10)
}

const account = "cash"
const period = { from: "2024-02-01", to: "2024-03-31" }
const seeds = Array.from({ length: 200 }, (_, i) => i + 1)

describe("statement properties", () => {
	it("gives identical output for any Transaction order", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			expect(
				statement(shuffled(txs, rng(seed + 1000)), account, period, chart),
				`seed ${seed}`,
			).toEqual(statement(txs, account, period, chart))
		}
	})

	it("opening equals the Balance at the day before from", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			expect(statement(txs, account, period, chart).opening, `seed ${seed}`).toBe(
				balance(txs, account, dayBefore(period.from), chart).amount,
			)
		}
	})

	it("the last row's Balance equals balance at to, or opening when there are no rows", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const result = statement(txs, account, period, chart)
			expect(result.rows.at(-1)?.balance ?? result.opening, `seed ${seed}`).toBe(
				balance(txs, account, period.to, chart).amount,
			)
		}
	})

	it("opening plus the row amounts equals the last row's Balance", () => {
		for (const seed of seeds) {
			const result = statement(ledgerOf(seed), account, period, chart)
			const sum = result.rows.reduce((total, row) => total + row.amount, result.opening)
			expect(result.rows.at(-1)?.balance ?? result.opening, `seed ${seed}`).toBe(sum)
		}
	})

	it("orders rows by date, ties by transactionId", () => {
		for (const seed of seeds) {
			const rows = statement(ledgerOf(seed), account, period, chart).rows
			for (let i = 1; i < rows.length; i++) {
				const previous = rows[i - 1]!
				const current = rows[i]!
				expect(current.date >= previous.date, `seed ${seed}`).toBe(true)
				if (current.date === previous.date) {
					expect(current.transactionId >= previous.transactionId, `seed ${seed}`).toBe(true)
				}
			}
		}
	})
})
