# AGENTS.md

Instructions for AI coding agents in `trajectonomics/ledger-core` (`@trajectonomics/ledger` on npm).

## Rules

1. Never commit to `main`. Branch (`feat/*`, `fix/*`, `docs/*`) and open a PR.
2. Never commit secrets or `.env` files. `NPM_TOKEN` lives in repo secrets only.
3. Pure package: no network, DOM, framework imports, database (no SQLite), CLI, sync metadata, or agent concerns. It is pure and deterministic: data in, data out, no I/O, no clock, no randomness, no ID generation (callers supply IDs). It is closed-world: no callbacks or plugin hooks. If real life does not fit, the fix is a new core primitive, never an extension point. `tsconfig.json` compiles `src` with no DOM, Node, or Bun types, so `fetch`/`process`/`document` fail typecheck; do not add `types` or `lib` entries to get around it.
4. Bun only: `bun install`, `bun test`, `bun run <script>`. Do not add npm/pnpm/yarn lockfiles.
5. Done means `bun run check` passes (Biome lint with zero warnings, strict typecheck, tests, build, publint + are-the-types-wrong). `bun run format` fixes formatting and import order. Do not loosen `tsconfig.base.json` or `biome.json` to make an error go away.
6. Never edit `version` in `package.json` and never run `npm publish` locally. Merges to `main` publish alphas; a stable release is the manual Release workflow. PR titles are conventional commits (`feat:`, `fix:`, `feat!:` ...) because they decide the next version (see README "Releasing"). A PR that adds or narrows a `LedgerErrorCode` is `feat!:` and nothing else (ADR-0005).
7. Postponed work is tracked by the issue tracker, not by prose: file an issue, then leave `TODO(#<issue>)` at the code site it belongs to. Every unactioned `TODO` carries an issue number.
8. Pi (`pi.dev`) model restriction: When running the Pi coding agent (`pi.dev`), strictly use **DeepSeek 4.1 Flash** only (e.g., `deepseek/deepseek-v4.1-flash`, `deepseek/deepseek-v4.1-flash-fast`), whether routed via Command Code GOAT (`command-code`) or OpenCode Go (`opencode`). Do not switch to or run any other models (Claude, GPT, Gemini, etc.) in Pi sessions for this repository. This rule is mechanically enforced via `.pi/settings.json`.
9. Never use `gemini-3.8-flash` anywhere; use `gemini-4-hydrogen` instead for Antigravity tasks and reviews (and `gemini-4-argon` where configured).
10. Temporary files and scratch clones: `/tmp` is a shared, nearly full tmpfs. Never use fixed `/tmp` filenames (use `mktemp`, or `--body-file -` for `gh` bodies), and never install `node_modules` or clone scratch repositories under `/tmp`; use `~/.cache/<slug>`.

## Organisation goals

The organisation's goals are in https://github.com/trajectonomics/goals, `GOALS.md`. Read them before proposing a new direction. Only the owner edits that file; never edit it.

## Owner

Saving the owner's attention is part of the job, so finish a task instead of asking about it.

- Finish end-to-end: commit, push, open the PR, get an independent review, `gh pr merge` when the work is green or the owner said to proceed, then do the follow-up steps the change implies. Do not stop for small permission questions, and do not end with a `## Not done yet` list.
- When unsure, consult subagents on other models (`claude-sonnet-5-5`, `gemini-4-hydrogen`, `gemini-4-argon`, `deepseek-v4.1-flash`) instead of asking the owner. The model rules above still decide which one a session may itself run.
- Verify before calling something blocked: read live GitHub state (`gh issue view`, `gh pr view`) and the real CLI/API schema first.
- Keep replies short and lead with what only the owner must do; add detail when asked.
- Record every durable lesson here or in `docs/`, never only in agent memory.
- Settle your own T3 thread (`t3_thread_organize`, `action: "settle"`) when the work is done and nothing waits on the owner.

## Agent skills

### Reviewing a diff

`CODING_STANDARDS.md`: the conventions `bun run check` cannot enforce. Read it when reviewing, not when implementing.

### Issue tracker

GitHub Issues in `trajectonomics/ledger-core`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default five-role vocabulary (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

### Installing and updating skills

Skills come from [`mattpocock/skills`](https://github.com/mattpocock/skills) and [`trajectonomics/internal-skills`](https://github.com/trajectonomics/internal-skills) via the Vercel [`skills`](https://github.com/vercel-labs/skills) CLI and are pinned in `skills-lock.json`. The canonical copy is `.agents/skills/` (read natively by Codex, OpenCode, Pi, and Antigravity CLI); `.claude/skills/` holds symlinks into it for Claude Code. Never edit them by hand.

- Update: `npx skills update -p -y`
- Reinstall: `npx skills add mattpocock/skills --skill '*' -a claude-code codex opencode antigravity-cli pi -y`
- Restore from the lock: `npx skills experimental_install`

## Factory Runs

A Factory Run or Spec drafter (a thread titled `traj/trajectonomics/<repo>#<n>` or `triage/trajectonomics/<repo>#<n>`) takes its instructions from the Dispatcher runbook in `trajectonomics/factory`, never from this repository, where `docs/dispatcher-runbook.md` does not exist. Read it with `gh api repos/trajectonomics/factory/contents/docs/dispatcher-runbook.md -H "Accept: application/vnd.github.raw"`. If you cannot read it, stop and say so; do not build from the issue alone.
