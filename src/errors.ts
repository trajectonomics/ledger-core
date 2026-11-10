/**
 * Every way a ledger call can be rejected. Each code names exactly one rule.
 *
 * The set only grows — never widened, re-pointed at another rule, or reused — so switch on it with a
 * total `default`, or map it with `Partial<Record<LedgerErrorCode, string>>` and a fallback; see
 * "Error codes" in the README.
 */
export type LedgerErrorCode =
	| "SINGLE_POSTING"
	| "INVALID_AMOUNT"
	| "ZERO_AMOUNT_POSTING"
	| "UNKNOWN_ACCOUNT"
	| "NON_LEAF_ACCOUNT"
	| "CURRENCY_MISMATCH"
	| "UNBALANCED_TRANSACTION"
	| "INVALID_DATE"
	| "INVALID_CURRENCY"
	| "INVALID_DIMENSION"
	| "INVALID_ACCOUNT_HIERARCHY"
	| "NEGATIVE_AMOUNT"
	| "DUPLICATE_TRANSACTION_ID"
	| "REVERSAL_BEFORE_ORIGINAL"
	| "NON_EQUITY_CONTRA"
	| "INVALID_PERIOD"
	| "AMOUNT_OVERFLOW"

/** Thrown by every smart constructor and validator in this package. */
export class LedgerValidationError extends Error {
	readonly code: LedgerErrorCode
	/** Path of the offending input, e.g. `postings[1].accountId`. */
	readonly field: string
	readonly value: unknown
	readonly reason: string

	constructor(code: LedgerErrorCode, field: string, value: unknown, reason: string) {
		super(`${code}: ${field} ${reason}`)
		this.name = "LedgerValidationError"
		this.code = code
		this.field = field
		this.value = value
		this.reason = reason
	}
}
