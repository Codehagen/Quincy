# Plan 007: Put `formatConversationDate` under test

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2832e4..HEAD -- lib/format-date.ts`
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

`formatConversationDate` turns a timestamp into the label a reader actually sees:
"Today", "Yesterday", "4 days ago", or a date. It drives four surfaces — the
conversation list, the drafts cards, and both rhythm pages — and it has never had
a single test.

It was also rewritten recently. It used to compute day boundaries with
`getFullYear`/`getMonth`/`getDate`, which read the *server's* zone; on Vercel
that is UTC, so at 01:00 in Oslo a conversation from an hour ago was labelled
"Yesterday". It now takes an explicit timezone, and it formats month names from a
hardcoded table instead of `toLocaleDateString`. Both changes are improvements
and neither is pinned by anything.

This plan adds no behaviour. It writes the tests that make the current behaviour
intentional, so the next person to touch it finds out immediately if they break
a boundary.

## Current state

### The file

`lib/format-date.ts` — one exported function plus two private helpers. 76 lines.
No test file exists for it.

### `lib/format-date.ts:1-45` as it exists today

```ts
import { calendarDayIn, type CalendarDate } from "./timezone"

/**
 * Buckets a conversation by when it was last touched.
 * ... (doc comment, lines 3-17)
 */
export function formatConversationDate(
  value: Date,
  zone: string,
  now = new Date()
): string {
  const then = calendarDayIn(value, zone)
  const today = calendarDayIn(now, zone)

  const days = Math.round(
    (midnightUtcOf(today) - midnightUtcOf(then)) / 86_400_000
  )

  if (days <= 0) {
    return "Today"
  }

  if (days === 1) {
    return "Yesterday"
  }

  if (days < 7) {
    return `${days} days ago`
  }

  return `${then.day} ${MONTH[then.month - 1]}${
    then.year === today.year ? "" : ` ${then.year}`
  }`
}
```

Below that: `midnightUtcOf(date: CalendarDate): number` returning
`Date.UTC(date.year, date.month - 1, date.day)`, and a `MONTH` array of the
twelve three-letter English abbreviations, `"Jan"` through `"Dec"`.

### The dependency it is built on

`calendarDayIn(instant, zone)` from `lib/timezone.ts` returns
`{ year, month, day }` — the calendar date in that zone at that instant. `month`
is 1-based. That module has its own tests in `lib/timezone.test.ts`; you are not
re-testing it here.

### The behaviours to pin, derived by reading the code above

| Input relationship | Returns |
|---|---|
| same calendar day in `zone` | `"Today"` |
| `value` is in the future | `"Today"` (because `days <= 0`) |
| one calendar day earlier | `"Yesterday"` |
| 2 to 6 days earlier | `"N days ago"` |
| exactly 7 days earlier | a date, not `"7 days ago"` |
| 7+ days earlier, same year as `now` | `"4 Aug"` — day, space, month abbrev |
| 7+ days earlier, different year | `"4 Aug 2025"` — year appended |

The 7-day boundary and the future-date case are the two most likely to be broken
by a well-meaning edit, and neither is obvious from reading the call sites.

### Repo conventions to match

- Tests are Vitest, pure functions only, colocated as `lib/<name>.test.ts`.
- One `describe` per exported symbol; `it` names that read as sentences
  ("counts a regional-indicator flag as one character").
- Comments in tests explain *why a case matters*, not what the assertion does.
  See `lib/post-length.test.ts:10-14` for the pattern:

```ts
  it("counts a regional-indicator flag as one character", () => {
    // The bug this whole module exists for: "🇳🇴".length is 4.
    expect("🇳🇴".length).toBe(4)
    expect(countGraphemes("🇳🇴")).toBe(1)
  })
