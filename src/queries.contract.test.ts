import { describe, expect, it } from "bun:test"
import {
	balances,
	headerRollup,
	netWorth,
	parseCurrency,
	profitAndLoss,
	trialBalance,
} from "./index"
import { bal, chart, ledger, thb, tot, tx } from "./queries.fixtures"

const trialTotal = (entityId: string, currency: string, debit: number, credit: number) => ({
	entityId,
	currency: parseCurrency(currency),
	debit,
	credit,
})

const asOf = "2024-03-01"
const year = { from: "2024-01-01", to: "2024-12-31" }

/** One Transaction balanced in `default` and in `other-co` at once. */
const crossEntity = tx("x1", asOf, [
	thb("cash", 1_000),
	thb("equity", -1_000),
	thb("other-cash", 500),
	thb("other-equity", -500),
])
const spanning = [...ledger, crossEntity]

describe("Transactions spanning Entities", () => {
	it("keeps each Entity's rows and nets nothing across Entities", () => {
		const rows = balances(spanning, asOf, chart)
		expect(rows.find((r) => r.accountId === "cash")).toEqual(
			bal("default", "cash", "THB", 3_781_000),
		)
		expect(rows.find((r) => r.accountId === "other-cash")).toEqual(
			bal("other-co", "other-cash", "THB", 500),
		)
		expect(rows.find((r) => r.accountId === "other-equity")).toEqual(
			bal("other-co", "other-equity", "THB", -500),
		)
	})

	it("totals each Entity separately in net worth and the trial balance", () => {
		expect(netWorth(spanning, asOf, chart).totals).toEqual([
			tot("default", "THB", 3_981_000),
			tot("default", "USD", 10_000),
			tot("other-co", "THB", 500),
		])
		expect(trialBalance(spanning, asOf, chart).totals).toEqual([
			trialTotal("default", "THB", 4_301_000, 4_301_000),
			trialTotal("default", "USD", 10_000, 10_000),
			trialTotal("other-co", "THB", 500, 500),
		])
	})
})

describe("query results", () => {
	it("returns frozen rows and totals", () => {
		const results = [
			{ rows: balances(ledger, asOf, chart) },
			{ rows: headerRollup(ledger, asOf, chart) },
			netWorth(ledger, asOf, chart),
			trialBalance(ledger, asOf, chart),
			profitAndLoss(ledger, year, chart),
			profitAndLoss(ledger, { ...year, groupBy: "costCentre" }, chart),
		]
		for (const result of results) {
			expect(Object.isFrozen(result.rows)).toBe(true)
			expect(Object.isFrozen(result.rows[0])).toBe(true)
			if ("totals" in result) {
				expect(Object.isFrozen(result)).toBe(true)
				expect(Object.isFrozen(result.totals)).toBe(true)
				expect(Object.isFrozen(result.totals[0])).toBe(true)
			}
		}
	})

	it("never mutates its inputs", () => {
		const where = { costCentre: "home" }
		const snapshot = JSON.stringify([ledger, [...chart.values()], where])
		balances(ledger, asOf, chart)
		headerRollup(ledger, asOf, chart)
		netWorth(ledger, asOf, chart)
		trialBalance(ledger, asOf, chart)
		profitAndLoss(ledger, { ...year, groupBy: "costCentre", where }, chart)
		expect(JSON.stringify([ledger, [...chart.values()], where])).toBe(snapshot)
	})

	it("survives a JSON round trip", () => {
		const rows = headerRollup(ledger, asOf, chart)
		expect(JSON.parse(JSON.stringify(rows))).toEqual(rows)
	})
})
