# Coding Standards

Read at **review** time. `bun run check` already enforces the mechanical rules (formatting, strict
types, tests, build, package shape). This file covers what it cannot: the conventions a reviewer
must check by reading the diff.

Decisions behind the API live in `docs/adr/`; vocabulary lives in `GLOSSARY.md`.

## Public API

- A new exported function or type carries a one-line JSDoc saying what it **is**, not how it works.
- Values returned by a smart constructor are frozen. A caller-supplied object is never mutated.
- A rule that can reject input gets its own `LedgerErrorCode`. One code per rule, no exceptions:
  never widen an existing code's meaning, and never let two rules share one.
- Adding or narrowing a `LedgerErrorCode` is breaking for a consumer's exhaustive `switch`: that PR's
  title is `feat!:` and nothing else, its body names the code, and no body line starts with
  `BREAKING CHANGE:` unless it is meant (ADR-0005).
- A thrown error's `field` mirrors the caller's input path (`postings[2].accountId`), never an
  internal variable name.

## Purity

- No clock, randomness, `Date`, `fetch`, `process`, `Math.random`, or id generation. Ids and dates
  arrive as arguments. `Math` arithmetic is fine; anything non-deterministic is not.
- Closed world: no callbacks, hooks, plugin objects, or options that accept a function.
- A real-world case that does not fit is a new core primitive, never an extension point.

## Signs and naming

- Debit is positive, credit negative, always. A sign never depends on an Account Type.
- Use `GLOSSARY.md` vocabulary exactly. `debit`/`credit`, never `from`/`to`. `Reversal`, never
  `void`. `Compound Entry`, never `split`. A synonym in a diff is a defect: it outlives the ticket.
- A builder takes magnitudes where it derives the sign itself, and a signed amount where direction
  is the caller's statement. Never infer what the caller could say.

## Tests

- One test per error code, asserting `error.code` rather than merely that something threw.
- A test name states the rule ("rejects a reversal dated before its original"), not the function
  under test.
- Properties that must hold for all inputs (balanced totals, exact negation, sign symmetry) use the
  seeded PRNG already in the property tests, so every failure reproduces from its seed.
- Builders are tested through their builders, not by re-implementing their postings in the test.

## Postponed work

- A deferral leaves two things behind: an open issue, and `TODO(#<issue>)` at the site it belongs
  to. Prose like "we should revisit this" with no issue number is a finding: it is a promise no one
  will keep.
- When the issue closes, the `TODO` goes with it.

## Files

- One concern per file. The 100-line limit (200 for tests) is a ceiling, not a target: split by
  concern as soon as a file carries two.
- New behaviour goes beside the primitive it belongs to; `index.ts` stays a pure re-export list with
  no logic.
