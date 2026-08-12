# Plan 019: Circleback meetings become riffs

## Status

**DONE** — branch `feat/circleback-meetings`, executed 2026-08-09, same day as
written. Verified stubbed and live against a running server; see
**Verification** and **What execution changed** at the foot of this file.

Depends on 018 (`riff` states, the Workflow pattern, `generateAnglesFromSaid`)
and on 016 (`rhythm_subscription`, the handler registry). 018 got a second
caller and a rename; 016 turned out not to be involved at all, for a reason
worth reading — see departure 1.

The migration has been applied to production, which is the only database
(`AGENTS.md`). It is one new table and touches nothing existing.

## Why this matters

`docs/vision.md` opens by naming three inputs: "a voice note on a walk, **a call
you recorded**, a pull request you merged". Plan 018 built the first. This is
the second, and it is the one that already has a catalogue entry making a
promise nothing keeps — `meeting-notes` in `lib/rhythms.ts:165` says "After a
recorded call, Quincy reads the transcript for the sentence you said well and
turns it into a draft", `available: false`, `from: ["granola"]`.

The material is the argument. `docs/vision.md:39` puts the scarce resource at
"original thought with a receipt attached — maybe two or three genuinely new
things to say in a week". You say more than that in one customer call. You
explain the product, you answer the objection you have answered forty times and
answer it better this time, you say the sentence that took two years to earn.
All of it is thrown away today.

## Which vendor, and why this one first

`lib/sources.ts:123` already lists Granola and Fathom. Circleback is a third in
the same row, and it goes first for one reason that has nothing to do with the
product: **it is the only one whose integration costs no OAuth.**

There is no Circleback REST API. The two programmatic surfaces are:

- **Webhooks**, configured as an action inside a Circleback Automation. The
  user picks conditions (tags, meeting name, participants, invitee email
  domains, invitee count), picks "Send webhook request", pastes a URL, and gets
  a `whsec_`-prefixed signing secret back.
- **An MCP server** (`https://circleback.ai/api/mcp`, Streamable HTTP, OAuth
  with dynamic client registration, 11 read tools).

The MCP server is the wrong shape and `lib/sources.ts:22` already says why in
the general case: "An MCP endpoint. Stanley files theirs under integrations. It
is an API surface, not a thing that hands over material." Concretely, it is
per-user interactive OAuth against an individual's account, which is a
credential a background job cannot hold. It is a good thing for the owner to
connect in Claude Code. It is not how Quincy reads a meeting.

So the whole integration is: **a URL and a shared secret.** No OAuth app, no
token refresh, no revocation sweep, no `needs_reauth` state. Compare
`plans/005-connect-x-and-linkedin.md`, which spent a plan on exactly that
machinery for X and LinkedIn. Circleback is the cheapest real source in the
catalogue and it should therefore be the one that proves the source-connection
shape for the other ten.

The trigger the catalogue already claims — `{ kind: "event", label: "on
transcript" }` — is what a webhook is. Nothing in the model has to bend.

## The decisions

### 1. A transcript is not a scrap

This is the decision the whole plan turns on, and the numbers are on the live
database rather than in theory.

Measured 2026-08-09 across all ten rows in `riff`: the longest scrap in the
product is **989 characters**. Voice notes top out at 398. `MAX_SCRAP_CHARS` is
6,000 and `MAX_TRANSCRIPT_CHARS` is 19,200.

A 45-minute meeting, at the ~16 chars/second `lib/riffs.ts:759` measured from a
live run, is roughly **43,000 characters** — and unlike a voice note, most of
those characters are not yours.

So `riff.scrap = payload.transcript` is not a small mistake, it is the wrong
data model. A voice note is one person with one idea, which is why 018 could
put the transcript straight into the scrap and ask for angles. A meeting is many
people with many topics, exactly one of which might be worth publishing. The
step 018 did not need is the step this one is mostly made of.

The shape is already in the codebase: `bookmarksToPosts` in
`lib/rhythm-handlers.ts:81` is **read, select, draft**, and its comment says the
middle step "is the one that makes this a product rather than a loop... it
costs one cheap model call to avoid three expensive ones on posts that were
links and job ads." Same argument, larger input.

