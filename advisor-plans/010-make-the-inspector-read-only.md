# Plan 010: Make the channel inspector actually read-only

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- scripts/inspect-channels.ts lib/channels.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: bug
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`scripts/inspect-channels.ts` states in its header: *"Read-only. It publishes
nothing and changes no row."* That is false. It loops over **every user in the
database** and calls `getAccessToken`, which writes: it marks connections
`needs_reauth`, it rotates and re-persists X refresh tokens, and on a failed
refresh it writes the terminal `revoked` state.

The danger is the header. Someone reads "read-only", runs the inspector against
a database holding a real LinkedIn grant, and the script silently flips a
working connection to `needs_reauth` — or, on X, spends the refresh token. X
rotates refresh tokens on use, so if the process dies between X issuing the new
token and the `UPDATE` landing, that connection is permanently dead and only a
human re-consenting can restore it.

This is the same class of bug that commit `af6353d` fixed in
`scripts/verify-channels.ts`. The inspector is the one channel script that was
never hardened: it is the only one of the four with no `@quincy.test` guard.

After this plan, inspecting a connection cannot modify it, and the header tells
the truth.

## Current state

Files and their roles:

- `scripts/inspect-channels.ts` — hand-run diagnostic; decrypts a stored token
  and asks the platform who it belongs to
- `lib/channels.ts` — owns all token logic; `getAccessToken` is the only
  function that decrypts

**The false claim** (`scripts/inspect-channels.ts:17`):

```
 * Read-only. It publishes nothing and changes no row.
```

**Every user, no guard** (`scripts/inspect-channels.ts:79-83`):

```ts
async function main() {
  const users = await db.select().from(user)
  let found = 0

  for (const account of users) {
```

**The mutating call** (`scripts/inspect-channels.ts:33-40`):

```ts
async function live(userId: string, channel: ConnectableChannel) {
  const access = await getAccessToken(userId, channel)

  if (!access.ok) {
    console.log(`    token        unusable (${access.reason})`)
    process.exitCode = 1
    return
  }
```

**What `getAccessToken` writes** — three separate paths in `lib/channels.ts`:

```ts
  // lib/channels.ts:679-683 — non-refreshable and stale
  if (!isRefreshable(channel) || !row.refreshToken) {
    await markConnectionState(row.id, "needs_reauth")
    return { ok: false, reason: "needs_reauth" }
  }
```

```ts
  // lib/channels.ts:~697-723 — refresh success rotates and persists
    const [updated] = await db
      .update(channelConnection)
      .set({
        accessToken: await symmetricEncrypt({ ... }),
        ...
```

```ts
  // lib/channels.ts:~726-733 — refresh failure writes a verdict
  } catch (error) {
    const revoked = error instanceof TokenError && error.isRevoked
    await markConnectionState(
      row.id,
      revoked ? "revoked" : "needs_reauth",
      error instanceof Error ? error.message : String(error)
    )
```

**The guard the other three scripts carry** (`scripts/verify-channels.ts:78-86`):

```ts
const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script deletes channel connections ` +
      "and only operates on @quincy.test accounts."
  )
}
```

**The decryption primitive already exists** (`lib/channels.ts`, inside
`getAccessToken`):

```ts
      accessToken: await symmetricDecrypt({
        key: encryptionKey(),
        data: row.accessToken,
      }),
