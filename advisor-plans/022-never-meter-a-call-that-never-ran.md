# Plan 022: Never write a usage row for a generation that never reached the model

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat efd2e2a..HEAD -- lib/structured-output.ts lib/drafting.ts "app/(app)/riffs/actions.ts"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `efd2e2a`, 2026-08-09

## Why this matters

Commit `efd2e2a` fixed a real hole — a model call that threw used to leave no
`usage_event` row at all, so 3,156 input tokens spent on 2026-08-08 were
invisible to /credits. The fix carries the bill out through the throw. But it
carries it out **unconditionally**, including when there is no bill: an error
that never reached the model (connection reset, abort, a bad model id) has no
usage attached, so `spent.total` is `{0, 0, 0}` and the call site still inserts
a row.

`summariseUsage` counts rows (`count(*)`), so every one of those is a phantom
turn on /credits, and `recentUsage` lists it as a 0-token entry in the activity
list. The helper's own doc comment already states the intended rule — "A
response that carried no usage at all is not a zero — it is nothing to report,
and reporting it as a zero would be indistinguishable from a call that genuinely
cost nothing" — and the code one layer up does not honour it.

This is small, and it is on the page whose entire job is being an accurate
number. After this plan, a failed call is metered when it cost something and
silent when it did not.

## Current state

Three files, in the order the value travels:

- `lib/structured-output.ts` — `usageFromError` recovers the bill from an SDK
  error; `GenerationFailed` carries it out through the throw. Both are new in
  `efd2e2a`.
- `lib/drafting.ts` — `generateDraft` catches the model call's throw, folds in
  whatever usage it can recover, and rethrows `GenerationFailed`.
- `app/(app)/riffs/actions.ts` — `draftAngle` catches it and meters.

`lib/structured-output.ts` already documents the rule this plan enforces, at the
top of `usageFromError`:

```ts
// lib/structured-output.ts (inside usageFromError)
  // A response that carried no usage at all is not a zero — it is nothing to
  // report, and reporting it as a zero would be indistinguishable from a call
  // that genuinely cost nothing.
  if (typeof inputTokens !== "number" && typeof outputTokens !== "number") {
    return
  }
```

`lib/drafting.ts`, inside `generateDraft` — note `?? {}`, which turns "nothing to
report" into "add nothing", leaving the accumulator at zero:

```ts
// lib/drafting.ts (inside the retryMalformed callback)
      } catch (cause) {
        spent.add(usageFromError(cause) ?? {})
        throw new GenerationFailed(cause, spent.total)
      }
```

`app/(app)/riffs/actions.ts`, inside `draftAngle` — the unconditional meter:

```ts
// app/(app)/riffs/actions.ts (inside draftAngle's catch)
  } catch (cause) {
    console.error("[drafting] generation failed:", cause)
    /* …doc comment… */
    if (cause instanceof GenerationFailed) await meter(cause.usage)
  }
```

And `lib/usage.ts` inserts whatever it is handed, with no zero check:

```ts
// lib/usage.ts:31
  await db.insert(usageEvent).values({
    id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
    userId: input.userId,
    /* … */
  })
```

```ts
// lib/usage.ts:63 — inside summariseUsage
      turns: sql<number>`count(*)::int`,
```

**Conventions to match.** This repo writes long explanatory doc comments that
say *why*, usually naming the incident or the alternative that was rejected —
see `lib/structured-output.ts` in full for the house style. Match its density
and tone; do not add short throwaway comments. Exported helpers get a doc
comment; small local ones get a one- or two-line `/** … */`.

Tests live beside the module as `<name>.test.ts` and use `vitest` with
`describe`/`it`/`expect` — see `lib/structured-output.test.ts`, which is the
file you will extend.

## Commands you will need

| Purpose   | Command                                     | Expected on success |
|-----------|---------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                            | exit 0, no output beyond the script echo |
| Tests     | `pnpm test`                                 | 40 files, 701 tests passing before your change |
| One file  | `pnpm exec vitest run lib/structured-output.test.ts` | all pass |
| Lint      | `pnpm exec eslint <files you changed>`      | no output |
| Format    | `pnpm exec prettier --write <files you changed>` | lists the files |

## Scope

**In scope** (the only files you should modify):
- `lib/structured-output.ts`
- `app/(app)/riffs/actions.ts`
- `lib/structured-output.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `lib/usage.ts` — do **not** add a zero-guard inside `recordUsage`. A caller
  that genuinely wants to record a zero-cost event (a cached-only turn, a future
  provider that bills per request) must still be able to, and burying the rule
  in the writer hides it from the two call sites that actually make the
  judgment. The decision belongs where the failure is interpreted.
- `lib/drafting.ts` — the `?? {}` there is correct as written; the accumulator
  must still fold in earlier attempts' real spend.
- `lib/adapt.ts`, `lib/voice.ts` — they have the same unmetered-throw exposure
  and it is deliberately a separate plan (026). Do not spread this fix there.

## Git workflow

- Branch: `advisor/022-never-meter-a-call-that-never-ran`
- One commit. Message style is a sentence, not a conventional-commit prefix —
  see `git log --oneline -5` (e.g. "A string where an array belongs took /riffs
  down"). Body explains the *why*.
- Do NOT push or open a PR.

## Steps

### Step 1: Add the predicate to `lib/structured-output.ts`

Export a function that answers whether a `StructuredUsage` represents anything
worth recording. Place it directly **after** `usageFromError` and **before** the
`GenerationFailed` class, so the three pieces of the failed-call story sit
together.

Target shape:

```ts
/**
 * Whether this usage is worth a `usage_event` row.
 *
 * <Explain: usageFromError returns undefined when an error carried no usage,
 * and the accumulator's zero start means "nothing has been spent yet" — both
 * arrive at the call site as {0,0,0}, which is indistinguishable from a call
 * that genuinely cost nothing. summariseUsage counts rows, so recording one
 * adds a phantom turn to /credits. Note that a zero row is not merely useless:
 * it is wrong in the direction nobody checks.>
 */
