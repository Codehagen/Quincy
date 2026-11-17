# Connectors: Sources and Channels as one page, decided from /prototypes/connectors-lab

The decision log for this lab. The owner fills in **Picked**; the rest is
what was on the table. When it is filled in, copy the result into
`docs/design/decisions.md`, move what the pick asks of the kit (the table
at the end), rebuild /sources and /channels on it, and delete this folder
(and its line in `.oxlintrc.json`'s showcase override).

## The brief (2026-11-16)

The owner sent a screenshot of another product's integrations page: "jeg
ønsker den slik som denne siden". What it shows: a title and one line, a
quiet button and an ink pill at the right; a tab strip with counts, a tally
and a search; a three-column grid of cards on a white panel. Each card has a
32px tile, the name, a muted category, a status pill and ⋮ (or a quiet
Connect), a sunken area with two lines and one metric row (or tag chips),
and a foot under a hairline: "Synced 4 min ago" and a toggle, or "Free · 2
min setup" and "Setup guide ›".

Translated to Quincy's rules: the ink pill is the one action; toggles are
the kit Switch in ink; connected is the live dot on the quiet grey, never a
green fill; kit tokens, hugeicons, Base UI only. The metric row obeys
vision.md: an operational fact against the person's own use, from data
Quincy really has, or no row at all. Empty states are centred with the
friend. Tabs are arrow-navigable, `/` focuses search, every card is
reachable by Tab with a visible ring.

Route: `/prototypes/connectors-lab` (`?v=1|2` the direction,
`?state=today|all|first-run|failed|reauth|loading` the account, `?cols=2|3|4`,
`?clean` hides the picker and the panel). 1–2 switch directions.

## Merged, not split

**One page, "Connectors", with tabs: All · Connected · Sources · Channels.**
The reference implies it, and the two pages already say they are one idea
(`components/channels/channels-screen.tsx`: "material in, writing out"; the
same row on both). What the old split protected is kept by the tabs and by
the words, not by two URLs: every card says "Source · Reads merges" or
"Channel · Posts as you", and a channel's read-back is its own source card
(Your X posts, X bookmarks), so X is never connected twice. `lib/sources.ts`
argues against "one Integrations grid holding outputs, inputs and chat
surfaces together, filed under Core and Other". This page holds inputs and
outputs only (no chat surfaces, no MCP), and files them by what they do, so
that argument still holds.

## The real inventory (from the code, 2026-11-16)

| Connector | Kind | Real states | Real actions | Proposed |
| --- | --- | --- | --- | --- |
| GitHub | source | not installed; installed, needs your username (org); waiting (nothing merged); arriving; paused (installation suspended upstream, via webhook); no App on this deployment; `?github=failed\|taken` | Install (`GithubSetup.installUrl`), save username (`saveGithubLogin`), read my last merge (`readLastMergedPull`, one PR, own cooldown), answer the merge question, disconnect (`disconnectGithub`, hold) | Pause/resume by hand (`pauseSource`/`resumeSource` exist in lib; no action calls them) |
| Circleback | source | not connected; waiting for the signing secret; waiting; arriving; broken | Connect (`startCirclebackSetup`), paste secret (`saveCirclebackSecret`), disconnect (`disconnectCircleback`, hold) | Pause |
| Your X posts (read-back) | source, from the X channel | only with X active; never read; read N posts | Import posts / again (`importFromX`, 10 min cooldown, 100 posts) | — |
| X bookmarks | source, from the X channel | rhythm on/off; run ok/failed/skipped; needs `bookmark.read` scope (connections made before 2026-08-08) | Rhythm on/off (`enableRhythm`/`disableRhythm`), read now (`runRhythmNow`, manual cooldown), time (`setRhythmTime`) | — |
| Voice notes | source, built in | nothing to connect | Record on Ideas (`POST /api/voice-notes`) | — |
| X | channel | active; needs_reauth; revoked; not configured | Connect / Reconnect (`/api/connect/x`), disconnect (`POST /api/connect/x/disconnect`, hold), topics and times (`/channels/x`) | — |
| LinkedIn | channel | the same; needs_reauth every 60 days by construction (no refresh token) | the same, `/api/connect/linkedin` | — |
| Slack, Loom, Email, Granola, Fathom, Photos, Notion, Google Calendar, RSS | source | listed only (`SOURCES`) | none | "Ask for it" |
| Threads, Bluesky, Instagram, YouTube, Mastodon, Substack, Kit | channel | listed only (`SUPPORTED_PLATFORMS`) | none | "Ask for it" |

Left off on purpose: the MCP endpoint (an API surface, not material),
chat surfaces, and written notes on Ideas (built into Ideas, not a
connection).

Also proposed: the header's "Ask for one" (nothing receives a request
today; it could open Studio with the ask), the "How it works" guide pages
for GitHub and Circleback, and the card's detail sheet (a new surface for
existing verbs).

