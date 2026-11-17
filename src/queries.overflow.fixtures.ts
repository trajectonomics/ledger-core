import type { ChartOfAccounts, Transaction } from "./index"
import { createChartOfAccounts } from "./index"
import { thb, tx } from "./queries.fixtures"

export const MAX: number = Number.MAX_SAFE_INTEGER
export const BIG: number = 8e15

/** A one-day Transaction balancing `debit` against `credit`, tagged at the ledger's start. */
export const post = (
	id: string,
	debit: string,
	credit: string,
	amount: number,
	dims = {},
): Transaction => tx(id, "2024-01-01", [thb(debit, amount, dims), thb(credit, -amount)])

/** A chart whose Headers sort before its other Headers, so sorted order decides the reported row. */
export const hierarchyChart: ChartOfAccounts = createChartOfAccounts([
	{ id: "expenses", type: "expense", currency: "THB" },
	{ id: "food", type: "expense", currency: "THB", parentId: "expenses" },
	{ id: "interest", type: "expense", currency: "THB", parentId: "expenses" },
	{ id: "assets", type: "asset", currency: "THB" },
	{ id: "property", type: "asset", currency: "THB", parentId: "assets" },
	{ id: "receivables", type: "asset", currency: "THB", parentId: "assets" },
])

export const oneDay: { readonly from: string; readonly to: string } = {
	from: "2024-01-01",
	to: "2024-01-01",
}

/** `cash` overflows across January–February, but no single month of it overflows. */
export const cumulativeOverflow: readonly Transaction[] = [
	tx("a", "2024-01-01", [thb("cash", BIG), thb("equity", -BIG)]),
	tx("b", "2024-02-01", [thb("cash", BIG), thb("equity", -BIG)]),
]

/** `cash` overflows inside January, and a February Reversal would offset it. */
export const offsetByReversal: readonly Transaction[] = [
	tx("a", "2024-01-01", [thb("cash", MAX), thb("equity", -MAX)]),
	tx("b", "2024-01-02", [thb("cash", 1), thb("equity", -1)]),
	tx("r", "2024-02-10", [thb("cash", -1), thb("equity", 1)]),
]

/** January and February 2024, separately and together, and the whole of 2024. */
export const january: { readonly from: string; readonly to: string } = {
	from: "2024-01-01",
	to: "2024-01-31",
}
export const february: { readonly from: string; readonly to: string } = {
	from: "2024-02-01",
	to: "2024-02-28",
}
export const januaryFebruary: { readonly from: string; readonly to: string } = {
	from: "2024-01-01",
	to: "2024-02-28",
}
export const wholeYear: { readonly from: string; readonly to: string } = {
	from: "2024-01-01",
	to: "2024-12-31",
}
