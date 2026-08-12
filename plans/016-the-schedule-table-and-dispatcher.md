# Plan 016: The schedule table and the dispatcher — make a rhythm something you can switch on

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**:
>
> ```bash
> git diff --stat dfff01e..HEAD -- lib/rhythms.ts lib/schema-app.ts lib/heartbeat.ts \
>   lib/timezone.ts lib/slots.ts lib/corpus-x.ts lib/voice.ts vercel.json \
>   "app/(app)/rhythm/page.tsx" components/rhythm/rhythm-grid.tsx
> ```
>
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1 — `/rhythm` is a catalogue of twenty-five promises with one
  switch that works and twenty-four that are painted on. Every future rhythm
  is blocked behind this.
- **Effort**: L
- **Risk**: MED — introduces a cross-user cron that spends money on a
  schedule the user chose, with no human present when it fires.
- **Depends on**: plans 010 (slots, `scheduled_post`, the sweep), 011–014
  (corpus + voice compile)
- **Category**: feature
- **Planned at**: commit `dfff01e`, 2026-08-08

## Why this matters

`components/rhythm/rhythm-grid.tsx:121` renders every rhythm's switch as
`<Switch checked={live} disabled>`. `lib/rhythms.ts` carries twenty-five
entries and exactly one — `heartbeat`, line 384 — has `available: true`. The
page's own doc comment is honest about it: "a catalogue you can read beats a
page that pretends the product is smaller than the plan, and a control that
does nothing is worse than no control."

That was the right call while there was no machinery. It is now the thing
holding the product back. `lib/rhythm-search-params.ts` already ships a
`status` filter with `live` and `paused` values that nothing can ever be, and
`docs/vision.md` puts Rhythm on the surface table as "what Quincy does on its
own" — which today means one weekly maintenance job nobody chose.

The gap is not the rhythms. It is that there is nowhere to record **"this
user wants this rhythm, at this hour"**, and nothing that wakes up and acts
on it.

## What Stanley does, and what we take from it

Read from their client bundle on 2026-08-08 (`/assets/_app.schedules-B0dS-SQy.js`,
`/assets/schedules-B7zkMNWI.js`) and their route loader data. Recorded because
two of their decisions are right and one is wrong, and it is cheaper to say
which than to rediscover it.

**Right, and we already do it**: the catalogue is static in the client bundle
— twenty-four entries with `scheduleKey`, `title`, `cardDescription`, `timing`
and a `presentation` block. A database row exists only once a ritual is
switched on; a fresh tenant loads `schedules: []`. That is exactly
`lib/rhythms.ts` plus a subscription table, which is what this plan builds.

**Right, and worth copying**: one manual-fire affordance per ritual
(`action: "fire"`), and a run history polled per ritual
(`action: "get_runs"`). A rhythm you cannot test by hand is a rhythm nobody
turns on.

**Wrong, and we should not follow**: their `timing` is a raw cron string
(`0 14 * * *` for Bookmarks to Posts) and the tenant config carries
`timezone: "UTC"`. So a 2:00 PM ritual is 2:00 PM UTC for everyone, and a user
in Oslo gets it at 16:00. `lib/timezone.ts`'s own header records us making
precisely this mistake once already — an 08:00 slot stored as 08:00 UTC,
"right on screen, two hours wrong in the world". We store a wall clock and a
zone, never a cron string. See decision 1.

Also noted, not copied: their "New Ritual" button prefills the chat composer
with `"Hey Stanley, let's do a ritual when you "` — custom rituals are
authored conversationally against the same agent. Interesting, and explicitly
out of scope here.

## Current state

`lib/rhythms.ts` — the catalogue type. Nothing in it can express user state:

```ts
export type Rhythm = {
  id: string
  name: string
  promise: string
  how: string
  family: Family
  trigger: Trigger
  from: Node[]
  makes: Makes
  to: Node[]
  /** False until the machinery behind it exists. Renders inert, never fake. */
  available: boolean
}
```

`vercel.json` — three crons, all system-wide, none user-scheduled:

```json
"crons": [
  { "path": "/api/cron/heartbeat", "schedule": "17 22 * * 1" },
  { "path": "/api/cron/channels",  "schedule": "0 6 * * *" },
  { "path": "/api/cron/publish",   "schedule": "*/5 * * * *" }
]
```

