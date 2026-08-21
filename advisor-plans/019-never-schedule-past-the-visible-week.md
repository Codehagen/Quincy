# Plan 019: Never schedule a post the Lineup cannot show

> ## ⚠️ SUPERSEDED — do not execute this plan
>
> **The approach below is wrong.** It was disproved while being applied, by the
> STOP condition it carries in its own "Maintenance notes". Recorded rather than
> deleted, because the reasoning is the useful part.
>
> **What breaks.** `weeks` derives from `HORIZON_DAYS`
> (`Math.ceil(HORIZON_DAYS / 7)`), so setting the horizon to 7 generates exactly
> **one** occurrence per slot. Combined with plan 018's new lower bound, a
> Monday 08:00 slot approved on Monday at 14:00 has its only candidate discarded
> as past — and returns `slots-full`, telling the user every slot is taken while
> next Monday sits free.
>
> **Why raising `weeks` would not have saved it.** A seven-day window contains
> exactly one occurrence of a weekly slot. The moment that occurrence passes,
> there is genuinely nothing visible to schedule into until midnight rolls the
> window forward. Aligning the horizon to the window does not remove the
> mismatch; it converts an invisible post into a refused approval, which is
> worse — an invisible post still goes out.
>
> **A second error, smaller.** The plan assumed `horizon` and the Lineup's
> window were the same measurement. They are not: `horizon` is `now + N days`
> and the window runs from *start of day*. They differ by the time of day, so
> "set the constant to 7" would not have matched the visible week even on its
> own terms.
>
> **What was done instead** (2026-08-05, commit on
> `feat/approve-schedule-publish`): `HORIZON_DAYS` stays at 14, and the
> mismatch is named rather than removed. `lib/scheduling.ts` gained
> `isBeyondVisibleWeek(at, now, zone)`, which computes the boundary exactly as
> `getLineup` computes its window — `startOfDayIn(today + 7)` in the reader's
> zone. `Placement` and `ApprovalPlacement` carry a `beyondThisWeek` flag, and
> the Drafts receipt reads it: a placement inside the week says "going out
> Monday 08:00"; one beyond it says "going out Mon 17 Aug 08:00, past the week
> Lineup shows", with the date included because "Monday" alone is ambiguous once
> there is more than one in play.
>
> No cliff, no refused approvals, no change to the Lineup's deliberate rolling
> week. Covered by 5 unit tests in `lib/scheduling.test.ts` (including the
> zone-boundary case) and 2 assertions in `scripts/verify-publish-run.ts`.
>
> **Still open, deliberately**: /lineup itself says nothing about posts beyond
> its window. A footer count ("2 more scheduled beyond this week") would close
> the loop from the page's side. Not done; it needs another query in
> `getLineup`.

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 85f2386..HEAD -- lib/scheduling.ts lib/lineup.ts lib/scheduling.test.ts
> ```
>
> If any of those changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `advisor-plans/018-never-schedule-into-the-past.md` — both
  edit the candidate filter in `lib/scheduling.ts`. Land 018 first or the two
  changes collide on the same lines.
- **Category**: bug
- **Planned at**: commit `85f2386`, 2026-08-05

## Why this matters

Approving a version places it up to **14 days** out. The Lineup renders a
rolling **7-day** window. Everything in days 8–14 is scheduled, real, and will
be published — and is invisible on the only page that exists to answer "what is
going out".

The user-facing sequence, on a channel with one weekly slot:

1. Approve a version. The receipt says "going out Monday 08:00". It is six days
   away, inside the window, and it appears on /lineup. Correct.
2. Approve a second version for the same channel. The next free slot is the
   Monday *after* — thirteen days away. The receipt says "going out Monday
   08:00" again.
3. Open /lineup. The second post is not there. Nothing explains why.

The receipt is telling the truth and the page is telling the truth, and together
they say the post does not exist. This is the same class of failure the branch
was written to remove: a surface asserting something the rest of the product
does not back up.

Two numbers disagree and one of them has to move. This plan moves the horizon
down to the window, because the alternative — showing two weeks — changes what
the Lineup *is*, and `docs/vision.md` is explicit that the rolling week is a
deliberate shape and not a default.

## Current state

Files:

- `lib/scheduling.ts` — `HORIZON_DAYS` (line 38) bounds how far ahead an
  approval will look for a free slot.
- `lib/lineup.ts` — `getLineup` (line 142) builds the page's data. Line 164
  fixes the window at seven days.

The horizon, and the comment that already claims the two agree:

```ts
// lib/scheduling.ts:29-38
 * A version approved on Monday for a channel whose only slot is Sunday should
 * take that Sunday. One approved for a channel whose slot was deleted last
 * month should not silently reappear in three weeks. Two weeks is the span the
 * page shows plus the one after it — far enough that a weekly rhythm always
 * finds its slot, close enough that nothing lands beyond the horizon the person
 * was looking at when they approved it.
 */