export function hasSpend(usage: StructuredUsage): boolean {
  return (
    usage.inputTokens > 0 ||
    usage.cachedInputTokens > 0 ||
    usage.outputTokens > 0
  )
}
```

Write the doc comment yourself in the repo's voice, covering the points in the
angle brackets. Do not paste the angle-bracket text.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Guard the meter in `draftAngle`

In `app/(app)/riffs/actions.ts`, import `hasSpend` alongside `GenerationFailed`
from `@/lib/structured-output`, and change the catch so the meter only fires on
a real bill:

```ts
    if (cause instanceof GenerationFailed && hasSpend(cause.usage)) {
      await meter(cause.usage)
    }
```

Extend the existing doc comment above that line by one sentence explaining the
new condition: a throw that never reached the model owes nothing, and a
zero-token row would be counted as a turn on /credits.

Leave the success-path call — `if (generation.usage) await meter(generation.usage)` —
exactly as it is. A *successful* generation that reports zero usage is a
different and much less likely case, and changing it is out of scope.

**Verify**: `pnpm typecheck` → exit 0, and
`grep -n "hasSpend" "app/(app)/riffs/actions.ts"` → 2 matches (the import and
the guard).

### Step 3: Test the predicate

Add a `describe("hasSpend", …)` block to `lib/structured-output.test.ts`, placed
immediately after the existing `describe("usageFromError", …)` block. Cover:

1. all three counters zero → `false` (this is the regression: the connection
   that never reached the model)
2. input tokens only → `true`
3. output tokens only → `true`
4. cached input tokens only → `true` — a cache-read-only call was still billed,
   and treating it as free would under-report in the same direction the
   accumulator was written to prevent

Match the file's existing style: each `it` is one behaviour, and comments
explain why the case matters rather than restating the assertion.

**Verify**: `pnpm exec vitest run lib/structured-output.test.ts` → all pass,
including 4 new assertions.

### Step 4: Format, lint, full suite

**Verify**:
- `pnpm exec prettier --write lib/structured-output.ts "app/(app)/riffs/actions.ts" lib/structured-output.test.ts` → exit 0
- `pnpm exec eslint lib/structured-output.ts "app/(app)/riffs/actions.ts" lib/structured-output.test.ts` → no output
- `pnpm typecheck` → exit 0
- `pnpm test` → 40 files pass, 705 tests (701 + 4 new)

## Test plan

- New tests in `lib/structured-output.test.ts`, in a `describe("hasSpend")`
  block: the four cases in Step 3.
- Structural pattern: the `describe("usageFromError")` block already in that
  file — same shape, same comment density.
- No test is added for `draftAngle` itself. It reaches the database and a
  model, and this repo tests those through `scripts/verify-*.ts` rather than
  vitest. Covering `draftAngle` is plan 025's job, not this one.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with 705 tests passing
- [ ] `pnpm exec eslint` on the three in-scope files produces no output
- [ ] `grep -n "hasSpend" lib/structured-output.ts` returns the export
- [ ] `grep -c "await meter(cause.usage)" "app/(app)/riffs/actions.ts"` returns 1,
      and the line above it tests `hasSpend`
- [ ] `git status --short` lists only the three in-scope files
- [ ] `advisor-plans/README.md` status row for 022 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code — in particular if
  `GenerationFailed` or `usageFromError` are gone from
  `lib/structured-output.ts`, or `draftAngle`'s catch no longer calls `meter`.
- `pnpm test` does not report 701 passing tests *before* your change. The
  baseline has moved and the count in the done criteria is wrong; report the
  real number rather than adjusting the plan.
- You find yourself wanting to change `lib/usage.ts` to make a test pass. That
  is out of scope and the reason is in the Scope section.
- The assumption "`summariseUsage` counts rows with `count(*)`" turns out to be
  false — the impact argument for this plan rests on it.

## Maintenance notes

- **What will interact with this**: plan 026 spreads the same failed-call
  metering to `lib/adapt.ts` and `lib/voice.ts`. Those call sites must use
  `hasSpend` too — that is why it is exported rather than local to `draftAngle`.
- **What a reviewer should scrutinise**: that the success path was left alone.
  It is tempting to wrap both meters in the same guard; a successful generation
  reporting zero usage is a provider bug worth seeing in the data, not a
  phantom turn worth suppressing.
- **Deferred**: nothing. This plan is deliberately one predicate and one
  condition.
