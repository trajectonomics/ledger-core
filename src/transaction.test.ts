import { describe, expect, it } from "bun:test"
import { thrown } from "./builders.fixtures"
import {
	type AccountInput,
	createChartOfAccounts,
	LedgerValidationError,
	type PostingInput,
	type Transaction,
	validateTransaction,
} from "./index"

const accounts: AccountInput[] = [
	{ id: "assets", type: "asset", currency: "USD" },
	{ id: "cash", type: "asset", currency: "USD", parentId: "assets" },
	{ id: "rent", type: "expense", currency: "USD" },
	{ id: "salary", type: "income", currency: "USD" },
	{ id: "baht", type: "asset", currency: "THB" },
	{ id: "other", type: "asset", currency: "USD", entityId: "other-co" },
]
const chart = createChartOfAccounts(accounts)
const p = (accountId: string, amount: number, currency = "USD"): PostingInput => ({
	accountId,
	amount,
	currency,
})
const tx = (
	postings: PostingInput[],
	extra: object = {},
): Parameters<typeof validateTransaction>[0] => ({
	id: "t1",
	date: "2026-03-01",
	postings,
	...extra,
})
const codeOf = (input: Parameters<typeof validateTransaction>[0]): string | undefined =>
	thrown(() => validateTransaction(input, chart))?.code

describe("validateTransaction accepts", () => {
	it("a balanced debit/credit pair and returns it", () => {
		const t = validateTransaction(tx([p("rent", 5000), p("cash", -5000)]), chart)
		expect(t.id).toBe("t1" as never)
		expect(t.date).toBe("2026-03-01" as never)
		expect(t.postings).toHaveLength(2)
	})

	it("balance independently per (entity, currency) and keeps dimensions and linkedTo", () => {
		const input = tx(
			[
				{ ...p("rent", 100), dimensions: { project: "alpha" } },
				p("cash", -100),
				p("baht", 50, "THB"),
				p("baht", -50, "THB"),
			],
			{ linkedTo: "t0" },
		)
		const t = validateTransaction(input, chart)
		expect(t.linkedTo).toBe("t0" as never)
		expect(t.postings[0]?.dimensions).toEqual({ project: "alpha" })
	})
})

describe("validateTransaction rejects", () => {
	it("a single posting", () => expect(codeOf(tx([p("cash", 1)]))).toBe("SINGLE_POSTING"))
	it("zero-amount postings", () => {
		expect(codeOf(tx([p("cash", 0), p("rent", 0)]))).toBe("ZERO_AMOUNT_POSTING")
	})
	it("float, NaN, Infinity and unsafe amounts", () => {
		for (const amount of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53]) {
			expect(codeOf(tx([p("cash", amount), p("rent", -1)]))).toBe("INVALID_AMOUNT")
		}
	})
	it("unknown accounts", () => {
		expect(codeOf(tx([p("ghost", 5), p("cash", -5)]))).toBe("UNKNOWN_ACCOUNT")
	})
	it("postings to header accounts", () => {
		expect(codeOf(tx([p("assets", 5), p("rent", -5)]))).toBe("NON_LEAF_ACCOUNT")
	})
	it("a posting currency different from its account currency", () => {
		expect(codeOf(tx([p("cash", 5, "THB"), p("rent", -5)]))).toBe("CURRENCY_MISMATCH")
	})
	it("unbalanced transactions", () => {
		expect(codeOf(tx([p("rent", 5), p("cash", -4)]))).toBe("UNBALANCED_TRANSACTION")
	})
	it("transactions balanced only across entities", () => {
		expect(codeOf(tx([p("cash", 5), p("other", -5)]))).toBe("UNBALANCED_TRANSACTION")
	})
	it("transactions balanced only across currencies", () => {
		expect(codeOf(tx([p("cash", 5), p("baht", -5, "THB")]))).toBe("UNBALANCED_TRANSACTION")
	})
	it("names the first unbalanced Entity and Currency, with the residual", () => {
		const pair = tx([p("cash", 5), p("other", -5)])
		expect(thrown(() => validateTransaction(pair, chart))).toMatchObject({
			code: "UNBALANCED_TRANSACTION",
			field: "postings",
			value: "5",
			reason: 'entity "default" USD sums to 5 instead of 0',
		})
	})
	it("malformed and non-existent calendar dates", () => {
		for (const date of ["2026-02-30", "2026-13-01", "2026-1-01", "20260301", "", "2025-02-29"]) {
			expect(codeOf(tx([p("rent", 5), p("cash", -5)], { date }))).toBe("INVALID_DATE")
		}
		expect(codeOf(tx([p("rent", 5), p("cash", -5)], { date: "2024-02-29" }))).toBeUndefined()
	})
	it("non-ISO 4217 posting currency", () => {
		expect(codeOf(tx([p("cash", 5, "ZZZ"), p("rent", -5)]))).toBe("INVALID_CURRENCY")
	})
	it("empty dimension keys or values", () => {
		for (const dimensions of [{ "": "x" }, { project: "" }]) {
			const postings = [{ ...p("rent", 5), dimensions }, p("cash", -5)]
			expect(codeOf(tx(postings))).toBe("INVALID_DIMENSION")
		}
	})
})

