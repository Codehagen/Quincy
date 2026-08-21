# Plan 020: Stop the publish sweep before Vercel kills it mid-post

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat 85f2386..HEAD -- lib/publish-run.ts app/api/cron/publish/route.ts lib/publish-run.test.ts
> ```
>
> If any of those changed since this plan was written, compare the "Current
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

The publish sweep claims a row into the `sending` state *before* calling the
platform, and nothing ever moves it out of `sending` automatically. That is
deliberate and correct: a publish whose outcome is unknown must never be
retried, because a retry double-posts.

The consequence is that **every row left in `sending` requires a human**. So the
sweep must never abandon a row it has claimed — and today it can, on every run
that overruns.

The loop takes up to `MAX_ROWS_PER_RUN = 100` rows and has no elapsed-time
check. The route is capped at `maxDuration = 300` seconds. Per row the worst
case is roughly:

- a token refresh inside `getAccessToken` — one fetch, `PLATFORM_TIMEOUT_MS`
  (10s, `lib/channels.ts:36`)
- the publish itself — for LinkedIn, `/rest/posts` and then the `/v2/ugcPosts`
  fallback, two fetches, 10s each

That is about 30 seconds. Ten slow rows exhaust the 300-second budget. When
Vercel terminates the function, the row **currently in flight has already been
claimed** and its result was never recorded. It sits in `sending` forever, and
somebody has to open the database to find out whether that post went out.

So the failure mode is: one stranded post per overrunning run, silently, and the
only signal is a `unresolved` count in a cron response nobody reads. The cap of
100 was written against the shape of `lib/channels-maintenance.ts`, which does
one cheap request per row and whose skipped work simply waits for tomorrow. That
reasoning does not transfer.

This plan does not make the sweep faster. It makes it **stop claiming new work
when there is not enough time left to finish it**, so a run ends between rows
instead of inside one.

## Current state

Files:

- `lib/publish-run.ts` — the sweep. `MAX_ROWS_PER_RUN` at line 64, the loop near
  the end of `runScheduledPublish`.
- `app/api/cron/publish/route.ts` — `maxDuration = 300` at line 25; builds the
  JSON response and decides `degraded`.
- `lib/channels.ts:36` — `PLATFORM_TIMEOUT_MS = 10_000`, the per-fetch bound.

The cap and its (inapplicable) reasoning:

```ts
// lib/publish-run.ts:55-64
/**
 * The most rows one run will take.
 *
 * Same reasoning as MAX_ROWS_PER_RUN in lib/channels-maintenance.ts, with a
 * smaller number: each row here is an OAuth call plus a publish call rather
 * than one heartbeat, and unlike that sweep, work skipped by this one expires.
 * A truncated run is not "we will get them tomorrow" — it is posts that will
 * miss their window while the queue in front of them is served.
 */
const MAX_ROWS_PER_RUN = 100
```

The loop, with no deadline check:

```ts
// lib/publish-run.ts, inside runScheduledPublish
  for (const row of batch) {
    try {
      const result = await attempt(row, cutoff, deps)
      outcomes[result.outcome] += 1
    } catch (cause) {
      failed += 1
      console.error(`[publish] ${row.postId} attempt threw:`, cause)
    }
  }
```

The run summary type it must extend:

```ts
// lib/publish-run.ts
export type PublishRun = {
  due: number
  truncated: boolean
  outcomes: Record<PublishOutcome, number>
  failed: number
}
```

`truncated` currently means only "the query found more rows than the cap". After
this plan there is a second, different reason a run can end early, and the two
must be distinguishable in the response or an operator cannot tell a deep queue
from a slow platform.

How the route reads the result:

```ts
// app/api/cron/publish/route.ts
  const degraded = run.failed > 0 || run.truncated || run.outcomes.missed > 0

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, unresolved, ...run },
    { status: degraded ? 500 : 200 }
  )
