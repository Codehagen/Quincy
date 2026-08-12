# Plan 016: Stop warning about an expiry X renews by itself

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- components/channels/connection-strip.tsx "app/(app)/channels/[platform]/page.tsx" lib/channels.ts`
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

The connection strip warns when a token expires within ten days. It applies
that rule to every channel, including X — whose access tokens live **two
hours** and are refreshed automatically without anyone being told.

`daysUntil` rounds `(expiresAt − now) / 86_400_000`, so a perfectly healthy X
connection computes `0` and renders: *"Access expires in 0 days. Quincy will
ask you to reconnect before it does."* Permanently. The one channel that never
needs the user's attention is the one constantly asking for it, and the
sentence is grammatically broken as well (the `=== 1` singular branch never
catches zero).

The backend already states the opposite rule explicitly.
`lib/channels-maintenance.ts` gates its warning on `!isRefreshable(channel)`
and says why: *"An approaching expiry on X is not the user's problem —
`getAccessToken` renews it without anybody being told — so warning about it
would be manufacturing an errand."* The UI contradicts the module that feeds it.

A second defect in the same expression: a LinkedIn connection that is past
expiry but still marked `active` (the window between expiry and the next 06:00
sweep) renders *"Access expires in -3 days."*

X is not connectable yet — no X app exists — so this is latent. It becomes
visible on the first X connection, which is the worst time to discover it.

## Current state

Files and their roles:

- `components/channels/connection-strip.tsx` — the connection row; client
  component
- `app/(app)/channels/[platform]/page.tsx` — server component that builds the
  `ConnectionView` prop
- `lib/channels.ts` — `isRefreshable(channel)` already exists and is exported
- `lib/channels-maintenance.ts` — the backend rule this must agree with

**The day computation** (`components/channels/connection-strip.tsx:79-82`):

```tsx
function daysUntil(ms: number | null): number | null {
  if (ms === null) return null
  return Math.round((ms - Date.now()) / 86_400_000)
}
```

**The status expression** (`components/channels/connection-strip.tsx:284-293`):

```tsx
  const stale = connection.state === "needs_reauth"
  const name = connection.displayName ?? connection.handle ?? label

  const status = stale
    ? channel === "linkedin"
      ? "LinkedIn access expires every 60 days and cannot be renewed automatically. Reconnect to keep publishing — it usually takes one click."
      : `${label} access has lapsed. Reconnect to keep publishing.`
    : expiresInDays !== null && expiresInDays <= 10
      ? `Access expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}. Quincy will ask you to reconnect before it does.`
      : null
