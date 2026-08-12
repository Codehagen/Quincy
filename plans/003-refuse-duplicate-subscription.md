# Plan 003: Refuse a second subscription on the server, not just in the UI

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fee31fe..HEAD -- lib/auth.ts lib/billing.ts`
> If either file changed since this plan was written, compare the "Current
> state" excerpts against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — touches the auth configuration, which every request goes through
- **Depends on**: `plans/001-test-baseline-vitest.md`, `plans/002-abandoned-checkout-not-lapsed.md`
- **Category**: security
- **Planned at**: commit `fee31fe`, 2026-08-02

## Why this matters

Nothing on the server stops one account from opening two subscriptions and
being charged $49 twice a month, forever.

The Better Auth Stripe plugin's own documentation is explicit about this:

> The plugin only supports one active or trialing subscription per reference ID
> at a time. If the user already has an active subscription, you **must**
> provide the `subscriptionId` parameter when upgrading. Otherwise, a new
> subscription may be created alongside the existing one, resulting in
> duplicate billing.

Today the only thing preventing that is the billing page hiding the Subscribe
button when `getBillingSnapshot().subscribed` is true. That is presentation, not
enforcement. `POST /api/auth/subscription/upgrade` remains reachable by anyone
with a session cookie, and there are ordinary ways to reach it twice:

- Two browser tabs on the billing page, one opened before the first payment
  completed — the second still shows a live Subscribe button.
- A double click fast enough to beat the React state update that disables it.
- Any direct request.

The failure is silent and expensive: the customer is billed twice and finds out
on their statement. Refunding is manual, and it is the worst possible first
experience of paying for the product.

## Current state

### Where the guard goes

The Stripe plugin exposes exactly the right extension point:
`subscription.authorizeReference`. Verified in the installed package —
`node_modules/@better-auth/stripe/dist/index.mjs` calls it as:

```js
if (!await subscriptionOptions.authorizeReference({
    user: ctxSession.user,
    session: ctxSession.session,
    referenceId,
    action
}, ctx)) throw APIError$1.from("UNAUTHORIZED", STRIPE_ERROR_CODES.UNAUTHORIZED);
```

Returning `false` aborts the request with `UNAUTHORIZED`. The `action` values
that reach it, confirmed by grepping the same file, are exactly:

```
"upgrade-subscription"
"cancel-subscription"
"restore-subscription"
"list-subscription"
"billing-portal"
```

**This is the critical hazard of this plan**: once `authorizeReference` is
defined, it governs *all five* actions. A function that forgets to return
`true` for the other four will lock users out of cancelling their own
subscription and out of the billing portal. Default to allow; deny only the one
case.

### `lib/auth.ts` today, lines 226-256

```ts
    stripe({
      stripeClient,
      stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
      createCustomerOnSignUp: true,
      subscription: {
        enabled: true,
        requireEmailVerification: true,
        plans: [{ name: PLAN_NAME, lookupKey: PLAN_LOOKUP_KEY }],
      },
    }),
```

(The block carries a long explanatory comment above it; leave that comment
intact and add to the `subscription` object.)

### The import-cycle trap — read this before writing any code

`lib/auth.ts` must **not** import `lib/billing.ts`. The chain is:

```
lib/billing.ts  ->  lib/session.ts  ->  lib/auth.ts
```

Importing `lib/billing.ts` from `lib/auth.ts` closes that loop. Depending on
module evaluation order this surfaces as `undefined is not a function` at
startup, or worse, works in dev and fails in the production build.

The fix is a new leaf module that imports only `drizzle-orm`, `lib/db` and
`lib/schema`, and is imported by both. That module is what step 1 creates.

### Status sets to move

After plan 002, `lib/billing.ts` contains:

```ts
/** Stripe statuses that mean the money is currently good. */
const GOOD_STATUSES = new Set(["active", "trialing"])

