# Plan 010: Close the chain from approve to published

> **Drift check (run first)**:
>
> ```bash
> grep -rn "insert(scheduledPost)\|insert(slot)" app lib scripts --include="*.ts" --include="*.tsx" | grep -v prototypes
> grep -rn "from \"@/lib/publish\"\|from \"./publish\"" app lib scripts
> ls app/api/cron
> ```
>
> Expected at the time of writing: the only `insert(scheduledPost)` is
> `scripts/seed-drafts.ts:301`, the only `insert(slot)` is
> `scripts/seed-drafts.ts:262`, `lib/publish.ts` is imported by nothing except
> `lib/publish.test.ts` and `scripts/verify-publish.ts`, and `app/api/cron`
> holds `channels` and `heartbeat`. If any of that has changed, someone has
> started this work — STOP.

## Status

- **Priority**: P0 — plan 005 shipped the mechanism and left it with no
  callers. Quincy is "an AI agent that drafts, schedules and publishes" and
  today it does the first one.
- **Effort**: L (three links, one schema change, one new cron)
- **Risk**: HIGH — this is the first code path that puts text on the internet
  in someone's name without a human present at the moment it happens.
- **Depends on**: plan 005 (done). Nothing external.
- **Category**: feature
- **Planned at**: commit `f63c879`, 2026-08-05

## The gap

`lib/publish.ts` is finished, tested and unreachable. Tracing back from it, the
chain has three broken links, not one:

| Link | Today |
| --- | --- |
| Create a slot — a standing commitment | No UI. `insert(slot)` exists only in `scripts/seed-drafts.ts:262` |
| Approve → a `scheduled_post` row | Missing. `approveVersion` sets `state: "approved"` and stops |
| A queued post → published | Missing. No caller of `publish()`, no cron, and nothing ever writes `state: "published"` |

The Lineup has content in development because the seed script put it there.
On a real account it is empty and there is no action that fills it.

**The UI already promises link 2.** `components/drafts/draft-card.tsx:208`
renders "Approved and queued in Lineup" on every approval. Nothing is queued.
That copy is the specification for what approving was always meant to do.

## The decision this plan makes on purpose

`docs/vision.md:188` files **autoposting without approval** under what we are
deliberately not building: "Every rhythm drafts; you send. The one exception
would need to be a decision made on purpose, not one that arrives as a
default."

A cron that sends a queued post at its scheduled time is that exception, and
this is the decision. It is defensible on the terms the vision sets: the human
wrote nothing, but they read the text, pressed Approve, and put it in a slot
they created. The cron carries out an instruction; it does not form one.

What stays true: nothing reaches a platform that a human did not approve, and
no post is scheduled at a time no human chose. That second half is why this
plan builds slot creation rather than defaulting a time — a default time would
be Quincy choosing when to speak, which is the line.

## What Postiz settled for us

Read at `gitroomhq/postiz-app`, commit fetched 2026-08-05. It runs Temporal
workflows rather than crons, so the architecture does not port. Four judgments
do, and each one is a bug we would otherwise have shipped.

**1. Never auto-retry an irreversible publish.**
`apps/orchestrator/src/workflows/post-workflows/post.workflow.v1.0.6.ts:47`
gives the publishing activity `maximumAttempts: 1`, with the reason in the
comment: a retried attempt whose timed-out predecessor still completed in the
background posts twice. Our cron reruns every few minutes over the same query,
which is an automatic retry wearing a different hat. A row that was picked up
and did not come back must never be picked up again.

**2. "We cannot confirm it" is an outcome, not an error.** Their
`markUnconfirmed` tells the user the post probably went out and to check before
reposting. `lib/publish.ts:160` and `:310` already produce exactly this case —
a 2xx with no readable id — and word it correctly. It has nowhere to be
recorded: `scheduled_post.state` is `queued | published`.

**3. A catch-up window has to be bounded.**
`libraries/nestjs-libraries/src/database/prisma/posts/posts.repository.ts:36`
sweeps queued posts from the last two days only. Without a bound, a cron that
was broken for a week publishes a week of stale posts in one burst the moment
it recovers, which is the single worst failure this feature has.

**4. Check the connection before spending a request on it**, and say which
precondition failed rather than reporting a generic error. `publish()` already
returns `not-connected` and `needs_reauth` for this.

## Design

### Schema

`scheduled_post.state` becomes `queued | sending | published | failed`. The
column is `text` with a TypeScript-only enum, so the new values need no
migration; the columns below do.

- `sending` — claimed by a run, in flight. **A row is claimed before the
  platform call, not after.** Two overlapping cron runs then cannot both send
  it, and a run that dies mid-publish leaves the row in `sending` where nothing
  will retry it. That is Postiz lesson 1 expressed as a state rather than a
  retry policy, and it is also where lesson 2 lands: a stuck `sending` row
  means "outcome unknown, go and look".
- `failed` — the platform refused, definitively. `lastError` carries its words.
  Safe to send again by hand.
- New columns: `attempted_at`, `last_error`, `post_url`, `external_id`.

`post_url` is the receipt. A published row that cannot link to the live post
asks the user to take our word for it.

### Link 1 — slots

Server actions to create and delete a standing slot, scoped to the session user
in the same statement as the write, matching `app/(app)/lineup/actions.ts`. The
unique key `slot_user_channel_when_key` already refuses a duplicate.

### Link 2 — approve schedules

`approveVersion` places the version in the next open slot for that version's
channel, using the same `nextOccurrence` reasoning already in
`app/(app)/lineup/actions.ts:138` — the reader's zone, today included.

No slot for that channel means **no row**, which is the shape the schema
already documents at `lib/schema-app.ts:378`: approved with no row here is
exactly "waiting on Drafts for a time". `DoneDraft` stops claiming otherwise.

### Link 3 — the sweep

`lib/publish-run.ts`, called by `app/api/cron/publish/route.ts`. Judgment in the
library, authorisation in the route, matching `/api/cron/channels`.

Selection: `state = 'queued'` and `scheduledFor <= now` and
`scheduledFor > now - CATCH_UP`. Anything older than the window is marked
`failed` with "missed its window" rather than sent — a post that is hours late
is not the post the user scheduled.

## Verification

- Vitest over selection and claiming: window bounds, a claimed row is invisible
  to a second run, a `sending` row is never picked up again.
- `scripts/verify-publish-run.ts` against a real database, following
  `scripts/verify-channel-maintenance.ts`.
- The first real post still settles `/rest/posts` versus `/v2/ugcPosts`. This
  plan makes that reachable; it does not send it.