```

Note there is no `refreshable` check anywhere in this expression.

**The X config that makes it refreshable** (`lib/channels.ts:62-75`):

```ts
    case "x":
      return {
        label: "X",
        ...
        // offline.access is what yields a refresh token. Without it the access
        // token dies after two hours and every post needs a fresh consent
        // screen, which is not a product.
        scopes: ["tweet.read", "tweet.write", "users.read", "offline.access"],
        ...
        refreshable: true,
```

**The exported helper that already answers the question** (`lib/channels.ts:113-115`):

```ts
export function isRefreshable(channel: ConnectableChannel): boolean {
  return config(channel).refreshable
}
```

**The backend rule the UI must agree with** (`lib/channels-maintenance.ts`,
inside `checkConnection`):

```ts
  /**
   * Live, so the only question left is how much longer.
   *
   * Only asked for channels we cannot refresh. An approaching expiry on X is
   * not the user's problem — `getAccessToken` renews it without anybody being
   * told — so warning about it would be manufacturing an errand.
   */
  const expiresAt = access.connection.accessTokenExpiresAt
  const closing =
    !isRefreshable(row.channel) &&
    expiresAt !== null &&
    expiresAt.getTime() - Date.now() < REAUTH_WARNING_MS
```

**Where the prop is built** (`app/(app)/channels/[platform]/page.tsx`, roughly
lines 103-114) — a `ConnectionView` object assembled server-side, converting
the `Date` to an epoch number before it crosses to the client component. Read
that block before editing; it is where the new field goes.

### Repo conventions to match

- The strip is a client component and takes **primitives only** — the server
  page converts `Date` to epoch milliseconds before passing it. Follow that:
  pass a `boolean`, not a function or a channel-config object.
- Comments explain **why**. See the strip's file header for the voice.
- `AGENTS.md`: copy for `needs_reauth` on LinkedIn must not read like a failure,
  because it is the expected steady state every 60 days. This plan does not
  change that copy, but do not regress it.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `npx eslint <files>` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`**.

## Scope

**In scope**:

- `components/channels/connection-strip.tsx`
- `app/(app)/channels/[platform]/page.tsx`

**Out of scope** (do NOT touch):

- `lib/channels.ts` — `isRefreshable` already exists and is already exported.
- `lib/channels-maintenance.ts` — its rule is the correct one; this plan makes
  the UI match it, not the other way round.
- The `needs_reauth` badge styling and copy. That is a separate question about
  whether a routine renewal should be styled as destructive; it is not this
  plan.
- `app/(app)/channels/page.tsx` (the index) — it does not render a countdown.

## Git workflow

- Branch: `advisor/016-expiry-copy`
- Conventional-commit style, lower-case imperative subject. Example from
  `git log`: `fix: make the destructive control look and behave like a control`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Carry `refreshable` across to the client

In `app/(app)/channels/[platform]/page.tsx`, find the block that builds the
object passed to `<ConnectionStrip connection={...}>` (around lines 103-114 —
it is the one converting `accessTokenExpiresAt` to an epoch number).

Add a `refreshable` field computed server-side:

```tsx
    // Computed here rather than in the strip: `isRefreshable` reads the channel
    // config, which carries client secrets, so it must not be imported into a
    // client component. A boolean crosses the boundary; the config does not.
    refreshable: isRefreshable(platform),
```

Import `isRefreshable` from `@/lib/channels` alongside the existing imports
from that module.

`platform` must be a `ConnectableChannel` at this point. If the surrounding
code has already narrowed it (via `isConnectableChannel`), use it directly. If
not, narrow it first rather than casting — a cast here would silently accept an
unsupported channel.

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Add the field to the strip's prop type

In `components/channels/connection-strip.tsx`, find the type describing the
`connection` prop (the `ConnectionView` shape) and add:

```tsx
  /**
   * Whether the platform issues refresh tokens to us. X does, so its two-hour
   * access token is renewed silently and its expiry is never the user's
   * problem. LinkedIn's self-serve tier does not, so a LinkedIn connection
   * genuinely ends and the human has to come back.
   */
  refreshable: boolean
```

**Verify**: `pnpm typecheck` → exit 0 (or fails only at the call site, which
Step 1 already fixed — if it fails elsewhere, a second caller exists; see STOP
conditions).

### Step 3: Gate the countdown, and stop it going negative

In `components/channels/connection-strip.tsx`, change the `status` expression's
final branch:

```tsx
  const status = stale
    ? channel === "linkedin"
      ? "LinkedIn access expires every 60 days and cannot be renewed automatically. Reconnect to keep publishing — it usually takes one click."
      : `${label} access has lapsed. Reconnect to keep publishing.`
    : // Only for channels we cannot refresh, matching the rule in
      // lib/channels-maintenance.ts: an approaching expiry on X is renewed
      // silently by getAccessToken, so warning about it manufactures an errand.
      // X's token lives two hours, so without this gate every healthy X
      // connection reads "expires in 0 days" forever.
      //
      // The `>= 0` floor covers the window between a token actually expiring
      // and the next 06:00 sweep noticing: the row is still `active`, and
      // without it the copy reads "expires in -3 days".
      !connection.refreshable &&
        expiresInDays !== null &&
        expiresInDays >= 0 &&
        expiresInDays <= 10
      ? `Access expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}. Quincy will ask you to reconnect before it does.`
      : null
```