```

### Conventions to match

`lib/publish-run.ts` and `lib/channels-maintenance.ts` both put every judgment in
the library and leave the route thin — keep that split. Constants carry a
comment explaining the number's derivation, not just its value; see
`CATCH_UP_MS` at `lib/publish-run.ts:33-53` for the density expected. Counters
returned from a run are named for what an operator would ask, not for the
mechanism.

Unit tests here are pure and use a fixed clock — see `lib/publish-run.test.ts`,
which imports `windowFor` and `isMissed` and never touches a database.

## Commands you will need

| Purpose   | Command                                    | Expected on success |
|-----------|--------------------------------------------|---------------------|
| Typecheck | `npx tsc --noEmit`                         | exit 0, no output   |
| Tests     | `npx vitest run lib/publish-run.test.ts`   | all pass            |
| Full tests| `npx vitest run`                           | all pass            |
| Lint      | `npx eslint lib/publish-run.ts app/api/cron/publish/route.ts lib/publish-run.test.ts` | exit 0, no output |
| Build     | `npx next build`                           | exit 0              |

## Scope

**In scope** (the only files you may modify):

- `lib/publish-run.ts`
- `app/api/cron/publish/route.ts`
- `lib/publish-run.test.ts`

**Out of scope** (do NOT touch, even though they look related):

- `lib/publish.ts` — the publisher itself. Its timeouts are correct and its
  two-endpoint LinkedIn fallback is deliberate (`lib/publish.ts`, the comment
  above `publishToLinkedIn`). Do not remove the fallback to save time; it is
  answering a question that has not been answered yet.
- `lib/channels.ts` — `PLATFORM_TIMEOUT_MS` is shared with the daily channel
  sweep. Lowering it to fit this budget would change that sweep's behaviour too.
- `lib/channels-maintenance.ts` — has the same unbounded-loop shape, but its
  skipped work waits for tomorrow rather than expiring. Out of scope; note it in
  your report if you like.
- `vercel.json` — do not change the cron schedule. Five minutes is reasoned
  against `CATCH_UP_MS` in `app/api/cron/publish/route.ts`.
- The claim-before-publish ordering in `claim()`. It is the safety property this
  plan protects, not something to relax.

## Git workflow

- Branch: `advisor/020-stop-the-sweep-before-vercel-kills-it`
- One commit, conventional-commits subject with an explanatory body. See
  `git log --format='%s' -5`.
- Do NOT push or open a PR.

## Steps

### Step 1: Add a per-row time budget and a deadline

In `lib/publish-run.ts`, add two constants next to `MAX_ROWS_PER_RUN`, each with
a comment deriving its value:

- `WORST_CASE_ROW_MS` — the slowest a single row can plausibly take. Derive it
  in the comment from `PLATFORM_TIMEOUT_MS` (10s, `lib/channels.ts:36`): one
  token refresh plus LinkedIn's two-endpoint attempt is three bounded fetches,
  so `3 * PLATFORM_TIMEOUT_MS` is the honest ceiling. Import
  `PLATFORM_TIMEOUT_MS` from `./channels` — it is already exported and this file
  already imports `isChannelEnabled` from there — and express the constant in
  terms of it rather than hard-coding 30000, so the two cannot drift.
- `RUN_BUDGET_MS` — how long the sweep may keep starting new rows. The route's
  `maxDuration` is 300 seconds; leave headroom for the query, the
  `countUnresolved` call and the response. Use `240_000` and say why in the
  comment: the run must stop *starting* work with enough margin that the row in
  flight can finish inside what remains.

Also lower `MAX_ROWS_PER_RUN` and rewrite its comment. The current number came
from `lib/channels-maintenance.ts`, whose reasoning does not apply. Derive the
new one instead: `Math.floor(RUN_BUDGET_MS / WORST_CASE_ROW_MS)` is the most
rows that can be *guaranteed* to finish. Keep it a named constant computed from
the two above, so changing a timeout moves the cap automatically.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "PLATFORM_TIMEOUT_MS" lib/publish-run.ts` → at least one match, in
  the constant derivation.

### Step 2: Stop the loop when the budget is spent

Change the loop in `runScheduledPublish` so that **before each row** it checks
whether there is time to finish that row, and breaks if not.

Required shape:

- Record the run's start instant before the loop. Use `Date.now()`, not `now` —
  `now` is an injectable parameter used for window arithmetic and tests pass a
  fixed value; using it here would make the deadline meaningless under test.
- Before calling `attempt`, break out of the loop if
  `Date.now() - startedAt > RUN_BUDGET_MS`.
- Count how many rows were left unstarted, and log it with `console.error` in
  the style of the existing `truncated` warning — loudly, naming the
  consequence: those posts are still queued, their windows are still closing,
  and the next run has five minutes to get to them.