`app/(app)/rhythm/page.tsx` reads `getHeartbeatRuns(session.user.id, 1)` and
passes one `lastRun` string to the grid, which shows it only when
`rhythm.available`. Every other card renders `"soon"`.

## Design decisions

These are the load-bearing ones. An executor who disagrees should stop, not
improvise.

### 1. A wall clock and a zone, never a cron string

A subscription stores `hour`, `minute` and `weekday` (null = every day), and
the dispatcher resolves them against `user.timezone` through `lib/timezone.ts`.

Three reasons, in order of weight. `lib/timezone.ts:8-19` records the exact
bug a cron string reintroduces. `slot` already models "Monday 08:00" this way,
and two schedule representations in one product is one too many. And a cron
string cannot survive a timezone change at all, whereas a wall clock is
*defined* relative to whatever zone the user is in now.

### 2. A row exists only when the rhythm is switched on

The catalogue stays in `lib/rhythms.ts`. `rhythm_subscription` holds one row
per (user, rhythm) that has been enabled, and enabling is what creates it.

This is what `available: false` already means and it keeps the catalogue
editable without a migration. It also means the due query never scans rows
for rhythms nobody wants.

### 3. `next_run_at` is denormalised, `timestamptz`, and indexed

The dispatcher's query is `WHERE next_run_at <= now()` across all users, which
is a single index scan — the same shape as `scheduled_post_due_idx`
(`lib/schema-app.ts:468`) and for the same reason.

`timestamptz` for the same reason `scheduled_post.scheduled_for` is: this is a
column something other than Drizzle compares against `now()`.

The cost is that it must be recomputed whenever any input changes: after each
run, when the user edits the time, when the user changes timezone. That last
one is the trap — `advisor-plans/005` already established that a captured
timezone must take effect immediately rather than on some later cycle. Step 6
covers it.

### 4. Recovery fires once, not once per missed period

Because `next_run_at` is recomputed *forward from now* after every run,
a dispatcher that has been down for a week wakes up and fires each
subscription exactly once, not seven times. That safety is structural rather
than a rule anyone has to remember.

On top of it: if a row is more than `MAX_LATENESS_MS` (6 hours) late, the
dispatcher skips the work, records a `missed` run and advances the cursor. The
reasoning is `lib/publish-run.ts`'s `CATCH_UP_MS` argument at lower stakes —
nothing here goes public, so six hours rather than two, but a "morning brief"
delivered at 23:00 is still not the thing anybody switched on.

### 5. Claim before running

Vercel crons overlap: a run that takes longer than the interval will be
running when the next tick starts. `running_since` plus a conditional update is
the claim:

```sql
UPDATE rhythm_subscription SET running_since = now()
WHERE id = $1 AND running_since IS NULL
RETURNING *
```

A row whose `running_since` is older than `STALE_CLAIM_MS` (15 minutes) is
reclaimable — unlike `scheduled_post`, an abandoned rhythm is safe to retry
because no rhythm in this plan puts text on the internet. **If that stops being
true, this rule has to change with it**, and the handler that breaks it is the
one that must carry the argument.

### 6. An unentitled user advances the cursor; heartbeat's user does not

`lib/heartbeat.ts:270` deliberately leaves the watermark unmoved for an
unentitled user, so a backlog survives until they pay. A rhythm is the
opposite: there is no backlog to preserve, and a row that stays due is re-read
on every tick forever. So the dispatcher advances `next_run_at` and records a
`skipped` run with the reason.

The entitlement check is `resolveEntitlement` — the **pure** resolver from
`lib/entitlement.ts`, never `resolveEntitlementForRequest`. Plan 004 exists
because a cron must not be able to start somebody's trial while they sleep.

### 7. Only `clock` triggers dispatch

`Trigger` is `clock | event | threshold`. This plan dispatches `clock` and
nothing else. Event and threshold rhythms need a source of events and a source
of numbers respectively, and neither exists. They stay `available: false`, and
the UI must not offer a switch it cannot honour.

### 8. Heartbeat does not move

It stays on its own cron in `vercel.json`, and its card stays
`checked && disabled`.

Heartbeat is maintenance, not a rhythm anybody chose: it runs for every user
with a backlog, with no per-user time. Moving it into subscriptions would mean
backfilling a row for every existing user *and* creating one for every new
signup — which reaches into `lib/auth.ts` — and would put the one rhythm that
demonstrably works at risk to prove machinery that has not run yet.

