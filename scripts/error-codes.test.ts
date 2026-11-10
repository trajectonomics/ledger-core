import { describe, expect, it } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { LedgerErrorCode } from "../src/errors"

const SRC = join(import.meta.dir, "..", "src")

/** Every code declared in the `LedgerErrorCode` union. */
const declaredCodes = (): string[] => {
	const source = readFileSync(join(SRC, "errors.ts"), "utf8")
	const union = /export type LedgerErrorCode =([\s\S]*?)\n\n/.exec(source)?.[1] ?? ""
	return [...union.matchAll(/"([A-Z][A-Z_]+)"/g)].map((match) => match[1] as string)
}

/**
 * Every declared code, pinned. Adding one to the union without adding it here fails `bun run
 * typecheck`, and so does removing one that is still listed: a code was added or removed, which is
 * `feat!:` today and breaking from 1.0 (ADR-0005).
 *
 * TODO(#33): a runtime `LEDGER_ERROR_CODES` list, if it ships, belongs beside this pin.
 */
const PINNED_CODES = {
	SINGLE_POSTING: true,
	INVALID_AMOUNT: true,
	ZERO_AMOUNT_POSTING: true,
	UNKNOWN_ACCOUNT: true,
	NON_LEAF_ACCOUNT: true,
	CURRENCY_MISMATCH: true,
	UNBALANCED_TRANSACTION: true,
	INVALID_DATE: true,
	INVALID_CURRENCY: true,
	INVALID_DIMENSION: true,
	INVALID_ACCOUNT_HIERARCHY: true,
	NEGATIVE_AMOUNT: true,
	DUPLICATE_TRANSACTION_ID: true,
	REVERSAL_BEFORE_ORIGINAL: true,
	NON_EQUITY_CONTRA: true,
	INVALID_PERIOD: true,
	AMOUNT_OVERFLOW: true,
} satisfies Record<LedgerErrorCode, true>

const testSource = (): string =>
	readdirSync(SRC)
		.filter((file) => file.endsWith(".test.ts"))
		.map((file) => readFileSync(join(SRC, file), "utf8"))
		.join("\n")

describe("error code coverage", () => {
	it("reads the declared codes", () => {
		expect(declaredCodes().length).toBeGreaterThan(5)
	})

	it("every LedgerErrorCode is asserted by some test", () => {
		const tests = testSource()
		const untested = declaredCodes().filter((code) => !tests.includes(`"${code}"`))
		expect(untested).toEqual([])
	})
})

describe("error code pin", () => {
	it("every declared code is pinned, and nothing else", () => {
		expect(Object.keys(PINNED_CODES).sort()).toEqual(declaredCodes().sort())
	})
})
