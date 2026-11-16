# Plan 012: Harden the import money path — cooldown, honest failures, metered compile, bounded prompt

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b85a7c1..HEAD -- lib/corpus-x.ts lib/voice.ts "app/(app)/sources/actions.ts" lib/schema-app.ts`
> If any in-scope file changed since this plan was written, compare the
> "Current state" excerpts against the live code before proceeding; on a
> mismatch, treat it as a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: LOW
- **Depends on**: none
- **Category**: security
- **Planned at**: commit `b85a7c1`, 2026-08-05

## Why this matters

The "Import posts from X" server action is an authenticated spend primitive:
one call performs up to 200 X API reads billed to the company's pay-per-use
developer account (~$0.005/post) **and** one model call. Today it has no
cooldown, no concurrency guard, no error handling after the money is spent,
no metering of the model call, and no bound on the prompt it assembles. A
single entitled account (a 24h trial counts) can drive unbounded spend, and
the first evidence would be the invoice. Separately, when the compile throws
after a successful import, the user sees nothing and presses again — buying
the spend a second time.

## Current state

Files and their roles:

- `lib/corpus-x.ts` — X timeline import. `importXCorpus({userId, maxPosts, deps})`
  fetches pages, inserts `source_item` rows, meters X reads into `usage_event`
  as `model: "x:read"`. The batch insert (~line 255) is unguarded; a tweet
  whose `created_at` fails to parse produces an Invalid Date that throws on
  insert **after** `recordReadCost` has already charged.
- `lib/voice.ts` — the compile. `modelExtractor` (~line 96) calls
  `generateObject` and destructures `object` only; the `usage` field is
  discarded, so the model spend never reaches `usage_event`. The prompt
  (~line 100) concatenates up to `MAX_ITEMS = 300` post bodies verbatim with
  no per-item or total character budget.
- `app/(app)/sources/actions.ts` — the server action `importFromX()`. Gates
  on session + entitlement, then calls `importXCorpus` and `compileVoice`
  with **no try/catch** (~line 76), despite the doc comment "Returns a
  receipt rather than throwing". A throw reaches the client as a rejected
  promise; the client never renders it.
- `lib/schema-app.ts` — `channelConnection` table ends around line 602. No
  timestamp records when an import last ran.

Key excerpts as of `b85a7c1`:

```ts
// app/(app)/sources/actions.ts (~56-80)
  const imported = await importXCorpus({ userId: session.user.id })
  if (!imported.ok) { /* ...returns ok:false messages... */ }
  const compiled =
    imported.imported > 0 || imported.postsRead > 0
      ? await compileVoice({ userId: session.user.id })     // ← can throw
      : await compileIfCorpusExists(session.user.id)        // ← can throw
  revalidatePath("/sources")
```

```ts
// lib/voice.ts (~94-110)
const modelExtractor: VoiceExtractor = async (posts) => {
  const { object } = await generateObject({
    model: MODEL,
    schema: EXTRACTION_SCHEMA,
    system: EXTRACT_PROMPT,
    prompt: posts
      .map((p) => `[${p.postedAt?.toISOString().slice(0, 10) ?? "undated"}] ${p.url}\n${p.body}`)
      .join("\n\n---\n\n"),
  })
  return object
}
```

```ts
// lib/corpus-x.ts (~250-270) — the unguarded insert
  const inserted = await db
    .insert(sourceItem)
    .values(
      collected.map((tweet) => ({
        id: newItemId(),
        userId,
        source: "x" as const,
        externalId: tweet.id,
        url: handle ? `https://x.com/${handle}/status/${tweet.id}` : "",
        postedAt: tweet.created_at ? new Date(tweet.created_at) : null,   // ← Invalid Date risk
        body: tweet.text,
        meta: tweet.public_metrics ? { public_metrics: tweet.public_metrics } : {},
      }))
    )
    .onConflictDoNothing()
    .returning({ id: sourceItem.id })
