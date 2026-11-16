# Workspace: Toolbar, DataList, Panel, KeyBar, FilterMenu, StatusPill

A workspace is a page you work through, not a page you read: a toolbar, a
dense list with columns, and the open item in a pane beside it. Ideas is
the first one (components/riffs/ideas-workspace.tsx; decisions.md, "Ideas
is a working surface — Table", 2026-11-16). It has no L: nothing in the
data can hold "later", so the key and the filter wait for a column. It is **not a dashboard**: no tiles, no charts, no totals. The
one number on the page is stated against the person's own week ("you
usually draft 4"), as everywhere (README.md, Copy).

Promoted from `/prototypes/workspace-lab` (DECISION.md there has the
numbers and the rejected layouts). Live: `/prototypes/kit#toolbar`,
`#data-list`, `#panel`.

## When is a page a workspace

```
Is the page a queue the person works through, daily, item by item?
 ├── No (a settings page, a draft to read, a week to plan) → KitPage + Stages (page.md)
 └── Yes
      ├── Under ~20 items, read more than worked     → KitPage, List + ListRow (lists.md)
      └── Many items, scanned by a column (source, shape, age), worked by key
           → a workspace: Toolbar(s) + Panels + DataList + KeyBar
```

A workspace replaces KitPage for that page, whole (README.md: a page moves
whole). It has no 28px title and no Stage leads: the page's name is a
`ToolbarTitle` and the first row of work sits under the toolbar.

## The frame

```
┌ Toolbar size="bar" divided={false} ─ ToolbarTitle · meta ……… search · Button sm ┐ 52
├ Toolbar size="filter" ─ FilterMenu FilterMenu Clear ……………… count · Segmented xs ┤ 44
├ Panel ─────────────────────────────────┬ Panel width=… edge="start" ───────────┤
│ DataList head band ……………………………… 32 │ PanelHeader (the open item's source) 32 │
│ rows 36                                │ PanelBody label=… scrollKey=…          │
├────────────────────────────────────────┴───────────────────────────────────────┤
└ KeyBar, or a FootBar with the Undo note …………………………………………………………………… 36 ┘
```

- **One left edge**, 20 (`kit-group`), in every region: toolbars pad 20;
  DataList rows are 8 inset + 12 padding.
- **One band per height**: the page row and the filter row read as one
  band with one hairline under both (the first Toolbar is
  `divided={false}`); the DataList head and every PanelHeader are the same
  32px band, so one hairline runs across all panes.
- **The foot never moves the panes**: KeyBar and the Undo note are both a
  `FootBar`, exactly 36 plus the home indicator.
- The frame is `WorkspacePage` (page.md, "Workspace"): full bleed and full
  height under the shell, with the Announcer, `data-letter-keys` and the
  `kit-workspace` size container on its root. The panes sit in
  `WorkspacePanes`.

Heights are tokens (spacing.md): `kit-bar` 52, `kit-filter-bar` 44,
`kit-head` 32, `kit-foot` 36, `kit-row-dense` 36.

## Toolbar, ToolbarGroup, ToolbarDivider, ToolbarTitle

`Toolbar` — `label` (required, its group name), `size` `bar` (52, default)
| `filter` (44), `divided` (hairline under it, default true). A labelled
`role="group"`, **not** `role="toolbar"`: it holds a search field and
menus, and the toolbar pattern's arrow-key roving would fight the field's
caret. Tab order is the reading order. It wraps on a narrow page; it never
scrolls sideways.

`ToolbarGroup` — `end` (to the row's end), `grow` (takes the whole row it
wraps to under a 40rem toolbar: a search beside its button). Controls in a
group are 6 apart (`kit-controls`). `ToolbarDivider` — a 16px hairline
between groups. `ToolbarTitle` — the page's name, 15/600, `as` `h1`
(default) | `h2`.

What goes in a toolbar: `Button size="sm"` (32) or `"xs"` (28),
`variant="ghost"` for every control but one; `SearchField size="sm"
shortcut="/"`; `FilterMenu`; `Segmented size="xs"`. The ink action is not
in the toolbar: it belongs to the open item (actions.md), so "Record a
thought" is quiet there.

## FilterMenu

`label`, `value`, `options` (`{ value, label, count }[]`, the first one
"any": the filter off), `onValueChange`, `icon`. On Base UI's Menu. A 28px
chip: muted with the inset ring while off, a white chip with the picked
value while on. Each option shows how many rows it would leave, with the
other filters as they are; a 0 is disabled, so a dead end shows before you
pick it. Once any filter is on, a ghost `Clear` follows the chips.

A choice of two values with no counts is still a `Segmented`.

## DataList

On ui-sdk's Listbox (Base UI has no always-visible listbox). One tab stop,
↑ ↓ Home End, typeahead on each row's `getLabel`, selection follows focus.

```tsx
<DataList
  label="Ideas"
  aria-keyshortcuts="j k d n l u"
  items={shown}               // or groups={[{ key, name, label, items }]}
  getKey={(r) => r.id}
  getLabel={(r) => r.title}
  value={openId}
  onValueChange={setOpenId}
  columns={COLUMNS}           // or renderRow + template, for two-line rows
  status={loading ? "loading" : "ready"}
  loadingLabel="Loading ideas"
  empty={<DataListEmpty title="No ideas match." action={<Button size="xs" onClick={clear}>Clear filters</Button>}>Clear a filter.</DataListEmpty>}
/>
```

A column is `{ id, header, width, cell, align?, wide?, skeleton? }`.
`width` is a grid track; exactly one is `minmax(0,1fr)` (the title).
`wide` columns appear only once the list is 46rem wide
(`kit-data-wide`), with their head. `align="end"` for ages and counts.

Cells: `DataListTitle` (13/19; the open row's title alone goes to 560 ink;
`quiet` for a done row; the full title as a hint only when cut and not
open), `DataListMeta` (12 muted), `DataListMono` (11 mono tabular),
`Tag look="text"`, `StatusPill`, a glyph with `{...ICON_DENSE}`. A cell
that is only a glyph says its words in an `sr-only` span.

What it does for you: rows 36 (44 on touch), 1px apart; hover
`kit-row-hover`, pressed and selected `kit-selected`, plus the 3px ink bar
(colour.md, "Rows"); the sticky head band, hidden from assistive tech
(each row reads as one sentence); `scroll-margin` of the head band + 8,
so a row moved into view never parks under the heads; one persistent
`role="status"` that says `loadingLabel`; loading as eight static skeleton
rows on the same grid (no shimmer, so no motion path); `empty` under the
heads, which stay, centred in the space below them (an `EmptyRegion`;
states.md, "Empty"). Pass the empty state bare, with no padding of its own.
When its action clears the filters, call `focusRestoredDataList()` after
it: the button goes away with the empty state, and focus lands on the open
row, or the first row, it brought back.

A listbox, not a grid: a row is one choice (open this item) and holds no
control. Its verbs live in the open item's pane, as ListRow's do.

### Keys: the list's and the page's

The list owns ↑ ↓ Home End and typeahead. Letters that act on the open row
(j k to move, D to draft, N, L, U, / to search) are the **page's**:

- **`useLetterKeys`** does this part: **one document listener in the
  capture phase**, and a handled key calls `preventDefault()` and
  `stopPropagation()`. A key that spends or removes takes `{ once: true }`,
  so a held D is one Draft. Otherwise, with focus on a
  row, the typeahead takes N as the first letter of a title and moves
  before the action runs. Ignore keys in a field, with a modifier, or
  inside an open menu (`[role="menu"]`).
- **`data-letter-keys` on the workspace root.** The app's bare D (theme,
  `components/theme-provider.tsx`) stands down inside it.
