import { describe, expect, it } from "bun:test"
import { nestedChart, nestedLedger } from "./header-rollup.fixtures"
import { createChartOfAccounts, headerPeriodRollup, reverse, type Transaction } from "./index"
import { accountInputs, bal, chart, ledger, thb, tx } from "./queries.fixtures"

const row = bal

/** February 2024: `t4`, `t5`, `t6`, `t7` and `b1`, and none of January's postings. */
const february = { from: "2024-02-01", to: "2024-02-28" }

/** The error a thunk throws, or undefined. */
const errorOf = (run: () => unknown): { code?: string; field?: string } | undefined => {
	try {
		run()
	} catch (error) {
		return error as { code?: string; field?: string }
	}
	return undefined
}

const amountOf = (
	account: string,
	txs: readonly Transaction[],
	period: { from: string; to: string },
	source = nestedChart,
) => headerPeriodRollup(txs, period, source).find((r) => r.accountId === account)?.amount

describe("headerPeriodRollup", () => {
	it("rolls every Header up over the period, sorted, zeros included", () => {
		expect(headerPeriodRollup(nestedLedger, february, nestedChart)).toEqual([
			row("default", "assets", "THB", 180_000),
			row("default", "assets", "USD", 10_000),
			row("default", "current", "THB", -320_000),
			row("default", "expenses", "THB", 220_000),
			row("default", "liabilities", "THB", 100_000),
			row("default", "untouched", "THB", 0),
			row("other-co", "other-assets", "THB", 0),
		])
	})

	it("gives an Expense Header exactly the period's figure", () => {
		expect(amountOf("expenses", nestedLedger, february)).toBe(220_000)
		expect(amountOf("expenses", nestedLedger, { from: "2024-03-01", to: "2024-03-31" })).toBe(0)
	})

	it("counts Postings dated on from and on to, and nothing either side", () => {
		const day = { from: "2024-02-10", to: "2024-02-10" }
		const eitherSide = { from: "2024-02-11", to: "2024-02-14" }
		expect(amountOf("assets", nestedLedger, day)).toBe(-50_000)
		expect(amountOf("expenses", nestedLedger, eitherSide)).toBe(0)
	})

	it("seeds a period with nothing posted as all-zero rows, one per Header and Currency", () => {
		const march = headerPeriodRollup(
			nestedLedger,
			{ from: "2024-03-01", to: "2024-03-31" },
			nestedChart,
		)
		expect(march).toEqual([
			row("default", "assets", "THB", 0),
			row("default", "assets", "USD", 0),
			row("default", "current", "THB", 0),
			row("default", "expenses", "THB", 0),
			row("default", "liabilities", "THB", 0),
			row("default", "untouched", "THB", 0),
			row("other-co", "other-assets", "THB", 0),
		])
	})

	it("keys rows by the descendant Leaves' Currencies, never the Header's own", () => {
		// `current` is a USD Header over THB Leaves: one THB row, none in its own Currency.
		expect(
			headerPeriodRollup(nestedLedger, february, nestedChart).filter(
				(r) => r.accountId === "current",
			),
		).toEqual([row("default", "current", "THB", -320_000)])
	})

	it("keeps each Entity's rows apart, so nothing nets across them", () => {
		const other = tx("o1", "2024-02-12", [thb("other-cash", 40_000), thb("other-equity", -40_000)])
		const both = [...nestedLedger, other]
		expect(
			headerPeriodRollup(both, february, nestedChart).filter((r) => r.accountId === "other-assets"),
		).toEqual([row("other-co", "other-assets", "THB", 40_000)])
		expect(amountOf("assets", both, february)).toBe(180_000)
	})

	it("sums Postings tagged with Dimensions like untagged ones", () => {
		const tagged = tx("d2", "2024-02-06", [
			thb("food", 70_000, { project: "alpha" }),
			thb("cash", -70_000),
		])
		const plain = tx("d2", "2024-02-06", [thb("food", 70_000), thb("cash", -70_000)])
		expect(headerPeriodRollup([...nestedLedger, tagged], february, nestedChart)).toEqual(
			headerPeriodRollup([...nestedLedger, plain], february, nestedChart),
		)
	})

	it("gives the same output for any Transaction order", () => {
		expect(headerPeriodRollup([...nestedLedger].reverse(), february, nestedChart)).toEqual(
			headerPeriodRollup(nestedLedger, february, nestedChart),
		)
	})

	it("counts a Reversal in the period of its own date", () => {
		const t5 = ledger.find((t) => t.id === "t5")!
		const corrected = [...nestedLedger, reverse(t5, { id: "r5", date: "2024-03-05" }, nestedChart)]
		expect(amountOf("expenses", corrected, february)).toBe(220_000)
		expect(amountOf("expenses", corrected, { from: "2024-03-01", to: "2024-03-31" })).toBe(-50_000)
	})

	it("rejects an inverted period with INVALID_PERIOD on options.from", () => {
		expect(
			errorOf(() => headerPeriodRollup(ledger, { from: "2024-03-01", to: "2024-02-01" }, chart)),
		).toMatchObject({ code: "INVALID_PERIOD", field: "options.from" })
	})

	it("rejects an unreal date with INVALID_DATE", () => {
		expect(
			errorOf(() => headerPeriodRollup(ledger, { from: "2024-02-30", to: "2024-03-01" }, chart))
				?.code,
		).toBe("INVALID_DATE")
		expect(
			errorOf(() => headerPeriodRollup(ledger, { from: "2024-02-01", to: "2024-13-01" }, chart))
				?.code,
		).toBe("INVALID_DATE")
	})

	it("parses the period before it scans the ledger", () => {
		const without = createChartOfAccounts(accountInputs.filter((a) => a.id !== "food"))
		const error = errorOf(() =>
			headerPeriodRollup(ledger, { from: "2024-03-01", to: "2024-02-01" }, without),
		)
		expect(error?.code).toBe("INVALID_PERIOD")
	})

	it("re-checks Transactions dated outside the period, mirroring the caller's input path", () => {
		const without = createChartOfAccounts(accountInputs.filter((a) => a.id !== "food"))
		const error = errorOf(() =>
			headerPeriodRollup(ledger, { from: "2024-01-01", to: "2024-01-01" }, without),
		)
		expect(error?.code).toBe("UNKNOWN_ACCOUNT")
		expect(error?.field).toBe("transactions[3].postings[0].accountId")
	})
})