const HORIZON_DAYS = 14
```

Note the last clause: *"close enough that nothing lands beyond the horizon the
person was looking at when they approved it."* That is the intent. The code does
not implement it — "the span the page shows plus the one after it" is precisely
the problem, because the page shows one span, not two.

The window it is measured against:

```ts
// lib/lineup.ts:161-166
  // Every hour and every day boundary below is drawn in this zone. Absent or
  // unrecognised falls back to UTC — see resolveTimeZone.
  const zone = resolveTimeZone(user.timezone)

  const days = windowOf(7, now, zone)
```

And how the horizon is consumed:

```ts
// lib/scheduling.ts:141-152
  const weeks = Math.ceil(HORIZON_DAYS / 7)
  const horizon = new Date(now.getTime() + HORIZON_DAYS * 24 * 60 * 60 * 1000)

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

`weeks` is derived from `HORIZON_DAYS`, so changing the constant changes both
how many occurrences are generated and where they are cut off. That is why the
fix is one constant and not two.

The user-visible consequence of tightening it is that `slots-full` becomes
reachable sooner. That message already exists and already names its next step:

```ts
// components/drafts/draft-card.tsx (doneMessage)
  return placement.reason === "no-slot"
    ? `${what} · no slot for this channel yet, so it has no time. Add one on Lineup.`
    : `${what} · every slot for the next two weeks is taken. Add a slot on Lineup, or free one up.`
```

That copy says "two weeks" and will be wrong after this change. Fixing it is
Step 2.

### Conventions to match

Comments in this repo record decisions and their reasons, not mechanics. When
you change `HORIZON_DAYS`, the comment above it must explain that the horizon is
tied to the Lineup's window *by definition* — that a post the page cannot show
is a post the user cannot find — and name `windowOf(7, ...)` in `lib/lineup.ts`
as the number it must track. A future reader changing one must be told to change
the other.

## Commands you will need

| Purpose   | Command                                 | Expected on success |
|-----------|-----------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                      | exit 0, no output   |
| Tests     | `npx vitest run`                        | all pass            |
| Lint      | `npx eslint lib/scheduling.ts components/drafts/draft-card.tsx` | exit 0, no output |
| Build     | `npx next build`                        | exit 0              |

## Scope

**In scope** (the only files you may modify):

- `lib/scheduling.ts`
- `components/drafts/draft-card.tsx` — the `doneMessage` copy only

**Out of scope** (do NOT touch, even though they look related):

- `lib/lineup.ts` — do **not** widen `windowOf(7, ...)` to fourteen days. The
  rolling week is a deliberate product shape with its own reasoning at
  `app/(app)/lineup/page.tsx:21-37`, decided against three prototyped layouts.
  Changing it is a product decision, not a bug fix, and it is not this plan.
- `lib/publish-run.ts` and its window constants — unrelated; that is the
  catch-up window for sending, not the horizon for placing.
- The `Placement` type and its `no-slot` / `slots-full` reasons — the copy
  changes, the contract does not.

## Git workflow

- Branch: `advisor/019-never-schedule-past-the-visible-week`
- Base it on the branch that carries plan 018, or on `main` after 018 has
  landed. If `lib/scheduling.ts` does not contain 018's `> now.getTime()`
  filter, STOP — see STOP conditions.
- One commit, conventional-commits subject with an explanatory body. See
  `git log --format='%s' -5`.
- Do NOT push or open a PR.

## Steps

### Step 1: Tie the horizon to the window the page actually shows

In `lib/scheduling.ts`, change `HORIZON_DAYS` from `14` to `7`.

Rewrite the comment block above it (currently lines 29-37). It must say:

- The horizon is the Lineup's window, by definition — a post placed outside it
  is scheduled, real, and invisible on the one page that answers "what is going
  out".
- The number tracks `windowOf(7, ...)` in `lib/lineup.ts:164`. Name that call
  site so anyone changing one is told to change the other.
- The cost, stated honestly: with a single weekly slot there is now at most one
  free candidate, so `slots-full` arrives sooner. That is the truthful answer —
  there really is no slot the user can see — and the message it produces names
  the fix (add a slot, or free one up).

Delete the old claim about "the span the page shows plus the one after it". It
describes the bug.