**A meeting produces at most one riff, and often none.** Not one per topic. A
call that surfaced nothing publishable must be allowed to leave nothing behind,
and the selection prompt has to be told it may return nothing. Two calls a day
that each leave a card is four cards a day nobody reads by Thursday —
`DRAFTS_PER_RUN`'s comment already learned this: "a drafting surface with a
backlog on it stops being read at all."

### 2. Only your own words are stored, and only your own words are read

`lib/schema-app.ts:660` states the rule this plan has to obey: "The distinction
that matters is not where it came from, it is **whose words these are**, and it
is load-bearing." It was written about X bookmarks, where the failure mode is
Quincy learning to write like whoever you bookmark. A meeting transcript is the
same hazard with the volume turned up: the majority of a sales call is the other
person talking, and they are the one who talks in the register you must never
adopt.

So the webhook filters `transcript[]` down to the user's own segments **before
anything else touches it**, and:

- **Only those segments are persisted.** Everyone else's words pass through
  memory and are never written to a row. This is the difference between a
  content tool and a surveillance archive of everyone who has ever been on a
  call with you, and it is not a close call. The people on that call consented
  to Circleback, not to us.
- **`proof` may never be cited from here.** `docs/brain.md:75` calls a
  fabricated proof point "the worst failure this product can have". A sentence
  in a transcript is something you said in a room, not something you published,
  so a `source_item` from Circleback lands with the same standing as chat:
  usable as material, never as a receipt.
- **`compileVoice` must not read it.** Its `sources` parameter already defaults
  to `["x", "x-archive"]`, so this holds by default and the plan changes
  nothing — but state it, because the temptation is real and wrong. These are
  your own words, which is exactly the argument someone will make. Speech is
  not writing voice. How you talk on a call and how you write a post are
  different instruments, and folding one into the other would degrade the page
  that everything downstream reads.

**Matching a speaker to the user.** `attendees[]` carries `{ name, email }`;
`transcript[]` segments carry a `speaker` name. The join is
`user.email → attendee.email → attendee.name → segment.speaker`.

When that join fails — the user's calendar address differs from their Quincy
address, Circleback labelled a speaker "Speaker 2" — **fail the riff with a
sentence, do not guess.** `riff.failure` exists for this and its column comment
says why: "Why it failed, in the user's words rather than the exception's...
the person who has to decide is looking at the card." "Quincy could not tell
which voice was yours on this call" is a card with an action behind it. Picking
the most talkative speaker is a card that quietly writes a post in a customer's
voice, under your name.

### 3. The URL routes; the signature authenticates. Both, not either

Circleback's webhook has no concept of who Quincy thinks you are. It sends one
POST to one URL. So identity has to be carried by the URL:

```
POST /api/webhooks/circleback/<token>
```

where `<token>` is a high-entropy per-user secret Quincy generates. That is what
tells us whose meeting this is, and it is the only thing that can.

It is not sufficient. A URL leaks — into a Circleback workspace shared with
teammates, into a screenshot, into a support thread. Anyone holding it could
POST a fabricated transcript that becomes a card, then a draft, then a post
under your name. So the body is verified too:

- `x-signature` header, HMAC-SHA256 of the **raw body** with the `whsec_`
  signing secret, hex.
- Compare with `crypto.timingSafeEqual`, not `===`. Circleback's own sample
  uses `===`; the sample is wrong in the ordinary way and we should not copy it.
- Read the body with `request.text()` and never `request.json()`. The Resend
  route at `app/api/webhooks/resend/route.ts:19` carries this exact comment:
  "Any framework-level reparsing of the request would change the bytes and
  invalidate the signature."

**Unsigned requests are refused**, even though Circleback treats verification as
optional. Same route, line 27, on a far lower-stakes payload: "Refuse rather
than skip verification. An unsigned body is a stranger asserting that an address
bounced, and acting on it is worse than dropping the event." A stranger
asserting what you said in a meeting is worse than that.

**There is no timestamp header**, unlike Svix. So the replay window Resend gets
for free does not exist here, and dedup has to be structural — see decision 5.

**The setup flow is two steps and there is no way around it**, because Circleback
mints the signing secret, not us:

1. Quincy shows the URL. `/sources` renders it with a copy button and the
   connection sits at `waiting`.
