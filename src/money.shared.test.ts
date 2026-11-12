import { describe, expect, it } from "bun:test"
import { fromMinorUnits, LedgerValidationError, toMinorUnits } from "./index"

const rejection = (fn: () => unknown): LedgerValidationError => {
	try {
		fn()
	} catch (error) {
		if (error instanceof LedgerValidationError) return error
		throw error
	}
	throw new Error("expected a LedgerValidationError")
}

// Expected values are exact decimal arithmetic on the written amount, rounded half away from zero.
describe("exact decimal conversion", () => {
	it("rounds a computed near-tie on its decimal value, not up", () => {
		expect(toMinorUnits(0.034999999999999996, "USD")).toBe(3)
		expect(toMinorUnits(-0.034999999999999996, "USD")).toBe(-3)
		expect(toMinorUnits(0.0004999999999999999, "KWD")).toBe(0)
		expect(toMinorUnits(0.49999999999999994, "JPY")).toBe(0)
	})

	it("rounds a near-half with more than 15 significant digits on its decimal value", () => {
		expect(toMinorUnits(5_000_000_000_000.015, "USD")).toBe(500_000_000_000_002)
		expect(toMinorUnits(701_893_031_597.1345, "USD")).toBe(70_189_303_159_713)
		expect(toMinorUnits(70_436_736_941_337.45, "JPY")).toBe(70_436_736_941_337)
		expect(toMinorUnits(67_426_919_937.13348, "KWD")).toBe(67_426_919_937_133)
	})

	it("keeps the written digits of an amount at or above 1e15 minor units", () => {
		expect(toMinorUnits(42_838_239_502_193.2, "USD")).toBe(4_283_823_950_219_320)
		expect(toMinorUnits(-42_838_239_502_193.2, "USD")).toBe(-4_283_823_950_219_320)
		expect(toMinorUnits(8_950_172_334_909.44, "KWD")).toBe(8_950_172_334_909_440)
	})
})

describe("signed amounts", () => {
	it("converts a negative major amount to a Credit-signed amount", () => {
		expect(toMinorUnits(-12.34, "USD")).toBe(-1234)
		expect(toMinorUnits(-1234, "JPY")).toBe(-1234)
	})

	it("converts negative minor units to a negative major amount", () => {
		expect(fromMinorUnits(-1234, "USD")).toBe(-12.34)
		expect(fromMinorUnits(-1234, "KWD")).toBe(-1.234)
	})

	it("returns positive zero for negative zero minor units", () => {
		expect(Object.is(fromMinorUnits(-0, "USD"), 0)).toBe(true)
	})
})

describe("conversion rejections", () => {
	it("rejects a non-finite major amount with INVALID_AMOUNT on majorAmount", () => {
		for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
			const error = rejection(() => toMinorUnits(value, "USD"))
			expect(error.code).toBe("INVALID_AMOUNT")
			expect(error.field).toBe("majorAmount")
			expect(error.value).toBe(value)
			expect(error.reason).not.toBe("")
		}
	})

	it("rejects a major amount whose minor units are unsafe with INVALID_AMOUNT", () => {
		const error = rejection(() => toMinorUnits(-Number.MAX_SAFE_INTEGER, "USD"))
		expect(error.code).toBe("INVALID_AMOUNT")
		expect(error.field).toBe("majorAmount")
		expect(error.value).toBe(-Number.MAX_SAFE_INTEGER)
	})

	it("rejects minor units that are not a safe integer with INVALID_AMOUNT on minorUnits", () => {
		for (const value of [-1.5, Number.NaN, Number.NEGATIVE_INFINITY, 2 ** 53]) {
			const error = rejection(() => fromMinorUnits(value, "USD"))
			expect(error.code).toBe("INVALID_AMOUNT")
			expect(error.field).toBe("minorUnits")
			expect(error.value).toBe(value)
			expect(error.reason).not.toBe("")
		}
	})

	it("rejects a non-ISO 4217 code with INVALID_CURRENCY before it looks at the amount", () => {
		expect(rejection(() => toMinorUnits(Number.NaN, "ZZZ")).code).toBe("INVALID_CURRENCY")
		expect(rejection(() => fromMinorUnits(1.5, "ZZZ")).code).toBe("INVALID_CURRENCY")
	})
})