The consequence is two mechanisms for a while. That is the cheaper mistake.
Migrating heartbeat is recorded as a follow-up, not smuggled in here.

### 9. The first handler is Voice Refresh, and it is the only one

The registry ships with one entry: re-import the X corpus and recompile the
voice pages. `importXCorpus` (`lib/corpus-x.ts:286`) and `compileVoice`
(`lib/voice.ts:191`) are both shipped, both metered, both idempotent, and the
import already carries its own cooldown claim.

It was chosen because it needs **no new integration, no new OAuth scope and no
new model call site**, while still being a genuine spend surface — X reads are
pay-per-use at `X_READ_COST_MICROS` — so it exercises entitlement, metering,
per-user failure isolation and cooldown, which are exactly the things a
dispatcher must get right before anything more interesting rides on it.

It is also useful on its own: `voice/x` is compiled once at import and goes
stale the moment the user posts again. Nothing refreshes it today.

**Choosing the second handler is not this plan's decision.** Do not add one.

## Steps

### Step 1 — Schema

Add to `lib/schema-app.ts`, beside the scheduling tables.

```ts
/** What a run of a rhythm left behind. */
export const RHYTHM_RUN_STATES = [
  "ok",
  "failed",
  /** Skipped without running: unentitled, or the rhythm went unavailable. */
  "skipped",
  /** Its window closed before the dispatcher reached it. See MAX_LATENESS_MS. */
  "missed",
] as const

export const rhythmSubscription = pgTable(
  "rhythm_subscription",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** A catalogue id from RHYTHMS in lib/rhythms.ts. Not a foreign key —
     *  the catalogue is code, and a row for a deleted rhythm is a no-op the
     *  dispatcher reports rather than a constraint violation on deploy. */
    rhythmId: text("rhythm_id").notNull(),
    /** Wall clock in the user's zone. Never UTC, never a cron string. */
    hour: integer("hour").notNull(),
    minute: integer("minute").notNull(),
    /** ISO weekday 1–7, matching WEEKDAYS in lib/slots.ts. Null = daily. */
    weekday: integer("weekday"),
    /** Off without losing the chosen time. Deleting the row would lose it. */
    enabled: boolean("enabled").notNull().default(true),
    /** The dispatcher's cursor. See decision 3. */
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    /** Claim held while a run is in flight. See decision 5. */
    runningSince: timestamp("running_since", { withTimezone: true }),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    // One subscription per rhythm per user. Two rows for "Voice Refresh" is
    // not a state the product has.
    unique("rhythm_subscription_user_rhythm_key").on(
      table.userId,
      table.rhythmId
    ),
    // The dispatcher's path, which crosses users. Partial on `enabled` so a
    // paused subscription costs nothing to skip.
    index("rhythm_subscription_due_idx").on(table.enabled, table.nextRunAt),
    index("rhythm_subscription_user_idx").on(table.userId),
  ]
)

export const rhythmRun = pgTable(
  "rhythm_run",
  {
    id: text("id").primaryKey(),
    subscriptionId: text("subscription_id")
      .notNull()
      .references(() => rhythmSubscription.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    rhythmId: text("rhythm_id").notNull(),
    state: text("state", { enum: RHYTHM_RUN_STATES }).notNull(),
    /** One line the user can read. Never a stack trace. */
    summary: text("summary").notNull().default(""),
    /** True when a person pressed "Run now" rather than the clock firing. */
    manual: boolean("manual").notNull().default(false),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("rhythm_run_subscription_idx").on(
      table.subscriptionId,
      table.startedAt
    ),
  ]
)
```

Add the matching `relations` blocks alongside `draftRelations`.

**Do not** run `drizzle-kit push` against production from a dev machine. Follow
the repo convention: write `scripts/apply-rhythm-tables.ts` in the shape of the
existing `scripts/apply-*.ts` migrations and record it in the plan's operator
actions.

**Verify**: `pnpm typecheck` passes and `pnpm build` succeeds.

### Step 2 — `lib/rhythm-schedule.ts`, pure arithmetic with no database