2. The user creates the automation in Circleback and pastes the `whsec_...` back
   into Quincy.

Until step 2 lands, the endpoint answers 202 and drops the body on the floor
without reading it. Do **not** ship trust-on-first-use — pinning the first
unsigned payload is a five-minute window in which the endpoint accepts anything,
and what it accepts is a transcript.

### 4. `source_connection`, the table `lib/sources.ts` already promised

`lib/sources.ts:83` says: "there is no `sourceConnection` table, no OAuth and no
credentials, so nothing connected is the true answer rather than a value we have
not fetched yet. It is a function rather than a constant so the page already
awaits it — when the table lands, this reads it, the demo branch goes, and no
caller changes."

This is that table. `getSourceConnections` keeps its signature.

```ts
export const sourceConnection = pgTable(
  "source_connection",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** An id from SOURCES in lib/sources.ts. Not a foreign key, for the same
     *  reason rhythm_subscription.rhythm_id is not: the catalogue is code. */
    source: text("source").notNull(),
    /** The routing secret in the URL path. Unique globally, not per user —
     *  it is the only thing identifying the caller. */
    token: text("token").notNull(),
    /** Circleback's `whsec_`. Encrypted with symmetricEncrypt from
     *  better-auth/crypto, keyed off BETTER_AUTH_SECRET — the same primitive
     *  channel_connection.accessToken uses, so there is one key in the system. */
    signingSecret: text("signing_secret"),
    state: text("state", { enum: SOURCE_CONNECTION_STATES })
      .notNull().default("waiting"),
    lastItemAt: timestamp("last_item_at", { withTimezone: true }),
    lastErrorAt: timestamp("last_error_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("source_connection_token_key").on(table.token),
    uniqueIndex("source_connection_user_source_key").on(table.userId, table.source),
  ]
)
```

`SOURCE_CONNECTION_STATES` is `["waiting", "arriving", "paused", "broken"]` —
the four already modelled in `lib/sources.ts:55`, which argued them at length
against the checkmark Stanley ships. They now have somewhere to live.

Note what is **not** here: no `accessToken`, no `refreshToken`, no
`accessTokenExpiresAt`, no `scope`. Do not pre-build the OAuth columns for the
ten sources that will need them. The next source that needs a token adds them,
having learned something from a real provider rather than from an imagined one.

Build only the Circleback row. `getSourceConnections` reads the table, the demo
branch in `lib/sources.ts:99` goes, and the other ten sources return nothing
because nothing is connected — which is, as the existing comment says, the true
answer.

### 5. `source_item` is the dedup, and it is free

Circleback publishes no retry policy, and there is no timestamp header to bound
a replay. So the same meeting can arrive twice: a retry after a slow response, a
user re-applying the automation to historical meetings from the Actions menu
(a documented feature), or someone replaying a captured body.

`source_item` already solves this and was designed to:

```
uniqueIndex("source_item_user_source_external_key")
  .on(table.userId, table.source, table.externalId)
```

with the column comment "Re-import is a no-op, enforced here rather than by
callers remembering `since_id`." Circleback's meeting `id` is the `externalId`.
An insert that conflicts means we have seen this meeting; answer 200 and do
nothing. No dedup table, no replay cache, no work.

Add `"circleback"` to `SOURCE_ITEM_SOURCES`. It does not reach `compileVoice`,
whose default already excludes it (decision 2).

What goes in the row:

- `externalId` — the meeting id
- `url` — `https://circleback.ai/meetings/<id>`, so a card can link back
- `postedAt` — `createdAt` from the payload
- `body` — **the user's own segments only**, joined. Not the full transcript.
- `meta` — meeting name, duration, attendee count, tags, `icalUid`. Numbers the
  platform reported, never parsed for logic, exactly as the column comment
  requires.

### 6. Never fetch the recording

`recordingUrl` is in the payload and valid for 24 hours. Ignore it.

`workflows/run-voice-riff.ts:52` deletes a voice note's audio the moment the
transcript exists, and argues: "A recording of somebody thinking out loud on a
walk is the most personal thing this product ever holds, and it has no second
use." A meeting recording is that, plus other people, plus their faces. It has
even less second use — the transcript is what every downstream step reads —
and storing it would make Quincy the most sensitive thing in the user's stack
for no product gain.

