# Plan 018: Never place an approved post at a time that has already passed

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 85f2386..HEAD -- lib/scheduling.ts lib/scheduling.test.ts
> ```
>
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `85f2386`, 2026-08-05

## Why this matters

Approving a draft places it in the next free slot for its channel. The search
that finds that slot includes **today**, even when today's slot time has already
passed — so approving at 14:00 on a day whose slot is 08:00 schedules the post
six hours into the past.

Nothing catches it afterwards. The publish sweep (`lib/publish-run.ts`) reads
`scheduled_for <= now` and sends, so there are two outcomes and both are wrong:

- **Approved within two hours after the slot time** — the sweep runs every five
  minutes and publishes it almost immediately. The user was told "going out
  Monday 08:00" and it goes out at 09:34, unannounced, in their name.
- **Approved more than two hours after** — the post is outside the catch-up
  window, so the sweep marks it `failed` with "It was due 380 minutes ago".
  Approving a draft in the afternoon silently produces a dead post.

With one slot per channel — the shape the product is designed around — this
happens to anyone who approves in the afternoon on their slot day.

The rule was borrowed from `movePost` in `app/(app)/lineup/actions.ts`, where
including today is *correct*: the user drags a post onto a specific slot and
sees exactly where it landed. It does not transfer to automatic placement,
where nobody chose that instant and nobody is shown it before it is committed.

**A test currently asserts the broken behaviour**, so fixing the code without
fixing the test will fail the suite. That is expected and it is step 2.

## Current state

Files:

- `lib/scheduling.ts` — decides where an approved version goes. `occurrencesOf`
  (line 54) generates candidate instants; `nextFreeSlot` (line 118) filters and
  picks one.
- `lib/scheduling.test.ts` — pins `occurrencesOf`. Line 29 asserts the bug.

`occurrencesOf` walks forward from today, and `ahead` is `0` when today already
*is* the slot's weekday — regardless of the time of day:

```ts
// lib/scheduling.ts:61-71
  const parsed = parseTimeOfDay(time)
  if (!parsed) return []

  const today = calendarDayIn(from, zone)
  const ahead = (weekday - isoWeekdayOf(today) + 7) % 7

  return Array.from({ length: weeks }, (_, week) =>
    instantOf(
      { ...addCalendarDays(today, ahead + week * 7), ...parsed },
      zone
    )
  )
```

`nextFreeSlot` then filters candidates against the **upper** bound only. There
is no lower bound, so a candidate earlier today survives:

```ts
// lib/scheduling.ts:144-152
  const candidates = standing
    .flatMap((s) =>
      occurrencesOf(s.weekday, s.timeOfDay, zone, now, weeks).map((at) => ({
        at,
        slotId: s.id,
      }))
    )
    .filter((c) => c.at.getTime() < horizon.getTime())
    .sort((a, b) => a.at.getTime() - b.at.getTime())
```

The test that locks the behaviour in:

```ts
// lib/scheduling.test.ts:26-33
  it("returns today when the weekday matches", () => {
    // Today included, matching nextOccurrence in app/(app)/lineup/actions.ts.
    // Dropping into this morning's slot at four in the afternoon should read as
    // "you missed it", not silently push a week out.
    const [first] = occurrencesOf(WEDNESDAY, "08:00", "UTC", NOW, 1)

    expect(first.toISOString()).toBe("2026-08-05T08:00:00.000Z")
  })
