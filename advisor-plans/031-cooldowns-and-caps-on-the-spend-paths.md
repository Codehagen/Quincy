# Plan 031: The voice-note cooldown becomes atomic, the riff actions get cooldowns, and the story list gets its cap

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md` — unless a reviewer dispatched you and told
> you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 223a12d..HEAD -- lib/riffs.ts lib/voice.ts lib/usage.ts "app/(app)/riffs/actions.ts" app/api/voice-notes/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW–MED (each step is small; the voice claim changes when a riff row is created)
- **Depends on**: none (plan 030 is a sibling, different files; both add
  guards to spend paths and can land in either order)
- **Category**: security / money
- **Planned at**: commit `223a12d`, 2026-08-12

## Why this matters

`AGENTS.md` ("Money") requires a ceiling and a cooldown on every spending
path, and warns that "a comment explaining why a guard is unnecessary is the
smell this section exists for." Three gaps, all confirmed by reading at
`223a12d`:

1. **The voice-note cooldown is a read followed by an act.** N concurrent
   POSTs to `/api/voice-notes` all observe "no recent riff", all pass, and
   each buys an R2 upload, a paid transcription, and model calls — the
   highest per-unit cost in the product. The guarding comment reasons only
   about crash-safety, not concurrency.
2. **Two riff actions spend on every press.** `askForChannelAngle`'s
   "found nothing" branch writes no row, so the gap stays open and the
   button is immediately pressable again. `adaptPostToRiff` deduplicates
   only when the pasted text carries a URL; pasted plain text spends on
   every press.
3. **`compileVoice` caps rules and not stories.** `rules` gets
   `.slice(0, RULE_CAP)` under the comment "The model's claims are bounded
   by code, not by the prompt"; the `stories` loop three lines later is
   unbounded, and each story writes ~4 sequential Neon rows and lands
   permanently in every future chat prompt via the brain's story index.

## Current state

- The read-then-act cooldown:

```ts
// lib/riffs.ts:1125-1146 (abridged; doc comment above it reasons about
// crash-safety only)
export async function voiceNoteCooldown(userId, cooldownMs) {
  const [recent] = await db
    .select({ createdAt: riff.createdAt })
    .from(riff)
    .where(and(eq(riff.userId, userId), eq(riff.sourceId, VOICE_SOURCE.id)))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  if (!recent) return { ready: true }
  const elapsed = Date.now() - recent.createdAt.getTime()
  if (elapsed >= cooldownMs) return { ready: true }
  return { ready: false, secondsLeft: ... }
}
```

- The route calls it at `app/api/voice-notes/route.ts:107-118` (before
  buffering — keep that), and the first row that could block a second caller
  is only written much later by `startVoiceRiff` (route line ~185), after
  the upload. `startVoiceRiff` (`lib/riffs.ts:788-790`) delegates to
  `startSpokenRiff(userId, VOICE_SOURCE)`, which inserts the `riff` row.
  `VOICE_SOURCE.id` distinguishes voice riffs; the `riff` table
  (`lib/schema-app.ts:922`) has `userId`, `sourceId`, `createdAt`.
- The atomic pattern this repo already uses twice: a single conditional
  statement that both tests and takes the claim — `lib/rhythm-run.ts`'s
  `claim()` (conditional UPDATE, line ~418 context) and `lib/corpus-x.ts`'s
  `lastImportAt` cooldown claim.
- The unbounded story loop:

```ts
// lib/voice.ts:307-313 — rules ARE bounded:
const rules = extraction.rules
  .map((r) => r.trim())
  .filter(Boolean)
  .slice(0, RULE_CAP)