- **Focus after an action.** An action that removes the focused row or the
  pressed button (drafted, set aside, put off) opens the next row and
  calls `revealDataListRow(nextKey, scope, { recover: true })`, so focus
  lands on the new open row instead of the body. A plain j/k move calls it
  without `recover`: it follows with focus only when focus was already on
  a row.
- **Say the keys where they act**: `aria-keyshortcuts` on the DataList
  (`"j k d n l u"`), `SearchField shortcut="/"`, `Button shortcut="U"`.
  The KeyBar is the summary, not the only place.
- Keep the selection when a filter hides the open row (the pane keeps
  showing what you were reading); drop it only when the row is gone.

`DATA_LIST_ROW` is the row selector; each row is `[data-kit-row="<key>"]`.

## Panel, PanelHeader, PanelBody

`Panel` — `label` (required: every pane is a region), `width` (a CSS
width for the fixed pane, e.g. `clamp(440px, 36cqi, 560px)`; without it
the pane takes what is left), `edge` `none` (default) | `start` (the
hairline before every pane after the first). Panes are regions of one
surface: the line between them is a border, because it separates; never a
Card per pane, never a shadow. Each Panel is `isolation: isolate`, so its
sticky strip (z 1) ranks only inside it and never climbs over a menu, a
tooltip or the foot.

