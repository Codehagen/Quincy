# Plan 004: Make the rate limiter count per user, not per deployment

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `advisor-plans/README.md`.
>
> **Drift check (run first)**:
>
> ```bash
> grep -n "advanced:" -A 4 lib/auth.ts
> grep -n "forget-password" lib/auth.ts
> ```
>
> Expected: `advanced` contains only `useSecureCookies`, and
> `"/forget-password"` appears once inside `rateLimit.customRules`. If
> `advanced` already contains an `ipAddress` block, someone has started this
> work — that is a STOP condition.

## Status

- **Priority**: P2 — downgraded from P1. The investigation that carried the P1
  weight (Step 1) is done and came back clean; what remains is a dead config
  key and the write-up.
- **Effort**: S
- **Risk**: LOW — no behavioural change. The renamed key resolves to the same
  3-per-60s limit better-auth was already applying by default.
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `17f6b7c`, 2026-08-03 (refreshed against main after the Stripe work merged)

## Why this matters

Two problems in the same eight lines of `lib/auth.ts`, both found by reading
better-auth's source rather than the app's.

> **Measured 2026-08-03: problem 1 below is NOT real.** Production resolves a
> real client IP and already buckets per user. It is left in place because the
> reasoning is what justifies *not* touching the config, and because a future
> reader will otherwise re-derive the same worry. Only problem 2 needs fixing.

**1. The rate limiter may be sharing one bucket across every user.** *(ruled
out by measurement — see Step 1.)*
better-auth keys each limit as `` `${clientIP}|${path}` ``. When it cannot
resolve a client IP it falls back to the literal string `no-trusted-ip`, which
means one global bucket per path. With this app's configured limits that would
be **5 sign-ins per minute for the entire deployment**, not per person — a
handful of people logging in at once would lock everyone else out, and it would
look like an outage with no error in the app's own logs.

The resolution rule is strict. From
`node_modules/@better-auth/core/dist/utils/ip.mjs`:

- `getIp` (line 201) reads `x-forwarded-for` by default.
- `getIPFromHeader` (line 188): **`if (forwardedIps.length !== 1) return null;`**
  — with no `trustedProxies` configured, a header carrying more than one
  comma-separated address is rejected outright.
- Line 215: in development and test it falls back to `127.0.0.1`, which is
  exactly why this is invisible locally.

`lib/auth.ts:244-246` configures only `useSecureCookies`; there is no
`advanced.ipAddress` block, so no `ipAddressHeaders` and no `trustedProxies`.
Whether this actually bites depends on how many addresses Vercel puts in
`x-forwarded-for` for this deployment — which is why **Step 1 is a measurement,
not a change.**

**2. One rate-limit rule guards a route that does not exist.**
`lib/auth.ts:182` sets a rule for `"/forget-password"`. Probed against the
running app on 2026-08-02:

```
POST /api/auth/forget-password      → 404
POST /api/auth/request-password-reset → 200
```

better-auth 1.6.25 names that endpoint `/request-password-reset`
(`node_modules/better-auth/dist/api/routes/password.mjs:20`). The rule is dead
configuration. It causes no harm today only because better-auth's built-in
default for `/request-password-reset` happens to be the same 3-per-60s
(`rate-limiter/index.mjs:377-382`) — so the line reads as an enforced decision
while enforcing nothing, and editing its numbers would silently do nothing.

## Current state

`lib/auth.ts:176-191` — the rate limit block as it stands:

```ts
  rateLimit: {
    enabled: true,
    storage: "database",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-up/email": { window: 60, max: 3 },
      "/forget-password": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 5 },
      // The reason `sendOnSignIn` is off, made explicit. This endpoint takes an
      // arbitrary address from an unauthenticated caller and sends mail to it,
      // which is the same mail-bomb primitive — the difference is that here the
      // limit is the control rather than the absence of the feature. Matched to
      // /forget-password, the other unauthenticated sender.
      "/send-verification-email": { window: 60, max: 3 },
    },
  },
```

`lib/auth.ts:244-246`:

```ts
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
  },
```

