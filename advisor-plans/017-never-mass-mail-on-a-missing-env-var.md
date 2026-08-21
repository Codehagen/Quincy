# Plan 017: Never mark every connection broken because an env var went missing

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- lib/channels.ts lib/channels-maintenance.ts scripts/verify-channel-maintenance.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`lib/channels.ts` already has `isChannelEnabled(channel)` — a check for whether
the client id and secret are configured at all. It exists, its doc comment
explains exactly why it matters, and **only the UI calls it**. Neither
`getAccessToken` nor the daily sweep consults it.

So if `X_CLIENT_ID` or `X_CLIENT_SECRET` goes missing on a deploy — a rotation,
a renamed variable, a new environment that was never given the values — the
token endpoint is called with `undefined` as the client id. It answers 401. The
sweep reads that as a broken connection and writes `needs_reauth` to **every X
row in the database**, then mails every one of those users a reconnect notice.

The mailing is the part that does not undo. `reauthNoticeSentAt` is only
cleared by `saveConnection`, so each of those users has spent their one notice
for the cycle. They then reconnect a connection that was never broken, and
anyone who does not is left with a row marked broken and no further reminder.

One missing environment variable, and the blast radius is every user on that
channel plus their inbox.

After this plan, a channel with no credentials is skipped by the sweep and
reported as a configuration problem, not as a user's problem.

## Current state

Files and their roles:

- `lib/channels.ts` — `isChannelEnabled`, `getAccessToken`, `config()`
- `lib/channels-maintenance.ts` — the daily sweep
- `scripts/verify-channel-maintenance.ts` — the sweep's hand-run assertions

**The check that exists and is barely used** (`lib/channels.ts:97-107`):

```ts
/**
 * Whether the channel is configured at all.
 *
 * Same reasoning as `isGoogleEnabled` in lib/auth.ts: a Connect button that
 * fails on click is worse than no button, because it looks like the product is
 * broken rather than unfinished.
 */
export function isChannelEnabled(channel: ConnectableChannel): boolean {
  const { clientId, clientSecret } = config(channel)
  return Boolean(clientId && clientSecret)
}
```

Confirm its callers with `grep -rn "isChannelEnabled" app components lib` —
expected: the definition, plus `app/(app)/channels/page.tsx` and
`app/(app)/channels/[platform]/page.tsx`. No `lib/` consumer.

**Where the undefined credential goes out** (`lib/channels.ts`, inside
`postToken`):

```ts
  if (c.tokenAuth === "body") {
    body.set("client_id", c.clientId!)
    body.set("client_secret", c.clientSecret!)
  } else {
    // X wants client_id in the body as well as the Basic header. Omitting it
    // is a 400 that reads like a malformed request rather than a missing field.
    body.set("client_id", c.clientId!)
  }
```

and in `authHeaders`:

```ts
  if (c.tokenAuth === "basic") {
    const credentials = Buffer.from(`${c.clientId}:${c.clientSecret}`).toString(
      "base64"
    )
    headers.Authorization = `Basic ${credentials}`
  }
```

Both use `!` on values that are `string | undefined` read straight from
`process.env`.

**The verdict that gets written** (`lib/channels.ts`, end of `getAccessToken`):

```ts
  } catch (error) {
    const revoked = error instanceof TokenError && error.isRevoked
    await markConnectionState(
      row.id,
      revoked ? "revoked" : "needs_reauth",
      error instanceof Error ? error.message : String(error)
    )
    return { ok: false, reason: revoked ? "revoked" : "needs_reauth" }
  }
```

**The sweep's row query, which does not filter by configuration**
(`lib/channels-maintenance.ts`, inside `runChannelMaintenance`):

```ts
  const scope = userId
    ? and(
        ne(channelConnection.state, "revoked"),
        eq(channelConnection.userId, userId)
      )
    : ne(channelConnection.state, "revoked")
```

**The mail gate that gets consumed** (`lib/channels-maintenance.ts`, inside
`nudgeOnce`):

```ts
  if (noticeSentAt) {
    return false
  }
```

and after a successful send:

```ts
  await recordReauthNotice(connectionId)
  return true
```

**The outcome union to extend** (`lib/channels-maintenance.ts`):

```ts
export type MaintenanceOutcome =
  /** Grant is live and not close to expiry. Nothing was written. */
  | "active"
  /** Live, but running out. Marked `needs_reauth` ahead of time. */
  | "expiring"
  /** Out of time. LinkedIn does this to every connection every 60 days. */
  | "expired"
  /** The person removed us upstream. Terminal until they connect again. */
  | "revoked"
  /** The platform did not give us an answer. Nothing was written. */
  | "unreachable"
```

and the counter initialised from it:

```ts
  const outcomes: Record<MaintenanceOutcome, number> = {
    active: 0,
    expiring: 0,
    expired: 0,
    revoked: 0,
    unreachable: 0,
  }
```

### Repo conventions to match

- Comments explain **why**, in full sentences. `lib/channels-maintenance.ts` is
  the model.
- The sweep returns a `MaintenanceRun` with per-outcome counts; extend that
  shape rather than logging and moving on.
- `scripts/verify-channel-maintenance.ts` uses a `check(label, ok, detail)`
  helper, a `deps(...)` stub factory, and teardown that deletes only what it
  created. Follow its structure exactly when adding a case.

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

- `lib/channels-maintenance.ts` (skip unconfigured channels; new outcome)
- `scripts/verify-channel-maintenance.ts` (assert the new behaviour)

**Out of scope** (do NOT touch):

- `lib/channels.ts` — `isChannelEnabled` already exists and is already
  exported. Do not add the check inside `getAccessToken`: that function is on
  the publish path, and changing what it returns there affects `lib/publish.ts`,
  which has its own error contract. Keeping this change in the sweep keeps the
  blast radius to the sweep.
- `lib/publish.ts`.
- The `!` assertions in `postToken` / `authHeaders`. Tempting, but changing them
  means deciding what `config()` should do when unconfigured, which touches
  every caller. Out of scope; noted in maintenance notes.
- `app/(app)/channels/*` — the UI already calls `isChannelEnabled` correctly.

## Git workflow

- Branch: `advisor/017-skip-unconfigured-channels`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `feat: notice when someone takes a channel back`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add the outcome

In `lib/channels-maintenance.ts`, extend `MaintenanceOutcome`:

```ts
  /**
   * The channel has no credentials in this environment, so nothing can be
   * asked and nothing is written. Not the user's problem and never theirs to
   * fix — the row is untouched and no mail goes out.
   */
  | "unconfigured"
```

Add `unconfigured: 0` to the `outcomes` record initialiser. TypeScript's
`Record<MaintenanceOutcome, number>` will fail the build until you do, which is
the intended safety net.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Skip unconfigured channels before anything is asked

In `checkConnection`, add the guard as the **first** thing in the function,
before `getAccessToken` is called:

```ts
  /**
   * Before anything is asked of the platform.
   *
   * Without this, a channel whose client id or secret is missing from the
   * environment — a rotation, a renamed variable, a new deploy that never got
   * the values — sends `undefined` as the client id. The platform answers 401,
   * the sweep reads that as a broken grant, and it writes `needs_reauth` to
   * every row on that channel and mails every one of those users. Each of them
   * then spends their one notice for the cycle reconnecting something that was
   * never broken.
   *
   * A missing environment variable is an operator's problem. It must never be
   * turned into a hundred users' problem.
   */
  if (!isChannelEnabled(row.channel)) {
    return { ...base, outcome: "unconfigured", emailed: false }
  }
```

`base` is already defined at the top of `checkConnection` as
`{ userId: row.userId, channel: row.channel }` — place the guard immediately
after it.

