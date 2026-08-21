# Plan 002: Lock the sign-in failure contract behind a verify script

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> git log --oneline -1
> ls scripts/
> ```
>
> This plan does NOT depend on plan 001. The script asserts better-auth's own
> server behaviour (which status each failure returns), and that is true on
> `main` today whether or not 001's UI change has merged. Do not check for it.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none (see the drift-check note — the 001 dependency was over-stated and has been removed)
- **Category**: tests
- **Planned at**: commit `17f6b7c`, 2026-08-03 (refreshed against main after the Stripe work merged)

## Why this matters

The sign-in surface distinguishes three failures by status code, and getting
that mapping wrong has already cost this project real time twice: once when an
unverified account was reported as a wrong password, and again when the
*correction* to that bug was written against a documented status code that
turned out to be false. Both mistakes were invisible to `tsc`, to `eslint`, and
to `next build`. Nothing in the repo asserts the contract.

This plan writes `scripts/verify-auth-recovery.ts`, following the four existing
`scripts/verify-*.ts` scripts, so the mapping is checked by running it rather
than by remembering it. It also pins the two properties of
`/send-verification-email` that must not be "improved" away: the uniform
response that prevents account enumeration, and the rate limit.

The repo does have vitest now (`pnpm test`, `vitest.config.ts`), but its suites
are pure-function tests running in a `node` environment with no database —
`lib/billing.test.ts` and `lib/subscription-status.test.ts`. What this plan
needs is the opposite: a real Neon connection and better-auth's full HTTP
pipeline including the rate limiter. That is what `scripts/verify-*.ts` is for,
and the convention is already established for exactly this kind of
easy-to-get-backwards invariant. **Write a script, not a vitest suite** —
putting a network- and database-dependent test into `pnpm test` would make the
fast suite slow and flaky.
`scripts/verify-mail.ts:4-10` states the rule outright: write a script when the
behavior "is easy to get backwards" or is "invisible in the preview."

## Current state

### The four existing verify scripts

- `scripts/verify-brain.ts` — brain layer invariants against Neon
- `scripts/verify-heartbeat.ts` — capture → compile loop
- `scripts/verify-persistence.ts` — conversation persistence
- `scripts/verify-mail.ts` — mail templates and idempotency keys, no network

None of them makes an HTTP request. They import library code and call it
directly. None is wired into `package.json`; all are run by hand.

### The shared shape to copy

Every script opens with a docblock naming the run command and *why the script
exists*, then defines a local `check`. From `scripts/verify-persistence.ts:1-22`:

```ts
/**
 * Exercises the real persistence path without a model in the loop.
 * Run with: npx tsx --env-file=.env.local scripts/verify-persistence.ts
 */
import type { UIMessage } from "ai"
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
...

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}
```

and closes with (`scripts/verify-mail.ts`, last 4 lines):

```ts
main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

Match both ends exactly.

### The contract to assert

Measured against the running app on 2026-08-02:

| Situation | Status | `code` in body |
|---|---|---|
| Wrong password | `401` | `INVALID_EMAIL_OR_PASSWORD` |
| Unverified account, correct password | `403` | `EMAIL_NOT_VERIFIED` |
| Rate limited | `429` | **absent** |
| Resend, unknown address | `200` | body `{"status":true}` |
| Resend, already-verified address | `200` | body `{"status":true}`, no mail sent |
| Resend, 4th call inside 60s | `429` | — |

### How to drive the auth stack from a script

`app/api/auth/[...all]/route.ts` is only:

```ts
import { toNextJsHandler } from "better-auth/next-js"
import { auth } from "@/lib/auth"
export const { GET, POST } = toNextJsHandler(auth.handler)
```

So `auth.handler(request)` runs the entire pipeline — including rate limiting —
against a plain `Request`. **Use `auth.handler`, not `auth.api.*`**: the
`auth.api.*` helpers bypass the HTTP layer, and the rate limiter lives there.
No dev server is required.

### How the rate limiter picks its bucket

`node_modules/@better-auth/core/dist/utils/ip.mjs` resolves the client IP from
the `x-forwarded-for` header. Two facts matter for this script:

1. With no `trustedProxies` configured, a header holding **more than one**
   comma-separated value is rejected and the IP resolves to `null`
   (`getIPFromHeader`, line 188). Send a **single** value.
2. The bucket key is `` `${ip}|${path}` `` (`createRateLimitKey`, line 227), and
   rows live in the `rate_limit` table — `lib/schema.ts:89-94`, exported as
   `rateLimit` with columns `id`, `key`, `count`, `lastRequest`.

So the script must send a synthetic IP no real user will have, and delete that
IP's rows before and after, or the second run of the day starts pre-limited.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Run the new script | `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` | exit 0, all lines `PASS` |
| Run an existing one (shape reference) | `npx tsx --env-file=.env.local scripts/verify-mail.ts` | exit 0, all lines `PASS` |
| Typecheck | `pnpm typecheck` | exit 0, no output |
| Lint | `pnpm exec eslint scripts` | exit 0, no output |
| Existing suite | `pnpm test` | exit 0; 3 files, 29 tests (must stay green) |

