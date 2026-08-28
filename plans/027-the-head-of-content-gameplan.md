# Plan 027: The head of content, measured against the field

## Status

**IN PROGRESS** since 2026-08-27; the messaging channel (2a) is held until the rest lands. Written 2026-08-26 against the live `winter-grass-66812609` tables
and a reverse-engineering pass over the closed-source reference product and
fourteen adjacent tools. Competitor names are deliberately absent from this
file; the comparison with names lives in the session that produced it.

This is a gameplan, not one change. It orders the next four to six weeks of
work by what the database says is broken, then by what the field does that
Quincy does not, then by what nobody does.

## Execution record, 2026-08-27

Built in one pass by fourteen coding agents working on disjoint files, with
one read-only security review in between. Nothing was applied to Neon and no
model was called; every check below is unit-level. The messaging channel
(2a) and the first real post (2b) are deliberately not started — the owner
asked for the channel to wait until the rest had landed, and 2b needs a
browser and the owner's account. The calendar source (4d) is built and then
held: it is on branch `feat/calendar-source` and off `main`, because the
owner has no Google OAuth client for it yet.

| Item | State | Where |
|---|---|---|
| 1a bounded material | built | `lib/github-material.ts`, `lib/shipped-meta.ts`, `source_item.meta.material` (commits ≤20, files ≤50, issues ≤5, patch ≤6 KB across 3 files, `truncated[]`) |
| 1b brief before beats | built | `writeShippedBrief` in `lib/shipped-work.ts`; brief blocks numbered after the description so selection-by-index covers them |
| 1c one question on refusal | built | `meta.question`, `AnswerQuestion` on /sources; the answer fills the missing beat and re-runs the riff |
| 1d chat reaches a PR | built | `read_source`, `read_story`, `read_numbers`; `read_riffs` un-truncated with `riff.context` |
| 1e language | built | translation line in `describeBeats` (`lib/drafting.ts`) |
| 1f model A/B | run 2026-08-28 | `scripts/ab-shipped-models.ts`; ten merges, both models end to end; the cheap model scored higher on the three-beat checks (9/10 drafts make the owner the subject of the first line, the expensive one 1/8), never mixed languages, and cost 1/26 as much — **keep the cheap model**. Refusal is not stable run to run: two runs of the same model disagreed on two merges |
| 2a messaging channel | held | by the owner's decision |
| 2b one real post | owed | needs the owner and a browser |
| 2c `post_metric` | built, migration applied 2026-08-28 | `scripts/apply-post-metric.ts`; daily refresh in `/api/cron/channels`; /numbers shows a live 30-day block |
| 2d ship log | built | `lib/ship-log.ts`, rhythm `ship-log`, Fri 18:00 |
| 3a strategy page | built | reuses `kind = "policy"`; `proposeStrategy` on /brain; no migration |
| 3b needs material | built | `lib/story-gaps.ts`; on /brain and one line in the chat prompt |
| 3c memory ledger | built | `lib/memory-ledger.ts`; typed daily pages, dedupe before compile |
| 3d voice preview | built | "Show the difference" on the voice page |
| 3e repeated edit → rule | built | `lib/edit-classes.ts`; offer after the third edit in 30 days |
| 4a retire the catalogue | built | 10 live of 29; 19 retired routes redirect to /rhythm |
| 4b weekly review | built | `lib/weekly-review.ts`, Sun 19:00, no model call |
| 4c week plan | built | `lib/week-plan.ts`, Mon 07:00, critique step, never approves |
| 4d calendar source | held | built on branch `feat/calendar-source`; needs a Google OAuth client before it can return |
| 4e MCP server | built; moved to `@better-auth/mcp` 1.7 on 2026-08-28 | `docs/mcp.md`; the core plugin was deprecated with a refresh-token advisory; consent, rotation, revocation and CIMD now come from the provider; admin OAuth routes disabled |
| 4f publisher boundary | built | `lib/publisher.ts`; external adapter env-gated |
| 4g changelog claim | built | counts by date; entries for 23–26 Aug |

Two facts the plan had wrong: the catalogue was 29 cards with 10 live, not
24 with 7; and `recordShippedRefusal` was unreached because four exits in the
webhook route (unentitled, paused, daily ceiling, start failed) never start
the workflow — those are now `meta.stopped`, a fact about the account, not a
verdict about the merge.

The A/B also found that a Drizzle column without its Neon column breaks
every `select()` on that table: `listConnections` threw 42703 on
`channel_connection.last_metrics_at`, and `rhythm_run.result` has the same
shape. So the first two migrations below are not optional before `main` is
deployed; they are what keeps /channels, /numbers and the rhythm sweep up.

