# Plan 028: The advisor first

## Status

**PHASES 0, 1 AND 2 APPLIED 2026-09-09.** Phase 0 is written to the live
tables; phases 1 and 2 are in the working tree, not committed. `pnpm tsc
--noEmit` clean, `npx next build` clean, `pnpm vitest run` **1668 tests over
80 files, all passing** — the suite grew by 615 tests, and most of the new
ones pin refusals rather than outputs. Phase 3 stays gated on the first real
post, which needs the owner and a browser; phase 4 stays the owner's hold to
lift.

Two things the work decided that the plan did not anticipate, both recorded
below in place: the five angle prompts disagreed about language and it is now
settled, and the metrics loop refuses to write anything for this account
because three winners agreeing on everything is not evidence.

Written 2026-09-09 against the production Neon project's
tables, a full audit of every prompt in `lib/`, and a second
study of a closed-source reference product and an open-source scheduler.
Product names are deliberately absent from this file.

The owner decided on 2026-09-09: **Quincy leads as the advisor.** The field
suggests the order — the products that earned a daily relationship did it as
advisors first and added publishing later. Quincy built
the pipeline first and has never published; the relationship never started.
This plan inverts the effort. Quincy must speak first, speak well, and
explain itself. The publish pipe follows behind the first real post.

## What the database said

A read of the tables on the decision date showed the same thing from every
angle: nothing had ever been published through Quincy, the rhythms that
would make it initiate were off for the real account, and **a dozen finished
riffs — beats extracted, angles written — had sat untouched for weeks**. The
pipeline did its work and stopped, because finishing one is a click nobody
was ever asked to make. That is not a quality failure and not a yield
problem — it is the advisor never speaking. The numbers arrived every
morning and no generation path read them.

Today Quincy is an importer and a metrics reader. An advisor that never
speaks first, and whose drafts read as summaries, is neither.

## The prompt audit, in two sentences

Eighteen prompts across ten files; most are well built. Quality leaks at
exactly two points: the three-beat shape (`did → happened → meant`) fires
only for GitHub merges because it rides on `describeBeats`, and the five
angle prompts in `lib/adapt.ts` — the prompts that lock the hook the
drafting prompt must keep verbatim — see voice rules as a list and never a
real post.

## Phase 0 — stop the noise, wake the account

**APPLIED 2026-09-09** by `scripts/enroll-rhythms.ts --apply`, after a dry run
the owner saw. The owner's account now holds four enabled enrollments —
`bookmarks-to-posts` (daily 14:00), `ship-log` (Fri 18:00), `weekly-review`
(Sun 19:00), `week-plan` (Mon 07:00) — and `dev@quincy.test` holds none.
Verified by reading the table back.

Two things the first run taught, both now in the script:
`rhythm_subscription.id` has no database default (a 23502 on the first insert),
and the zone goes through `resolveTimeZone` rather than a literal, because the
column is nullable *and* free text.

The blast radius was checked before applying rather than assumed: `ship-log`
and `weekly-review` make no model call at all, `week-plan` makes one a week,
and none of the three send mail. `bookmarks-to-posts` is the one with a daily
model cost, and it is the one to switch off first if the bill argues.

Small, and first, because every later phase is invisible while the sweep
serves only a dead test account.

- **0a** DONE — the `dev@quincy.test` enrollment is disabled rather than
  deleted. It is the only row that ever proved the sweep works end to end
  (claim, run, write, release, daily for a month); deleting the proof to
  quiet the noise would be a bad trade.
- **0b** DONE — the owner's `bookmarks-to-posts` is enabled, next run
  2026-09-10 12:00Z.
- **0c** DONE — `week-plan`, `weekly-review` and `ship-log` enrolled, each
  at the cadence its own card advertises, so the page and the row agree.

**STOP, honoured:** these are live-table writes, so the script is dry by
default and `--apply` is a second, deliberate act. Every other `apply-*.ts`
in `scripts/` writes on sight because it is an additive migration; this one
decides which rhythms speak to a person, and a wrong row is a machine
mailing somebody on a schedule they did not choose.

