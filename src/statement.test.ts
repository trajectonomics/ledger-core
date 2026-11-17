import { describe, expect, it } from "bun:test"
import { codeOf, thrown } from "./builders.fixtures"
import {
	compound,
	createChartOfAccounts,
	parseCurrency,
	parseISODate,
	reverse,
	statement,
	accountId as toAccountId,
	transactionId as toTransactionId,
	validateTransaction,
} from "./index"
import { chart, ledger } from "./queries.fixtures"

const february = { from: "2024-02-01", to: "2024-02-29" }

/** A whole statement with its brands applied, for literal expectations. */
const stmt = (
	account: string,
	entityId: string,
	currency: string,
	opening: number,
	rows: readonly (readonly [string, string, number, number])[],
) => ({
	accountId: toAccountId(account),
	entityId,
	currency: parseCurrency(currency),
	opening,
	rows: rows.map(([date, id, amount, balance]) => ({
		date: parseISODate(date),
		transactionId: toTransactionId(id),
		amount,
		balance,
	})),
})

describe("statement", () => {
	it("carries the Balance from before the period into opening", () => {
		expect(statement(ledger, "cash", february, chart)).toEqual(
			stmt("cash", "default", "THB", 4_100_000, [
				["2024-02-01", "t4", -150_000, 3_950_000],
				["2024-02-10", "t5", -50_000, 3_900_000],
				["2024-02-15", "t6", -120_000, 3_780_000],
			]),
		)
	})

	it("returns opening and no rows for an empty period or an Account never posted to", () => {
		const march = { from: "2024-03-01", to: "2024-03-31" }
		expect(statement(ledger, "cash", march, chart)).toMatchObject({
			opening: 3_780_000,
			rows: [],
		})
		expect(statement(ledger, "other-cash", february, chart)).toEqual(
			stmt("other-cash", "other-co", "THB", 0, []),
		)
	})

	it("starts at the ledger's first Posting when from is absent", () => {
		const result = statement(ledger, "cash", { to: "2024-02-29" }, chart)
		expect(result.opening).toBe(0)
		expect(result.rows.map((row) => String(row.transactionId))).toEqual([
			"t1",
			"t3",
			"t4",
			"t5",
			"t6",
		])
	})

	it("shows a Reversal as its own row on its own date", () => {
		const reversal = reverse(ledger[4]!, { id: "t8", date: "2024-02-20" }, chart)
		const rows = statement([...ledger, reversal], "cash", february, chart).rows
		expect(rows.at(-1)).toEqual({
			date: parseISODate("2024-02-20"),
			transactionId: toTransactionId("t8"),
			amount: 50_000,
			balance: 3_830_000,
		})
	})

	it("shows each Posting of a Compound Entry as its own row", () => {
		const entry = compound(
			{
				id: "c1",
				date: "2024-02-25",
				debit: [
					{ accountId: "cash", amount: 30_000 },
					{ accountId: "cash", amount: 20_000 },
					{ accountId: "food", amount: 10_000 },
				],
				credit: [{ accountId: "equity", amount: 60_000 }],
			},
			chart,
		)
		const rows = statement([...ledger, entry], "cash", february, chart).rows
		expect(
			rows.slice(-2).map(({ transactionId, amount }) => [String(transactionId), amount]),
		).toEqual([
			["c1", 30_000],
			["c1", 20_000],
		])
	})

	it("rejects an unknown id or a Header id with the balance codes", () => {
		expect(thrown(() => statement(ledger, "nope", february, chart))).toMatchObject({
			code: "UNKNOWN_ACCOUNT",
			field: "accountId",
		})
		expect(thrown(() => statement(ledger, "assets", february, chart))).toMatchObject({
			code: "NON_LEAF_ACCOUNT",
			field: "accountId",
		})
	})

	it("names the period fields for a bad or inverted period", () => {
		expect(
			thrown(() => statement(ledger, "cash", { from: "2024-02-30", to: "2024-02-29" }, chart)),
		).toMatchObject({ code: "INVALID_DATE", field: "options.from" })
		expect(
			thrown(() => statement(ledger, "cash", { from: "2024-03-01", to: "2024-02-29" }, chart)),
		).toMatchObject({ code: "INVALID_PERIOD", field: "options.from" })
	})

	it("checks the Account, then the period, then the scan", () => {
		const cashOnly = createChartOfAccounts([{ id: "cash", type: "asset", currency: "THB" }])
		expect(codeOf(() => statement(ledger, "nope", { from: "bad", to: "2024-02-29" }, chart))).toBe(
			"UNKNOWN_ACCOUNT",
		)
		expect(
			codeOf(() => statement(ledger, "cash", { from: "2024-02-30", to: "2024-02-29" }, cashOnly)),
		).toBe("INVALID_DATE")
		expect(codeOf(() => statement(ledger, "cash", february, cashOnly))).toBe("UNKNOWN_ACCOUNT")
	})

	it("rejects a duplicate Transaction id from the scan", () => {
		expect(codeOf(() => statement([...ledger, ledger[0]!], "cash", february, chart))).toBe(
			"DUPLICATE_TRANSACTION_ID",
		)
	})

	it("re-checks a Transaction outside the requested Account", () => {
		const usd = createChartOfAccounts([
			{ id: "food", type: "expense", currency: "USD" },
			{ id: "equity", type: "equity", currency: "USD" },
			{ id: "crypto", type: "asset", currency: "USD" },
		])
		const thb = createChartOfAccounts([
			{ id: "cash", type: "asset", currency: "THB" },
			{ id: "other-cash", type: "asset", currency: "THB" },
		])
		const raw = (
			validAgainst: typeof usd,
			id: string,
			postings: readonly (readonly [string, number, string])[],
		) =>
			validateTransaction(
				{
					id,
					date: "2024-02-03",
					postings: postings.map(([accountId, amount, currency]) => ({
						accountId,
						amount,
						currency,
					})),
				},
				validAgainst,
			)
		const mismatch = raw(usd, "m1", [
			["food", 1, "USD"],
			["equity", -1, "USD"],
		])
		const unknown = raw(usd, "m2", [
			["crypto", 1, "USD"],
			["equity", -1, "USD"],
		])
		const crossEntity = raw(thb, "m3", [
			["cash", 5, "THB"],
			["other-cash", -5, "THB"],
		])
		expect(codeOf(() => statement([mismatch], "cash", february, chart))).toBe("CURRENCY_MISMATCH")
		expect(codeOf(() => statement([unknown], "cash", february, chart))).toBe("UNKNOWN_ACCOUNT")
		expect(codeOf(() => statement([crossEntity], "cash", february, chart))).toBe(
			"UNBALANCED_TRANSACTION",
		)
	})
})