Migrations: `scripts/apply-post-metric.ts`, `scripts/apply-rhythm-run-result.ts`,
`scripts/apply-mcp-oauth.ts` and `scripts/apply-account-issuer.ts` were all
**applied on 2026-08-28**. The last one is the Better Auth 1.7 `account.issuer`
backfill, which the first migration agent missed because
`npx @better-auth/cli@latest` resolves to a 1.4 CLI; the 1.7 CLI is the npm
package `auth`, and `pnpm auth:generate` now pins it. `scripts/verify-auth-recovery.ts`
passes 7/7 on 1.7.2.

## What the database says on 2026-08-26

| Table | Rows | What it means |
|---|---|---|
| `source_item` | 109 (99 x, 10 github) | The corpus is the owner's own posts. Ten merges in five days is the only inbound source that runs. |
| `riff` | 11 | Five of ten merges produced no riff, and none of the five wrote `meta.refusal`. |
| `draft` / `draft_version` | 4 / 4 | One version each, all X. One approved. |
| `scheduled_post` | **0** | Nothing has ever gone out through Quincy. `channel_connection.last_published_at` is null. |
| `rhythm_run` | 19 | Every run failed ("X is not connected") or skipped ("subscription no longer active"). No rhythm has done work. |
| `brain_page` | 10 | A 15-rule measured voice, four mined stories, three thin memory pages. No strategy page. |
| `usage_event` | 232 | Drafting moved from the expensive model to the cheap one on 2026-08-13. The riff complaint came 2026-08-24. Untested whether the two are linked. |

The owner's own words, in `conversation` on 2026-08-24: *"I need you to make
the riffs better. Do we have some PRs today that we can look at?"* The reply
captured the sentence as a memory note and produced one riff from pasted
text. That conversation is the bug report for this plan.

## Why a pull request produces a thin post today

Traced in `lib/shipped-work.ts`, `lib/adapt.ts`, `lib/drafting.ts`,
`lib/chat-tools.ts`:

1. The writer sees the PR **title and up to eight selected paragraphs of the
   description**. The diff is `DELIBERATELY_UNREAD` (`lib/shipped-work.ts:74`),
   for a measured reason: median diff 51× the description. But changed-file
   names, commit messages, linked issues and review comments are also unread,
   and those are small.
2. The owner's descriptions are written for the repository, in Norwegian, by a
   coding agent. The beats extractor quotes them verbatim, so `did` becomes
   *"Kjørt i prod 2026-08-26"* and `happened` becomes a test count. The draft
   for PR 277 mixes Norwegian quotes into an English post.
3. The chat has **seven tools and none can fetch a pull request**.
   `read_riffs` cuts material at 400 characters and hides `riff.context`
   (the beats and the `forUser` line). Every live GitHub scrap is longer than
   400 characters.
4. `renderBrain` in index mode tells the chat to call a story tool that does
   not exist (`lib/brain.ts:594-596`); `draftAngle` works around it with
   `{stories: "full"}`, the chat route does not.
5. When selection refuses a merge, nothing records why. `recordShippedRefusal`
   exists and is not reached on the live rows.

The refusal rate is by design ("most merged pull requests are not posts"),
and that design is right. The yield is low because the **material** is thin,
not because the bar is high. Raise the material; keep the bar.

## What the reference product does that Quincy does not

Observed live in a signed-in session and in its shipped bundles.

1. **The draft card lives in the chat.** A platform-accurate preview that is
   also the editor. Edits are single-line rewrites against a persisted card,
   and the saved card is re-injected as source of truth on the next turn.
   Quincy's chat may not write a post; the path is capture → riff → angle →
   /drafts, three hops with ids.
2. **A messaging channel is the primary surface.** Rituals deliver by
   text message. The heartbeat runs hourly, stays silent unless something is
   actionable, and is clamped to waking hours. Quincy has no outbound channel;
   its rhythms have nowhere to land.
3. **A strategy document per channel**: goal with a date, audience, pillars
   with percentage weights, cadence, priority day/time patterns, what to lean
   into and what to avoid. The weekly autonomous loop reads it. Quincy has
   voice, identity and stories, and no strategy.
4. **A story index with a "Needs material" list.** The memory knows what it
   does not have yet. Quincy's story pages have the same shape
   (hook/point/proof/quotes/theme/useFor) and no gap list.
