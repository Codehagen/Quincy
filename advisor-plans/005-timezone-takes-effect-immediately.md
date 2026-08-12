# Plan 005: Make a captured timezone take effect on the next render, not five minutes later

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat f2832e4..HEAD -- "app/(app)/actions.ts" lib/auth.ts components/auth/timezone-sync.tsx`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `f2832e4`, 2026-08-04

## Why this matters

Quincy stores an IANA timezone on the user so `/lineup` can draw a person's
posting schedule in their own hours instead of the server's. Accounts that never
pass through the signup form — Google sign-ups, and anyone who registered before
the column existed — get their zone captured on first visit by a client
component that calls a server action.

That action writes the zone straight to the database with Drizzle. It works, and
the page still renders in UTC afterwards, because Better Auth serves the whole
`user` object out of a signed cookie for five minutes and a raw database write
never touches that cookie. So a Norwegian user signing in with Google sees every
scheduled post two hours off on their first look at the product, with nothing to
correct it until the cookie ages out.

After this plan, the write goes through Better Auth's own `updateUser`, which
re-issues the session cookie, and the very next render draws the correct hours.

## Current state

### The files

- `app/(app)/actions.ts` — the server action that stores the zone. Contains the
  raw Drizzle write that is the bug (lines 25–43).
- `components/auth/timezone-sync.tsx` — the client component that calls it.
  Renders nothing. **No change needed here**, listed so you can see the flow.
- `app/(app)/layout.tsx` — mounts `TimeZoneSync` only when
  `session.user.timezone` is falsy (line ~69). **Out of scope.**
- `lib/auth.ts` — Better Auth config. Read-only for this plan; the cookie cache
  block at lines 265–276 is what makes the bug happen.

### `app/(app)/actions.ts` as it exists today

```ts
// app/(app)/actions.ts:1-8
"use server"

import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { user } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { isValidTimeZone } from "@/lib/timezone"
```

```ts
// app/(app)/actions.ts:25-43  (the function body; the doc comment above it is lines 10-24)
export async function rememberTimeZone(zone: string) {
  const session = await getSession()
  if (!session) return

  // Already answered. This is also what makes the client's fire-once effect
  // harmless if it ever fires twice.
  if (session.user.timezone) return

  // Arrives from the client, so it is a string that could be anything. Writing
  // it unchecked would put a value in the column that throws a RangeError the
  // next time /lineup renders. `resolveTimeZone` would catch it on read, but a
  // row that can only ever fall back is not worth storing.
  if (!isValidTimeZone(zone)) return

  await db
    .update(user)
    .set({ timezone: zone })
    .where(eq(user.id, session.user.id))
}
```

### Why the cookie is the problem

```ts
// lib/auth.ts:265-276
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // refresh the row at most once a day
    cookieCache: {
      enabled: true,
      // The cap is the point. A cached session is read from the cookie without
      // touching the database, so a ban or a revoked session stays live until
      // this expires. Five minutes keeps the read path cheap while bounding how
      // long a revoked session can outlive its revocation.
      maxAge: 5 * 60,
    },
  },