```

Conventions to match (with exemplars):

- **Result objects, never throws, for user-state failures**: see
  `lib/publish.ts` (`PublishResult` discriminated union) and `lib/mail.ts`.
  Every new failure branch returns `{ ok: false, ... }`.
- **Usage metering**: `lib/usage.ts` `recordUsage({userId, conversationId?, model, inputTokens, cachedInputTokens, outputTokens})`
  computes cost from `lib/pricing.ts`. See the call in
  `app/api/chat/route.ts:133-145`, wrapped in try/catch with
  `console.error("[chat] could not record usage:", cause)` — never fail the
  main operation because the meter failed.
- **Migrations**: hand-written SQL in `scripts/<name>.sql` applied by
  `scripts/apply-<name>.ts`. Copy the structure of
  `scripts/source-items.sql` + `scripts/apply-source-items.ts` exactly
  (IF NOT EXISTS statements, then verify columns/indexes by reading
  information_schema back). **Do not run the apply script** — the operator
  applies it against the real database; your worktree has no `.env.local`.
- Comment style: comments explain *why* and constraints, never narrate the
  next line. Match the density of `lib/corpus-x.ts` as it exists.

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `npx tsc --noEmit`       | exit 0, no output   |
| Tests     | `pnpm vitest run`        | all pass (121 at plan time) |
| Lint      | `npx eslint <changed files>` | exit 0, no output |

## Scope

**In scope** (the only files you should modify/create):

- `lib/schema-app.ts` (add one column to `channelConnection`)
- `scripts/import-cooldown.sql` (create)
- `scripts/apply-import-cooldown.ts` (create)
- `lib/corpus-x.ts`
- `lib/voice.ts`
- `app/(app)/sources/actions.ts`
- `lib/voice.test.ts` (extend)
- `lib/channels.ts` — **exactly one line**, see step 1b. Nothing else in
  this file may change.

**Out of scope** (do NOT touch, even though they look related):

- `components/sources/channel-source-row.tsx` — its receipt-state bugs are
  plan 014's job; your new `ok:false` messages flow through the existing
  `receipt.message` rendering unchanged.
- `lib/heartbeat.ts` — has the same unmetered-model-call gap, but it is a
  bounded cron, deliberately deferred.
- `lib/publish.ts` — read for conventions only.
- Everything in `lib/channels.ts` except the single line in step 1b.
- `scripts/verify-corpus-x.ts` — plan 013 rewrites its stub; leave it.

## Git workflow

- You are in an isolated worktree; commit there. Branch is whatever the
  worktree was created on.
- One commit per step or one final commit; message style: imperative summary
  line, no prefix convention (match `git log --oneline -5`).
- Do NOT push or open a PR.

## Steps

### Step 1: Add `last_import_at` to `channel_connection`

In `lib/schema-app.ts`, inside the `channelConnection` table definition,
after the `lastErrorAt`/`lastError` columns, add:

```ts
    /**
     * When an import of this channel's material last started. The cooldown
     * gate in lib/corpus-x.ts claims this column atomically — a single
     * conditional UPDATE — which is what makes "one import per window" hold
     * under concurrent requests on the HTTP driver (no session, no advisory
     * locks, no interactive transactions).
     */
    lastImportAt: timestamp("last_import_at", { withTimezone: true }),
```

Create `scripts/import-cooldown.sql`:

```sql
-- Import cooldown: one timestamp on channel_connection. See plans/012.
-- Purely additive.
ALTER TABLE "channel_connection"
  ADD COLUMN IF NOT EXISTS "last_import_at" timestamptz;
```

Create `scripts/apply-import-cooldown.ts` following the structure of
`scripts/apply-source-items.ts` (read the SQL file, execute statements,
read `information_schema.columns` back and assert `last_import_at` exists).
Do not run it.

### Step 1b: Carry the new column through `toSafeConnection` (one line)

Adding a column to `channelConnection` widens `Connection`
(`typeof channelConnection.$inferSelect`), and `SafeConnection` is
`Omit<Connection, "accessToken" | "refreshToken" | "scope">` — so every
non-secret column is *required* in the object `toSafeConnection` builds by
naming fields explicitly. Without this line, `npx tsc --noEmit` fails with
`lib/channels.ts(433,3): error TS2322 … Property 'lastImportAt' is missing`.
This is the file's own documented design ("Built by naming what may leave,
not by deleting what may not"), working as intended.

In `lib/channels.ts`, inside `toSafeConnection`'s returned object, after
`lastError: row.lastError,`, add exactly:

```ts
    lastImportAt: row.lastImportAt,
```

Nothing else in `lib/channels.ts` may change. `lastImportAt` is not a
secret — it is a timestamp — so exposing it on `SafeConnection` is correct
and does not weaken the token-hiding property that type exists for.

**Verify**: `npx tsc --noEmit` → exit 0, no output.

### Step 2: Atomic cooldown claim in `importXCorpus`

In `lib/corpus-x.ts`, add near the top:

```ts
/** One import per user per window. Long enough to stop spam, short enough
 *  that a genuine "try again" after a failure is not locked out for long. */
