import { describe, expect, it } from "bun:test"
import { codeOf } from "./builders.fixtures"
import {
	balance,
	balances,
	createChartOfAccounts,
	headerPeriodRollup,
	headerRollup,
	netWorth,
	profitAndLoss,
	trialBalance,
	validateTransaction,
} from "./index"
import { chart, thb, tx } from "./queries.fixtures"

const MAX = Number.MAX_SAFE_INTEGER
const BIG = 8e15

const post = (id: string, debit: string, credit: string, amount: number, dims = {}) =>
	tx(id, "2024-01-01", [thb(debit, amount, dims), thb(credit, -amount)])

/** The error a thunk throws, or undefined. */
const thrown = (run: () => unknown): { code?: string; field?: string } | undefined => {
	try {
		run()
	} catch (error) {
		return error as { code?: string; field?: string }
	}
	return undefined
}

/** The `field` of the error a thunk throws, or undefined. */
const fieldOf = (run: () => unknown): string | undefined => thrown(run)?.field

/** A chart whose Headers sort before its other Headers, so sorted order decides the reported row. */
const hierarchyChart = createChartOfAccounts([
	{ id: "expenses", type: "expense", currency: "THB" },
	{ id: "food", type: "expense", currency: "THB", parentId: "expenses" },
	{ id: "interest", type: "expense", currency: "THB", parentId: "expenses" },
	{ id: "assets", type: "asset", currency: "THB" },
	{ id: "property", type: "asset", currency: "THB", parentId: "assets" },
	{ id: "receivables", type: "asset", currency: "THB", parentId: "assets" },
])

const oneDay = { from: "2024-01-01", to: "2024-01-01" }

