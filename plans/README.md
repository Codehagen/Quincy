# Implementation Plans

Written by the improve skill on 2026-08-02 against the billing changeset, and
kept current since. Scope of the original audit was the billing code only — the
rest of the app (brain, chat persistence, conversations, UI outside billing) and
the dependency tree were **not** audited.

Each executor: read the plan fully before starting, honour its STOP conditions.
The reviewer maintains this index; executors do not edit it.

## Execution order & status

| Plan | Title | Priority | Effort | Depends on | Status |
|------|-------|----------|--------|------------|--------|
| 001 | Establish a test runner and lock down the entitlement state machine | P1 | M | — | DONE — `9bb535f` |
| 002 | An abandoned checkout must not make a user look like a lapsed subscriber | P1 | S | 001 | DONE — `8527d84` |
| 003 | Refuse a second subscription on the server, not just in the UI | P1 | M | 001, 002 | DONE — `c4416d5` — partial, see 006 |
| 004 | Make entitlement resolution pure, so a cron can never start someone's trial | P2 | M | 001–003 | DONE — `1a02414` |
| 005 | Let customers enter a promotion code at checkout | P2 | S | — | DONE — `47d7725` |
| 006 | Actually refuse a second subscription — 003's guard never runs | P1 | M | 003 | DONE — `5748f35` — verified 409 |
| 007 | Record what every turn costs, and make /credits real | P1 | M | — | DONE — `de66738` |
| 008 | The trial ceiling | P1 | S | 007 | **NOT WRITTEN — waiting on data** |

### Why 008 is deliberately unwritten

Its only interesting decision is the number, and the number should come from
`usage_event`, not from a guess. The guess in this file's earlier revision was
50 turns at roughly $2–3 per trial account; the first real measurement put a
trivial turn at **$0.00293**, fifteen times cheaper per turn than assumed.

That does not mean the cap should be higher — a trivial turn is not a
representative one. Input grows with conversation history and is 99% of the
cost, so the tail of a long session dominates. And everything measured before
2026-08-31 is at introductory pricing, half what it costs in September.

Write 008 when p50 and p95 cost per user are known. Two weeks of data.

Status values: TODO | IN PROGRESS | DONE | BLOCKED (one-line reason) |
REJECTED (one-line rationale)

## Product plans in this directory

The table above is the billing audit and nothing else. Feature plans were
written into the same folder afterwards and numbered on their own sequence,
which is why there are **two 005s** — read the filename, not the number.

