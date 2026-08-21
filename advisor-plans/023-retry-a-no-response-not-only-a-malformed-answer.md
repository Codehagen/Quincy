# Plan 023: Retry a no-response, not only a malformed answer

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat efd2e2a..HEAD -- lib/structured-output.ts lib/structured-output.test.ts lib/drafting.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — this plan makes a spending path spend more. The ceiling is
  unchanged (still 2 attempts) but the *rate* at which the second attempt is
  bought goes up. Read the "Money" section of `AGENTS.md` before starting.
- **Depends on**: none (independent of 022, but if both land, 022 first — its
  `hasSpend` guard keeps this plan's extra failure paths off /credits)
- **Category**: bug
- **Planned at**: commit `efd2e2a`, 2026-08-09

## Why this matters

`retryMalformed` exists because `generateObject` through the AI Gateway
sometimes returns a well-formed HTTP response containing a mangled object. Its
doc comment claims "Two attempts turns a measured ~10-15% malformed rate into
~1-2%".

That claim only covers the failures that **return**. On 2026-08-08 at 22:05:20
UTC the drafting call failed a different way — `AI_NoObjectGeneratedError: the
model did not return a response`, a throw — and `retryMalformed` gave it **one
attempt, not two**, because `await call(attempt)` is unguarded and an SDK throw
exits the loop on the spot. The user pressed "Draft this" and got their own hook
back as the post body.

That is the most retry-worthy failure there is: nothing came back, so there is
nothing to salvage and no reason to think the second attempt inherits the first
one's problem. The defence built for flaky structured output does not currently
apply to the flakiest case.

After this plan, a model call that comes back empty gets the same second chance a
model call that comes back mangled already gets, with the same ceiling and the
same accumulated bill.

## Current state

Two files.

`lib/structured-output.ts` — the retry loop. `call` is awaited with no `try`, so
any throw propagates immediately:

```ts
// lib/structured-output.ts (inside retryMalformed)
  let last: T | undefined

  for (let attempt = 0; attempt < attempts; attempt++) {
    last = await call(attempt)
    if (usable(last)) return last

    console.error(
      `[${label}] malformed result on attempt ${attempt + 1} of ${attempts}`
    )
  }
```

Same file — the error class that marks a throw as *the model's*, added in
`efd2e2a`:

```ts
// lib/structured-output.ts
export class GenerationFailed extends Error {
  constructor(
    override readonly cause: unknown,
    readonly usage: StructuredUsage
  ) {
    super(cause instanceof Error ? cause.message : String(cause))
    this.name = "GenerationFailed"
  }
}
```

`lib/drafting.ts` — the only current producer of `GenerationFailed`. Note that
`spent` is a single accumulator shared across attempts, so a retry after a throw
keeps the earlier bill:

```ts
// lib/drafting.ts (inside generateDraft)
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

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, ["versions"]),
      }
    },
    ({ object }) => Array.isArray(object.versions),
    { label: "drafting/versions" }
  )
```

**The boundary that makes this safe.** `GenerationFailed` is thrown by exactly
one thing: the `catch` wrapped around a model call. Anything else that throws
inside the callback — a bug in `unwrapStringifiedObject`, a DB error, a
programming mistake — is *not* a `GenerationFailed` and must keep propagating on
the first attempt. Retrying our own bugs buys a second copy of the same bug at
model prices. The `instanceof` check is the whole safety argument for this plan;
do not widen it to `catch (cause)`.

**Conventions to match.** Long *why*-first doc comments — read
`lib/structured-output.ts` end to end before writing; it is the house style at
its clearest. Tests are vitest, beside the module, in
`lib/structured-output.test.ts`.

## Commands you will need

| Purpose   | Command                                             | Expected on success |
|-----------|-----------------------------------------------------|---------------------|
| Typecheck | `pnpm typecheck`                                    | exit 0 |
| Tests     | `pnpm test`                                         | 40 files, 701 tests passing before your change |
| One file  | `pnpm exec vitest run lib/structured-output.test.ts`| all pass |
| Lint      | `pnpm exec eslint <files you changed>`              | no output |
| Format    | `pnpm exec prettier --write <files you changed>`    | lists the files |

## Scope

**In scope** (the only files you should modify):
- `lib/structured-output.ts`
- `lib/structured-output.test.ts`

**Out of scope** (do NOT touch, even though they look related):
- `lib/drafting.ts` — it already throws `GenerationFailed` and already shares
  one accumulator across attempts. It needs no change, and the fact that it
  needs no change is the evidence the boundary is in the right place.
- The `attempts = 2` default. Raising it is a separate money decision and
  `AGENTS.md` asks for a ceiling; 2 is that ceiling. Do not make it
  configurable per call site as part of this plan.
- `lib/adapt.ts`, `lib/voice.ts`, `lib/heartbeat.ts` — they call
  `retryMalformed` and will inherit this behaviour automatically, but **only
  once they throw `GenerationFailed`**, which they do not today. That is plan
  026. Do not change them here; they will simply keep their current
  throw-on-first-attempt behaviour, which is no worse than today.
- Any backoff or sleep between attempts. This repo has no retry-delay
  convention and a server action holding a request open longer has its own
  cost. If measurement later shows immediate retries fail together, that is a
  follow-up with evidence behind it.

## Git workflow

- Branch: `advisor/023-retry-a-no-response`
- One commit. Message style is a sentence, not a conventional-commit prefix —
  see `git log --oneline -5`. The body should say what the old behaviour was and
  what the ceiling still is.
- Do NOT push or open a PR.

## Steps

### Step 1: Make `retryMalformed` treat a model throw as an unusable attempt

Rewrite the loop body in `lib/structured-output.ts` so that a `GenerationFailed`
is caught, logged, and retried like a malformed result — while every other throw
propagates untouched, and the last `GenerationFailed` is rethrown once attempts
run out.

Target shape:

```ts
  let last: T | undefined
  let thrown: GenerationFailed | undefined

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      last = await call(attempt)
      thrown = undefined
    } catch (cause) {
      // Only the model's own failure is retried. See the comment you write.
      if (!(cause instanceof GenerationFailed)) throw cause
      thrown = cause
      console.error(
        `[${label}] no response on attempt ${attempt + 1} of ${attempts}`
      )
      continue
    }

    if (usable(last)) return last

    console.error(
      `[${label}] malformed result on attempt ${attempt + 1} of ${attempts}`
    )
  }

  if (thrown) throw thrown

  return last as T
```

Two properties this shape has, and your implementation must keep:

1. **A throw on the last attempt still throws.** Callers have `catch` blocks that
   turn a failed generation into a fallback (`draftAngle`) or a message
   (`completeVoiceRiff`); swallowing the error and returning `undefined` would
   send them a shape they do not expect. `thrown` exists for this.
2. **A throw followed by a success returns the success.** `thrown` is cleared on
   any attempt that returns, so attempt 1 throwing and attempt 2 returning a
   *malformed* result still falls through to the existing "return the last
   attempt" behaviour, which callers already handle.

Then update the function's doc comment. It currently describes only the
malformed case and quotes the ~10-15% → ~1-2% figure. Add a paragraph covering:
what a `GenerationFailed` is and why it is the only throw that is retried;
that a non-`GenerationFailed` throw is our own bug and retrying it buys a second
copy at model prices; that the ceiling is unchanged at 2, so the *worst* case is
still two paid attempts; and the 2026-08-08 incident as the reason (`/riffs`,
22:05:20 UTC, `AI_NoObjectGeneratedError`, one attempt where the doc comment
promised two).

Also correct the sentence in the existing comment that says the failures "do not
throw" — that was true of the mangling it was written for and is no longer true
of everything this function handles.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Test the four paths

Add to `lib/structured-output.test.ts`, inside the existing
`describe("retryMalformed", …)` block if there is one, otherwise in a new block
placed after it. Use `vi.fn()` for the call, as the existing tests in that file
do. Cover:

1. **A `GenerationFailed` on attempt 1, a usable result on attempt 2** → returns
   the good result, call made exactly twice. This is the 2026-08-08 case.
2. **A `GenerationFailed` on both attempts** → the promise rejects with the
   **second** `GenerationFailed` (assert on identity, not just the type — the
   second one carries the accumulated bill and the first does not).
3. **A plain `Error` on attempt 1** → rejects immediately with that same error,
   and the call was made exactly **once**. This is the guard that keeps our own
   bugs from being bought twice.
4. **A `GenerationFailed` on attempt 1, a malformed-but-returned result on
   attempt 2** → resolves with the malformed value (callers' "the model found
   nothing" path), does not reject, call made twice.

**Verify**: `pnpm exec vitest run lib/structured-output.test.ts` → all pass,
including 4 new tests.

### Step 3: Format, lint, full suite

**Verify**:
- `pnpm exec prettier --write lib/structured-output.ts lib/structured-output.test.ts` → exit 0
- `pnpm exec eslint lib/structured-output.ts lib/structured-output.test.ts` → no output
- `pnpm typecheck` → exit 0
- `pnpm test` → 40 files pass, 705 tests (701 + 4 new)

## Test plan

- New tests in `lib/structured-output.test.ts`: the four cases in Step 2.
- Structural pattern: the existing `retryMalformed` tests in that same file —
  match how they build the fake `call` and how they assert call counts.
- Case 3 is the important one to get right. If it is missing, a future change
  that widens the `instanceof` to a bare `catch` will pass the suite.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with 705 tests passing
- [ ] `pnpm exec eslint lib/structured-output.ts lib/structured-output.test.ts` produces no output
- [ ] `grep -c "instanceof GenerationFailed" lib/structured-output.ts` returns 1
- [ ] `grep -n "no response on attempt" lib/structured-output.ts` returns the new log line
- [ ] `git status --short` lists only the two in-scope files
- [ ] `advisor-plans/README.md` status row for 023 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `GenerationFailed` is not present in `lib/structured-output.ts`. This plan is
  built entirely on that class existing as the marker for "the model failed";
  without it there is no safe way to tell a model failure from our own bug, and
  the plan needs rethinking rather than adapting.
- You cannot write case 3 (a plain `Error` is not retried) as a passing test.
  That means the boundary is not actually enforced and the change is not safe to
  land.
- The existing `retryMalformed` tests fail after your change. They encode the
  malformed-result behaviour that must be preserved exactly; a break there means
  the rewrite changed something it should not have.
- You find yourself adding a `setTimeout`/`sleep` between attempts. Out of
  scope — see Scope.

## Maintenance notes

- **What will interact with this**: plan 026 makes `lib/adapt.ts` and
  `lib/voice.ts` throw `GenerationFailed`, at which point they silently gain
  this retry too. That is intended, but it means 026's reviewer is also
  reviewing a spend increase on those paths and should be told so.
- **What a reviewer should scrutinise**: the `instanceof` guard, and that
  `thrown` is cleared on a returning attempt. Both are one-line mistakes with
  expensive consequences — the first buys our own bugs twice, the second turns a
  recovered call into a thrown one.
- **Deferred**: varying the prompt between attempts. The other observed failure
  on 2026-08-08 (22:04:55) was two *malformed* attempts on the identical input,
  which suggests correlated failure that a plain retry cannot fix. That needs
  measurement before it needs code — see the direction note in
  `advisor-plans/README.md`.
