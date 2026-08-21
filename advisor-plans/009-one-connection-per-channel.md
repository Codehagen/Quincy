# Plan 009: Make Disconnect actually disconnect, by enforcing one connection per channel

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan in
> `advisor-plans/README.md`.
>
> **Drift check (run first)**:
> `git diff --stat a3ca175..HEAD -- lib/channels.ts lib/schema-app.ts scripts/channels.sql scripts/verify-channels.ts "app/(app)/channels/page.tsx"`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `a3ca175`, 2026-08-04

## Why this matters

`channel_connection` stores OAuth tokens that can publish posts in a person's
name. The table's unique key allows two rows for the same `(user, channel)`,
but every read path resolves a connection with `LIMIT 1` and **no `ORDER BY`** —
so Postgres returns an arbitrary row, and may return a different one on the
next call.

The consequence that matters: pressing **Disconnect** deletes one arbitrary row
and revokes only that token. The other row survives, is still decryptable, and
`publish()` will happily post through it — while the UI shows the channel as
disconnected. For a consent surface, "Disconnect did not disconnect" is the
worst available failure. A secondary consequence: with two rows, `publish()`
can post as an account the user did not choose, because the index page and the
publish path resolve *different* rows.

After this plan, the database enforces one connection per `(user, channel)`,
reconnecting replaces rather than accumulates, and Disconnect provably removes
every credential for that channel.

## Current state

Files and their roles:

- `lib/schema-app.ts` — Drizzle table definition for `channel_connection`
- `scripts/channels.sql` — the hand-applied DDL that created the live table
- `lib/channels.ts` — all connection read/write logic
- `app/(app)/channels/page.tsx` — the index; collapses connections into a Map
- `scripts/verify-channels.ts` — hand-run integration assertions

**The unique key today** (`lib/schema-app.ts:546-562`):

```ts
  (table) => [
    // One row per platform account per user. Reconnecting updates it rather
    // than growing a pile of dead tokens. The tenant is in the key for the
    // reason brain_page_user_slug_key carries it: a key with no user in it is
    // how two accounts end up sharing a row.
    unique("channel_connection_user_channel_external_key").on(
      table.userId,
      table.channel,
      table.externalId
    ),
    // Two X handles on one account is representable from day one; nothing in
    // the schema forbids the second even though the UI shows one.
    index("channel_connection_user_channel_idx").on(
      table.userId,
      table.channel
    ),
  ]
```

**The nondeterministic read** (`lib/channels.ts:501-517`):

```ts
export async function getConnectionRow(
  userId: string,
  channel: ConnectableChannel
): Promise<Connection | null> {
  const [row] = await db
    .select()
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.channel, channel)
      )
    )
    .limit(1)

  return row ?? null
}
```

**The delete that only removes one row** (end of `disconnect`, `lib/channels.ts:784`):

```ts
  await db.delete(channelConnection).where(eq(channelConnection.id, row.id))
```

**The upsert conflict target** (`lib/channels.ts:485-496`):

```ts
  const [row] = await db
    .insert(channelConnection)
    .values({ id: newConnectionId(), ...values })
    .onConflictDoUpdate({
      target: [
        channelConnection.userId,
        channelConnection.channel,
        channelConnection.externalId,
      ],
      set: values,
    })
    .returning()
```

**The index collapses duplicates silently** (`app/(app)/channels/page.tsx:178-181`):

```ts
  const connections = new Map<
    string,
    Awaited<ReturnType<typeof listConnections>>[number]
  >((await listConnections(session.user.id)).map((c) => [c.channel, c]))
```

**The test that asserts the broken state is supported** (`scripts/verify-channels.ts:175-193`):

```ts
  console.log("\n=== a second account on the same channel is allowed ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, externalId: "verify-external-2", handle: "@second" },
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const both = await listConnections(owner.id)
  check(
    "two distinct accounts coexist",
    both.length === 2,
    `got ${both.length}`
  )
```

**The live DDL** (`scripts/channels.sql:39-40`):

```sql
CREATE UNIQUE INDEX IF NOT EXISTS "channel_connection_user_channel_external_key"
  ON "channel_connection" ("user_id", "channel", "external_id");
```

### The product decision, already made for you

**One connection per channel.** Do not build multi-account support. Reasons,
so you can make correct judgment calls:

- `app/(app)/channels/page.tsx` renders one row per channel and has no design
  for a second. `components/channels/connection-strip.tsx` takes a single
  `connection` prop.
- `lib/publish.ts` calls `publish({ userId, channel, text })` with no way to
  name an account.
