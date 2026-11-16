# Surfaces

The page is the white ground. A section's object sits **on the ground**,
lifted by its elevation, never by a border. The grey stage is a **recess**:
inside an object (a Well), or as the frame of a picture that crops its object
at the foot. It is not a page background (2026-11-16, the landing is the
reference).

| Level | Utility | Light | Set by |
| --- | --- | --- | --- |
| ground | `bg-kit-ground` | #FDFDFC, L 0.994 | `KitRoot` |
| object | `bg-kit-object` | white, L 1.0 | `Card`, `Window`, `List` |
| stage | `bg-kit-stage` | #F2F2F1, L 0.961 | `Stage backdrop="recess"` or `"grid"` only |
| well | `bg-kit-well` | = stage | `Well`: a recess inside the object (spacing.md) |
| selected | `bg-kit-selected` | = well | a picked row (lists.md, menus.md) |
| control | `bg-kit-control` | white | quiet Button and every control |

In dark mode the order holds by brightness: object 0.235 > ground 0.178 >
stage 0.155. The object is still the brightest thing.

```
Where does this surface sit?
 ├── It is the page                         → KitRoot (ground)
 ├── It is what a section shows             → Card (Window if it is the product's own screen, List for rows)
 │                                            inside <Stage> on the ground (the default backdrop)
 ├── It is a picture cropped at its foot    → <Stage backdrop="recess">; grid for a showcase of controls
 ├── It is a slot or recess in the object   → <Well>, no shadow
 ├── It is a secondary object inside the main one → bg-kit-object + shadow-kit-inset
 └── It is something you press              → a kit control (bg-kit-control + shadow-kit-control)
```

Never a recess inside a recess (a Well in a grey stage's Well, a recess Stage
inside another). On the ground, the object's shadow and hairline ring carry
it: white on #FDFDFC is 1.02:1, so the elevation is the edge.

## Elevation

Every stack opens with a 1px ring; in dark mode every stack collapses to one
white ring, because stacked shadows vanish on a dark ground.

| Utility | For |
| --- | --- |
| `shadow-kit-object` | Card, Window, List: ring 6% + 1px fall + soft 28px fall |
| `shadow-kit-control` | quiet Button and every control: ring 7% + a short 12px fall |
| `shadow-kit-knob` | the white knob on a switch or slider |
| `shadow-kit-knob-on-fill` | the slider's knob: in dark mode a ring of the dark ground separates it from the light fill |
| `shadow-kit-inset` | a secondary object inside the main one, a Tag: ring only |
| `shadow-kit-lifted` | every floating panel (Menu, Select, Popover, DateTimePicker, Toast, CommandPalette), an object in the hand mid-drag, the phone sidebar sheet |

The ink pill (`Button variant="action"`) has no shadow: a fill that dark
needs no lift.

Never `border` for depth. Borders are dividers only (`border-kit-hairline`,
under the window chrome and on the sidebar edge). Never `shadow-sm`,
`shadow-md` or `shadow-[…]`.

```tsx
// Correct — the object lifts by its token
<Card>…</Card>

// Incorrect — a border and a Tailwind shadow: two depth systems, neither dark-aware
<div className="rounded-xl border bg-white shadow-md">…</div>
```

## Radii

Closed set.

| Utility | px | For |
| --- | --- | --- |
| `rounded-kit-stage` | 24 | a recess Stage |
| `rounded-kit-object` | 18 | Card, Window, List, the Menu/Select panel |
| `rounded-kit-control` | 12 | Input, Textarea, SearchField, Select's trigger, Stepper, rows, Well |
| `rounded-kit-control-inner` | 8 | Tag |
| `rounded-kit-chip` | 6 | `Code`, `FileChip`, a TextLink's focus ring |
| `rounded-full` | — | Button, ButtonLink, HoldButton, IconButton, Segmented and Tabs (track and thumb), dots, skeleton bars |

Buttons are pills, as the landing's call to action and reply chips. A pill
inside a pill (the segmented thumb in its track) nests by construction.

## The nested radius rule

`inner = outer − padding`, when the inner box follows the outer edge at a
constant padding. A wrong inner radius makes the gap between the two curves
fat at the corners and thin on the sides.

- A row in an object padded 6px (`kit-row-inset`): 18 − 6 = 12 →
  `rounded-kit-control`. List, Menu and Select do it.

It does not apply when the inner box is not concentric. A Well floating
inside a padded Card keeps `rounded-kit-control` (12); it does not become
18 − 28 < 0. A recess Stage (24, gutter 30) does not nest its object
concentrically on purpose: the object sits under the lead, never in the
stage's corner.

If a new pair needs a radius that is not in the table, the padding is wrong
before the radius is.