The whole timing decision, testable without a connection. Mirrors the split
`lib/slots.ts` already makes from `lib/scheduling.ts`, and for the same reason:
the settings UI must preview the next run with the same code the dispatcher
decides with, or the two drift and the symptom is a card promising 09:00 and a
run at 10:00.

```ts
/** Six hours. See decision 4. */
export const MAX_LATENESS_MS = 6 * 60 * 60 * 1000

/** Fifteen minutes. See decision 5. */
export const STALE_CLAIM_MS = 15 * 60 * 1000

export type Cadence = { hour: number; minute: number; weekday: number | null }

/**
 * The next time this cadence falls, strictly after `after`, in `zone`.
 *
 * Weekly delegates to `nextOccurrenceAfter` in lib/slots.ts rather than
 * repeating its two-week candidate walk. Daily is the same arithmetic over
 * today and tomorrow — today included, then discarded when it has passed,
 * which is what makes a 09:00 rhythm edited at 14:00 land tomorrow rather
 * than in five minutes.
 */
export function nextRunAfter(
  cadence: Cadence,
  zone: string,
  after: Date
): Date | null

/** Strictly later than `lateness` past its time. Exported because the
 *  boundary is the safety argument, so it is the thing worth pinning. */
export function isMissed(nextRunAt: Date, now: Date): boolean
```

Write `lib/rhythm-schedule.test.ts` alongside it. The cases that have to pass,
because each one is a real bug if it does not:

| Case | Why it matters |
| --- | --- |
| Daily 09:00 in `Europe/Oslo`, asked at 08:59 local | fires today |
| Daily 09:00 in `Europe/Oslo`, asked at 09:01 local | fires tomorrow, not in a minute |
| Daily 09:00 across a DST spring-forward boundary | still 09:00 local, not 08:00 |
| Weekly Mon 22:17 asked on a Monday at 22:18 | next Monday |
| Same wall clock, `UTC` vs `Pacific/Auckland` | different instants |
| `weekday: null` vs `weekday: 1` | daily vs weekly, same helper |
| `isMissed` at exactly `MAX_LATENESS_MS` | not missed — the boundary is inclusive, matching `lib/publish-run.ts:isMissed` |

**Verify**: `pnpm test lib/rhythm-schedule.test.ts` — all green. The DST case
must fail if you replace `instantOf` with naive `Date` arithmetic; check that
by breaking it on purpose once.

### Step 3 — The handler registry

`lib/rhythm-handlers.ts`:

```ts
export type RhythmHandlerResult = {
  /** One line the user reads on the card. Present tense, no jargon. */
  summary: string
}

export type RhythmHandler = (input: {
  userId: string
}) => Promise<RhythmHandlerResult>

/**
 * Which rhythms actually do something.
 *
 * A rhythm in RHYTHMS with no entry here cannot be switched on — the UI reads
 * this, not `available`, so the two can never disagree. `available` stays the
 * catalogue's own claim; this is the code's.
 */
export const RHYTHM_HANDLERS: Record<string, RhythmHandler> = {
  "voice-refresh": refreshVoice,
}
```

`refreshVoice` calls `importXCorpus` then `compileVoice` and returns a summary
like `"Read 40 new posts, rewrote 6 voice rules"`. It must:

- Return a result rather than throw when the import fails for a known reason.
  `ImportResult` already models `not-connected`, `needs_reauth`, `cooldown` and
  the rest (`lib/corpus-x.ts:66`); a `needs_reauth` is a summary the user can
  act on, not a dispatcher failure.
- Not compile when the import brought back nothing new. A recompile over an
  unchanged corpus is a model call that buys nothing.

**Verify**: `RHYTHM_HANDLERS` has exactly one key. If it has two, you have
gone beyond the plan — see decision 9.

### Step 4 — Add `voice-refresh` to the catalogue

One entry in `lib/rhythms.ts`, Learn family, beside `heartbeat`:

```ts
{
  id: "voice-refresh",
  name: "Voice Refresh",
  promise: "Keeps the voice it writes in current with the voice you have now",
  how: "Reads the posts you have published since last time and rewrites the voice rules from them. Anything you edited yourself is never overwritten.",
  family: "learn",
  trigger: { kind: "clock", label: "weekly" },
  from: ["x"],
  makes: "list",
  to: ["brain"],
  available: true,
},
```

`available: true` is now a claim the registry can back. Leave the other
twenty-four alone.

