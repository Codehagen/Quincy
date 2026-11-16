# Plan 006: Actually refuse a second subscription — plan 003's guard never runs

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise.
>
> **Drift check (run first)**: `git diff --stat c4416d5..HEAD -- lib/auth.ts`
> If `lib/auth.ts` changed since this plan was written, compare the "Current
> state" excerpt against the live code before proceeding; on a mismatch, treat
> it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED — adds a global request hook that every auth request passes through
- **Depends on**: `plans/003-refuse-duplicate-subscription.md` (DONE — this builds on `lib/subscription-status.ts`)
- **Category**: security
- **Planned at**: commit `c4416d5`, 2026-08-03

## Why this matters

Plan 003 added an `authorizeReference` guard meant to stop one account opening
two $49/month subscriptions. **It never runs for the case it was written for.**

The Better Auth Stripe plugin resolves the reference id through a middleware
that returns early. From `node_modules/@better-auth/stripe/dist/index.mjs`,
lines 487–488, read in full:

```js
const referenceId = explicitReferenceId || ctxSession.user.id;
if (!explicitReferenceId || explicitReferenceId === ctxSession.user.id) return { referenceId };
```

`authorizeReference` is invoked only below that line, or in the
`customerType === "organization"` branch above it. So it fires when a request
passes an explicit `referenceId` belonging to *somebody else*, and not
otherwise.

`components/billing/billing-actions.tsx` calls:

```ts
await authClient.subscription.upgrade({ plan: "quincy", successUrl, cancelUrl })
```

No `referenceId`. So a user upgrading their own subscription — two tabs, a fast
double click, or a replayed request — sails straight past the guard. The
duplicate-billing hole plan 003 was written to close is still open.

Plan 003's change is still worth keeping: it closes the organization and
impersonation-shaped paths, and it created `lib/subscription-status.ts`, which
this plan builds on. It just is not the fix.

**How this was missed, so it is not missed again**: plan 003 quoted the
`authorizeReference` call site verbatim and treated the call site's existence as
proof the code path reached it. It never read the twenty lines above. Quoting a
call site proves the call exists; it does not prove it is reachable.

## Current state

### The mechanism that does run

`betterAuth({ hooks: { before } })` — the root-level hook, not a plugin hook.
Verified in `node_modules/better-auth/dist/api/dispatch.mjs`, lines 135–146:

```js
const beforeHookHandler = authContext.options.hooks?.before;
if (beforeHookHandler) {
    hooksSourceWeakMap.set(beforeHookHandler, "user");
    beforeHooks.push({
        matcher: () => true,
        handler: beforeHookHandler
    });
}
```

`matcher: () => true` — it runs for **every** request into the auth handler,
with no plugin-internal early return in the way. That is exactly the property
plan 003's mechanism lacked.

The endpoint path to match is `/subscription/upgrade`. Confirmed by grepping
the plugin for `createAuthEndpoint("/subscription/`, which yields exactly:
`/subscription/upgrade`, `/subscription/cancel`, `/subscription/restore`,
`/subscription/list`, `/subscription/billing-portal`, `/subscription/success`.

Both helpers this plan needs are exported from `better-auth/api` — verified in
`dist/api/index.d.mts`: `APIError`, `createAuthMiddleware`, `getSessionFromCtx`.

`getSessionFromCtx` is required rather than `ctx.context.session`, because a
before-hook runs ahead of the endpoint's own session middleware, so
`ctx.context.session` is not reliably populated there.

### `lib/auth.ts` today

The `stripe({...})` plugin block sits in the `plugins` array and now carries the
`authorizeReference` added by plan 003 (around line 301):

```ts
        authorizeReference: async ({ referenceId, action }) => {
          if (action !== "upgrade-subscription") {
            return true
          }

          return !(await hasLiveSubscription(referenceId))
        },
```

**Leave that in place.** It is correct for the paths it does cover.

`lib/auth.ts` already imports `hasLiveSubscription` from
`./subscription-status` (added by plan 003).

The `betterAuth({...})` call currently has **no** `hooks` key.

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
- `lib/auth.ts` — add the root-level `hooks.before`

