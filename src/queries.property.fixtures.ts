import type { PostingInput, Transaction } from "./index"
import { tx } from "./queries.fixtures"

/** Deterministic mulberry32 PRNG so failures are reproducible. */
export const rng =
	(seed: number): (() => number) =>
	() => {
		seed = (seed + 0x6d2b79f5) | 0
		let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296
	}

/** Accounts that can balance each other: same Entity and Currency. */
export const groups: readonly { readonly currency: string; readonly ids: readonly string[] }[] = [
	{ currency: "THB", ids: ["cash", "savings", "loan", "equity", "salary", "food", "interest"] },
	{ currency: "USD", ids: ["usd-wallet", "equity-usd"] },
	{ currency: "THB", ids: ["other-cash", "other-equity"] },
]

export const pick = <T>(items: readonly T[], next: () => number): T =>
	items[Math.floor(next() * items.length)]!

export const postingsOf = (next: () => number): PostingInput[] => {
	const group = pick(groups, next)
	const legs = Array.from({ length: 1 + Math.floor(next() * 3) }, () => ({
		accountId: pick(group.ids, next),
		amount: (1 + Math.floor(next() * 1_000_000)) * (next() < 0.5 ? -1 : 1),
		currency: group.currency,
		...(next() < 0.5 ? { dimensions: { team: pick(["a", "b", "c"], next) } } : {}),
	}))
	const sum = legs.reduce((acc, l) => acc + l.amount, 0)
	const closing = sum === 0 ? [1, -1] : [-sum]
	return [
		...legs,
		...closing.map((amount) => ({
			accountId: pick(group.ids, next),
			amount,
			currency: group.currency,
		})),
	]
}

/** A seeded ledger dated inside January–March 2024. */
export const ledgerOf = (seed: number): Transaction[] => {
	const next = rng(seed)
	return Array.from({ length: 1 + Math.floor(next() * 12) }, (_, i) =>
		tx(
			`t${i}`,
			`2024-0${1 + Math.floor(next() * 3)}-${10 + Math.floor(next() * 18)}`,
			postingsOf(next),
		),
	)
}

export const shuffled = <T>(items: readonly T[], next: () => number): T[] =>
	items
		.map((item) => ({ item, key: next() }))
		.sort((a, b) => a.key - b.key)
		.map(({ item }) => item)

export const pairKey = (r: { entityId: string; currency: string }): string =>
	`${r.entityId}/${r.currency}`

export const rowKey = (r: { entityId: string; accountId: string; currency: string }): string =>
	`${r.entityId}/${r.accountId}/${r.currency}`

export const byPair = (
	rows: readonly { entityId: string; currency: string; amount: number }[],
): Map<string, number> => new Map(rows.map((r) => [pairKey(r), r.amount]))

/** Sum amounts per `(Entity, Currency)`, keeping pairs that net to zero. */
export const sumByPair = (
	rows: readonly { entityId: string; currency: string; amount: number }[],
): Map<string, number> => {
	const sums = new Map<string, number>()
	for (const r of rows) sums.set(pairKey(r), (sums.get(pairKey(r)) ?? 0) + r.amount)
	return sums
}

export const seeds: readonly number[] = Array.from({ length: 200 }, (_, i) => i + 1)