## What the data says (read-only aggregates, 2026-11-16)

| Fact | Live | What it decides |
| --- | --- | --- |
| Accounts | 4 | |
| Channel connections | X 1 (active, has `bookmark.read`), LinkedIn 0 | the "today" fixture: X in, LinkedIn ready |
| Source connections | GitHub 1 (arriving, last item today), Circleback 0 | GitHub in, Circleback ready |
| Merged PRs read (`source_item` github) | 572 total, 291 in 30 days, 8–107 a week | GitHub's metric: "Ideas from 291 merges · 30 days" |
| Ideas from GitHub (`riff`) | 75; 27 in 30 days, about 5 a week | the metric's number, and its usual (22) |
| Bookmarks read (`x-bookmark`) | 150; 28 in 30 days | |
| Drafts adapted from bookmarks | 98; 35 in 30 days | the bookmarks card's metric |
| Your X posts read (`x`) | 99, last 21 Aug | the read-back card's metric |
| Drafts waiting (all for X) | 110 drafts, 109 waiting | X's metric: "Drafts waiting for X" (an errand, not an audience) |
| Bookmarks to Posts runs | 68 ok, 3 failed, 30 skipped | a failed run is a real state ("failed" account) |
| Post metrics refreshed | daily, last 06:00 | X's foot: "Read back today at 06:00" |
| Voice / notes ideas | 2 / 1, all archived | no metric on Voice notes |

No follower count, reach or impressions appear anywhere. Circleback's and
LinkedIn's metrics show only in the "all" account, where the columns that
would hold them exist (`source_item`, drafts per channel).

## On the table

1. **Grid**: the reference translated. `KitPage` wide; header with "What
   reads them" (quiet, real: /rhythm) and "Ask for one" (proposed); a filter
   row of tabs with counts, "4 connected · 2 ready · 16 later" and the
   search; the cards in one white panel. The card: the kit's 36px glyph
   tile, name 560, a muted line; top right, the state (the quiet grey chip
   with the live dot when connected) and ⋮, or the one verb (Connect,
   Install, Connect X); a recess with two lines and the metric, or chips;
   the foot under a hairline with the newest fact and the switch, or what
   connecting costs and a link. The name is the card's button and opens a
   sheet with every verb (disconnect is a hold there). parts/card.tsx.
2. **Table**: the house pattern (Ideas, Drafts). Toolbar, filter row, a
   DataList grouped by what it needs from you (Needs you · Connected · Built
   in · Ready · Coming later), and the open connector in a pane (the same
   detail as the sheet). j k, /. Folds into Grid under 900px.

### Order and the one action

Cards sort by what needs you, then connected, then ready (channels first),
built in, later. The ink pill follows actions.md: a stopped, unauthorised or
half-set-up connector's fix wins; on a first run X's Connect wins; otherwise
the header's "Ask for one" (or nothing, with the header control quiet).

### States in the lab

today · all connected · first run (nothing connected; Connected tab shows
the centred empty state) · failed (GitHub app removed, Circleback secret
changed, a bookmark read hit X's limit) · reauth (LinkedIn's 60 days, X
missing the bookmark scope, GitHub half set up on an org) · loading. Search
with no match shows the centred empty state with "Clear the search".

Loading is a static skeleton (no shimmer) under a LiveDot line, because the
brief asked for a skeleton. states.md says a skeleton is not a loading state;
if the owner agrees with states.md, it becomes the LiveDot line alone.

### Two conflicts with today's rules, put on controls

- **Connected mark.** The brief asks for the LiveDot. The current Sources
  and Channels code says "a connection is permission, not a running ritual"
  and draws no dot. Control: dot | words.
- **Header pill.** The reference's ink pill sits in the header. KitPage's
  rule says the one action belongs to an object. Control: ink | quiet. A
  broken connector takes the ink either way.

## Controls

Account (the six states) · Columns 2 | 3 | 4 (fewer as the page narrows,
one on a phone) · Card density comfortable | compact (20 or 12 inside) ·
Metric row on | off · Tags on | off · Frame panel | ground (cards in one
white object, or each lifted) · Connected mark dot | words · Header pill
ink | quiet · Mark proposed show | hide.