```

`NOW` in that file is `new Date("2026-08-05T12:00:00.000Z")` — a Wednesday at
noon — and `WEDNESDAY` is `3`. So the assertion is literally "a slot four hours
in the past is the right answer".

### Conventions to match

This repo writes **long explanatory comments that say why, not what**, and
treats a comment as the place a decision is recorded. Match that density. A
good local exemplar is `nextOccurrence` in `app/(app)/lineup/actions.ts:138-151`,
whose comment explains the "today included" choice *and* why it is deliberate
there. Your change makes `lib/scheduling.ts` diverge from it, so the comment
must say why the two differ rather than leaving a reader to assume one is a
copy that drifted.

Tests use `vitest`, `describe`/`it`/`expect`, with a fixed `NOW` constant so
nothing depends on the run date. See `lib/scheduling.test.ts` and
`lib/publish-run.test.ts`.

## Commands you will need

| Purpose   | Command                                | Expected on success |
|-----------|----------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                     | exit 0, no output   |
| Tests     | `npx vitest run lib/scheduling.test.ts`| all pass            |
| Full tests| `npx vitest run`                       | all pass            |
| Lint      | `npx eslint lib/scheduling.ts lib/scheduling.test.ts` | exit 0, no output |

## Scope

**In scope** (the only files you may modify):

- `lib/scheduling.ts`
- `lib/scheduling.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `app/(app)/lineup/actions.ts` — `nextOccurrence` there is used by `movePost`,
  where "today included" is correct and deliberate. Changing it would break
  dragging a post into this morning's slot, which is a supported action with its
  own documented reasoning at lines 132-137.
- `lib/publish-run.ts` — the two-hour catch-up window is not the bug. It is what
  *reveals* the bug. Widening it would hide this instead of fixing it.
- `lib/lineup.ts` — a separate finding covers the read window; not this plan.
- The `Placement` return type and its `no-slot` / `slots-full` reasons — callers
  in `app/(app)/drafts/actions.ts` and `components/drafts/draft-card.tsx` switch
  on these. Do not add or rename a reason.

## Git workflow

- Branch: `advisor/018-never-schedule-into-the-past`
- One commit. Message style is conventional commits with a body that explains
  the reasoning — see `git log --format='%s' -5` for the subject style, e.g.
  `fix: name the publish outcome that must never be retried`.
- Do NOT push or open a PR.

## Steps

### Step 1: Drop candidates whose moment has already passed

In `lib/scheduling.ts`, in `nextFreeSlot`, add a lower bound to the candidate
filter at line 151 so that only instants strictly after `now` survive.

The filter becomes a window with both ends, rather than only a ceiling:

```ts
    .filter(
      (c) => c.at.getTime() > now.getTime() && c.at.getTime() < horizon.getTime()
    )
```

Add a comment above the filter recording *why* this differs from
`nextOccurrence` in `app/(app)/lineup/actions.ts`. It must say, in your own
prose: dragging a post onto a slot that has passed is a choice the user makes
and sees; placing one there automatically is a choice nobody made, and the
publish sweep would either send it within five minutes or mark it failed for
being outside the catch-up window. Keep it to the repo's comment style — full
sentences, the reason not the mechanic.

Do **not** change `occurrencesOf`. It is also used to generate the week-two
candidates and its "walk forward from today" behaviour is correct; the fix
belongs where the candidates are selected, not where they are generated.

**Verify**: `npx tsc --noEmit` → exit 0, no output.

### Step 2: Correct the test that asserts the old behaviour

`lib/scheduling.test.ts:26-33` currently asserts that a slot time earlier today
is returned. That assertion describes `occurrencesOf` in isolation, which is
still true — `occurrencesOf` really does return today, and Step 1 did not change
it.

So **keep the test, and keep it passing**, but rewrite its comment so it no
longer claims that returning a passed slot is the desired product behaviour.
The comment must instead say that `occurrencesOf` deliberately generates the
past instant and that `nextFreeSlot` is the layer that rejects it, with a
pointer to the new test in Step 3.

If, after Step 1, this test fails, STOP — it means `occurrencesOf` was modified,
which Step 1 forbids.

**Verify**: `npx vitest run lib/scheduling.test.ts` → all pass.

### Step 3: Add tests for the boundary that now exists

Add a new `describe("nextFreeSlot candidate window")` block to
`lib/scheduling.test.ts` that pins the rule directly.