Add `isChannelEnabled` to the existing import from `./channels`.

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -n "isChannelEnabled" lib/channels-maintenance.ts` → two matches (import
and use).

### Step 3: Make the operator problem visible

An unconfigured channel is silent by design for the user, but the operator must
be able to see it. In `runChannelMaintenance`, after the loop, add:

```ts
  if (outcomes.unconfigured > 0) {
    // Logged rather than absorbed: these rows were not checked at all, so the
    // sweep's core promise — noticing a withdrawn grant within 24 hours — is
    // not being kept for them. That is a deploy problem and it should look
    // like one.
    console.error(
      `[channels] ${outcomes.unconfigured} connection(s) skipped — the channel ` +
        "has no client id/secret in this environment. Check the env vars."
    )
  }
```

**Verify**: `pnpm typecheck` → exit 0, and
`npx eslint lib/channels-maintenance.ts` → no output.

### Step 4: Assert it

In `scripts/verify-channel-maintenance.ts`, add a case before the
`=== teardown ===` block. The script's `deps(...)` factory already tracks
`probes`, which is what proves nothing was asked of the platform.

**Control the environment rather than depending on it.** `config()` in
`lib/channels.ts:73-74` reads `process.env.X_CLIENT_ID` / `X_CLIENT_SECRET` at
call time, so the script can decide whether X counts as configured. That is
better than skipping when it does not: the case then runs everywhere, on a
machine with X credentials and one without.

```ts
  console.log("\n=== an unconfigured channel is skipped, not blamed ===")
  // The environment is set here rather than read, so this runs identically on
  // a machine that has X credentials and one that does not. `config()` reads
  // these at call time, so deleting them is what makes isChannelEnabled false.
  const savedId = process.env.X_CLIENT_ID
  const savedSecret = process.env.X_CLIENT_SECRET
  delete process.env.X_CLIENT_ID
  delete process.env.X_CLIENT_SECRET
  check("X reads as unconfigured for this case", !isChannelEnabled("x"))

  await reset()
  await seed(50 * DAY, "x")
  d = deps({ live: true })
  run = await sweep(d.value)
  check(
    "counted as unconfigured",
    run.outcomes.unconfigured === 1,
    JSON.stringify(run.outcomes)
  )
  check("the platform was never asked", d.probes === 0, `${d.probes} probes`)
  check("state untouched", (await state()).state === "active")
  check("nobody was emailed", run.emailed === 0 && d.sent.length === 0)
  check(
    "and no notice was recorded, so the cycle is not spent",
    (await state()).reauthNoticeSentAt === null
  )

  // Restore, so nothing after this case inherits the deletion.
  if (savedId !== undefined) process.env.X_CLIENT_ID = savedId
  if (savedSecret !== undefined) process.env.X_CLIENT_SECRET = savedSecret
```

Add `isChannelEnabled` to the script's import from `../lib/channels`.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts`
→ zero `FAIL`. Either five new `PASS` lines, or one `SKIP` line.

### Step 4b: Make the pre-existing X case independent of the environment

**This step exists because the guard legitimately breaks an older test.**

`scripts/verify-channel-maintenance.ts` already has a case
`=== X near expiry is not the user's errand ===` (around line 280) that seeds an
X connection five days from expiry and asserts `outcomes.active === 1`. It
passed before this plan only by accident: with a token five days out,
`getAccessToken` finds it not stale (`REFRESH_MARGIN_MS` is minutes) and returns
without ever needing credentials. The new guard runs first and correctly reports
`unconfigured` on a machine with no X app — so that case now fails, and the
failure is the guard working.

The assertion is still worth making: a *refreshable* channel near expiry must not
warn. It just needs X to count as configured. Set that explicitly, immediately
before the existing `await reset()` in that case:

```ts
  // X is refreshable, and this case is about what that means — so it needs X to
  // read as configured whether or not this machine has an X app. `config()`
  // reads these at call time. The values are never used: the probe is stubbed
  // and a token five days out is not stale, so nothing reaches the network.
  process.env.X_CLIENT_ID ??= "verify-not-a-real-id"
  process.env.X_CLIENT_SECRET ??= "verify-not-a-real-secret"
  check("X reads as configured for this case", isChannelEnabled("x"))
```

`??=` assigns only when unset, so a machine that *does* have real credentials
keeps them untouched.

Do NOT change the case's existing assertions. Do NOT delete the case. Do NOT
convert it to a skip — a case that silently skips on every developer machine
without an X app is coverage nobody has.