5. **Critique with receipts.** It reads the owner's real posts and analytics
   and tells him its own draft is wrong, citing numbers. Quincy's chat cannot
   read `/numbers`.
6. **A GitHub App that reads commits and code**, not only merged PRs. Asked to
   read a repo, it produced an accurate architecture summary.
7. **Insights built to be shared**: a contributions-style impressions heatmap,
   an "orbit" of recent engagers, milestone badges, all exportable as images.
8. **A weekly autonomous loop with a critique step**: read strategy → plan
   week → draft → critique → schedule → notify.

What it does badly, and Quincy must not copy: 25–34 s replies with no
streaming; no citations in output; invented handles inside drafts about to
publish; a memory ledger that records the same preference four times in forty
minutes; rituals that silently do work nobody receives; configuration hidden
behind chat; UTC default while the calendar says "your timezone"; a paywall
that reads the user's memory only to personalise the sales pitch.

## What nobody in the field does

Fourteen tools, official sources only. The gaps are consistent:

- Nobody reads the user's actual week (repo, calendar, inbox, meetings) and
  asks about it. Every tool starts from a blank prompt or someone else's
  viral post. **Quincy's thesis is this gap.**
- Nobody reaches out first on a channel the user already lives in. Bots exist
  for inbound capture; none sends "you merged X on Thursday, is that the post?"
- Nobody separates *did the thing* from *wrote about the thing*. Quincy's
  `source_item` → `riff` → `draft` chain is exactly that separation.
- Nobody scores a draft against the user's own past performance, or feeds
  performance back into the voice.
- Nobody keeps a durable record of claims and numbers already published, so
  nothing stops a story being told twice.
- Almost nobody publishes a changelog. Quincy's landing page currently says
  "N changes in the last 3 days" about work from two weeks ago
  (`app/(marketing)/page.tsx:41`, `lib/changelog.ts:139-141`).

## The plan

Four phases. Each is shippable alone. Order is by what the database says.

### Phase 1 — A merge becomes a good post (week 1)

**1a. Richer material at ingest, bounded.** Keep the diff unread as a whole.
Add, in `app/api/webhooks/github/route.ts` and `lib/shipped-work.ts`:
commit messages (`GET /repos/{r}/pulls/{n}/commits`), the changed-file list
(`/files`, names and additions only), linked issue titles, and a **bounded
patch sample**: the first 6 KB of patch for the three files with the most
additions. Store under `source_item.meta.material`. Measure the token cost on
the ten live rows before deciding the cap.

**1b. A brief before the beats.** One cheap model call at ingest writes
`meta.brief`: what changed for a user of the product, in plain words, in the
posting language, with every number the material contains. Selection reads
title, description, and brief. The brief may quote; the beats quote the brief.
This is what removes *"Kjørt i prod"* from a draft.

**1c. Ask one question.** When selection returns no indices, or a beat is
empty, write the refusal to `meta.refusal` (the function exists) and queue
**one** question for the owner: *"You merged 282 at 14:24. What made you
do it?"* Delivered on /sources today, on the messaging channel after Phase 2.
The answer is a voice note or a line; it becomes the missing beat. This turns
refusals into posts without lowering the bar.

**1d. The chat can reach a PR.** New tools in `lib/chat-tools.ts`:
`read_source(id | url | "#282")` returning the full item, brief, beats and
refusal; `read_riffs` un-truncated and carrying `riff.context`; `read_story`
(the tool `renderBrain` already asks for); `read_numbers` (the page exists).
`draft_angle` stays the only writer.

**1e. Language.** The writer is told "English unless the brain says
otherwise" and the beats are Norwegian quotes. Add to `describeBeats`: quotes
in another language are translated, numbers kept exactly.

**1f. Model A/B on the ten live merges.** `verify-shipped-work` costs about
$0.09 per run. Run it twice per PR, cheap model and expensive model, and judge
by the three-beat checks. This spends real money; the owner decides.

**Done when:** PR 277 yields a draft with a stranger-facing number, in one
language, and the owner can type "help me post about #282" and get it.

### Phase 2 — Something goes out, and Quincy can speak first (weeks 2–3)

**2a. Telegram as the first outbound channel.** A bot, owner-supplied token
via BotFather, `channel_connection.channel = "telegram"`. Three messages
only at first: the draft preview with **Approve / Edit / Skip** buttons
(approve calls `approveVersion`, so "you send" holds), the one question from
1c, and a morning line when something is waiting. Silent otherwise, within
`user.timezone` waking hours. Thread ids become `channel:id` so web and
Telegram share one conversation store.

