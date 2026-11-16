# Plan 013: Make "import again" actually fetch older posts, fix NULL ordering, and test the pagination

> **Executor instructions**: Follow this plan step by step. Run every
> verification command and confirm the expected result before moving to the
> next step. If anything in the "STOP conditions" section occurs, stop and
> report — do not improvise. When done, update the status row for this plan
> in `plans/README.md` — unless a reviewer dispatched you and told you they
> maintain the index.
>
> **Drift check (run first)**: `git diff --stat b85a7c1..HEAD -- lib/corpus-x.ts lib/voice.ts lib/corpus-x.test.ts scripts/verify-corpus-x.ts`
> Plan 012 modifies `lib/corpus-x.ts` and `lib/voice.ts` before this plan
> runs — that drift is expected; reconcile against the post-012 state (the
> cooldown claim and result-object guards will be present; keep them).
> Any *other* drift is a STOP condition.

## Status

- **Priority**: P1
- **Effort**: M
- **Risk**: MED (changes what gets re-read, and re-reads cost money — the tests in step 4 are the safety net)
- **Depends on**: plans/012-harden-the-import-money-path.md
- **Category**: bug
- **Planned at**: commit `b85a7c1`, 2026-08-05

## Why this matters

Three defects share one root: the import's cursor logic is untested.
(1) `since_id` is always the newest stored post, so a truncated first import
(>200 posts) can never reach older posts — yet the UI says "import again for
older posts", and that press buys a model call instead. (2) A mid-run
failure on page 2+ silently `break`s and reports `ok: true, truncated:
false` — a clean success that strands the remainder. (3) `ORDER BY
posted_at DESC` in Postgres is `NULLS FIRST`, so one undated row (the
schema allows them deliberately, for future archive imports) becomes the
resume cursor — an arbitrary tweet id that causes re-paying for hundreds of
already-stored posts or silently skipping new ones — and the voice compile's
"newest 300" window prefers undated rows.

## Current state

All in `lib/corpus-x.ts` (line numbers as of `b85a7c1`; plan 012 shifts
them — match on content):

```ts
// ~118-128 — the cursor, NULLS FIRST bug: an undated row wins this sort
async function newestExternalId(userId: string): Promise<string | undefined> {
  const [row] = await db
    .select({ externalId: sourceItem.externalId })
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, userId), eq(sourceItem.source, "x")))
    .orderBy(desc(sourceItem.postedAt))
    .limit(1)
  return row?.externalId
}
```

```ts
// ~160-240 — the fetch loop (simplified): since_id only, no way down
  const sinceId = await newestExternalId(userId)
  ...
  while (collected.length < maxPosts) {
    const params = new URLSearchParams({
      max_results: String(Math.min(PAGE_SIZE, Math.max(5, maxPosts - collected.length))),
      exclude: "retweets,replies",
      "tweet.fields": "created_at,public_metrics",
    })
    if (sinceId) params.set("since_id", sinceId)
    if (paginationToken) params.set("pagination_token", paginationToken)
    ... fetch ...
    if (!response.ok) {
      if (collected.length === 0 && postsRead === 0) {
        return { ok: false, reason: classifyRead(...), message: ... }
      }
      break                     // ← page-2 failure: reports success, truncated stays false
    }
    ...
    paginationToken = page.meta?.next_token
    if (!paginationToken) break
    if (collected.length >= maxPosts) { truncated = true; break }
  }
```

`lib/voice.ts` (~167 at plan time; shifted by 012):

```ts
    .orderBy(desc(sourceItem.postedAt))   // ← NULLS FIRST here too
    .limit(MAX_ITEMS)
```

`scripts/verify-corpus-x.ts` — `stubTimeline()` (~line 45) ignores
`since_id` and returns the same two pages on every call; the "re-run stored
nothing new" assertion passes only because of the unique key, while the
second run is charged for 4 reads again.

X API facts you need: tweet ids are int64 snowflakes as decimal strings —
**numerically** monotonic with time, but NOT lexicographically comparable
across different lengths. `GET /2/users/:id/tweets` accepts `since_id`
(results strictly newer), `until_id` (results strictly older), and
`pagination_token`; `max_results` is 5–100.

Conventions: result objects for user-state failures (see the file itself);
tests in vitest cover pure functions only, DB paths go in
`scripts/verify-*.ts` (see `lib/publish.test.ts` vs
`scripts/verify-publish-run.ts` for the split).

## Commands you will need

| Purpose   | Command                  | Expected on success |
|-----------|--------------------------|---------------------|
| Install   | `pnpm install`           | exit 0              |
| Typecheck | `npx tsc --noEmit`       | exit 0, no output   |
| Tests     | `pnpm vitest run`        | all pass            |
| Lint      | `npx eslint lib/corpus-x.ts lib/corpus-x.test.ts lib/voice.ts scripts/verify-corpus-x.ts` | exit 0 |

## Scope

**In scope**:

- `lib/corpus-x.ts`
- `lib/voice.ts` (one orderBy change only)
- `lib/corpus-x.test.ts` (extend substantially)
- `scripts/verify-corpus-x.ts` (make the stub honor cursors; fix assertions)

**Out of scope**:

- `app/(app)/sources/actions.ts`, `components/sources/channel-source-row.tsx` —
  the receipt copy "(more remain — import again for older posts)" becomes
  TRUE after this plan; it needs no change. Client state bugs are plan 014.
- `lib/schema-app.ts` — no schema change; both cursors derive from stored data.
- `scripts/corpus-x-live.ts` — works unchanged through `importXCorpus`.

## Git workflow

- Same worktree/branch as plan 012 if dispatched together; otherwise a
  worktree on the current branch. Commit per step or one final commit,
  imperative message. Do NOT push.

## Steps

### Step 1: Extract the fetch loop into a pure, testable function

In `lib/corpus-x.ts`, extract everything between the cursor lookup and the
DB insert into an exported pure function (pure = no `db`, no module state;
network only via the injected fetch):

```ts
export type TimelinePage = { data?: XTweet[]; meta?: { next_token?: string } }

export type CollectResult = {
  tweets: XTweet[]
  postsRead: number
  truncated: boolean
  /** Set when the FIRST page refused — the whole run failed. */
  failure?: { reason: ImportFailure; message: string }
}

export async function collectTimeline({
  fetchImpl,
  accessToken,
  xUserId,
  sinceId,
  untilId,
  maxPosts,
}: {
  fetchImpl: typeof fetch
  accessToken: string
  xUserId: string
  sinceId?: string
  untilId?: string
  maxPosts: number
}): Promise<CollectResult>
```

Behavior, identical to today except where marked NEW:

- Page with `max_results = clamp(maxPosts - collected, 5, 100)`,
  `exclude=retweets,replies`, `tweet.fields=created_at,public_metrics`;
  pass `since_id` when `sinceId` given, **NEW** `until_id` when `untilId`
  given, `pagination_token` when continuing.
- First-page refusal → `failure` set via the existing `classifyRead`.
- **NEW**: a page-2+ refusal, a network throw mid-run, or an unparsable
  body sets `truncated: true` (there IS more out there) and returns what
  was collected — never a silent clean success.
- Cap reached with a `next_token` present → `truncated: true`.
- `postsRead` counts everything X returned, including overshoot beyond
  `maxPosts` (it was billed).
- `XTweet` and `TimelinePage` types exported for the tests.

`importXCorpus` becomes: cooldown claim (from plan 012) → cursor
computation (step 2) → `collectTimeline` → meter → insert → result. Its
public signature and `ImportResult` shape are unchanged except the
`truncated` semantics above.

**Verify**: `npx tsc --noEmit` → exit 0; `pnpm vitest run` → all pass
(existing tests untouched by the extraction).

### Step 2: Two cursors, derived numerically, NULL-proof

Replace `newestExternalId` with one boundary query that avoids `posted_at`
entirely — tweet ids are numerically time-ordered, so the cursor should
come from the ids themselves and NULLs stop mattering:

```ts
import { sql } from "drizzle-orm"

/** Newest and oldest stored tweet ids, compared numerically — external_id
 *  is an int64 snowflake as a decimal string, so ::numeric is the only
 *  correct comparison; lexicographic order breaks across id lengths, and
 *  posted_at ordering breaks on NULL (DESC = NULLS FIRST in Postgres). */
async function storedBoundaries(userId: string): Promise<{ newestId?: string; oldestId?: string }> {
  const [row] = await db
    .select({
      newestId: sql<string | null>`max(${sourceItem.externalId}::numeric)::text`,
      oldestId: sql<string | null>`min(${sourceItem.externalId}::numeric)::text`,
    })
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, userId), eq(sourceItem.source, "x")))
  return { newestId: row?.newestId ?? undefined, oldestId: row?.oldestId ?? undefined }
}
```

Then give `importXCorpus` the two-pass behavior that makes the UI copy
true:

1. **Pass 1 (newer)**: `collectTimeline({ sinceId: newestId, ... })`.
2. **Pass 2 (older)**: only if pass 1 read 0 posts, was not a failure, and
   `oldestId` exists: `collectTimeline({ untilId: oldestId, maxPosts, ... })`.
   Meter and insert its results the same way. If pass 2 reads 0 posts, the
   backfill is exhausted — return `truncated: false`.
3. Sum `postsRead`/`imported` across whichever passes ran; `truncated` is
   the value from the last pass that ran.

In `lib/voice.ts`, change the compile window's ordering to be NULL-safe
(undated rows go last, not first):

```ts
    .orderBy(sql`${sourceItem.postedAt} desc nulls last`)
```

(`sql` is already imported or add it from `drizzle-orm`.)

**Verify**: `npx tsc --noEmit` → exit 0.

### Step 3: Fix the verify script's stub and assertions