## Phase 1 — the advisor's words

**ALL EIGHT LANDED 2026-09-09**, by four agents on disjoint files, plus two
decisions the work forced (below). `pnpm tsc --noEmit` clean; the suite grew
from 1053 to 1604 tests, all passing.

An advisor that speaks more often must first speak well. The ranked fixes
from the 2026-09-09 audit, in order of effect:

- **1a** DONE — `STORY_SHAPE` in `lib/drafting.ts`. Put the three-beat shape into `DRAFTING_RULES` as the default:
  when the material describes something that happened, write three short
  blocks — what I did, what happened, what it meant — one clause each, any
  number alone on its own line. When `beats` are given, they win; when they
  are not, the writer finds the shape itself. This is the single change
  that separates "a real post" from "a summary" for voice notes, meetings
  and pastes — most of the live traffic.
- **1b** DONE — one `buildAngleSystemPrompt` helper; `angleContext` fetches the examples once for all three riff paths. Feed `describeExamples` (the same eight real posts the drafting
  prompt already gets) into all five angle prompts in `lib/adapt.ts`. The
  hook is chosen there; today it is chosen blind.
- **1c** DONE — `ANGLE_BASE_RULES`, verified byte-exact against a before/after dump of all five. Factor one shared `ANGLE_BASE_RULES(shapes, kinds)` builder. The
  rules are hand-copied five times today; a fix to one never reaches four.
- **1d** DONE — the `CHAT_MODEL` link is cut. Give `DRAFTING_MODEL` its own default literal. Today it falls back
  to `CHAT_MODEL`, so a chat-cost change silently moves the one text a
  person publishes under their own name.
- **1e** DONE — `CHAT_TELLS`, written unconditional because the chat carries no examples for a conditional rule to defer to, with a test pinning it against `TELLS` so the two cannot drift. Carry a short form of `TELLS` (no tidy lesson, no hype words) into
  the chat `BASE_PROMPT`. The chat is the advisor's mouth; it must not
  sound like a generic assistant between drafts.
- **1f** DONE — `CHANNEL_TONE`, keyed by the registry's own ids rather than a second list of names. One tone line per channel in the constraints, beyond length — how
  X reads differently from LinkedIn, drawn from the measured corpus.
- **1g** DONE — `SELECT_BOUNDARY`, both merges real (`c7a7682` refused, `651c000` kept), framed as a boundary and not a template. A few-shot pair in the shipped selection rules: one real refused
  merge next to one real kept merge. The A/B showed refusal disagreeing
  with itself two merges out of ten; an anchored boundary narrows that
  more than another paragraph of rules.
- **1h** DONE — `DRAFTING_REASONING`, one step above the global, with the honest note that this step is argued and not measured. See the deploy consequence below. Raise reasoning effort for the final `generateDraft` call only.
  The global "low" is right for selection and angles, and unargued for the
  one output a person publishes.

Judge every change by the three checks (first line has the owner as
subject, three beats present, number on its own line) — not by feel. The
A/B harness exists and spends real model calls; running it is the owner's
call, per standing rule.

### A contradiction 1c found, and how it was settled

The refactor found the five angle prompts disagreeing on one substantive
point and correctly refused to settle it by tidying: three said *write in
English unless the brain says otherwise*, and the two single-angle prompts
said *write it in the language they used*.

Settled 2026-09-09 in favour of the three, because the second is a contract
violation one step later rather than a preference. `lib/drafting.ts`'s
IDENTITY tells the writer the hook is the line the user chose and must
survive verbatim; `DRAFTING_RULES` has posted in English unless the brain
says otherwise since long before this. A Norwegian hook reaching an English
draft therefore leaves two outcomes and both are bugs — the writer rewrites
the line and the user does not get the angle they picked, or it prints and
the post goes out mixed. The second already happened once: it is the bug
`describeBeats` was changed to fix, in this same corpus of Norwegian merge
descriptions and English posts, and the fix there was the same shape (the
beat is translated, not quoted; only its numbers survive intact).

The posting language is now one decision, made once, in the brain — which is
also where a user who posts in Norwegian says so, and where it reaches all
five prompts and the writer together. The material's language is an input,
never an instruction.