- `plans/005-connect-x-and-linkedin.md` describes the feature as one account
  per channel throughout.

Multi-account is a future feature that needs UI design first. This plan makes
the schema match what the application actually supports.

### Repo conventions to match

- Comments explain **why**, not what. Every non-obvious decision in
  `lib/channels.ts` carries a paragraph explaining the reasoning. Match that
  density — see `lib/channels.ts:404-419` (`toSafeConnection`) for the house
  voice.
- Migrations are hand-written SQL in `scripts/*.sql`, applied by a matching
  `scripts/apply-*.ts`. See `scripts/channels.sql` and
  `scripts/apply-channels.ts`.
- Verification is a hand-run script (`npx tsx --env-file=.env.local
  scripts/verify-*.ts`) with a `check(label, ok, detail)` helper and teardown
  that deletes only what it created.
- Scripts that mutate `channel_connection` MUST be guarded to `@quincy.test`
  accounts. See `scripts/verify-channels.ts:65-86`.

## Commands you will need

| Purpose | Command | Expected on success |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0, no output after the `$ tsc --noEmit` line |
| Lint | `npx eslint <files>` | exit 0, no output |
| Unit tests | `pnpm test` | all pass |
| Channel assertions | `npx tsx --env-file=.env.local scripts/verify-channels.ts` | every line `PASS`, zero `FAIL` |
| Apply migration | `npx tsx --env-file=.env.local scripts/apply-channels.ts` | prints `Done.` |
| Format | `npx prettier --write <files>` | exit 0 |

**Never run `pnpm build`** — a dev server may be running against the same
`.next` directory and the two collide.

**Never run `pnpm format`** — it reorders Tailwind classes repo-wide. Format
only the files you touched.

## Scope

**In scope**:

- `lib/schema-app.ts` (edit the unique key)
- `scripts/channels.sql` (add the migration statements)
- `lib/channels.ts` (deterministic read, delete-all on disconnect, upsert target)
- `scripts/verify-channels.ts` (replace the "two coexist" assertion)

**Out of scope** (do NOT touch):

- `app/(app)/channels/page.tsx` — the Map collapse becomes correct for free
  once the schema guarantees one row. Changing it is unnecessary churn.
- `lib/publish.ts`, `lib/channels-maintenance.ts` — they call
  `getAccessToken`, which becomes deterministic without any change on their
  side.
- `components/channels/connection-strip.tsx` — no UI change in this plan.
- Any change to token encryption or the OAuth flow.

## Git workflow

- Branch: `advisor/009-one-connection-per-channel`
- Conventional-commit style, lower-case imperative subject describing the
  outcome. Examples from `git log`:
  `fix: stop the channel verification suite from deleting a real connection`
- Do NOT push or open a PR unless the operator instructed it.

## Steps

### Step 1: Write the migration that collapses duplicates and narrows the key

Append to `scripts/channels.sql`. The order is load-bearing: you cannot add
the narrower unique index while duplicates exist.

```sql
-- Collapse any duplicate connections before narrowing the key.
--
-- The application has only ever been able to address one connection per
-- channel: every read path resolves by (user_id, channel) and the UI renders
-- one row. A second row was therefore invisible and unpublishable-through by
-- the UI, but still live in the database and still reachable by an arbitrary
-- LIMIT 1 — which is how Disconnect could delete one credential and leave
-- another working. Keep the most recently updated row per (user_id, channel);
-- it is the one the person last consented to.
DELETE FROM "channel_connection" a
  USING "channel_connection" b
  WHERE a."user_id" = b."user_id"
    AND a."channel" = b."channel"
    AND (a."updated_at", a."id") < (b."updated_at", b."id");

DROP INDEX IF EXISTS "channel_connection_user_channel_external_key";

CREATE UNIQUE INDEX IF NOT EXISTS "channel_connection_user_channel_key"
  ON "channel_connection" ("user_id", "channel");
```

Note `(a.updated_at, a.id) < (b.updated_at, b.id)` — the `id` tiebreaker makes
the delete deterministic when two rows share a timestamp. Without it the
statement can delete both or neither.

**Verify**: `grep -c "channel_connection_user_channel_key" scripts/channels.sql`
→ `1`

### Step 2: Narrow the unique key in the Drizzle schema

In `lib/schema-app.ts`, replace the `unique(...)` call shown in "Current state"
with a `uniqueIndex` on `(userId, channel)`, and delete the now-redundant
plain `index(...)` on the same two columns (a unique index already serves
those lookups).

