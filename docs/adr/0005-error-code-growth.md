# 0005. Error codes only grow

Status: accepted (issue #12)

## Context

`LedgerErrorCode` is a closed union of string literals, and ADR-0001 gives every rule that can reject a call exactly one member of it. The set has grown twice — ADR-0002 added four codes, ADR-0003 added two — and one code per rule makes "a new rule" mean "a new code" for as long as the package lives. Growth is a standing property, not a one-off.

Nothing said so. `v0.1.0`, the only stable release, already carries all 17 codes, and the union's JSDoc carried a `TODO(#12)` that reached consumers inside the published `.d.ts`. A consumer writes the exhaustive `switch`, or the `Record<LedgerErrorCode, string>` of display messages, that the type system invites, and learns about the growth from a compile error after an upgrade.

The maintainer's side had no mechanism either. The PR title check enforces that a title is well formed, never that it is true. The shared release workflow computes a window's bump as the maximum over every commit since the last tag, so a code added under a patch-typed commit is silently masked the moment any other `feat:` shares the window. Nothing connects "add one line to a union" to "this release is breaking".

This record is the answer to #12. It applies from the next code that is added, not from 1.0.

## Decisions

- **A code is only ever added.** An existing code is never widened, re-pointed at another rule, or reused, because each of those changes what a branch written last year means, silently, with no compile error. A rule may be **split** so that an existing code's domain narrows, because that is a correctness fix: the old code keeps meaning a subset of the calls it named, and the new code names the rest in the same `feat!:` PR that adds it.
- **Renaming or removing a code requires a major release**, where the break is loud. The promise is deliberately asymmetric: widening, re-pointing and reuse fail silently, so they are forbidden forever; a rename or a removal fails at compile time, so a 2.0 cleanup stays possible. The cost of that choice is named below.
- **A release that ships a code is never a patch release.** Under the current version that is a minor; from 1.0 it is a major. A PR that adds or narrows a code is `feat!:` and nothing else. That single rule carries the invariant.
- **The invariant is per release, the enforcement is per PR, and both are needed.** A release's bump is the maximum over every commit since the last tag, so one patch-typed commit hides a code addition whenever any other `feat:` shares the window. `feat!:` is what makes the addition surviving to the top of that maximum; the forbidden failure mode is a code that slips out under a patch-typed commit.
- **`feat!:` is the convention today, not from 1.0.** On 0.x it computes the same minor as `feat:` and buys honesty in the squash-merge subject; from 1.0 it is the only thing that makes the bump breaking. No convention changes at the boundary.
- **A body line starting `BREAKING CHANGE:` is read as breaking from any commit in the window.** The shared workflow reads that footer, so a commit that merely quotes the convention forces a major for the whole window. At 0.x that is harmless, since major maps to minor; from 1.0 it is real. Write it only when it is meant.
- **Every code, present and future, describes a call that threw and returned nothing.** No exported function returns a code as an ordinary value. A constant list of codes is not a violation, because it reports nothing about a call. This is what makes one `default` branch a correct, total fallback: an unrecognised code still means a rejected call with no result. It binds future codes, including `AMOUNT_OVERFLOW`, whose `field` is an output path (ADR-0003).
- **`code` is the contract; `message` and `reason` are not.** Consumers branch on `code`, and improved wording is not a breaking change. `field` is a diagnostic path, not a discriminator.
- **Option B, a runtime `LEDGER_ERROR_CODES` list, is deferred and purely additive.** It would give consumers a non-exhaustive route and a fallback map, but it does not stop an exhaustive `switch` breaking, and wire validation belongs to the consumer (ADR-0001). Shipping it later breaks nobody, so nothing is foreclosed by waiting. It is one input to the 1.0 decision, tracked by #33.
- **Option D, freezing the set, is rejected.** It contradicts one code per rule (ADR-0001), which is what makes a rejection legible.
- **The 0.x caret consequence is part of the promise.** A caret range such as `^0.1.0` admits patch releases only while the major version is 0, so a new code arrives only in a minor that the consumer deliberately takes.
- **The 1.0 question is deferred, not answered, and its deadline is unenforced.** Whether additions stay major after 1.0, and whether B ships, are tracked by #33. That issue replaces #12's "only if a consumer asks" trigger: the question is settled there before 1.0, consumer or not. Nothing enforces the deadline, because cutting 1.0 is a manual dispatch of the Release workflow; #33 is the only prompt.

## Superseded

ADR-0003's last decision bullet ends: "This can break consumers with exhaustive `switch` statements over `LedgerErrorCode`; that is accepted and tracked by `TODO(#12)`." The `TODO(#12)` half is superseded here: the union's JSDoc carries the promise instead of a maintainer note, and the policy is this record. ADR-0003 is otherwise left unedited, so the history stays intact and the trail still leads here.

## Considered Options

- **Version additions as breaking only through the PR title, with no ADR (option A alone).** Rejected as insufficient: a release note is read after the upgrade, not before the `switch` is written, and the title check cannot make a title true. A and C together are adopted, but the record is what the title and the README point at.
- **Option B now.** Rejected for the moment on the grounds above: it does not stop the exhaustive `switch` breaking and its one use is already documented with `Partial<Record<...>>`.
- **Documentation alone (option C).** Rejected as insufficient for the maintainer's half, where nothing in review or the build notices a mis-versioned addition.
- **Freezing the set (option D).** Rejected on ADR-0001 grounds.
- **A `deprecated` marker or a code-to-code mapping.** Out of scope: no code has been renamed, and the first rename is a major that may choose its own mechanism.

## Consequences

- A consumer who writes a total `default` is correct forever; one who pins a `Record` learns at compile time, in the release they chose to take.
- The first real application of this policy is the next code added. `v0.1.0` already carries all 17 codes and no commit in this repository has ever used a `!` marker, so nothing needs retrofitting.
- **Dropping a retired code conflicts with the per-code test rule.** `scripts/error-codes.test.ts` requires every declared code to be asserted with `error.code` by some test, so a code declared but never thrown fails the build. The test rule and this ADR's "removal requires a major" are not in conflict at the release boundary, but they are in conflict at the removal PR: it must retire the code and the assertion together. That PR owns the resolution; this record names the conflict rather than inventing an answer for it.
- `scripts/error-codes.test.ts` pins the declared codes in a record typed `satisfies Record<LedgerErrorCode, true>`, so an addition or a removal fails `bun run typecheck` next to a comment that states this rule. The pin cannot enforce a PR title, and does not claim to: it forces the author into the file that states the rule.
- Refs: #4 (the first growth), #11 (the second), #12 (this decision), #33 (the 1.0 question).