This is a decision, not an omission. Write it down at the parse site so nobody
later reads the unused field as an oversight and "fixes" it.

### 7. Ceiling and cooldown, when nobody pressed a button

`AGENTS.md` requires both on every path that spends, and is explicit that a
claim is not a cooldown. A webhook is the hardest case in the product so far:
`voiceNoteCooldown` bounds how often *a person* can trigger a spend, and here no
person is present. The spend is triggered by the user's calendar.

Two bounds, and they are different quantities:

- **Per meeting (the ceiling on one run):** cap the transcript characters that
  reach the selection prompt. The user's own segments from a 45-minute call are
  perhaps 15,000 characters; a three-hour workshop is five times that. Cap at
  `MAX_TRANSCRIPT_CHARS` (19,200, already derived rather than picked) and — per
  decision 1's argument about speech landing its point late — **truncate from
  the head, keeping the tail.**
- **Per user per day (the aggregate):** a count of Circleback meetings
  processed in 24 hours. Someone with eight calls on a Tuesday should get the
  first few and a line saying the rest were skipped, not eight model calls and
  a surprise on `/credits`.

`AGENTS.md:173` names the rhythm dispatcher as "the one path that has no
aggregate ceiling yet... the first thing in the product that spends on a
schedule with nobody present." This is the second, it is worse because the rate
is set by a third party, and it should not ship without the daily cap that 016
deferred.

Meter through `usage_event` as usual. The selection call and the angle call are
both model calls at the going rate; there is no per-minute transcription cost
here, because Circleback already did the expensive part.

### 8. The riff exists before the work does

Reuse 018's two-phase shape exactly: insert the `riff` row `working` with
`startedAt` inside the request, return 202, do everything else in a Workflow.

The justification is weaker than 018's and the shape is still right. A voice
note's row exists immediately because "somebody who recorded a thought on a walk
sees Quincy holding it rather than an empty page" — nobody is watching when a
webhook fires, so that specific argument does not carry. What does carry is the
rest of `workflows/run-voice-riff.ts:23`: the pipeline is external calls back to
back with nobody watching, `after()` is not durable, and a run that dies needs a
row that knows it was running. `RIFF_STUCK_AFTER_MS` and `failVoiceRiff` already
exist and are the reason a dead run becomes a card with a retry rather than a
skeleton forever.

One difference from 018: the riff is written **after** the speaker match
succeeds, not before. A voice note is known to be the user's voice before the
row exists. Here, "we could not tell which voice was yours" is knowable from the
payload alone, without a model call — so it should produce a `failed` riff
directly rather than a `working` one that a workflow immediately fails.

`sourceId: "circleback"`, `sourceLabel: "Meeting"`. Label the shape, not the
vendor: `riff.sourceLabel` renders on the card, and Granola and Fathom will
produce the same card. `sourceId` keeps the vendor for the chain.

### 9. Entitlement failures answer 200

The voice-notes route answers 402 to a lapsed user, which is right — a person is
looking at it. Circleback is not a person and a non-2xx may be retried forever.

So an unentitled user's meeting: write the `source_item` (a row is nearly free,
and it is true — the meeting happened), skip the riff, answer 200. The material
is waiting when they resubscribe. The same applies to a paused connection and to
a user over the daily ceiling.

Reserve non-2xx for what it means: 401 for a bad signature, 404 for an unknown
token (**404, not 401** — the same reasoning as `docs/brain.md:217`, where the
heartbeat cron answers 404 so the path is not confirmed to exist).

### 10. The rhythm entry becomes true

`meeting-notes` gets `from: ["circleback", "granola", "fathom"]` and
`available: true`, and lands in `RHYTHM_HANDLERS`.

The handler registry is the honest place for it even though the trigger is a
webhook rather than the dispatcher's clock. `lib/rhythm-handlers.ts:16` says
`/rhythm` reads the registry rather than `Rhythm.available`, "so the switch a
user sees can never be ahead of the machinery". The subscription row is what the
webhook checks before doing any work — which makes the switch on `/rhythm` real:
off means the transcript is stored and nothing is drafted.

## What ships