## Scope

**In scope**:

- `scripts/verify-auth-recovery.ts` (create — this is the only new file)
- `AGENTS.md` (one line added to the "Signing in locally" section, Step 5)

**Out of scope** (do NOT touch):

- `lib/auth.ts` — this script observes the config; it must not change it. In
  particular do **not** lower a rate limit, and do **not** add an `ipAddress`
  block. That configuration question is plan `004`; changing it here would
  invalidate this script's own assumptions.
- `components/auth/**` — plan 001 owns those files.
- The other four `scripts/verify-*.ts` files.
- `package.json` — do not add a `test` script. These scripts are run by hand by
  convention; wiring one in implies a suite that does not exist.

## Git workflow

- Branch: `advisor/002-verify-auth-recovery`
- Commit style: conventional prefix + prose subject. Use `test:` or `chore:`.
  Examples from `git log --oneline -3`:
  ```
  06aa929  chore: a local account that can actually sign in
  8b88f54  feat: the brain as a document, and a cache in front of it
  def2b69  fix: teach tailwind-merge the role scale
  ```
- **Do NOT push or open a PR.**

## How verification is split (read before starting)

**You cannot run the script you are writing.** It needs `.env.local` (a Neon
connection and better-auth secrets), which is gitignored and absent from your
worktree. Do not copy secrets in, do not invent them, and do not start a dev
server.

So the work divides:

- **You**: write `scripts/verify-auth-recovery.ts` so it is correct by
  construction. Your verifications are `pnpm typecheck`, `pnpm exec eslint
  scripts`, and `pnpm test` staying green. Where a step below says "run the
  script", instead confirm the code for that step exists and typechecks, and
  mark the run itself SKIPPED with the reason.
- **Your reviewer**: runs the script against the real database, including
  Step 6's deliberate-failure check.

This makes it doubly important that the script is readable and that each
`check(...)` label says exactly what it asserts — the reviewer is reading its
output cold to decide whether it actually tests anything.

## Steps

### Step 1: Create the script skeleton

Create `scripts/verify-auth-recovery.ts` with:

- A docblock matching the convention: one line on what it exercises, the
  `Run with: npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts`
  line, and two or three sentences on why this needs a script (the status codes
  are easy to get backwards and have been documented wrongly before).
- The `check(label, ok, detail)` helper copied verbatim from
  `scripts/verify-persistence.ts:18-22`.
- A `main()` and the `main().catch(...)` tail copied from
  `scripts/verify-mail.ts`.
- Constants:
  ```ts
  const TEST_IP = "203.0.113.42" // TEST-NET-3, never a real client
  const BASE = "http://localhost:3000/api/auth"
  ```
  `203.0.113.0/24` is reserved for documentation, so it cannot collide with a
  real user's bucket.
- A `post(path, body)` helper that calls
  `auth.handler(new Request(`${BASE}${path}`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": TEST_IP }, body: JSON.stringify(body) }))`
  and returns `{ status, json }`.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 2: Add rate-limit bucket cleanup

Write a `clearBuckets()` function that deletes rows from the `rateLimit` table
whose `key` starts with `${TEST_IP}|`. Import `rateLimit` from `../lib/schema`
and `db` from `../lib/db`; use drizzle's `like` operator.

Call it at the **start** of `main()` and again in a `finally` block at the end.
Starting dirty is the failure mode that makes this script flaky.

**Verify**: run the script (it will not assert anything yet) →
exit 0, no crash.

### Step 3: Create and tear down a disposable unverified account

Inside `main()`, create a fresh account to test against:

- Address: `verify-recovery@quincy.test`. Hardcode it.
- Create it via `post("/sign-up/email", { name, email, password })`.
- At the end, in the same `finally` as `clearBuckets()`, delete that user by
  **exact email equality** from the `user` table (`import { user } from
  "../lib/schema"`, `eq(user.email, ...)`).

**Do not** delete by pattern. `AGENTS.md` records that `dev@quincy.test` and
`christer@quincy.test` live in the same database, and
`scripts/verify-*.ts` teardown deleting more than it created has already
destroyed a working account in this repo once.

If the account already exists from a previous interrupted run, the signup
returns a synthetic success rather than an error (see `AGENTS.md`) — so do not
assert on the signup's status here; just proceed, and let the teardown clean up.

**Verify**: run the script → exit 0, and
`npx tsx --env-file=.env.local -e "import {db} from './lib/db'; import {user} from './lib/schema'; import {eq} from 'drizzle-orm'; console.log(await db.select().from(user).where(eq(user.email,'verify-recovery@quincy.test')))"`
→ prints `[]` (the teardown removed it).

### Step 4: Assert the sign-in status contract

Add checks, each one a `check(...)` call:

1. `"wrong password is 401 INVALID_EMAIL_OR_PASSWORD"` — post to
   `/sign-in/email` with the test address and a deliberately wrong password;
   assert `status === 401` and `json.code === "INVALID_EMAIL_OR_PASSWORD"`.
2. `"unverified account is 403 EMAIL_NOT_VERIFIED"` — post with the **correct**
   password; assert `status === 403` and `json.code === "EMAIL_NOT_VERIFIED"`.
