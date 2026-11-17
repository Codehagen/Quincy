# Type

Inter for everything, Caveat for Quincy's margin notes, system mono for times,
file names and counts. Inside a page, hierarchy is weight and grey: a heading
is body text at 560, not a bigger font. The one exception is the page's
`h1`, at 28px (`variant="title"`), after the landing's headlines.

## The scale

Closed. Nothing else exists; an unlisted size is a bug.

| Utility | Size / line | Weight | Used by |
| --- | --- | --- | --- |
| `text-kit-title` | 28 / 1.1, −0.04em | 600 | the page's one `h1` (`KitPage` renders it) |
| `text-kit-body` | 14 / 20, −0.006em | 460 | all copy, headings, button labels (the default) |
| `text-kit-small` | 12.5 / 18, −0.006em | 460 | dense rows, grids, the line under a figure |
| `text-kit-figure` | 18 / 22, −0.02em | 600, tabular | the number on its own line |
| `text-kit-mono` | 12 / 18, 0 | — | `Mono` only |
| `text-kit-hand` | Caveat 21 / 0.95, rotated −2° | 500 | `MarginNote`, `BeatBracket` only |

### The workspace steps (2026-11-16)

A workspace (workspace.md) reads one px denser than a Card page. These four
exist only there: never in a Card page, where body and small stay the scale.

| Utility | Size / line | Weight | Used by |
| --- | --- | --- | --- |
| `text-kit-heading` | 15 / 1.2, −0.012em | 600 | the page's name in a Toolbar (`ToolbarTitle`), in place of the 28px title |
| `text-kit-dense` | 13 / 19, −0.006em | 460 | a DataList row title (`DataListTitle`; 560 ink on the open row), an `xs`/`sm` control's label |
| `text-kit-meta` | 12 / 16, −0.003em | 460, tabular | column heads (560), the facts beside a title, a toolbar's count line, KeyBar words, `Tag look="text"`, `StatusMark` |
| `text-kit-mono-sm` | mono 11 / 16, 0 | —, tabular | ages and counts in a column (`DataListMono`), FilterMenu counts |

Meta carries counts, so every component that uses it adds `tabular-nums`;
a count that changes must not change width. Mono is a px under meta
because the system mono's x-height sits a step above Inter's.

**Icons beside 13px text are 16 at stroke 1.75** (`ICON_DENSE`), chevrons
14 at 1.75 (`ICON_DENSE_CHEVRON`). Stroke 2 reads bold next to 460 type at
13. Spread it: `<HugeiconsIcon icon={X} {...ICON_DENSE} aria-hidden />`.
Button `xs`/`sm`, SearchField `sm`, Segmented `xs`, FilterMenu and
StatusMark already do. Beside 14px body, icons stay 16–18 at 2.

Weights: `font-kit-regular` (460) and `font-kit-strong` (560). 600 lives only
inside `text-kit-figure` and `text-kit-title`. Inter is loaded variable, so 460 and 560 are real
instances, not rounded to 400 and 600.

Never below 12px for text a person reads (mono is the floor at 12; in a
workspace column, mono 11 for an age or a count). Caveat at
400 goes thin in grey at 21px, hence 500.

`<KitRoot>` sets Inter, 14/20 at 460, ink and `cv11 ss01` for the whole page,
so plain text inside it is already correct.

## Text

Use for every line of copy. Use `Muted` for a grey run inside a line of ink,
`Lead` for the "**Bold.** grey rest." pattern inside an object, `Mono` for a
time, a file name or a count.

Props: `variant` `body` (default) | `small` | `figure` | `title`; `weight` `regular`
(default) | `strong`; `tone` `ink` (default) | `muted`; `as` `p` (default) |
`span` | `div` | `h1` | `h2` | `h3` | `h4` | `li` | `dt` | `dd`. Nothing else exists.
There is no `faint` tone. `figure` and `title` take no `weight`. The page
title is `variant="title"` on the `h1`, once per page, and KitPage renders
it: never write it yourself (page.md).

