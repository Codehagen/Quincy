# Plan 004: Make entitlement resolution pure, so a cron can never start someone's trial

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat 71bf9b2..HEAD -- lib/billing.ts lib/heartbeat.ts app/api/chat/route.ts "app/(app)/layout.tsx" components/billing/billing-banner.tsx scripts/verify-billing.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: M
- **Risk**: MED — moves code between modules and rewires six importers
- **Depends on**: `plans/001-test-baseline-vitest.md`, `plans/002-abandoned-checkout-not-lapsed.md`, `plans/003-refuse-duplicate-subscription.md`
- **Category**: bug + tech-debt
- **Planned at**: commit `71bf9b2`, 2026-08-03 (refreshed after plans 002, 003, 005, 006 landed)

## Why this matters

`resolveEntitlement` is named like a query and behaves like a command: when the
account has no trial deadline recorded, it **writes one** by calling
`startTrial`. That self-healing is genuinely right on a request path — the user
is present, so giving them their free day the moment they show up is exactly
what should happen.

It is wrong everywhere else, and it is currently called from somewhere else:
the weekly `heartbeat` cron.

`lib/heartbeat.ts` walks every user with a pending inbox and calls
`resolveEntitlement` on each. For a user whose `trial_ends_at` is still null —
an account created before this column existed — the Monday 22:17 cron silently
starts their 24-hour free trial. By the time they next open the app, their free
day has been spent while they were asleep, and they meet a paywall having never
used the product.

The second problem is architectural and follows from the same fact.
`lib/heartbeat.ts` — a backend module that a plain `tsx` script imports — now
pulls in `lib/billing.ts` → `lib/session.ts` → `next/headers` and the whole
Better Auth + Stripe stack. It still loads today (verified), but a pure
background module having to construct an auth instance to answer "may this user
spend?" is a coupling that will eventually break something.

Both problems have one fix: separate the pure resolver from the effectful one,
and put the pure one in a module with no session dependency.

## Current state

### The write on the read path

`lib/billing.ts:53-104` today — this is the current text, re-read after plans
002, 003, 005 and 006 landed:

```ts
export async function resolveEntitlement(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  let endsAt = toDate(user.trialEndsAt)

  if (!endsAt) {
    endsAt = await startTrial(user.id)          // <- the write
  }

  if (endsAt && endsAt.getTime() > Date.now()) {
    return { state: "trialing", endsAt }
  }

  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, user.id))

  if (rows.some((row) => row.status && GOOD_STATUSES.has(row.status))) {
    return { state: "active" }
  }

  // `lapsed` is a claim about history: money worked once and stopped. An
  // `incomplete` row is not that — it is an abandoned checkout, and the person
  // behind it has simply run out of free day.
  return rows.some((row) => row.status && LAPSED_STATUSES.has(row.status))
    ? { state: "lapsed" }
    : { state: "expired" }
}
```

The status-set logic above is **already correct** — plan 002 fixed it and plan
003 moved the two sets into `lib/subscription-status.ts`. Move it across
unchanged; this plan is about *where the write lives*, not about classification.

`lib/billing.ts`'s current import block, which step 2 has to end up splitting:

```ts
import { cache } from "react"
import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"
import { getSession } from "./session"
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
import { startTrial } from "./trial"
```

### The cron call site

`lib/heartbeat.ts:277-282` today:

```ts
    const entitlement = await resolveEntitlement({ id: userId, trialEndsAt })

    if (!isEntitled(entitlement)) {
      unentitled.push(userId)
      continue
    }
```

### Everything that imports `lib/billing.ts` today

Exactly six places — all six are rewired by this plan:

```
app/(app)/settings/billing/page.tsx:3   import { getBillingSnapshot } from "@/lib/billing"
app/(app)/layout.tsx:5                  import { getEntitlement, type Entitlement } from "@/lib/billing"
app/api/chat/route.ts:11                import { isEntitled, paywallResponse, resolveEntitlement } from "@/lib/billing"
lib/heartbeat.ts:4                      import { isEntitled, resolveEntitlement } from "./billing"
components/billing/billing-banner.tsx:3 import type { Entitlement } from "@/lib/billing"
scripts/verify-billing.ts:5             import { resolveEntitlement } from "../lib/billing"
```

### Target module layout