```

With `cookieCache.enabled`, Better Auth returns the `user` object from the signed
cookie payload without querying the database
(`node_modules/better-auth/dist/api/routes/session.mjs:87` — the branch guarded
by `sessionDataPayload?.session && ...cookieCache?.enabled`). Its own
`updateUser` route calls `setSessionCookie` after writing
(`node_modules/better-auth/dist/api/routes/update-user.mjs:69`), which is exactly
the step the raw Drizzle write skips.

### Repo conventions to match

- **Server actions** live in `app/(app)/<surface>/actions.ts`, start with
  `"use server"`, re-read the session themselves, and never trust an id from the
  client. See `app/(app)/lineup/actions.ts:20-24` for the `requireUser` shape.
- **Comments explain *why*, not *what*.** Every non-obvious line in this repo
  carries a comment naming the failure it prevents. Match that density — read
  `app/(app)/lineup/actions.ts` for the house style. Do not strip the existing
  comments in `rememberTimeZone`; extend them.
- **Em dashes are not avoided** — the codebase uses them freely. Match the file.
- Server-side Better Auth calls use `auth.api.<method>({ body, headers })` with
  headers from `next/headers`. There is no existing example of `updateUser` in
  this repo; the closest shape is `auth.api.getSession({ headers: await headers() })`
  in `lib/session.ts:27`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Install | `pnpm install` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0, no output after the `$ tsc --noEmit` line |
| Tests | `pnpm test` | `Test Files 5 passed`, `Tests 68 passed` (or more) |
| Build | `pnpm build` | `✓ Compiled successfully` |
| Lint | `pnpm lint` | **exits 1** — see below |

**`pnpm lint` fails on a clean tree.** `hooks/use-mobile.ts:14` trips
`react-hooks/set-state-in-effect` and has since commit `6fab77e`. That one error
is pre-existing and is not yours. Confirm the output contains exactly
`✖ 1 problem (1 error, 0 warnings)` and that the file named is
`hooks/use-mobile.ts`. Any second error is yours and must be fixed.

## Scope

**In scope** (the only files you may modify):

- `app/(app)/actions.ts`

**Out of scope** (do NOT touch, even though they look related):

- `lib/auth.ts` — do not lower `cookieCache.maxAge` and do not disable the
  cookie cache. That cache is a deliberate performance decision documented in
  the comment above it, and shortening it to paper over this bug would slow
  every authenticated request in the app to fix one write.
- `components/auth/timezone-sync.tsx` — the client side is already correct.
- `app/(app)/layout.tsx` — the mount condition is already correct.
- `lib/session.ts` — do not add `disableCookieCache` to the shared session
  read. That would remove the cache for every request in the app.
- `lib/timezone.ts` — no changes needed.

## Git workflow

- Branch: `advisor/005-timezone-takes-effect-immediately`
- One commit. Message style is conventional commits with a descriptive body —
  see `git log --oneline -5`. Example from this repo:
  `fix: a way back in when the verification link is gone`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Route the write through Better Auth instead of Drizzle

In `app/(app)/actions.ts`, replace the `db.update(...)` call at the end of
`rememberTimeZone` with a call to `auth.api.updateUser`, passing the request
headers so Better Auth can identify the session and re-issue its cookie.

The resulting function should:

1. Keep the existing `getSession()` guard, the `session.user.timezone` early
   return, and the `isValidTimeZone(zone)` guard, all unchanged and with their
   comments intact.
2. Call `auth.api.updateUser({ body: { timezone: zone }, headers: await headers() })`.
3. Add a comment above that call explaining *why* it is not a Drizzle write —
   name the cookie cache and the fact that `setSessionCookie` is what makes the
   next render correct.

Imports to add: `headers` from `next/headers`, `auth` from `@/lib/auth`.
Imports to remove: `eq` from `drizzle-orm`, `db` from `@/lib/db`, `user` from
`@/lib/schema` — but only if nothing else in the file still uses them. At the
time of writing this plan, `rememberTimeZone` is the only export in the file, so
all three become unused.

**Verify**: `pnpm typecheck` → exit 0, no errors.

**Verify**: `grep -n "db.update\|drizzle-orm" "app/(app)/actions.ts"` → no
matches.

**Verify**: `grep -n "auth.api.updateUser" "app/(app)/actions.ts"` → exactly one
match.

### Step 2: Confirm the action still refuses what it refused before

The three guards are load-bearing and easy to lose in a rewrite. Read the
finished function and confirm all three are present and in this order:

1. no session → return (a signed-out caller must not write anything)
2. `session.user.timezone` already set → return (fills a blank, never corrects
   one — a week in New York must not silently redraw the lineup)
3. `isValidTimeZone(zone)` false → return

**Verify**: `grep -c "return" "app/(app)/actions.ts"` → at least 3.

### Step 3: Confirm the app still builds and nothing else broke

**Verify**: `pnpm test` → all pass, same count as before your change.

**Verify**: `pnpm build` → `✓ Compiled successfully`.

**Verify**: `git status --short` → only `app/(app)/actions.ts` is modified.

## Test plan

There is no automated test for this change, and that is a deliberate scoping
decision rather than an oversight: asserting it requires a live session cookie, a
real Better Auth instance and a database, which this repo has no harness for. The
existing suite is pure-function unit tests only (`lib/*.test.ts` under Vitest).

Do **not** invent a mocking harness for Better Auth as part of this plan. If you
believe a test is essential, stop and report that instead.

What you must do instead is a manual check, and record its result in your report:

1. Run `pnpm dev`.
2. In `psql` or Drizzle Studio (`pnpm db:studio`), set the dev account's zone to
   null: `UPDATE "user" SET timezone = NULL WHERE email = 'dev@quincy.test';`
3. Sign in as `dev@quincy.test` (password is in `.env.local`; auth is rate
   limited to 5 sign-ins per 60s, so do not retry in a loop).
4. Visit `/lineup` and note the times shown.
5. Navigate to `/drafts` and back to `/lineup` **without a hard refresh**.
6. The times must now be in your local zone rather than UTC. Before this fix they
   stayed UTC for five minutes.

Report what you observed at steps 4 and 6. If the times do not change at step 6,
that is a STOP condition.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0 with no fewer tests passing than before
- [ ] `pnpm build` prints `✓ Compiled successfully`
- [ ] `pnpm lint` output is exactly `✖ 1 problem (1 error, 0 warnings)` naming
      `hooks/use-mobile.ts`
- [ ] `grep -n "db.update" "app/(app)/actions.ts"` returns no matches
- [ ] `git status --short` shows only `app/(app)/actions.ts` modified
- [ ] The manual check in "Test plan" was run and its result reported
- [ ] `advisor-plans/README.md` status row updated

## STOP conditions

Stop and report back (do not improvise) if:

- The code in `app/(app)/actions.ts` does not match the excerpt in "Current
  state" — the file has drifted since this plan was written.
- `auth.api.updateUser` rejects the `timezone` field with a "not allowed to be
  set" error. That would mean `timezone` has been changed to `input: false` in
  `lib/auth.ts`, and this plan's approach no longer applies.
- The manual check shows the times still do not update after a soft navigation.
  Do not then reach for `revalidatePath`, `router.refresh()`, or disabling the
  cookie cache — report instead. Those all treat the symptom and the first two
  cannot fix a stale cookie at all.
- Typecheck fails in a file you did not edit.

## Maintenance notes

- **What a reviewer should scrutinize**: that the three guards survived the
  rewrite, and that `cookieCache` in `lib/auth.ts` is untouched.
- **Interaction with plan 006**: that plan adds a validator to the `timezone`
  field in `lib/auth.ts`. Once it lands, `auth.api.updateUser` will also run
  that validator, which is correct and desirable — the action's own
  `isValidTimeZone` guard becomes a cheap early return rather than the only
  check. Neither plan needs the other; either order works.
- **Deferred out of this plan**: there is still no way for a user to *change*
  their timezone once set. `rememberTimeZone` fills a blank and refuses to
  correct one, on purpose. A settings surface is its own piece of work, and it
  will need to answer what happens to already-queued posts — see the note in
  plan 008's maintenance section.