```
What is this line?
 ├── A number that is the news ("31", "1.8×")  → variant="figure"
 ├── A heading or a label                      → weight="strong", body size
 ├── Metadata, the grey continuation, a caption → tone="muted"
 ├── A dense row or the line under a figure    → variant="small"
 └── Default                                   → <Text>
```

```tsx
// Correct — lab 21: the heading is strong at body size, the number is the figure
<Text as="span" weight="strong">Draft for X</Text>
<Text>Replies in the first week:</Text>
<Text variant="figure">31</Text>
<Text variant="small" tone="muted">Your median is 6.</Text>

// Incorrect — figure used as a heading. The figure means "this number is the news"
<Text variant="figure" as="h2">Drafts</Text>
```

## Lead and Muted

`Stage lead="…" rest="…"` renders its own lead; never put a `Lead` above a
Stage's object. Use `Lead` only for the same pattern inside an object, such as
an empty state (lab 38: `<Lead bold="Nothing to send today." rest="Tell me
about your week. I'll find the post in it." />`). The bold part is one
sentence.

## Mono, Code and Count

`Mono` is a tag on product content. `Code` is a code name in docs or help
prose (`kit-pad`, `crop="corner"`), on a well-coloured chip so it reads as an
instruction, not as part of the product. `Count` is a number that counts from
its last value to the new one (320ms, cubic out) when the person changed it;
it never counts on mount, snaps under reduced motion, and screen readers get
only the final value.

```
Is it a time, a day, a file name, a duration, a count in the product? → Mono
Is it a word Quincy filed the thing under ("Story", "Short post")? → Tag
Is it a token, prop or component name in prose about the kit? → Code
Is it a number that changes because of something the person did? → Count
```

Mono is for times and days, absolute or relative ("Thu 07:45", "Today",
"Yesterday", "2d"), file names, durations and counts. Muted by default;
`tone="ink"` when the time is the news ("Goes out <Mono tone="ink">Thu
07:45</Mono>"). `size="sm"` (`text-kit-mono-sm`) inside a dense block or a
feed row, as Lineup's times are. A day inside a sentence of prose ("Dismissed the note from
today.") is just a word, not Mono.

`Count` takes the size of the text around it: inside `Text variant="figure"`
when the number is the news, or inline in a sentence ("<Count value={3} />
angles waiting.") in body or small text. Either way it never counts on mount.

## Tag

A word Quincy filed something under: the kind and shape of an angle, a
source. `<Tags><Tag>Story</Tag><Tag>Short post</Tag></Tags>`: one value per
Tag, muted small text in a hairline ring (`shadow-kit-inset`), 8px radius, 24px
tall, Tags 6px apart.

`look` `chip` (default, the above) | `text`: muted 12px meta text with no
ring, for a fact in a named column (DataList's Shape) or a dense row's meta
line. A ring on twenty rows is twenty objects louder than the titles. Not
pressable, not a filter (Segmented), not a status (StatusMark, Checklist), and
never more than three on one item. A sentence about the item ("writes 2
posts, for LinkedIn") is `Text variant="small" tone="muted"`, not a Tag.

```tsx
// Correct
<Mono>walk-tuesday.m4a · 4:12</Mono>

// Incorrect — words are not a tag
<Mono>Draft for X</Mono>
```

Display type (`text-kit-display-*`) is for marketing pages only
(marketing.md). Never in an app page.

## Never

- `text-[…]`, `font-[…]`, `tracking-…` or `leading-…` in kit code. The scale
  carries its own line height and tracking.
- A workspace step (`dense`, `meta`, `mono-sm`, `heading`) in a Card page.
- `font-bold` / `font-semibold`. They are 700 / 600 and skip the 560 step.
- Caveat for anything that is not Quincy's note. It is a pen, not a typeface.
- Size for hierarchy inside a page. Two Text sizes on one card is the limit (body + figure,
  or body + small). Count the `variant`s of Text, Lead and Tag (Tag is
  small). Mono does not count: it is a tag face with one job, not a step in
  the hierarchy.