```

`encryptionKey()` and `symmetricDecrypt` are both already in scope in
`lib/channels.ts`. `symmetricDecrypt` is imported from `better-auth/crypto` at
the top of the file.

### The design decision, already made for you

Add a **non-mutating** `peekAccessToken` to `lib/channels.ts` and have the
inspector use it, rather than guarding the inspector to `@quincy.test`.

Reason: the inspector's entire purpose is to prove a **real** connection works
end to end (its header says so — "asks the platform who it belongs to"). A
`@quincy.test` guard would make it useless for the job it exists to do. The
right fix is to make the read genuinely read-only so it is safe to point at
real data.

### Repo conventions to match

- Comments explain **why**. See `lib/channels.ts:404-419` for the house voice.
- Exported functions in `lib/channels.ts` are grouped under `/* ── Section ── */`
  banner comments. Put `peekAccessToken` next to `getAccessToken`.
- The module is deliberate about which function may decrypt — `getAccessToken`'s
  doc comment says it is "The only function that decrypts." That comment must
  be updated, not silently invalidated.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `npx eslint <files>` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Channel assertions | `npx tsx --env-file=.env.local scripts/verify-channels.ts` | zero `FAIL` |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** (a dev server may share `.next`) and **never run
`pnpm format`** (it reorders Tailwind classes repo-wide).

## Scope

**In scope**:

- `lib/channels.ts` (add `peekAccessToken`, amend `getAccessToken`'s comment)
- `scripts/inspect-channels.ts` (use it; correct the header)

**Out of scope** (do NOT touch):

- `getAccessToken` itself — its write behaviour is correct and load-bearing for
  `publish` and the daily sweep. Do not add a "don't write" flag to it; a
  boolean that changes whether a function persists state is exactly the kind of
  thing a caller gets wrong.
- `scripts/verify-channels.ts`, `scripts/verify-channel-maintenance.ts`,
  `scripts/verify-publish.ts` — already guarded.
- `lib/channels-maintenance.ts`, `lib/publish.ts`.

## Git workflow

- Branch: `advisor/010-inspector-read-only`
- Conventional-commit style, lower-case imperative subject describing the
  outcome. Example from `git log`:
  `fix: stop the channel verification suite from deleting a real connection`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Add a decrypt that does not write

In `lib/channels.ts`, immediately **before** `getAccessToken`, add:

```ts
/**
 * The stored token as-is, with no refresh and no state written.
 *
 * `getAccessToken` is the right function for anything that intends to *use* a
 * connection: it refreshes what is stale and records what it learns. That
 * makes it the wrong function for a diagnostic, because looking at a
 * connection would change it — an inspector run at the wrong moment marks a
 * working row `needs_reauth`, or spends an X refresh token that X will not
 * honour twice.
 *
 * So this one only reads. It returns whatever is in the column, including a
 * token that has already expired, and says when it expires so the caller can
 * decide what that means. A caller that wants a *usable* token wants
 * `getAccessToken` instead.
 */
export async function peekAccessToken(
  userId: string,
  channel: ConnectableChannel
): Promise<
  | { ok: true; accessToken: string; connection: Connection }
  | { ok: false; reason: "missing" }
> {
  const row = await getConnectionRow(userId, channel)

  if (!row) {
    return { ok: false, reason: "missing" }
  }

  return {
    ok: true,
    accessToken: await symmetricDecrypt({
      key: encryptionKey(),
      data: row.accessToken,
    }),
    connection: row,
  }
}
```

**Verify**: `pnpm typecheck` → exit 0.

### Step 2: Correct the claim on `getAccessToken`

`getAccessToken`'s doc comment currently says it is "The only function that
decrypts." That is no longer true. Change that sentence so the distinction is
the useful one — something like:

```
 * The only function that decrypts *for use* — `peekAccessToken` reads without
 * refreshing, for diagnostics. Everything that publishes goes through this
 * one, which is what makes "never publish on a revoked connection" a property
 * of the code rather than a rule callers have to remember.
```

Do not change any behaviour in this step.

**Verify**: `grep -n "only function that decrypts" lib/channels.ts` → no
matches (the old absolute claim is gone).

### Step 3: Switch the inspector to the non-mutating read

In `scripts/inspect-channels.ts`:

1. Change the import from `../lib/channels` to bring in `peekAccessToken`
   instead of `getAccessToken`.
2. In `live()`, call `peekAccessToken(userId, channel)`.
3. `peekAccessToken` returns only `reason: "missing"` on failure, so the
   `access.reason` message needs adjusting. Since the inspector's job is to
   prove the token works against the platform, an expired token should still be
   *tried* — the platform's answer is the real evidence. Report expiry from
   `access.connection.accessTokenExpiresAt` rather than refusing to call.

Target shape for `live()`:

```ts
async function live(userId: string, channel: ConnectableChannel) {
  const access = await peekAccessToken(userId, channel)

  if (!access.ok) {
    console.log(`    token        no connection row`)
    process.exitCode = 1
    return
  }

  const expiresAt = access.connection.accessTokenExpiresAt
  if (expiresAt && expiresAt.getTime() <= Date.now()) {
    // Reported, not refused: the platform's answer is the evidence this script
    // exists to collect, and "expired locally but still honoured" is itself
    // worth knowing.
    console.log(`    token        expired locally at ${expiresAt.toISOString()}`)
  }

  // ...existing platform call, unchanged, using access.accessToken
}
```

Keep the rest of `live()` — the platform fetch and the `X says this is @...`
output — exactly as it is.

**Verify**: `grep -n "getAccessToken" scripts/inspect-channels.ts` → no
matches. Then `pnpm typecheck` → exit 0.

### Step 4: Make the header true

Replace the header line at `scripts/inspect-channels.ts:17`:

```
 * Read-only. It publishes nothing and changes no row.