describe("LedgerValidationError", () => {
	it("carries code, field, value and reason", () => {
		try {
			validateTransaction(tx([p("rent", 5), p("ghost", -5)]), chart)
			throw new Error("unreachable")
		} catch (error) {
			const e = error as LedgerValidationError
			expect(e).toBeInstanceOf(Error)
			expect(e.name).toBe("LedgerValidationError")
			expect(e.code).toBe("UNKNOWN_ACCOUNT")
			expect(e.field).toBe("postings[1].accountId")
			expect(e.value).toBe("ghost")
			expect(e.reason).toBeString()
		}
	})
})

describe("validated output", () => {
	const t = validateTransaction(
		tx([{ ...p("rent", 5), dimensions: { project: "a" } }, p("cash", -5)]),
		chart,
	)
	it("is frozen so the balance invariant cannot be mutated away", () => {
		expect(Object.isFrozen(t)).toBe(true)
		expect(Object.isFrozen(t.postings)).toBe(true)
		expect(Object.isFrozen(t.postings[0]?.dimensions)).toBe(true)
	})
	it("treats a non-array postings value as too few postings", () => {
		const bad = { id: "t", date: "2026-03-01", postings: undefined } as never
		expect(codeOf(bad)).toBe("SINGLE_POSTING")
	})
	it("keeps the chart read-only and entity names with odd characters unambiguous", () => {
		expect(() => (chart as unknown as Map<never, never>).clear()).toThrow(TypeError)
		const odd = createChartOfAccounts([
			{ id: "x", type: "asset", currency: "USD", entityId: "a\u0000USD" },
			{ id: "y", type: "asset", currency: "USD", entityId: "a" },
		])
		expect(() => validateTransaction(tx([p("x", 5), p("y", -5)]), odd)).toThrow(
			LedgerValidationError,
		)
	})
})

describe("unforgeable Transaction brand", () => {
	it("a spread copy of a Transaction is not itself a Transaction", () => {
		const t = validateTransaction(tx([p("rent", 5), p("cash", -5)]), chart)
		// @ts-expect-error spreading drops the private brand member, so this must not compile
		const forged: Transaction = { ...t, postings: [p("rent", 999)] }
		expect(forged.postings).toHaveLength(1)
	})
})

describe("error field paths and rule precedence", () => {
	const fieldOf = (input: Parameters<typeof validateTransaction>[0]): string | undefined =>
		thrown(() => validateTransaction(input, chart))?.field
	it("points at the offending posting and property", () => {
		expect(fieldOf(tx([p("rent", 5), p("cash", 0)]))).toBe("postings[1].amount")
		expect(fieldOf(tx([p("rent", 5), p("assets", -5)]))).toBe("postings[1].accountId")
		expect(fieldOf(tx([p("rent", 5), p("cash", -5, "THB")]))).toBe("postings[1].currency")
		expect(fieldOf(tx([p("rent", 5), p("cash", -5)], { date: "nope" }))).toBe("date")
	})
	it("reports the first failing posting when several are wrong", () => {
		expect(codeOf(tx([p("ghost", 1.5), p("cash", 0)]))).toBe("INVALID_AMOUNT")
		expect(codeOf(tx([p("ghost", 5), p("assets", 0)]))).toBe("UNKNOWN_ACCOUNT")
		expect(codeOf(tx([p("cash", 0), p("ghost", 5)]))).toBe("ZERO_AMOUNT_POSTING")
	})
})
