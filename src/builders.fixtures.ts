import type { ChartOfAccounts } from "./index"
import { createChartOfAccounts, LedgerValidationError } from "./index"

/** Shared chart for the builder tests: USD and THB leaves, a header, and a second entity. */
export const chart: ChartOfAccounts = createChartOfAccounts([
	{ id: "assets", type: "asset", currency: "USD" },
	{ id: "cash", type: "asset", currency: "USD", parentId: "assets" },
	{ id: "bank", type: "asset", currency: "USD", parentId: "assets" },
	{ id: "rent", type: "expense", currency: "USD" },
	{ id: "interest", type: "expense", currency: "USD" },
	{ id: "principal", type: "liability", currency: "USD" },
	{ id: "revenue", type: "income", currency: "USD" },
	{ id: "tax-payable", type: "liability", currency: "USD" },
	{ id: "equity", type: "equity", currency: "USD" },
	{ id: "baht", type: "asset", currency: "THB" },
	{ id: "other-cash", type: "asset", currency: "USD", entityId: "other-co" },
])

/** The validation error a thunk throws, or undefined when it does not throw. */
export const thrown = (run: () => unknown): LedgerValidationError | undefined => {
	try {
		run()
	} catch (error) {
		if (!(error instanceof LedgerValidationError)) throw error
		return error
	}
	return undefined
}

/** The `field` of the error a thunk throws, or undefined. */
export const fieldOf = (run: () => unknown): string | undefined => thrown(run)?.field

/** The error code a thunk throws, or undefined when it does not throw. */
export const codeOf = (run: () => unknown): string | undefined => thrown(run)?.code