`nextFreeSlot` reads the database, so do **not** call it. Test the selection
rule the same way the existing file tests `occurrencesOf`: build the candidate
list with `occurrencesOf`, apply the same `> now` filter, and assert what
survives. Cover these cases explicitly:

1. A slot at 08:00 on today's weekday, with `now` at 12:00 the same day — the
   08:00 instant is rejected and the surviving earliest candidate is seven days
   later.
2. A slot at 18:00 on today's weekday, with `now` at 12:00 — today's 18:00
   survives, because it has not passed.
3. A slot on a different weekday — unaffected by the filter, still the next
   occurrence of that weekday.

Use the file's existing fixed `NOW` (`2026-08-05T12:00:00.000Z`, a Wednesday)
and its `WEDNESDAY` / `MONDAY` constants. Follow the existing style: one
behaviour per `it`, a comment above any assertion whose reasoning is not obvious
from the code.

**Verify**: `npx vitest run lib/scheduling.test.ts` → all pass, with at least 3
more tests than before the change.

### Step 4: Confirm nothing else regressed

**Verify**:

- `npx vitest run` → all pass. The count must be **at least 96 + the tests you
  added**; 96 is the suite size at commit `85f2386`.
- `npx eslint lib/scheduling.ts lib/scheduling.test.ts` → exit 0, no output.
- `git status --short` → only `lib/scheduling.ts` and `lib/scheduling.test.ts`
  are modified.

## Test plan

- **File**: `lib/scheduling.test.ts` (existing).
- **Structural pattern**: the existing `describe("occurrencesOf")` block in the
  same file. Fixed `NOW`, one behaviour per `it`, comments carrying the reason.
- **New cases**: the three in Step 3 — past slot today rejected, future slot
  today kept, other weekday unaffected.
- **Regression this pins**: approving at 12:00 on a day whose slot is 08:00 must
  not yield an instant in the past. That is the exact condition that made the
  publish sweep either fire immediately or mark the post failed.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0 with no output
- [ ] `npx vitest run` exits 0; total test count is at least 99
- [ ] `npx eslint lib/scheduling.ts lib/scheduling.test.ts` exits 0 with no output
- [ ] `grep -n "c.at.getTime() > now.getTime()" lib/scheduling.ts` returns exactly one match
- [ ] `git diff --name-only` lists only `lib/scheduling.ts` and `lib/scheduling.test.ts`
- [ ] `grep -n "ahead + week \* 7" lib/scheduling.ts` still returns one match — `occurrencesOf` was not changed
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `occurrencesOf` needs to change to make a step pass. It does not; if it seems
  to, the fix has been put in the wrong layer.
- Adding the lower bound makes `nextFreeSlot` return `slots-full` in a case
  where a genuinely future slot exists. That would mean `weeks` (currently
  `Math.ceil(HORIZON_DAYS / 7)`, line 141) generates too few occurrences once
  today's is discarded — a real interaction, and a separate decision. Report it;
  do not raise `HORIZON_DAYS` or `weeks` yourself.
- Any test outside `lib/scheduling.test.ts` fails after Step 1.

## Maintenance notes

- **This interacts directly with `HORIZON_DAYS`.** Discarding today's occurrence
  costs the user one candidate in the common case. With `HORIZON_DAYS = 14` and
  a single weekly slot there are only two candidates to begin with, so a user
  who approves three drafts on a slot afternoon now gets `slots-full` one
  approval earlier than before. That is honest — there genuinely is no free
  future slot inside two weeks — but it is the first thing to re-examine if
  users report "every slot for the next two weeks is taken" too readily.
- A reviewer should check that `occurrencesOf` is untouched and that the new
  comment explains the divergence from `nextOccurrence` in
  `app/(app)/lineup/actions.ts` rather than silently contradicting it.
- Deliberately **not** in this plan: making the publish sweep refuse to send a
  post whose `scheduled_for` is in the past at insert time. A defence in depth
  there would be reasonable, but it belongs with the sweep and would mask this
  bug rather than fix it.