**Verify**: `npx tsx --env-file=/Users/christer/Documents/dev/quincy/.env.local scripts/verify-channel-maintenance.ts`
→ the `X near expiry` case reports `PASS counted as active` again, and zero
`FAIL` lines appear anywhere in the run.

### Step 5: Confirm nothing else regressed

The new guard runs before every other branch, so every existing case must still
behave — LinkedIn is configured in the dev environment, so none of them should
take the new path.

```
npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts
npx tsx --env-file=.env.local scripts/verify-channels.ts
```

**Verify**: both print zero `FAIL`. In particular the `active`, `expiring`,
`expired`, `revoked` and `unreachable` cases must all still pass — if any now
reports `unconfigured`, LinkedIn is missing credentials in this environment and
that is itself worth reporting.

### Step 6: Format and final check

```
npx prettier --write lib/channels-maintenance.ts scripts/verify-channel-maintenance.ts
pnpm typecheck && pnpm test && npx eslint lib/channels-maintenance.ts scripts/verify-channel-maintenance.ts
```

**Verify**: typecheck exit 0, tests pass, eslint silent.

## Test plan

New assertions in `scripts/verify-channel-maintenance.ts`, following the
existing `check(...)` block structure in that file:

1. An unconfigured channel is counted `unconfigured`.
2. The platform is never contacted for it (`probes === 0`).
3. The row's `state` is untouched.
4. No email is sent.
5. `reauthNoticeSentAt` stays null, so the user's one notice per cycle is not
   consumed.

The case self-skips with a printed `SKIP` when the channel *is* configured,
because a stubbed unconfigured channel would assert nothing about the real
guard.

All existing assertions in both channel verification scripts must continue to
pass unchanged.

Verification: `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts`
→ zero `FAIL`, `PASS` count 41 (up from 36) when X is unconfigured.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `npx eslint lib/channels-maintenance.ts scripts/verify-channel-maintenance.ts` exits 0 with no output
- [ ] `grep -c "isChannelEnabled" lib/channels-maintenance.ts` returns `2`
- [ ] `grep -c "unconfigured" lib/channels-maintenance.ts` returns at least `4`
- [ ] The `X near expiry` case reports `PASS`, not `FAIL` (Step 4b)
- [ ] `npx tsx --env-file=.env.local scripts/verify-channel-maintenance.ts` prints zero `FAIL`
- [ ] `npx tsx --env-file=.env.local scripts/verify-channels.ts` prints zero `FAIL`
- [ ] `git status --short` shows only the two in-scope files
- [ ] `advisor-plans/README.md` status row for 017 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `grep -rn "isChannelEnabled" lib` already shows a `lib/` consumer — the
  premise of this plan is that only the UI calls it.
- Any existing assertion in either verification script starts failing, **other
  than** the `X near expiry is not the user's errand` case, which Step 4b
  exists to repair. If that one fails before Step 4b, that is expected; if it
  still fails after, stop and report.
- The `unconfigured` case in Step 4 reports `SKIP` **and** you were expecting X
  to be unconfigured — that means credentials appeared in the environment and
  the new guard is untested. Say so plainly in your report rather than faking
  the condition.
- You are tempted to put the check inside `getAccessToken`. Do not: that
  function is on the publish path and `lib/publish.ts` maps its failure reasons
  to user-facing copy.

## Maintenance notes

- **The general shape**: an operator's configuration mistake must never be
  written into user-visible state or mailed to users. Any future code path that
  turns a platform error into a persisted verdict should ask first whether the
  request was even properly formed.
- The `!` assertions on `clientId` / `clientSecret` in `postToken` and
  `authHeaders` are still there and still lie to the compiler. They are now
  unreachable from the sweep, but not from `publish` or the connect routes.
  Making `config()` throw when unconfigured is the real fix and it touches every
  caller — worth its own plan.
- A reviewer should check that the guard is the **first** statement in
  `checkConnection`. Placed after `getAccessToken`, it would be useless: the
  damaging call would already have happened.