Do not touch `weeks` (line 141) — it derives from `HORIZON_DAYS` and follows
automatically.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "HORIZON_DAYS = 7" lib/scheduling.ts` → exactly one match.
- `grep -n "Math.ceil(HORIZON_DAYS / 7)" lib/scheduling.ts` → exactly one match,
  unchanged.

### Step 2: Correct the copy that says "two weeks"

In `components/drafts/draft-card.tsx`, the `doneMessage` function's
`slots-full` branch tells the user "every slot for the next two weeks is taken".
After Step 1 that is false.

Change it to refer to the week, matching what the Lineup shows. Keep the
sentence's shape: what happened, then the one next step. The existing phrasing
`Add a slot on Lineup, or free one up.` is correct and should survive.

**Verify**:

- `grep -n "two weeks" components/drafts/draft-card.tsx` → no matches.
- `npx tsc --noEmit` → exit 0, no output.

### Step 3: Check for the same claim anywhere else

The "two weeks" horizon may be described in more than one place.

```bash
grep -rn "two weeks\|14 days\|fourteen days" lib components app --include="*.ts" --include="*.tsx" | grep -v node_modules
```

Every hit that describes the placement horizon must be corrected. Hits that
describe something else — there is an unrelated window in `lib/publish-run.ts`
— must be left alone. If a hit is ambiguous, STOP and report it rather than
guessing.

**Verify**: the grep above returns no hit that refers to slot placement.

### Step 4: Confirm nothing else regressed

**Verify**:

- `npx vitest run` → all pass, count unchanged from before this plan (this
  change alters a constant, not behaviour the unit tests pin).
- `npx eslint lib/scheduling.ts components/drafts/draft-card.tsx` → exit 0.
- `npx next build` → exit 0.
- `git status --short` → only the two in-scope files are modified.

## Test plan

No new unit tests. The changed value is a constant consumed by `nextFreeSlot`,
which reads the database and is covered by `scripts/verify-publish-run.ts`
rather than by vitest.

**Re-run that script if a database is available**:

```bash
npx tsx --env-file=.env.local scripts/verify-publish-run.ts
```

Expect **0 FAIL**. One assertion in it is directly load-bearing here — the block
titled "a slot gives it a time, and a second approval takes the next one"
asserts that a second approval lands exactly seven days after the first. With
`HORIZON_DAYS = 7` that second candidate is now **outside** the horizon, so this
assertion will change meaning: the second approval should return `slots-full`
instead.

**Update that assertion** to expect `slots-full`, and say in a comment why: with
the horizon equal to the visible week, one weekly slot holds one post at a time,
and the honest answer to a second approval is that there is nowhere visible to
put it. If the script is not runnable because no `.env.local` exists, note that
in your report — do not skip the edit.

That makes `scripts/verify-publish-run.ts` a third in-scope file. It is the only
addition to Scope permitted by this plan.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0 with no output
- [ ] `npx vitest run` exits 0
- [ ] `npx eslint lib/scheduling.ts components/drafts/draft-card.tsx scripts/verify-publish-run.ts` exits 0
- [ ] `npx next build` exits 0
- [ ] `grep -n "HORIZON_DAYS = 7" lib/scheduling.ts` returns exactly one match
- [ ] `grep -rn "two weeks" components/ lib/` returns no match describing slot placement
- [ ] `grep -n "windowOf" lib/lineup.ts` still shows `windowOf(7, now, zone)` — the read window was not touched
- [ ] `git diff --name-only` lists at most `lib/scheduling.ts`,
      `components/drafts/draft-card.tsx`, `scripts/verify-publish-run.ts`
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/scheduling.ts` does not contain plan 018's lower-bound filter
  (`c.at.getTime() > now.getTime()`). This plan assumes 018 landed; applying it
  first produces a conflict and a horizon reasoned against the wrong baseline.
- The excerpts in "Current state" do not match the live code.
- Step 3's grep finds a "two weeks" claim you cannot confidently attribute to
  either the placement horizon or the publish catch-up window.
- Any vitest test fails. Nothing in the unit suite should depend on this
  constant; if something does, that dependency is worth reporting before it is
  edited away.
- You conclude the right fix is to widen the Lineup to fourteen days. That may
  well be the better product answer, but it is a decision for the maintainer and
  it is explicitly out of scope here. Report the argument; do not make the change.

## Maintenance notes

- **These two numbers are now coupled and nothing enforces it.** If anyone
  changes `windowOf(7, ...)` in `lib/lineup.ts`, `HORIZON_DAYS` must move with
  it or this bug returns in the opposite direction. The comment added in Step 1
  is the only thing linking them. A shared exported constant would be stronger
  and is deliberately deferred — it would put a Lineup-rendering concern into
  `lib/scheduling.ts` or force a third module, and the comment is enough while
  there are exactly two call sites.
- A reviewer should confirm `lib/lineup.ts` is untouched.
- Expect `slots-full` to become a more common outcome. If users hit it routinely
  with a sensible number of slots, that is evidence for widening the Lineup
  window rather than for widening the horizon alone — the two must move together.