Use `uniqueIndex`, **not** `unique` — `scripts/channels.sql` creates an index,
and declaring a constraint of the same name makes the next `drizzle-kit push`
try to `ADD CONSTRAINT` over an existing index and fail. Add `uniqueIndex` to
the existing `drizzle-orm/pg-core` import and remove `unique` from it if this
was its only use (check with grep before removing).

Target shape:

```ts
  (table) => [
    // One row per channel per user, enforced by the database rather than by
    // every caller remembering to pick the right one. The application has no
    // way to address a second account on a channel — publish takes
    // (userId, channel), and the UI renders one row — so a second row was a
    // credential nothing could see and Disconnect could not remove.
    //
    // uniqueIndex rather than unique: scripts/channels.sql creates an index,
    // and a constraint of the same name would collide on the next db:push.
    uniqueIndex("channel_connection_user_channel_key").on(
      table.userId,
      table.channel
    ),
  ]
```

Update the doc comment above the table if it claims two accounts per channel
are supported.

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -n "user_channel_external_key" lib/schema-app.ts` → no matches.

### Step 3: Make the read deterministic

In `lib/channels.ts`, add an `orderBy` to `getConnectionRow` so that even
before the migration is applied — and in any environment where it has not been
— the row returned is stable and is the same one the UI shows.

Add `desc` to the existing `drizzle-orm` import. Insert
`.orderBy(desc(channelConnection.updatedAt))` between `.where(...)` and
`.limit(1)`.

Add a comment explaining why the ordering exists even though the unique index
should make it moot:

```ts
  // Ordered even though the unique index above should make at most one row
  // possible. LIMIT 1 without ORDER BY is a promise Postgres does not make:
  // it returns whatever it finds first, which can change between calls as rows
  // are updated. If a duplicate ever reappears — a migration that did not run,
  // a restore from an older dump — this at least makes every caller agree on
  // the same row instead of publishing through one and disconnecting another.
```

**Verify**: `pnpm typecheck` → exit 0. Then
`grep -n "orderBy" lib/channels.ts` → at least one match inside
`getConnectionRow`.

### Step 4: Point the upsert at the new key

In `lib/channels.ts`, change the `onConflictDoUpdate` target shown in "Current
state" from three columns to two:

```ts
      target: [channelConnection.userId, channelConnection.channel],
```

This is what makes connecting a *different* account on a channel replace the
existing one instead of inserting a second. Add a comment saying so.

**Verify**: `pnpm typecheck` → exit 0.

### Step 5: Make Disconnect remove every credential for the channel

In `lib/channels.ts`, change the final delete in `disconnect` from deleting by
`row.id` to deleting every row for that `(userId, channel)`:

```ts
  // Deleted by (user, channel) rather than by the single row we just revoked.
  // The unique index should mean these are the same set — this is the belt to
  // its braces, because the one thing this function must never do is report a
  // disconnection it did not perform. A credential left behind here is one
  // that can still post in someone's name.
  await db
    .delete(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.channel, channel)
      )
    )
```

Leave the upstream revoke call above it unchanged — it revokes the token from
the row that was resolved, which is correct.

**Verify**: `pnpm typecheck` → exit 0, and
`npx eslint lib/channels.ts` → no output.

### Step 6: Replace the assertion that blessed the broken state

In `scripts/verify-channels.ts`, replace the whole
`=== a second account on the same channel is allowed ===` block (shown in
"Current state", roughly lines 175-193, including the delete that follows it)
with an assertion of the opposite property.

Note the block being removed contains an unscoped delete
(`.where(eq(channelConnection.externalId, "verify-external-2"))` — no user
filter). Do not carry that pattern into the replacement; scope every mutation
by `owner.id`.

```ts
  console.log("\n=== a second account replaces the first, never joins it ===")
  // The application addresses connections by (user, channel) — publish takes
  // no account argument and the UI renders one row — so a second row would be
  // a live credential nothing could see and Disconnect could not remove.
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: { ...PROFILE, externalId: "verify-external-2", handle: "@second" },
    tokens: tokens(60 * 60 * 24 * 60),
  })

  const after = await listConnections(owner.id)
  check("still exactly one row", after.length === 1, `got ${after.length}`)
  check(
    "and it is the account that connected last",
    after[0]?.externalId === "verify-external-2",
    after[0]?.externalId
  )

  // Back to the original account so the state assertions below are unambiguous.
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })
```

Then add a new block immediately before the existing `=== teardown ===` block
that proves the property this plan exists for:

```ts
  console.log("\n=== disconnect leaves no credential behind ===")
  await saveConnection({
    userId: owner.id,
    channel: "linkedin",
    profile: PROFILE,
    tokens: tokens(60 * 60 * 24 * 60),
  })
  await disconnect(owner.id, "linkedin")

  const remaining = await db
    .select()
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, owner.id),
        eq(channelConnection.channel, "linkedin")
      )
    )
  check(
    "zero rows for the channel after disconnect",
    remaining.length === 0,
    `${remaining.length} left`
  )