`PanelHeader` — `children`, `end`. The 32px sticky strip with a hairline,
muted meta text on the 20 edge: the open item's source and age.

`PanelBody` — `label` (name it when it holds no focusable content of its
own: it becomes a tab stop, with the focus ring drawn inside), `scrollKey`
(when it changes, the pane goes back to its top before paint). Each body
scrolls on its own, `overscroll-contain`.

The fixed pane's width is a share of the **workspace**, in `cqi` on a
container around the panes, never `vw`: the sidebar is not the page's.
Under the fold (a workspace under ~900px, or where the title column would
drop under 320px) the page folds to one column whose rows open in place
(components/riffs/ideas-workspace.tsx, `shouldFold`). Fold on the page's own
width, never the viewport.

## KeyBar and FootBar

`KeyBar` — `keys` (`{ keys: string[], label }[]`: `{ keys: ["j", "k"],
label: "Move" }`). 18px caps and a muted word each, along the foot.
Hidden on touch, where there are no keys. A `role="note"` named "Keyboard
shortcuts"; each entry reads "j or k: Move", the caps hidden.

`FootBar` — the 36px foot itself: `children`, `hideOnTouch`. The Undo note
after a set-aside is a FootBar with the sentence and a `Button size="xs"
variant="ghost" shortcut="U"`, in the KeyBar's place while it lasts, so
nothing moves. Nothing in a FootBar wraps; the last hints clip.

## StatusPill

`status` `reading` | `drafted` | `later` | `failed`, `children` (the word,
when the default does not fit), `hideWord` (word to assistive tech only).
A mark and a word in muted meta text, no fill, no ring. `reading` is the
pulsing LiveDot, the only live thing on a row; `failed` is the alert glyph
in muted ink, not red (nothing was destroyed). Waiting is the default and
has no pill: render nothing.

## Announcer

`<Announcer>` around the workspace, `useAnnounce()` inside it. **One**
`role="status"` for the whole surface, mounted with it and never
remounted: a status node that arrives with its text in it is often not
read. Every message changes this node's text: the count after a search
(once the typing stops, ~500ms, not on every key), "Set aside “…”. Press U
to undo.", a recorder's state. Never mount a `role="status"` per message.

## Touch and motion

- Every control keeps a 44px hit area on a coarse pointer (Button, the
  FilterMenu chip, the Segmented items); DataList rows grow to 44.
- Key caps and the KeyBar hide on touch; the actions they name are buttons
  in the open item's pane.
- No `transition-all`: each component names its properties. Presses scale
  to `--kit-press-scale`, except a DataList row (a full-width row that
  shrinks reads as the list moving). Every transition has
  `motion-reduce:transition-none`; the LiveDot drops its ring; skeletons do
  not move.

## Never

- A metrics dashboard: tiles of counts, a chart of items per week, a bare
  total (decisions.md, Never).
- A Card per pane, or a shadow between panes.
- `role="grid"` for a list whose rows hold no controls; a Button inside a
  DataList row.
- Letter keys handled in the bubble phase, or on the list itself.
- Bulk selection that spends (draft three at once) before it has a ceiling
  and a cooldown (AGENTS.md, Money).
- Sorting by column with one useful order. Newest first until the data
  supports another.
