# Plan 026: Make every failed generation pay its bill, not just drafting

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat efd2e2a..HEAD -- lib/adapt.ts lib/voice.ts lib/riffs.ts "app/(app)/riffs/actions.ts" "app/(app)/sources/actions.ts"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — this touches five model call sites and their catch blocks.
  Each one is a spending path, and the failure mode of getting it wrong is a
  *wrong number* rather than an error, which is the kind this repo is least
  able to notice.
- **Depends on**: plans/022 (its `hasSpend` guard is what stops these new paths
  from writing zero-token rows). Land 022 first. Plan 023 is independent but
  interacts — see Maintenance notes.
- **Category**: bug
- **Planned at**: commit `efd2e2a`, 2026-08-09

## Why this matters

`AGENTS.md` asks every spending path for a ceiling, and `lib/usage.ts` exists so
/credits can say what a month cost. Both assume a model call that spends leaves a
`usage_event` row.

A call that **throws** does not. Every generator in this product accumulates
usage on the line *after* the `await`, so an exception skips it and the caller's
`catch` records nothing:

```ts
const result = await generateObject({ /* … */ })
spent.add(result.usage)   // never reached on a throw
```

This was measured, not theorised. On 2026-08-08 at 22:05:20 UTC a drafting call
threw `AI_NoObjectGeneratedError` carrying `inputTokens: 3156, outputTokens: 43`,
and no `usage_event` row exists for that minute. Commit `efd2e2a` fixed it —
`usageFromError` reads the bill off the error, `GenerationFailed` carries it out
through the throw — **but wired it into `generateDraft` only.**

Four other generators have the identical shape and the identical exposure. This
plan finishes the job.

## Current state

**The primitives, already built** (`lib/structured-output.ts`):

```ts
export function usageFromError(cause: unknown): StructuredUsage | undefined
export class GenerationFailed extends Error {
  constructor(
    override readonly cause: unknown,
    readonly usage: StructuredUsage
  ) { /* … */ }
}
```

**The pattern to copy**, from `lib/drafting.ts` inside `generateDraft`:

```ts
  const { object } = await retryMalformed(
    async () => {
      let result
      try {
        result = await generateObject({ /* … */ })
      } catch (cause) {
        spent.add(usageFromError(cause) ?? {})
        throw new GenerationFailed(cause, spent.total)
      }

      spent.add(result.usage)
      /* … */
    },
    /* … */
  )
```

and the matching call-site half, from `app/(app)/riffs/actions.ts`:

```ts
  } catch (cause) {
    console.error("[drafting] generation failed:", cause)
    if (cause instanceof GenerationFailed) await meter(cause.usage)
  }
```

**The five generators still exposed**, with their line numbers at `efd2e2a`:

| Generator | File | Accumulator at | Caller that catches |
|---|---|---|---|
| `generateAngles` | `lib/adapt.ts:456` | `:470` | `createRiffFromPost` in `lib/riffs.ts` (the `catch` that returns `reason: "model-failed"`) |
| `generateAnglesFromSaid` | `lib/adapt.ts:585` | `:595` | `completeVoiceRiff` in `lib/riffs.ts` |
| `generateChannelAngle` | `lib/adapt.ts:679` | `:680` | `askForChannelAngle` in `app/(app)/riffs/actions.ts` |
| `modelExtractor` (voice) | `lib/voice.ts:130` | `:131` | `compileVoice`'s caller in `app/(app)/sources/actions.ts` |
| `generateAdaptation` | `lib/adapt.ts:295` | — **no accumulator**, single call, destructures `usage` inline | check its caller before changing it |

`lib/heartbeat.ts:123` has the same shape. It is **out of scope** — see below.

Here is `lib/riffs.ts`'s existing catch, which shows the house pattern for
"metered before the result is judged" and is where one half of this change lands:

```ts
  } catch (cause) {
    /* …doc comment… */
    console.error("[riffs] angle generation failed:", cause)
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not find an angle in that. Try again in a moment.",
    }
  }

  // Metered here rather than inside lib/adapt.ts: this is the layer that knows
  // the userId, matching every other model call site. The call already ran, so
  // a bookkeeping failure logs and is dropped rather than undoing work.
  if (generation.usage) {
    try {
      await recordUsage({ /* … */ })
```