3. `"a wrong password never reveals verification state"` — assert that the
   response body from check 1 does **not** contain `EMAIL_NOT_VERIFIED`. This
   is the property that lets the login form name the address on screen without
   leaking who has an account; if it ever changes, the UI copy becomes a leak.
4. `"rate limited is 429 with no code field"` — post to `/sign-in/email` enough
   times to exceed 5 in the window, then assert `status === 429` and
   `json.code === undefined`. The missing `code` is the specific fact that made
   the login form mis-report rate limiting, so assert it explicitly rather than
   only asserting the status.

Call `clearBuckets()` between check 3 and check 4 so the earlier attempts do not
count toward the limit under test.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` →
exit 0, four `PASS` lines for the above.

### Step 5: Assert the resend contract

Add checks against `/send-verification-email`:

1. `"resend to an unknown address returns 200 status:true"` — post with an
   address that does not exist; assert `status === 200` and
   `json.status === true`.
2. `"resend to an unverified address returns the identical response"` — post
   with the test account's address; assert the same. The two responses being
   indistinguishable is what prevents account enumeration.
3. `"resend is limited to 3 per 60s"` — after `clearBuckets()`, post four
   times; assert the first three are `200` and the fourth is `429`.

Note in a comment that these calls do attempt real Resend deliveries to
`@quincy.test`, which is not a deliverable domain — that is expected and costs
nothing, and is why the test address must stay on `@quincy.test`.

Then add one line to `AGENTS.md` in the "Signing in locally" section pointing at
the new script: run it whenever `lib/auth.ts` or `components/auth/**` changes.

**Verify**: `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` →
exit 0, all lines `PASS`. Then `grep -n "verify-auth-recovery" AGENTS.md` → 1
match.

### Step 6: Confirm the script actually fails when the contract breaks

A test that cannot fail is not a test. Temporarily change one assertion to the
wrong expected value (for example assert `401` where the contract says `403`),
run the script, and confirm it prints `FAIL` and exits non-zero. **Then revert
that change.**

**Verify**: after reverting,
`npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` → exit 0, all
`PASS`; `git diff scripts/verify-auth-recovery.ts` shows no leftover edit.

## Test plan

This plan's deliverable *is* the test. Its own verification is Step 6 — proving
the script fails when the contract is violated and passes when it holds.

Run the four pre-existing scripts once at the end to confirm nothing regressed:

```bash
npx tsx --env-file=.env.local scripts/verify-mail.ts
npx tsx --env-file=.env.local scripts/verify-brain.ts
npx tsx --env-file=.env.local scripts/verify-heartbeat.ts
npx tsx --env-file=.env.local scripts/verify-persistence.ts
```

All four must exit 0. If one of them was already failing before you started,
say so in your report rather than fixing it — that is out of scope.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `scripts/verify-auth-recovery.ts` exists
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm exec eslint scripts` exits 0
- [ ] `pnpm test` still passes (3 files, 29 tests)
- [ ] The script defines at least 7 distinct `check(...)` calls covering the
      contract table above — verifiable by reading, without running it
- [ ] REVIEWER ONLY: `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts`
      exits 0 with every line `PASS`
- [ ] The script asserts all three sign-in statuses (401, 403, 429) and the
      absent `code` on 429 — `grep -c "429" scripts/verify-auth-recovery.ts`
      returns ≥ 2
- [ ] REVIEWER ONLY: running the script twice in a row both times exits 0
      (proves bucket cleanup works)
- [ ] REVIEWER ONLY: `verify-recovery@quincy.test` does not exist in the database afterwards
- [ ] `grep -n "verify-auth-recovery" AGENTS.md` → 1 match
- [ ] `git status --short` shows only `scripts/verify-auth-recovery.ts` and
      `AGENTS.md` changed
- [ ] `advisor-plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `auth.handler` does not apply rate limiting when called directly with a
  `Request` (check 4 never returns 429 no matter how many calls). Do not work
  around it by calling the limiter directly or by lowering the limit — report
  the finding instead.
- The teardown cannot delete the test user because of a foreign-key constraint.
  Report it; do not start deleting from other tables to force it through.
- You find yourself needing to modify `lib/auth.ts` for any reason.
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **Run this after any better-auth upgrade.** The status codes are library
  behavior, not app behavior. This script exists precisely so an upgrade that
  changes them surfaces as a `FAIL` rather than as a user who cannot log in.
- The synthetic IP (`203.0.113.42`) is load-bearing in two ways: it keeps the
  script out of real users' rate-limit buckets, and it must stay a **single**
  value in `x-forwarded-for`. A comma-separated value resolves to `null` and
  silently moves the test into the shared fallback bucket.
- If plan `004` lands and configures `advanced.ipAddress`, re-run this script —
  `trustedProxies` changes how the header is parsed, and the synthetic IP may
  need to be adjusted to fall outside the trusted ranges.
- A reviewer should check that the teardown deletes by exact email equality and
  never by pattern.
- Deferred: no CI wiring. Nothing in this repo runs on CI today, and adding a
  workflow for one script is a larger decision than this plan should make.
