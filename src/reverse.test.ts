import { describe, expect, it } from "bun:test"
import { chart, codeOf } from "./builders.fixtures"
import { compound, reverse, simple, type Transaction } from "./index"
import { rng } from "./queries.property.fixtures"

const ids = ["cash", "bank", "rent", "interest", "principal", "revenue", "tax-payable", "equity"]
const pick = (next: () => number): string => ids[Math.floor(next() * ids.length)]!
const amountOf = (next: () => number): number => 1 + Math.floor(next() * 1_000_000)

/** A random valid Transaction: a Simple Entry or a Compound Entry with tagged legs. */
const randomTransaction = (next: () => number, n: number): Transaction => {
	const head = { id: `t${n}`, date: "2026-03-01" }
	if (next() < 0.4)
		return simple({ ...head, debit: pick(next), credit: pick(next), amount: amountOf(next) }, chart)
	const parts = [amountOf(next), amountOf(next), amountOf(next)]
	const tag = (i: number): object => (next() < 0.5 ? { dimensions: { leg: `${i}` } } : {})
	return compound(
		{
			...head,
			debit: [{ accountId: pick(next), amount: parts[0]! + parts[1]! + parts[2]! }],
			credit: parts.map((amount, i) => ({ accountId: pick(next), amount, ...tag(i) })),
		},
		chart,
	)
}

const original = simple(
	{ id: "t1", date: "2026-03-01", debit: "rent", credit: "cash", amount: 5 },
	chart,
)
const withDims = compound(
	{
		id: "t2",
		date: "2026-03-01",
		debit: [{ accountId: "cash", amount: 107 }],
		credit: [
			{ accountId: "revenue", amount: 100, dimensions: { project: "a", team: "b" } },
			{ accountId: "tax-payable", amount: 7 },
		],
	},
	chart,
)

describe("reverse", () => {
	it("nets every account and every (entity, currency) to zero (property)", () => {
		const next = rng(20260401)
		for (let run = 0; run < 300; run++) {
			const tx = randomTransaction(next, run)
			const reversal = reverse(tx, { id: `r${run}`, date: "2026-03-02" }, chart)
			const byAccount = new Map<string, number>()
			const byGroup = new Map<string, number>()
			for (const p of [...tx.postings, ...reversal.postings]) {
				byAccount.set(p.accountId, (byAccount.get(p.accountId) ?? 0) + p.amount)
				const key = `${chart.get(p.accountId)?.entityId}/${p.currency}`
				byGroup.set(key, (byGroup.get(key) ?? 0) + p.amount)
			}
			for (const total of [...byAccount.values(), ...byGroup.values()]) expect(total).toBe(0)
		}
	})

	it("keeps posting order and every dimensions tag, flips every sign, and links to the original", () => {
		const r = reverse(withDims, { id: "r2", date: "2026-03-05" }, chart)
		expect(r.postings.map((p) => p.accountId)).toEqual(withDims.postings.map((p) => p.accountId))
		expect(r.postings.map((p) => p.amount)).toEqual(withDims.postings.map((p) => -p.amount))
		expect(r.postings.map((p) => p.dimensions)).toEqual(withDims.postings.map((p) => p.dimensions))
		expect(r.linkedTo).toBe(withDims.id)
		expect(r.id).toBe("r2" as never)
		expect(r.date).toBe("2026-03-05" as never)
	})

	it("accepts a date equal to the original's", () => {
		expect(codeOf(() => reverse(original, { id: "r1", date: "2026-03-01" }, chart))).toBeUndefined()
	})

	it("rejects a reversal dated before its original with REVERSAL_BEFORE_ORIGINAL", () => {
		const run = () => reverse(original, { id: "r1", date: "2026-02-28" }, chart)
		expect(codeOf(run)).toBe("REVERSAL_BEFORE_ORIGINAL")
	})

	it("rejects reusing the original's id with DUPLICATE_TRANSACTION_ID", () => {
		const run = () => reverse(original, { id: "t1", date: "2026-03-02" }, chart)
		expect(codeOf(run)).toBe("DUPLICATE_TRANSACTION_ID")
	})

	it("rejects a malformed reversal date with INVALID_DATE", () => {
		expect(codeOf(() => reverse(original, { id: "r1", date: "nope" }, chart))).toBe("INVALID_DATE")
	})

	it("returns a frozen transaction and leaves the original untouched", () => {
		const snapshot = JSON.stringify(withDims)
		const input = { id: "r2", date: "2026-03-05" }
		const r = reverse(withDims, input, chart)
		expect(input).toEqual({ id: "r2", date: "2026-03-05" })
		expect(JSON.stringify(withDims)).toBe(snapshot)
		expect(Object.isFrozen(r)).toBe(true)
		expect(Object.isFrozen(r.postings)).toBe(true)
		expect(Object.isFrozen(r.postings[1]?.dimensions)).toBe(true)
	})
})