### Step 5 — `lib/rhythm-run.ts`, the dispatcher

The judgment; the route is only authorisation. Same split as
`lib/publish-run.ts` / `app/api/cron/publish/route.ts`.

```ts
/** Same reasoning as MAX_ROWS_PER_RUN in lib/publish-run.ts, smaller number:
 *  a row here is an X import plus a model call, not one HTTP round trip. */
const MAX_ROWS_PER_RUN = 50

/** Stop before Vercel does. maxDuration is 300s; leaving 45s of headroom
 *  means a run reports truncation rather than being killed mid-handler.
 *  The argument is advisor-plans/020's, applied before the bug rather than
 *  after it. */
const TIME_BUDGET_MS = 255_000

export async function runDueRhythms(now = new Date()): Promise<{
  due: number
  truncated: boolean
  outcomes: Record<RhythmRunState, number>
  failed: number
}>
```

Per row, in order — the order is the plan:

1. **Claim** (decision 5). Lost claim → count `claimed-elsewhere`, continue.
2. **Handler exists?** No entry in `RHYTHM_HANDLERS` → `skipped`, advance,
   release. This is what makes deleting a catalogue entry safe.
3. **Late?** `isMissed` → `missed`, advance, release. No handler call.
4. **Entitled?** Pure `resolveEntitlement` → `skipped` with a reason, advance,
   release (decision 6).
5. **Run**, inside `try`/`catch`. One user's failure must not stop the rest —
   `lib/heartbeat.ts:290` is the pattern.
6. **Record** a `rhythm_run`, set `last_run_at`, recompute `next_run_at` from
   `nextRunAfter(cadence, zone, now)`, release the claim. **In that order, and
   release in a `finally`** — a claim that outlives its run blocks the
   subscription for `STALE_CLAIM_MS`.

The time budget is checked at the top of each iteration, not inside a handler.

Add `lib/rhythm-run.test.ts` covering, with an injected handler and no model
call: claim contention (two dispatchers, one run), the unentitled path
advancing the cursor, a throwing handler leaving `next_run_at` advanced and the
claim released, and truncation reporting.

**Verify**: `pnpm test lib/rhythm-run.test.ts`.

### Step 6 — The route, and the two writes that must recompute the cursor

`app/api/cron/rhythms/route.ts` — copy `app/api/cron/publish/route.ts` exactly:
`CRON_SECRET` or 503, wrong bearer → **404 not 401**, `maxDuration = 300`, and a
500 when the run is degraded so cron monitoring can see it. A run is degraded
when `failed > 0` or `truncated`. `missed` counts as degraded too — it is the
outcome this job exists to prevent.

`vercel.json` — add:

```json
{ "path": "/api/cron/rhythms", "schedule": "*/15 * * * *" }
```

Fifteen minutes, not five and not hourly: it bounds how late a rhythm can be
through no fault of anyone's, and nothing here is time-critical enough to
justify triple the invocations on a table that is empty most ticks.

Then the two places `next_run_at` goes stale, both of which are silent bugs:

- **Editing hour/minute/weekday** — recompute in the same action.
- **Changing timezone** — `advisor-plans/005` made a captured timezone take
  effect immediately for rendering. It must now do the same for scheduling:
  wherever `user.timezone` is written, recompute `next_run_at` for every
  subscription that user has. Without this, a user who flies to Tokyo keeps
  getting their 09:00 rhythm on Oslo time until it next fires.

**Verify**: with the dev server running,

```bash
curl -i localhost:3000/api/cron/rhythms                      # expect 404
curl -i -H "Authorization: Bearer $CRON_SECRET" localhost:3000/api/cron/rhythms
```

The second returns `200` and a JSON body with `due`, `outcomes`, `truncated`.

### Step 7 — Server actions

`app/(app)/rhythm/actions.ts`:

| Action | Notes |
| --- | --- |
| `enableRhythm(rhythmId, cadence)` | Refuses a rhythm with no handler and a non-`clock` trigger. Creates the row with `next_run_at` from `nextRunAfter`. |
| `disableRhythm(rhythmId)` | Sets `enabled: false`. Keeps the row, so the chosen time survives. |
| `setRhythmTime(rhythmId, cadence)` | Recomputes `next_run_at`. |
| `runRhythmNow(rhythmId)` | Stanley's "Try now". |

