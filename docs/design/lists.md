# Lists, rows, FileChip and SourceMark

List is the object rows sit in; ListRow, NavRow and FileChip share the
control surface with IconButton (menus.md). Where the open item goes is in
page.md, "List and detail".

## List

The white object for rows: a Card padded 6px (`kit-row-inset`), so the 12px
row radius nests in the 18px object (inner = outer − padding). Use it for
every Card of ListRows or NavRows. Props: Card's `crop` and `width`, plus
`children` (the rows, and a ListHeading before each group). Rows stack 4px apart with
no Rule; their hover shape separates them.

```tsx
// Correct
<List width="with-margin">
  <ListRow selected onClick={…}>Nobody reads the pricing page</ListRow>
  <ListRow onClick={…}>The hire who asked for the worst call</ListRow>
</List>

// Incorrect — the padding guessed by hand, once per screen
<Card inset="none"><div className="flex flex-col p-1.5">…rows…</div></Card>
```

`kit-row-inset` is the same 6px the Menu and Select panels use. A screen
never writes it: List does.

### ListHeading

A small muted label over a group of rows, aligned with the row titles: the
day in a list ordered by time ("Today", "Yesterday"), or a group name.

```
Do the rows need headings?
 ├── The rows span one day or one group      → no heading. "Today" over every row says nothing
 ├── Ordered by time, across several days    → a ListHeading per day; the row's meta drops the date
 └── Grouped by kind (Waiting / Drafted)     → a ListHeading per group, only when both groups have rows
```

Props: `children` (a string: the day or group, no count), `as` `h2`
(default) | `h3` (when the List already sits under an `h2`). It is not a
row: it does not press, it does not take focus, and it does not count
toward the 6-row cap in list and detail. Never a Rule between groups: the
heading is the break.

```tsx
<List width="with-margin">
  <ListHeading>Today</ListHeading>
  <ListRow …>Nobody reads the pricing page</ListRow>
  <ListHeading>Yesterday</ListHeading>
  <ListRow …>The hire who asked for the worst call</ListRow>
</List>
```

## ListRow and NavRow

One row look, after the landing's idea rows: 44px minimum, 16px side
inset, quiet grey hover, and picked or current in the selected grey with
ink, never blue. Rows sit in a `List`.

- **ListRow** — a button that opens the thing it names (a riff, a person).
  `children` (title), `description`, `leading` (an `Avatar`, a `LiveDot`),
  `meta` (usually `Mono`), `selected` (the row whose detail is showing;
  `"visual"` draws the grey without `aria-current`, for a trigger whose
  state is said elsewhere, such as the shell's account row),
  `titleLines` `1` (default, truncates) | `2` (wraps, clamps at two: for a
  title that is a sentence, such as a hook, which one line on a phone cuts
  to three words). A row never holds a Button; its verbs live in the detail
  (page.md, "List and detail").
- **NavRow** — a Next.js `Link` that goes to a page (sidebar, settings).
  `href`, `children` (string), `icon`, `leading` (in place of `icon`: a
  GlyphTile, an Avatar), `description` (a muted second line), `meta`
  (right-aligned, usually `Mono`), `current` (`aria-current="page"`),
  `count` (mono, omitted at zero), `waiting` (an ink dot and ", 2 waiting"
  in the row's name; never beside `count`), `density` `row` (default, 44px)
  | `compact` (36px under a fine pointer, 44px on touch: the sidebar,
  app-shell.md).

A row that navigates is a NavRow, never a ListRow with a router push.

A row that holds its own control (a Switch, Manage, Connect, a panel that
opens under it) is neither: a link or a button cannot hold another control.
/sources, /channels and /rhythm build those rows by hand in a Card, starting
with a `GlyphTile`.

## GlyphTile

The 36px tile at the start of a row that names where material comes from or
where writing goes (/sources, /channels): control radius, control ring, the
glyph in ink. Props: `label` (required; its first letter is the fallback),
`mark` (a brand glyph node, such as `PlatformMark`, preferred), `icon` (a
hugeicon for a kind of material), `quiet` (inset ring, muted glyph: nothing
can connect it yet). Monochrome always, aria-hidden: the row's name says
what it is. `SourceGlyph` (components/sources) is GlyphTile plus the source
id to mark map.

## FileChip

Raw material the person handed over: `walk-tuesday.m4a · 4:12`. `name` (mono,
truncates before the extension), `meta` (a duration or size), `onRemove`
(adds a round ×, named "Remove <name>"). Never for a title or a tag: those are
words, so `Text`.

`onRemove` only when removing the chip loses nothing: the file is still on
the person's device and they can attach it again. A take recorded on the
page is the only copy of their voice, so its chip has no ×; the removal is
a HoldButton beside it ("Throw it away"). One removal per thing, never both
(removing.md).

## SourceMark

The place something came from, on one muted small line: the source's glyph,
its name, then when in mono. Use it on every card and row that came from
somewhere (a draft, a scheduled post, an idea, a source). Use FileChip for
the file the person handed over, and Mono alone for a time with no source.

Props: `id` (a source id from lib/sources.ts, a channel id, or `""` for typed
material, `TYPED_SOURCE` in lib/riffs.ts), `label`, `when`, `meta`.

```
Which glyph?
 ├── The id names a vendor or format with a mark (x, github, slack, rss) → its PlatformMark
 ├── It names a kind of material (voice, email, photos)                → a hugeicon
 ├── It is typed material (id "")                                      → a pen, "Written here"
 └── Neither                                                           → the name alone
```

- Monochrome, in the text's grey. A brand palette per row turns a list into
  a wall of logos. The glyph is decorative; the name carries it.
- Not a Tag (a word Quincy filed it under), not a button, never a colour.
- Replaces `components/sources/source-mark.tsx` (a 36px tile) and
  `PlatformMark` beside a label, page by page as each moves to the kit.

```tsx
// Correct
<SourceMark id="voice" label="Voice note" when="Today" meta="4:12" />

// Incorrect — a tile and a brand colour, and the time as words
<div className="size-9 bg-kit-well"><PlatformMark platform="x" size={16} /></div><Text>today</Text>
```