After plan 003 there is already a leaf module, `lib/subscription-status.ts`,
importing only `drizzle-orm`, `./db` and `./schema`. This plan adds a second
layer on top of it:

```
lib/subscription-status.ts   status sets + hasLiveSubscription       (leaf)
lib/entitlement.ts    (new)  Entitlement, isEntitled, the two        no session,
                             resolvers, paywallResponse               no auth
lib/billing.ts               getEntitlement, getBillingSnapshot      session-aware
                             (session-aware wrappers only)
```

`lib/heartbeat.ts` and `app/api/chat/route.ts` then depend on
`lib/entitlement.ts` and never reach `lib/session.ts`.

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
- `lib/entitlement.ts` (create)
- `lib/entitlement.test.ts` (create — tests move here from `lib/billing.test.ts`)
- `lib/billing.ts` (shrink to the session-aware wrappers)
- `lib/billing.test.ts` (delete, or reduce to whatever still tests `lib/billing.ts`)
- `lib/heartbeat.ts` (import change only)
- `app/api/chat/route.ts` (import change + use the request-path resolver)
- `app/(app)/layout.tsx` (import change)
- `components/billing/billing-banner.tsx` (import change)
- `scripts/verify-billing.ts` (import change)
- `docs/billing.md` (one section — see step 8)

**Out of scope** (do NOT touch):
- `lib/trial.ts` — `startTrial` keeps its COALESCE behaviour exactly. It is
  correct; the problem is *who calls it*, not what it does.
- `lib/subscription-status.ts` — created and settled by plan 003.
- `lib/schema.ts` — generated by `pnpm auth:generate`.
- `app/(app)/settings/billing/page.tsx` — `getBillingSnapshot` stays in
  `lib/billing.ts`, so this import does not change.
- The behaviour of `getBillingSnapshot`. It duplicates some classification
  logic; leaving that duplication is deliberate here. Collapsing it is a
  separate change and would enlarge the blast radius of this one.
- The write that remains on the request path. It is intended — see step 3.

## Git workflow

- Branch: `advisor/004-pure-entitlement`
- Conventional commits, lowercase, matching `git log`.
  Suggested: `refactor: a pure entitlement resolver, so the cron cannot start trials`
- Commit after step 4 (modules in place, all tests green) and again at the end.
- Do NOT push or open a PR.

## Steps

### Step 1: Create `lib/entitlement.ts`

Move the following **unchanged** out of `lib/billing.ts`: the `Entitlement`
type, `isEntitled`, `toDate`, `paywallResponse`, and the body of
`resolveEntitlement` minus its `startTrial` call. `lib/entitlement.ts` must
import only `drizzle-orm`, `./db`, `./schema`, `./subscription-status` and
`./trial`.

```ts
import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
import { startTrial } from "./trial"

export type Entitlement =
  | { state: "trialing"; endsAt: Date }
  | { state: "active" }
  | { state: "expired" }
  | { state: "lapsed" }

/** Trialing and active may act. Expired and lapsed may look. */
export function isEntitled(entitlement: Entitlement): boolean {
  return entitlement.state === "trialing" || entitlement.state === "active"
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (!value) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

/**
 * Read-only. Never writes, and that is the point.
 *
 * Safe to call from anywhere, including a background job where nobody is
 * present. An account with no trial recorded resolves to `expired` here rather
 * than being handed a free day it cannot use — a cron that starts somebody's
 * 24-hour trial at 22:17 on a Monday spends it while they are asleep, and they
 * meet a paywall having never opened the product.
 *
 * Request paths want the opposite behaviour. They use
 * `resolveEntitlementForRequest` below.
 */
export async function resolveEntitlement(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  const endsAt = toDate(user.trialEndsAt)

  if (endsAt && endsAt.getTime() > Date.now()) {
    return { state: "trialing", endsAt }
  }

  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, user.id))

  if (rows.some((row) => row.status && GOOD_STATUSES.has(row.status))) {
    return { state: "active" }
  }

  // `lapsed` is a claim about history: money worked once and stopped. An
  // `incomplete` row is an abandoned checkout, not that.
  return rows.some((row) => row.status && LAPSED_STATUSES.has(row.status))
    ? { state: "lapsed" }
    : { state: "expired" }
}

/**
 * The same question, asked by somebody who is actually here.
 *
 * A user in front of us with no trial on record gets one started — a signup
 * that raced, a hook that threw, or an account predating the column all
 * self-heal on next page load instead of meeting a paywall they never had a
 * chance to avoid. `startTrial` coalesces, so this cannot hand out a second
 * day.
 *
 * The write is deliberate and it is bounded. The session is cookie-cached for
 * five minutes (lib/auth.ts), so for that window this reads a stale null for
 * somebody whose trial started moments ago and writes again — a single UPDATE
 * by primary key that changes nothing. Reading first to avoid it would cost a
 * round trip in the common case to save one in a rare one.
 */
export async function resolveEntitlementForRequest(user: {
  id: string
  trialEndsAt?: Date | string | null
}): Promise<Entitlement> {
  const endsAt = toDate(user.trialEndsAt) ?? (await startTrial(user.id))

  return resolveEntitlement({ id: user.id, trialEndsAt: endsAt })
}

/**
 * The refusal a route handler returns when the money is not good.
 *
 * 402 rather than 403: the client needs to tell "you may not" apart from "you
 * have not paid" to know whether to render an error or the paywall.
 */
export function paywallResponse(entitlement: Entitlement): Response {
  return Response.json(
    {
      error:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
      state: entitlement.state,
    },
    { status: 402 }
  )
}
```