**Conventions to match.**

- Metering lives at the **call site that knows the `userId`**, never inside
  `lib/adapt.ts` or `lib/voice.ts`. Every existing comment says so; keep it that
  way. The generator's job is to carry the number out, not to bill.
- A bookkeeping failure logs and is dropped — it must never undo work that
  already happened. Every existing meter is wrapped in its own `try`/`catch`
  with a `console.error`. Match it.
- Long *why*-first doc comments naming the incident. Read `lib/drafting.ts`'s
  `generateDraft` comment as the model.

## Commands you will need

| Purpose   | Command                                          | Expected on success |
|-----------|--------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                 | exit 0 |
| Tests     | `pnpm test`                                      | 40 files, 701 tests passing (705 if 022 landed) |
| Lint      | `pnpm exec eslint <files you changed>`           | no output |
| Format    | `pnpm exec prettier --write <files you changed>` | lists the files |
| Build     | `pnpm build`                                     | exit 0 (once, at the end) |

## Scope

**In scope**:
- `lib/adapt.ts`
- `lib/voice.ts`
- `lib/riffs.ts` — only the two `catch` blocks that currently swallow a
  generation failure
- `app/(app)/riffs/actions.ts` — only `askForChannelAngle`'s catch
- `app/(app)/sources/actions.ts` — only the catch around `compileVoice`

**Out of scope** (do NOT touch, even though they look related):
- `lib/heartbeat.ts`. Commit `ef620a7` gave it its own deliberate design: an
  extraction failure **throws** so the watermark is not advanced, and it already
  meters before throwing. Re-shaping it to this pattern would put the watermark
  decision at risk for a bookkeeping gain it already has. Leave it alone.
- `lib/structured-output.ts` — the primitives are built. If you find yourself
  needing to change them, STOP; that is a sign the pattern does not fit one of
  these call sites and the difference is worth reporting.
- `lib/drafting.ts` and `draftAngle` — already done in `efd2e2a`.
- Any change to what the *user* sees on a failure. The messages
  ("Quincy could not find an angle in that.") stay exactly as they are; this
  plan is entirely about the bill.
- `generateAdaptation` (`lib/adapt.ts:295`) **unless** its caller has a `catch`
  around it and a `userId` in hand. Check first; if it does not, leave it and
  say so in your report. Do not invent a metering path for it.

## Git workflow

- Branch: `advisor/026-every-failed-generation-pays`
- Commit per generator, or one commit — either is fine; keep the working tree
  typechecking between commits.
- Message style is a sentence, not a conventional-commit prefix.
- Do NOT push or open a PR.

## Steps

### Step 1: Wrap the model call in each generator

For each of the four accumulator-carrying generators in the table above, apply
the `generateDraft` pattern verbatim: `let result`, `try` around
`generateObject`, `catch` that does `spent.add(usageFromError(cause) ?? {})` and
throws `new GenerationFailed(cause, spent.total)`.

Add the imports to each file's existing `./structured-output` import — do not
add a second import statement.

Write one doc comment per file (not per generator) explaining the change, at the
top of the first generator you touch: what a throw used to cost, the 2026-08-08
measurement, and that the generator carries the number while the call site does
the billing.

**Verify**: `pnpm typecheck` → exit 0, and
`grep -c "GenerationFailed" lib/adapt.ts` → 4 (one import, three throws);
`grep -c "GenerationFailed" lib/voice.ts` → 2.

### Step 2: Meter in each catch

For each caller in the table, add the metering to its existing `catch`, using
the `hasSpend` guard from plan 022 so a call that never reached the model does
not write a zero row:

```ts
  } catch (cause) {
    console.error("[…] generation failed:", cause)

    if (cause instanceof GenerationFailed && hasSpend(cause.usage)) {
      try {
        await recordUsage({
          userId,                      // whatever this scope calls it
          model: ADAPT_MODEL,          // or MODEL / the file's exported constant
          inputTokens: cause.usage.inputTokens,
          cachedInputTokens: cause.usage.cachedInputTokens,
          outputTokens: cause.usage.outputTokens,
        })
      } catch (billing) {
        console.error("[…] could not record usage:", billing)
      }
    }

    return { /* the existing return, unchanged */ }
  }
```

