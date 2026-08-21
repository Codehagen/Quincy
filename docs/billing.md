# Billing

One day free, then $49/month. No card until the day is over.

## The shape

```
sign up ──▶ verify email ──▶ 24h full access ──▶ read-only ──▶ Checkout ──▶ active
                  │                                  ▲            │
                  └── trial clock starts here        └── they can still see their work
```

Stripe sees nothing until somebody pays. The free day is application state, not
a Stripe subscription — the plan below explains why, and what that costs.

## Why the trial is ours and not Stripe's

Better Auth's Stripe plugin has a `freeTrial` option that would put the whole
lifecycle in Stripe: Checkout at signup, card collected, one day free, automatic
charge. It brings the plugin's trial-abuse prevention with it — one trial per
reference id, across all plans, enforced at subscription creation.

We are not using it, because a one-day trial with a card up front is not a
trial. It is a purchase with a 24-hour escape hatch, and it reads that way to a
stranger who has not yet seen the product draft a single sentence. The card
form lands before the value does.

The cost of that choice is that the plugin's abuse prevention never runs. Ours
is different and weaker, and it is worth naming precisely rather than assuming
the quoted feature covers us:

| | Stripe-native trial | Ours |
| --- | --- | --- |
| One trial per account | plugin enforces at subscription creation | `trial_ends_at IS NULL` guard |
| One trial per person | card fingerprint makes a second account expensive | a second verified email is free |
| Cost of abuse | zero — no service before the card | 24h of model calls |

The last row is the one that matters. See **The trial ceiling** below.

## Where the clock lives, and when it starts

`trialEndsAt` is a nullable timestamp on `user`, declared as a Better Auth
`additionalField` so `pnpm auth:generate` writes it into `lib/schema.ts` rather
than someone hand-editing generated output.

It is **not** derived from `createdAt`. With `requireEmailVerification: true` an
account is unusable until the link is clicked, and people click that link two
days later. Deriving the deadline from signup would hand those people an account
that was already expired the first time they saw it.

So the trial starts at the first moment the account is usable — which is exactly
where the welcome email already fires, for exactly the same reason. Both paths,
both branches, unchanged in structure:

- **Password signup** → `emailVerification.afterEmailVerification`
- **Google signup** → `databaseHooks.user.create.after`, guarded on `emailVerified`

Both call one helper:

```sql
UPDATE "user"
   SET trial_ends_at = coalesce(trial_ends_at, now() + interval '1 day')
 WHERE id = $1
RETURNING trial_ends_at
```

One statement, idempotent, no read-modify-write. That last property is not
decorative: `lib/db.ts` runs neon-http, which has no transactions, so anything
shaped as read-then-write has a race with no way to close it. The `COALESCE` is
also the entire "one trial per account" rule — a cancelled subscriber who comes
back does not get a second free day, because the column is already set.

**Why COALESCE and not `WHERE trial_ends_at IS NULL`.** The guard started in the
WHERE clause, and it shipped a paywall to people in the middle of their free
day. Calling this for an account that already had a trial matched no rows, so
`RETURNING` came back empty, and the caller could not tell "already has one"
from "has none" — it read the empty result as no trial. Moving the condition
into the value means the row always comes back. Caught by testing the gate, not
by reading it.

### The five-minute grace window

`session.cookieCache` is on with a 5 minute cap, so `trialEndsAt` is read from a
signed cookie rather than the database for up to five minutes. Two consequences,
both acceptable and both deliberate:

- An account whose day ends at 14:00 may keep working until 14:05.
- An account that *starts* its trial sees a stale `null` for the same window,
  which is exactly why `startTrial` must return the existing deadline.

This is the same trade lib/auth.ts already documents for bans and revoked
sessions. Billing does not get its own rule.

## Resolving entitlement

`lib/entitlement.ts` exports two resolvers, not one, because the question
"may this account spend?" has a different right answer depending on whether
somebody is actually there to receive the free day it might hand out.

```ts
export type Entitlement =
  | { state: "trialing"; endsAt: Date }   // inside the free day
  | { state: "active" }                   // paying
  | { state: "expired" }                  // day ran out, never paid
  | { state: "lapsed" }                   // paid once, subscription no longer good
```