export const IMPORT_COOLDOWN_MS = 10 * 60 * 1000
```

Add a new failure reason `"cooldown"` to `ImportFailure`, and in
`importXCorpus`, **after** the `deps.getToken` success check but **before**
any fetch, claim the window with one conditional UPDATE (atomic on the
row — this is the concurrency guard, not just a rate limit):

```ts
  const claimed = await db
    .update(channelConnection)
    .set({ lastImportAt: new Date() })
    .where(
      and(
        eq(channelConnection.id, access.connection.id),
        or(
          isNull(channelConnection.lastImportAt),
          lt(channelConnection.lastImportAt, new Date(Date.now() - IMPORT_COOLDOWN_MS))
        )
      )
    )
    .returning({ id: channelConnection.id })

  if (claimed.length === 0) {
    return {
      ok: false,
      reason: "cooldown",
      message: "Posts were imported recently. Try again in a few minutes.",
    }
  }
```

Imports needed: `channelConnection` from `./schema-app`; `isNull`, `lt`,
`or` from `drizzle-orm`. `access.connection` is the full `Connection` row
(it comes from `getAccessToken`), so `.id` is available.

In `app/(app)/sources/actions.ts`, the `!imported.ok` branch must pass the
cooldown message through unchanged — add a `cooldown` case that returns
`imported.message` directly (the existing `rejected`/`billing`/`rate-limited`
mapping stays as is).

Note: an import that *fails* later still consumed its window. That is
accepted — the window is 10 minutes and the alternative (releasing the claim
on failure) reopens the concurrent-retry hole this step closes. Say this in
a comment at the claim site.

**Verify**: `npx tsc --noEmit` → exit 0. `pnpm vitest run` → all pass.

### Step 3: Never throw after money is spent

Three guards, all returning result objects per the repo convention:

3a. In `lib/corpus-x.ts`, guard the Invalid Date: replace
`postedAt: tweet.created_at ? new Date(tweet.created_at) : null` with a
parse that yields `null` for unparsable dates:

```ts
        postedAt: parseDate(tweet.created_at),
```

with a small helper in the same file:

```ts
function parseDate(value: string | undefined): Date | null {
  if (!value) return null
  const at = new Date(value)
  return Number.isNaN(at.getTime()) ? null : at
}
```

3b. In `lib/corpus-x.ts`, wrap the batch insert in try/catch. On failure,
log with the `[corpus-x]` prefix and return an `ok: false` result with a new
reason `"store-failed"` and a message that names the spend already made:
`"Your posts were read (and charged) but could not be stored. Try again in a few minutes — already-read posts are not re-imported."`
Add `"store-failed"` to `ImportFailure`.
(The cost was already metered by `recordReadCost` above the insert — that
ordering is correct and must not change: the charge happened at X regardless.)

3c. In `app/(app)/sources/actions.ts`, wrap **both** compile paths in
try/catch:

```ts
  let compiled: Awaited<ReturnType<typeof compileVoice>> | null = null
  try {
    compiled =
      imported.imported > 0 || imported.postsRead > 0
        ? await compileVoice({ userId: session.user.id })
        : await compileIfCorpusExists(session.user.id)
  } catch (cause) {
    console.error("[sources] voice compile failed:", cause)
    revalidatePath("/sources")
    return {
      ok: false,
      message:
        imported.imported > 0
          ? `${imported.imported} posts were saved, but the voice compile failed. Press again in a few minutes to retry the compile.`
          : "The voice compile failed. Try again in a few minutes.",
    }
  }
```

Keep the `revalidatePath("/sources")` on the success path too.

**Verify**: `npx tsc --noEmit` → exit 0. `pnpm vitest run` → all pass.

### Step 4: Meter the compile

Change the `VoiceExtractor` contract in `lib/voice.ts` so the model's usage
travels with the result:

```ts
export type VoiceUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

export type VoiceExtractor = (
  posts: { url: string; postedAt: Date | null; body: string }[]
) => Promise<VoiceExtraction & { usage?: VoiceUsage }>
```

In `modelExtractor`, capture usage from `generateObject`:

```ts
  const { object, usage } = await generateObject({ ... })
  return {
    ...object,
    usage: {
      inputTokens: usage.inputTokens ?? 0,
      cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
      outputTokens: usage.outputTokens ?? 0,
    },
  }