`runRhythmNow` is a spend surface reachable by a button, so it carries the
money patterns from plan 012 verbatim: session first, entitlement
(`resolveEntitlementForRequest` here — this one *is* a request), a cooldown
claim in the shape of `IMPORT_COOLDOWN_MS`, and a result object rather than a
throw once anything has been spent. It records a `rhythm_run` with
`manual: true` and **does not** advance `next_run_at` — a manual run is not the
scheduled one.

### Step 8 — The grid stops lying

`components/rhythm/rhythm-grid.tsx`: the switch becomes live for any rhythm
with a handler entry, and stays `disabled` for the rest. Heartbeat keeps
`checked && disabled` (decision 8). A live card shows its next run in the
user's zone and its last run's summary; `getHeartbeatRuns` stays for
heartbeat's card, and everything else reads `rhythm_run`.

`lib/rhythm-search-params.ts` needs no change — `status: live | paused` finally
means something.

Follow `AGENTS.md`: hugeicons only, Base UI `render` not `asChild`, switch
states via `data-checked` / `data-unchecked`, no `transition-all`, brass
reserved for "this ritual is running".

**Verify**: `pnpm lint && pnpm typecheck && pnpm build`.

### Step 9 — Verify against a real database

Write `scripts/verify-rhythms.ts` in the shape of `scripts/verify-publish-run.ts`.
It must assert, against the dev account, a controlled triple — the same
discipline plan 006 established, where the third row is what separates a
working guard from a broken endpoint:

| State | Dispatcher result |
| --- | --- |
| subscription due, user entitled | run recorded `ok`, `next_run_at` moved forward |
| same row, entitlement removed | run recorded `skipped`, `next_run_at` **still** moved forward |
| `next_run_at` set 7 hours ago | run recorded `missed`, handler never called |

Teardown deletes what it created. Note the trap `AGENTS.md` records: these
scripts leave a user without credentials, so re-run `scripts/dev-account.ts`
afterwards.

## STOP conditions

- `pnpm test` has any pre-existing failure before you start. Fix nothing;
  report.
- Step 2's DST case cannot be made to pass. The timing model is wrong and the
  rest of the plan rests on it.
- You find yourself adding a second handler, or a handler that publishes,
  DMs, or emails. Decision 5's claim rule and `docs/vision.md:188` both assume
  no rhythm in this plan reaches the outside world.
- The migration in step 1 needs a destructive change to an existing table. It
  should not — every table here is new.
- `drizzle-kit push` proposes dropping anything.

## Done criteria

1. `pnpm test`, `pnpm lint`, `pnpm typecheck`, `pnpm build` all pass.
2. `lib/rhythm-schedule.test.ts` and `lib/rhythm-run.test.ts` exist and cover
   every row in their tables above.
3. `RHYTHM_HANDLERS` has exactly one key.
4. The cron route answers 404 unauthenticated and 200 with a bearer.
5. `scripts/verify-rhythms.ts` prints all three rows of step 9's table.
6. Switching Voice Refresh on at a time two minutes out, then hitting the cron
   endpoint by hand, produces a `rhythm_run` row and a visible summary on the
   card.
7. `plans/README.md` has a status row for 016.

## Out of scope

Named so an executor does not drift into them:

- **Migrating heartbeat.** Decision 8.
- **Event and threshold triggers.** Decision 7.
- **A second handler.** Decision 9.
- **Custom rhythms authored in chat.** Stanley's shape, interesting, and a
  different plan — it needs a prompt store and a sandbox for what a
  user-written rhythm may touch.
- **Bookmarks to Posts.** Blocked on `bookmark.read`, which
  `lib/channels.ts:48` says invalidates every existing grant. It needs its own
  plan and a re-auth mail to every connected user.
- **Per-rhythm spend caps.** Real, and the right time to build it is when a
  second handler makes the ceiling meaningful.

## Follow-ups this plan deliberately leaves open

1. **Heartbeat into the dispatcher**, with a backfill for existing users and a
   default subscription created in `lib/auth.ts` on signup. It buys per-user
   timing and one mechanism instead of two.
2. **Choosing the second handler.** A product decision, not an engineering one.
3. **A spend ceiling per user per day** across rhythms, once more than one
   thing can fire. Plan 008 is already waiting on `usage_event` data for the
   trial ceiling; this is the same question with a different scope.
