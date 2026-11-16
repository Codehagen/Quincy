# Lineup as a working surface — decided from /prototypes/lineup-lab

The decision log for this lab. The owner fills in **Picked**; the rest is
what was on the table. When it is filled in, copy the result into
`docs/design/decisions.md`, move what the pick asks of the kit (the table
at the end), rebuild /lineup on it, and delete this folder (and its line in
`.oxlintrc.json`'s showcase override).

The brief (2026-11-16): build Lineup the way Ideas and Drafts were built.
Ideas and Drafts became working surfaces (Table, the open item beside its
row), and Drafts then drew the open draft as the real feed (C · Feed, "Bra
med feed"). Lineup answers "when does it go out": the approved posts, the
slots they fill, the gaps, and what went or did not. Airy single-column
cards read as cheap; the owner wants a toolbar, filters, a dense list or
grid, the open item beside it, keys. Any number is said against the
person's own week, never as a dashboard.

Route: `/prototypes/lineup-lab` (`?v=1..3` picks the layout, `?clean` hides
the picker and the panel, `?week=real|full|first-run`, `?state=loading`,
`?order=profile`). It renders at true size in the real app shell, on one
local store, so a move in one layout shows in the next. Keys: j k move, ⇧J ⇧K
later or earlier on the post's channel, M the Move menu, P Post now (opens
the confirmation), B Back to Drafts, G give an approved post its time, U
undo, S the slots; 2 · Calendar adds the arrows through the grid, and Enter,
↑ ↓ ⇧↑ ⇧↓ ← → Enter / Escape on a held block;
1–3 switch layouts.

## What the data says (read-only aggregates, 2026-11-16)

| Fact | Live | What it decides |
| --- | --- | --- |
| Accounts with slots | 1 (Europe/Oslo) | |
| Slots | 2, both X: Mon 08:00, Sat 09:30 | the rhythm is two rows of a grid, or two rows in a week of seven days |
| Scheduled posts, any state | **0** (none queued, sending, sent or failed) | the real week is all gaps: every layout must read well with nothing in it |
| Approved with no time | 1 (X) | the one thing that could fill Saturday sits on Drafts, out of sight of Lineup |
| Waiting on Drafts | 109 | the bottleneck is approval, not placement (as Drafts found) |
| Today | a Monday: the 08:00 slot passed empty this morning | "a gap today" is the real state, not a fixture |
| Posts sent through Quincy | 10 `x:post` events, 4–16 Aug (before the reset) | no failure or sending history to measure; the states come from the schema |
| The person's own X posts | 99, Nov 2025 – Aug 2026, in 21 of 43 weeks | the baseline |
| Posts per week (weeks with a post) | p25 1, **median 3**, p75 8, max 15 | "you usually post 3": the one number the page states, against the person |
| Posts per active day | 1: 31 days, 2: 15, 3+: 10 | two in one day is common for him; a note on it is a fact, not a warning |
| Hour of day (Oslo) | peaks 08 (13), 13 (10), 11 (9), 21–22 (22) | his slots (08:00, 09:30) match his mornings; evenings have no slot |
| Weekday | Sun 22, Tue 16, Fri 14, Thu 13, Sat 13, Mon 12, Wed 9 | |
| Rhythms on | Week Plan (Mon 07:00), Ship Log (Fri 18:00), Weekly Review (Sun 19:00), Bookmarks (14:00) | Week Plan proposes; it never approves or schedules |

The fixtures (data.ts) are fictional text in these shapes. The default week
draws every state once: a slot that passed empty today, a post sent at
09:10 with its receipt, one the platform refused at 12:30, one claimed at
14:15 that nobody can say went, queued posts on X and LinkedIn in slots and
as one-offs, two X posts three hours apart on Friday, open slots ahead
(Thu 11:00 LinkedIn, Sat 09:30 X), quiet days (Wed, Fri on LinkedIn, Sun),
and one approved post with no time. `?week=real` is the live account's
shape; `full` has every slot taken for two weeks and two approved posts
with nowhere to go; `first-run` has no slots.

## Picked

- Layout: **2 · Board, rebuilt as a calendar** (owner, 2026-11-16: "I like
  the Board, but we need to make this into a calendar that we also can have
  all the times between also. Use ui sdk for this also so that we have
  everything, and have the animations when we are moving also."). It is on
  the picker as **2 · Calendar**; the slot-row Board it replaces is gone
  from the lab.
- The tension, in one line: vision.md says "everybody shows a calendar",
  and the owner chose one on purpose; it stays a working surface.
- **Why it stays a working surface, not a vanity view:** every block is a
  post a person approved, or a slot they committed to, with a verb on it
  (move, post now, back to Drafts, fill this slot). There are no counts on
  a block, a day or the week: no views, no likes, no followers, no totals
  per day (the one-day strip marks a day with a post by a dot). The only
  number on the page is the baseline, said against the person ("7 posts
  this week; you usually post 3"). A gap is drawn as an open slot or an
  empty quarter hour that offers what could fill it.
- **What it is** (layouts/calendar.tsx, parts/week-grid.tsx):
  - A Mon–Sun week, days as columns with the date in the head (today's
    date on the ink fill, its column the stage grey), and continuous time
    down the left, 00:00 to 24:00, labelled every hour, 15-minute snap.
    It opens scrolled to 07:00. A "now" line (ink, the live dot) runs
    across today.
  - Posts are blocks at their exact minute, drawn 45 minutes tall (a
    visual length, not a duration). Open slots are dashed blocks at their
    times; a slot that passed empty is a quieter dashed block. Blocks at
    nearly the same time sit side by side (`stackSpans`).
  - A week switcher (‹ Today ›) with the range ("16–22 Nov"). Last week
    shows what went and the slots that passed empty; next week shows the
    rhythm's open slots.
  - The pane keeps the open block's post as the feed (Drafts' parts). The
    "Approved, no time" tray sits above the grid, outside its scroller;
    a chip drags onto any quarter hour (proposed: place, then move).
  - An empty quarter hour (click, or Enter) proposes: "Make it an X slot"
    (`createSlot`, real), "Put “…” here" (proposed), Approve a draft.
- **Keys** (keyboard parity with the drag): the arrows move focus through
  the grid (ui-sdk grid focus: one tab stop, Home/End, Page Up/Down). Enter
  on a block picks it up; ↑ ↓ move it 15 minutes, ⇧↑ ⇧↓ an hour, ← → a day;
  Enter drops it, Escape puts it back. Each step is said through the page's
  announcer ("Wed 09:15"); the drop is said by the store's note ("Moved …
  to Wed 09:15. Press U to undo."). U undoes it. P, B, S, j and k work as
  on the other layouts.
- **ui-sdk, and what it did not have:** `createSpans` (blocks on day
  tracks, the pointer drag with a snapped draft, auto-scroll, `stackSpans`),
  `createGridFocus` (the grid's keys), `bindDrag` + `bindDragPreview` (the
  tray), `@ui-sdk/core/date` (`startOfWeek`, `addDays`), all inside one
  ui-sdk primitive; no Base UI in that component (the kit's Base UI parts
  are only around it: the toolbar, buttons, menus, dialogs). Built here
  because ui-sdk lacks them: (1) a held "pick up, move, drop" mode on a
  span (`spans.keydown` commits every arrow and uses Shift to resize);
  (2) the settle spring, because ui-sdk's spring solver is not exported, so
  the curve is a CSS `linear()`; (3) gliding between snaps while dragging.
  There is no calendar-week or time-grid component in ui-sdk (its Calendar
  is a month date picker), so the week is `createSpans` on day tracks.
- **Motion** (transform and opacity only; no `transition-all`): a dragged
  or held block lifts (scale 1.03 and the lifted shadow; it never enters
  from nothing); under the pointer it glides between 15-minute snaps on a
  60ms transition, so it follows without lag; on drop it settles into its
  snapped place on a 380ms spring with a small overshoot; keyboard steps
  move on a 160ms retargetable transition; neighbours that make room slide
  aside on the same spring; the tray's drag copy lifts in 150ms and follows
  the pointer one to one; the "now" line and a week change move by
  `translate` and opacity (the week slides 16px from the side it came
  from, 240ms). Every one is a CSS transition, so a move reversed
  mid-flight retargets. Reduced motion: every transition and the lift off,
  moves are instant.
- **Surfaces** (a surfaces pass, 2026-11-16; kit tokens only, the values
  live in candidates.css under "2 · Calendar"):
  - **Border or shadow:** a line that separates is a border; what is raised
    is a shadow. Day columns, hours and the day-head band are borders at the kit's
    density-aware `--border-hairline` (1px; 0.5px from 2x); the pane edge
    is the kit Panel's own `--kit-hairline` border, unchanged. Blocks and tray chips are shadows, never borders.
  - **Hour lines:** hours `--kit-hairline`; half hours the quieter
    `--kit-grid-line`; quarter hours none (the snap is felt, not drawn).
    The grid closes with a hairline at 24:00 and on the last column.
  - **Today:** the one tinted column, `--kit-stage` at 50% (a recess in both
    themes: lighter grey in light, below the ground in dark). The date sits
    on the ink fill in `--kit-primary-on`. **The weekend is not tinted:** the
    person posts most on a Sunday (22 of his 99 posts), so it is not an off
    day here.
  - **A queued post** (and sending, failed): `--kit-object` on
    `--shadow-kit-object` (light: a 1px ring and two soft layers; dark: one
    white ring at 8%). **Failed** keeps the same surface: the alert mark
    and the platform's words in the pane say it, never red (nothing was
    destroyed). **Sending** is the same surface with the live dot.
  - **Sent:** flat. No fill, the inset ring alone (`--shadow-kit-inset`),
    the time muted: it happened, so it is no longer raised, and it stays.
  - **Lifted** (dragged, or held by Enter): `--shadow-kit-lifted` (light: a
    ring and a long soft fall; dark: a brighter white ring at 14%, since a
    fall is invisible on a dark ground) and scale 1.03, so the lift reads in
    dark through the scale and the ring. The kit's `--kit-lift-scale` (1.01)
    is for rows: on a 100px block it is 1px, so 1.03 is proposed as a small-
    object lift step.
  - **Picked:** `--kit-selected` with the 3px ink bar
    (`--spacing-kit-selection-bar`), the same as a picked row and chip.
  - **Open slot:** a 1px dashed `--kit-ink-muted` outline, no fill. It is a
    meaningful graphic (WCAG 1.4.11): about 5.2:1 on the light ground (4.9
    on today's tint) and 7.6:1 on the dark ground. 1px, not the hairline:
    a 0.5px dash breaks up.
  - **Passed empty:** the same dash at `--kit-ink-muted` 45%, about 1.6:1
    light and 4:1 dark. Decorative on purpose: its words ("Passed empty",
    muted text at 5.2:1) carry it.
  - **Radii:** blocks and chips are `--radius-kit-control-inner` (8). They
    sit on a grid, not inside a rounded parent, so no radius nests; the
    focus ring follows the corner. The feed column keeps the platform's
    square edge, 20px inside the pane (no nesting either).
  - **Dark:** every stack collapses to its single white ring, as AGENTS.md
    asks; nothing in the calendar sets a `dark:` class, the tokens flip.
- **Widths:** a week from ~1020px of workspace (the pane is 380 from
  1200, 320 under it, so 1280 is a week); 860–1020 one day with a day strip
  over the column; under 860, and at 390, 3 · Feed.
- **States kept:** loading (the hour lines, no shimmer, a polite status),
  first run (the Friend, centred, the starter rhythm), slots full (the
  tray, and every slot drawn filled), failed (the alert mark, the
  platform's words in the pane), sending (the live dot), sent (the tick,
  muted time), passed empty (the quiet dashed block), approved with no
  time (the tray).
- Still on the control panel: the hour height (default 56), Quincy's
  notes, the feed column, the Feed layout's rail, margin and order.
- Proposed with the pick (none is a server action): 11. **dropping at any
  minute** of a day is `movePost` with a day and time (real); dropping on
  an open slot at its exact time fills the slot (real, `movePost` with the
  slot); dropping an approved post from the tray at a chosen time is
  proposed (place, then move); 12. **making a slot from an empty quarter
  hour** (`createSlot`, real, offered from the grid); 13. the week
  switcher shows past weeks (the post rows exist; `getLineup` reads seven
  days from today only, so other weeks need a read with a range).

## On the table

| # | Layout | Axis | When it is the right choice | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Table | time order, one dense list grouped by day; open slots are rows where they fall; the open post drawn as the feed will show it in a pane (598 + 40) | Lineup is worked like Ideas and Drafts: scan, pick, move by key. One pattern across the three queues, and the feed rendering Drafts picked | a gap is a row you read, not a hole you see; the week's shape is not visible at a glance. Folds into 3 under ~1000px of workspace (1280 stays a table) |
| 2 | Board (picked, rebuilt as the calendar above) | the rhythm as a grid: days across, the times you publish down (one row per slot time, one for one-offs); every cell a slot or nothing; the open cell's post at phone width beside it | the question is the shape of the week: which days are empty, where two land together, what a move does to the rest. A drag or ⇧H/⇧L moves a post a day | it is the calendar vision.md warns about ("everybody shows a calendar"), kept to the rows you chose. A cell holds two lines of the opening (a control). Needs ~1100px: 1280 folds into 3 |
| 3 | Feed | what your followers will scroll: one platform's column at true size, the week in order, open slots and quiet days drawn in the column, now between what went and what is coming; the time on a rail, Quincy's notes and the verbs in the margin | judging the week as a reader will meet it: two posts too close, a long silence, the same opening twice. It is the phone layout for all three | a post is a post's height: five posts is three screens. One platform at a time. Moving is a menu or a key, not a glance |

What all three share (parts/):

- **One store** (use-lineup.ts). Every verb answers the way its server
  action does (below), and calls none.
- **The same states, said the same way**: no mark on a queued post (it is
  the default), the live dot and "Sending", a tick and "Sent", the alert and
  "Didn't go" (muted, not red: nothing was destroyed), a dashed ring and
  "Open" or "Passed empty", a clock and "No time".
- **The same verbs under the open item** (parts/verbs.tsx): one status line
  in words, then Move (a menu), Post now (behind the confirmation), Back to
  Drafts. A failed post's ink action is Try again now; an approved post
  with no time gets Give it a time; an open slot offers what could fill it.
- **The post as the feed shows it** on Drafts' parts (drafts-lab
  parts/feed), read-only: Lineup does not edit words (lib/lineup.ts:
  "a second Drafts with worse editing"). The platform's look stays inside
  the column; the time, state and verbs stay outside it, in the kit.
- **The one sentence of numbers** in the toolbar: "7 posts this week; you
  usually post 3. 2 slots are open. 1 didn't go. 1 approved with no time."
- **Empty states, centred, with the Friend**: no rhythm (the first run,
  with the starter rhythm in words and one press), nothing queued, a filter
  that left nothing, nothing open.

## Controls (the undecided numbers)

| Control | Range | Default | Today |
| --- | --- | --- | --- |
| Week | fixtures · real · full · first-run | fixtures | |
| State | live · loading | live | |
| Quincy's notes (proposed) | on · off | on | none |
| Feed column (1, 3) | 520–640 | 598 (X's) | — (opening line only) |
| Calendar hour (2) | 40–80 | 56 (a post drawn 45 minutes tall, 15-minute snap) | — |
| Feed rail (3) | 88–160 | 112 | — |
| Feed margin (3) | 200–320 | 248 | — |
| Feed order (3) | forward · profile | forward (today on top) | — |

The fold widths are measured from the screenshots: 1 · Table keeps a 434px
list beside the 638 pane at 1280 (workspace 1072) and folds under 1000.
2 · Calendar needs seven columns of at least ~95px beside its pane (380,
or 320 under 1200), so it is a week from ~1020, one day from 860, and
1280 stays a week (the first Board folded at 1280).

## Every action /lineup has, and where it is in the lab

All of these are real server actions; the lab answers the way each does
and calls none.

| Action | Server | In the lab |
| --- | --- | --- |
| Move a post to a slot, or a day and time | `movePost` (queued only; refuses a time within a minute of now, "That time has already passed…"; a slot of another channel is not offered) | Move menu (M): the open slots on its channel ahead, same time tomorrow / the day before; Calendar: drag a block, or Enter and the arrows |
| Reorder: two posts trade places | `reorderLineup` (all or none, at most 50 moves) | ⇧J ⇧K (the next queued post on its channel, or the next open slot through `movePost`); Calendar: a drop beside another post sits side by side (no swap) |
| Back to Drafts | `unschedulePost` (deletes the row; the version stays approved) | B, a ghost button; the post moves to "Approved, no time" |
| Give an approved post a time | `placeApprovedVersion` (the next free slot in two weeks, or `slots-full` / `no-slot`) | G, the ink action on an approved post with no time |
| Post now | `postNow` → `sendNow` (approved only; refuses `sending` and `published`; a queued or failed row becomes now) | P opens the AlertDialog ("Quincy can't unsend it."); the post goes to Sending (the dot), then Sent with the receipt |
| Retry a failed post | the same `postNow`: `sendNow` puts a `failed` row back to queued and sends it | "Try again now", the ink action on a failed post (P) |
| Add a slot | `createSlot` (connected channels only; a duplicate is a no-op) | S, the Slots dialog; Board: an empty cell offers "Make it an X slot" |
| Remove a slot | `deleteSlot` (posts in it keep their time, as one-offs) | the Slots dialog, a plain control (nothing written is lost) |
| Take the starter rhythm | `applyStarterRhythm` (Tue and Thu 08:00) | the first-run empty state: the rhythm in words, then one press |
| View the post | `post_url` | "View the post" on a sent one |
| States | `SCHEDULED_STATES` + lib/going-out.ts | queued, sending, published, failed; open, passed empty; approved with no time (slot-came-later, slots-full, no-slot, sent back); beyond the week (a placement past it says so) |

## Proposed (not on /lineup today)

None of these is a server action. Each is marked so it is not mistaken for
something the product already does.

1. **Approved with no time, on Lineup.** Today those versions show on
   Drafts only, so the post that could fill Saturday is invisible from the
   page that shows Saturday empty (live: exactly this). A group on top (1),
   a tray over the grid (2), a band at the head of the column (3). Reads the
   same rows Drafts reads.
2. **Put this post into this slot.** An open slot offers an approved post
   by name. `placeApprovedVersion` only takes the *next* free slot; a chosen
   slot is that plus a `movePost`, or a `slotId` argument.
3. **Undo Back to Drafts (U).** The server has no restore; the lab puts the
   row back. It would be `placeApprovedVersion` + `movePost` to the old
   time, or a restore action.
4. **The person's baseline in the toolbar** ("you usually post 3"): the
   median of their weeks with a post, from their own X posts
   (`source_item` source `x`). Nothing computes it today.
5. **Quincy's notes about the week** (on a control): facts, never a
   verdict. "Three hours after the 09:00 X post." "Passed empty at 08:00."
   "The next open slot." "Quiet day." In 3 they are handwritten in the
   margin (the kit's `Hand`, graphite); in 1 and 2 one muted line.
6. **Letter keys on Lineup.** Today the page has the Reorderable's arrows
   and nothing else: j k, ⇧J ⇧K, M, P, B, G, U, S (and h l ⇧H ⇧L on 2).
   P opens a confirmation, so a key for an irreversible action is safe here;
   Drafts kept Post now off the keys.
7. **Post now from Lineup.** The action exists on Drafts; Lineup today can
   only send a failed post back.
8. **The feed rendering on Lineup** (Drafts' proposed item 14), read-only.
9. **An empty cell becomes a slot** (2): `createSlot` with that weekday and
   time.
10. **Post now clears the slot it leaves** (see "Found while building"):
    the lab sets `slotId` to null when a queued post is sent early.

## Found while building

- **Post now keeps `slot_id`.** `sendNow` sets `scheduled_for` to now and
  leaves `slot_id`, and `getLineup` marks a slot filled by any row in the
  week that points at it, whatever its instant. So a Tuesday post sent on
  Monday leaves the Tuesday slot reading as taken on /lineup, while
  `nextFreeSlot` (which compares instants) would fill it. One of the two
  should change; the lab clears the slot (proposed 10).
- **A placement past the week is invisible on Lineup.** `placeApprovedVersion`
  looks two weeks ahead and Lineup draws seven days; the lab says so in the
  foot, as `beyondThisWeek` does on Drafts.
- The current page's header rejects a calendar for 135px columns that
  wrapped every idea onto three lines (app/(app)/lineup/page.tsx). 2 · Board
  is that axis again, with rows of slot times rather than hours, a clamped
  opening line, and a fold. It is here because the brief asked for it; the
  recommendation below does not lean on it.
- The lab imports Drafts' feed parts and their platform stylesheet
  (`../drafts-lab/parts/feed/*`, `feed-preview.tsx`, `candidates.css`).
  Delete the two labs together, or move those parts first (Drafts'
  DECISION.md names where they go).
- The first Board's drag was the browser's own drag and drop. The picked
  calendar replaces it with ui-sdk's `createSpans` drag (pointer) and the
  held-block keys (keyboard).
- `pnpm lint` reports one error outside this lab:
  app/prototypes/video-launch/film.tsx:107 (a setState in an effect). Not
  touched here.

## Not built, and why

- **A month view.** At two slots a week it is thirty mostly empty cells,
  and vision.md rules it out.
- **Counts of any kind on a post** (views, likes): a post that has not gone
  out has none, and a sent one is Numbers' question, against the median.
- **Autoposting or "fill my week".** Week Plan proposes and stops at
  Drafts; every post here was approved by a person, and Post now is a
  second, confirmed press.
- **Editing the words on Lineup.** Drafts is where words change; a post
  here links back by its state, not by a second editor.
- **Bulk moves.** `reorderLineup` takes many moves, but a person picks one
  post at a time; a bulk move needs a reason first.

## What moving the pick into /lineup asks of the kit

No kit file changed in this lab; every control is the promoted workspace
set (Toolbar, FilterMenu, DataList with groups, Panel, KeyBar, FootBar,
StatusPill, Segmented, Announcer, WorkspacePage).

- **StatusPill words for a schedule**: the four marks fit (dot: sending;
  tick: sent; alert: didn't go; clock: no time). The lab passes the words
  as children. An "open slot" mark (the dashed ring, parts/cells.tsx
  `OpenRing`) is new.
- **`Hand` exported from the kit** for a margin note that is not beside a
  Card (3 uses it directly from components/kit/bracket).
- **The feed parts** (`FeedColumn`, `FeedPost`, `FeedSkeleton`) as Drafts'
  DECISION.md places them, plus a read-only `PostWords` and a `FeedGap`
  (an open slot drawn in the column, for you only).
- 2 only: a grid primitive (cells, a cursor, h j k l); DataList is a list.
- 3 only: a rail / column / margin layout that folds to one column (the
  margin room Drafts proposed, with a rail on the other side).

## Recommendation (the lab author's, for the owner to overrule)

**1 · Table, with 3 · Feed as its fold.** It is the pattern the owner
picked twice, so Ideas, Drafts and Lineup read as one product; it holds
every state in one dense list; and it keeps the feed rendering he picked
for Drafts, beside the row. It also stays a table at 1280, which 2 does
not. With today's data (two slots, nothing queued, one approved post with
no time), the page's job is to show the gap and the post that fills it on
one screen; Table does that in three rows and one ink press.

3 · Feed is the strongest second: it answers a question neither other
layout can (how does the week read to a follower), and it is already the
phone layout, so it could come back as a one-key view of 1. 2 · Board is
the clearest picture of the rhythm, but it is the calendar the product
said it would not be, and at today's volume it is fourteen cells to say
two things.
