# Colour

Everything is neutral except a few jobs. Each job has one colour, and no
colour does two jobs. The one action on a view is **ink**, not a hue: the
landing's call to action is an ink pill, and the app follows the landing
(2026-11-16). If a colour on the page is not doing one of the jobs below, it
is decoration, and the kit has no decoration.

| Job | Utility | Where it appears | Never |
| --- | --- | --- | --- |
| primary | `bg-kit-primary`, `text-kit-primary-on` (via `Button variant="action"`) | the one action on a view; the picked segment's thumb; an on switch; a slider's fill | a second action, a heading, a link |
| selected | `bg-kit-selected` (the well grey) | a picked ListRow or NavRow, a highlighted Menu or Select row | blue, a tint, a ring |
| highlight | `kit-highlight` (via `Highlight`) | under the one sentence that matters | a heading, a surface you press, two sentences |
| pen | `text-kit-pen` (via `BeatBracket`) | the beat labels and their brackets: **the only blue in the app** | body text, links, icons, buttons, selection |
| live | `LiveDot` (the only consumer of `--kit-live`) | an 8px dot beside its label: "this is running" | a pill, a fill, text |
| danger | `text-kit-danger` (via `Button variant="danger"`, `HoldButton`) | the label of a destructive action; `kit-danger-tint` only as HoldButton's sweep | a red fill at rest, an error banner, a refusal (states.md) |

`kit-success` (a filled check circle) is the live green, because both mean
"this is fine, it is happening". Only Checklist paints it (controls.md).

**`--kit-action` is legacy.** The blue (`--kit-action`, `-hover`, `-on`,
`-tint`, `-ink`) is still defined because the showcase pictures paint
Approve with it (`components/showcase/theme.css`). No kit control reads it.
It goes when the pictures are rebuilt from real components (plans/029,
2026-11-16 revision). Never use it in new code.

## What background do I use

```
Is it the page?
 ├── Yes → nothing. <KitRoot> already paints bg-kit-ground. Never set it again.
 └── No
      ├── The white thing a section shows?            → <Card>/<Window>/<List> (bg-kit-object)
      ├── A picture of the product, cropped at its foot? → <Stage backdrop="recess"> (bg-kit-stage)
      ├── A recess inside the object (a quote, a slot)? → <Well> (bg-kit-well)
      ├── A pressable white control?                  → bg-kit-control, hover bg-kit-control-hover
      ├── The one action on the view?                 → <Button variant="action"> (ink)
      ├── The picked row in a list or menu?           → bg-kit-selected (ListRow, NavRow do it)
      └── Anything else                               → no background
```

The grey stage is not a page background. It is a recess inside an object or
a frame for a picture, never the default behind a section (surfaces.md).

## What text colour do I use

```
Is the text on the ink fill?           → text-kit-primary-on (Button, Segmented, Tabs do it)
Is it a beat label or margin note?     → BeatBracket / MarginNote. Never write text-kit-pen yourself.
Is it a destructive action's label?    → <Button variant="danger">
Is it the grey continuation, metadata, a caption, a time?
 └── Yes → text-kit-ink-muted (<Muted>, tone="muted", <Mono>)
Default → text-kit-ink
```

There is no faint text. `--kit-ink-faint` is 2.4:1, so it has no `text-`
utility: `text-kit-ink-faint` does not exist, and `Text` has no `faint`
tone. Reach the colour only through `bg-kit-mark`, `border-kit-mark`,
`stroke-kit-mark` or `fill-kit-mark`, for marks.

## Non-text marks

| Utility | For | Contrast |
| --- | --- | --- |
| `bg-/border-/stroke-/fill-kit-mark` | ticks, a dot beside a label (`--kit-ink-faint`) | 2.4:1, so never the only carrier of meaning |
| `kit-hairline` | dividers, the window chrome rule, the sidebar edge | an ink alpha: reads the same on object and well |
| `kit-skeleton` | `Skeleton` bars | ink alpha |
| `kit-chrome` | the window's three dots | ink alpha |
| `kit-track` | switch off-track, empty slider (never the check ring) | 1.31:1 vs white: pair state with position or a label |
| `kit-check-ring` | the empty Checklist circle (via `shadow-kit-unchecked`) | muted ink: 5.28 object light, 6.72 object dark (WCAG 1.4.11 needs 3:1) |
| `kit-knob-on` | an on switch's knob | white on ink 18.9 light; dark ground on light ink 16.9 dark |
| `kit-row-hover` | hover on an unselected ListRow, NavRow or DataList row; a ghost Button's hover | one step short of selected in both themes (see Rows below); a selected row keeps selected on hover |
| `kit-grid-line` | `Stage backdrop="grid"` | ink alpha |
| `kit-focus` | keyboard focus outline | ink, so it reads on every surface |
| `kit-link-line` | TextLink's underline: the text's own colour at 40% | the text beside it carries the contrast |
| `kit-scrim` | behind the phone's sidebar sheet only (app-shell.md) | ink alpha |