Deployment target is Vercel (`vercel.json` at the repo root). The rate-limit
counters live in the `rate_limit` table (`lib/schema.ts:89-94`).

Of the four endpoints named in `customRules`, three are real
(`/sign-in/email`, `/sign-up/email`, `/reset-password`, plus the
`/send-verification-email` entry) and one — `/forget-password` — is a 404.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0, no output |
| Lint | `pnpm exec eslint lib` | exit 0 (repo-wide `pnpm lint` has 3 pre-existing errors in `components/rhythm-settings-dialog.tsx` and `hooks/use-mobile.ts` — not yours) |
| Unit tests | `pnpm test` | exit 0; 3 files, 29 tests |
| Build | `pnpm build` | exit 0 |
| Dev server | `pnpm dev` | serves on `http://localhost:3000` |
| Production logs | `npx vercel logs <deployment-url>` | streams recent logs |

## Scope

**In scope**:

- `lib/auth.ts` — the `rateLimit.customRules` keys and the `advanced` block
- `AGENTS.md` — record whatever Step 1 measures

**Out of scope** (do NOT touch):

- The rate limit **numbers** (`window` / `max`). This plan fixes *who gets
  counted*, not *how many are allowed*. Changing both at once makes the effect
  unmeasurable.
- `components/auth/**` — no UI change belongs in this plan.
- `proxy.ts` — do not attempt to rewrite headers there to work around IP
  resolution. If that looks necessary, STOP and report.
- `lib/schema.ts` and the `rate_limit` table shape.
- Any switch away from `storage: "database"`. It is correct for serverless and
  the comment at `lib/auth.ts:165-175` explains why.

## Git workflow

- Branch: `advisor/004-rate-limit-ip-resolution`
- Commit style: conventional prefix + prose subject; use `fix:`. Example:
  ```
  def2b69  fix: teach tailwind-merge the role scale
  ```
- **Do NOT push or open a PR.**

## Steps

### Step 1: ALREADY DONE — the measurement came back RESOLVES

**Do not redo this step, and do not perform Steps 2 or 3.** The measurement was
carried out on 2026-08-03 and the answer is **RESOLVES**: production already
buckets rate limits per client IP. There is no shared-bucket bug to fix.

How it was measured, recorded so nobody has to re-derive it: one
enumeration-safe `POST /api/auth/send-verification-email` was sent to
`https://hirequincy.com` with an address that does not exist (that endpoint
answers `{"status":true}` for unknown addresses without sending mail). The
rate-limit row it created was then read from the shared Neon `rate_limit`
table. better-auth builds that row's key as `` `${clientIP}|${path}` ``, so the
key itself is the answer:

```
key = <a real IPv4 address>|/send-verification-email   → RESOLVES
key = no-trusted-ip|/send-verification-email           → would have been FALLS BACK
```

The key carried a real address. Vercel sends a single-value `x-forwarded-for`,
which is exactly the shape `getIPFromHeader` accepts without a `trustedProxies`
list. The probe row was deleted afterwards.

**Therefore: skip Step 2 and Step 3 entirely.** Do not add an
`advanced.ipAddress` block. Adding `trustedProxies` when the default already
works would make a spoofable header authoritative — strictly worse than
leaving it alone. Go straight to Step 4.

<details>
<summary>Original Step 1 instructions, kept for the record</summary>

**Do not change any configuration before completing this step.** The fix
depends on what Vercel actually sends.

better-auth logs a specific warning, exactly once per process, when it falls
back to the shared bucket (`rate-limiter/index.mjs:283`):

> `Rate limiting could not determine a client IP and is falling back to a single shared per-path bucket.`

Two ways to find out; do at least one:

- **(a) Read production logs.** Deploy nothing; just inspect recent logs for
  that warning string after a few real sign-ins have happened:
  ```bash
  npx vercel logs <production-deployment-url> | grep -i "could not determine a client IP"
  ```
- **(b) Observe the header directly.** In a Server Component or route handler
  the app already has, read `x-forwarded-for` from `headers()` and log how many
  comma-separated values it carries. If you add such a probe, remove it before
  finishing — the done criteria check `lib/auth.ts` and `proxy.ts` are clean.