```

with something that states the property *and* why it had to be engineered,
so nobody reintroduces the mutation:

```
 * Read-only, and deliberately so. It reads through `peekAccessToken` rather
 * than `getAccessToken` for one reason: the latter refreshes what is stale and
 * writes what it learns, so inspecting a connection would change it — marking
 * a working row `needs_reauth`, or spending an X refresh token that X will not
 * honour twice. A diagnostic that alters what it measures is worse than no
 * diagnostic. Do not swap this back.
```

**Verify**: `grep -n "peekAccessToken" scripts/inspect-channels.ts` → at least
two matches (the import and the header note).

### Step 5: Prove it does not write

Run the inspector twice against the live database and confirm no row changes.
Capture `updated_at` and `state` before and after.

```
npx tsx --env-file=.env.local -e "1" 2>/dev/null || true
npx tsx --env-file=.env.local scripts/inspect-channels.ts
```

To check for writes, run this before and after and compare the output:

```
npx tsx --env-file=.env.local scripts/inspect-channels.ts > /tmp/inspect-1.txt 2>&1
npx tsx --env-file=.env.local scripts/inspect-channels.ts > /tmp/inspect-2.txt 2>&1
diff /tmp/inspect-1.txt /tmp/inspect-2.txt
```

**Verify**: `diff` produces no output (identical runs), and the script prints
platform confirmation lines rather than errors.

If there are zero connections in the database the script will find nothing —
that is a valid pass for this step, but note it in your report because the
mutation path was then not exercised.

### Step 6: Format and final check

```
npx prettier --write lib/channels.ts scripts/inspect-channels.ts
pnpm typecheck && pnpm test && npx eslint lib/channels.ts scripts/inspect-channels.ts
npx tsx --env-file=.env.local scripts/verify-channels.ts
```

**Verify**: typecheck exit 0, tests pass, eslint silent,
`verify-channels.ts` prints zero `FAIL`.

## Test plan

No new vitest file. The property this plan establishes — "running the inspector
does not change a row" — is verified by Step 5's before/after diff against a
live database, which matches the repo's convention for anything needing real
data.

`scripts/verify-channels.ts` must still pass unchanged: it exercises
`getAccessToken`'s write behaviour, which this plan deliberately leaves intact.
A regression there means Step 2 changed more than a comment.

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `npx eslint lib/channels.ts scripts/inspect-channels.ts` exits 0 with no output
- [ ] `grep -n "getAccessToken" scripts/inspect-channels.ts` returns no matches
- [ ] `grep -n "peekAccessToken" lib/channels.ts` returns at least one match
- [ ] Two consecutive inspector runs produce identical output (Step 5)
- [ ] `npx tsx --env-file=.env.local scripts/verify-channels.ts` prints zero `FAIL`
- [ ] `git status --short` shows only the in-scope files modified
- [ ] `advisor-plans/README.md` status row for 010 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- The two inspector runs in Step 5 differ, which means something still writes.
  **Do not chase it by adding guards to the script** — report what differed.
- `verify-channels.ts` starts failing, which means Step 2 altered behaviour
  rather than a comment.
- You conclude the inspector genuinely needs a refreshed token to do its job.
  It does not — but if you believe otherwise, stop rather than reintroducing
  `getAccessToken`.

## Maintenance notes

- **The invariant to protect**: nothing under `scripts/` that is described as
  read-only may call `getAccessToken`. A reviewer seeing that import in a
  diagnostic script should reject it.
- If a fifth channel script is added, decide up front which of the two reads it
  wants. Diagnostics take `peekAccessToken`; anything that publishes or sweeps
  takes `getAccessToken`.
- Deliberately deferred: `scripts/inspect-channels.ts` still has no
  `@quincy.test` guard, and after this plan it correctly does not need one —
  pointing it at real data is the whole point. If it ever gains a write for any
  reason, it needs the guard the same day.
