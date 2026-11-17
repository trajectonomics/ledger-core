import { describe, expect, it } from "bun:test"
import { thrown } from "./builders.fixtures"
import { nestedChart, nestedLedger } from "./header-rollup.fixtures"
import { createChartOfAccounts, movements, reverse, type Transaction } from "./index"
import { accountInputs, bal, chart, ledger, thb, tx } from "./queries.fixtures"

const row = bal

/** February 2024: `t4`, `t5`, `t6`, `t7` and `b1`, and none of January's postings. */
const february = { from: "2024-02-01", to: "2024-02-28" }

const amountOf = (
	account: string,
	txs: readonly Transaction[],
	period: { from: string; to: string },
	source = nestedChart,
) => movements(txs, period, source).find((r) => r.accountId === account)?.amount

describe("movements", () => {
	it("gives every Leaf Account its movement over the period, sorted, zeros included", () => {
		expect(movements(nestedLedger, february, nestedChart)).toEqual([
			row("default", "broker", "THB", 500_000),
			row("default", "cash", "THB", -320_000),
			row("default", "dormant", "THB", 0),
			row("default", "equity", "THB", -500_000),
			row("default", "equity-usd", "USD", -10_000),
			row("default", "food", "THB", 200_000),
			row("default", "interest", "THB", 20_000),
			row("default", "loan", "THB", 100_000),
			row("default", "salary", "THB", 0),
			row("default", "savings", "THB", 0),
			row("default", "usd-wallet", "USD", 10_000),
			row("other-co", "other-cash", "THB", 0),
			row("other-co", "other-equity", "THB", 0),
		])
	})

	it("seeds a period with nothing posted as all-zero rows, one per Leaf Account", () => {
		const march = movements(nestedLedger, { from: "2024-03-01", to: "2024-03-31" }, nestedChart)
		expect(march).toHaveLength(movements(nestedLedger, february, nestedChart).length)
		expect(march.every((r) => r.amount === 0)).toBe(true)
		expect(march.find((r) => r.accountId === "cash")).toEqual(row("default", "cash", "THB", 0))
	})

	it("counts Postings dated on from and on to, and nothing either side", () => {
		const day = { from: "2024-02-10", to: "2024-02-10" }
		const eitherSide = { from: "2024-02-11", to: "2024-02-14" }
		expect(amountOf("food", nestedLedger, day)).toBe(50_000)
		expect(amountOf("food", nestedLedger, eitherSide)).toBe(0)
	})

	it("keeps each Entity's rows apart, so nothing nets across them", () => {
		const other = tx("o1", "2024-02-12", [thb("other-cash", 40_000), thb("other-equity", -40_000)])
		const both = [...nestedLedger, other]
		expect(amountOf("other-cash", both, february)).toBe(40_000)
		expect(amountOf("cash", both, february)).toBe(-320_000)
	})

	it("gives a THB and a USD Leaf row in the same result", () => {
		const usd = movements(nestedLedger, february, nestedChart).filter((r) => r.currency === "USD")
		expect(usd).toEqual([
			row("default", "equity-usd", "USD", -10_000),
			row("default", "usd-wallet", "USD", 10_000),
		])
	})

	it("sums Postings tagged with Dimensions like untagged ones", () => {
		const tagged = tx("d2", "2024-02-06", [
			thb("food", 70_000, { project: "alpha" }),
			thb("cash", -70_000),
		])
		const plain = tx("d2", "2024-02-06", [thb("food", 70_000), thb("cash", -70_000)])
		expect(movements([...nestedLedger, tagged], february, nestedChart)).toEqual(
			movements([...nestedLedger, plain], february, nestedChart),
		)
	})

	it("gives the same output for any Transaction order", () => {
		expect(movements([...nestedLedger].reverse(), february, nestedChart)).toEqual(
			movements(nestedLedger, february, nestedChart),
		)
	})

	it("counts a Reversal in the period of its own date", () => {
		const t5 = ledger.find((t) => t.id === "t5")!
		const corrected = [...nestedLedger, reverse(t5, { id: "r5", date: "2024-03-05" }, nestedChart)]
		expect(amountOf("food", corrected, february)).toBe(200_000)
		expect(amountOf("food", corrected, { from: "2024-03-01", to: "2024-03-31" })).toBe(-50_000)
	})

	it("rejects an inverted period with INVALID_PERIOD on options.from", () => {
		expect(
			thrown(() => movements(ledger, { from: "2024-03-01", to: "2024-02-01" }, chart)),
		).toMatchObject({ code: "INVALID_PERIOD", field: "options.from" })
	})

	it("rejects an unreal date with INVALID_DATE", () => {
		expect(
			thrown(() => movements(ledger, { from: "2024-02-30", to: "2024-03-01" }, chart))?.code,
		).toBe("INVALID_DATE")
		expect(
			thrown(() => movements(ledger, { from: "2024-02-01", to: "2024-13-01" }, chart))?.code,
		).toBe("INVALID_DATE")
	})

	it("parses the period before it scans the ledger", () => {
		const without = createChartOfAccounts(accountInputs.filter((a) => a.id !== "food"))
		const error = thrown(() => movements(ledger, { from: "2024-03-01", to: "2024-02-01" }, without))
		expect(error?.code).toBe("INVALID_PERIOD")
	})

	it("re-checks Transactions dated outside the period, mirroring the caller's input path", () => {
		const without = createChartOfAccounts(accountInputs.filter((a) => a.id !== "food"))
		const error = thrown(() => movements(ledger, { from: "2024-01-01", to: "2024-01-01" }, without))
		expect(error?.code).toBe("UNKNOWN_ACCOUNT")
		expect(error?.field).toBe("transactions[3].postings[0].accountId")
	})
})
