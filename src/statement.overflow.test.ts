import { describe, expect, it } from "bun:test"
import { codeOf, thrown } from "./builders.fixtures"
import { createChartOfAccounts, statement, validateTransaction } from "./index"
import { chart, thb, tx } from "./queries.fixtures"

const MAX = Number.MAX_SAFE_INTEGER
const period = { from: "2024-02-01", to: "2024-02-29" }

const post = (id: string, debit: string, credit: string, amount: number, date = "2024-01-01") =>
	tx(id, date, [thb(debit, amount), thb(credit, -amount)])

describe("statement overflow", () => {
	it("rejects an opening past the limit in either direction, naming statement.opening", () => {
		const up = [post("a", "cash", "equity", MAX), post("b", "cash", "equity", 1)]
		const down = [post("a", "equity", "cash", MAX), post("b", "equity", "cash", 1)]
		for (const txs of [up, down]) {
			expect(thrown(() => statement(txs, "cash", period, chart))).toMatchObject({
				code: "AMOUNT_OVERFLOW",
				field: "statement.opening",
			})
		}
	})

	it("rejects a running Balance that passes the limit while every Posting is safe", () => {
		const txs = [
			post("a", "cash", "equity", MAX, "2024-02-01"),
			post("b", "cash", "equity", 1, "2024-02-02"),
		]
		expect(thrown(() => statement(txs, "cash", period, chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "statement.rows[1].balance",
		})
	})

	it("checks the opening before any row", () => {
		const txs = [
			post("a", "cash", "equity", MAX),
			post("b", "cash", "equity", 1),
			post("c", "cash", "equity", MAX, "2024-02-01"),
		]
		expect(thrown(() => statement(txs, "cash", period, chart))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "statement.opening",
		})
	})

	it("re-checks a Posting after to but never sums it", () => {
		const txs = [
			post("a", "cash", "equity", MAX, "2024-03-01"),
			post("b", "cash", "equity", 1, "2024-03-02"),
		]
		expect(statement(txs, "cash", period, chart)).toMatchObject({ opening: 0, rows: [] })
		const raw = createChartOfAccounts([
			{ id: "crypto", type: "asset", currency: "THB" },
			{ id: "equity", type: "equity", currency: "THB" },
		])
		const unreadable = validateTransaction(
			{
				id: "u1",
				date: "2024-03-01",
				postings: [
					{ accountId: "crypto", amount: 1, currency: "THB" },
					{ accountId: "equity", amount: -1, currency: "THB" },
				],
			},
			raw,
		)
		expect(codeOf(() => statement([unreadable], "cash", period, chart))).toBe("UNKNOWN_ACCOUNT")
	})

	it("never reports an overflow for a Balance it does not return", () => {
		const txs = [post("a", "savings", "equity", MAX), post("b", "savings", "salary", 1)]
		expect(statement(txs, "cash", period, chart)).toMatchObject({ opening: 0, rows: [] })
	})
})