describe("overflow", () => {
	it("accepts a Balance of exactly the safe integer limit", () => {
		const cash = (amount: number) =>
			balances([post("a", "cash", "equity", amount)], "2024-01-01", chart).find(
				(r) => r.accountId === "cash",
			)?.amount
		expect(cash(MAX)).toBe(MAX)
	})

	it("rejects a Balance one past the limit, in either direction", () => {
		const up = [post("a", "cash", "equity", MAX), post("b", "cash", "equity", 1)]
		const down = [post("a", "equity", "cash", MAX), post("b", "equity", "cash", 1)]
		expect(codeOf(() => balances(up, "2024-01-01", chart))).toBe("AMOUNT_OVERFLOW")
		expect(codeOf(() => balances(down, "2024-01-01", chart))).toBe("AMOUNT_OVERFLOW")
	})

	it("rejects a net worth total that overflows when every row is safe", () => {
		const txs = [post("a", "cash", "equity", BIG), post("b", "savings", "salary", BIG)]
		expect(balances(txs, "2024-01-01", chart)).toBeDefined()
		expect(thrown(() => netWorth(txs, "2024-01-01", chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "netWorth.totals[default/THB]",
		})
	})

	it("rejects a trial balance column total that overflows when every row is safe", () => {
		const txs = [post("a", "cash", "equity", BIG), post("b", "savings", "salary", BIG)]
		expect(thrown(() => trialBalance(txs, "2024-01-01", chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "trialBalance.totals[default/THB].debit",
		})
	})

	it("rejects a P&L total that overflows when every row is safe", () => {
		const txs = [post("a", "cash", "food", BIG), post("b", "cash", "salary", BIG)]
		const options = { from: "2024-01-01", to: "2024-01-01" }
		expect(thrown(() => profitAndLoss(txs, options, chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "profitAndLoss.totals[default/THB]",
		})
	})

	it("rejects a P&L row that overflows, plain and grouped", () => {
		const txs = [
			post("a", "food", "cash", BIG, { team: "x" }),
			post("b", "food", "cash", BIG, { team: "x" }),
		]
		const options = { from: "2024-01-01", to: "2024-01-01" }
		const error = { code: "AMOUNT_OVERFLOW", field: "profitAndLoss.rows[food]" }
		expect(thrown(() => profitAndLoss(txs, options, chart))).toMatchObject(error)
		expect(thrown(() => profitAndLoss(txs, { ...options, groupBy: "team" }, chart))).toMatchObject(
			error,
		)
	})

	it("names the output path of the query called for an overflowing Balance", () => {
		const txs = [post("a", "cash", "equity", MAX), post("b", "cash", "equity", 1)]
		expect(fieldOf(() => balances(txs, "2024-01-01", chart))).toBe("balances[cash]")
		expect(fieldOf(() => balance(txs, "cash", "2024-01-01", chart))).toBe("balance.amount")
		expect(fieldOf(() => netWorth(txs, "2024-01-01", chart))).toBe("netWorth.rows[cash]")
		expect(fieldOf(() => trialBalance(txs, "2024-01-01", chart))).toBe("trialBalance.rows[cash]")
	})

	it("names the query called and the Account for a Leaf it reads but does not return", () => {
		const txs = [post("a", "food", "cash", MAX), post("b", "food", "savings", 1)]
		expect(fieldOf(() => netWorth(txs, "2024-01-01", chart))).toBe("netWorth[food]")
		expect(fieldOf(() => balance(txs, "cash", "2024-01-01", chart))).toBe("balance[food]")
	})

	it("rejects a Header rollup row that overflows when every Leaf is safe", () => {
		const txs = [post("a", "cash", "equity", BIG), post("b", "savings", "salary", BIG)]
		expect(thrown(() => headerRollup(txs, "2024-01-01", chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "headerRollup[assets/THB]",
		})
	})

	it("names the query called for a Leaf it rolls up, covered or not", () => {
		const covered = [post("a", "cash", "equity", MAX), post("b", "cash", "equity", 1)]
		expect(fieldOf(() => headerRollup(covered, "2024-01-01", chart))).toBe("headerRollup[cash]")
		const uncovered = [post("a", "food", "cash", MAX), post("b", "food", "savings", 1)]
		expect(fieldOf(() => headerRollup(uncovered, "2024-01-01", chart))).toBe("headerRollup[food]")
	})

	it("reports the first overflowing Header row in sorted order", () => {
		const txs = [
			validateTransaction(
				{
					id: "a",
					date: "2024-01-01",
					postings: [
						{ accountId: "food", amount: BIG, currency: "THB" },
						{ accountId: "interest", amount: BIG, currency: "THB" },
						{ accountId: "property", amount: -BIG, currency: "THB" },
						{ accountId: "receivables", amount: -BIG, currency: "THB" },
					],
				},
				hierarchyChart,
			),
		]
		expect(fieldOf(() => headerRollup(txs, "2024-01-01", hierarchyChart))).toBe(
			"headerRollup[assets/THB]",
		)
		expect(fieldOf(() => headerPeriodRollup(txs, oneDay, hierarchyChart))).toBe(
			"headerPeriodRollup[assets/THB]",
		)
	})

	it("rejects a Header period row that overflows when every Leaf is safe", () => {
		const txs = [post("a", "cash", "equity", BIG), post("b", "savings", "salary", BIG)]
		expect(thrown(() => headerPeriodRollup(txs, oneDay, chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "headerPeriodRollup[assets/THB]",
		})
	})

	it("names the query called for a Leaf it rolls up over a period, covered or not", () => {
		const covered = [post("a", "cash", "equity", MAX), post("b", "cash", "equity", 1)]
		expect(fieldOf(() => headerPeriodRollup(covered, oneDay, chart))).toBe(
			"headerPeriodRollup[cash]",
		)
		const uncovered = [post("a", "food", "cash", MAX), post("b", "food", "savings", 1)]
		expect(fieldOf(() => headerPeriodRollup(uncovered, oneDay, chart))).toBe(
			"headerPeriodRollup[food]",
		)
	})

	it("accepts a Leaf that overflows across the whole ledger but is safe inside the period", () => {
		const txs = [
			tx("a", "2024-01-01", [thb("cash", BIG), thb("equity", -BIG)]),
			tx("b", "2024-02-01", [thb("cash", BIG), thb("equity", -BIG)]),
		]
		const february = { from: "2024-02-01", to: "2024-02-28" }
		expect(thrown(() => headerPeriodRollup(txs, february, chart))).toBeUndefined()
		expect(
			codeOf(() => headerPeriodRollup(txs, { from: "2024-01-01", to: "2024-02-28" }, chart)),
		).toBe("AMOUNT_OVERFLOW")
	})

	it("rejects an in-period overflow that a later Reversal would offset", () => {
		const txs = [
			tx("a", "2024-01-01", [thb("cash", MAX), thb("equity", -MAX)]),
			tx("b", "2024-01-02", [thb("cash", 1), thb("equity", -1)]),
			tx("r", "2024-02-10", [thb("cash", -1), thb("equity", 1)]),
		]
		expect(
			thrown(() => headerPeriodRollup(txs, { from: "2024-01-01", to: "2024-12-31" }, chart)),
		).toBeUndefined()
		expect(
			codeOf(() => headerPeriodRollup(txs, { from: "2024-01-01", to: "2024-01-31" }, chart)),
		).toBe("AMOUNT_OVERFLOW")
	})
})