**Verify**: `pnpm typecheck` → will still fail at this point because
`lib/billing.ts` now declares the same symbols. That is expected; step 2 fixes
it. Do not stop here.

### Step 2: Shrink `lib/billing.ts` to the session-aware wrappers

`lib/billing.ts` keeps only `getEntitlement` and `getBillingSnapshot`, and
re-exports the type so existing type-only importers keep working:

```ts
import { cache } from "react"
import { eq } from "drizzle-orm"

import { db } from "./db"
import { subscription } from "./schema"
import { getSession } from "./session"
import { GOOD_STATUSES, LAPSED_STATUSES } from "./subscription-status"
import {
  resolveEntitlementForRequest,
  type Entitlement,
} from "./entitlement"

export type { Entitlement }
```

Then:

- `getEntitlement` — unchanged except it now calls
  `resolveEntitlementForRequest(session.user)` instead of `resolveEntitlement`.
  It is only ever called from a Server Component, which is a request path.
- `getBillingSnapshot` — unchanged, including its `toDate` usage. Keep a local
  copy of the `toDate` helper in this file; duplicating four lines is cheaper
  than exporting a utility from `lib/entitlement.ts` just for this.
- `BillingSnapshot` type — unchanged.
- Delete from this file: the `Entitlement` type declaration, `isEntitled`,
  `resolveEntitlement`, `paywallResponse`, and the `GOOD_STATUSES` /
  `LAPSED_STATUSES` imports if unused after the edit (`getBillingSnapshot` still
  needs both).

**Verify**: `grep -n "startTrial" lib/billing.ts` → **no matches**.

### Step 3: Point the chat route at the request-path resolver

In `app/api/chat/route.ts`, change line 11 from:

```ts
import { isEntitled, paywallResponse, resolveEntitlement } from "@/lib/billing"
```

to:

```ts
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
```

and change the call (around line 60) from `resolveEntitlement(session.user)` to
`resolveEntitlementForRequest(session.user)`.

This is a request path with the user present, so it keeps the self-healing
behaviour it has today.

**Verify**: `grep -n "resolveEntitlementForRequest" app/api/chat/route.ts` →
2 matches (import + call site).

### Step 4: Point the cron at the pure resolver

In `lib/heartbeat.ts`, change line 4 from:

```ts
import { isEntitled, resolveEntitlement } from "./billing"
```

to:

```ts
import { isEntitled, resolveEntitlement } from "./entitlement"
```

The call site at line 277 does not change — it already calls
`resolveEntitlement`, which is now the pure one. Add a sentence to the existing
comment block above it noting that this resolver never writes, so the cron
cannot start anybody's trial.

**Verify all**:
- `grep -n "billing" lib/heartbeat.ts` → **no matches**
- `pnpm typecheck` → exit 0

### Step 5: Rewire the two remaining importers

- `components/billing/billing-banner.tsx:3` —
  `import type { Entitlement } from "@/lib/entitlement"`