const LAPSED_STATUSES = new Set(["past_due", "canceled", "unpaid"])
```

(`LAPSED_STATUSES` carries a longer comment added by plan 002 — move it with
the declaration.)

Repo conventions: comments explain *why* in prose above the decision — see
`lib/trial.ts`. `pnpm` only. Prettier configured; run `pnpm format` if lint
complains about formatting.

## Commands you will need

| Purpose   | Command          | Expected on success                       |
|-----------|------------------|-------------------------------------------|
| Typecheck | `pnpm typecheck` | exit 0                                    |
| Tests     | `pnpm test`      | exit 0, all pass                          |
| Lint      | `pnpm lint`      | exit 1 with exactly 3 pre-existing errors |

`pnpm lint` fails before you touch anything: 3 known errors in
`components/rhythm-settings-dialog.tsx` (2) and `hooks/use-mobile.ts` (1). Do
not fix them; do not add a fourth.

## Scope

**In scope**:
- `lib/subscription-status.ts` (create)
- `lib/billing.ts` (import the sets from the new module instead of declaring them)
- `lib/auth.ts` (add `authorizeReference`)
- `lib/subscription-status.test.ts` (create)

**Out of scope** (do NOT touch):
- `components/billing/billing-actions.tsx` — the client-side `pending` guard
  stays exactly as it is. It is a UX affordance, and this plan adds the
  enforcement underneath it; removing either one is wrong.
- `app/(app)/settings/billing/page.tsx` — hiding the button when already
  subscribed is still correct.
- `lib/schema.ts` — generated by `pnpm auth:generate`.
- Anything to do with *changing* plans. There is one plan. Plan-switching would
  need `subscriptionId` threading and is a separate piece of work.
- The other four `authorizeReference` actions — allow them, do not add policy
  to them in this plan.

## Git workflow

- Branch: `advisor/003-refuse-duplicate-subscription`
- Conventional commits, lowercase, matching `git log`
  (`fix: teach tailwind-merge the role scale`).
  Suggested: `fix: refuse a second subscription on the server`
- Do NOT push or open a PR.

## Steps

### Step 1: Create the leaf module `lib/subscription-status.ts`

This module must import **only** `drizzle-orm`, `./db` and `./schema`. Adding
any other import risks recreating the cycle described above.

```ts
import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"

/** Stripe statuses that mean the money is currently good. */
export const GOOD_STATUSES = new Set(["active", "trialing"])

/**
 * Statuses that mean money once worked and has stopped.
 *
 * Deliberately a list rather than "anything that is not good". The plugin
 * writes a row with status `incomplete` the moment checkout is *requested* —
 * before the payment form is even shown — so an abandoned checkout leaves a
 * row behind permanently, and it must not read as a past subscription.
 */
export const LAPSED_STATUSES = new Set(["past_due", "canceled", "unpaid"])

/**
 * Whether this reference already has a subscription Stripe considers live.
 *
 * Lives here, and not in lib/billing.ts, because lib/auth.ts needs it too and
 * lib/billing.ts imports lib/session.ts which imports lib/auth.ts. Closing that
 * loop breaks module initialisation in ways that show up at build time rather
 * than here.
 */
export async function hasLiveSubscription(referenceId: string): Promise<boolean> {
  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, referenceId))

  return rows.some((row) => row.status && GOOD_STATUSES.has(row.status))
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Point `lib/billing.ts` at the new module

Delete the local `GOOD_STATUSES` and `LAPSED_STATUSES` declarations from
`lib/billing.ts` and import them instead:

```ts
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
```

Everything else in `lib/billing.ts` stays as it is.

**Verify all three**:
- `grep -c "new Set(" lib/billing.ts` → `0`
- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0, all plan-001 and plan-002 tests still pass

### Step 3: Add `authorizeReference` to the Stripe plugin config

In `lib/auth.ts`, add the import:

```ts
import { hasLiveSubscription } from "./subscription-status"
```

Then add `authorizeReference` inside the existing `subscription` object, after
`plans`:

```ts
      subscription: {
        enabled: true,
        requireEmailVerification: true,
        plans: [{ name: PLAN_NAME, lookupKey: PLAN_LOOKUP_KEY }],
        /**
         * The server-side half of "one subscription per account".
         *
         * Hiding the Subscribe button once somebody has paid is presentation;
         * this is enforcement. The endpoint stays reachable with nothing but a
         * session cookie, and two tabs — or one fast double click — are enough
         * to open a second subscription beside the first. Better Auth does not
         * deduplicate: its own docs say upgrading without a `subscriptionId`
         * bills twice. The customer finds out on their statement.
         *
         * Default is allow. This hook governs all five subscription actions,
         * so denying by default would lock people out of cancelling and out of
         * the billing portal — the two things somebody unhappy about billing
         * most needs to reach.
         */
        authorizeReference: async ({ referenceId, action }) => {
          if (action !== "upgrade-subscription") {
            return true
          }

          return !(await hasLiveSubscription(referenceId))
        },
      },
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 4: Prove there is no import cycle

The cycle would not necessarily fail typecheck, so check it explicitly by
loading the auth module in isolation:

```
node --import tsx -e 'import("./lib/auth.ts").then(m => console.log("auth loaded:", Object.keys(m).join(", ")))'
```

**Verify**: prints `auth loaded: isGoogleEnabled, auth` (order may vary) and
exits 0. Any `ReferenceError`, `TypeError: ... is not a function`, or a hang is
the cycle — STOP.

### Step 5: Test the decision function

Create `lib/subscription-status.test.ts`, following the mocking structure
established in `lib/billing.test.ts` by plan 001:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
  rows: [] as Array<{ status: string | null }>,
}))

vi.mock("@/lib/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: async () => mocks.rows,
      }),
    }),
  },
}))

const { hasLiveSubscription } = await import("@/lib/subscription-status")

beforeEach(() => {
  mocks.rows = []
})

describe("hasLiveSubscription", () => {
  it("is false when there is no subscription at all", async () => {
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is true for an active subscription", async () => {
    mocks.rows = [{ status: "active" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })

  it("is true for a stripe-side trialing subscription", async () => {
    mocks.rows = [{ status: "trialing" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })

  it("is false for an abandoned checkout, so they can try again", async () => {
    mocks.rows = [{ status: "incomplete" }]
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is false for a cancelled subscription, so they can resubscribe", async () => {
    mocks.rows = [{ status: "canceled" }]
    expect(await hasLiveSubscription("u1")).toBe(false)
  })

  it("is true when any one row is live", async () => {
    mocks.rows = [{ status: "canceled" }, { status: "active" }]
    expect(await hasLiveSubscription("u1")).toBe(true)
  })
})
```