**`resolveEntitlement`** is pure. It never writes. An account with no
`trialEndsAt` recorded resolves straight to `expired` rather than being
started here — it takes only `db` and `schema` as dependencies, so it is safe
to call from a background job where nobody is present. This is what
`lib/heartbeat.ts` calls, and the reason it exists: the weekly cron used to
call the effectful resolver, which meant an account that predates the trial
column got its 24-hour clock started by a job running at 22:17 on a Monday,
and met a paywall having never opened the product while it was asleep.

**`resolveEntitlementForRequest`** wraps it and adds the write: if no trial is
recorded, it calls `startTrial` first (coalescing, so it cannot hand out a
second day) and then resolves through the pure function with the result. This
is what `getEntitlement` (used by the app layout) and `app/api/chat/route.ts`
call, because a request path has a user in front of it, and giving them their
free day the moment they show up is exactly what should happen. Any new
caller has to pick one, and the choice is the question "is a user actually
here right now?" — a background job, webhook, or queue worker should never
reach for the `ForRequest` variant.

The resolution order inside `resolveEntitlement` is deliberate and it is a
latency decision:

1. Read `trialEndsAt` off the caller-supplied user (on a request path this
   rides along on the session, because it is an additional field — arriving
   with the session fetch every request already makes, at **zero** extra
   round trips).
2. If it is still in the future → `trialing`. Stop. No subscription query at
   all, which means the entire free day costs nothing extra on the read path.
3. Only once it has passed do we query the `subscription` table. One round
   trip, and on a request path deduped by `cache` in `lib/billing.ts` and
   issued concurrently with whatever else the caller is fetching rather than
   awaited in sequence.

Measured against the note in `lib/session.ts` — ~120ms per Neon round trip, 0.06ms
of actual query — this keeps the added cost at zero for trialists and one trip
for everyone else.

`lapsed` and `expired` are distinguished because they deserve different copy.
"Your day is up" and "your card was declined" are not the same message, and a
paying customer whose card expired should not be told they were on a trial.

### Why the billing page does not use this

The shortcut above — trial first, subscription never — is right for a gate and
wrong for a page, and the gap between those is a money bug.

Somebody who subscribes *during* their free day is still `trialing` until the
deadline passes, because the resolution never looks at the subscription table.
The billing page read that state and kept offering a Subscribe button to
somebody who had already pressed it. Better Auth does not deduplicate: the
plugin's docs are explicit that `upgrade` without a `subscriptionId` opens a
second subscription alongside the first. Two charges a month, from one button,
for the customers who converted fastest.

So `getBillingSnapshot` exists alongside `resolveEntitlement`. It always queries
the subscription table, and paid beats trialing. One page, cold path, one query
— the gate stays cheap and the page stays correct. Found by subscribing in a
test and reading the page afterwards, not by reading the code.

## The three gates

Read-only is not one check. It is three, and they are in different places
because they protect different things.

**1. `app/(app)/layout.tsx` — does not gate.** This is the change in posture.
Today it redirects when there is no session; it must *not* redirect when there
is no entitlement. Read-only means the shell renders, the sidebar renders, the
brain and the drafts and the conversations are all still there. It resolves the
entitlement once and passes it down, and a banner names the state with a link to
billing. Their work is what makes them pay; locking the door hides it.

**2. `app/api/chat` — the money gate.** Every model call goes through here.
Non-entitled → 402, no exceptions, and the client renders it as the paywall
rather than as an error. This is the one gate that, if it works, means no
unpaid request ever costs anything.

**3. The rule for whatever spends next.** Publishing, scheduling, and brain
writes do not exist as surfaces yet — today the only two places that call a
model are `app/api/chat` and `lib/heartbeat.ts`, both already gated. But the
rule outlives those two: any new surface that spends money must resolve
entitlement before it acts, choosing `resolveEntitlementForRequest` if a user
is present and `resolveEntitlement` if it is not. A read-only account may
read; it may not act. This is a rule for the next surface to follow, not a
gate that exists today.

**And the one that is easy to miss:** `lib/heartbeat.ts`. `runHeartbeatForEveryone`
walks every user and makes a model call per user with a backlog. Nothing in the
request path touches it, so no amount of gating in the app reaches it — an
expired account keeps costing money every Monday at 22:17 forever. It must skip
non-entitled users at the top of the loop, and the skip belongs in its existing
`skipped` array so the cron response shows it.

