# @trajectonomics/ledger

Pure double-entry ledger domain: accounts, balanced postings, balances, header rollups, net worth, P&L. No I/O.

## Agent Skills

Configured with [Matt Pocock's skills](https://github.com/mattpocock/skills) for AI engineering workflows. See [AGENTS.md](./AGENTS.md) and [`docs/agents/`](./docs/agents/).

## Commands

```bash
bun install
bun test
bun run typecheck
bun run build       # tsdown: dist/ with esm + cjs + d.ts
bun run lint        # Biome, zero warnings
bun run format      # Biome format + import order, writes files
bun run check       # lint + typecheck + test + build + lint:package
```

## Error codes

Every rejection throws `LedgerValidationError`, whose `code` is a member of the `LedgerErrorCode`
union. Read `code`: it is the contract. `message` and `reason` are prose for a human and are never
parsed. `field` is a diagnostic path, not a discriminator: report it, do not branch on it.

The set of codes only grows, because adding one is how a new rule becomes legible. A code is never
widened, re-pointed at another rule, or reused. Renaming or removing a code is a breaking change.

Because the union grows, a `switch` over `LedgerErrorCode` must carry a total `default` — do not
finish it with an `assertNever` helper:

```ts
switch (error.code) {
	case "UNKNOWN_ACCOUNT":
		return `No such account: ${error.field}`
	default:
		// A code this version does not know. Still a rejected call, with no result.
		return `Rejected (${error.code})`
}
```

A `Record<LedgerErrorCode, string>` of display messages is exhaustive by design, so it breaks when a
code is added. Where that pin is not worth it, build a `Partial<Record<LedgerErrorCode, string>>` and
fall back at the call site:

```ts
const messages: Partial<Record<LedgerErrorCode, string>> = {
	// the codes you want custom wording for
}
const text = messages[error.code] ?? `Rejected (${error.code})`
```

While the major version is 0, a caret range such as `^0.1.0` admits patch releases only, so a new
code arrives only in a minor version you choose to take. From 1.0, a new code arrives in a major
version.

## Releasing

Versions are computed, never edited by hand (`package.json` says `0.0.0-development` on purpose). The shared publish workflow (`trajectonomics/cicd`) reads the last `vX.Y.Z` git tag and the conventional commit messages since then:

| Commits since last release | Bump |
| --- | --- |
| any `feat!:` / `fix!:` / `BREAKING CHANGE:` | major (minor while on 0.x) |
| any `feat:` | minor |
| anything else | patch |

- **Alpha, automatic:** Every merge to `main` that touches code publishes `<next>-alpha.<n>` under the npm dist-tag `alpha` (`bun add @trajectonomics/ledger@alpha`). `n` counts up per upcoming version.
- **Stable, on demand:** Actions → Release → Run workflow (on `main`). It publishes `<next>` under `latest`, tags `vX.Y.Z`, and creates a GitHub release with generated notes. The bump input overrides the computed one; pick `major` to cut 1.0.0.

PR titles must be conventional commits (enforced by the `PR title` check) because squash-merge commit subjects become the basis for version calculation.
