# Plan 008: Pin `instantOf`'s behaviour on the days around a DST transition

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2832e4..HEAD -- lib/timezone.ts lib/timezone.test.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: tests
- **Planned at**: commit `f2832e4`, 2026-08-04

## Why this matters

`instantOf` turns a wall clock ("Monday 08:00") into a moment in time. It is the
function that decides when a scheduled post actually goes out, so an error in it
publishes at the wrong hour.

Its hard part is daylight saving. The function reads the UTC offset a day either
side of the requested reading and, when those differ, works out which of two
candidate instants is real. Three of its four paths are already tested: the
ordinary same-offset day, the spring-forward gap where the reading does not
exist, and the autumn repeat where it happens twice.

The fourth is not. When a transition falls **within 24 hours** of the requested
reading but the reading itself is perfectly ordinary — noon on the day before the
clocks change, noon on the day after — the offsets a day either side still differ,
so the function takes its complicated branch for a case with an obvious answer.
It currently gets that right. Nothing in the suite says so, and it is the branch
a future refactor is most likely to break, because it looks like dead weight
until you know why it is there.

This plan adds tests only. The implementation is correct and does not change.

## Current state

### The file

`lib/timezone.ts` — the timezone boundary module, ~290 lines, no repo-internal
imports. `lib/timezone.test.ts` — 24 tests across nine `describe` blocks.

### `lib/timezone.ts:195-226` as it exists today

```ts
export function instantOf(wall: WallClock, zone: string): Date {
  const asIfUtc = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    0,
    0
  )

  // A day is wider than any offset (±14h at the extremes), so these two land
  // cleanly either side of a transition falling on this date.
  const before = offsetAt(new Date(asIfUtc - DAY_MS), zone)
  const after = offsetAt(new Date(asIfUtc + DAY_MS), zone)

  if (before === after) {
    return new Date(asIfUtc - before)
  }

  const survives = [asIfUtc - before, asIfUtc - after].filter(
    (candidate) => offsetAt(new Date(candidate), zone) === asIfUtc - candidate
  )

  // Nothing survives only in the gap, and there `asIfUtc - before` is already
  // the reading shifted forward by exactly the size of the jump.
  if (survives.length === 0) {
    return new Date(asIfUtc - before)
  }

  return new Date(Math.min(...survives))
}
```

`WallClock` is `{ year, month, day, hour, minute }` with 1-based `month`.
`offsetAt(instant, zone)` is a private helper returning milliseconds to add to
UTC to get that zone's wall clock at that instant.

### The four paths, and which are already covered

| Path | When it runs | Covered by |
|---|---|---|
| `before === after` | ordinary day, no transition within ±24h | `"is the inverse of wallClockIn"`, `"uses the offset in force on the day"` |
| `survives.length === 0` | the spring-forward gap | `"resolves a spring-forward gap to the later reading, never earlier"` |
| `survives.length === 2`, takes the min | the autumn repeat | `"resolves a fall-back repeat to the first occurrence"` |
| **`survives.length === 1`** | **transition within ±24h, reading unambiguous** | **nothing** |

### The facts you need about Europe/Oslo in 2026

Verified against the runtime's IANA data:

- **29 March 2026**: clocks jump 02:00 → 03:00. Offset goes +01:00 → +02:00.
- **25 October 2026**: clocks fall 03:00 → 02:00. Offset goes +02:00 → +01:00.

The six readings this plan covers, all at 12:00 local, and the instant each must
produce:

| Local wall clock (Europe/Oslo) | Correct instant |
|---|---|
| 2026-03-28 12:00 (day before spring) | `2026-03-28T11:00:00.000Z` |
| 2026-03-29 12:00 (day of spring, after the jump) | `2026-03-29T10:00:00.000Z` |
| 2026-03-30 12:00 (day after spring) | `2026-03-30T10:00:00.000Z` |
| 2026-10-24 12:00 (day before autumn) | `2026-10-24T10:00:00.000Z` |
| 2026-10-25 12:00 (day of autumn, after the fall) | `2026-10-25T11:00:00.000Z` |
| 2026-10-26 12:00 (day after autumn) | `2026-10-26T11:00:00.000Z` |

Four of those six exercise the untested `survives.length === 1` branch: the two
days flanking each transition, plus each transition day itself at a time well
clear of the change.

### Repo conventions to match

`lib/timezone.test.ts` opens with a comment that is the rule for this file:

```ts
/**
 * These run under whatever zone the machine is in, and that is the point. Every
 * assertion below is written against an explicit zone or a UTC instant, so a
 * green run in Oslo and a green run on Vercel mean the same thing. If any test
 * here starts depending on the host's zone, it is testing the bug.
 */
```

It defines `const OSLO = "Europe/Oslo"` near the top; reuse it. Existing style:
one `describe` per exported symbol, `it` names as sentences, a comment above any
assertion whose expected value is not self-evident — see the existing
`describe("instantOf")` block.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no output after the `$ tsc --noEmit` line |
| Tests (this file) | `npx vitest run lib/timezone.test.ts` | all pass |
| Tests, host UTC | `TZ=UTC npx vitest run lib/timezone.test.ts` | identical result |
| Tests, host Tokyo | `TZ=Asia/Tokyo npx vitest run lib/timezone.test.ts` | identical result |
| Tests (all) | `pnpm test` | `Test Files 5 passed` |
| Lint | `pnpm lint` | **exits 1** — see below |

**`pnpm lint` fails on a clean tree.** `hooks/use-mobile.ts:14` trips
`react-hooks/set-state-in-effect`, pre-existing since `6fab77e`. Confirm the
output is exactly `✖ 1 problem (1 error, 0 warnings)` naming that file.