The check must be **before** `attempt`, never inside it and never after. A check
placed after the claim would strand exactly the row it was added to protect.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "RUN_BUDGET_MS" lib/publish-run.ts` → at least two matches (the
  declaration and the loop check).

### Step 3: Report running out of time separately from a deep queue

Add a field to `PublishRun` for rows the run declined to start because the
budget ran out — for example `deferred: number`. Do **not** fold it into
`truncated`. They mean different things and demand different responses:
`truncated` says the queue is deeper than the cap; the new field says the
platform was slow enough that the sweep ran out of clock. An operator seeing one
number cannot tell which.

In `app/api/cron/publish/route.ts`, include the new field in the `degraded`
condition alongside `run.truncated`. A run that could not finish its due work is
not a success, and the status code is the only thing cron monitoring sees.

**Verify**:

- `npx tsc --noEmit` → exit 0, no output.
- `grep -n "deferred" app/api/cron/publish/route.ts` → at least one match.

### Step 4: Pin the budget arithmetic

Add tests to `lib/publish-run.test.ts` covering the derivation, not the loop
(the loop reads the database and is covered by
`scripts/verify-publish-run.ts`).

To make the arithmetic testable, export the derived cap and the worst-case
figure from `lib/publish-run.ts`, following how `windowFor` and `isMissed` are
already exported "for lib/publish-run.test.ts". Add tests asserting:

1. The row cap times the worst-case row duration does not exceed `RUN_BUDGET_MS`
   — the property that makes the cap honest.
2. `RUN_BUDGET_MS` is strictly less than the route's 300-second `maxDuration`,
   with a comment naming `app/api/cron/publish/route.ts` as the other half of
   the pair.
3. The worst-case row duration is at least `3 * PLATFORM_TIMEOUT_MS`, so
   lowering it below what one LinkedIn attempt can cost fails the suite.

Follow the existing file's style: a `describe` per concern, comments carrying
the reason.

**Verify**: `npx vitest run lib/publish-run.test.ts` → all pass, with at least 3
more tests than before.

### Step 5: Confirm nothing else regressed

**Verify**:

- `npx vitest run` → all pass; at least 96 + the tests you added. 96 is the
  suite size at `85f2386`.
- `npx eslint lib/publish-run.ts app/api/cron/publish/route.ts lib/publish-run.test.ts`
  → exit 0, no output.
- `npx next build` → exit 0.
- If a database is available:
  `npx tsx --env-file=.env.local scripts/verify-publish-run.ts` → **0 FAIL**.
  The new cap is far above anything that script queues, so its outcomes must be
  unchanged. If any assertion fails, STOP — the budget check is firing when it
  should not.
- `git status --short` → only the three in-scope files modified.

## Test plan

- **File**: `lib/publish-run.test.ts` (existing).
- **Structural pattern**: the existing `describe("windowFor")` and
  `describe("isMissed")` blocks in the same file — pure functions, fixed
  constants, no database.
- **New cases**: the three in Step 4 — cap × worst-case fits the budget, budget
  is under `maxDuration`, worst-case covers a full LinkedIn attempt.
- **Regression this pins**: a future change that raises the row cap or lowers
  the assumed row cost without moving the budget fails the suite instead of
  silently reintroducing stranded posts.

## Done criteria

ALL must hold:

- [ ] `npx tsc --noEmit` exits 0 with no output
- [ ] `npx vitest run` exits 0; total test count is at least 99
- [ ] `npx eslint lib/publish-run.ts app/api/cron/publish/route.ts lib/publish-run.test.ts` exits 0
- [ ] `npx next build` exits 0
- [ ] `grep -n "MAX_ROWS_PER_RUN = 100" lib/publish-run.ts` returns **no** match
- [ ] `grep -n "RUN_BUDGET_MS" lib/publish-run.ts` returns at least two matches
- [ ] The budget check appears **before** the `attempt(` call in the loop —
      confirm by reading the loop, and state in your report that you did
- [ ] `grep -rn "claim(" lib/publish-run.ts` shows `claim` still called inside
      `attempt` before `deps.send`, unchanged
- [ ] `git diff --name-only` lists only the three in-scope files
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- Making the budget testable appears to require restructuring
  `runScheduledPublish` beyond exporting constants. Exporting two numbers is the
  whole intent; a refactor of the sweep is not.
- `scripts/verify-publish-run.ts` fails any assertion after your change.
- You conclude the right fix is to run rows concurrently instead of
  sequentially. It may be, eventually — but sequential is deliberate
  (`lib/publish-run.ts`, the comment above the loop: several posts from one
  account in the same instant is what a compromised account looks like). Report
  the argument; do not make the change.
- You find that `getAccessToken` can issue more than one bounded fetch, making
  `3 * PLATFORM_TIMEOUT_MS` an underestimate. Report the real count rather than
  guessing a bigger multiplier.

## Maintenance notes

- **This does not eliminate stranded rows, it bounds them.** A process killed by
  an unhandled crash, an OOM, or a platform hang that outlasts its own
  `AbortSignal` still leaves a claimed row in `sending`. That is by design — the
  alternative is retrying a publish whose outcome is unknown. What is still
  missing is a way for a human to *find* those rows without opening the
  database; `countUnresolved()` exists and is only surfaced in the cron's JSON.
  Deliberately deferred: it is a product surface, not a bug fix.
- If `PLATFORM_TIMEOUT_MS` changes in `lib/channels.ts`, the derived cap here
  moves with it automatically — that is why Step 1 requires importing it rather
  than hard-coding 30 seconds. A reviewer should check that the import is
  present and the constant really is derived.
- If the LinkedIn endpoint question is ever settled (see the comment above
  `publishToLinkedIn` in `lib/publish.ts`), one of the two attempts disappears
  and the worst case drops to `2 * PLATFORM_TIMEOUT_MS`, which roughly halves
  the cost per row. Revisit the constants then.
- A reviewer should scrutinise exactly one thing: that the deadline check sits
  before the claim, not after it.