| File | What it is | Status |
|------|-----------|--------|
| [005-connect-x-and-linkedin.md](005-connect-x-and-linkedin.md) | OAuth, token lifecycle, `lib/publish.ts`, the daily revocation sweep | Shipped. One real post still owed |
| [009-the-marketing-surface.md](009-the-marketing-surface.md) | The public site | Belongs to the `feat/marketing-surface` worktree |
| [010-approve-schedule-publish.md](010-approve-schedule-publish.md) | Slots, approve → `scheduled_post`, and the sweep that sends | Shipped. Makes `lib/publish.ts` reachable for the first time |
| [011-x-corpus-into-brain.md](011-x-corpus-into-brain.md) | `source_item` table, X timeline import (pay-per-use, capped), voice compile into brain, first live `/sources` row | Built 2026-08-05 (PR #19). Live run done: 50 posts, voice/x + 3 stories compiled and judged good |
| [012-harden-the-import-money-path.md](012-harden-the-import-money-path.md) | Cooldown claim on import, result objects instead of throws after spend, meter the compile, bound the prompt | DONE — `09a905b`, reviewed. Scope amended mid-flight to allow one line in `lib/channels.ts` (see below) |
| [013-backfill-cursor-and-pagination-tests.md](013-backfill-cursor-and-pagination-tests.md) | `until_id` backfill so "import again" is true, NULL-safe cursors via id numerics, pagination test suite | DONE — `a7feb96`, reviewed |
| [014-sources-row-polish.md](014-sources-row-polish.md) | Aggregate `corpusSummary`, fix `@@handle`, receipt state describes one run | DONE — `c9cfb67`, reviewed |
| [015-quincy-writes-the-draft.md](015-quincy-writes-the-draft.md) | `draftAngle` calls a model: channel-adapted drafts written from the brain's voice, metered and entitlement-gated | DONE — `d327057`, reviewed. On branch `advisor/015-quincy-writes-the-draft`, **not merged**; a live "Draft this" check is owed |
| [016-the-schedule-table-and-dispatcher.md](016-the-schedule-table-and-dispatcher.md) | `rhythm_subscription` + `rhythm_run`, a wall-clock timing model, the dispatcher cron, a handler registry, and a `/rhythm` switch that works | DONE — branch `feat/rhythms-and-adapt`. Executed with two deliberate changes to the plan, recorded below |
| [018-voice-notes-become-riffs.md](018-voice-notes-become-riffs.md) | Speak a thought, come back to angles: batch transcription through the Gateway, the first Vercel Workflow, a level meter instead of a live session, and two malformed-output bugs found live | DONE — branch `feat/voice-riffs`. Written after execution; see the note at its head |
| [019-circleback-meetings-become-riffs.md](019-circleback-meetings-become-riffs.md) | The first real source connection: a signed inbound webhook, `source_connection`, speaker-filtered transcripts, and a selection pass because a meeting is not a scrap | DONE — branch `feat/circleback-meetings`. 30 e2e checks pass stubbed and live. Four departures, one silent entitlement bug, and a cold audit that found four more — all recorded in the plan |
| [020-the-pricing-page.md](020-the-pricing-page.md) | `$49` where a stranger can read it: four directions compared live, the setup sequence corrected from the flow rather than from row counts, an entrance instead of a walk, and `/pricing` taken out of the auth gate | DONE — branch `pricing-page`. Written after execution; see the note at its head |
| [021-shipped-work-becomes-riffs.md](021-shipped-work-becomes-riffs.md) | The third input `docs/vision.md` names: merged pull requests become riffs. The description is the material and the diff is not — measured 51x larger across this repo's own 27 merges — plus a GitHub App, a public webhook URL where the signature is the whole authentication, and a selection whose expected answer is no | DONE — branch `feat/shipped-work`, off 019. 41/41 e2e live, 24 unit. Decision 2 overturned before execution (App, not repo webhook); recorded at the head of the plan. Owed: the app itself and one real merge |
| [022-first-run-interview-then-wiring.md](022-first-run-interview-then-wiring.md) | The cold start: four questions in the Studio's own chat components that write to the brain as they land, then one wiring screen — channels above sources, with the corpus read hanging off the X grant because that consent buys both. Design decided across two prototype rounds, whose losers and reasoning are folded into the plan itself | DONE — branch `feat/first-run`. 22/22 verify, 8/8 unit. Five departures recorded at the head of the plan. Owed: a real X connect through `?next=/welcome`, which needs a browser |

There is no `plans/017`. The riffs table and the paste box are referenced
throughout the code as "plans/017" but that file was never written — the work
shipped inside plan 016's branch, and the departure is recorded below under
"Where plan 016's execution departed from the plan". Plan 018 keeps its own
number rather than backfilling 017, so the existing code references stay
truthful about what does and does not exist.

All three live on branch `advisor/012-money-path` (branched from `b85a7c1`,
the PR #19 head) in an agent worktree — **not merged**. Two operator actions
are owed before this ships:

1. `npx tsx --env-file=.env.local scripts/apply-import-cooldown.ts` — the
   cooldown claim reads a column that does not exist until this runs.
2. `npx tsx --env-file=.env.local scripts/verify-corpus-x.ts` — rewritten in
   013 to exercise the two-pass cursor and the cooldown integration; never
   run against a real database yet.

### Where plan 016's execution departed from the plan

Both departures were authorised by the owner mid-flight and are recorded here
because the plan text still argues for the version that was not built.

- **Two handlers, not one.** Decision 9 said ship only Voice Refresh and made a
  second handler a STOP condition, on the argument that Bookmarks was blocked
  behind the `bookmark.read` scope invalidating every existing X grant. The
  owner confirmed they are the only connected X account, which reduces that
  cost to one reconnect — so `bookmarks-to-posts` shipped too, and the scope
  was added (`lib/channels.ts`). **Anyone connected before 2026-08-08 must
  reconnect X**, and the next scope added there needs a reconnect mail rather
  than a comment.
- **The paste-a-post entry point shipped in the same change.** Not in plan 016
  at all — it is the door a real user walks through, and the Bookmarks rhythm
  is the same path on a schedule (`lib/adapt.ts`, `lib/adapt-draft.ts`). Doing
  them together is what let `createAdaptedDraft` have two call sites and
  therefore be a library function rather than server-action guts.

Two things the plan called correctly and are worth keeping: Heartbeat stayed on
its own cron (decision 8), so `/rhythm` reads run history from two tables; and
the first version of `scripts/verify-rhythms.ts` reported eight passes it had
not earned, because the dev account's expired trial meant every "the handler
did not run" assertion passed for the wrong reason. Holding the trial open for
the length of the run is what made the suite discriminating.

### Plan 012's scope defect, recorded so it is not repeated

The plan listed `lib/channels.ts` as untouchable, which made it impossible to
execute: `SafeConnection` is `Omit<Connection, "accessToken" | "refreshToken" |
"scope">`, so adding any non-secret column to `channelConnection` makes that
column *required* in the object `toSafeConnection` builds by naming fields
explicitly. The executor correctly stopped rather than editing an out-of-scope
file. Any future plan adding a column to that table must include the matching
one-line addition in `toSafeConnection`.

### PR #19 audit — findings considered and rejected

From the 2026-08-05 branch audit of `feat/x-corpus-into-brain` (all other
findings are covered by plans 012–014):

- `x:read` in `usage_event.model`: documented deliberate stretch (`lib/publish.ts:81`).
- Manual `tsx --env-file` migration scripts: repo convention, not a gap.
- Prompt-injection via corpus text reaching the chat system prompt: the
  corpus is the user's own authored posts (retweets excluded) — self-injection
  into their own session; the `knownUrls` proof filter blocks the one
  cross-user consequence.
- `lib/heartbeat.ts` discards `generateObject` usage (pre-existing, bounded
  cron): same fix pattern as plan 012 step 4, deferred deliberately.

Advisor plans (009–017) live in `advisor-plans/` on their own sequence again.

All shipped to `main` and deployed: PR #1 (billing), #2 (003 + 006), #3 (005),
#4 (004), #6 (007). The only open plan is 008, which is waiting on data rather
than on effort.

## The one mistake worth remembering

**Plan 003 was wrong, and the executor caught it.**

003 added an `authorizeReference` guard to stop one account opening two
subscriptions. The Stripe plugin's reference middleware returns early when a
request carries no explicit `referenceId` — which is every self-service upgrade
this app makes — so the guard was never reached for the case it was written for.

The plan quoted the `authorizeReference` call site verbatim and treated that as
proof the code path reached it. Those are two different claims. It also had no
end-to-end check: its unit tests covered `hasLiveSubscription`, which passes
whether or not anything ever calls it.

003's code stays — it closes the organization and explicit-`referenceId` paths,
and it built `lib/subscription-status.ts`. 006 added the guard that runs: a
root-level `hooks.before`, which `better-auth/dist/api/dispatch.mjs` registers
with `matcher: () => true`.

006 was verified as a controlled triple against a running server:

| State | `POST /api/auth/subscription/upgrade` |
|---|---|
| no live subscription | `200`, a `checkout.session` |
| a row with `status: active` | `409` `"You already have an active subscription."` |
| that row removed again | `200`, a `checkout.session` |

The third row is what distinguishes a working guard from a broken endpoint.
Every plan from 006 onward ends in a check like this.

## Review record

Reviews re-ran every done criterion rather than trusting the executor's report.

**001 + 002** — all criteria passed; scope clean. Two checks added beyond the
plans: `pnpm build` (neither plan verified the production build survives a new
test file and `vitest.config.ts` — it does), and an audit of what the tests
actually assert. The discriminating pair is `canceled → lapsed` alongside
`incomplete → expired`: same code path, same mock, different rows, different
outcomes. Both can only pass if `LAPSED_STATUSES` is genuinely consulted.

**003 + 006** — criteria passed; both guards coexist and cover different paths.
Deleting either leaves a hole.

**005** — 26 additive lines, nothing removed. The executor ran the end-to-end
step itself: a real Checkout session came back with `"allow_promotion_codes":true`
and `"payment_method_collection":"if_required"`.

**Known gap, accepted:** `getBillingSnapshot` has no test. Plan 001 scoped it
out because it depends on `getSession`, which the test file mocks to nothing.
The 002 fix there was verified by reading the diff, not by a test.

## Live Stripe — what is configured

On the **shared** `Codebase AS` account (`acct_1MZKGT…`), which also hosts
unrelated live businesses. That sharing is the source of several constraints
below.

| | |
|---|---|
| Product / price | `prod_V0G0Ofrql7U2hx` / `price_1U0FUlKOzkjqB2nyzMYNim4U` |
| Lookup key | `quincy_monthly` — same in test and live, so going live needed no code change |
| Statement descriptor | `QUINCY`, set on the product so it does not disturb the other businesses |
| Webhook | `we_1U0G2HKOzkjqB2ny3Brg1VGw` → `hirequincy.com/api/auth/stripe/webhook`, `api_version: 2026-07-29.dahlia` |
| Customer portal | the account's **default** config (`bpc_1NYaCh…`), repurposed for Quincy |
| Comp coupon | `GnK9zmLn` — 100%, `duration: forever` |
| Comp code | `QUINCYCOMP`, max 10 redemptions |

Three things about this setup that will bite if forgotten:

- **`api_version` on the webhook is pinned deliberately.** The account default
  is four years old (`2022-11-15`), and the subscription object changed shape in
  between. An endpoint left on the account default would return 200 while
  parsing period dates out of a payload that no longer carries them there.
- **The portal config is the account default, shared with the other
  businesses.** It had to be — the Better Auth plugin calls
  `billingPortal.sessions.create` with no `configuration` parameter and exposes
  no hook for one, so a non-default configuration is unreachable. Editing the
  portal in the Stripe dashboard edits *this* config, for every business on the
  account.
- **Comp codes must be `duration: forever`.** Plan 005 turned on
  `payment_method_collection: "if_required"`, so a fully-comped subscription has
  no card on file. When a time-limited discount lapses there is nothing to
  charge, the invoice fails, and the account resolves to `lapsed`.

The end-to-end flow has been exercised in production with real keys: checkout →
promotion code → $0 invoice → webhook → `subscription.status = active` → billing
page → customer portal.

**The live secret key** stored in `~/.config/stripe/config.toml` (mislabelled
there as `test_mode_api_key`) turned out to be **expired** — Stripe answers
`401 Expired API Key`. It is deliberately not being rotated; owner's decision,
recorded so it is not mistaken for an oversight.

## Prompt caching — measured, and deliberately not done

No `cache_control` is set anywhere in this codebase, so the system prompt and
the brain are billed fresh every turn. The first recorded turn puts that prefix
at **1445 input tokens**. Cache reads cost 0.1× and cache writes 1.25×, which
makes the arithmetic:

| Turns in one conversation | Uncached | Cached | |
|---|---|---|---|
| 1 | $0.0029 | $0.0036 | **25% worse** |
| 2 | $0.0058 | $0.0039 | 33% better |
| 10 | $0.029 | $0.0062 | 78% better |

So it is not a bad idea, it is an early one. ~78% of input cost for an engaged
user is worth roughly $0.13 per user per day — nothing at one user, about
$3,900/month at a thousand. `usage_event` is what will show the crossover.

Two things to know before doing it:

- **A single-message user pays 25% more.** Break-even is two turns inside the
  five-minute TTL.
- **The minimum cacheable prefix on Sonnet 5 is 1024 tokens** and this prefix is
  1445. A user with an emptier brain than the dev account falls below it and
  caches nothing — the feature would work for some users and silently not for
  others.

When it is done, add a `cache_write_tokens` column in the same change.
`LanguageModelUsage.inputTokenDetails` exposes `noCacheTokens`,
`cacheReadTokens` and `cacheWriteTokens`; only the read is recorded today,
because writes are always zero while caching is off. Enable caching without the
column and every cost estimate silently understates by the 1.25× write premium.

## Not yet exercised, in production or anywhere

- **`past_due` → `lapsed`.** Test card `4000 0000 0000 0341` attaches and then
  fails on charge. This is the path every paying customer eventually takes when
  their card expires, and access is cut on the first failed renewal while Stripe
  retries for roughly three weeks. Untested and aggressive.

  **Test it in test mode, not live** — `4000…0341` is a test card, so this costs
  nothing and touches no real money. The test-mode product and price still exist
  with the same `quincy_monthly` lookup key, so the code path is identical.
  This is the cheapest outstanding test and the likeliest first support ticket.
- **A real charge.** The owner's account is permanently comped, so $49 actually
  clearing, and a card being stored for renewal, have never happened. Testing
  that needs a second account without the code.
- **MVA / tax.** Invoices show `account_country: NO` and `total_taxes: []`.
  Irrelevant at $0, not irrelevant at $49 from a Norwegian AS.

## Findings considered and rejected

Recorded so they are not re-audited next run.

- **`past_due` cuts access on the first failed renewal**: real, but a product
  decision about dunning rather than a defect. Deliberately left alone by every
  plan here — 002 and 004 both say so explicitly, so a fix cannot smuggle it in.
- **`lib/stripe.ts` mixes the server Stripe SDK with plan constants**: importing
  `PLAN_NAME` into a client component would bundle the Node SDK into the
  browser. Avoided today by hardcoding `"quincy"` in
  `components/billing/billing-actions.tsx`, which is its own small smell. Low
  impact, no live consequence.
- **No index on `subscription.reference_id`**: `lib/schema.ts` is generated and
  cannot hold it, and a hand-made index is what `drizzle-kit push` reconciles
  away on the next schema change. The table is tiny and the query only runs once
  a free day is over. Revisit with real migrations.
- **`docs/billing.md` claims a third gate** over "publishing, scheduling, brain
  writes": those surfaces do not exist, so nothing is ungated.
  `grep -rl "streamText\|generateObject\|generateText" lib app` returns only
  `lib/heartbeat.ts` and `app/api/chat/route.ts`, both gated. Documentation
  ahead of the code; folded into plan 004 step 8.

## Direction — options, not defects

- **A trial ceiling.** A free verified email buys 24 hours of unmetered
  `anthropic/claude-sonnet-5`. One person is noise; a script is a bill. This is
  the direct consequence of the card-free trial and should land before the
  marketing page is open to strangers.
- **Dunning instead of a cliff.** Related to the rejected `past_due` finding. A
  paying customer with an expired card is worth more with a visible deadline
  than with a closed door.
- **A "your day is over" email.** `lib/auth-email.ts` and `emails/` already
  exist. Highest-leverage message in the funnel, not built.

## Note on provenance

These plans were written by the same session that wrote the code they critique,
which is a weaker signal than a fresh review — an author fills in context a
reader does not have. Plan 003 is the proof: it shipped a guard that could not
run, and what caught it was an executor reading the source rather than the plan.
A cold review of this changeset would still be worth having.
