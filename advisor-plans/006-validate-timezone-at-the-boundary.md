# Plan 006: Validate the timezone field where it enters, not only where it is read

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2832e4..HEAD -- lib/auth.ts lib/timezone.ts lib/timezone.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `f2832e4`, 2026-08-04

## Why this matters

`user.timezone` is a Better Auth "additional field" with `input: true`, which
means the sign-up endpoint accepts it from the request body. Sign-up is
unauthenticated. Nothing currently validates the value, so any string of any
length that reaches `/api/auth/sign-up/email` is persisted verbatim into a
`text` column.

The read path already defends itself — `resolveTimeZone` in `lib/timezone.ts`
turns anything unrecognised into UTC, so no page can be crashed this way. What is
missing is the write-side check, and the cost of not having one is a `text`
column on the user table that will accept arbitrary attacker-chosen content at an
unauthenticated endpoint. Sign-up is rate limited to 3 per 60 seconds, which
bounds the rate but not the size of any single value.

Better Auth has a first-class hook for exactly this: a per-field
`validator.input` taking a Standard Schema. This plan adds one, and makes it a
tested, exported value rather than an inline lambda so its behaviour is pinned by
the suite.

## Current state

### The files

- `lib/auth.ts` — Better Auth config. The `timezone` additional field is at
  lines 221–245, inside `user.additionalFields`.
- `lib/timezone.ts` — the timezone boundary module. Exports `isValidTimeZone`,
  which is the check this plan reuses. Imports nothing from the rest of the repo,
  so importing it into `lib/auth.ts` creates no cycle.
- `lib/timezone.test.ts` — Vitest unit tests for that module. You will add to it.

### `lib/auth.ts:241-245` as it exists today

```ts
      timezone: {
        type: "string",
        required: false,
        input: true,
      },
```

(The 20-line doc comment above it, lines 221–240, explains why the field is on
the user row and why `input: true` differs from `trialEndsAt`'s `input: false`.
Leave that comment in place and extend it rather than replacing it.)

### `lib/timezone.ts` — the existing check you will reuse

```ts
// lib/timezone.ts — exported, currently used by resolveTimeZone and by
// app/(app)/actions.ts
export function isValidTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: zone })
    return true
  } catch {
    return false
  }
}
```

```ts
// lib/timezone.ts — the read-side fallback, for context. Do not change it.
export function resolveTimeZone(zone: string | null | undefined): string {
  if (!zone) return DEFAULT_TIME_ZONE
  return isValidTimeZone(zone) ? zone : DEFAULT_TIME_ZONE
}
```

### The contract Better Auth expects from a validator

Verified by reading `node_modules/better-auth/dist/db/schema.mjs:78-86`:

```js
if (fields[key].validator?.input && data[key] !== void 0) {
  const result = fields[key].validator.input["~standard"].validate(data[key]);
  if (result instanceof Promise) throw ...ASYNC_VALIDATION_NOT_SUPPORTED;
  if ("issues" in result && result.issues) throw ...BAD_REQUEST(VALIDATION_ERROR);
  parsedData[key] = result.value;
  continue;
}
```

Three facts that follow, and that decide this plan's design:

1. The validator must be **synchronous**. Returning a Promise is a 500.
2. Returning `{ issues: [...] }` **fails the whole request** with a 400. On the
   sign-up path that means the account is not created.
3. On success the stored value is `result.value`, not the input — so a validator
   can *coerce* as well as reject.

**This plan coerces; it does not reject.** An unrecognised zone becomes `null`.
That is deliberate, and the reasoning must survive into the code comment: the
zone is sent automatically by the browser and no human types it, so a person
whose runtime reports something this check does not recognise would have their
sign-up rejected by a field they never filled in and cannot see. Coercing to null
lands them in exactly the state every Google sign-up is already in — no stored
zone, UTC on read, corrected later by `TimeZoneSync` — while still keeping
arbitrary content out of the column. There is no version of "reject" whose
failure mode is better than that.

`null` is safe to store: the column is nullable (`lib/schema.ts` has
`timezone: text("timezone")` with no `.notNull()`), and every reader goes
through `resolveTimeZone`, which treats null and junk identically.