```

(If `usage.inputTokenDetails` does not exist on this AI SDK version's
`generateObject` result type, check how `app/api/chat/route.ts:133-145`
reads the same fields from its result and mirror that exactly — the chat
route is the source of truth for the field names.)

In `compileVoice`, after `const extraction = await extract(items)`, record
it, matching the chat route's error posture:

```ts
  if (extraction.usage) {
    try {
      await recordUsage({
        userId,
        model: MODEL,
        inputTokens: extraction.usage.inputTokens,
        cachedInputTokens: extraction.usage.cachedInputTokens,
        outputTokens: extraction.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[voice] could not record usage:", cause)
    }
  }
```

Import `recordUsage` from `./usage`. Check `lib/usage.ts:17` for the exact
parameter shape first; if it requires `conversationId`, pass `null` or omit
per its signature. Injected test extractors simply return no `usage` field
and nothing is recorded.

**Verify**: `npx tsc --noEmit` → exit 0. `pnpm vitest run` → all pass.

### Step 5: Bound the prompt

In `lib/voice.ts`, add:

```ts
/** A post longer than this is truncated in the prompt. X long-form and
 *  LinkedIn articles land in the same table; the compile reads habits, not
 *  whole essays. */
const MAX_POST_CHARS = 4_000
/** Total prompt budget. Stops a large archive from becoming an unbounded
 *  (or context-overflowing) model call. */
const MAX_PROMPT_CHARS = 120_000
```

After the DB select in `compileVoice`, build the working set: slice each
`body` to `MAX_POST_CHARS`, accumulate items (newest first, as selected)
until adding the next would exceed `MAX_PROMPT_CHARS`, and use only that
subset for both the extraction call and `knownUrls`. Set `result.items` to
the number actually given to the model (the receipt must not claim posts
the model never saw).

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 6: Tests

Extend `lib/voice.test.ts` (pure parts only, matching the repo's testing
split — no DB in vitest):

- Export the budget-trimming logic as a pure function to make it testable:
  `export function budgetItems(items: {url; postedAt; body}[], maxPost = MAX_POST_CHARS, maxTotal = MAX_PROMPT_CHARS)`
  returning the trimmed subset. Test: a long body is sliced to `maxPost`;
  accumulation stops before exceeding `maxTotal`; order is preserved;
  an empty input returns empty.

**Verify**: `pnpm vitest run` → all pass, including the new tests.

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm vitest run` exits 0, with new `budgetItems` tests present and passing
- [ ] `npx eslint lib/corpus-x.ts lib/voice.ts "app/(app)/sources/actions.ts" lib/voice.test.ts scripts/apply-import-cooldown.ts lib/channels.ts` exits 0
- [ ] `git diff --stat lib/channels.ts` shows exactly 1 insertion, 0 deletions
- [ ] `grep -n "cooldown" lib/corpus-x.ts` shows the new reason and the claim UPDATE
- [ ] `grep -n "recordUsage" lib/voice.ts` shows the metering call
- [ ] `grep -n "MAX_PROMPT_CHARS" lib/voice.ts` shows the budget in use
- [ ] `grep -n "catch" "app/(app)/sources/actions.ts"` shows the compile guard
- [ ] `git status` shows no modified files outside the in-scope list
- [ ] `scripts/import-cooldown.sql` + `scripts/apply-import-cooldown.ts` exist; apply script was NOT run

## STOP conditions

Stop and report back (do not improvise) if:

- The drift check shows in-scope files changed since `b85a7c1`.
- `generateObject`'s result type has no readable usage/token fields and the
  chat route's pattern does not transfer — report the actual type instead of
  guessing field names.
- The `ImportResult`/`ImportFailure` union changes break more than the files
  in scope (a caller outside scope fails typecheck).
- Any step's verification fails twice after a reasonable fix attempt.

## Maintenance notes

- The operator must run `npx tsx --env-file=.env.local scripts/apply-import-cooldown.ts`
  before this code is deployed — the claim UPDATE references a column that
  does not exist until then.
- When LinkedIn import lands (same `source_item` table), it must reuse the
  same claim (its own `channel_connection` row) — the cooldown is per
  channel row, which is the right unit.
- `lib/heartbeat.ts` still discards `generateObject` usage — same fix
  pattern applies; deliberately deferred.
- Reviewer should scrutinize: the claim UPDATE is the concurrency guard —
  confirm it is a single statement with the window predicate inside the
  WHERE, not a read-then-write.
