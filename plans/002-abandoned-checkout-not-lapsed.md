# Plan 002: An abandoned checkout must not make a user look like a lapsed subscriber

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md`.
>
> **Drift check (run first)**: `git diff --stat fee31fe..HEAD -- lib/billing.ts`
> If `lib/billing.ts` changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: `plans/001-test-baseline-vitest.md` (you need a test runner)
- **Category**: bug
- **Planned at**: commit `fee31fe`, 2026-08-02

## Why this matters

The Better Auth Stripe plugin creates a row in the `subscription` table with
`status: "incomplete"` **when checkout is requested** — before the user has seen
Stripe's payment form, let alone paid. This is verifiable in the installed
package, `node_modules/@better-auth/stripe/dist/index.mjs`:

```js
if (!subscription) subscription = await ctx.context.adapter.create({
    model: "subscription",
    data: {
        plan: plan.name.toLowerCase(),
        stripeCustomerId: customerId,
        status: "incomplete",
        referenceId,
        ...
```

Our entitlement code decides "did this person ever have a subscription?" by
asking whether *any* row exists (`rows.length > 0`). An abandoned checkout
leaves exactly one row, so:

1. User clicks Subscribe, sees the Stripe page, changes their mind, closes it.
2. A row with `status: "incomplete"` is left behind forever.
3. Their free day ends.
4. The app tells them **"Payment needed — your subscription is no longer
   active"** and the banner offers **"Fix billing"**.

They never had a subscription and nothing needs fixing. The correct message is
"your free day is over". The bug costs us the clearest conversion moment in the
product by replacing an invitation with an apparent error about money.

Same bug, two places: `resolveEntitlement` (drives the API gate and banner) and
`getBillingSnapshot` (drives the billing page).

## Current state

One file changes: `lib/billing.ts`.

The status vocabulary Stripe uses, and how each should be read:

| Stripe status        | Meaning                                    | Correct state |
|----------------------|--------------------------------------------|---------------|
| `active`             | paying                                     | `active`      |
| `trialing`           | in a Stripe-side trial                     | `active`      |
| `past_due`           | renewal payment failing, was paying before | `lapsed`      |
| `canceled`           | was paying, has ended                      | `lapsed`      |
| `unpaid`             | retries exhausted, was paying before       | `lapsed`      |
| `incomplete`         | **checkout opened, never completed**       | `expired`     |
| `incomplete_expired` | **checkout opened, then expired unpaid**   | `expired`     |

The rule: `lapsed` means *money once worked and has stopped*. The two
`incomplete*` statuses mean money never started.

`lib/billing.ts:27-28` today:

```ts
/** Stripe statuses that mean the money is currently good. */
const GOOD_STATUSES = new Set(["active", "trialing"])
```

`lib/billing.ts:84-97` today — first buggy site, the last line:

```ts
  const rows = await db
    .select({ status: subscription.status })
    .from(subscription)
    .where(eq(subscription.referenceId, user.id))

  if (rows.some((row) => row.status && GOOD_STATUSES.has(row.status))) {
    return { state: "active" }
  }

  // A row that exists but is not good means they paid at some point and the
  // subscription has since lapsed — past_due, canceled, unpaid. No row at all
  // means the free day simply ran out.
  return rows.length > 0 ? { state: "lapsed" } : { state: "expired" }
}
```

`lib/billing.ts:178-186` today — second buggy site, inside `getBillingSnapshot`:

```ts
    const trialing = Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now())

    return {
      state: trialing ? "trialing" : rows.length > 0 ? "lapsed" : "expired",
      subscribed: false,
      trialEndsAt,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    }
```

Note the comment at the first site already claims the intended rule
("they paid at some point") — the code just does not implement it. Update the
comment too; a comment that describes behaviour the code does not have is worse
than none.

Repo conventions: comments explain *why*, in prose, above the decision. See
`lib/trial.ts` for the density expected. `pnpm` only. Prettier is configured —
run `pnpm format` if lint complains about formatting.

## Commands you will need

| Purpose   | Command          | Expected on success                          |
|-----------|------------------|----------------------------------------------|
| Typecheck | `pnpm typecheck` | exit 0                                       |
| Tests     | `pnpm test`      | exit 0, all pass                             |
| Lint      | `pnpm lint`      | exit 1 with exactly 3 pre-existing errors    |

`pnpm lint` fails on this repo before you touch anything: 3 known errors in
`components/rhythm-settings-dialog.tsx` (2) and `hooks/use-mobile.ts` (1). Do
not fix them; just do not add a fourth.

## Scope

**In scope**:
- `lib/billing.ts`
- `lib/billing.test.ts` (extend — created by plan 001)

**Out of scope** (do NOT touch):
- `lib/trial.ts`, `lib/heartbeat.ts`, `app/api/chat/route.ts` — the gate reads
  the result of this function; the function is what is wrong, not the callers.
- `app/(app)/settings/billing/page.tsx` and `components/billing/*` — the copy
  for each state is already correct. This plan makes users reach the *right*
  state; it does not change what any state says.
- `lib/schema.ts` — generated by `pnpm auth:generate`. Never hand-edit.
- **Do not change how `past_due` is treated.** Cutting access on the first
  failed renewal is a known, separately-tracked product question. Keep it in
  `lapsed` exactly as today. Changing it here would hide a product decision
  inside a bug fix.

## Git workflow

- Branch: `advisor/002-abandoned-checkout`
- Conventional commits, lowercase — matching `git log` style
  (`fix: teach tailwind-merge the role scale`).
  Suggested: `fix: an abandoned checkout is not a lapsed subscription`
- Do NOT push or open a PR.

## Steps

### Step 1: Add the failing test first

In `lib/billing.test.ts`, inside the existing `describe("resolveEntitlement")`
block, add these two tests next to the existing `"is lapsed when a subscription
was cancelled"` test:

```ts
  it("is expired, not lapsed, when checkout was opened but never completed", async () => {
    mocks.rows = [{ status: "incomplete" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })

  it("is expired, not lapsed, when an abandoned checkout expired", async () => {
    mocks.rows = [{ status: "incomplete_expired" }]

    const result = await resolveEntitlement({ id: "u1", trialEndsAt: past() })

    expect(result).toEqual({ state: "expired" })
  })
```

**Verify**: `pnpm test` → exit non-zero, **exactly these 2 tests fail**, both
reporting `{ state: "lapsed" }` received where `{ state: "expired" }` was
expected. All other tests still pass.

If they pass at this point, the bug is already fixed — STOP and report.

### Step 2: Introduce the lapsed vocabulary

In `lib/billing.ts`, directly below the existing `GOOD_STATUSES` declaration,
add:

```ts
/**
 * Statuses that mean money once worked and has stopped.
 *
 * Deliberately a list rather than "anything that is not good". The plugin
 * writes a row with status `incomplete` the moment checkout is *requested* —
 * before the payment form is even shown — so a user who opens checkout and
 * closes the tab leaves a row behind permanently. Treating the mere existence
 * of a row as evidence of a past subscription told those users their
 * subscription was no longer active, about a subscription they never had.
 */
const LAPSED_STATUSES = new Set(["past_due", "canceled", "unpaid"])
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 3: Fix `resolveEntitlement`

Replace the final `return` of `resolveEntitlement` (and its stale comment) with:

```ts
  // `lapsed` is a claim about history: money worked once and stopped. An
  // `incomplete` row is not that — it is an abandoned checkout, and the person
  // behind it has simply run out of free day.
  return rows.some((row) => row.status && LAPSED_STATUSES.has(row.status))
    ? { state: "lapsed" }
    : { state: "expired" }
```

**Verify**: `pnpm test` → exit 0, all tests pass including the 2 from step 1.

### Step 4: Fix `getBillingSnapshot`

Inside `getBillingSnapshot`, replace the `state` expression so it uses the same
rule. The surrounding return object is unchanged:

```ts
    const trialing = Boolean(trialEndsAt && trialEndsAt.getTime() > Date.now())
    const lapsed = rows.some(
      (row) => row.status && LAPSED_STATUSES.has(row.status)
    )

    return {
      state: trialing ? "trialing" : lapsed ? "lapsed" : "expired",
      subscribed: false,
      trialEndsAt,
      periodEnd: null,
      cancelAtPeriodEnd: false,
    }
```

**Verify**: `pnpm typecheck` → exit 0 and `pnpm test` → exit 0.

### Step 5: Confirm no `rows.length` test survives anywhere

**Verify**: `grep -n "rows.length" lib/billing.ts` → **no matches**.

If it matches, one of the two sites was missed.

### Step 6: Full check

**Verify all**:
- `pnpm typecheck` → exit 0
- `pnpm test` → exit 0
- `pnpm lint 2>&1 | tail -3` → still exactly 3 problems
- `git status --short` → only `lib/billing.ts`, `lib/billing.test.ts`,
  `plans/README.md`

## Test plan

New tests, both in `lib/billing.test.ts` inside `describe("resolveEntitlement")`,
following the structure established by plan 001:

1. `incomplete` row + expired trial → `expired` (the regression this plan fixes)
2. `incomplete_expired` row + expired trial → `expired`

Existing tests that must keep passing and are the guard rails for this change:

- `canceled` row + expired trial → `lapsed` (proves the fix did not flatten
  everything to `expired`)
- `active` row → `active`
- no rows → `expired`

Verification: `pnpm test` → all pass, 12 tests total (10 from plan 001 + 2).

## Done criteria

Machine-checkable. ALL must hold:

- [ ] `pnpm test` exits 0 with 12 passing tests
- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `grep -n "rows.length" lib/billing.ts` returns no matches
- [ ] `grep -n "LAPSED_STATUSES" lib/billing.ts` returns 3 matches
      (declaration + 2 use sites)
- [ ] `git status --short` lists no files outside the in-scope list
- [ ] `plans/README.md` status row for 002 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The two tests added in step 1 pass before you change `lib/billing.ts` —
  someone has already fixed this.
- The excerpts in "Current state" do not match `lib/billing.ts`.
- `lib/billing.test.ts` does not exist — plan 001 has not been executed. Do not
  write the fix without the tests; the whole point of the ordering is that the
  regression is pinned before it is fixed.
- You find a third place in the codebase that classifies subscription rows.
  `grep -rn "GOOD_STATUSES\|subscription.status" lib app` should show only
  `lib/billing.ts`. If it shows more, report rather than fixing them blind.
- You conclude that `past_due` should also change. It should not, in this plan.

## Maintenance notes

- **The status vocabulary now lives in two sets that must stay disjoint.** If a
  future Stripe status is added to `GOOD_STATUSES`, check it is not also in
  `LAPSED_STATUSES`. Anything in neither set falls through to `expired`, which
  is the safe default: a user is shown "your free day is over" rather than a
  claim about billing that might be wrong.
- The `incomplete` rows are never cleaned up. They accumulate one per abandoned
  checkout, forever. That is harmless for correctness after this fix, but a
  future "show me my billing history" surface will need to filter them out —
  and a periodic cleanup is worth considering once volume is real.
- A reviewer should check the two call sites got the *same* rule, not two
  similar ones. The duplication between `resolveEntitlement` and
  `getBillingSnapshot` is a known smell; plan 004 restructures this file and is
  the right place to collapse it, not this plan.