- `scripts/verify-billing.ts:5` —
  `import { resolveEntitlement } from "../lib/entitlement"`

  In `scripts/verify-billing.ts`, the pure resolver is the correct choice: a
  diagnostic that reports state must not change it. If the script's output for
  an account with no trial now reads `EXPIRED` where it used to read
  `TRIALING`, that is the fix working, not a regression.

`app/(app)/layout.tsx:5` needs no change — it imports `getEntitlement` and
`type Entitlement` from `@/lib/billing`, and step 2 re-exports the type.

**Verify**: `pnpm typecheck` → exit 0.

### Step 6: Move and extend the tests

Rename `lib/billing.test.ts` to `lib/entitlement.test.ts` and update its import
to `@/lib/entitlement`. The `@/lib/session` mock is no longer needed — delete
it; `lib/entitlement.ts` does not import it.

Then split the trial-start test. Replace the existing
`"starts a trial when none is recorded, and uses what startTrial returns"` with
these three:

```ts
  it("does not write when no trial is recorded — it is expired", async () => {
    mocks.rows = []

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: null })

    expect(result).toEqual({ state: "expired" })
    expect(mocks.startTrial).not.toHaveBeenCalled()
  })

  it("never writes, whatever the input", async () => {
    mocks.rows = [{ status: "canceled" }]

    await resolveEntitlement({ id: "u1", trialEndsAt: null })
    await resolveEntitlement({ id: "u1", trialEndsAt: past() })
    await resolveEntitlement({ id: "u1", trialEndsAt: future() })

    expect(mocks.startTrial).not.toHaveBeenCalled()
  })
```

and add a new `describe` block:

```ts
describe("resolveEntitlementForRequest", () => {
  it("starts a trial when none is recorded, and uses what startTrial returns", async () => {
    const endsAt = future()
    mocks.startTrial.mockResolvedValue(endsAt)

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: null,
    })

    expect(mocks.startTrial).toHaveBeenCalledWith("u1")
    expect(result).toEqual({ state: "trialing", endsAt })
  })

  it("does not touch startTrial when a deadline is already known", async () => {
    const endsAt = future()

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: endsAt,
    })

    expect(mocks.startTrial).not.toHaveBeenCalled()
    expect(result).toEqual({ state: "trialing", endsAt })
  })

  it("is expired when startTrial returns null and nothing was ever paid", async () => {
    mocks.startTrial.mockResolvedValue(null)
    mocks.rows = []

    const result = await resolveEntitlementForRequest({
      id: "u1",
      trialEndsAt: null,
    })

    expect(result).toEqual({ state: "expired" })
  })
})
```

Import `resolveEntitlementForRequest` alongside the others at the top of the file.

**Verify**: `pnpm test` → exit 0, **22 tests passing, 0 failing**.

The arithmetic, so you can tell a miscount from a missing test:

| | Tests |
|---|---|
| `lib/entitlement.test.ts` after plans 001 + 002 | 12 |
| minus the trial-start test you replace in this step | −1 |
| plus the 2 replacements (`does not write…`, `never writes…`) | +2 |
| plus the 3 in `describe("resolveEntitlementForRequest")` | +3 |
| `lib/subscription-status.test.ts` from plan 003, untouched | +6 |
| **total** | **22** |

If the count is 22 but something fails, fix the failure. If the count is not 22,
you have added or dropped a test — recount before proceeding.

### Step 7: Prove the cron no longer drags in the auth stack

```
node --import tsx -e 'import("./lib/heartbeat.ts").then(m => console.log("heartbeat loaded:", Object.keys(m).join(", ")))'
```

**Verify**: prints `heartbeat loaded: INBOX_SLUG, captureTurn, runHeartbeat, runHeartbeatForEveryone`
(order may vary) and exits 0.

Then confirm the dependency really is gone:

```
grep -rn "session\|/auth" lib/entitlement.ts lib/heartbeat.ts
```

**Verify**: no match referring to `lib/session` or `lib/auth` in either file.

### Step 8: Correct `docs/billing.md`

`docs/billing.md` describes the old behaviour in its "Resolving entitlement"
section — specifically that resolution starts a trial when none is recorded.
Update that section to describe the two resolvers and why the split exists
(pure for background work, effectful for request paths). Keep the existing
prose style: explain the reasoning and the cost of the alternative.