## Scope

**In scope** (the only file you may modify):

- `lib/timezone.test.ts`

**Out of scope** (do NOT touch):

- `lib/timezone.ts` — **the implementation is correct and does not change.**
  The four expected instants around each transition in the table above were
  verified against the runtime before this plan was written. If a test fails,
  the default assumption is that your expected value is wrong.
- Every other test file.
- `scripts/verify-timezone.ts` — a separate, database-backed check. Not part of
  this plan.

## Git workflow

- Branch: `advisor/008-pin-instantof-near-transitions`
- One commit, prefix `test:`. See `git log --oneline -5` for body style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the near-transition cases

Inside the existing `describe("instantOf", ...)` block in `lib/timezone.test.ts`,
add tests covering the six readings in the table above. Two `it` blocks is
enough — one per transition, each asserting three days — or six if you prefer one
per day. Either shape is acceptable; what matters is that all six instants are
asserted.

Each test must:

- use the `OSLO` constant already defined in the file
- assert with `.toISOString()` against the exact strings in the table
- carry a comment naming *why the case is interesting*: that the offsets 24 hours
  either side of these readings differ, so the function takes its
  candidate-filtering branch even though the reading itself is unambiguous

**Verify**: `npx vitest run lib/timezone.test.ts` → all pass, 6 more assertions
than before (test count depends on the shape you chose).

### Step 2: Add one test that names the branch directly

Add a single `it` whose name states the property in words — something in the
shape of "resolves an ordinary reading on the day either side of a transition".
Its body should assert that a noon reading the day before a transition and a noon
reading the day after both round-trip: `wallClockIn(instantOf(w, OSLO), OSLO)`
equals `w`.

This is the test that fails loudest if someone deletes the `survives` filter and
replaces it with a single-offset shortcut, because a round-trip assertion does
not depend on anyone having got the expected UTC string right.

**Verify**: `npx vitest run lib/timezone.test.ts` → all pass.

### Step 3: Prove the tests are host-independent

The whole point of this file is that it means the same thing on any machine.

**Verify**: `TZ=UTC npx vitest run lib/timezone.test.ts` → all pass.

**Verify**: `TZ=Asia/Tokyo npx vitest run lib/timezone.test.ts` → all pass, same
count.

**Verify**: `TZ=America/Los_Angeles npx vitest run lib/timezone.test.ts` → all
pass, same count.

If the three runs disagree, a test is reading the host's zone. That is a STOP
condition.

### Step 4: Confirm the suite as a whole

**Verify**: `pnpm test` → all pass, `Test Files 5 passed`.

**Verify**: `pnpm typecheck` → exit 0.

**Verify**: `git diff --stat f2832e4..HEAD -- lib/timezone.ts` → no output.

**Verify**: `git status --short` → no file appears that was not already listed
before you started.

## Test plan

- **New tests**: 3 to 7 depending on shape, all inside the existing
  `describe("instantOf")` block in `lib/timezone.test.ts`.
- **Cases**: the six instants in the "Current state" table, plus one round-trip
  assertion naming the branch.
- **Structural pattern**: the tests already in that `describe` block,
  particularly `"resolves a spring-forward gap to the later reading, never
  earlier"` — same use of `OSLO`, same `.toISOString()` assertions, same comment
  density.
- **Verification**: the file passes under at least three different host `TZ`
  values.

## Done criteria

ALL must hold:

- [ ] All six instants from the "Current state" table are asserted in
      `lib/timezone.test.ts`
- [ ] `npx vitest run lib/timezone.test.ts` → all pass
- [ ] The same command passes with `TZ=UTC`, `TZ=Asia/Tokyo` and
      `TZ=America/Los_Angeles`, with the same test count each time
- [ ] `pnpm test` → all pass
- [ ] `pnpm typecheck` exits 0
- [ ] `git diff --stat f2832e4..HEAD -- lib/timezone.ts` shows **no change** to the
      implementation
- [ ] `git status --short` shows only `lib/timezone.test.ts` modified
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `instantOf` in `lib/timezone.ts` does not match the excerpt in "Current
  state".
- Any of the six expected instants in the table does not match what the function
  returns. Report the reading, the expected value and the actual value. **Do not
  change `lib/timezone.ts`** — if the implementation really is wrong, that is a
  bug fix with its own plan and its own review, not a step inside a testing plan.
- The three `TZ` runs in Step 3 disagree with each other.
- The runtime's IANA data disagrees with the March/October 2026 transition dates
  given above (possible on an old or stripped Node build). Report the Node
  version and what `new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Oslo",
  timeZoneName: "short" }).format(new Date("2026-07-01"))` returns.

## Maintenance notes

- **What a reviewer should scrutinize**: that `lib/timezone.ts` is untouched, and
  that the expected instants were reasoned about rather than copied from a
  failing run's output.
- **Why the branch exists at all**: `before` and `after` are sampled ±24h from
  the reading, so any transition inside that window makes them differ — including
  for readings that are themselves completely ordinary. Deleting the `survives`
  filter in favour of "just use `before`" would pass every test that existed
  before this plan and would silently shift noon on 29 March by an hour. That is
  what these tests are for.
- **Deferred**: zones with unusual transitions — Lord Howe Island's 30-minute
  shift, and the handful of zones that have historically skipped a whole day
  across the date line — are not covered. The `Asia/Kolkata` half-hour *offset*
  case is already tested; a half-hour *transition* is not. Worth adding only if
  Quincy ever has users there.