**Out of scope** (do NOT touch):
- The `authorizeReference` from plan 003. Keep it. Two guards covering
  different paths is correct here, not redundant.
- `lib/subscription-status.ts` — `hasLiveSubscription` is already exactly what
  this needs.
- `components/billing/billing-actions.tsx` — the client-side `pending` guard
  stays. This adds enforcement underneath it.
- Any other path than `/subscription/upgrade`. Do not gate cancel, restore,
  list or billing-portal — those are the endpoints an unhappy customer needs
  most.

## Git workflow

- Stay on the branch you are given; do not create another.
- Conventional commit, lowercase: `fix: a guard on upgrade that actually runs`
- Do not push, do not open a PR.

## Steps

### Step 1: Add the before-hook

In `lib/auth.ts`, add these imports at the top, next to the existing
`better-auth` imports:

```ts
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api"
```

Then add a `hooks` key to the `betterAuth({...})` object. Put it immediately
before the `plugins` array, so the reader meets the guard before the plugin it
guards:

```ts
  /**
   * The guard that actually runs.
   *
   * `authorizeReference` on the Stripe plugin looks like the right place and is
   * not: the plugin's reference middleware returns early when a request carries
   * no explicit `referenceId`, which is every self-service upgrade this app
   * makes. It fires only when one user names another's reference id.
   *
   * A root-level before-hook is registered with `matcher: () => true`
   * (better-auth/dist/api/dispatch.mjs), so it sees every request with no
   * plugin-internal shortcut in front of it.
   *
   * What it prevents is two $49 subscriptions on one account: two tabs, a
   * double click fast enough to beat the button's disabled state, or a replayed
   * request. The customer finds out on their statement and the refund is
   * manual.
   */
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/subscription/upgrade") {
        return
      }

      // Not `ctx.context.session` — a before-hook runs ahead of the endpoint's
      // own session middleware, so that field is not reliably populated yet.
      const session = await getSessionFromCtx(ctx)

      // No session is not this hook's problem; the endpoint refuses it itself,
      // and answering here would change the error a signed-out caller sees.
      if (!session?.user?.id) {
        return
      }

      if (await hasLiveSubscription(session.user.id)) {
        throw new APIError("CONFLICT", {
          message: "You already have an active subscription.",
        })
      }
    }),
  },
```

**Verify**: `pnpm typecheck` → exit 0.

If TypeScript rejects `getSessionFromCtx(ctx)` or the `APIError` constructor
shape, that is a STOP condition — report the exact error rather than casting to
`any`.

### Step 2: Confirm nothing else moved

**Verify all**:
- `pnpm test` → exit 0, 18 tests passing (unchanged — this step adds no tests)
- `pnpm lint 2>&1 | tail -3` → still exactly `3 problems (3 errors, 0 warnings)`
- `git status --short` → only `lib/auth.ts`
- `grep -c "authorizeReference" lib/auth.ts` → `1` — plan 003's guard must
  still be there. If this is `0`, you deleted it; restore it.
- `grep -c "hooks:" lib/auth.ts` → `1`

### Step 3: Prove the module still loads

```
node --import tsx -e 'import("./lib/auth.ts").then(m => console.log("auth loaded:", Object.keys(m).join(", ")))'
```

**Verify**: prints `auth loaded: auth, isGoogleEnabled` (order may vary), exit 0.
A Better Auth WARN about `BETTER_AUTH_URL` is expected noise, not a failure.

### Step 4: Prove it actually refuses — the step that matters

This is the check plan 003 lacked, and its absence is why a broken guard
shipped. **Do not skip it.** It needs a dev server, `STRIPE_SECRET_KEY` in
`.env.local`, and a verified account.

1. Start the dev server: `pnpm dev --port 3100` (background it).
2. Create/repair the dev account:
   `npx tsx --env-file=.env.local scripts/dev-account.ts`
3. Sign in and keep the cookie:

```
EMAIL=$(grep '^DEV_ACCOUNT_EMAIL=' .env.local | sed 's/^[^=]*="\{0,1\}//; s/"\{0,1\}$//')
PASS=$(grep '^DEV_ACCOUNT_PASSWORD=' .env.local | sed 's/^[^=]*="\{0,1\}//; s/"\{0,1\}$//')
curl -s -c /tmp/c.txt -o /dev/null -w "signin %{http_code}\n" -X POST http://localhost:3100/api/auth/sign-in/email \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3100' \
  --data "$(printf '{"email":"%s","password":"%s"}' "$EMAIL" "$PASS")"
```

4. Check the account's current state:
   `npx tsx --env-file=.env.local scripts/verify-billing.ts`

   **If it reports any subscription with status `active` or `trialing`**, the
   guard should already fire. **If it reports none**, the first upgrade below
   will succeed and you cannot test the refusal without paying — in that case
   report that step 4 could not be completed and why, rather than creating a
   real subscription.

5. With a live subscription present, call upgrade:

```
curl -s -w "\nHTTP %{http_code}\n" -b /tmp/c.txt -X POST http://localhost:3100/api/auth/subscription/upgrade \
  -H 'Content-Type: application/json' -H 'Origin: http://localhost:3100' \
  -d '{"plan":"quincy","successUrl":"/settings/billing","cancelUrl":"/settings/billing"}'
```

**Verify**: HTTP **409**, body containing `You already have an active subscription.`

Before this plan, the same call returned `200` with a Checkout session — which
is the bug.

6. Stop the dev server.

## Test plan

No new unit tests. `hasLiveSubscription` is already covered by the 6 tests in
`lib/subscription-status.test.ts` from plan 003, and the new code is a routing
decision inside a framework hook — a unit test for it would assert against a
mock of `createAuthMiddleware` and prove nothing about whether the hook is
actually registered and reached.

**Step 4 is the test.** It is an integration check against a running server,
and it is the only thing that distinguishes a guard that runs from a guard that
merely exists. That distinction is the entire reason this plan exists.

## Done criteria

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0, 18 passing
- [ ] `pnpm lint` reports exactly the same 3 pre-existing errors
- [ ] `grep -c "authorizeReference" lib/auth.ts` returns `1`
- [ ] `grep -c "getSessionFromCtx" lib/auth.ts` returns `1`
- [ ] Step 3 prints `auth loaded: …` and exits 0
- [ ] Step 4 returned **409**, or the report states plainly why it could not run
- [ ] `git status --short` shows only `lib/auth.ts`

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpt of `dispatch.mjs` in "Current state" does not match the installed
  `better-auth` — the hook registration may have changed and this whole
  mechanism needs rechecking.
- `getSessionFromCtx` is not exported from `better-auth/api` in the installed
  version.
- TypeScript rejects the `APIError("CONFLICT", …)` shape.
- Step 4 returns `200` with a Checkout session. That means the hook is not being
  reached and this plan has repeated plan 003's mistake — report it rather than
  trying a third mechanism.
- Adding the hook breaks any existing test, or the sign-in in step 4 stops
  working. A root-level before-hook sees every auth request; if it interferes
  with sign-in, the `ctx.path` guard is wrong.

## Maintenance notes

- **Two guards now cover different paths and both should stay.** `hooks.before`
  covers self-service upgrades; `authorizeReference` covers requests naming
  someone else's reference id. Deleting either leaves a hole.
- This hook runs on **every** auth request — sign-in, sign-up, session reads,
  all of it. The `ctx.path` check is the first line for that reason. Anything
  added here later must stay equally cheap, or it becomes a tax on every
  request in the app.
- The refusal is a 409 with a specific message.
  `components/billing/billing-actions.tsx` renders `error.message` in place, so
  the customer sees the sentence above rather than a generic failure.
- If the organization plugin is ever added, `referenceId` stops being the user
  id and this hook's `session.user.id` lookup becomes wrong for org
  subscriptions — at which point the two guards need reconciling rather than
  coexisting.
- **The lesson worth keeping**: plan 003 verified the wrong thing. It confirmed
  a call site existed, not that it was reachable, and it had no end-to-end check
  that would have caught the difference. Step 4 exists so this class of error
  cannot ship twice.
