# Plan 011: Read the user's X posts and teach the brain their voice

> **Drift check (run first)**:
>
> ```bash
> grep -rn "source_item\|sourceItem" lib app scripts --include="*.ts" --include="*.tsx" | grep -v prototypes
> grep -rn "voice/x\|compileVoice\|importXCorpus" lib app scripts
> ls app/api/cron
> ```
>
> Expected at the time of writing: no hits for any of it, and `app/api/cron`
> holds `channels`, `heartbeat`, `publish`. If any of that has changed, someone
> has started this work — STOP.

## Status

- **Priority**: P0 — every drafting feature downstream of this one produces
  generic text until the brain knows how the user writes. This is the cold
  start for "sounds like us".
- **Effort**: M (one table, one ingest module, one compile module, one action
  on `/sources`, no cron)
- **Risk**: MEDIUM — spends real money per API read and writes to the brain,
  but publishes nothing and touches no channel scopes.
- **Depends on**: plan 005 (X connection, shipped). Nothing else.
- **Category**: feature
- **Planned at**: 2026-08-05

## Why X first, and why not "free tier"

The LinkedIn corpus needs the Member Data Portability (3rd Party) product,
which is in review as of 2026-08-05 (dedicated app "Quincy Sources"). X needs
nothing new: the existing grant already carries `tweet.read` + `users.read`
(`lib/channels.ts:80`), and `channel_connection.externalId` already stores the
X user id, so reading the user's own timeline works with the tokens we hold
today.

**There is no free tier to use.** X removed it in February 2026; pay-per-use
is the default: roughly **$0.005 per post read**, no monthly minimum. That is
better than free for a test — a 200-post import costs about $1 — but it means
every read must be metered and capped, exactly like `x:post` writes are today.
If the first real call answers 402/403 with a payment/billing message, the
developer account needs pay-per-use enabled in the X developer portal — STOP
and report, that is an account action, not a code fix.

## What this plan builds

```
[Import my X posts]  →  GET /2/users/:id/tweets (paginated, capped)
  → source_item rows (deterministic, idempotent)
  → compileVoice(): generateObject over the corpus
  → brain pages: voice/x (+ story pages with post URLs as proof)
  → receipt on /sources: "Read 187 posts. See what Quincy learned →"
```

Code for data, model for judgment: ingest never interprets content; the model
never talks to the network.

