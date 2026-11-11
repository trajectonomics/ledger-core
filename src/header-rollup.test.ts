import { describe, expect, it } from "bun:test"
import { nestedChart, nestedLedger } from "./header-rollup.fixtures"
import { balances, createChartOfAccounts, headerRollup, reverse, type Transaction } from "./index"
import { accountInputs, bal, chart, ledger, thb, tx } from "./queries.fixtures"

const row = bal
const asOf = "2024-02-28"

/** The error a thunk throws, or undefined. */
const errorOf = (run: () => unknown): { code?: string; field?: string } | undefined => {
	try {
		run()
	} catch (error) {
		return error as { code?: string; field?: string }
	}
	return undefined
}

const amountOf = (account: string, txs: readonly Transaction[], at: string, source = chart) =>
	headerRollup(txs, at, source).find((r) => r.accountId === account)?.amount

describe("headerRollup", () => {
	it("rolls every Header up per descendant Currency, sorted, zeros included", () => {
		expect(headerRollup(nestedLedger, asOf, nestedChart)).toEqual([
			row("default", "assets", "THB", 4_580_000),
			row("default", "assets", "USD", 10_000),
			row("default", "current", "THB", 4_080_000),
			row("default", "expenses", "THB", 220_000),
			row("default", "liabilities", "THB", -100_000),
			row("default", "untouched", "THB", 0),
			row("other-co", "other-assets", "THB", 0),
		])
	})

	it("gives the golden chart's assets Header the hand-computed 4_080_000", () => {
		expect(headerRollup(ledger, asOf, chart)).toEqual([row("default", "assets", "THB", 4_080_000)])
	})

	it("keys rows by the descendant Leaves' Currencies, never the Header's own", () => {
		const rows = headerRollup(nestedLedger, asOf, nestedChart)
		// `current` is a USD Header over THB Leaves: one THB row, none in its own Currency.
		expect(rows.filter((r) => r.accountId === "current")).toEqual([
			row("default", "current", "THB", 4_080_000),
		])
		// `assets` is a THB Header with a USD Leaf beneath it, so USD is one of its rows.
		expect(rows.filter((r) => r.accountId === "assets")).toEqual([
			row("default", "assets", "THB", 4_580_000),
			row("default", "assets", "USD", 10_000),
		])
	})

	it("shows a Header with nothing posted beneath it as a zero row", () => {
		expect(amountOf("untouched", nestedLedger, asOf, nestedChart)).toBe(0)
	})

	it("returns an empty frozen array for a chart without Headers", () => {
		const flat = createChartOfAccounts(
			accountInputs.map(({ id, type, currency, entityId }) => ({
				id,
				type,
				currency,
				...(entityId === undefined ? {} : { entityId }),
			})),
		)
		const rows = headerRollup(ledger, asOf, flat)
		expect(rows).toEqual([])
		expect(Object.isFrozen(rows)).toBe(true)
	})

	it("rolls a Credit-normal Header up to a negative amount", () => {
		expect(amountOf("liabilities", nestedLedger, asOf, nestedChart)).toBe(-100_000)
	})

	it("covers a Header's whole subtree, so a parent includes its child Header's Leaves", () => {
		const assets = amountOf("assets", nestedLedger, asOf, nestedChart)!
		const current = amountOf("current", nestedLedger, asOf, nestedChart)!
		const broker = balances(nestedLedger, asOf, nestedChart).find((r) => r.accountId === "broker")!
		expect(current).toBe(4_080_000)
		expect(assets).toBe(4_580_000)
		// `assets` sums `current`'s Leaves plus `broker`, the THB Leaf beside the `current` Header.
		expect(assets - current).toBe(broker.amount)
	})

	it("includes Transactions dated on asOf and excludes later ones", () => {
		expect(amountOf("assets", ledger, "2024-01-30")).toBe(400_000)
		expect(amountOf("assets", ledger, "2024-01-31")).toBe(4_400_000)
	})

	it("nets a Reversal against its original, counting it on its own date", () => {
		const t5 = ledger.find((t) => t.id === "t5")!
		const corrected = [...ledger, reverse(t5, { id: "r5", date: "2024-03-05" }, chart)]
		expect(amountOf("assets", corrected, "2024-03-04")).toBe(4_080_000)
		expect(amountOf("assets", corrected, "2024-03-05")).toBe(4_130_000)
	})

	it("sums Postings tagged with Dimensions like untagged ones", () => {
		const tagged = tx("d1", "2024-02-06", [
			thb("cash", 70_000, { project: "alpha" }),
			thb("equity", -70_000),
		])
		const plain = tx("d1", "2024-02-06", [thb("cash", 70_000), thb("equity", -70_000)])
		expect(headerRollup([...ledger, tagged], asOf, chart)).toEqual(
			headerRollup([...ledger, plain], asOf, chart),
		)
	})

	it("gives the same output for any Transaction order", () => {
		expect(headerRollup([...nestedLedger].reverse(), asOf, nestedChart)).toEqual(
			headerRollup(nestedLedger, asOf, nestedChart),
		)
	})

	it("rejects an invalid asOf with INVALID_DATE", () => {
		expect(errorOf(() => headerRollup(ledger, "2024-02-30", chart))?.code).toBe("INVALID_DATE")
	})

	it("re-checks Transactions dated after asOf, mirroring the caller's input path", () => {
		const without = createChartOfAccounts(accountInputs.filter((a) => a.id !== "food"))
		const error = errorOf(() => headerRollup(ledger, "2024-01-01", without))
		expect(error?.code).toBe("UNKNOWN_ACCOUNT")
		expect(error?.field).toBe("transactions[3].postings[0].accountId")
	})
})
