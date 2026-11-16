# Plan 005: Let customers enter a promotion code at checkout

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat fee31fe..HEAD -- lib/auth.ts`
> If `lib/auth.ts` changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none — but **see the collision note below** if plan 003 has not landed
- **Category**: feature
- **Planned at**: commit `fee31fe`, 2026-08-03

## Why this matters

Stripe Checkout does not show a promotion-code field unless the session is
created with `allow_promotion_codes: true`. The session this app currently
creates does not set it — confirmed by reading a real session created against
the live-shaped config, which came back with `"allow_promotion_codes": null`.

So today there is no way to give anyone a discount, a launch offer, or free
access, short of editing rows in the database by hand. That blocks three
ordinary things: beta users who should not pay, a launch discount, and
win-back offers for people who cancel.

Turning the field on is the whole change. The codes themselves are created in
the Stripe dashboard and need no deploy — which is the point: pricing
experiments stop being code changes.

## Current state

One file changes: `lib/auth.ts`.

The Stripe plugin block today, at roughly lines 226–256 (a long explanatory
comment sits above it — leave that comment alone):

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

### Collision note — read before editing

**Plan 003 edits the same `subscription` object**, adding an
`authorizeReference` function to it. If plan 003 shows DONE in
`plans/README.md`, that function will already be there; add your key alongside
it and leave it untouched. If 003 has not landed, the object looks exactly like
the excerpt above. Either shape is fine — just do not delete what you find.

### The two keys, and why both

`getCheckoutSessionParams` is the plugin's documented hook for customising the
Checkout session. It receives `{ user, session, plan, subscription }` and
returns `{ params }`.

- `allow_promotion_codes: true` — renders the "Add promotion code" field.
- `payment_method_collection: "if_required"` — Checkout collects a card only
  when the amount due is greater than zero. Without it, a 100%-off code still
  demands a card, which defeats the point of comping a beta user.

  This is safe for ordinary paying customers: a $49/month subscription with no
  code applied has a non-zero amount due, so the card is still collected as
  before. It only changes the zero-amount case.

  It does mean a fully-comped subscription has **no card on file**. That is
  correct for a `duration: forever` coupon and wrong for a time-limited one —
  when the discount lapses, Stripe has nothing to charge and the invoice goes
  unpaid, which lands the account in `past_due` and, per `lib/billing.ts`,
  read-only. Comp codes should therefore be `forever`; time-limited discounts
  should be percentage-off on a paid plan, not 100%.

Repo conventions: comments explain *why* in prose above the decision — see
`lib/trial.ts` for the density expected. `pnpm` only. Prettier is configured;
run `pnpm format` if lint complains about formatting.

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
- `lib/auth.ts` — add `getCheckoutSessionParams` to the `subscription` object

**Out of scope** (do NOT touch):
- `components/billing/billing-actions.tsx` — the promotion-code field is
  rendered by Stripe on their hosted page, not by us. Nothing in our UI changes.
- `lib/billing.ts`, `lib/stripe.ts` — a discount changes the amount charged,
  not whether the account is entitled. Entitlement reads subscription *status*,
  which a coupon does not affect.
- `app/(app)/settings/billing/page.tsx` — the page shows `$49 a month` as the
  list price. Showing a discounted price there would mean reading the
  subscription's actual amount from Stripe; out of scope, noted as follow-up.
- Creating any coupon or promotion code. Those are dashboard objects and must
  not be hardcoded.

## Git workflow

- Branch: stay on the branch you are given; do not create a new one unless the
  dispatcher says otherwise.
- Conventional commits, lowercase, matching `git log`
  (`feat: welcome email, on both signup paths`).
  Suggested: `feat: promotion codes at checkout`
- Do NOT push or open a PR.

## Steps

### Step 1: Add `getCheckoutSessionParams`

In `lib/auth.ts`, inside the `subscription` object of the `stripe({...})`
plugin, add this key. Put it after `plans` (and after `authorizeReference` if
plan 003 has already added one):

```ts
        /**
         * Stripe renders the "Add promotion code" field only when the session
         * asks for it, so without this there is no way to discount anything
         * short of editing the database by hand. Codes themselves live in the
         * Stripe dashboard, which is the point: a launch offer or a comped
         * beta user stops being a deploy.
         *
         * `payment_method_collection: "if_required"` is the half that makes a
         * 100%-off code actually free — otherwise Checkout still demands a
         * card for a zero-amount subscription. Paying customers are
         * unaffected: $49 is a non-zero amount due, so the card is collected
         * exactly as before.
         *
         * The consequence is that a fully-comped subscription has no card on
         * file. That is right for a `forever` coupon and wrong for one that
         * expires — when the discount lapses there is nothing to charge, the
         * invoice fails, and lib/billing.ts reads the account as lapsed. Comp
         * codes must be `forever`; time-limited offers should be a percentage
         * off, never 100%.
         */
        getCheckoutSessionParams: async () => ({
          params: {
            allow_promotion_codes: true,
            payment_method_collection: "if_required",
          },
        }),