## Rows: hover, selected, the ink bar

Selected must out-rank hover in both themes, or a hovered row reads as the
picked one. Until 2026-11-16 dark mode had it backwards (hover went up to
0.32 while selected went down into the well, 0.155, below the ground);
the workspace lab caught it, and both now go up from the ground:

| | Light | Dark (on the 0.178 ground) |
| --- | --- | --- |
| `kit-row-hover` | gray-975 (1.07:1 vs white) | mix of object and ground, ~0.206 (1.06:1 vs ground) |
| `kit-selected` | gray-961, the well (1.12:1 vs white) | gray-300, the hairline grey (1.38:1 vs ground, 1.31:1 vs hover) |
| ink / muted on selected | 16.9 / 4.71 | 12.2 / 5.50 |
| ink / muted on hover | — / 4.91 | 15.9 / 7.20 |

On a dark object (0.235: a menu panel, a List in a Card) hover reads as a
slight recess (1.07:1) and selected still lifts (1.22:1). Because the grey
alone is ~1.1:1, a DataList's open row also sets its title at 560 in ink
(the rest of the row stays muted). Not a shadow: a lifted row says "raised
object", and a row is not one.

- **Never a side stripe on a selected row, block, card or chip.** No ink
  bar at the start (the old `SELECTION_BAR`, `kit-selection-bar`). A
  selected row is `kit-selected` plus its title at 560 in ink; a selected
  object (a calendar block, a card, a chip) is `kit-selected` plus a 1px ink
  ring all round.
  Why: the owner asked for it to go, first on a calendar block and then on
  rows too; a coloured bar on one edge is a stock "selected" marker.
  <!-- 2026-11-17: "på calender kan du også fjerne det helt til venstre?" … "Sidestreken kan du også fjerne fra rader." -->
  Check: ESLint `quincy-design/no-side-stripe` (README › Checks).

## Contrast (WCAG 2, against the surface the text paints on)

| Pair | Light | Dark |
| --- | --- | --- |
| ink on ground / stage / object | 18.6 / 16.9 / 18.9 | 16.9 / 17.5 / 14.9 |
| ink-muted on ground / stage / object | 5.19 / 4.71 / 5.28 | 7.61 / 7.88 / 6.72 |
| primary-on on primary (the ink pill) | 18.6 | 16.9 |
| ink on highlight | 14.5 | 8.19 |
| pen on stage / ground | 4.66 / 5.14 | 7.81 (stage), 6.66 (object) |
| danger on ground / stage / object | 5.31 / 4.83 / 5.41 | — / 6.78 / 5.79 |
| danger on danger-tint (HoldButton mid-hold) | 4.71 | 4.85 |
| live dot on ground (decorative: its label carries the meaning) | 3.09 | — |
| success-on check on success | 3.14 | 8.08 |

The figures are the comments in the kit section of `app/globals.css`; that
file is the source. Every text pair is ≥ 4.5:1 because kit text is 14px,
never "large". If a new pair fails: move L only. Hue and chroma carry the
colour's identity.

## Hover on a fill

Hover and disabled on the ink fill are `--kit-primary-hover` and
`--kit-primary-disabled`: ink mixed toward the ground (14% and 30%), never an
alpha. An alpha on a near-black fill moves it toward the page and reads as
disabled; a mix toward the ground flips with the mode. The marketing pill
uses the same mixes (`--kit-ink-hover`, `--kit-ink-disabled`).

## Dark mode

`.dark` (next-themes, `attribute="class"`) re-points every semantic token at
another step of the same primitives. It never introduces a colour. The object
stays the brightest surface (object 0.235 > ground 0.178 > stage 0.155), the
ink pill becomes a light pill with the dark ground as its label, and every
elevation collapses to one white ring. Components use only semantic
utilities, so they need no `dark:` variants. A `dark:` class in a kit
component means a token is missing.

```tsx
// Correct — the heading is ink at weight 560; the ink fill is only on Approve
<Text as="h2" weight="strong">Thursday</Text>
<Button variant="action" icon={Tick02Icon}>Approve</Button>

// Incorrect — blue on a control: blue is the pen, and the pen is Quincy's hand
<Button className="bg-kit-action">Approve</Button>
```