**2b. Publish one real post.** `scheduled_post` is empty. Do it on X, from a
Phase 1 draft, and delete the losing LinkedIn endpoint branch after the first
LinkedIn post (`lib/publish.ts:200-216`).

**2c. An analytics table.** `post_metric(source_item_id, captured_at,
impressions, likes, replies, reposts, bookmarks)`, refreshed daily by
`/api/cron/channels` for the last 30 days of the owner's posts. `/numbers`
stops scoring frozen numbers, and the angle → post join it was designed for
becomes possible once 2b lands.

**2d. Ship log posts.** Five small merges are not five posts; they are one
list post. A weekly rhythm assembles the merges that were refused
individually into a "this week I shipped" draft, in the owner's own list
format (19% of the corpus uses list markers). This is the honest volume lever.

### Phase 3 — The brain knows the plan (weeks 3–5)

**3a. Strategy page per channel**, `brain_page.kind = "strategy"`: goal with
a date, audience, pillars with weights, cadence, windows, lean-into and avoid.
First draft proposed by Quincy from the corpus and the slots, provenance
`inferred`, confirmed by the owner. The writer reads it; the weekly plan reads
it.

**3b. "Needs material" on the story index.** Themes the corpus mentions that
have no story page. Rendered on /brain and asked about, one per week, through
the channel.

**3c. Memory ledger with dedupe.** `captureTurn` already appends user text;
heartbeat already compiles weekly. Add a per-day ledger page with typed lines
(`fact`, `preference`, `correction`) and merge duplicates before compile.
Corrections already win (`provenance: user`); keep that.

**3d. Voice preview.** On /brain?page=voice, one button: the same topic
written with and without the voice, side by side. Cheapest trust the field
has found.

**3e. Repeated edit → rule.** When `approveVersion` receives the same class
of edit three times (an emoji removed, a link added, a line cut), offer to
add it to the voice rules. The 15-rule cap stays.

### Phase 4 — Rhythms that do work, and the open-source surface (weeks 5–8)

**4a. Retire the catalogue.** Twenty of twenty-seven rhythm cards have no
handler. Show the seven that run (three on the dispatcher, four on events or the system cron). Add cards back one at a time, when they
exist.

**4b. Weekly review that grades last week.** Did the planned post go out,
and how did it do against the owner's median. One message, Sunday evening.
Two facts, tracked separately: posted, worked.

**4c. Week plan with a critique step.** Read strategy → propose the week's
angles from waiting riffs and gaps → critique each against the voice and the
last six drafted kinds → place into slots as drafts. Never approves.

**4d. Calendar as a source.** Google Calendar read-only. A meeting that
matches a story theme earns one reflection question after it ends.

**4e. An MCP server with OAuth**, read and write, on the free tier:
`read_riffs`, `read_drafts`, `read_lineup`, `read_numbers`, `capture_riff`,
`draft_angle`. No approve, no publish. Same invariant, reachable from any
agent.

**4f. Delivery adapter boundary.** Publishing stays first-party for X and
LinkedIn. For other channels, define `Publisher` as an interface and allow an
external scheduler over its REST API as one implementation. Do not vendor
copyleft code; call it over the network.

**4g. Fix the changelog claim.** `recentChangelog(3)` slices files, the
landing page says "last 3 days". Count by date. Publish entries for the two
missing weeks.

## Decisions this plan takes

- **Restraint stays.** "Most merges are not posts" is correct and is a
  differentiator. Volume comes from richer material, one question, and ship
  logs, not from a lower bar.
- **"Quincy drafts, you send" stays**, including on the messaging channel.
  The approve button is the send.
- **The diff stays unread as a whole.** Bounded samples and metadata only.
- **No scraping, no cookies, no third-party corpus of other people's posts.**
  Official APIs only. Say so on the pricing page.
- **Numbers refresh daily and are stored.** Frozen analytics are worse than
  none.
- **Every claim in a draft carries provenance.** The selection-by-index rule
  extends to the brief.

## What this plan does not do

- No autonomous publishing. Not a mode, not a toggle.
- No engagement automation of any kind.
- No new channels before one real post has gone out on the two that exist.
- No plan 008 (the trial ceiling). Still owed, still separate.

## Measures

Before: 10 merges, 5 riffs, 4 drafts, 0 published, 0 rhythm runs that did
work. After Phase 2: every merge yields a riff, a refusal with a reason, or a
question; at least one post per week goes out; one rhythm has done work.
After Phase 4: the owner's median impressions on Quincy-drafted posts is
measured against the corpus median, and the number is on /numbers.
