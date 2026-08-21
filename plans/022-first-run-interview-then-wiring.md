# Plan 022: First run — four questions, then the wiring

## Status: BUILT on `feat/first-run`

Executed 2026-08-11. `scripts/verify-onboarding.ts`: 22/22 against the live
database, teardown clean. `lib/connect-return.test.ts`: 8/8. The two redirect
behaviours it cannot reach from a script were checked by curl against a dev
server and are named at the foot of that script.

**Five departures from the plan below, four of them found by building it.**

1. **Question four does not use `createRiffFromPost`.** The plan said reuse it.
   It is built for somebody else's post: it writes `adaptedFromUrl` /
   `adaptedFromHandle` and prompts `generateAngles` for the angle *you* could
   take on a stranger's writing. First run asks what *you* shipped. Using it
   would file a person's own work as borrowed on the first card they ever see.
   `startTypedRiff` (a three-line wrapper on the existing private
   `startSpokenRiff`) plus the existing `completeSpokenRiff` is the path — the
   own-words generator, and an `emptyMessage` that was already parameterised
   because "that recording came back empty" is a lie for a caller that did not
   record anything.

2. **A layout cannot see the pathname**, so the redirect needed one. `proxy.ts`
   now forwards it as `x-quincy-pathname` and the layout compares it to one
   literal. A missing header does not redirect — that fails open (somebody
   skips the interview) rather than into a loop on the one page that cannot
   escape it. The constant lives in its own dependency-free module so a layout
   does not pull `next/server` and `better-auth/cookies` into its graph.

3. **The raw answer is stored in the voice page's `body`.** Reading the rule
   back out of `data.rules` put Quincy's phrasing in the user's own bubble:
   somebody who typed "English" was shown saying "Write all posts and drafts in
   English." A transcript claiming to be a record of what was said has to be
   one.

4. **The backfill is bounded by a literal date, not `WHERE onboarded_at IS
   NULL`.** The IS NULL version reads as the idempotent one and is the
   dangerous one — re-run next month it marks every account that has signed up
   since as onboarded, skipping first run for exactly the people it was built
   for.

5. **`onboarded_at` is `timestamptz`**, unlike its neighbours on the
   better-auth `user` table. Those naked timestamps are what the generator
   emitted; every column this app has added for itself is timestamptz, and this
   is an instant.

One bug worth recording because it survived a typecheck, a lint and a
screenshot: the in-flight turn was held as a bare string, so after the server
advanced it rendered the previous answer underneath the *new* question, and
its own `if (pending) return` guard then silently dropped every later answer.
First run stopped at question one. It is tagged with the question id now and
derived against the current one, so it clears without an effect.

## What the first real run through it changed

Shipped, then used. Five things came back, and the first one is the one that
matters: **"I just got RAMMED into it. I didn't understand what I needed to
do."**

1. **Quincy introduces itself now.** The old first screen was a personal
   question, a composer and nothing else — no idea who was asking, how many
   questions were coming, how long it would take, or whether any of it was
   reversible. Two lines fix it, and they say exactly those things and stop.

2. **The name is used, never asked for.** Signup requires a name and Google
   supplies one, so every account on the database already has one before it
   reaches here. Quincy opens with it.

3. **The newest line types.** A question that appears instantly beside a
   composer reads as a printed form rather than as something addressed to you.
   By word, not by character — a 25-word question at per-character speed is a
   three-second wait. `motion-reduce` shows it whole.

4. **Turns and rail entries arrive rather than blinking into place.** The
   prototype had this and the port dropped it, which is what made it feel
   "way too harsh". 300ms, fade and rise, `motion-reduce:animate-none`.

5. **The transcript is no longer replaced.** This was a regression against the
   approved Handoff design, which said the wiring appears *underneath* the
   conversation. The port swapped the screen instead, so the last answer went
   in and the page became a settings page mid-sentence. Quincy now says the
   handover as a turn and the wiring lands below it — and the `<h1>` that used
   to repeat that sentence is gone, because the conversation says it.

Two bugs found while fixing those:

- **The last user turn rendered as an empty bubble**, and the rail's Riffs
  entry read "Saved.", because question four's answer became a riff and nothing
  read it back. `latestRiffScrap` returns the text instead of a boolean.
- **`onDone` fired inside a `setShown` updater.** Updaters run during render,
  so finishing a line set state on the parent mid-render. Same shape as the
  bug in the prototype's tail, and the same fix: the completion is an event and
  belongs in an effect.

## The second run: no chrome, and no links that lie

Both findings have one cause. **Until `onboardedAt` is set, every route in the
`(app)` group redirects back to /welcome** — so any in-app link rendered
during first run is a control that silently returns you to the page you are
already on.

- **The sidebar was a menu of no-ops.** Nine nav items, every one of them a
  silent bounce. Removed, and removed properly: /welcome moved into its own
  route group with a bare layout carrying the mark, for the reason written at
  the top of `app/(auth)/layout.tsx` — someone who cannot log in has nothing
  to navigate to, and neither does someone who has not finished first run.
- **This reverses decision 2 above, and pays for itself.** With /welcome
  outside the group, the `(app)` layout no longer has to exclude it from a
  redirect to itself — so the pathname comparison goes, and with it the header
  `proxy.ts` was forwarding purely to make that comparison possible.
  `lib/pathname-header.ts` is deleted. Departure 2 in the list above is now
  moot: the problem it solved stopped existing.
- **Circleback's Connect was the bug.** It was a `<Link href="/sources">`, so
  pressing it looked like nothing happened. Its real setup mints a webhook URL
  to paste into another product and waits for a signing secret to come back —
  a several-minute detour into somebody else's dashboard, which first run is
  the wrong place for. It is described now, not offered.
- **GitHub keeps its button**, because its install is a link *out* to
  github.com and comes back through the callback into the flow. Null install
  URL renders as a description rather than a dead control.

## The third run: both exits were dead, and why nothing caught it

**"Do the rest later" wrote `onboardedAt` and then bounced straight back to
/welcome.** So did "Write the first draft" — both exits, not one.

`session.cookieCache` is enabled in lib/auth.ts with a five-minute window: the
whole user object is cached in a signed cookie and read without touching the
database. The `(app)` layout gates on `session.user.onboardedAt`, so after the
write it was still reading `null` out of that cookie. The row was correct the
whole time. `markOnboarded` now forces a fresh read with
`disableCookieCache`, which rewrites the cache cookie — `nextCookies()` is what
puts it on the action's response.

**Nothing caught it because nothing was testing the seam.**
`scripts/verify-onboarding.ts` is library level: it proved the read model and
the write contract, and every assertion passed while both exits were broken.
The two worst bugs in this feature have both lived in the gap between a write
and the next request, and neither types, lint, unit tests nor a screenshot can
see that gap.

So `scripts/verify-first-run-e2e.ts` drives the real thing: real sign-in, real
browser, real server actions, real redirects, cold account to `/studio`. 20
checks. It was written against this bug and verified the honest way — removing
the fix turns exactly two checks red, and the failure detail reads "bounced
back to /welcome" while `onboardedAt is set` still passes, which is the bug
stated precisely.

Two things it had to learn about the environment, both recorded in its head
comment because they present as something else:

- **better-auth refuses a request with no `Origin`** — `MISSING_OR_NULL_ORIGIN`,
  answered 403, which is indistinguishable from an unverified address. Node's
  `fetch` does not send one.
- **The sign-in issues two cookies**, and replaying only `session_token` left
  the browser carrying a previous run's cached user. That made the suite flaky
  in a way that looked like an app bug and was not.

## The decision record, folded in

`app/prototypes/onboarding/` is deleted, as this plan required. What its
`DECISION.md` held:

**Round one — the shape of first run.** Interview won. Rejected: **Ledger**
(connect X, read 57 posts, approve or cut eight claims about yourself, each
with its receipts) — the strongest single idea in the round, lost on ordering
rather than merit, because it charges a dollar and asks for publish permission
before the person has seen Quincy do anything. **Checklist** (four non-blocking
tasks above the composer) — chores on the first screen with the value last, and
it shows the person nothing about what the product does. **First draft** (no
setup; produce a post immediately and mark the three things Quincy had to
guess) — the first draft is by construction the worst draft the product will
ever make, and leading with it inverts the impression.

