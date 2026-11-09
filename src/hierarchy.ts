import type { Account } from "./account"
import { LedgerValidationError } from "./errors"
import type { AccountId } from "./ids"

const reject = (index: number, field: string, value: unknown, reason: string): never => {
	throw new LedgerValidationError(
		"INVALID_ACCOUNT_HIERARCHY",
		`accounts[${index}].${field}`,
		value,
		reason,
	)
}

const checkParent = (account: Account, parent: Account | undefined, i: number): void => {
	if (account.parentId === undefined) return
	if (!parent) reject(i, "parentId", account.parentId, "parent account does not exist")
	else if (parent.entityId !== account.entityId)
		reject(i, "parentId", parent.id, "parent belongs to another entity")
	else if (parent.type !== account.type)
		reject(i, "parentId", parent.id, "parent has a different account type")
}

const checkAcyclic = (
	account: Account,
	accounts: ReadonlyMap<AccountId, Account>,
	i: number,
): void => {
	const seen = new Set<AccountId>([account.id])
	for (let up = account.parentId; up !== undefined; up = accounts.get(up)?.parentId) {
		if (seen.has(up)) reject(i, "parentId", account.parentId, "hierarchy contains a cycle")
		seen.add(up)
	}
}

/** Reject missing, cross-entity and cross-type parents, and cycles. */
export const checkHierarchy = (accounts: ReadonlyMap<AccountId, Account>): void => {
	for (const [i, account] of [...accounts.values()].entries()) {
		checkParent(
			account,
			account.parentId === undefined ? undefined : accounts.get(account.parentId),
			i,
		)
		checkAcyclic(account, accounts, i)
	}
}

/** The Header ancestors of `id`, nearest first. Internal: the package entry does not export it. */
export const headerChainOf = (
	accounts: ReadonlyMap<AccountId, Account>,
	id: AccountId,
): readonly Account[] => {
	const chain: Account[] = []
	let parent = accounts.get(id)?.parentId
	while (parent !== undefined) {
		const account = accounts.get(parent)
		if (account === undefined) break
		chain.push(account)
		parent = account.parentId
	}
	return chain
}