1. **`source_connection`** in `lib/schema-app.ts`, plus a `scripts/` migration in
   the repo's manual `tsx --env-file` convention. Note `plans/README.md:103` —
   the `channel_connection` scope defect — and check whether any `Omit`-based
   safe-projection type needs a matching field before calling this additive.
2. **`lib/source-connections.ts`** — the narrow write API, matching `lib/brain.ts`
   in spirit: `connectSource`, `setSigningSecret`, `resolveByToken`,
   `recordArrival`, `markBroken`. Nothing else touches the table, and the
   decrypted secret never leaves this module.
3. **`app/api/webhooks/circleback/[token]/route.ts`** — resolve, verify, parse,
   filter to the user's speaker, insert `source_item`, gate on entitlement +
   subscription + daily ceiling, insert `riff`, `start()` the workflow, 202.
   No model call in the request.
4. **`workflows/run-meeting-riff.ts`** — select the moment, then angles, then
   complete or fail. Two steps, mirroring `run-voice-riff.ts`.
5. **`lib/meetings.ts`** — the payload type, the speaker match, and
   `selectMeetingMoment` (the new prompt). The angle generator is
   `generateAnglesFromSaid`, unchanged: its input is "the transcript, verbatim"
   and a selected passage is exactly that. Do not write a third generator.
6. **`lib/sources.ts`** — the `circleback` entry (`gives: "The moment worth
   quoting from a call"` — Granola's and Fathom's lines already exist and must
   stay distinguishable), and `getSourceConnections` reading the table.
7. **`/sources`** — the connect flow: reveal URL, copy, paste secret back,
   disconnect behind `<HoldToConfirm>`.
8. **`lib/rhythms.ts`** + `RHYTHM_HANDLERS` — decision 10.

## Verification

Every plan from 006 onward ends in a controlled check against a running system
rather than a unit test that passes whether or not anything calls it.

`scripts/verify-circleback.ts`, guarded on `@quincy.test` per `AGENTS.md:139` —
the guard is on the target, never on `NODE_ENV`, because there is one database.

The discriminating triple, modelled on 006's:

| Request | Expected |
|---|---|
| valid signature, unknown token | `404`, no rows |
| valid token, **tampered body**, original signature | `401`, no rows |
| valid token, valid signature | `202`, one `source_item`, one `riff` |
| the same body replayed | `200`, still one `source_item`, still one `riff` |

The fourth row is what distinguishes idempotency from an endpoint that happens
to work once. The second is what distinguishes verification from a route that
reads the header and ignores it — 003's mistake was a guard that could not run,
and an unverified HMAC is the same defect wearing a different hat.

Then one live run: a real Circleback automation, a real meeting, and a human
reading the card. The question is not whether a row appeared. It is whether the
sentence Quincy picked is the one you would have picked.

## What execution changed

Four departures. The plan text above still argues for the version that was not
built in each case, and is left standing so the reasoning can be compared.

### 1. The rhythm subscription is not the switch — the connection is

Decision 10 said `meeting-notes` should land in `RHYTHM_HANDLERS` and that the
webhook should check for an enabled `rhythm_subscription`. Both are wrong, and
the schema is what says so.

`isRunnable` in lib/rhythms.ts already reads
`rhythm.trigger.kind === "clock" && hasHandler(rhythm.id)`. An event rhythm can
never be switched on from `/rhythm`, because there is no hour to choose and
nothing for the dispatcher to fire — and `rhythm_subscription.next_run_at` is
`NOT NULL`, so subscribing to one would mean inventing a next run for something
that has none. Registering a handler would have been worse: `RHYTHM_HANDLERS` is
what the cron dispatcher iterates, so it would have put a clock behind an event.

So the switch is connecting and disconnecting Circleback on `/sources`, and
`meeting-notes` stays `available: false` — which is exactly where the shipped
Voice Notes rhythm already sits, for the same reason. That consistency is the
evidence the model was right and the plan was reaching.

### 2. `completeVoiceRiff` → `completeSpokenRiff`

Not in the plan. The meeting workflow's second step is the voice note's only
step — store the words, ask `generateAnglesFromSaid` for angles — and reusing it
was obviously correct and left a function named for one of its two callers.