The last two cases are the ones that matter most: this guard must **not** trap
somebody who cancelled and wants to come back, and must not trap somebody whose
first checkout attempt failed.

**Verify**: `pnpm test` → exit 0, 6 new tests pass, all previous tests still pass.

### Step 6: Full check

**Verify all**:
- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0
- `pnpm lint 2>&1 | tail -3` → still exactly 3 problems
- `git status --short` → only the four in-scope files plus `plans/README.md`

## Test plan

New file `lib/subscription-status.test.ts`, 6 tests, modelled structurally on
`lib/billing.test.ts` (created by plan 001): `vi.hoisted` for mutable mock
rows, one `describe` per exported function, one behaviour per `it`.

Cases, chosen so that both failure directions are covered:

- **Under-blocking** (the bug this plan fixes): active → true; trialing → true;
  one live row among dead ones → true.
- **Over-blocking** (the regression this plan could introduce): no rows →
  false; `incomplete` → false; `canceled` → false.

Existing tests from plans 001 and 002 must all still pass after step 2 moves the
status sets — that move is the riskiest edit in this plan and those tests are
what catches it.

Verification: `pnpm test` → all pass, 18 tests total (12 after plan 002 + 6).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 with 18 passing tests
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `node --import tsx -e 'import("./lib/auth.ts").then(() => console.log("ok"))'`
      prints `ok` and exits 0
- [ ] `grep -n "authorizeReference" lib/auth.ts` returns exactly 1 match
- [ ] `grep -n "billing" lib/auth.ts` returns **no** matches — `lib/auth.ts`
      must not import `lib/billing.ts`
- [ ] `grep -c "new Set(" lib/billing.ts` returns `0`
- [ ] `git status --short` lists no files outside the in-scope list
- [ ] `plans/README.md` status row for 003 updated

## STOP conditions

Stop and report back (do not improvise) if:

- Step 4 reveals an import cycle (any error or hang loading `lib/auth.ts`).
  Do not try to break it by moving code around — report what the chain is.
- `lib/billing.ts` does not contain `LAPSED_STATUSES` — plan 002 has not run.
- The `authorizeReference` call signature in
  `node_modules/@better-auth/stripe/dist/index.mjs` does not match the excerpt
  in "Current state" (the installed plugin version differs from the one this
  plan was written against, `1.6.25`).
- Adding `authorizeReference` causes any existing test to fail, or causes
  `pnpm typecheck` to complain about the shape of its arguments — the typed
  signature may differ from the runtime call; report the type error rather than
  casting it away with `any`.
- You find yourself wanting to also block `cancel-subscription` or
  `billing-portal`. Out of scope, and dangerous.

## Maintenance notes

- **`authorizeReference` is now a chokepoint for five endpoints.** Any future
  addition to it must keep the "default allow, deny the specific case" shape. A
  reviewer should read it asking "what happens to the four actions this branch
  does not name?"
- The denial surfaces as `UNAUTHORIZED`, not a 409. The billing page currently
  renders `error.message` in place (see `components/billing/billing-actions.tsx`),
  so the user sees a generic authorisation message rather than "you already have
  a subscription". That is acceptable for a case they should never reach, but if
  it ever shows up in support it is worth a specific message — which would mean
  a wrapper route rather than this hook.
- **Organizations would change this.** If the organization plugin is ever added,
  `referenceId` stops being the user id and `authorizeReference` must also check
  that the caller is allowed to act for that organization — which is the reason
  the hook exists in the plugin at all. The current implementation ignores
  `user` and `session` entirely; that is only safe while one reference means one
  user.
- Plan 004 restructures `lib/billing.ts` further. The new
  `lib/subscription-status.ts` is intended to be the stable leaf both it and
  `lib/auth.ts` depend on — resist moving the status sets back.