```

- **Every test must pass an explicit `zone` and an explicit `now`.** A test that
  relies on the machine's clock or the machine's zone is testing the bug this
  function was changed to fix. `lib/timezone.test.ts` opens with a comment
  making that rule explicit; read it and follow it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no output after the `$ tsc --noEmit` line |
| Tests (this file) | `npx vitest run lib/format-date.test.ts` | all pass |
| Tests (all) | `pnpm test` | `Test Files 6 passed` after this plan |
| Lint | `pnpm lint` | **exits 1** — see below |

**`pnpm lint` fails on a clean tree.** `hooks/use-mobile.ts:14` trips
`react-hooks/set-state-in-effect`, pre-existing since `6fab77e`. Confirm the
output is exactly `✖ 1 problem (1 error, 0 warnings)` naming that file.

## Scope

**In scope** (the only file you may create or modify):

- `lib/format-date.test.ts` (create)

**Out of scope** (do NOT touch):

- `lib/format-date.ts` — **do not change the implementation.** This plan pins
  current behaviour. If a test you write fails, the default assumption is that
  your test is wrong. See STOP conditions for the one exception.
- `lib/timezone.ts` and `lib/timezone.test.ts` — already tested.
- The four call sites (`app/(app)/conversations/page.tsx`,
  `app/(app)/rhythm/page.tsx`, `app/(app)/rhythm/[id]/page.tsx`,
  `lib/drafts.ts`) — no changes.

## Git workflow

- Branch: `advisor/007-test-format-conversation-date`
- One commit. Conventional commits — `test:` is the right prefix here. See
  `git log --oneline -5` for the body style.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Create the test file with the day-bucket cases

Create `lib/format-date.test.ts`. Open it with a short comment stating the rule
that every case passes an explicit zone and an explicit `now`, and why.

Write a `describe("formatConversationDate")` block covering, one `it` each:

1. the same calendar day returns `"Today"`
2. a `value` **later** than `now` returns `"Today"` — comment that this is the
   `days <= 0` branch and is deliberate, not an accident
3. one calendar day earlier returns `"Yesterday"`
4. two days earlier returns `"2 days ago"`
5. six days earlier returns `"6 days ago"` — the last day before the boundary
6. exactly seven days earlier returns a date, **not** `"7 days ago"` — this is
   the boundary, say so in the test
7. a date more than a week old in the same year returns day and month with no
   year, e.g. `"4 Aug"`
8. a date in a previous year appends the year, e.g. `"4 Aug 2025"`

Use fixed ISO instants (`new Date("2026-08-04T09:00:00Z")`) so nothing depends on
when the suite runs.

**Verify**: `npx vitest run lib/format-date.test.ts` → 8 tests pass.

### Step 2: Add the zone cases

Add a second `describe` block, or extend the first, covering the reason the
function takes a zone at all:

1. **The same instant labels differently in two zones.** Pick an instant near a
   day boundary — 22:30 UTC is already tomorrow in Auckland — and assert that
   one zone says `"Today"` while another says `"Yesterday"`, for the same
   `value` and the same `now`. Comment that this is the bug the zone parameter
   was added to fix.
2. **The bucket follows the reader, not the host.** Assert a case that would
   have returned a different answer under the old server-local implementation:
   at 00:30 in Oslo (22:30 UTC the previous day), a conversation from 23:30 Oslo
   the same evening is `"Yesterday"`, and one from 00:10 Oslo is `"Today"`.

Work out the expected values by reasoning about the instants, not by running the
code and copying its output. A test written by pasting in whatever the function
returned proves nothing.

**Verify**: `npx vitest run lib/format-date.test.ts` → all pass, at least 10
tests total.

### Step 3: Confirm the suite as a whole

**Verify**: `pnpm test` → `Test Files 6 passed`, total test count up by at least
10 from before.

**Verify**: `pnpm typecheck` → exit 0.

**Verify**: `git diff --stat f2832e4..HEAD -- lib/format-date.ts` → no output.

**Verify**: `git status --short` → `lib/format-date.test.ts` is present as a new
untracked file, and no file appears that was not already listed before you
started.

## Test plan

This plan *is* the test plan. To restate the acceptance shape:

- **New file**: `lib/format-date.test.ts`, at least 10 tests.
- **Structural pattern**: `lib/timezone.test.ts` for the explicit-zone
  discipline and the header comment; `lib/post-length.test.ts` for naming and
  comment style.
- **Every test** passes an explicit `zone` and an explicit `now`. A test with a
  two-argument call is a bug in the test.
- **Verification**: `pnpm test` → all pass.

## Done criteria

ALL must hold:

- [ ] `lib/format-date.test.ts` exists with at least 10 tests
- [ ] `npx vitest run lib/format-date.test.ts` → all pass
- [ ] `pnpm test` → `Test Files 6 passed`, all tests pass
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` output is exactly `✖ 1 problem (1 error, 0 warnings)` naming
      `hooks/use-mobile.ts`
- [ ] `git diff --stat f2832e4..HEAD -- lib/format-date.ts` shows **no change** to the
      implementation
- [ ] `grep -c "formatConversationDate(" lib/format-date.test.ts` returns at
      least 10, and `grep -n "formatConversationDate([^,]*)$" lib/format-date.test.ts`
      returns nothing (no single-argument calls)
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/format-date.ts` does not match the excerpt in "Current state".
- A test you are confident is correct fails, and you can show the *function* is
  wrong rather than the test. Report the case and your reasoning. **Do not fix
  the implementation** — a behaviour change to a function four surfaces depend on
  is its own plan, not a step inside a testing plan.
- You cannot construct case 1 in Step 2 (two zones disagreeing on the same
  instant) without making the test depend on the host machine's zone.

## Maintenance notes

- **What a reviewer should scrutinize**: that no test calls
  `formatConversationDate` with fewer than three arguments, and that expected
  values were derived by reasoning rather than pasted from a run.
- **The 7-day boundary is the fragile one.** `days < 7` means the seventh day
  formats as a date. If anyone ever changes that to `<=`, test 6 is what catches
  it.
- **`MONTH` is hardcoded English on purpose**, matching the hardcoded weekday
  tables in `lib/lineup.ts`. If the app ever gets real localisation, this
  function and `lib/lineup.ts` change together, and these tests will need their
  expected strings revisited at the same time.
- **Deferred**: no test asserts the four call sites pass the *right* zone —
  that would need rendering server components. The risk is low because all four
  pass `resolveTimeZone(session.user.timezone)` and TypeScript requires the
  argument.
