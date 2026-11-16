# Round-2 kit

One kit for all four groups: `import { … } from "../kit"`. It is the seed of
the design system, so blocks are named by role and take a closed set of props.
If a piece needs something the kit cannot say, add it here and to this file.
Do not style around it.

Values live in `tokens.ts`. Lengths are design pixels on a 560px frame,
emitted through `u(n)`. Use `u()` for every length you write yourself.

## Units and scaling

`Stage` sets `--k2-u = max(0.714px, 100cqw / 560)`. It is a registered
`@property` length, so a nested container cannot re-resolve it. One design
pixel is 1px at 560 wide and 0.64px at 360. The floor keeps body text at 10px
or larger. Below a frame width of about 390px, the picture grows past the right
and bottom edges and does not shrink. So anchor objects top-left, and never put
anything essential against the right or bottom edge.

```tsx
<div style={{ height: u(42), gap: u(12) }} />   // right
<div style={{ height: 42, gap: "2.1cqw" }} />    // wrong: two scaling systems
```

## Tokens

| Token | Value | Why |
| --- | --- | --- |
| `color.stage` | `#F2F2F1` | All four kits agreed. |
| `color.surface` | `#FFFFFF` | The one white object. |
| `color.ink` | `#111111` | All four kits agreed. |
| `color.muted` | `rgba(18,18,18,.48)` | b, c and d agreed (a used .46). **3.3:1. Fails AA for body text. Kept because it is the kept look. Open question.** |
| `color.faint` | `rgba(18,18,18,.30)` | Only for text you could delete (times, addresses). 2:1. |
| `color.graphite` | `rgba(18,18,18,.62)` | Margin-note hand, from b and c. Not ink, because ink is the person's own words. 5.2:1. |
| `color.skeleton` | `rgba(18,18,18,.075)` | The median of a, c and d. An alpha, so it works on white and in a well. |
| `color.hairline` | `rgba(18,18,18,.06)` | Dividers and the chrome rule, from b and c. |
| `color.well` | `#F2F2F1` | A recess in a card (a booked slot), from 19: the stage showing through. |
| `color.highlight` | `oklch(.91 .165 99)` | 01's yellow, a little cooler than 13's `#FFD43B`. Not an accent. It is the highlighter's material. |
| `accent.blue` | `oklch(.55 .232 262)` | 07's Approve hue and chroma with L .577→.55 (5.1:1 under white text). The pen in 02 (L .53) uses the same blue, so it counts as one accent. |
| `accent.red` | `oklch(.59 .209 25.3)` | 17, with L moved for 4.5:1. 08's vermilion folds into this. |
| `accent.green` | `oklch(.54 .115 162)` | 19. At L .54 the old chroma falls outside sRGB, so chroma drops to the gamut ceiling. |
| `elevation.object` | ring .06 + `0 1px 2px .04` + `0 10px 28px -10px .12` | a, b and c had this stack. d's lift (`0 6px 16px -4px .06`) was the odd one out. |
| `elevation.lifted` | ring .08 + `0 12px 28px -8px .28` | An object in the hand (08 mid-drag). |
| `radius.object` / `control` / `chip` | 12 / 8 / 6 | c and d measured 12 (a and b came to 13.4). Buttons and cells take 8 (07), chips 6 (19). |
| `space.gutter` | 30 | Stage edge to lead, from a (30) and b (31/29). |
| `space.leadMeasure` | 340 | The four leads were 322 to 370 wide. |
| `space.leadToObject` | 28 | b and d both landed at 27 to 29. |
| `space.objectPad` | 18 | a and b (c 16/20, d 15 to 17). |
| `space.bleed` | 40 | How far a cropped object runs past the edge, from a. |
| `type.body` | 14 / 1.43, 460, −0.006em, `cv11 ss01` | Every kit. |
| `type.strongWeight` | 560 | a, b and d (c 580). |
| `type.small` | 12.5 / 18 | c, for dense rows. |
| `type.figure` | 18 / 22, 600, −0.02em, tabular | 02's number on its own line. |
| `type.mono` | 12, system mono, tabular | a and c used ~10.5, b and d ~12.5. At 10.5 it is 6.7px on a 360 frame. |
| `type.hand` | Caveat 21 / .95, 500, −2° | 01, 02 and 05. Weight 500 (from c) because 400 goes thin in graphite on small frames. |
| `motion.press` | 140ms | d's `:active`, over 07's 120. |
| `motion.state` | 200ms | Dim, tab swap and hover colour, from 02 and 13. |
| `motion.enter` | 320ms | Something arrives. d 320, a 360, 05 420. |
| `motion.travel` | 520ms | Crossing the surface (07's draft into its slot). |
| `motion.sweep` / `noteDelay` | 700 / 620ms | 01: the note writes in as the sweep finishes. |
| `motion.easeOut` | `cubic-bezier(.2,.8,.2,1)` | The shared shape of every kit's out curve. |
| `motion.easeMove` | `cubic-bezier(.45,0,.2,1)` | Travel. Slow start, soft landing (08). |

## Blocks

### Stage
The grey frame. Owns the unit, the fonts, the accent and the lead. One per piece.
Props: `lead`, `rest?`, `accent?: "blue" | "red" | "green"`, `label?`, `children`.

```tsx
<Stage lead="Quincy drafts, you send." rest="Nothing goes out until you press Approve.">
  <Card>…</Card>
</Stage>
```
✗ `<Stage lead="Approve">` plus a second accent hard-coded inside: one accent per piece, and the Stage sets it.

### Card
The white object. It sits under the lead and is cropped by the stage. Props: `crop?: "bottom" | "corner" | "none"`
(default `bottom`), `width?` (design px), `inset?: "normal" | "none"`, `ref?`.
Give it a `width` when something sits beside it (margin notes need ~180 px of stage).

```tsx
<Card width={330}>…</Card>            // room for the margin
```
✗ Two Cards side by side on one stage: split stages were discarded. Stacking a small object above the main one (17) is fine. Only the last one crops.

### Window
A Card with chrome: three dots and a mono address. At most once per piece. Nesting a Window inside a Window throws an error.
Props: `address`, `crop?`, `width?`, `ref?`.

```tsx
<Window address="hirequincy.com/lineup" crop="corner">…</Window>
```
✗ A Window with nothing in it, waiting for an animation (06 was discarded).

### Lead
"**Bold lead.** grey continuation." Stage renders its own lead. Use `Lead` directly only for the same
pattern inside an object, for example an empty state. Props: `bold`, `rest?`.

### Text, Muted
`Text` is all copy. Props: `size?: "body" | "small" | "figure"`, `tone?: "ink" | "muted" | "faint"`,
`weight?: "regular" | "strong"`, `as?`. `Muted` is the inline grey continuation.

```tsx
<Text>Deploys went from</Text>
<Text size="figure">11 min → 2:40</Text>
```
✗ `size="figure"` for a heading. Headings are `weight="strong"` at body size. Hierarchy comes from weight and grey.

### Mono
Only for times, file names and counts. Props: `tone?` (default muted).
✓ `<Mono>walk-tuesday.m4a · 4:12</Mono>` ✗ `<Mono>Draft for X</Mono>`

### Skeleton, SkeletonLines
Grey bars for content the viewer does not need to read. `width: number | "NN%"`, or `widths: […]`.
✓ `<SkeletonLines widths={["88%", "72%", "80%"]} />` ✗ three bars of equal width, which read as a table.

### Rule, Avatar, Count
`Rule` is a hairline from edge to edge inside a padded object. `Avatar initials="C"` is a neutral disc. Never use a photo.
`Count value={1840} format?` counts up to a new value, so the change reads as caused (19). Under reduced motion it snaps to the value.

### Highlight
The yellow sweep on the one sentence that matters. It plays once, the first time it comes into view. Pass `active` to drive it yourself.
Under reduced motion it is simply there.
✓ One `Highlight` per piece. ✗ Highlighting a heading, or two sentences that compete.

### Hand, MarginNote
`MarginNote note="…"` wraps the line or lines it is about. A graphite bracket spans them, and the Caveat note sits
on the stage to the right of the object. The wrapped block must reach the object's content edge.
Props: `note`, `children`, `timing?: "at-rest" | "after-highlight"`. `Hand` is the bare handwriting, for
a note that is not beside a line.

```tsx
<MarginNote note="the riff. nobody asked" timing="after-highlight">
  <Text><Highlight>Nobody asked me to.</Highlight></Text>
</MarginNote>
```
✗ A margin note inside a `crop="corner"` card: there is no margin left for it.

### Beats, BeatBracket
The blue pen that names a draft's three beats. `BeatBracket beat="did" | "happened" | "meant"` wraps
each beat. The optional `Beats` wrapper quiets the other two beats while the mouse points at one. Hover enhances
the beats and never hides one: all three read at rest.

```tsx
<Beats>
  <BeatBracket beat="did"><Text>I gave the changelog its own page.</Text></BeatBracket>
  <BeatBracket beat="happened"><Text>412 people opened it.</Text></BeatBracket>
  <BeatBracket beat="meant"><Text>Three wrote back.</Text></BeatBracket>
</Beats>
```
✗ Inventing a fourth label, or putting two beats in one bracket.

### ActionButton, QuietButton
`ActionButton` is the one accent action (Approve). Press scales it to 0.97. Hover mixes it 12% toward
the surface, never an alpha. While `pending` it disables and shows `pendingLabel`. `QuietButton` is the
grey secondary action beside it (Edit, Undo). Both buttons are 34 design px tall, and their hit area grows to 44px on coarse pointers.
Props: `children`, `onClick?`, `type?`, `disabled?`, `icon?` (a hugeicon, decorative), `ref?`.
`ActionButton` also takes `pending?` and `pendingLabel?`.

```tsx
<ActionButton icon={Tick02Icon} onClick={approve}>Approve</ActionButton>
<QuietButton>Edit</QuietButton>
```
✗ Two ActionButtons in one piece. ✗ An ActionButton used as a tab or a filter.

### Arrive
Something the person caused arrives: a rule slides into the brain, or a riff card rises under the recorder.
It is a transition, so flipping `show` back reverses it and does not restart it. Content is inert while hidden.
Props: `show`, `from?: "above" | "below"`, `children`.
✓ `<Arrive show={approved}>…</Arrive>` ✗ `show` on a timer with no cause. Every motion has a cause.

### useInView, useReducedMotion
`useInView<T>({ once?, threshold? })` returns `[ref, inView]` (threshold .4, once by default).
`useReducedMotion()` returns `false` on the server and on the first paint. Every kit block already has its reduced-motion
path in CSS. Use the hook only for motion you drive from JS.

## Rules the kit does not enforce

- Name transition properties. Keyframes are only for one-shots and loops, and each one needs a reduced-motion path.
- Icons come only from `@hugeicons/react` and `@hugeicons/core-free-icons`.
- Nothing from the app's `components/`. None of the app's colour tokens (`--primary`, `--brass-*`, `--sand-*`, `bg-background`).