Also correct the section listing the gates: it currently claims a third gate
over "publishing, scheduling, brain writes". Those surfaces do not exist yet —
`grep -rl "streamText\|generateObject\|generateText" lib app` returns only
`lib/heartbeat.ts` and `app/api/chat/route.ts`. Reword it as the rule new
spending surfaces must follow, rather than as a gate that exists.

**Verify**: `grep -n "resolveEntitlementForRequest" docs/billing.md` → at least
1 match.

### Step 9: Full check

**Verify all**:
- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0, 0 failures
- `pnpm lint 2>&1 | tail -3` → still exactly 3 problems
- `git status --short` → only the in-scope files plus `plans/README.md`

## Test plan

Tests live in `lib/entitlement.test.ts` (moved from `lib/billing.test.ts`),
structure unchanged from plan 001: `vi.hoisted` mock state, one `describe` per
exported function.

New coverage, both directions of the bug:

- **The bug**: `resolveEntitlement` with `trialEndsAt: null` must return
  `expired` and must not call `startTrial` — asserted directly with
  `expect(mocks.startTrial).not.toHaveBeenCalled()`. This is the assertion that
  makes it impossible to silently reintroduce a write into the pure path.
- **The behaviour that must survive**: `resolveEntitlementForRequest` still
  starts a trial for a present user, and still does not when a deadline is
  already known.
- **Edge**: `startTrial` returning null (row missing) resolves to `expired`
  rather than throwing.

All plan 001/002/003 tests must continue to pass; the module move is the risky
part and they are what catches a botched re-export.

Verification: `pnpm test` → 0 failures.

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 with 0 failures
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `grep -n "startTrial" lib/billing.ts` returns no matches
- [ ] `grep -rn "lib/session\|lib/auth\|\"./session\"\|\"./auth\"" lib/entitlement.ts lib/heartbeat.ts` returns no matches
- [ ] `node --import tsx -e 'import("./lib/heartbeat.ts").then(() => console.log("ok"))'` prints `ok` and exits 0
- [ ] `grep -rn "from \"@/lib/billing\"\|from \"./billing\"\|from \"../lib/billing\"" app lib components scripts`
      returns exactly 2 matches: `app/(app)/settings/billing/page.tsx` and `app/(app)/layout.tsx`
- [ ] `git status --short` lists no files outside the in-scope list
- [ ] `plans/README.md` status row for 004 updated

## STOP conditions

Stop and report back (do not improvise) if:

- `lib/subscription-status.ts` does not exist — plan 003 has not been executed,
  and step 1 depends on importing the status sets from it.
- The excerpts in "Current state" do not match the working tree.
- Step 7 shows `lib/heartbeat.ts` still failing to load, or loading but still
  reaching `lib/session.ts`.
- Any test from plans 001–003 fails after the module move. That means the
  re-export or an import is wrong; fix the import, and if two attempts do not
  resolve it, report.
- You find a **seventh** importer of `lib/billing.ts` not listed in "Current
  state" — the codebase has grown since this plan was written.
- Removing the `@/lib/session` mock from the test file causes the import of
  `@/lib/entitlement` to fail. That would mean the new module still reaches
  session transitively; report the chain rather than restoring the mock.

## Maintenance notes

- **The naming is the guard rail.** `resolveEntitlement` reads,
  `resolveEntitlementForRequest` may write. Any new caller has to choose, and
  the choice is the question "is a user actually here right now?" A reviewer
  seeing `resolveEntitlementForRequest` in a cron, a webhook, or a queue worker
  should reject it.
- **`lib/entitlement.ts` must stay a leaf.** It may import `db`, `schema`,
  `subscription-status` and `trial`, and nothing else. The moment it imports
  `lib/session.ts` the cron coupling comes straight back, and the tests will not
  catch it — only the step 7 load check will.
- The request-path write is still there, deliberately, and still fires on every
  navigation during the five-minute cookie-cache window after a trial starts.
  If session cookie caching is ever lengthened, that window lengthens with it —
  revisit then, not now.
- `getBillingSnapshot` still duplicates the status classification that
  `resolveEntitlement` does. That duplication was left in place on purpose to
  keep this change reviewable. Collapsing it is a good follow-up and should
  come with its own tests for `getBillingSnapshot`, which nothing covers today.
- Deferred out of this plan: treating `past_due` as something other than
  `lapsed`. It is a product decision about dunning, not a refactor.