### One consequence of 1h that ships on the next deploy

`vercel env ls production` on 2026-09-09 shows `DRAFTING_MODEL` and
`CHAT_MODEL` set, and **neither effort variable**. So `REASONING_EFFORT`
stays at its measured default of `low`, and `DRAFTING_REASONING_EFFORT`
resolves to one step above it — the drafting call moves from `low` to
`medium` in production the next time `main` deploys.

That is the intended behaviour of 1h and it is also, honestly, the same
shape of hazard 1d exists to remove: a value that moves without anyone
choosing it. The difference is that this one moves once, in a named
direction, on the most expensive prompt in the product, and the comment in
`lib/model-options.ts` says plainly that the step is argued rather than
measured. Two ways to close it, and the owner picks:

- Set `DRAFTING_REASONING_EFFORT=low` in production, deploy unchanged, and
  raise it after `scripts/ab-shipped-models.ts` runs with effort as its
  axis. Costs nothing, learns nothing yet.
- Let it deploy at `medium` and read the next ten drafts against the three
  checks. Drafting is roughly 70% of spend, so this is the option with a
  bill attached.

## Phase 2 — the three advisor behaviors

These are the behaviors that make an advisor read as staff, and
all three are reproducible on surfaces Quincy already has.

- **2a It initiates. DONE 2026-09-09** — `lib/waiting-work.ts`, one database
  read and no model call, surfaced in the studio greeting. The offer
  *replaces* the count line rather than joining it: a count is the chore
  that produced the twelve-riff stall in the first place. Ranking is
  untouched → oldest → id, and the untouched rule changes the live answer —
  the oldest ready riff already carries a draft, so the offer is the next
  one, which nobody ever opened. Re-offering work the owner already turned
  down was considered and rejected. What the owner will actually see on
  /studio, today:

  > The pull request I read on 26 Aug — "I fixed the action row breaking
  > button labels in narrow detail panels." — has had its three
  > beats ready for 14 days, and I never asked. Not fresh, but finished:
  > want me to write it?

  The admission is the point. Under seven days the line drops both the age
  and the apology.

  **This is now the first item in the plan, not the first item in phase 2.** The 2026-09-09 read of the live tables moved it:
  twelve finished riffs, each with its three beats already extracted, have
  been waiting since August for somebody to open them. Every earlier
  diagnosis of the riff-to-draft gap assumed the generation was failing.
  It was not. The work was done and left on a page nobody had a reason to
  visit. A better prompt writes a better draft nobody reads.
  The week-plan rhythm's output becomes a proposal addressed to the owner —
  "here is your week; say yes or change it" — surfaced in the studio
  greeting (`composeStudioGreeting` already renders on /studio) and sent by
  mail (`lib/mail.ts` exists). Add one daily line to the greeting: a single
  idea offered before being asked, drawn first from the ready riffs that
  are already sitting there, oldest-waiting first, and only then from the
  widest story gap. No new channel is built for this.