Renamed with `failVoiceRiff` → `failSpokenRiff`, which touched prose in six
files that name the symbol. Worth the wider diff: a comment naming a function
that no longer exists is the rot this codebase spends most of its comments
avoiding. `startVoiceRiff` kept its name and gained a sibling,
`startMeetingRiff`, over a shared private `startSpokenRiff`.

The one behavioural change: `completeSpokenRiff` takes an `emptyMessage`,
because "that recording came back empty" is a lie about a meeting — nothing was
recorded by us, and the silence being reported is a selection that found
nothing.

### 3. The model returns indices, never a quote

Decision 1 said "select the passage". The obvious implementation asks the model
for the passage, and it is one paraphrase away from a `riff.scrap` that is not
what anybody said — which then becomes a draft, and a story, and a post.

So `selectMeetingMoment` returns segment *indices* and `assemblePassage`
reassembles the text verbatim in code. A model that cannot write the quote
cannot invent it; the worst it can do is pick the wrong lines, which is visible
on the card. `lib/meetings.test.ts` pins this as a property — every word of the
output is a word of the input — alongside the malformed cases the model never
produces in development (duplicate indices, floats, negatives, past the end).

### 4. A bad signature does not mark the connection broken

The plan gave `markBroken` the signature-failure case. Built and then removed:
a failing signature is far likelier a stranger than an upstream rotation, and
letting a stranger switch somebody's source off by POSTing garbage at a URL they
found would hand them the one destructive action this endpoint has. The error is
recorded on the row and `/sources` shows it; the user decides.

`broken` and `paused` consequently have no producer yet. They stay in the enum
because `lib/sources.ts` already models them and the row already renders them.

## Verification

`scripts/verify-circleback.ts`, guarded on `@quincy.test`. Both modes run
2026-08-09 against a dev server; **30 checks**, all passing. Twenty-four at
first, plus six added by the cold audit below — four of which fail against the
code as originally shipped.

The discriminating set, as promised above:

| Request | Result |
|---|---|
| valid signature, unknown token | `404`, no rows |
| signed body, secret not yet stored | `202`, **no rows** — no trust on first use |
| no signature | `401` |
| **tampered body, original signature** | `401` |
| signature from the wrong key | `401` |
| valid token, valid signature | `202`, one `source_item`, one `riff` |
| the same body replayed | `200 duplicate`, still one of each |
| user not an attendee | `202 failed`, one row with an **empty body** |
| that same unmatched meeting again | `200 duplicate`, **riff count unchanged** |
| body past 4MB | `413`, refused on the header before it is read |
| entitlement expired | `200 unentitled`, `source_item` kept, no riff |
| after disconnect | `404` |

The tampered-body row is the one that matters. A route that reads `x-signature`
and ignores it passes every case that only ever sends a correct signature —
which is 003's defect wearing a different hat.

The live run (`--live`, real Gateway, real money) produced this from a
2,460-second fixture call between the user and a client:

> · Short post: *The hard part was never writing the post. It was remembering
>   what happened during the week that was worth writing about.*
> · Essay: *We stopped building a writing tool and started building a memory.*

Both are the user's own sentences. The client's most quotable line — "we tried
three tools and gave up on all of them" — is absent from the angles, from
`riff.scrap` and from `source_item.body`, which is the assertion the script
makes by name rather than by counting rows.

### The bug the e2e caught

The route selected `{ id, email, name }` and handed that object to
`resolveEntitlement`, which reads `trialEndsAt` **off the object it is given**
rather than out of the database. So every user resolved to `expired`, and the
endpoint stored meetings and drafted nothing, silently and forever.

Nothing would have surfaced it. It throws no error, logs nothing, and returns a
2xx by design. It was caught because the script asserts *a riff exists* rather
than asserting a status code — and then only on the second run, after the
account's long-dead trial was held open the way `verify-rhythms.ts` learned to.
The same condition made eight assertions pass for the wrong reason in that
script; here it made two fail, which is the better failure.

## The cold audit, and what it found

`plans/README.md` closes with a note that these plans are written by the same
session that writes the code they critique, and that "a cold review of this
changeset would still be worth having". One was run against `0263661` before
this PR was opened for review. Four findings, all introduced by this branch,
all fixed in the same branch.

### 1. The unmatched path made failed riffs without limit

The worst of the four, and it was a consequence of the plan's own privacy rule
applied one step too literally.