Keep the `stale` branches exactly as they are — that copy was written
deliberately and `AGENTS.md` constrains it.

**Verify**: `pnpm typecheck` → exit 0, and
`npx eslint components/channels/connection-strip.tsx` → no output.

### Step 4: Fix the zero-day wording

`expiresInDays === 1 ? "day" : "days"` renders "0 days" correctly but reads
oddly for a token expiring today. With the `>= 0` floor now in place, zero is
reachable for LinkedIn on its final day.

Change the sentence so zero reads naturally:

```tsx
      ? expiresInDays === 0
        ? "Access expires today. Quincy will ask you to reconnect before it does."
        : `Access expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}. Quincy will ask you to reconnect before it does.`
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Check it renders

Start the dev server if one is not running (`pnpm dev`) and open
`/channels/linkedin` with a connection present.

**Verify**: a LinkedIn connection more than ten days from expiry shows no
countdown sentence. If you can temporarily set a near expiry in the database to
check the countdown, do so on a `@quincy.test` account **only** — never on a
real connection.

If no connection exists, say so in your report and rely on the typecheck plus
the reasoning in Step 3.

### Step 6: Format and final check

```
npx prettier --write components/channels/connection-strip.tsx "app/(app)/channels/[platform]/page.tsx"
pnpm typecheck && pnpm test && npx eslint components/channels/connection-strip.tsx "app/(app)/channels/[platform]/page.tsx"
```

**Verify**: typecheck exit 0, tests pass, eslint silent.

## Test plan

No new vitest file. `connection-strip.tsx` is a client component with no
existing test infrastructure for components in this repo (the suite covers pure
`lib/` functions only), and standing up a component-testing setup is well out
of scope for a copy fix.

Verification is the typecheck (which proves the prop is threaded correctly from
server to client) plus Step 5's render check.

The reasoning that makes this safe without a test: the change is a pure
narrowing of one boolean expression. The `stale` branches are untouched, and the
only behaviour removed is a sentence that was unconditionally wrong for X.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `npx eslint components/channels/connection-strip.tsx "app/(app)/channels/[platform]/page.tsx"` exits 0 with no output
- [ ] `grep -n "refreshable" components/channels/connection-strip.tsx` returns at least two matches (the prop type and the gate)
- [ ] `grep -n "isRefreshable" "app/(app)/channels/[platform]/page.tsx"` returns at least one match
- [ ] `grep -n "expiresInDays >= 0" components/channels/connection-strip.tsx` returns one match
- [ ] `git status --short` shows only the two in-scope files
- [ ] `advisor-plans/README.md` status row for 016 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `ConnectionStrip` has a second caller you did not know about — adding a
  required prop would break it. Find callers with
  `grep -rn "ConnectionStrip" app components` and report if there is more than
  one.
- You are tempted to import `isRefreshable` directly into
  `connection-strip.tsx`. Do not — that module reads client secrets from
  `process.env` via `config()`, and pulling it into a `"use client"` file risks
  bundling them. Pass the boolean.
- Narrowing `platform` to `ConnectableChannel` in the page turns out to require
  restructuring the route. Report rather than casting.

## Maintenance notes

- **The rule to keep in sync**: the UI's countdown gate and
  `lib/channels-maintenance.ts`'s `closing` computation must agree. Both are
  "not refreshable, and inside `REAUTH_WARNING_DAYS`". If the backend threshold
  changes, this copy changes with it. A comment in each now points at the
  other.
- If a third channel is added, `refreshable` answers this correctly with no
  change here — which is the reason to gate on the capability rather than on
  `channel === "x"`.
- Deliberately deferred: whether `needs_reauth` should be styled as destructive
  at all. The sweep sets it ten days before the token stops working, so a
  working connection carries a red badge for ten of every sixty days. That is a
  real design question, and it is not a copy fix.
