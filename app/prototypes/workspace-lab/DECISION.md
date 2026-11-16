# Ideas as a workspace — decided from /prototypes/workspace-lab

The decision log for this lab (the prototype skill, Phase 7). The owner fills
in **Picked**; the rest is what was on the table. When it is filled in, copy
the result into `docs/design/decisions.md`, promote the picked candidate
components into `components/kit/` (the table at the end says what each
replaces), rebuild /ideas on them, and delete this folder (and its line in
`.oxlintrc.json`'s showcase override).

The brief (owner, 2026-11-16): "I like *Marked up*. But the actual components
on the page look very cheap. I want Ideas to look more like a dashboard."
Read as a **working surface** (a toolbar, filters, a dense list, the open
idea beside it), not a metrics wall: docs/vision.md rules out follower charts
and dashboards of numbers, and the one number on the page is stated against
the person's own week ("you usually draft 4").

## Picked

- Layout: **1 · Table** (owner, 2026-11-16: "Jeg liker egentlig table veldig godt").
- Values, baked after a surfaces + foundations pass (candidates.css):
  - Type steps: page title 15/600 · row title 13/460 (the open row 13/560
    ink) · meta 12/460 · mono 11 tabular (age, counts) · column heads 12/560
    muted. Prose in Marked up stays 14/24 at 62ch, the one reading surface.
  - Rhythm: page row 52 (the shell bar) and filter row 44 read as one band,
    one hairline under both; column heads and the detail's source strip are
    one 32px band with one hairline across both panes; rows 36 with 1px
    gaps; key bar and Undo note both 36, so swapping them does not move the
    panes. One left edge at 20 in every region (rows: 8 inset + 12 pad).
  - Surfaces: panes are one surface split by a 1px hairline (a border,
    because it separates, not elevates); selected row = grey + 3px ink bar
    + 560 title; hover is a lighter step than selected in both themes
    (light 0.975 / 0.961; dark ~0.206 / 0.30 on a 0.178 ground); shape is
    muted text, joined with "·" in the detail.
  - Icons 16 at stroke 1.75 (chevrons 14 at 1.75).
  - Empty state keeps the column heads, 13/560 + 13 muted + a quiet 28px
    "Clear filters", on the rows' edge. Loading: eight static skeleton
    rows on the same grid and row height (no shimmer, no motion path
    needed), with a polite "Loading ideas" status.
- Still on a control (taste, not rule): row height (default 36), row title
  (13), and the detail panel's floor and ceiling. The detail is
  `clamp(440px, 36cqi, 560px)` of the workspace (cqi, not vw: the lab frame
  is scaled and the sidebar is not the page's). At 1280 (workspace 1072)
  that is 440 and leaves the title column 340 (it was ~260 at a fixed
  520); at 1440 (1232) it is 444 and the list reaches 46rem, so the Source
  column comes back and the title column is 364.
- The fold (polish pass, 2026-11-16): Table becomes Inline when the
  workspace is under 900px, or when the detail would leave the title column
  under 320px. At the defaults that is a workspace under ~1053px: 1280 stays
  a table, a 1024 tablet and every phone get Inline, with the same store
  and keys. The brief's 360 would have folded 1280, the screen Table was
  picked for. layouts/table.tsx, `shouldFold`.
- Why: Ideas is a queue worked through daily, by key; columns read down as
  well as across, and the open idea is Marked up beside its row without the
  list moving.

## On the table

| # | Layout | Axis | When it is the right choice | Its cost |
| --- | --- | --- | --- | --- |
| 1 | Table | toolbar (2 rows) + dense table with columns + fixed Marked-up panel | Ideas is a queue worked through daily with keys; you scan by shape, channel, age | the source stops being the unit (three ideas from one merge are three rows; the Layers view groups them back); at 1280 the Source column drops |
| 2 | Three panes | sources rail (what I read, with state) + two-line idea list + wide Marked-up detail | you start from the material ("what did I say in that call?"); reading/failed sources need a home | no columns; needs ~1200px or the rail must fold; three scroll regions |
| 3 | Inline | one column of dense rows that unfold in place into Marked up | one page on every screen; the phone is the same layout; nothing to keep in step | no side-by-side reading; an open row pushes the rest down; wide screens leave empty margins |

## Controls (the undecided numbers)

| Control | Range | Default | Kit today |
| --- | --- | --- | --- |
| Row height | 28–48 | 36 | ListRow 44 (60 with two lines) |
| Row title | 12.5–15 | 13 | body 14 |
| Meta text | 11–13 | 12 | small 12.5 |
| Page title (toolbar) | 14–28 | 15 | title 28 over the page |
| Detail panel (A), min · max | 360–560 · 440–680 | 440 · 560 (width 36% of the workspace between them) | — (split at 66rem, list 24rem) |
| Source rail (B) | 180–300 | 232 | — |
| Icon size / stroke | 14·16·18 / 1.5·1.75·2 | 16 / 1.75 | 16–18 / 2 |
| Pane edge | hairline · raised | hairline | every region a Card |
| Shape tag | text · outline · fill | text | Tag, outline 24px |
| Selected row | grey · bar · lifted | bar | grey only (1.12:1) |

Settled on 2026-11-16 by the surfaces / foundations pass and removed from
the panel: meta 12, page title 15, icon 16 / 1.75, pane edge hairline,
shape tag text, selected row bar (plus a 560 title), and the source rail
(layout B only). Still on the panel: row height, row title, detail panel
floor and ceiling, and a "Table" switch (rows / loading).

## What moving Table into /ideas asks of components/kit

- Type: add `--text-kit-meta` (12/16) and `--text-kit-mono-sm` (11/16,
  tabular), and a 13/19 row-title step for dense data; today the kit has
  body 14, small 12.5 and mono 12 only.
- Row states: the kit's dark `--kit-row-hover` (gray-320) is brighter than
  dark `--kit-selected` (well, gray-155, below the ground), so hover reads
  as the selection. Flip it: dark hover ≈ mix(235, 178) 50%, selected
  gray-300; light unchanged (975 / 961). Add the 3px ink selection bar to
  the row primitive.
- Heights: `--spacing-kit-bar` 52, `--spacing-kit-filter-bar` 44,
  `--spacing-kit-head` 32, `--spacing-kit-foot` 36, `--spacing-kit-row-dense`
  36 (ListRow stays 44 for short lists).
- Button: size `sm` 28 / `md` 32 and a `ghost` variant (WsButton);
  `Kbd` at 18px with an on-ink look (KeyHint).
- New: `Toolbar` (bar / filter sizes, optional hairline), `KeyBar`,
  `FilterMenu` (counts per option), `SearchField` size `sm` (32, ring only),
  `Segmented` size `sm` icon-only, `DataList` (IdeaTable: column head band,
  empty and loading rows on the same grid), `Panel` / `PanelBody` with a
  32px sticky strip, `StatusPill`.
- `Tag` gets `look="text"` (muted text, no ring) as the default in tables.
- Icon stroke 1.75 at 16 beside 13px text (the kit draws 2).
- From the polish pass: `--text-kit-meta` is tabular (it carries counts);
  the dense row takes `scroll-margin-block` of the column-head band + 8 so
  j/k never park a row under the sticky heads; `Panel` sets
  `isolation: isolate` and `PanelBody` gets a `scrollKey` (back to top when
  another source opens); `KeyBar` and the Undo note share one fixed foot
  (36 + `env(safe-area-inset-bottom)`, no wrap) so swapping them moves
  nothing; `Button` takes 2px off the side that holds an icon or a key
  hint; `FilterMenu`'s "on" chip hovers on the control step, not the row
  grey, and its chevron turns while open; `SearchField` sm gets a hover
  step; `ViewSwitch` items press at 0.96. A truncated cell title shows the
  full title as a native hint only when it is cut and not already open in
  the detail.

## Rejected, and why

(For the owner: one line per layout not picked, so the question is not reopened in three weeks.)

- Three panes: the owner chose Table. The sources rail answers "what did
  I say in that call?", which the Layers view (grouped by source) already
  covers inside the table, at the cost of a third scroll region and no
  columns.
- Inline: the owner chose Table for the desktop. Inline stays as the
  narrow-screen fold, and layouts/table.tsx now does fold into it (see
  "Picked"). When /ideas is built, keep the rule on the page's own width,
  not the viewport.

## Not built, and why

- **A metrics dashboard** (tiles of counts, a chart of ideas per week). The
  owner's "dashboard" is read as a working surface; tiles are on the kit's
  Never list ("dark stat tiles") and vision.md's.
- **Bulk selection** (checkboxes, draft three at once). Draft spends a model
  call per idea; a bulk Draft needs the ceiling and cooldown AGENTS.md
  ("Money") asks for first.
- **Sorting by column.** Newest first is the only order the data supports
  well today; a sort control with one useful option is noise.

## The audit (why today's components read cheap)

Measured from components/kit and /prototypes/ideas, against the landing's
cards (components/showcase/demos/ideas-card.css, median-card.css,
channels-card.css). Also in the lab header (audit.ts).

| What | Today | Quality bar | Candidate |
| --- | --- | --- | --- |
| Flat type scale | everything 14/20; steps are 460→560 and small 12.5 | 13/560 titles, 11 mono meta, 12/600 group labels | 13/560 row title, 12 meta, 12 mono, 15/600 page name |
| Chrome eats the first screen | first idea ~290px down an 860 window (34%) | first row under the toolbar | first row at 110px |
| Tall rows, one fact | ListRow 44/60, hook + muted line, 6-row cap | median card rows 40, tabular number right | 36px rows, 5 columns |
| Hover/selected invisible | 1.07:1 / 1.12:1, no other cue | picked = grey + the only 560 title | grey + 3px ink bar |
| Every control floats | 36px pill, ring + fall, 14/560; 3 buttons = 3 shadows | small buttons, 32px chip at 12.5 | 28–32px; ghost secondary; ring-only filters |
| Objects, no panes | Card per region, 18 radius, 28×24 pad; no toolbar/table/filter pattern | one surface, 1px dividers | Panel + hairline (or raised detail) |
| Tags louder than facts | Tag 24px, 12.5 text, ring | "#212 · Story · Thread" as one muted line | shape as muted text column |
| Heavy icons | 16–18 @ stroke 2 beside 14 text | 14px icon in 28 tile | 16 @ 1.75 |
| Three left edges | 28 / 22 / 0 in one column | one edge per pane | 20 everywhere (8 + 12 on rows) |
| Prose leads as headings | "What I marked." +48px each | one 12/600 label | toolbar + 12px pane heading |

## Candidate components, and what each would replace in components/kit

| Candidate (parts/) | Would replace / extend |
| --- | --- |
| `Toolbar`, `ToolbarGroup`, `ToolbarDivider` | new; replaces KitPage's two-control header and the Stage lead on a workspace page |
| `WsButton` sm 28 / md 32, `ghost` | extends `Button` (size `sm`, variant `ghost`); replaces `TextButton` in toolbars |
| `KeyHint`, `KeyBar` | `KeyHint` extends `Kbd` (one key, 18px, on-ink); `KeyBar` new |
| `FilterMenu` | new, on the kit Menu's Base UI parts; replaces `Segmented` used as a filter; adds counts |
| `CompactSearch` | `SearchField` size `sm` (32) + flat surface + "/" hint |
| `ViewSwitch` | `Segmented` size `sm`, icon-only (Base UI ToggleGroup) |
| `IdeaTable` (ui-sdk Listbox) | new `DataList`; replaces `List` + `ListRow` on Ideas |
| `SourceCell`, `ShapeTag`, `Channels`, `Age`, `StatusPill` | `SourceMark` at meta size; `Tag` with a `look` prop; `StatusPill` new (folds LiveDot, the Checklist tick, failed) |
| `Panel`, `PanelHeader`, `PanelBody` | new; replaces Card + Stage + `KitPage width="wide"` for a split page |
| `SourceRail`, `SourceItem` | new; replaces the RiffCard-per-source list; GlyphTile at 28 not 36 |
| `MarkedUp` | replaces `RiffCard` + `AngleTabs` as the Ideas detail (needs `Angle.line`) |

## Found while building

- The lab imports `../ideas-lab/fixtures.ts` and `../ideas-lab/frames.tsx`.
  Delete the two labs together, or copy those files here first.
- Marked up still needs `Angle.line` and `note` from lib/adapt.ts
  (quincy-riffs.md, "Data gaps"); the lab's lines are fixtures.
- "Later" has no column in the schema. The lab keeps it in memory.