Record the answer as one of:

- **RESOLVES** — a single address; the limiter is already per-user. Then Steps
  2 and 3 are unnecessary; skip to Step 4 and note the finding as verified-safe.
- **FALLS BACK** — the warning appears, or the header carries 2+ addresses.
  Continue to Step 2.
- **UNKNOWN** — no production access. STOP and report; do not guess-configure
  `trustedProxies`, because a wrong trusted-proxy list is worse than none (it
  makes a spoofable header authoritative).

**Verify**: you can state which of the three applies, with the command output
that shows it.

</details>

### Step 2: Configure IP resolution (only if Step 1 said FALLS BACK)

Add an `ipAddress` block to `advanced` in `lib/auth.ts`. On Vercel the client
address is the **first** entry of `x-forwarded-for`, and Vercel also sets
`x-real-ip` to the client address as a single value — which is the easier one to
consume safely, because better-auth trusts a single-value header without any
proxy configuration.

Preferred shape:

```ts
  advanced: {
    useSecureCookies: process.env.NODE_ENV === "production",
    ipAddress: {
      // Vercel sets x-real-ip to a single client address, which is what
      // better-auth trusts without a trustedProxies list. x-forwarded-for is
      // a chain here, and better-auth rejects a multi-value header outright
      // rather than trust its leftmost (spoofable) entry — which silently
      // collapses every user into one shared rate-limit bucket.
      ipAddressHeaders: ["x-real-ip", "x-forwarded-for"],
    },
  },
```

Order matters: `getIp` walks the list and takes the first header that resolves.

**Do not** add `trustedProxies` unless Step 1 proved `x-real-ip` is absent and
you have Vercel's actual proxy ranges. An incorrect list makes a spoofable
header authoritative, which is a worse failure than the shared bucket.

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Confirm the buckets separate (only if Step 2 was done)

Locally, `pnpm dev`, then confirm two different synthetic clients get
independent budgets. Send 6 sign-in attempts with one header value and 1 with
another; the 6th of the first must be `429` while the single request from the
second is **not**:

```bash
for i in 1 2 3 4 5 6; do
  curl -s -o /dev/null -w "A$i=%{http_code} " -X POST http://localhost:3000/api/auth/sign-in/email \
    -H 'Content-Type: application/json' -H 'x-real-ip: 203.0.113.10' \
    -d '{"email":"nobody@quincy.test","password":"wrong-on-purpose"}'
done; echo
curl -s -o /dev/null -w "B1=%{http_code}\n" -X POST http://localhost:3000/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'x-real-ip: 203.0.113.11' \
  -d '{"email":"nobody@quincy.test","password":"wrong-on-purpose"}'
```

Expected: `A1..A5=401 A6=429` and `B1=401`. If `B1=429`, the buckets are still
shared and Step 2 did not take effect.

`203.0.113.0/24` is the reserved documentation range, so these cannot collide
with a real user's bucket. Afterwards, delete the rows they created:

```sql
DELETE FROM rate_limit WHERE key LIKE '203.0.113.%';
```

Run it through a short `tsx` script against `lib/db` rather than by hand in a
console.

**Verify**: the curl output matches the expected pattern above.

### Step 4: Fix the dead rate-limit rule

In `lib/auth.ts`, rename the `customRules` key `"/forget-password"` to
`"/request-password-reset"`, keeping `{ window: 60, max: 3 }` unchanged. Update
the trailing comment on the `/send-verification-email` entry, which currently
says "Matched to /forget-password, the other unauthenticated sender" — the
sentence is right, the path name in it is not.

Add a short comment noting these keys must be real better-auth route paths,
since an unmatched key fails silently.

**Verify**: `grep -n "forget-password" lib/auth.ts` → no matches (exit 1). Then
`npx tsc --noEmit` → exit 0.

### Step 5: Confirm the renamed rule is live

With `pnpm dev` running, confirm `/request-password-reset` is limited at 3 per
60s:

```bash
for i in 1 2 3 4; do
  curl -s -o /dev/null -w "$i=%{http_code} " -X POST http://localhost:3000/api/auth/request-password-reset \
    -H 'Content-Type: application/json' -H 'x-real-ip: 203.0.113.12' \
    -d '{"email":"nobody@quincy.test","redirectTo":"/reset-password"}'
done; echo
```

Expected: `1=200 2=200 3=200 4=429`. Clean up the `203.0.113.12` rows as in
Step 3.

Note: this returns the same `200` for a non-existent address by design — the
endpoint is enumeration-safe.

**Verify**: output matches `1=200 2=200 3=200 4=429`.

### Step 6: Write down what was measured

Add a short paragraph to `AGENTS.md` in the "Signing in locally" section
recording: which header the limiter resolves the client IP from, that a
multi-value `x-forwarded-for` resolves to `null` and collapses everyone into one
bucket, and that `customRules` keys must match real better-auth paths or they
are ignored silently.

This is the whole point of the plan — the next person to touch these lines
should not have to re-derive it from `node_modules`.

**Verify**: `grep -n "x-real-ip\|shared per-path bucket" AGENTS.md` → ≥1 match.

## Test plan

No unit test framework exists in this repo.

- Steps 3 and 5 are the tests; both are commands with exact expected output.
- If plan `002` has landed, re-run
  `npx tsx --env-file=.env.local scripts/verify-auth-recovery.ts` → exit 0.
  That script sends a **single-value** `x-forwarded-for`, so a change to
  `ipAddressHeaders` ordering could alter which header it resolves from. If it
  fails, adjust the script's header rather than this config, and say so.
- Run `npx next build` → exit 0.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] Step 1 was NOT redone (it is already answered: RESOLVES)
- [ ] No `ipAddress` block was added — `grep -c "ipAddress" lib/auth.ts` returns 0
- [ ] `grep -n "forget-password" lib/auth.ts` → no matches
- [ ] `grep -n "request-password-reset" lib/auth.ts` → 1 match
- [ ] Step 5 output is exactly `1=200 2=200 3=200 4=429`
- [ ] The rate-limit `window` / `max` numbers are unchanged —
      `git diff lib/auth.ts` shows no edits to any numeric value
- [ ] No rows remain in `rate_limit` with a key starting `203.0.113.`
- [ ] `pnpm typecheck`, `pnpm exec eslint lib`, `pnpm build`, `pnpm test` all exit 0
- [ ] `git status --short` shows only `lib/auth.ts` and `AGENTS.md` changed
- [ ] `advisor-plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 1 comes back **UNKNOWN** (no production log access). Guessing at
  `trustedProxies` is worse than leaving this alone.
- Vercel does not set `x-real-ip`, and the only option left is a
  `trustedProxies` list you would have to invent.
- Step 3 shows `B1=429` after Step 2 — the buckets are still shared and the
  cause is something this plan did not anticipate.
- You conclude `proxy.ts` needs to rewrite or synthesize a header.
- Renaming the rule changes observed behavior in a way Step 5 does not predict
  (e.g. the limit becomes 5, or disappears).
- Any verification fails twice after a reasonable fix attempt.

## Maintenance notes

- **`customRules` keys fail silently.** An unmatched path is not an error, it is
  simply never applied, and better-auth's built-in defaults quietly take over.
  Any future key added there should be probed with `curl` once to confirm the
  route exists — that is how the `/forget-password` rule survived unnoticed.
- **`trustedProxies` is a security control, not a convenience.** It tells
  better-auth which hops may be stripped from `x-forwarded-for`; a too-broad
  list lets a client spoof its own address and evade every rate limit. Prefer a
  single-value header.
- The `isDevelopment()` fallback to `127.0.0.1` means **this class of bug is
  structurally invisible locally.** Any future change to rate limiting should be
  checked against production logs, not just `pnpm dev`.
- A reviewer should confirm the numbers did not move: this plan is only about
  which bucket a request lands in.
- Deferred: no alerting on the "could not determine a client IP" warning. Worth
  considering if this project ever adds log-based monitoring.