## Picked

- Direction: **2 · Table** (owner, 2026-11-17: "for labs liker jeg table.
  Bruk ui sdk om du trenger det og gjør en surfaces på det også."). Grid
  stays as its fold under 900px of workspace, and as the phone layout.
- Merge: one page, Connectors, with All · Connected · Sources · Channels.
- Connected mark: **words** ("Connected", no dot). A connection is
  permission, not a running ritual; the dot stays for work in progress.
- Header pill: ink "Ask for one" (proposed) when nothing needs you; a
  connector that stopped, needs reconnecting or is half set up takes the
  ink with its fix, and on a first run X's Connect does.

### ui-sdk

Nothing new was needed. The grouped list with type-ahead, one tab stop and
selection that follows focus is the kit's DataList, which is already on
ui-sdk's Listbox. The tabs stay on Base UI's Tabs (arrow keys, Home, End),
the pane on Panel, the switch on Base UI's Switch. No component mixes the
two. Twenty-three rows need no virtualisation; a command-style filter
would only repeat the search field and `/`.

### Surfaces, settled (a surfaces pass, 2026-11-17)

- **Rows** are the DataList's own: rest has no fill; hover
  `bg-kit-row-hover`; selected `bg-kit-selected` with the 3px ink bar and
  a 560 title; 36 tall (44 on touch), 1px apart, inset 8 with the 8px
  radius (`rounded-kit-control-inner`) on a square pane, so there is no
  outer radius to derive from.
- **Needs you** is said in the group head, not with a tinted row: the head
  is ink with the alert glyph, the state cell is ink with its glyph
  ("Reconnect", "Stopped", "Half set up"). A tint would read as selected,
  which is the well grey's job; red is for destruction only.
- **Group heads**: the name at 560 and its count, tabular, muted; 12px meta,
  on the 20 edge. Order: Needs you · Connected · Built in · Ready to
  connect · Coming later. An empty group is not drawn.
- **Coming later** rows: the title `quiet` (muted) and the glyph muted.
- **Glyphs**: 16px monochrome marks in the rows, never a tile (a 36 tile in
  a 36 row has no air). The pane's head keeps the 36 GlyphTile on
  `shadow-kit-control`: ring plus a short fall, one ring in dark.
- **Borders vs shadows**: every line in the workspace divides and none lifts,
  so they stay hairline borders (`border-kit-hairline`): under the toolbars,
  under the head band and the pane strip (one 32 band across both panes),
  the pane's start edge, and the two dividers inside the pane (above the
  verbs, above Disconnect). Nothing in the workspace takes an object shadow;
  the panes are regions of one surface, never Cards.
- **Pane strip**: the kind on the left, the state at the end (StatusPill's
  register: glyph and word, no fill). The head under it says the name and
  what it does, so nothing is said twice.
- **Pane insides**: 20 padding; the metric row in a `Well`
  (`bg-kit-well`, 12 radius, 12 × 10 inside): the pane is square, so the
  Well's radius is its own, not derived. The number at 560 ink, tabular,
  then "· usual 22" muted. The Reading switch sits beside its label with
  the "proposed" tag next to the words. Verbs are quiet pills side by side
  (`shadow-kit-control`), so their labels hold one left edge with the text
  above; the lab's refs list sits under them in 11 mono. Disconnect is a
  hold, last, under its own hairline.
- **The open row** with nothing picked is the one holding the page's ink
  pill (a fix, or X's Connect on a first run), else the first row.
- **A connector that stopped or is half set up** shows its sentence in ink
  and its fix, never the Reading switch or its number.
- **Light and dark**: tokens only. In dark, the control and tile shadows
  collapse to one white ring (the kit's elevation tokens); the selected row
  is the dark well; the Well is darker than the pane (a recess), as in light.

## What the pick asks of the kit

| Need | Where it is now | Proposed |
| --- | --- | --- |
| A tab with a count | parts/filter-tabs.tsx (Base UI Tabs on the kit's segment styles) | `Tab count={n}` in components/kit/tabs.tsx |
| A quiet grey status chip with the live dot | parts/marks.tsx `StatusChip` | a `connected` look on `StatusPill`, or a doc line saying it is not one |
| A card whose name opens it, ring on the card | parts/card.tsx | a `Card` with `onOpen` and the stretched hit area, if Grid wins |
| A metric row with its usual | parts/metric-row.tsx | `components/quincy/` beside `AgainstMedian` |