```

**Verify**: `pnpm typecheck` → exit 0.

If TypeScript rejects either key, that is a STOP condition — report the exact
error rather than casting to `any`.

### Step 2: Confirm nothing else changed

**Verify all**:
- `pnpm test` → exit 0, all tests pass (this change is not covered by tests;
  they must simply keep passing)
- `pnpm lint 2>&1 | tail -3` → still exactly `3 problems (3 errors, 0 warnings)`
- `git status --short` → only `lib/auth.ts`
- `grep -c "allow_promotion_codes" lib/auth.ts` → `1`
- `grep -c "authorizeReference" lib/auth.ts` → `1` if plan 003 has landed, `0`
  if it has not. **If it was 1 before your edit and is 0 after, you deleted it —
  restore it.**

### Step 3: Confirm the built session actually carries the flag

This is the only check that proves the change works end to end, and it requires
a running dev server plus `STRIPE_SECRET_KEY` in `.env.local`. **If either is
missing, skip this step and say so in your report** — do not try to provision
them.

With the dev server running and a signed-in session cookie available:

```
curl -s -b <cookie-file> -X POST http://localhost:3000/api/auth/subscription/upgrade \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3000' \
  -d '{"plan":"quincy","successUrl":"/settings/billing","cancelUrl":"/settings/billing"}' \
  | grep -o '"allow_promotion_codes":[^,]*'
```

**Verify**: prints `"allow_promotion_codes":true`. Before this change it printed
`"allow_promotion_codes":null`.

## Test plan

No new automated tests. The change is a constant passed to Stripe's API; there
is no branch to cover, and a test asserting "we pass this literal to the SDK"
tests the mock rather than the behaviour.

The meaningful verification is step 3, against a real Checkout session.

Existing tests must keep passing — `lib/auth.ts` is imported transitively by
`lib/billing.test.ts` only through mocks, so a break here would show up as an
import error rather than a failed assertion.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `grep -c "allow_promotion_codes" lib/auth.ts` returns `1`
- [ ] `grep -c "payment_method_collection" lib/auth.ts` returns `1`
- [ ] Any pre-existing `authorizeReference` in `lib/auth.ts` is still present
- [ ] `git status --short` shows only `lib/auth.ts`
- [ ] Step 3 either printed `"allow_promotion_codes":true`, or the report says
      plainly why it was skipped

## STOP conditions

Stop and report back (do not improvise) if:

- The `stripe({...})` block in `lib/auth.ts` does not match the excerpt in
  "Current state", allowing for plan 003's `authorizeReference` being present.
- TypeScript rejects `allow_promotion_codes` or `payment_method_collection` —
  the installed `stripe` SDK types may differ from the version this plan was
  written against (`stripe@22.4.0`, API `2026-07-29.dahlia`).
- Step 3 returns an error rather than a session, or returns
  `"allow_promotion_codes":null` after the change.
- You find yourself wanting to create a coupon or promotion code to test with.
  Those are live dashboard objects; report instead.

## Maintenance notes

- **Comp codes must be `duration: forever`.** A time-limited 100%-off code
  combined with `payment_method_collection: "if_required"` produces a
  subscription with no card that starts failing the moment the discount ends.
  Whoever creates codes in the dashboard needs to know this; it is the one way
  this change can hurt a real customer.
- The billing page still advertises `$49 a month` from the `PLAN_PRICE_USD`
  constant in `lib/stripe.ts`, regardless of any discount the customer actually
  has. Showing the real amount means reading it from the subscription; worth
  doing once discounts are common, not before.
- `getCheckoutSessionParams` is now the hook where any future Checkout
  customisation goes — tax collection, billing address, custom text. It
  currently ignores its arguments; it receives `{ user, session, plan,
  subscription }` if per-customer behaviour is ever needed.
- A reviewer should confirm that plan 003's `authorizeReference`, if present,
  survived the edit. Both changes land in the same object literal, which is
  exactly where a careless edit drops one of them.
