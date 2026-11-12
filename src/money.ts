import {
	MoneyValidationError,
	fromMinorUnits as sharedFromMinorUnits,
	toMinorUnits as sharedToMinorUnits,
} from "@trajectonomics/money"
import { minorUnitDigits, parseCurrency } from "./currency"
import { LedgerValidationError } from "./errors"

// The ledger is signed (Debit +, Credit -), so both conversions accept negative amounts.
const signed = { allowNegative: true } as const

/** Runs a shared conversion, reporting its rejection as the ledger's `INVALID_AMOUNT`. */
const convert = (
	amount: number,
	currency: string,
	field: string,
	to: typeof sharedToMinorUnits,
) => {
	const digits = minorUnitDigits(parseCurrency(currency))
	try {
		return to(amount, digits, field, signed)
	} catch (error) {
		if (!(error instanceof MoneyValidationError)) throw error
		throw new LedgerValidationError("INVALID_AMOUNT", error.field, error.value, error.reason)
	}
}

/**
 * Convert a major-unit amount (`12.34`) to signed integer minor units (`1234`).
 * Delegates to `@trajectonomics/money` with the currency's `Intl`-resolved digits:
 * exact decimal expansion, rounded half away from zero.
 */
export const toMinorUnits = (majorAmount: number, currency: string): number =>
	convert(majorAmount, currency, "majorAmount", sharedToMinorUnits)

/**
 * Convert signed integer minor units (`1234`) to a major-unit amount (`12.34`).
 * Delegates to `@trajectonomics/money` with the currency's `Intl`-resolved digits.
 */
export const fromMinorUnits = (minorUnits: number, currency: string): number =>
	convert(minorUnits, currency, "minorUnits", sharedFromMinorUnits)