In `scripts/verify-corpus-x.ts`:

- Make `stubTimeline()` honor cursors: when the request URL contains a
  `since_id` equal to the newest fixture id (`9003`), return
  `{ data: [], meta: {} }`; when it contains `until_id=9000`, return
  `{ data: [], meta: {} }` (backfill exhausted).
- Update the second-run assertions: `second.imported === 0` AND
  `second.postsRead === 0` (the re-run must now be free, not just
  deduplicated). The meter check asserts only ONE `x:read` usage_event row
  exists (`4 × X_READ_COST_MICROS`).
- Plan 012's cooldown claim will refuse the second run inside the window —
  the script must reset the claim between runs: after the first import,
  `await db.update(channelConnection).set({ lastImportAt: null }).where(...)`
  for the stub row... the stub `getToken` bypasses the DB, so check how the
  claim is implemented post-012: if the claim runs against
  `access.connection.id` and the stub connection has a fake id, the UPDATE
  matches 0 rows and refuses. In that case the stub `getToken` must return
  the id of a REAL `channel_connection` row created for the dev user at
  script start (insert one with fake encrypted-token placeholder text and
  delete it in `cleanup`). Adapt to what plan 012 actually built — this is
  a known integration point, not drift.

**Verify**: this script needs the real DB; if `.env.local` is unavailable
in your environment, verify with `npx tsc --noEmit` + a note in your
report that the script run is owed to the operator. Do not fake its output.

### Step 4: The pagination test suite

Extend `lib/corpus-x.test.ts` with a `describe("collectTimeline")` block
driving the pure function with a scripted fake fetch (a closure over an
array of canned `Response`s, asserting on the URLs it receives). Model the
test structure on the existing `describe("classifyRead")`. Cases, each with
the observable assertion:

1. **Pagination stitching**: two pages (3 + 2 tweets, `next_token` on page
   1) → 5 tweets, `postsRead = 5`, `truncated = false`; second request URL
   contains the `pagination_token`.
2. **since_id forwarding**: `sinceId: "900"` → first request URL contains
   `since_id=900`.
3. **until_id forwarding**: `untilId: "100"` → URL contains `until_id=100`.
4. **Truncation at cap**: `maxPosts: 3` against a page of 3 with a
   `next_token` → `truncated = true`, `tweets.length = 3`.
5. **Overshoot is billed**: `maxPosts: 6` → request asks `max_results`
   ≥ 5; page returns 10 tweets → `tweets.length = 6`, `postsRead = 10`.
6. **First-page 401** → `failure.reason = "needs_reauth"`, no tweets.
7. **Page-2 429** → no `failure`, tweets from page 1 kept,
   `truncated = true` (the fix this plan exists for — this test fails
   against the old behavior).
8. **Mid-run fetch throw** (fake fetch rejects on call 2) → same as case 7.
9. **max_results floor**: `maxPosts: 2` → request URL has `max_results=5`
   (X's floor), and only 2 tweets are returned in `tweets`.

**Verify**: `pnpm vitest run` → all pass; confirm case 7's assertion would
fail against the pre-plan code (it asserts `truncated === true` where the
old code produced `false`).

## Done criteria

- [ ] `npx tsc --noEmit` exits 0
- [ ] `pnpm vitest run` exits 0; `collectTimeline` suite has ≥9 tests, all passing
- [ ] `npx eslint lib/corpus-x.ts lib/corpus-x.test.ts lib/voice.ts scripts/verify-corpus-x.ts` exits 0
- [ ] `grep -n "until_id" lib/corpus-x.ts` shows the backfill pass
- [ ] `grep -n "nulls last" lib/voice.ts` shows the NULL-safe ordering
- [ ] `grep -n "orderBy(desc(sourceItem.postedAt))" lib/corpus-x.ts` returns nothing (cursor no longer date-ordered)
- [ ] `git status` shows no modified files outside the in-scope list

## STOP conditions

Stop and report back (do not improvise) if:

- Plan 012's changes are absent from the worktree (dependency not met).
- The extraction in step 1 cannot keep `ImportResult`'s public shape without
  touching out-of-scope callers.
- Step 3's stub-connection workaround requires schema changes.
- Case 7/8's semantics conflict with something plan 012 built around the
  insert guard — report the conflict, do not pick a side silently.

## Maintenance notes

- The two-pass cursor means a user with >200×N posts reaches the full
  archive in N presses, 200 at a time, each pass metered. When a cron
  rhythm later automates imports, it must call pass 1 only (newer) —
  backfill should stay a human decision because it is the expensive
  direction.
- `x-archive`/`linkedin-export` rows will have ids that are NOT snowflakes;
  `storedBoundaries` filters on `source = "x"` — keep it that way, and give
  other sources their own cursor logic when they land.
- Reviewer: scrutinize case 7 (page-2 failure → truncated) — it is the
  behavioral change with money consequences; and check `::numeric` casts
  appear in both `max` and `min`.