Route handlers get a `requireEntitlement()` that returns the 402 directly, so a
new surface is gated by calling it rather than by remembering the rule.

## The trial ceiling

This is the open exposure created by not asking for a card, and it should be
decided rather than inherited.

A free verified email buys 24 hours of unmetered `anthropic/claude-sonnet-5`.
One person doing that is noise. A script doing it is a bill.

The cheap mitigation is a turn ceiling for the trial only: `trialTurnsUsed` as a
second additional field, incremented on the chat path, and only while
`trialing` — so a paying customer never pays the extra round trip for a counter
that does not apply to them. `message` has no `userId` (it joins through
`conversation`), so counting rows on demand is more expensive than keeping the
counter.

Recommended, but it is a scope call: **ship it in phase 1, or ship the paywall
first and add the ceiling before the marketing page goes public.** Not before
signups are open to strangers, either way.

## Better Auth configuration

`stripe()` goes into the existing `plugins` array **before** `nextCookies()` —
the comment there is load-bearing, not decorative; anything after it has its
cookies written past the flush.

```ts
stripe({
  stripeClient,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  createCustomerOnSignUp: true,
  subscription: {
    enabled: true,
    requireEmailVerification: true,   // mirrors emailAndPassword
    plans: [{ name: "quincy", lookupKey: "quincy_monthly" }],
  },
})
```

No `freeTrial` block — that is the whole point of the section above.

`lookupKey`, not `priceId`. A lookup key is stable across test and live mode, so
going live is creating the same key on the live product rather than swapping an
environment variable and discovering in production that it was the test id.

`authorizeReference` is not needed yet. Subscriptions reference the user id and
there is no organization plugin; it becomes required the day one arrives.

## Schema

```
pnpm auth:generate   # adds subscription table, user.stripeCustomerId, user.trialEndsAt
pnpm db:push
```

`lib/schema.ts` is generated output and `drizzle.config.ts` says so. There is no
`drizzle/` directory in the repo, so this project has been using `db:push`
rather than versioned migrations — worth keeping consistent here, and worth
revisiting separately once real money is in the table.

The `subscription` table's `referenceId` must **not** be unique. The plugin's
schema notes say so explicitly and the reason is resubscription: a user who
cancels and comes back needs a second row.

**No index on `reference_id`, on purpose.** It is the column every entitlement
lookup filters on, so it would normally earn one — but `lib/schema.ts` is
generated and cannot hold it, and a hand-made index is exactly what `db:push`
reconciles away the next time the schema changes. A seq scan over a table this
size is nothing, and the entitlement path only queries it once the free day is
over. Revisit together with real migrations, not before.

## Stripe resources

Created in **test mode** on `acct_1MZKGTKOzkjqB2ny` (Codebase AS):

| | |
| --- | --- |
| Product | `prod_V05vzzoghHr3vg` — "Quincy" |
| Price | `price_1U05jbKOzkjqB2ny5AmuEeus` — $49.00 USD / month |
| Lookup key | `quincy_monthly` |

The same two objects have to be created again in live mode before launch, with
the same lookup key. Nothing in the code changes when that happens.

**Webhook** — endpoint is `/api/auth/stripe/webhook`, served by the existing
`app/api/auth/[...all]/route.ts` catch-all, which passes the raw request
straight to `auth.handler` and so does not break signature verification.

Events: `checkout.session.completed`, `customer.subscription.created`,
`customer.subscription.updated`, `customer.subscription.deleted`.

The deployed endpoint is not created yet, on purpose: it needs a real URL and a
signing secret that has to land in the right environment. It gets created
against the production hostname once that is confirmed.

Locally:

```
stripe listen --latest --forward-to localhost:3000/api/auth/stripe/webhook
```

**`--latest` is not optional.** Without it the CLI replays events formatted with
the *account's* default API version, which on this account is `2022-11-15` —
four years behind the SDK's pinned `2026-07-29.dahlia`. The subscription object
changed shape in between (`current_period_end` moved onto the subscription
item), so the plugin would parse period dates out of a payload that no longer
carries them there, and the failure is silent: webhooks return 200 and the
period columns come back null. With `--latest` the listener reports the same
version lib/stripe.ts pins, which is the only configuration actually under test.