Explicitly **not** in this plan: a cron (the corpus changes when the user
posts, and Quincy's own posts will be folded in by a later rhythm), LinkedIn
(waiting on review; its ZIP-export upload lands in a follow-up plan on the
same `source_item` table), and any drafting.

## Schema

One new table in `lib/schema-app.ts`, applied with the `scripts/*.sql` +
`apply-*.ts` convention the channel tables used:

```
source_item
  id          text pk            -- `si_` + 24 hex, same shape as usage_event ids
  user_id     text → user, cascade
  source      text               -- "x" now; "linkedin" | "x-archive" | "linkedin-export" later
  external_id text               -- tweet id
  url         text               -- https://x.com/{handle}/status/{id}
  posted_at   timestamptz
  body        text
  meta        jsonb              -- public_metrics verbatim; never parsed for logic
  created_at  timestamptz default now
  UNIQUE (user_id, source, external_id)   -- re-import is a no-op, like scheduled_post
  INDEX (user_id, source, posted_at)
```

The unique constraint is the idempotency story: the import can crash anywhere
and be pressed again; `onConflictDoNothing` makes the second run cheap. No
state column — a source item is a fact, not a job.

## Ingest — `lib/corpus-x.ts`

`importXCorpus({ userId, maxPosts = 200, deps })`:

1. `getAccessToken(userId, "x")` (`lib/channels.ts:710`) — refresh handled
   there. Not connected / needs_reauth → return a typed failure, mirroring
   `PublishFailure` reasons; never throw for a user-state problem.
2. X user id comes from `channel_connection.externalId` — no `/2/users/me`
   call, no extra spend.
3. `GET https://api.x.com/2/users/{id}/tweets` with `max_results=100`,
   `exclude=retweets` (keep replies out of v1 too — voice first, the reply
   wedge later), `tweet.fields=created_at,public_metrics,entities`, and
   `pagination_token` until `maxPosts` or the timeline ends. Every fetch under
   `AbortSignal.timeout`, the `runChannelMaintenance` habit.
4. Insert rows `onConflictDoNothing`. Incremental re-runs pass `since_id` =
   newest stored `external_id` so a re-import reads only what is new.
5. **Meter the spend**: one `usage_event` row per run, `model: "x:read"`,
   `costMicros = 5_000 × postsReturned`. This is the "third kind of non-model
   cost" that `lib/publish.ts:81` said would force a `kind` discriminator —
   the executor should read that comment and decide; the cheap answer (`model`
   still means "what was bought") is acceptable for now, but say so in a code
   comment at the write site.
6. Return `{ ok, imported, skipped, spentMicros, truncated }` — the receipt is
   built from this, so it must be honest about `truncated`.

`maxPosts` defaults low on purpose. 200 posts ≈ $1 and is plenty for the first
voice compile; raising it is a one-line change once the output justifies it.
No silent caps: `truncated: true` must reach the UI copy.

## Compile — `lib/voice.ts`

`compileVoice({ userId, extract })`, shaped like `runHeartbeat`
(`lib/heartbeat.ts:137`) and reusing `getPage`/`putPage`/`appendEvent`:

- Read `source_item` for the user (source `x`), newest first, cap the prompt
  at a sane budget (start: 300 posts / ~100k chars; head+tail if over).
- One `generateObject` call (gateway model, `CHAT_MODEL` default). Schema:

  ```
  {
    voice: {
      tone: string[]            // "direct", "builder-to-builder"
      rhythm: string            // sentence/paragraph habits, openers, closers
      phrases: string[]         // things they actually say, verbatim
      never: string[]           // observed absences: no emojis, no hashtags…
    },
    stories: [{ title, summary, proofUrls: string[] }]   // recurring narratives
  }
  ```

  Prompt rules stolen from what works elsewhere in this repo and in gbrain:
  quote verbatim, never invent, empty result is a valid answer, proof URLs
  must come from the input.
- Write `voice/x` as one brain page — kind `voice`, provenance `published` —
  and one `story/<slug>` page per story with `proofUrls` in `data`. Respect
  the heartbeat's ownership rule verbatim: a page whose provenance is `user`
  is never overwritten; the new observation lands as an event needing review
  (`lib/heartbeat.ts:195` is the reference implementation).
- Idempotent the same way heartbeat is: `compile` event on `voice/x` is the
  watermark; a re-run over an unchanged corpus rewrites the same pages.
- Entitlement-gate the model call with the pure resolver, exactly as
  `runHeartbeatForEveryone` does — this can be triggered from a button, but
  the gate belongs in the library, not the route.

## Surface — `/sources` gets its first live row

`app/(app)/sources/page.tsx` currently renders everything dead on purpose.
This plan makes exactly one row real and leaves the rest untouched:

- The **X row** goes live when `getConnection(userId, "x")` is active:
  state `arriving`, one primary action — **"Import posts from X"** — wired to
  a server action that runs `importXCorpus` then `compileVoice`. Everything
  else on the page stays as it is (one primary action per view; the dead rows
  already explain themselves).
- While running: progress, not silence — this is a many-second action, so the
  button goes into a working state with real copy ("Reading your posts…").
  If the action can't stream progress, a pending state with specific copy
  beats a spinner.
- Receipt, specific or nothing: "Read 187 posts from 2019–2026. Voice page
  updated, 3 stories found. **See what Quincy learned →**" linking to
  `/brain` (the editor already exists and is the correction surface). If
  `truncated`: say what was left out and why.
- Failure copy names the actual problem: `needs_reauth` sends to /channels,
  a 402 explains pay-per-use is off at the developer account, a rate limit
  says when to retry. `classify()` in `lib/publish.ts:105` is the pattern.

No demo-gating: this path is real for any account with an X connection. The
scripted-chat transport is irrelevant here — but tests inject `fetch` and
`extract`, so nothing in CI talks to X or a model.

## Tests & verification

- `lib/corpus-x.test.ts` — injected fetch: pagination stitching, `since_id`
  incrementality, `onConflictDoNothing` re-run, truncation flag, cost math
  (5_000 × returned), typed failures for 401/402/429.
- `lib/voice.test.ts` — injected extractor: page writes, provenance rules
  (user-owned page skipped + event appended), watermark idempotency, empty
  corpus → no model call.
- `scripts/verify-corpus-x.ts` — the live-DB script convention: run against
  the dev account's real connection, print the receipt object, then run
  compile with the real model once. This is also the moment the real
  pay-per-use spend is confirmed against `/credits`.

## STOP conditions

- X answers 402/403 citing billing → pay-per-use isn't enabled on the
  developer account. Account action, not code. STOP, report the exact body.
- The voice compile reads as generic slop on the real corpus → STOP before
  building anything downstream on it; the extraction prompt is the product
  and iterating on it is cheaper than building UI on top of a bad one.
- Anything wants to write `draft` rows → out of scope, that is the
  shipped-work rhythm plan.

## What this sets up

The follow-up plans get shorter because of this one: **LinkedIn ZIP upload**
is a second deterministic ingest into the same `source_item` table
(`source: "linkedin-export"`) with `compileVoice` extended to a `voice/linkedin`
page; **DMA Snapshot ingest** replaces the ZIP when the 3rd-party review
clears; the **shipped-work rhythm** (GitHub → drafts) finally has a voice to
write with; and the **published-posts loop** (Quincy's own `scheduled_post`
rows folding back into the brain weekly) is `compileVoice` pointed at a
different query.
