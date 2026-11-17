import { describe, expect, it } from "bun:test"
import { thrown } from "./builders.fixtures"
import type {
	AccountInput,
	ChartConflictAccountRow,
	ChartOfAccounts,
	PostingInput,
	Transaction,
} from "./index"
import {
	accountId,
	chartConflicts,
	createChartOfAccounts,
	parseCurrency,
	transactionId,
	validateTransaction,
} from "./index"

/** A THB household: two asset Leaves, the income that pays them, and the equity it opens against. */
const accountInputs: readonly AccountInput[] = [
	{ id: "bank", type: "asset", currency: "THB" },
	{ id: "cash", type: "asset", currency: "THB" },
	{ id: "salary", type: "income", currency: "THB" },
	{ id: "equity", type: "equity", currency: "THB" },
]

const chart = createChartOfAccounts(accountInputs)

/** A chart edited by hand: `patch` applied per Account id, then `extra` accounts added. */
const editedChart = (
	patch: Readonly<Record<string, Partial<AccountInput>>>,
	extra: readonly AccountInput[] = [],
): ChartOfAccounts =>
	createChartOfAccounts([
		...accountInputs.map((account) => ({ ...account, ...patch[account.id] })),
		...extra,
	])

/** `bank` subdivided: it is now a Header Account, and `savings` is the Leaf under it. */
const subdivided = editedChart({}, [
	{ id: "savings", type: "asset", currency: "THB", parentId: "bank" },
])

const post = (account: string, amount: number, currency = "THB"): PostingInput => ({
	accountId: account,
	amount,
	currency,
})

const entry = (id: string, postings: PostingInput[], into: ChartOfAccounts = chart): Transaction =>
	validateTransaction({ id, date: "2024-01-01", postings }, into)

/** One Simple Entry paying 1000 THB into `bank`. */
const pay = entry("p1", [post("bank", 100_000), post("salary", -100_000)])

const accountRow = (
	id: string,
	reason: ChartConflictAccountRow["reason"],
	postings: number,
	transactions: number,
): ChartConflictAccountRow => ({ accountId: accountId(id), reason, postings, transactions })

describe("a chart that still reads the ledger", () => {
	it("reports no conflicts", () => {
		expect(chartConflicts([pay], chart)).toEqual({ accounts: [], transactions: [] })
	})
})

describe("a Leaf that became a Header", () => {
	it("reports the Account a Posting targets, with its Posting and Transaction counts", () => {
		const one = entry("p1", [post("bank", 60_000), post("bank", 40_000), post("salary", -100_000)])
		const two = entry("p2", [post("bank", 60_000), post("salary", -60_000)])
		expect(chartConflicts([one], subdivided).accounts).toEqual([accountRow("bank", "header", 2, 1)])
		expect(chartConflicts([one, two], subdivided).accounts).toEqual([
			accountRow("bank", "header", 3, 2),
		])
	})
})

describe("an Account the chart does not have", () => {
	it("reports it as unknown, and sorts it by id alone", () => {
		const without = createChartOfAccounts([{ id: "salary", type: "income", currency: "THB" }])
		const both = entry("p1", [post("bank", 1), post("cash", 1), post("salary", -2)])
		expect(chartConflicts([both], without).accounts).toEqual([
			accountRow("bank", "unknown", 1, 1),
			accountRow("cash", "unknown", 1, 1),
		])
	})
})

describe("an Account whose Currency changed", () => {
	it("reports the Posting's Currency as the reason", () => {
		expect(chartConflicts([pay], editedChart({ bank: { currency: "USD" } })).accounts).toEqual([
			accountRow("bank", "currency", 1, 1),
		])
	})
})

describe("an Account moved to another Entity", () => {
	it("reports both sides the chart leaves unbalanced, with their residuals", () => {
		expect(chartConflicts([pay], editedChart({ bank: { entityId: "other-co" } }))).toEqual({
			accounts: [],
			transactions: [
				{
					transactionId: transactionId("p1"),
					entityId: "default",
					currency: parseCurrency("THB"),
					amount: -100_000,
				},
				{
					transactionId: transactionId("p1"),
					entityId: "other-co",
					currency: parseCurrency("THB"),
					amount: 100_000,
				},
			],
		})
	})
})

describe("a Transaction with a Posting conflict and an Entity-caused unbalance", () => {
	it("reports the Account row only, the precedence the throwing path uses", () => {
		const movedAndSubdivided = editedChart({ bank: { entityId: "other-co" } }, [
			{ id: "savings", type: "asset", currency: "THB", parentId: "bank", entityId: "other-co" },
		])
		expect(chartConflicts([pay], movedAndSubdivided)).toEqual({
			accounts: [accountRow("bank", "header", 1, 1)],
			transactions: [],
		})
	})
})

describe("a duplicate Transaction id", () => {
	it("still throws, because it is a defect in the ledger and not a chart conflict", () => {
		expect(thrown(() => chartConflicts([pay, pay], chart))).toMatchObject({
			code: "DUPLICATE_TRANSACTION_ID",
			field: "transactions[1].id",
		})
	})
})

describe("the report", () => {
	it("is frozen, and its rows do not depend on Transaction order", () => {
		const other = entry("p0", [post("bank", 5_000), post("salary", -5_000)])
		const moved = editedChart({ bank: { entityId: "other-co" } })
		const report = chartConflicts([pay, other], moved)
		expect(chartConflicts([other, pay], moved)).toEqual(report)
		expect(Object.isFrozen(report)).toBe(true)
		expect(Object.isFrozen(report.accounts)).toBe(true)
		expect(Object.isFrozen(report.transactions)).toBe(true)
		expect(Object.isFrozen(report.transactions[0])).toBe(true)
		const ids = ["p0", "p0", "p1", "p1"].map(transactionId)
		expect(report.transactions.map((row) => row.transactionId)).toEqual(ids)
	})
})

describe("a residual past the safe integer range", () => {
	it("throws AMOUNT_OVERFLOW naming the sorted row's output path", () => {
		const max = Number.MAX_SAFE_INTEGER
		const bothWays = entry("p1", [
			post("bank", max),
			post("cash", max),
			post("salary", -max),
			post("equity", -max),
		])
		const bothMoved = editedChart({
			bank: { entityId: "other-co" },
			cash: { entityId: "other-co" },
		})
		expect(thrown(() => chartConflicts([bothWays], bothMoved))).toMatchObject({
			code: "AMOUNT_OVERFLOW",
			field: "chartConflicts.transactions[p1/default/THB]",
		})
	})
})