## Environment

```
# Stripe. Test keys until launch; the lookup key is the same in both modes.
STRIPE_SECRET_KEY=""
STRIPE_WEBHOOK_SECRET=""
```

No publishable key. Checkout is a server-side redirect to Stripe's hosted page,
so no Stripe.js ever loads in the browser and there is no key to expose.

## The billing surface

`/settings/billing`. `/settings` today is a placeholder that says it grows "when
there is more than one thing to set" — a subscription is that second thing, and
a paywall needs a stable route to be the `successUrl` and `cancelUrl`.

`/credits` stays where it is. It is about usage, not entitlement, and its own
placeholder already promises a meter.

The page shows state, not a plan grid. There is one plan; a pricing table for a
single product is a decision the reader does not have.

## Verification

`scripts/verify-billing.ts` prints an account's trial, customer, subscriptions
and resolved entitlement, and carries the two levers the paywall needs to be
testable at all:

```
npx tsx --env-file=.env.local scripts/verify-billing.ts            # state
npx tsx --env-file=.env.local scripts/verify-billing.ts --expire   # end the day now
npx tsx --env-file=.env.local scripts/verify-billing.ts --restore  # give it back
```

Without `--expire`, testing the paywall means waiting a day, and a gate nobody
can reach is a gate nobody tests. It resolves through `resolveEntitlement`
rather than recomputing the answer, so it cannot agree with itself while
disagreeing with the app. It refuses any address outside `@quincy.test`, for the
same reason `dev-account.ts` does — this grants and revokes access, and the dev
database is the same Neon branch as everything else.

Note that `--expire` alone is not enough to see the gate move: the session
cookie caches the user for five minutes, so a cookie minted before the expiry
still carries the old deadline. Sign in again.

### What has been exercised

Against a live dev server and the real Neon branch, on a `dev@quincy.test`
account:

| | Result |
| --- | --- |
| Trial starts lazily for an account that predates the column | `TRIALING`, deadline persisted |
| `/api/chat` while trialing | `200`, model streamed |
| `/api/chat` once expired | `402 {"state":"expired"}` |
| `/studio`, `/brain` once expired | `200` — shell renders, no redirect |
| Read-only banner | present, links to `/settings/billing` |
| `/settings/billing` once expired | "Read-only", "Your free day is over" |
| Heartbeat cron, entitled | `users:1 captures:1 facts:2` in 3965ms |
| Heartbeat cron, expired | `users:0 unentitled:1` in 256ms, no model call |
| `subscription/upgrade` | `200`, Checkout session for $49.00, customer created |
| Checkout paid with `4242…4242` | `checkout.session.completed` → 200 |
| Subscription row after webhook | `quincy active sub_…` renewing 2 Sep 2026 |
| Billing page while paid | "Active", "Manage billing" — no Subscribe button |
| Subscription cancelled in Stripe | `customer.subscription.deleted` → row `canceled` |
| Entitlement after cancel + expiry | `LAPSED`, distinct from `EXPIRED` |
| `/api/chat` when lapsed | `402 {"state":"lapsed"}`, "no longer active" copy |

The heartbeat pair is the whole argument for the cron gate: same account, same
inbox, and the run went from a model call to none.

Checkout was completed for real, in a headless browser against Stripe's hosted
page, rather than by firing a synthetic event. `stripe trigger` would have
tested the plugin's handler against a payload with no relationship to our
customer or our pending subscription row, which is the part most likely to be
wrong.

Still worth doing before launch: `4000 0000 0000 0341`, which attaches and then
fails on charge. That is the `past_due` route into `lapsed`, and it is the only
one of the four states that has not been reached by the path a real customer
would take.

## Deliberately not here

- **MVA / Stripe Tax.** Codebase AS sells digital services; Norwegian consumers
  are 25% and the EU has its own rules. $49 is currently the charged amount with
  no tax handling. This is a real obligation, tracked separately, and it wants
  tax registrations set up in the dashboard before `automatic_tax` is switched
  on in code.
- **Annual billing.** `annualDiscountLookupKey` is one line and one Stripe price
  when it is wanted.
- **Usage metering.** The `/credits` promise.
- **A "your day is up" email.** The mail system is already there and this is the
  highest-leverage message in the funnel — it just is not required for the gate
  to be correct.
