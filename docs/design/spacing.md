# Spacing, Well, Rule, Skeleton, Avatar

Every gap in a kit page is a token. A page that writes `mt-3 px-3 py-2.5` is
guessing, and two guesses never agree. Layout utilities (`flex`, `gap-…`,
`pt-…`) are fine; their values come from this file.

## Between objects (set by the components)

| Token | px | Between | Set by |
| --- | --- | --- | --- |
| `kit-page-gutter` | 16 / 32 | screen edge and page (32 from 40rem) | KitPage |
| `kit-page-top` / `kit-page-bottom` | 64 / 96 | page top and floor | KitPage |
| `kit-page-gap` | 56 | title and Stage, Stage and Stage (the landing's line-to-picture gap) | KitPage |
| `kit-gutter` / `kit-gutter-sm` | 30 / 18 | a recess Stage's edge and its lead (18 on a stage < 28rem); 0 on the ground | Stage |
| `kit-lead-gap` | 28 | lead and object | Stage |
| `kit-stack` | 14 | stacked objects | Stage |
| `kit-pad` | 18 | object edge and content, on a phone | Card |
| `kit-pad-x` / `kit-pad-y` | 28 / 24 | object edge and content from 40rem, inside KitPage (the landing's held draft) | KitPage sets, Card reads |
| `kit-bleed` | 40 | how far a crop runs past the stage edge | Card |
| `kit-margin-gap` / `kit-margin` | 10 / 170 | object edge and margin note / the note column | MarginNote |
| `kit-row-inset` | 6 | object edge and its rows (12px row radius in the 18px object) | List, Menu, Select |
| `kit-sidebar` / `kit-shell-bar` / `kit-shell-pad` | 240 / 52 / 8 | the app frame (app-shell.md) | AppShell |

## A workspace's rhythm (2026-11-16)

Heights, not gaps, for a workspace (workspace.md). Set by the components;
a page never writes them.

| Token | px | What | Set by |
| --- | --- | --- | --- |
| `kit-bar` | 52 | the page row, the shell bar's height | `Toolbar size="bar"` |
| `kit-filter-bar` | 44 | the filter row: a 28 chip in 8 + 8 | `Toolbar size="filter"` |
| `kit-head` | 32 | DataList's column heads and a PanelHeader: one band, one hairline across every pane | `DataList`, `PanelHeader` |
| `kit-foot` | 36 | the KeyBar and the Undo note, the same height so swapping them moves nothing (plus the home indicator) | `KeyBar`, `FootBar` |
| `kit-row-dense` | 36 | a DataList row (44 on touch), 1px apart | `DataList` |
| `kit-head-clear` | 40 | a DataList row's scroll-margin under the head band (32 + 8) | `DataList` |
| `kit-selection-bar` | 3 | the ink bar at the open row's start | `DataList` |

One left edge, 20 (`kit-group`), in every region of a workspace: toolbars
pad 20; DataList rows are 8 inset + 12 padding. Containers:
`kit-data-wide` (46rem: DataList's `wide` columns appear),
`kit-toolbar-wrap` (40rem: a growing ToolbarGroup stops taking a row).

## Inside an object (you write these)

Four steps. Nothing else goes between kit content inside a Card. More air
than the lab: the object padding is the landing's 28 × 24 from 40rem.

| Token | px | Between |
| --- | --- | --- |
| `kit-tight` | 4 | a title and its own meta line (`Thursday` / `Mono 07:45`) |
| `kit-controls` | 6 | buttons side by side; Tags side by side |
| `kit-related` | 12 | blocks of one item: its text and its actions, a message and its button |
| `kit-group` | 20 | groups in one object: header and body, field and field in a form |

```
What sits between these two things?
 ├── A line and its own caption or meta     → gap-kit-tight
 ├── Two controls in a row                   → gap-kit-controls
 ├── An item's text and its buttons          → gap-kit-related (or pt-kit-related)
 ├── Two items in a list inside the object   → a Rule (12 above and below)
 └── Two groups (header, body, actions bar)  → gap-kit-group
```

```tsx
// Correct
<Card>
  <div className="flex flex-col gap-kit-group">
    <div className="flex flex-col gap-kit-tight"><Text as="h2" weight="strong">Voice note</Text><Mono>Today · 4:12</Mono></div>
    <Well as="blockquote"><Text>…</Text></Well>
    <div className="flex gap-kit-controls"><Button variant="action">Draft this</Button><Button>Edit</Button></div>
  </div>
</Card>

// Incorrect — guessed values, a different one every block
<div className="mt-3 flex gap-3"><div className="mt-4 px-3 py-2.5">…</div></div>
```

`kit-control-md` / `lg` (36 / 44) are control heights, not gaps.
`kit-control-xs` / `sm` (28 / 32, 2026-11-16) are for a workspace's toolbar
and foot only; a short list in a Card is still a 44px ListRow, a long one
worked by key a 36px DataList row. `kit-cta-md` / `lg` (16 / 22) are the
pill's side padding, set by Button (xs and sm pad 10 and 12).

## Well

A recess inside the object: the stage showing through. For the person's raw
material quoted back (`as="blockquote"`), a booked slot, an aside that is not
the object's own content. Use `shadow-kit-inset` on `bg-kit-object` instead
when the thing inside is a secondary object.

Props: `as` `div` (default) | `blockquote`, `children`. It is 12px radius
(`rounded-kit-control`: it floats inside a padded Card and is not
concentric with it, so it keeps the control radius), 12px side padding
(`kit-recess`), and stacks its children 4px apart (`kit-tight`).

```tsx
// Correct
<Well as="blockquote"><Text>So the call on Tuesday…</Text></Well>

// Incorrect — the well rebuilt by hand, with guessed radius and padding
<blockquote className="mt-3 rounded-lg bg-kit-well px-3 py-2.5">…</blockquote>
```

## Rule

A hairline across the object, edge to edge (it reaches past the Card's
padding), 12px above and below. Use it between the content and the actions,
and between items of a list inside a padded object (angles in a riff). Do
not put one between ListRows: rows separate by their own hover shape. A
section break with a name is a heading, not a Rule.

`<Rule label="or" />` is the divider between two ways to do one thing (Google
or the email form): a hairline either side of a small muted word, inside the
padding, with no margin of its own. Decorative; the controls name
themselves.

## Skeleton

Grey bars for content the viewer does not need to read, so the one thing that
matters stands alone. **It is not a loading state** (states.md).
`Skeleton width={…}` for one bar, `SkeletonLines widths={[…]}` for a
paragraph; vary the widths (`["88%", "72%", "80%"]`), because equal bars read
as a table.

## Avatar

`Avatar initials="C"` is a neutral 24px disc: no photo, no colour, no
invented face. Decorative, so it always sits beside the person's name.