**Round two — where the wiring goes.** Handoff won. Rejected: **Thread** (the
wiring stays in the conversation) — a permission grant and a dollar of spend
end up buried in a scrolling transcript, and nothing is re-findable. **Rail**
(the wiring moves to the periphery so the centre is usable immediately) — the
periphery is where things go to be ignored, and below `lg` there is no rail at
all, so it becomes a different design that has to be judged separately.

**Carried over from the losers, and live in the built version:** receipts on
what the corpus read learned (Ledger); "a habit, not a rule" as UI copy rather
than only a guard in `lib/voice.ts` (Ledger); nothing blocks, and skipping is a
button rather than something you have to say (Checklist).

**Still owed, as follow-ups rather than gaps here:** the annotated first draft
(First draft's idea) belongs after drafting is wired, not inside first run.


> **Drift check (run first)**:
>
> ```bash
> grep -rn "onboardedAt\|onboarded_at" lib app scripts
> grep -rn "welcome" app --include="*.tsx" | grep -v prototypes
> grep -rn "next" "app/api/connect/[channel]/route.ts"
> ls app/prototypes/onboarding
> ```
>
> Expected at the time of writing: no hits for the first three, and
> `app/prototypes/onboarding` holds `DECISION.md`, `data.ts`, `harness.tsx`,
> `page.tsx`, `parts.tsx`, `proto.css` and three variants. If any of that has
> changed, someone has started this work — STOP.

## Status

- **Priority**: P0. The cold start is the largest hole in the product. The
  first real signup on the live database, `delivered@resend.dev` (2026-08-01),
  has **0 brain pages, 0 connections, 0 riffs** and has never come back. Every
  drafting feature downstream produces generic text for an account in that
  state, which reads as the product being bad rather than as unfinished setup.
- **Effort**: M. One column, one route, four server actions, one change to the
  connect callback. No new tables.
- **Risk**: MEDIUM. Two paths spend real money (the corpus read, and the first
  riff's angle generation), and one of them is reached by a person who has
  existed for ninety seconds. Both reuse guards that already exist; this plan
  adds no new spending path and must not.
- **Depends on**: 005 (X connection), 011 + 012 (corpus import, its cooldown),
  019 and 021 (the two live sources). All shipped.
- **Category**: feature.
- **Planned at**: 2026-08-11.
- **Design decided at**: `app/prototypes/onboarding`, two rounds, recorded in
  that directory's `DECISION.md`. **Read it before writing any UI.** It carries
  the reasoning for calls this plan does not repeat.

## What this builds

```
verify email → sign in → /welcome
  ├─ four questions, in the Studio's own chat components
  │    each answer writes to the brain as it lands
  ├─ "That is the talking done."
  ├─ Where the writing goes out   → X, LinkedIn      (channel_connection)
  │    └─ once X is granted: read my last 200 posts  (importFromX, ~$1)
  └─ Where the material comes in  → Circleback, GitHub, the dead register
       └─ Write the first draft → /riffs   |   Do the rest later → /studio
```

The shape is the **Handoff** variant: the interview is a conversation, and the
wiring is a screen after it. The seam is deliberate and is named on screen
("That is the talking done"). The losing tails and the reasons are in
`DECISION.md`; do not relitigate them here.

## Why the wiring is not a conversation

Granting an app permission to publish in your name, and spending a dollar, are
not conversation. In a thread you get one ask at a time with no sense of how
many are coming, the terms scroll away behind you, and "no" costs more socially
than it should. On one screen every ask is visible at once, the grant sentence
sits under each, and skipping is a button rather than something you have to say.

It also mirrors where these things actually live: the screen is `/channels`
above `/sources`, in that order, at the moment they matter. The person learns
those two pages exist and what the difference is, instead of meeting them for
the first time when something breaks.

## The one product fact that shapes everything

**Connecting X is one consent that buys two things.** It is a publishing
channel and it is the corpus `compileVoice` reads to learn the voice.
`lib/sources.ts` already refuses to list channels as sources and says why in a
sentence. A first run that asks for X once under Channels and again under
Sources has misread the product.

So the corpus read is not a source row. It is an offer that appears *inside the
channels section*, only after X is granted, because it runs through that grant.

---

## Decision 1: `user.onboarded_at`, not derived state

Add one nullable column:

```
user.onboarded_at  timestamptz   -- null until first run is finished or skipped
```

The tempting alternative is to derive it: no `identity` page means a new user.
It is wrong, and the failure is not subtle. **A person who skips everything has
an empty brain**, so a derived check re-onboards them on every visit forever.
The column answers "have they been asked", which is the actual question; the
brain answers "what do we know", which is a different one.

Written by exactly two paths: finishing the wiring screen, and pressing "Do the
rest later". Both are explicit acts. Nothing else sets it — in particular the
corpus import must not, or an account that connected X from `/channels` months
later would silently count as onboarded.

Applied with the `scripts/*.sql` + `apply-*.ts` convention that the channel and
cooldown columns used. **Not `drizzle-kit push`**: there is one database branch
and a push from a laptop rewrites production's schema.

## Decision 2: `/welcome`, a real route in the `(app)` group

Not a mode of `/studio`, for three reasons in ascending order of weight:

1. `/studio` mints a conversation id per visit and owns the chat machinery.
   None of that applies — the interview writes brain pages, not turns.
2. Putting it in `/studio` implies the interview is a conversation that gets
   persisted as one, and the sidebar's "New conversation" would let someone
   walk straight out of first run without it ever being marked finished.
3. **The OAuth round trip needs a stable return URL.** Decision 4.

`app/(app)/layout.tsx` gains one redirect, next to the session gate it already
owns: a signed-in user with `onboarded_at === null` on any route other than
`/welcome` goes to `/welcome`. One redirect in the group rather than one per
page, for the reason that file's comment already gives — a surface added later
is gated by existing, not by remembering.

`getSession()` is already resolved there, so this costs no extra query if
`onboarded_at` rides on the session user. Check whether better-auth's
`additionalFields` carries it; if not, this is one indexed read by id and the
layout already awaits two things in parallel.

## Decision 3: the answers write as they land, not in a batch at the end

Each question's answer is written to the brain the moment it is given, through
`lib/brain.ts` and nothing else:

| Q | Writes | Slug | Kind | Provenance |
| --- | --- | --- | --- | --- |
| 1. What do you do | `putPage` | `human` | `identity` | `user` |
| 2. Who do you write for | `putPage` | `memory/who-you-write-for` | `memory` | `user` |
| 3. Which language | `putPage` | `voice` | `voice` | `user` |
| 4. What did you ship | `createRiffFromPost` | — | — | — |

Two consequences, both wanted:

- **Abandoning is survivable.** Which question comes next is derived from which
  of those pages exist, so a refresh, a closed laptop or a crashed tab resumes
  where it stopped. No progress column, no session storage.
- **The pages are `user`-owned, which protects them from the compile.**
  `compileVoice` writes `voice/x`, not `voice`, and skips any page whose
  provenance is `user` (lib/voice.ts:319, "the heartbeat rule"). So the
  language rule a person states in question three survives the corpus read that
  happens ninety seconds later. This is load-bearing: get the slug or the
  provenance wrong and the model overwrites a stated preference with an
  inferred one.

Question 3 is a read-modify-write on `voice.data.rules` and must respect
`RULE_CAP` (15, exported from `lib/brain.ts`). One rule from a fresh account
cannot hit it; write the guard anyway. `assertValid` in `putPage` is the
backstop, and a rejected write must not lose the answer.

## Decision 4: the connect callback learns where to come back to

Today `app/api/connect/[channel]/callback/route.ts` hard-codes every exit to
`/channels/<channel>` — `back()` at line 32. Connecting X from `/welcome`
therefore dumps the person on `/channels`, out of first run, with the wiring
half done and no way back that they were told about.

The fix is small and rides on machinery that already round-trips:

- `app/api/connect/[channel]/route.ts` accepts `?next=`, and puts it in the
  **handshake cookie**, which already survives the trip to the provider and
  back and is already single-use.
- `back()` reads it and redirects there instead, keeping its existing query
  params so `/welcome` can render the same outcomes `/channels/<platform>`
  does today.

**`next` is validated against a fixed allowlist, not a prefix check.** One
value for now, `/welcome`. Anything else falls back to `/channels/<channel>`.
An unvalidated return-to on an OAuth callback is an open redirect, and this one
is reachable while the person holds a fresh session — `//evil.example` and
`/\evil.example` both pass a naive `startsWith("/")`. Compare against a literal
set and there is nothing to get wrong.

Do not add `next` to the disconnect route. Nothing needs it and it doubles the
surface.

## Decision 5: the wiring screen reads its state from the database

The prototype fakes this with `useWiring`, a component-level `Set`. That cannot
survive the redirect to X and back, so the real screen derives everything
server-side on each render:

| Section | Source of truth |
| --- | --- |
| X / LinkedIn connected | `listConnections(userId)` (lib/channels.ts) |
| X connectable at all | `isChannelEnabled` — a deployment without credentials must not show a live Connect |
| Corpus already read | `corpusSummary(userId)` → `{ items, newestPostedAt }` |
| Circleback / GitHub | `getCirclebackSetup()`, `getGithubSetup()` — reuse verbatim |
| The dead register | `SOURCES` from lib/sources.ts, buttons disabled, one sentence above saying why |

`getGithubSetup().connected`, not the fixture — the note in
`app/(app)/sources/page.tsx` explains why reading the demo fixture made Install
unreachable for exactly the accounts that would install first.

## Decision 6: the corpus read reuses `importFromX`, unchanged

`app/(app)/sources/actions.ts:48` already carries the entitlement gate, and
`importXCorpus` already carries the ceiling (`DEFAULT_MAX_POSTS` = 200,
`lib/corpus-x.ts:35`) and the cooldown (`IMPORT_COOLDOWN_MS` = 10 minutes,
`lib/corpus-x.ts:29`, claimed against `channel_connection.lastImportAt`).
First run calls that action and renders its receipt.

**Do not write a second import path**, and do not add a "first run is special"
branch inside it. The money rules in `AGENTS.md` exist because both cost bugs
in PR #21 arrived as a persuasive comment explaining why a guard was
unnecessary. A copy of this action without the cooldown, reachable by a
brand-new account, is that bug with a fresh coat of paint.

Two additions, both outside the action:

- `revalidatePath("/welcome")` alongside the existing `/sources` revalidate.
- The receipt on screen shows **what was learned, with receipts**: two of the
  compiled rules, each linked to a `source_item` URL it was read out of. This
  is the one idea carried over from the losing Ledger variant, and it is the
  difference between the model asserting things about a person and showing its
  working.

`truncated` must reach the copy. No silent caps.

## Decision 7: question four spends, so it is gated like everything else

`createRiffFromPost` calls `generateAngles`, which is a model call. That makes
question four a spending path reached by an account that is ninety seconds old.

- It is entitlement-gated, the same as `importFromX`. A free-day account is
  entitled; a lapsed one gets the interview and a riff it cannot generate
  angles for, and must be told so in a sentence rather than shown a spinner
  that never resolves.
- `MAX_SCRAP_CHARS` (`lib/riffs.ts:586`, 6,000) already bounds what one answer
  can cost. Note it is *not* the voice-riff ceiling; the comment at line 747
  explains why those two numbers are different and must stay so.
- It is once per first run by construction. No cooldown is added — but if the
  answer is ever made re-submittable, one is owed.

If angle generation fails, **the riff still exists and the interview still
advances**. Losing the answer because a model call failed would be the worst
possible first minute.

## Files

**New**

```
app/(app)/welcome/page.tsx         server: reads state, decides interview vs wiring
app/(app)/welcome/actions.ts       answerQuestion, finishOnboarding, skipOnboarding
components/welcome/interview.tsx   client: transcript, chips, composer, rail
components/welcome/wiring.tsx      client: channels, corpus offer, sources
scripts/apply-onboarded-at.sql     the column
scripts/apply-onboarded-at.ts      the runner
scripts/verify-onboarding.ts       e2e, guarded on @quincy.test
```

**Changed**

```
lib/schema.ts                      + onboardedAt
app/(app)/layout.tsx               + the one redirect
app/api/connect/[channel]/route.ts + ?next=, into the handshake
app/api/connect/[channel]/callback/route.ts  back() honours it, allowlisted
app/(app)/sources/actions.ts       + revalidatePath("/welcome")
```

**Lifted from the prototype, not rewritten.** `parts.tsx` in
`app/prototypes/onboarding` holds the settled interview: the transcript, the
chips, the rail, `BrainSummary`, `ChannelRow`, `CorpusCard`, `SourceRow`. Port
it, then delete the whole prototype directory. Details that must survive the
port, because each was a fix:

- Chips are **real answers, not categories**, and send on click.
- The transcript sinks with `mt-auto`, never `justify-end` — the latter pushes
  the first turns out of reach once the conversation outgrows the viewport.
- The pause says "Writing that down…", not three dots.
- The rail is the audit trail and, below `lg`, collapses to one line that is
  never hidden.
- Exactly **one filled button in view**. The first unconnected channel owns it;
  "Write the first draft" stays outline until a channel is connected.
- A rule between the channel rows. Without it X's "also unlocks" line reads as
  LinkedIn's, and that is the one sentence here that must not be misattributed.
- `prefers-reduced-motion` on every animation, named transition properties, no
  `transition-all`. `hugeicons` only.

## Verification

`scripts/verify-onboarding.ts`, on `dev@quincy.test`, following the existing
verify-script convention — guarded on the **address**, not on `NODE_ENV`,
because the environment cannot tell you anything and the dev database is the
production database.

1. A fresh user with `onboarded_at` null is redirected to `/welcome` from
   `/studio`, `/riffs` and `/brain`.
2. Each answer writes its page with `provenance: "user"`; a re-run of question
   three does not exceed `RULE_CAP`.
3. Killing the session mid-interview and returning resumes at the right
   question.
4. `compileVoice` after the interview writes `voice/x` and **skips** `voice` —
   the stated language rule survives.
5. `?next=/welcome` round-trips; `?next=//evil.example`, `?next=/\evil.example`
   and `?next=https://evil.example` all fall back to `/channels/x`.
6. Skipping sets `onboarded_at` and `/welcome` stops intercepting.
7. `onboarded_at` set, then `/welcome` visited directly: it renders, it does not
   redirect-loop, and it does not re-ask.

`--live` additionally runs one real `importFromX` on the dev account and
asserts the cooldown refuses the second press. That spends about a dollar; run
it once, deliberately.

## STOP conditions

- **A second import path appears.** If the plan seems to need one, re-read
  Decision 6.
- **`drizzle-kit push` is proposed** for the column. One branch, no staging.
- **`requireEmailVerification` is relaxed** to make testing easier. First run
  is downstream of the newest, least-exercised flow in the app; switching it
  off locally means the first person to run it for real is a stranger.
- **The `next` allowlist becomes a prefix check.** That is the open redirect.
- **Anything writes to `christer.hagen@gmail.com`.** It holds 25 real brain
  pages, 2 connections and 15 riffs, and this plan's write path overwrites
  `human`, `voice` and `memory/who-you-write-for`.

## Not in scope

- **Existing accounts.** `onboarded_at` backfills to `now()` for every user
  that already exists, so nobody who has been using Quincy for a week is sent
  through an interview. A "redo this" entry point is a later, smaller change.
- **The annotated first draft.** The prototype's third variant marked the three
  things Quincy had to guess and turned each correction into a brain rule. It
  is the natural next round and it belongs after drafting, not inside first run.
- **LinkedIn's corpus.** Still waiting on Member Data Portability review
  (plan 011). The wiring screen offers LinkedIn as a channel only.
- **Any change to what the four questions are.** They are settled. Changing
  them changes what the brain knows on day one, which is a product decision,
  not an implementation one.
