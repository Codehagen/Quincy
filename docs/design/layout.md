# Layout: Stage, Card, Window

A bold lead, then one white object under it, on the white ground. That is the
whole composition, as the landing's held draft. Split stages and tile grids
were discarded. Gaps and padding are in spacing.md.

The page shell (`KitPage`, `searchParams`) and list and detail are in
page.md; the app frame around it is app-shell.md.

## Stage

Use for every section that shows one subject. The alternative is plain text
on the ground (`<Text>` inside KitPage) for prose between stages.

Props: `lead` (one bold sentence, a string), `rest` (the grey continuation,
needs `lead`), `backdrop` `ground` (default) | `recess` | `grid`,
`children`. Nothing else. The lead is a string on purpose: a Count, link or
button goes in the object, never in the lead.

```
Which backdrop?
 ├── A section of the product (every app surface)        → ground (default): no frame, nothing clips
 ├── A picture of the product, cropped at its foot       → recess: the grey frame, like the landing's Crop
 └── A showcase of controls in the lab or the docs        → grid: the recess with 24px graph paper
```

`plain` is the old name of `recess` and is deprecated. Before 2026-11-16 the
grey frame was the default behind every section; the landing showed the
object reads better on the white ground, so the grey is now only a recess.

The lead is ≤ 340px wide (`max-w-kit-lead`), 28px above the object. On the
ground there is no gutter and nothing clips, so a `crop` Card stays whole. In
a recess the gutter is 30px (`kit-gutter`), and 18px (`kit-gutter-sm`) on a
stage under 28rem. Stage is a size container either way: margin notes move
to the margin column only on a stage ≥ 32rem (512px).

```tsx
// Correct
<Stage lead="Every draft reads in three beats." rest="Nothing goes out in your name until you approve it.">
  <Card width="with-margin">…</Card>
</Stage>

// Incorrect — two objects side by side: a split stage (12, 14 were discarded)
<Stage lead="This week."><div className="grid grid-cols-2 gap-3"><Card>…</Card><Card>…</Card></div></Stage>
```

List and detail on a `width="wide"` page is the one case of two objects side
by side in a Stage: the list and the item it opened (page.md, "Wide").

Stacking is allowed: objects one above the other, 14px apart (`kit-stack`,
Stage does it). Only the last object crops. An `Arrive` (and `UndoBar`,
which is one) stretches to the Stage's width; the object inside sets its
own `width`. Never wrap it in `self-stretch`. A closed Arrive in a Stage
costs no gap, so an UndoBar can stay mounted under the detail.

### A Stage without a lead

`lead` is optional in the types, and almost always given. Leave it out in
two cases only:

- **The object opens with its own `Lead`**: the empty state. "This is what
  came back." above "Nothing is waiting on you." says two things, and the
  first is false. Keep the same Stage mounted and drop its `lead` while the
  object is empty, so whatever stands in it (an UndoBar) keeps its place.
- **A showcase of controls** in the lab or the docs, where the caption
  under the stage does the explaining.

Never to save space, and never for a Stage of product content that has
something to say about it.

## Card

The white object. Use Card for a piece of the product; `List` for rows
(lists.md); `Window` when the object is one of the product's own screens and
the address matters.

Props: `crop` `none` (default) | `bottom` | `corner`; `width` `full`
(default) | `with-margin`; `inset` `normal` (default) | `none`. Padding is
18px on a phone and 28 × 24 from 40rem inside KitPage (spacing.md).

```
Does the object carry a MarginNote or BeatBracket?
 ├── Yes → width="with-margin", crop="none" or "bottom". Never "corner".
 └── No
      ├── In a recess, taller than the frame should be, and the rest does not matter? → crop="bottom"
      ├── In a recess, a wide product screen that "continues off-frame"? → crop="corner" (always full width)
      └── Default → crop="none", width="full"
```

A crop only cuts in a recess Stage. On the ground it is a whole object.

`inset="none"` is for an object that lays out its own edge-to-edge content,
such as Window's chrome. It sets `--kit-card-pad` to 0 for margin notes.
Rows are not that case: a Card of rows is a `List`, never `Card inset="none"`
with a hand-written padding wrapper.

```tsx
// Correct — the note has its column
<Card width="with-margin"><MarginNote note="your best hour">…</MarginNote></Card>

// Incorrect — no column; on a stage ≥ 512px the note is cut off by the edge
<Card crop="corner"><MarginNote note="your best hour">…</MarginNote></Card>
```

## Window

A Card with chrome: three dots and a mono address. Takes `address` plus
Card's `crop` and `width`; its body is always padded.

- At most one per view. A Window inside a Window throws.
- The address is a real route: `hirequincy.com/lineup`, never `example.com`.
- Never an empty Window waiting for an animation (06 was discarded).

```tsx
// Correct
<Window address="hirequincy.com/lineup"><Text weight="strong">Thursday</Text>…</Window>

// Incorrect — chrome around nothing, waiting for a loop
<Window address="hirequincy.com/lineup"><div className="h-40" /></Window>
```