- **2b It explains why. DONE 2026-09-09** — `lib/what-worked.ts`, no model
  call (hook shape, beat structure, a number on its own line and length are
  all string questions), wired into `/api/cron/channels` after the metrics
  land. Written as a `memory` page, argued against `assertValid`: `voice`
  and `instruction` render *only* their rules array, so a statistical
  reading would print as an imperative bullet — the exact failure
  `renderBrain`'s own voice comment describes.

  **It refuses to write a page for this account today, and the refusal is
  the most useful thing it produced.** A few dozen measured posts. At the 3× gate there are three winners and they agree on
  everything — 3/3 first-person hook, 3/3 three-or-more blocks, 3/3 longer
  than median. That is what any three posts do, and it is precisely the
  page that would poison every prompt in the product, silently, because
  brain pages are injected everywhere. Dropping to 2× gives seven winners
  and six of the ten traits collapse: three blocks is 5/7 against 13/21
  elsewhere, a nine-point difference — that is **how this person writes,
  not what made those posts land**. Exactly one trait separates, at a
  29-point lift: the winners run longer than the median post.

  So the bar that does the real work is `TRAIT_LIFT`, not the win gate: a
  trait must be 25 points more common among the winners than among
  everything else. `MIN_WINNERS = 6` is the smallest count at which a
  two-thirds trait survives losing any one post to the 30-day window. A
  synthetic account with the same shape pins the `thin-winners` refusal in
  the tests.

  One property worth keeping: `renderBrain` filters memory bodies through
  `.filter(Boolean)`, so **blanking the body is a retraction** — when the
  evidence ages out of the window the page stops reaching every prompt
  immediately, while the row and its numbers stay readable on /brain.
  `lib/brain.ts` exports no delete, and this is better than one. A page a
  human has confirmed or corrected is left alone.

  After the daily metrics refresh, compare each
  post's 30-day numbers against the account's median. When a post is
  clearly above it, write one brain page: what the post did, and the
  framework — hook shape, kind, beat structure. Angle generation and the
  week plan read that page. This closes the loop the field leaves open:
  the open-source scheduler's analytics look backward only, and nothing
  there feeds a hook that worked back into the next draft.
- **2c Identity before content. DONE 2026-09-09**, and the plan's premise
  was half wrong — worth recording, because the correction is the useful
  part. The strategy was *already reaching* every angle prompt:
  `renderBrainForUser` has rendered `policy` pages as "## Strategy — X"
  since 027, and all five angle prompts take the rendered brain. What was
  missing is that only `lib/drafting.ts` ever said what to do with it,
  which is one step too late — by the time the writer sees the strategy the
  angle is chosen and the hook is fixed. The writer can put a post in the
  right register; it cannot decide the idea was one this account should not
  spend a slot on. `STRATEGY_RULE` now sits in `ANGLE_BASE_RULES`, routed
  through the existing `why` field rather than a new schema field — `why` is
  the sentence the owner reads on the card before picking, and a new
  required field is another thing to validate against a gateway whose
  structured-output faults `lib/structured-output.ts` documents at length.

  **The other half of the premise was wrong in the more useful direction:
  the owner has no strategy page at all.** Item 3a of 027 built
  `proposeStrategy` on /brain; it has never been run, because running it
  spends a model call. So this rule is silent for this account today, by
  design. Generating the page is a model call and therefore the owner's
  call — and it is now the cheapest unrealised win in the plan, because
  the machinery on both ends is already built and waiting for the page.

## Phase 3 — the first real post, and the publish posture

The pipeline is not abandoned; it queues behind the advisor.

- **3a** One real post through Quincy (plan 027 item 2b, still owed).
  Needs the owner and a browser. This stays the gate for everything
  channel-shaped, per plan 025.
- **3b** The publisher takes the posture the field converged on after a
  year of fighting duplicate posts: no automatic retry on the publish
  call itself; every unclear outcome ends as "unconfirmed — check your
  account before posting again", never as a silent retry and never as a
  false failure (advisor-plan 012 already states the second half); the
  chat agent confirms before any write, and platform rules hold even if
  the user asks to ignore them.
- **3c** Platform constraints live once, in the channel registry
  (plan 025), and prompts read them from there instead of restating them.
  One source of truth serves the UI, the validator and the model.

## Phase 4 — the advisor's channel

The strongest surface for an advisor is messaging: the user texts the
advisor, and the advisor texts first. Plan 027 held the messaging channel
(2a) by the owner's decision until the rest landed. The rest has landed,
and this plan's phases 0–2 make the advisor worth texting. Unholding it
after phase 2 and item 3a is the recommendation; the hold remains the
owner's to lift.

## Deliberately not in this plan

The calendar source (still lacks a Google OAuth client), additional
channels (gated by plan 025 on one real post and one paying customer),
video, and anything marketplace-shaped.

## What "working" means

- The morning greeting proposes before the owner asks, every day.
- Rhythm runs for the real account do work; the skip count stays at zero.
- New drafts pass the three checks on first write, for voice notes and
  meetings, not only merges.
- At least one brain page exists that says why a post worked, and an angle
  cites it.
- One post has actually gone out through Quincy.
