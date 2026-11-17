import { describe, expect, it } from "bun:test"
import { codeOf } from "./builders.fixtures"
import type {
	AccountInput,
	ChartConflictReason,
	ChartConflicts,
	ChartOfAccounts,
	Transaction,
} from "./index"
import {
	accountId,
	balance,
	balances,
	chartConflicts,
	createChartOfAccounts,
	headerPeriodRollup,
	headerRollup,
	netWorth,
	profitAndLoss,
	trialBalance,
} from "./index"
import { accountInputs, chart } from "./queries.fixtures"
import { ledgerOf, pick, rng, seeds, shuffled } from "./queries.property.fixtures"

/** A posted Account as the golden chart has it, for the type, Currency and Entity an edit copies. */
const accountOf = (id: string) => chart.get(accountId(id))!

/** An Account with no parent, so moving its Entity keeps the hierarchy valid. */
const rootLeaves = ["loan", "equity", "salary", "food", "interest", "usd-wallet"] as const

/** The Account `balance` is probed with; no edit turns it into a Header, or it would always throw. */
const PROBED = "interest"

const edited = (patch: Readonly<Record<string, Partial<AccountInput>>>): ChartOfAccounts =>
	createChartOfAccounts(accountInputs.map((account) => ({ ...account, ...patch[account.id] })))

interface Edit {
	readonly chart: ChartOfAccounts
	/** The Account this edit turned into a Header Account, when it did. */
	readonly headerOf?: string
}

/** The three chart edits a person makes: subdivide a posted Leaf, change a Currency, move an Entity. */
const editsOf = (seed: number): readonly Edit[] => {
	const next = rng(seed + 10_000)
	const posted = [...new Set(ledgerOf(seed).flatMap((t) => t.postings.map((p) => p.accountId)))]
	const subdivided = pick(
		posted.filter((id) => id !== PROBED),
		next,
	)
	const parent = accountOf(subdivided)
	const moved = pick(rootLeaves, next)
	const revalued = pick(posted, next)
	return [
		{
			chart: createChartOfAccounts([
				...accountInputs,
				{
					id: `${subdivided}-child`,
					type: parent.type,
					currency: parent.currency,
					entityId: parent.entityId,
					parentId: subdivided,
				},
			]),
			headerOf: subdivided,
		},
		{
			chart: edited({
				[revalued]: { currency: accountOf(revalued).currency === "THB" ? "USD" : "THB" },
			}),
		},
		{
			chart: edited({
				[moved]: { entityId: accountOf(moved).entityId === "other-co" ? "default" : "other-co" },
			}),
		},
	]
}

const AS_OF = "2024-12-31"
const YEAR = { from: "2024-01-01", to: "2024-12-31" }

/** Every reading query's rejection, over the same ledger and chart. */
const readingCodes = (
	txs: readonly Transaction[],
	each: ChartOfAccounts,
): (string | undefined)[] => [
	codeOf(() => balances(txs, AS_OF, each)),
	codeOf(() => balance(txs, PROBED, AS_OF, each)),
	codeOf(() => headerRollup(txs, AS_OF, each)),
	codeOf(() => headerPeriodRollup(txs, YEAR, each)),
	codeOf(() => netWorth(txs, AS_OF, each)),
	codeOf(() => profitAndLoss(txs, YEAR, each)),
	codeOf(() => trialBalance(txs, AS_OF, each)),
]

const CODE_OF_REASON: Record<ChartConflictReason, string> = {
	unknown: "UNKNOWN_ACCOUNT",
	header: "NON_LEAF_ACCOUNT",
	currency: "CURRENCY_MISMATCH",
}

/** The codes a report's rows stand for: one per reason, plus the chart-caused unbalance. */
const codesOf = (report: ChartConflicts): Set<string> => {
	const codes = new Set(report.accounts.map((row) => CODE_OF_REASON[row.reason]))
	if (report.transactions.length > 0) codes.add("UNBALANCED_TRANSACTION")
	return codes
}

/** Every code the reading queries throw is the code some row of the report stands for. */
const expectMapped = (txs: readonly Transaction[], each: ChartOfAccounts, label: string): void => {
	const represented = codesOf(chartConflicts(txs, each))
	for (const code of readingCodes(txs, each)) {
		if (code !== undefined) expect(represented, `${label} ${code}`).toContain(code)
	}
}

describe("chart conflict properties", () => {
	it("is empty exactly when every reading query reads the same ledger", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			for (const edit of editsOf(seed)) {
				const report = chartConflicts(txs, edit.chart)
				const codes = readingCodes(txs, edit.chart).filter((code) => code !== undefined)
				expect(codes.length === 0, `seed ${seed}`).toBe(
					report.accounts.length === 0 && report.transactions.length === 0,
				)
			}
		}
	})

	it("names exactly the Account a Header edit made unreadable, with its counts", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			const edit = editsOf(seed)[0]!
			const targeting = txs.filter((transaction) =>
				transaction.postings.some((posting) => posting.accountId === edit.headerOf),
			)
			const affected = targeting.reduce(
				(count, transaction) =>
					count +
					transaction.postings.filter((posting) => posting.accountId === edit.headerOf).length,
				0,
			)
			expect(
				chartConflicts(txs, edit.chart).accounts.filter(
					(row) => row.accountId === edit.headerOf && row.reason === "header",
				),
				`seed ${seed}`,
			).toEqual([
				{
					accountId: accountId(edit.headerOf!),
					reason: "header",
					postings: affected,
					transactions: targeting.length,
				},
			])
		}
	})

	it("maps every code a reading query throws to some row's reason", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			for (const edit of editsOf(seed)) expectMapped(txs, edit.chart, `seed ${seed}`)
		}
	})

	it("is frozen, sorted by its stated keys, and independent of Transaction order", () => {
		for (const seed of seeds) {
			const txs = ledgerOf(seed)
			for (const edit of editsOf(seed)) {
				const report = chartConflicts(txs, edit.chart)
				expect(chartConflicts(shuffled(txs, rng(seed + 1000)), edit.chart)).toEqual(report)
				expect(Object.isFrozen(report)).toBe(true)
				expect(Object.isFrozen(report.accounts)).toBe(true)
				expect(Object.isFrozen(report.transactions)).toBe(true)
				const accountKeys = report.accounts.map((row) => `${row.accountId}\u0000${row.reason}`)
				expect(accountKeys).toEqual([...accountKeys].sort())
				const transactionKeys = report.transactions.map(
					(row) => `${row.transactionId}\u0000${row.entityId}\u0000${row.currency}`,
				)
				expect(transactionKeys).toEqual([...transactionKeys].sort())
			}
		}
	})
})
