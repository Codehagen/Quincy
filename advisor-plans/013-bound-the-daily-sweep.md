# Plan 013: Stop the daily sweep from silently skipping the tail of the table

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- lib/channels.ts lib/channels-maintenance.ts lib/publish.ts app/api/cron/channels/route.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

The daily sweep in `lib/channels-maintenance.ts` loads every non-revoked
connection and makes one platform round-trip per row, sequentially. No `fetch`
in the codebase sets a timeout, and the route caps out at `maxDuration = 300`.

So the sweep's wall-clock is `rows × latency` with no ceiling on either factor.
A single hung socket can consume the entire budget. Once the total crosses 300
seconds the function is killed mid-loop: the rows after the cut are never
checked, and because the sweep always restarts from the beginning, the retry
re-probes the same prefix and skips the same tail — permanently, silently, and
worse each day as the table grows.

The sweep is the only mechanism that notices a revoked LinkedIn grant. For
every user past the cutoff, that mechanism stops existing and nothing says so.

Compounding it: the route returns `{ ok: true }` even when every single row
threw. Cron monitoring cannot distinguish a healthy sweep from a dead one.

After this plan, a hung platform costs one row ten seconds instead of the whole
run, the least-recently-swept rows go first so nobody is starved, and a run
that failed reports failure.

## Current state

Files and their roles:

- `lib/channels.ts` — `probeLiveness` (the sweep's network call), `postToken`,
  `fetchProfile`
- `lib/channels-maintenance.ts` — the sweep loop and its row query
- `lib/publish.ts` — the X and LinkedIn publish calls
- `app/api/cron/channels/route.ts` — the scheduled entry point

**The probe, with no timeout** (`lib/channels.ts`, inside `probeLiveness`):

```ts
  try {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })

    if (response.ok) {
      return { live: true }
    }
```

`probeLiveness` already maps a thrown error to `{ live: "unknown", error }`,
which is exactly the right verdict for a timeout — nothing is written, and the
row is retried tomorrow. So adding a timeout needs no new error handling:

```ts
  } catch (cause) {
    return {
      live: "unknown",
      error: cause instanceof Error ? cause.message : String(cause),
    }
  }
```

**The unbounded row query** (`lib/channels-maintenance.ts`, inside
`runChannelMaintenance`):

```ts
  const rows = await db
    .select({
      id: channelConnection.id,
      userId: channelConnection.userId,
      channel: channelConnection.channel,
      accessTokenExpiresAt: channelConnection.accessTokenExpiresAt,
      reauthNoticeSentAt: channelConnection.reauthNoticeSentAt,
    })
    .from(channelConnection)
    .where(scope)
```

**The sequential loop** (same file, further down):

```ts
  for (const row of rows) {
    try {
      const check = await checkConnection(row, deps)
      outcomes[check.outcome] += 1
      if (check.emailed) {
        emailed += 1
      }
    } catch (cause) {
      // One bad row must not end the sweep for everyone behind it. Nothing was
      // written for this row, so tomorrow picks it up unchanged.
      failed += 1
      console.error(`[channels] ${row.id} check failed:`, cause)
    }
  }

  return { checked: rows.length, outcomes, emailed, failed }
```

**The unconditionally-successful response**
(`app/api/cron/channels/route.ts`, end of the handler):

```ts
  const started = Date.now()
  const run = await runChannelMaintenance()

  return Response.json({ ok: true, ms: Date.now() - started, ...run })
```

**The duration cap** (`app/api/cron/channels/route.ts:20`):

```ts
export const maxDuration = 300
```

**The other timeout-less fetches**, all needing the same treatment:

- `lib/channels.ts` — `postToken` (`await fetch(c.tokenUrl, { ... })`)
- `lib/channels.ts` — `fetchProfile`, two call sites (X and LinkedIn)
- `lib/channels.ts` — the X revoke call inside `disconnect`
- `lib/publish.ts` — `publishToX` (`await fetch("https://api.x.com/2/tweets", ...)`)
- `lib/publish.ts` — `publishToLinkedIn`, two call sites (`/rest/posts` and
  `/v2/ugcPosts`)

### The design decisions, already made for you

- **Sequential iteration stays.** It is deliberate — a pool would turn a
  hundred users into a hundred simultaneous requests from one IP and get the
  job rate-limited, which the sweep would then have to distinguish from real
  revocation. Do not parallelise.
- **`AbortSignal.timeout`, not a manual `AbortController`.** It is a standard
  Node 18+ / Web API, available in the Next.js runtime, and it is one argument.
- **Ten seconds** for the probe. A platform that has not answered a `GET
  /v2/userinfo` in ten seconds is not going to.
- **Order by `updatedAt` ascending.** If a run is ever truncated, the rows that
  went unswept longest are the ones that go first next time, so nobody is
  starved forever.

### Repo conventions to match

- Comments explain **why**. See `lib/channels-maintenance.ts`'s existing
  block comments for the voice and density.
- `MaintenanceRun` is the returned shape; extend it rather than returning a
  parallel value.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `npx eslint <files>` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Sweep assertions | `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts` | zero `FAIL` |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

## Scope

**In scope**:

- `lib/channels.ts` (timeouts on every outbound fetch)
- `lib/publish.ts` (timeouts on every outbound fetch)
- `lib/channels-maintenance.ts` (ordering, batch cap, truncation reporting)
- `app/api/cron/channels/route.ts` (honest status code)

**Out of scope** (do NOT touch):

- `app/api/cron/heartbeat/route.ts` and `lib/heartbeat.ts` — different job,
  different failure profile, and it makes model calls whose latency budget is
  nothing like this one.
- The sequential loop structure. Do not introduce concurrency.
- `scripts/verify-*.ts` beyond confirming they still pass.
- The `deps` injection seam — leave its shape alone.

## Git workflow

- Branch: `advisor/013-bound-the-sweep`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `feat: notice when someone takes a channel back`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add one shared timeout constant

At the top of `lib/channels.ts`, near `REFRESH_MARGIN_MS`, add:

```ts
/**
 * Every outbound call to a platform carries this.
 *
 * Without it a single hung socket has no upper bound, and the daily sweep —
 * which is sequential by design — spends its whole 300-second budget on one
 * row. The rows behind it are never checked, and because the sweep restarts
 * from the beginning, the same tail is skipped every day. A platform that has
 * not answered in ten seconds is not going to.
 */
export const PLATFORM_TIMEOUT_MS = 10_000
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Apply it to every fetch in `lib/channels.ts`

Add `signal: AbortSignal.timeout(PLATFORM_TIMEOUT_MS)` to the options object of
every `fetch` call in the file. There are five: `postToken`, `fetchProfile` (X),
`fetchProfile` (LinkedIn), `probeLiveness`, and the X revoke inside
`disconnect`.

`probeLiveness` needs no new error handling — its existing `catch` already
returns `{ live: "unknown" }`, which is the correct verdict for a timeout and
writes nothing.

Find them all with:

```
grep -n "await fetch(" lib/channels.ts
```

**Verify**: `grep -c "AbortSignal.timeout" lib/channels.ts` → `5`.
Then `pnpm typecheck` → exit 0.

### Step 3: Apply it to every fetch in `lib/publish.ts`

Import `PLATFORM_TIMEOUT_MS` from `./channels` (the file already imports from
there) and add the same `signal` to all three fetches: `publishToX`, and both
LinkedIn calls in `publishToLinkedIn`.

`publish()` already wraps the adapters in a `try/catch` that returns
`{ ok: false, reason: "rejected" }` on a throw, so a timeout is reported
correctly with no further change.

**Verify**: `grep -c "AbortSignal.timeout" lib/publish.ts` → `3`.
Then `pnpm typecheck` → exit 0.

### Step 4: Order the sweep and cap the batch

In `lib/channels-maintenance.ts`, add a batch constant near
`REAUTH_WARNING_MS`:

```ts
/**
 * The most rows one run will take.
 *
 * The sweep is sequential and the route dies at 300 seconds, so an unbounded
 * query does not mean "check everyone" — it means "check an unpredictable
 * prefix and silently skip the rest, forever, because the next run starts from
 * the same place". A cap plus oldest-first ordering turns that into something
 * honest: a known number of rows per run, with the longest-unchecked rows
 * first, and a flag saying more were waiting.
 */
const MAX_ROWS_PER_RUN = 500
```

Then add ordering and a limit to the query. Import `asc` from `drizzle-orm`.

```ts
  const rows = await db
    .select({ ... })            // unchanged
    .from(channelConnection)
    .where(scope)
    // Oldest sweep first, so a truncated run starves nobody: whoever was
    // skipped yesterday is at the front of the queue today.
    .orderBy(asc(channelConnection.updatedAt))
    .limit(MAX_ROWS_PER_RUN + 1)
```

Selecting one more than the cap is how the code learns there were more without
a second `count(*)` query. Immediately after:

```ts
  const truncated = rows.length > MAX_ROWS_PER_RUN
  const batch = truncated ? rows.slice(0, MAX_ROWS_PER_RUN) : rows

  if (truncated) {
    // Logged loudly rather than absorbed. A sweep that quietly covers part of
    // the table reads as "everyone is fine" to anyone looking at the output.
    console.error(
      `[channels] sweep truncated at ${MAX_ROWS_PER_RUN} rows — more were waiting. ` +
        "Raise the cap or move to a cursor."
    )
  }
```

Change the loop to iterate `batch`, and extend the return:

```ts
  return { checked: batch.length, truncated, outcomes, emailed, failed }
```

Add `truncated: boolean` to the `MaintenanceRun` type.

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -n "truncated" lib/channels-maintenance.ts` → at least four matches.

### Step 5: Make the cron route tell the truth

In `app/api/cron/channels/route.ts`, replace the unconditional success with a
status that reflects what happened:

```ts
  const started = Date.now()
  const run = await runChannelMaintenance()

  // A run where rows threw, or where the batch was cut short, is not a
  // success — and cron monitoring can only see the status code. Returning 200
  // for a sweep that checked nobody is how this job dies quietly and stays
  // dead: the one thing it exists to notice is a revoked grant, and a silent
  // failure means nobody notices that nobody is noticing.
  const degraded = run.failed > 0 || run.truncated

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, ...run },
    { status: degraded ? 500 : 200 }
  )
```

**Verify**: `pnpm typecheck` → exit 0, and
`npx eslint app/api/cron/channels/route.ts` → no output.

### Step 6: Confirm the sweep still behaves

```
npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts
```

**Verify**: zero `FAIL`. The script's stubbed `probe` never touches the
network, so timeouts do not affect it; the ordering and cap changes must not
alter any outcome it asserts.

Then exercise the real route against a running dev server if one is up:

```
SECRET=$(grep '^CRON_SECRET' .env.local | cut -d= -f2- | tr -d '"' | tr -d "'")
curl -s -w "\nHTTP %{http_code}\n" -H "authorization: Bearer $SECRET" \
  http://localhost:3000/api/cron/channels
```

**Verify**: `HTTP 200` with `"ok":true` and `"truncated":false` on a small
table. If no dev server is running, skip this and say so in your report.

### Step 7: Format and final check

```
npx prettier --write lib/channels.ts lib/publish.ts lib/channels-maintenance.ts app/api/cron/channels/route.ts
pnpm typecheck && pnpm test && npx eslint lib/channels.ts lib/publish.ts lib/channels-maintenance.ts app/api/cron/channels/route.ts
```

**Verify**: typecheck exit 0, tests pass, eslint silent.

## Test plan

No new vitest file. The behaviours here are network timeouts and query shape,
neither of which is unit-testable without the `db` seam that does not exist yet
(that is plan 018's job).

Regression coverage comes from `scripts/verify-channel-maintenance.ts`, which
must continue to pass unchanged — it asserts every sweep outcome
(`active` / `expiring` / `expired` / `revoked` / `unreachable`), the
once-per-cycle email gate, and that a revoked row is never re-swept. If
ordering or the cap broke any of those, that script catches it.

Verification: `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts`
→ zero `FAIL`, and the `PASS` count is unchanged from before this plan (36).

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `npx eslint lib/channels.ts lib/publish.ts lib/channels-maintenance.ts app/api/cron/channels/route.ts` exits 0 with no output
- [ ] `grep -c "AbortSignal.timeout" lib/channels.ts` returns `5`
- [ ] `grep -c "AbortSignal.timeout" lib/publish.ts` returns `3`
- [ ] `grep -c "await fetch(" lib/channels.ts lib/publish.ts` shows every call site covered (8 total)
- [ ] `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts` prints zero `FAIL`
- [ ] `git status --short` shows only the four in-scope files
- [ ] `advisor-plans/README.md` status row for 013 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `grep -n "await fetch(" lib/channels.ts lib/publish.ts` finds more or fewer
  call sites than the eight this plan names — the file has drifted.
- You are tempted to parallelise the loop. Do not; it is deliberate.
- `verify-channel-maintenance.ts` fails an assertion, meaning the ordering or
  cap changed behaviour rather than just coverage.
- `AbortSignal.timeout` is unavailable in this runtime (it should not be —
  Node 18+). Report rather than hand-rolling an `AbortController` with a
  `setTimeout` that then leaks a timer.

## Maintenance notes

- **When the connection count approaches 500**, this becomes a real decision:
  raise `MAX_ROWS_PER_RUN`, move to a resumable cursor keyed on `updatedAt`, or
  shard the sweep across more frequent runs. The `truncated` flag and the 500
  response are the alarm that tells you the day has come — do not silence them
  by raising the cap without measuring the wall clock first.
- A reviewer should check that `probeLiveness` still maps a timeout to
  `live: "unknown"` and not to a written verdict. A timeout that marked rows
  `revoked` would disconnect every user during an outage.
- Deliberately deferred: `lib/heartbeat.ts` has the same missing-timeout shape.
  It is a different job with a different budget (it makes model calls), so it
  needs its own numbers rather than these.