...
// lib/voice.ts:347 — stories are NOT:
for (const story of extraction.stories) {
  if (!story.point.trim()) continue
```

  Note: JSON-schema `minItems`/`maxItems` are unusable through the Gateway
  (recorded at `lib/meetings.ts:305`), so the bound must be in code — which
  is exactly how `RULE_CAP` is done.

- `askForChannelAngle` (`app/(app)/riffs/actions.ts`, ~line 455 onward):
  re-checks the gap and shapes (both free), checks entitlement, calls
  `generateChannelAngle`, meters via `recordUsage` with `ADAPT_MODEL`
  "before the result is judged", then `if (!angle) return { ok: true,
  found: false }` — writing nothing.
- `adaptPostToRiff` (same file, lines 583-645): session check → entitlement
  check → `createRiffFromPost`. Dedup happens only for URL-carrying sources
  (`lib/riffs.ts:632-649`, "A pasted post with no URL is not deduplicated").
- Every generation on these paths records a `usage_event` row whether or not
  a result was kept (that was plan 022/026 territory; the metering is the
  reliable attempt log). `usage_event` columns: `userId`, `model`,
  `createdAt` (`lib/schema-app.ts:229` area). `ADAPT_MODEL` is the model
  label recorded for both actions.
- Cooldown result copy exemplar: `lib/rhythm-run.ts` returns
  `"This ran moments ago. Try again in N minutes."`; the voice route returns
  `"Give Quincy a moment — Ns before the next one."` with status 429.
- Test conventions: vitest with `vi.mock("@/lib/db")` where needed —
  `lib/entitlement.test.ts:24-31` is the exemplar mock shape.

## Commands you will need

| Purpose   | Command          | Expected on success |
|-----------|------------------|---------------------|
| Typecheck | `pnpm typecheck` | exit 0              |
| Tests     | `pnpm test`      | all pass, incl. new |
| Lint      | `pnpm lint`      | exit 0              |

## Scope

**In scope** (the only files you should modify or create):
- `lib/riffs.ts` (make the voice claim atomic)
- `lib/voice.ts` (STORY_CAP)
- `lib/voice.test.ts` (extend — file exists)
- `lib/usage.ts` (add `spendCooldown` — additive only)
- `app/(app)/riffs/actions.ts` (call the cooldown in two actions)
- `app/api/voice-notes/route.ts` (handle the claim result)

**Out of scope** (do NOT touch):
- `lib/schema-app.ts` — no schema change; the design below avoids one.
- `workflows/run-voice-riff.ts` and `completeSpokenRiff` — the pipeline
  after the claim is unchanged.
- `draftAngle` in the riffs actions — already idempotent on
  `(userId, riffHook)`; adding a cooldown there would break legitimate
  parallel drafting of different angles.
- The pre-buffer advisory check at `app/api/voice-notes/route.ts:107` —
  keep it; it refuses cheaply before bytes are read. This plan adds the
  atomic gate later in the flow, it does not replace the early one.
- `lib/meetings.ts`, `lib/shipped-work.ts` — their selection passes have
  different cost profiles; folding them in is scope creep.

## Git workflow

- Branch: `advisor/031-cooldowns-and-caps-on-the-spend-paths`
- Commit per step. Message style: single evocative sentence.
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Make the voice-riff claim atomic in `startSpokenRiff`'s voice path

Add a `claimVoiceRiff(userId, cooldownMs)` function to `lib/riffs.ts` that
creates the voice riff row **only if** no voice riff newer than `cooldownMs`
exists — one statement, so two concurrent requests cannot both pass:

```ts
// Shape: INSERT ... SELECT ... WHERE NOT EXISTS, via db.execute(sql`...`)
// or drizzle's insert().select() if the installed version supports it.
// Pseudocode of the one statement:
INSERT INTO riff (id, user_id, scrap, source_id, source_label, state, started_at)
SELECT ${newRiffId()}, ${userId}, '', ${VOICE_SOURCE.id}, ${VOICE_SOURCE.label},
       'working', now()
WHERE NOT EXISTS (
  SELECT 1 FROM riff
  WHERE user_id = ${userId}
    AND source_id = ${VOICE_SOURCE.id}
    AND created_at > now() - make_interval(secs => ${cooldownMs / 1000})
)
RETURNING id
```

Return `{ ok: true, riffId }` when a row came back, `{ ok: false }` when the
claim lost. Match the column defaults `startSpokenRiff` currently sets —
**read `startSpokenRiff` and the `riff` schema first** and mirror every
column it populates, so a claimed row is indistinguishable from one the old
path created.

Then change `app/api/voice-notes/route.ts` to call `claimVoiceRiff` where it
currently calls `startVoiceRiff` (after the upload, before the workflow
start), and answer the lost-claim case with the existing 429 shape:
`{ error: "Give Quincy a moment — another recording just landed." }`.

Keep the early `voiceNoteCooldown` check at line 107 exactly as it is, and
add one line to its doc comment: it is the cheap early refusal; the atomic
claim at riff creation is the guard.

`startVoiceRiff` keeps working for any other caller — check with
`grep -rn "startVoiceRiff" app lib workflows scripts` and report if a second
caller exists (STOP condition if it does and its semantics are unclear).

**Verify**: `pnpm typecheck` → exit 0.
**Verify**: `grep -n "claimVoiceRiff" lib/riffs.ts app/api/voice-notes/route.ts` → definition + one call site.

### Step 2: Cap the stories beside the rules

In `lib/voice.ts`, add `const STORY_CAP = 12` next to `RULE_CAP` (match
`RULE_CAP`'s comment style — one line on why: each story is ~4 Neon writes
and a permanent line in every chat prompt's story index). Apply it:

```ts
for (const story of extraction.stories.slice(0, STORY_CAP)) {
```

If `RULE_CAP` has a different value-setting convention (env, constant), copy
it. Extend `lib/voice.test.ts` with one case: an extraction carrying
`STORY_CAP + 5` stories results in exactly `STORY_CAP` processed (assert via
whatever seam the existing tests use — read the file's current mock shape
first and follow it).

**Verify**: `pnpm test lib/voice` → passes, including the new case.

### Step 3: Add `spendCooldown` to `lib/usage.ts`

Additive export, reading the attempt log that already exists (`usage_event`
records every generation, kept or not):

```ts
/**
 * Has this user triggered a generation on any of these models inside the
 * window? The metering row is the attempt log — written whether or not the
 * result was kept, which is exactly what a cooldown must count (a "found
 * nothing" answer still spent).
 *
 * Read-then-act, deliberately: two presses landing inside one round trip
 * both pass, which bounds the race at 2 where there was no bound at all.
 * The voice path gets the truly atomic claim because its per-unit cost is
 * an order of magnitude higher; these are button-presses on cheap calls.
 */
export async function spendCooldown(
  userId: string,
  models: string[],
  cooldownMs: number
): Promise<{ ready: true } | { ready: false; secondsLeft: number }>
```

Implementation: newest `usageEvent.createdAt` for `userId` with
`inArray(usageEvent.model, models)`, same shape as `voiceNoteCooldown`.

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Call it in the two actions

In `app/(app)/riffs/actions.ts`, in `askForChannelAngle` and
`adaptPostToRiff`, after the entitlement check and before any model call:

```ts
const cooldown = await spendCooldown(session.user.id, [ADAPT_MODEL], 15_000)
if (!cooldown.ready) {
  return {
    ok: false,
    message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
  }
}
```

15 seconds: long enough to stop a held-down button or a loop, short enough
that no honest workflow notices. Both actions already return
`{ ok: false, message }` shapes the UI renders — confirm each action's
result type includes `message` on the failure arm (they do at `223a12d`).

Note the deliberate consequence and record it in a one-line comment: the
cooldown is shared across the adapt-model family, so a `draftAngle` press
can hold these two buttons for 15s. That is acceptable — they spend from
the same budget.

**Verify**: `pnpm typecheck` → exit 0. `pnpm test` → all pass.
**Verify**: `grep -c "spendCooldown" "app/(app)/riffs/actions.ts"` → 2.

### Step 5: Prove the claim excludes a concurrent double

Add a test for the atomic claim. Database-free: mock `@/lib/db` following
`lib/entitlement.test.ts:24-31`, have the mocked execute/insert return one
row on first call and zero rows on second, and assert `claimVoiceRiff`
returns `ok: true` then `ok: false`. This pins the *contract* (row count
decides), which is what a regression would break — Postgres supplies the
atomicity itself.

Place it in `lib/riffs.test.ts` (exists; read its current structure and
extend rather than restructure).

**Verify**: `pnpm test lib/riffs` → passes, including the two new
assertions.

## Test plan

- `lib/voice.test.ts`: the STORY_CAP boundary case (Step 2).
- `lib/riffs.test.ts`: claim-wins / claim-loses pair (Step 5).
- `lib/usage.ts`'s `spendCooldown`: covered through the mocked-db pattern
  only if cheap; otherwise its logic is the same read as
  `voiceNoteCooldown` and the action-level greps stand in. Do not build a
  live-database test.
- Full suite green: `pnpm test`.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` all exit 0
- [ ] `grep -n "STORY_CAP" lib/voice.ts` → constant + one use in the loop
- [ ] `grep -n "claimVoiceRiff" app/api/voice-notes/route.ts` → 1 call site; the old direct `startVoiceRiff` call there is gone
- [ ] `grep -c "spendCooldown" "app/(app)/riffs/actions.ts"` → 2
- [ ] New tests exist and pass (Steps 2 and 5)
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- `startVoiceRiff` has callers other than `app/api/voice-notes/route.ts`
  whose cooldown semantics are unclear (Step 1's grep).
- The installed drizzle-orm version cannot express the conditional
  insert-select and `db.execute(sql\`...\`)` also fails typecheck — report
  rather than falling back to a read-then-insert, which would rebuild the
  race this plan exists to close.
- `askForChannelAngle` or `adaptPostToRiff` no longer match the described
  control flow (entitlement check position, result shapes).
- Any step seems to need a schema change or a new table. The design avoids
  one on purpose; a schema change means the plan's premise drifted.

## Maintenance notes

- The riff row a lost upload leaves behind stays `working` — the same
  stuck-state story the route already documents for a failed workflow
  start (`app/api/voice-notes/route.ts:197` area). No new state.
- If a future change makes `usage_event` metering conditional (only on
  success), `spendCooldown` silently stops counting failed attempts — the
  exact case it exists for. Reviewers should treat "stop metering failures"
  and "cooldowns" as one system (plans 022/026 in `advisor-plans/` are the
  metering record).
- `lib/meetings.ts` and `lib/shipped-work.ts` selection passes are webhook-
  triggered (not human-triggered), so the cooldown rule applies differently;
  they were deliberately left out. If a manual re-run button ever appears
  for either, it needs `spendCooldown` from day one.
- STORY_CAP interacts with `lib/brain.ts`'s unbounded memory-page growth
  (a recorded separate finding); capping stories bounds one inflow, not the
  page itself.