Decision 2 says a meeting Quincy cannot attribute must store nothing. The route
implemented that by returning from the unmatched branch *before* the
`source_item` insert — so there was no row, so there was no unique key, so
there was **nothing for a redelivery to collide with**. Circleback retries, and
re-applying an automation to historical meetings is a documented bulk action.
Every retry of an unattributable meeting made another failed card, past the
daily ceiling, indefinitely.

The user it hits is precisely the one the name fallback was written for:
somebody whose calendar address differs from their Quincy address.

The fix is an ordering change. The insert now happens before the unmatched
branch, and an unmatched meeting stores an **empty body** — the fact that the
call happened and not one word of it. That is a dedup key which gives up
nothing the privacy rule protects, because by definition there was nothing of
the user's to keep.

**The old e2e asserted this bug was correct.** It checked
`items.length === 0` after an unmatched delivery and passed. It never sent the
same unmatched meeting twice, so the pile-up was invisible to it. The
assertion is now `one row, empty body`, followed by a retry that must not
change the riff count.

### 2. The body was buffered before any size check

`request.text()` has to run before the HMAC, because the signature is over the
raw bytes. With no ceiling, anybody holding the URL could make the function
read up to Vercel's 100MB limit and throw it away — not a forgery, but a way to
spend somebody else's compute.

`MAX_BODY_BYTES` is 4MB, checked on `Content-Length` first and on the real
length after, which is the order and the argument
`app/api/voice-notes/route.ts` already uses.

### 3. `connectSource` was select-then-insert

Two Connect presses milliseconds apart both saw no row, both inserted, and the
loser got a raw unique violation thrown out of a server action. Now
`onConflictDoNothing` followed by a read-back — the same single-statement
concurrency control `lib/corpus-x.ts` uses, for the same reason: the HTTP
driver has no interactive transactions.

### 4. `toSafeSourceConnection` had no test

It is the only thing keeping `signing_secret` out of client-facing data, and
`plans/README.md:103` already records how this exact shape fails: an
`Omit`-based safe type makes a newly added column *required* in the projection,
the compiler asks for it, and forwarding the value is the fastest way to
satisfy it. `lib/source-connections.test.ts` asserts the shape rather than the
one field — no key matching `/secret|password|apikey|refresh/i` may survive —
so it fails on the *next* secret column rather than only this one.

### Considered and rejected

- **Double metering when a workflow step retries.** If `selectStep` retries, a
  second model call genuinely happened and a second `usage_event` is correct.
- **`recordArrival` firing on a replay**, so `/sources` reports a redelivered
  old meeting as "just now". Real, cosmetic.
- **`paused` and `broken` having no producer.** Deliberate; see departure 4.
- **The token appearing in access logs.** Inherent to path-based webhook
  tokens and already mitigated by the HMAC — log exposure alone does not let
  anyone forge a delivery.

## STOP conditions

- **The speaker match cannot be made reliable.** If matching by attendee email
  fails on real payloads, stop and bring the payload back rather than adding a
  heuristic. Decision 2 is the plan; a fallback that guesses is not a smaller
  version of it.
- **The selection prompt cannot return nothing.** If a call with nothing
  publishable in it still produces a card, the ceiling in decision 7 is treating
  a symptom. Fix the prompt.
- **Anything here needs a change to `compileVoice`'s `sources` default.** That
  default is a guard (`lib/schema-app.ts:663`). Needing to touch it means
  something upstream is wrong.

## Follow-ups, deliberately not in scope

- **Granola and Fathom.** Both are the same card and neither has Circleback's
  no-OAuth property. Ship one vendor, learn what a meeting riff is actually
  worth, then decide whether a second is a source or a settings row.
- **The Circleback MCP server for the owner's own tooling.** Unrelated to the
  product; useful, and a `claude mcp add` rather than a plan.
- **`insights`.** The payload carries user-defined insight categories, which are
  a better selection signal than the transcript if the user has configured them.
  Ignored in v1 because most workspaces have none, and a feature that works for
  configured users and silently not for others is the prompt-caching trap in
  `plans/README.md:250` wearing a different hat.
- **Action items → rhythms.** `actionItems[]` is right there and is a different
  product. Quincy is Head of Content, not a task manager.
