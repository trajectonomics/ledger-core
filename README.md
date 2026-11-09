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
