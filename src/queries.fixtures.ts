import type {
	AccountInput,
	BalanceRow,
	ChartOfAccounts,
	PostingInput,
	Total,
	Transaction,
} from "./index"
import { accountId, createChartOfAccounts, parseCurrency, validateTransaction } from "./index"

/**
 * Golden chart: THB household in the `default` entity (with a Header over two asset Leaves), one
 * USD wallet, and a second entity `other-co` that never posts.
 */
export const accountInputs: readonly AccountInput[] = [
	{ id: "assets", type: "asset", currency: "THB" },
	{ id: "cash", type: "asset", currency: "THB", parentId: "assets" },
	{ id: "savings", type: "asset", currency: "THB", parentId: "assets" },
	{ id: "loan", type: "liability", currency: "THB" },
	{ id: "equity", type: "equity", currency: "THB" },
	{ id: "salary", type: "income", currency: "THB" },
	{ id: "food", type: "expense", currency: "THB" },
	{ id: "interest", type: "expense", currency: "THB" },
	{ id: "usd-wallet", type: "asset", currency: "USD" },
	{ id: "equity-usd", type: "equity", currency: "USD" },
	{ id: "other-cash", type: "asset", currency: "THB", entityId: "other-co" },
	{ id: "other-equity", type: "equity", currency: "THB", entityId: "other-co" },
]

export const chart: ChartOfAccounts = createChartOfAccounts(accountInputs)

/** A THB posting; `amount` is signed minor units (satang). */
export const thb = (
	accountId: string,
	amount: number,
	dimensions?: Record<string, string>,
): PostingInput => ({ accountId, amount, currency: "THB", ...(dimensions ? { dimensions } : {}) })

/** A transaction validated against the golden chart. */
export const tx = (id: string, date: string, postings: PostingInput[]): Transaction =>
	validateTransaction({ id, date, postings }, chart)

/**
 * Hand-computed ledger. As of 2024-02-28, in satang:
 * cash 3_780_000, savings 300_000, loan -100_000, equity -200_000, salary -4_000_000,
 * food 200_000, interest 20_000, usd-wallet 10_000, equity-usd -10_000.
 *
 * The `assets` Header over `cash` and `savings` therefore rolls up to 4_080_000.
 */
export const ledger: readonly Transaction[] = [
	tx("t1", "2024-01-01", [thb("cash", 100_000), thb("equity", -100_000)]),
	tx("t2", "2024-01-01", [thb("savings", 300_000), thb("equity", -100_000), thb("loan", -200_000)]),
	tx("t3", "2024-01-31", [thb("cash", 4_000_000), thb("salary", -4_000_000, { project: "alpha" })]),
	tx("t4", "2024-02-01", [thb("food", 150_000, { costCentre: "home" }), thb("cash", -150_000)]),
	tx("t5", "2024-02-10", [thb("food", 50_000), thb("cash", -50_000)]),
	tx("t6", "2024-02-15", [
		thb("loan", 100_000),
		thb("interest", 20_000, { costCentre: "home" }),
		thb("cash", -120_000),
	]),
	tx("t7", "2024-02-20", [
		{ accountId: "usd-wallet", amount: 10_000, currency: "USD" },
		{ accountId: "equity-usd", amount: -10_000, currency: "USD" },
	]),
]

/** A balance row with the account id and currency brands applied, for literal expectations. */
export const bal = (
	entityId: string,
	account: string,
	currency: string,
	amount: number,
): BalanceRow => ({
	entityId,
	accountId: accountId(account),
	currency: parseCurrency(currency),
	amount,
})

/** A total with the currency brand applied, for literal expectations. */
export const tot = (entityId: string, currency: string, amount: number): Total => ({
	entityId,
	currency: parseCurrency(currency),
	amount,
})