```

Add `disconnect` to the import from `../lib/channels` and `and` to the import
from `drizzle-orm` if not already present.

**Verify**: `pnpm typecheck` → exit 0.

### Step 7: Apply the migration and run the suite

```
npx tsx --env-file=.env.local scripts/apply-channels.ts
npx tsx --env-file=.env.local scripts/verify-channels.ts
```

**Verify**: `apply-channels.ts` prints `Done.`; `verify-channels.ts` prints
only `PASS` lines and zero `FAIL`.

If `apply-channels.ts` reports the old index name as still expected, that is
because it asserts index names — update its expectation to
`channel_connection_user_channel_key` and re-run. That file is in scope for
this one edit only.

### Step 8: Format and final check

```
npx prettier --write lib/channels.ts lib/schema-app.ts scripts/verify-channels.ts
pnpm typecheck && pnpm test && npx eslint lib/channels.ts lib/schema-app.ts scripts/verify-channels.ts
```

**Verify**: typecheck exit 0, all tests pass, eslint silent.

## Test plan

No new vitest files — this module's assertions live in the hand-run script, per
repo convention (`scripts/verify-*.ts`, run with
`npx tsx --env-file=.env.local`).

New assertions added to `scripts/verify-channels.ts`, modelled on the existing
`check(...)` blocks in that file:

1. Connecting a second account on a channel leaves exactly one row.
2. That row is the most recently connected account.
3. After `disconnect`, zero rows remain for that `(user, channel)`.

Verification: `npx tsx --env-file=.env.local scripts/verify-channels.ts` →
every line `PASS`, and the total count of `PASS` lines is **21 or more** (it was
20 before this plan; step 6 removes one assertion and adds four).

## Done criteria

ALL must hold:

- [ ] `pnpm typecheck` exits 0
- [ ] `pnpm test` exits 0
- [ ] `npx eslint lib/channels.ts lib/schema-app.ts scripts/verify-channels.ts` exits 0 with no output
- [ ] `npx tsx --env-file=.env.local scripts/verify-channels.ts` prints zero `FAIL` lines
- [ ] `grep -n "user_channel_external_key" lib/schema-app.ts` returns no matches
- [ ] `grep -n "two distinct accounts coexist" scripts/verify-channels.ts` returns no matches
- [ ] `git status --short` shows only the in-scope files modified
- [ ] `advisor-plans/README.md` status row for 009 updated

## STOP conditions

Stop and report back (do not improvise) if:

- The excerpts in "Current state" do not match the live code.
- `apply-channels.ts` fails on the `DELETE ... USING` statement — that means
  the live table has a shape this plan did not anticipate. **Do not hand-edit
  rows to make it pass.** Report what it said.
- The duplicate-collapsing DELETE would remove more than a handful of rows.
  Check first with:
  `SELECT user_id, channel, count(*) FROM channel_connection GROUP BY 1,2 HAVING count(*) > 1;`
  If it returns anything at all, report the count before proceeding — every
  deleted row is a credential someone consented to, and a human should know.
- `verify-channels.ts` fails an assertion you did not add, which means this
  change broke existing behaviour.
- You find a caller that genuinely needs two connections on one channel — that
  invalidates the product decision this plan rests on.

## Maintenance notes

- **If multi-account support is ever built**, this plan is the thing to reverse:
  widen the key back to include `external_id`, give `getConnectionRow`,
  `publish` and `disconnect` an `externalId` parameter, and design the UI for a
  list of accounts per channel. Do the UI first — the schema was permissive
  before precisely because nobody had decided what the UI should be.
- A reviewer should scrutinise: the `DELETE ... USING` tiebreaker (without the
  `id` component it can delete both rows of a tie), and that `disconnect` still
  revokes upstream *before* deleting locally.
- Deliberately deferred: `app/(app)/channels/page.tsx`'s `Map` collapse is left
  alone. It is correct once the schema guarantees one row, and touching it adds
  risk for no behaviour change.
