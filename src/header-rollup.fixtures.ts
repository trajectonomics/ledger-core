import type { AccountInput, ChartOfAccounts, Transaction } from "./index"
import { createChartOfAccounts, validateTransaction } from "./index"
import { accountInputs, ledger } from "./queries.fixtures"

/**
 * The golden chart with a deeper hierarchy: `assets` over the USD Header `current` over the THB
 * Leaves `cash` and `savings`, with `broker` beside `current` and `usd-wallet` moved under
 * `assets`; a Credit-normal `liabilities` over `loan`; an `untouched` Header over `dormant` with
 * nothing posted beneath it; and `other-assets` over `other-cash` in the second Entity.
 */
const reparented = new Map([
	["cash", "current"],
	["savings", "current"],
	["loan", "liabilities"],
	["usd-wallet", "assets"],
	["other-cash", "other-assets"],
])

/** The golden Account inputs re-parented, plus this fixture's own Headers and Leaves. */
export const nestedAccountInputs: readonly AccountInput[] = [
	...accountInputs.map((account) => {
		const parentId = reparented.get(account.id)
		return parentId === undefined ? account : { ...account, parentId }
	}),
	{ id: "current", type: "asset", currency: "USD", parentId: "assets" },
	{ id: "broker", type: "asset", currency: "THB", parentId: "assets" },
	{ id: "liabilities", type: "liability", currency: "THB" },
	{ id: "untouched", type: "asset", currency: "THB" },
	{ id: "dormant", type: "asset", currency: "THB", parentId: "untouched" },
	{ id: "other-assets", type: "asset", currency: "THB", entityId: "other-co" },
]

export const nestedChart: ChartOfAccounts = createChartOfAccounts(nestedAccountInputs)

/** The golden ledger plus 500_000 satang on `broker`, which `current` does not cover. */
export const nestedLedger: readonly Transaction[] = [
	...ledger,
	validateTransaction(
		{
			id: "b1",
			date: "2024-02-05",
			postings: [
				{ accountId: "broker", amount: 500_000, currency: "THB" },
				{ accountId: "equity", amount: -500_000, currency: "THB" },
			],
		},
		nestedChart,
	),
]

/** Each Header and the descendant Leaves whose Balances it sums. Written out by hand. */
export const headerDescendants: Readonly<Record<string, readonly string[]>> = {
	assets: ["broker", "cash", "savings", "usd-wallet"],
	current: ["cash", "savings"],
	liabilities: ["loan"],
	untouched: ["dormant"],
	"other-assets": ["other-cash"],
}

/** The Headers with no Header ancestor, and every Leaf one of them covers. Written out by hand. */
export const rootHeaders: readonly string[] = ["assets", "liabilities", "untouched", "other-assets"]

export const coveredLeaves: readonly string[] = [
	"broker",
	"cash",
	"savings",
	"usd-wallet",
	"loan",
	"dormant",
	"other-cash",
]