Three things must stay true in every one of them:

1. **The user-facing return is unchanged.** Same shape, same message, same
   `reason`.
2. **The billing `try`/`catch` is nested.** A failed insert must not turn a
   handled generation failure into an unhandled throw.
3. **The model string is the one that call site already uses** for its success
   path — `ADAPT_MODEL` for the adapt generators, `MODEL`/whatever `compileVoice`
   passes for voice. A mismatched model string prices the row wrong, which is a
   silently-wrong number rather than an error.

If plan 022 has **not** landed, write the guard inline as
`(cause.usage.inputTokens > 0 || cause.usage.cachedInputTokens > 0 || cause.usage.outputTokens > 0)`
and note in your report that it should be replaced by `hasSpend` when 022 lands.

**Verify**: `pnpm typecheck` → exit 0, and `grep -rn "instanceof GenerationFailed" lib app`
→ 5 matches (drafting's existing one plus your four).

### Step 3: Confirm no behaviour changed for the user

Read each catch you edited and confirm the returned value is byte-identical to
what it was. Then:

**Verify**:
- `git diff efd2e2a..HEAD -- lib/riffs.ts | grep '^[-+].*message:'` → no lines,
  i.e. you changed no user-facing copy
- `pnpm test` → all pass, unchanged count
- `pnpm build` → exit 0

### Step 4: Format and lint

**Verify**:
- `pnpm exec prettier --write <every file you changed>` → exit 0
- `pnpm exec eslint <every file you changed>` → no output
- `pnpm typecheck` → exit 0

## Test plan

No new unit tests. The primitives (`usageFromError`, `GenerationFailed`,
`hasSpend`) are covered in `lib/structured-output.test.ts` by `efd2e2a` and plan
022; what this plan adds is wiring, and this repo does not have a way to
unit-test a `generateObject` call site without a model.

What you **must** do instead:

- State in your report, per call site, which `model` string you used and which
  variable holds the `userId`. Those two are the values a wrong wiring gets
  wrong, and both are readable from the diff.
- Confirm `grep -c "recordUsage" lib/riffs.ts` grew by exactly the number of
  catches you edited in that file.

If plan 025 has landed, its `scripts/verify-draft-receipt.ts` is the nearest
model for a future script covering these paths; note that as a follow-up rather
than writing it here.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, test count unchanged from before your change
- [ ] `pnpm build` exits 0
- [ ] `pnpm exec eslint` on every changed file produces no output
- [ ] `grep -rn "instanceof GenerationFailed" lib app | wc -l` returns 5
- [ ] `grep -c "GenerationFailed" lib/heartbeat.ts` returns 0 (it stayed out of scope)
- [ ] No user-facing message string changed (`git diff` shows no `message:` edits)
- [ ] `git status --short` lists only in-scope files
- [ ] `advisor-plans/README.md` status row for 026 updated

## STOP conditions

Stop and report back (do not improvise) if:

- A call site has no `userId` in scope. Metering belongs where the user is
  known; do not thread a `userId` through new function signatures to make this
  plan fit.
- A catch you are editing does something other than log-and-return — e.g. it
  rethrows, or it is the outer catch of a transaction. The posture "a
  bookkeeping failure must not undo work" needs re-deriving for that shape.
- `lib/structured-output.ts` needs a change to accommodate a call site.
- You find yourself editing `lib/heartbeat.ts`.
- Test count changes. Nothing in this plan should add or remove a test; a
  change means you altered behaviour somewhere you did not intend to.

## Maintenance notes

- **Interaction with plan 023**: 023 makes `retryMalformed` retry a
  `GenerationFailed`. Once **both** land, these four generators silently gain a
  second attempt on a no-response — which is desirable and is also a spend
  increase on four more paths. Whoever reviews the second of the two to land
  should be told that explicitly.
- **What a reviewer should scrutinise**: the `model` string and `userId` at each
  new `recordUsage`, and that every billing block is nested inside its own
  `try`. Everything else is mechanical.
- **Deferred**: `generateAdaptation` if its caller has no catch, and
  `lib/heartbeat.ts` permanently. Both reasons are in Scope.
- **The general shape worth remembering**: usage travels out of a generator as a
  return value on success and as an error property on failure. Any new
  `generateObject` call site in this repo owes both.
