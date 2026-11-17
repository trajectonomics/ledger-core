import { describe, expect, it } from "bun:test"
import {
	coveredLeaves,
	headerDescendants,
	nestedChart,
	rootHeaders,
} from "./header-rollup.fixtures"
import { balances, headerRollup, movements, netWorth, profitAndLoss, trialBalance } from "./index"
import { chart } from "./queries.fixtures"
import {
	byPair,
	ledgerOf,
	pairKey,
	rng,
	rowKey,
	seeds,
	shuffled,
	sumByPair,
} from "./queries.property.fixtures"

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
			expect(movements(other, period, chart)).toEqual(movements(txs, period, chart))
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

	it("Leaf Period Movements sum to zero per Entity and Currency", () => {
		const period = { from: "2024-01-01", to: "2024-03-31" }
		for (const seed of seeds) {
			for (const [pair, sum] of sumByPair(movements(ledgerOf(seed), period, chart))) {
				expect(sum, `seed ${seed} ${pair}`).toBe(0)
			}
		}
	})

	it("a movement equals the Balance at its end minus the Balance at the day before its start", () => {
		const period = { from: "2024-02-01", to: "2024-02-28" }
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const at = new Map(balances(txs, "2024-02-28", chart).map((r) => [rowKey(r), r.amount]))
			const before = new Map(balances(txs, "2024-01-31", chart).map((r) => [rowKey(r), r.amount]))
			for (const r of movements(txs, period, chart)) {
				const expected = (at.get(rowKey(r)) ?? 0) - (before.get(rowKey(r)) ?? 0)
				expect(r.amount, `seed ${seed} ${rowKey(r)}`).toBe(expected)
			}
		}
	})

	it("two adjacent periods add up to the period they span", () => {
		const january = { from: "2024-01-01", to: "2024-01-31" }
		const february = { from: "2024-02-01", to: "2024-02-28" }
		const span = { from: "2024-01-01", to: "2024-02-28" }
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const first = movements(txs, january, chart)
			const second = movements(txs, february, chart)
			const sum = new Map(first.map((r, i) => [rowKey(r), r.amount + second[i]!.amount]))
			expect(sum, `seed ${seed}`).toEqual(
				new Map(movements(txs, span, chart).map((r) => [rowKey(r), r.amount])),
			)
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