### Repo conventions to match

- **Comments explain why, not what.** Every non-obvious decision in this codebase
  carries a comment naming the failure it prevents. `lib/timezone.ts` is the
  house style at its densest — match it.
- **Tests are pure-function Vitest**, one `describe` per exported symbol, test
  names that read as sentences. See `lib/post-length.test.ts:5-24` and the
  existing blocks in `lib/timezone.test.ts`.
- No test framework config is needed; `pnpm test` picks up `lib/*.test.ts`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no output after the `$ tsc --noEmit` line |
| Tests (this file) | `npx vitest run lib/timezone.test.ts` | all pass |
| Tests (all) | `pnpm test` | `Test Files 5 passed`, `Tests 68 passed` or more |
| Build | `pnpm build` | `✓ Compiled successfully` |
| Lint | `pnpm lint` | **exits 1** — see below |

**`pnpm lint` fails on a clean tree.** `hooks/use-mobile.ts:14` trips
`react-hooks/set-state-in-effect`, pre-existing since commit `6fab77e`. Confirm
the output is exactly `✖ 1 problem (1 error, 0 warnings)` naming that file. A
second error is yours.

## Scope

**In scope** (the only files you may modify):

- `lib/timezone.ts` — add one exported validator
- `lib/timezone.test.ts` — add tests for it
- `lib/auth.ts` — wire the validator onto the `timezone` field only

**Out of scope** (do NOT touch, even though they look related):

- `lib/schema.ts` — generated output, overwritten by `pnpm auth:generate`. Do
  not hand-edit it. This plan requires no schema change: the column already
  exists and is already nullable.
- `resolveTimeZone` and every other function in `lib/timezone.ts` — the read-side
  fallback stays exactly as it is. This plan adds a second line of defence, it
  does not move the existing one.
- `app/(app)/actions.ts` — its own `isValidTimeZone` guard stays. Two checks on
  two paths is correct here, not duplication to be consolidated.
- `components/auth/signup-form.tsx` — the client already sends only what
  `Intl.DateTimeFormat().resolvedOptions().timeZone` reports.
- The `trialEndsAt` field in `lib/auth.ts` — do not add a validator to it. Its
  `input: false` already refuses client input outright, which is stricter.
- Do NOT add `zod`, `valibot`, or any validation library. None is installed, and
  a dependency is not warranted for one field. Hand-roll the Standard Schema
  object; the shape is small and is given below.

## Git workflow

- Branch: `advisor/006-validate-timezone-at-the-boundary`
- One commit. Conventional commits with a descriptive body — see
  `git log --oneline -5`.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the validator to `lib/timezone.ts`

Export a Standard Schema object named `timeZoneInput`. It must:

- have the shape `{ "~standard": { version: 1, vendor: "quincy", validate } }`
- have a **synchronous** `validate`
- return `{ value: <the zone> }` when the input is a string and
  `isValidTimeZone` accepts it
- return `{ value: null }` in every other case — non-string input, empty string,
  or a string `isValidTimeZone` rejects
- **never** return an `issues` array

Type it so `pnpm typecheck` passes without `any`. A minimal hand-written type is
fine; there is no `@standard-schema/spec` package installed and you must not add
one.

Place it next to `isValidTimeZone` and `resolveTimeZone`, and give it a doc
comment covering: what it is for, that Better Auth calls it on sign-up and on
`updateUser`, why it coerces instead of rejecting (a rejection fails a whole
sign-up over a field the user never filled in), and that `null` is the same state
every Google sign-up already starts in.

**Verify**: `pnpm typecheck` → exit 0.

**Verify**: `grep -n "timeZoneInput" lib/timezone.ts` → at least one match on an
`export` line.

### Step 2: Test the validator

Add a `describe("timeZoneInput", ...)` block to `lib/timezone.test.ts`, matching
the style of the blocks already there. Cover, one `it` each:

1. a canonical zone passes through unchanged → `{ value: "Europe/Oslo" }`
2. a live alias the runtime still reports is accepted → `"Asia/Calcutta"`
3. a string that is not a zone coerces to null → `{ value: null }`
4. a very long string coerces to null (use `"x".repeat(10_000)`) — this is the
   case the plan exists for; say so in the test name or a comment
5. a non-string input coerces to null (pass `42` and `null`, cast at the call
   site as the signature requires)
6. the result never carries `issues` — assert `"issues" in result === false` for
   at least the junk case, because an `issues` return would fail a real sign-up

**Verify**: `npx vitest run lib/timezone.test.ts` → all pass, 6 more tests than
before.

### Step 3: Wire it onto the field in `lib/auth.ts`

Add `validator: { input: timeZoneInput }` to the `timezone` field object at
`lib/auth.ts:241-245`, importing `timeZoneInput` from `./timezone`.

Extend the existing doc comment above the field with two or three sentences on
why the validator is there — that `input: true` means an unauthenticated
endpoint accepts this field, and that the validator is what keeps the column to
IANA names. Do not delete the existing comment.

**Verify**: `pnpm typecheck` → exit 0.

**Verify**: `grep -n "validator" lib/auth.ts` → exactly one match, inside the
`timezone` field.

### Step 4: Confirm nothing else moved

**Verify**: `pnpm test` → all pass.

**Verify**: `pnpm build` → `✓ Compiled successfully`.

**Verify**: `git status --short` → exactly three files modified:
`lib/auth.ts`, `lib/timezone.ts`, `lib/timezone.test.ts`. (If you see
`lib/schema.ts` in that list, you ran `pnpm auth:generate`. Revert it —
this plan needs no schema change.)

## Test plan

- **New tests**: six, in `lib/timezone.test.ts`, listed in Step 2.
- **Structural pattern to follow**: the existing `describe("resolveTimeZone")`
  block in the same file; and `lib/post-length.test.ts` for the wider house
  style.
- **Not tested, deliberately**: that Better Auth actually invokes the validator
  during a real sign-up. That needs a live server and database, which this repo
  has no harness for. The contract is pinned by reading
  `node_modules/better-auth/dist/db/schema.mjs:78-86`, quoted in "Current
  state". Do not build a mocking harness for it.
- **Verification**: `pnpm test` → all pass, six new tests included.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `npx vitest run lib/timezone.test.ts` passes with 6 new tests
- [ ] `pnpm test` exits 0
- [ ] `pnpm build` prints `✓ Compiled successfully`
- [ ] `pnpm lint` output is exactly `✖ 1 problem (1 error, 0 warnings)` naming
      `hooks/use-mobile.ts`
- [ ] `grep -rn "zod\|valibot" package.json` returns no matches (no dependency
      was added)
- [ ] `git status --short` lists only `lib/auth.ts`, `lib/timezone.ts`,
      `lib/timezone.test.ts`
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The `timezone` field in `lib/auth.ts` does not match the excerpt in "Current
  state", or already has a `validator` key.
- `pnpm typecheck` cannot be satisfied without `any` or a `@ts-ignore` on the
  Standard Schema object. Report the type error rather than suppressing it.
- You conclude the validator should reject rather than coerce. That is a real
  design question and the answer in this plan is deliberate — if you disagree,
  report the argument, do not change the behaviour.
- Adding the import of `./timezone` to `lib/auth.ts` produces a circular import
  warning at build time.

## Maintenance notes

- **What a reviewer should scrutinize**: that `validate` is synchronous and can
  never return `issues`. Either mistake turns a bad timezone into a failed
  sign-up, which is a worse outcome than the problem being fixed.
- **Interaction with plan 005**: once 005 routes `rememberTimeZone` through
  `auth.api.updateUser`, this validator runs on that path too. That is desirable
  and needs no coordination — either plan can land first.
- **If a settings surface is added later** that lets people pick a zone from a
  list, this validator still applies and still coerces silently. At that point a
  visible error is the better behaviour for that path specifically, because a
  human really did choose the value. Revisit then, not now.
- **Deferred**: no length cap on the column itself. The validator makes one
  unnecessary while it is in force; a `varchar(64)` would be belt and braces and
  would need a migration, which is not worth it for this.
