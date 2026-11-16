# Controls

Tactile white objects: `bg-kit-control` + `shadow-kit-control`, 36px tall
(`md`, default) or 44px (`lg`, beside a hero action only). Segmented and
Tabs are pills; Stepper and fields are 12px. "On" and "picked" are **ink**,
after the landing's reply chips: an ink thumb, an ink switch track, an ink
slider fill. Never blue, never a tint. Every control keeps a 44px hit area
on coarse pointers. None takes `className` or `style`. Text entry is in
forms.md; Select, Menu and IconButton are in menus.md; List, ListRow, NavRow
and FileChip are in lists.md.

All of these are on Base UI. A new control whose behaviour Base UI does not
cover well is built on ui-sdk (see "Behaviour libraries" below).

A control is always shown inside the surface it belongs to. A control demo
with no page around it was discarded (16, 18).

## Which control for a choice

```
What is the person choosing?
 ├── A command, not a value (Rename, Delete)       → Button, or MenuItem in a Menu
 ├── On or off, applied the moment it flips         → Switch, with a label
 ├── Several at once, or done / not done            → Checklist
 ├── One of 2–5 short options (each ≤ 12 characters) → Segmented
 ├── One of 6 or more, or any label > 12 characters → Select
 ├── A whole number with a small range and a step   → Stepper
 ├── A point on a range where the exact number does not matter → Slider
 └── Text                                           → forms.md
```

## Segmented

One value from 2–5 options, always exactly one picked. An ink pill slides
between segments (320ms); the picked label is `text-kit-primary-on`, the
others are muted until hovered. Use Tabs when picking swaps the content below; use Select
for 6+ options or long labels. On Base UI's RadioGroup: arrows move and pick,
Tab enters and leaves as one stop, `name` submits with a form.

Props: `options` (`{ value, label, disabled? }[]`, `V` inferred), `value` /
`defaultValue` (default: the first option) / `onValueChange`, `size` `md` |
`lg`, and `aria-label` or `aria-labelledby` (required by the type).

```
Does picking it change what is shown below it?
 ├── Yes → Tabs (tablist + tabpanel; each tab controls its panel)
 └── No, it is a value that is saved, submitted or drives a number → Segmented
```

```tsx
// Correct — lab 28: the hour is a value
<Segmented aria-label="Hour" options={[{ value: "07:45", label: "07:45" }, …]} value={hour} onValueChange={setHour} />

// Incorrect — seven options: the segments shrink until no label reads. That is a Select
<Segmented aria-label="Day" options={["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map(d => ({ value: d, label: d }))} />
```

## Tabs

Same look as Segmented (the ink thumb); tab semantics. `Tabs` (`value` / `defaultValue` /
`onValueChange`) > `TabList` (`aria-label`, `size`) > `Tab` (`value`, a string
label) and `TabPanel` (`value`). Tabs are content-width. Arrows move focus,
Enter or Space activates. Never Tabs for a filter that only re-sorts one list:
that is a value, so Segmented.

## Switch

On or off, and it applies the moment it flips (a setting). A choice that
waits for a Save button is a Checklist item. Ink track when on, white knob. Props:
`label` (the whole row is the hit area), or `aria-label` / `aria-labelledby`
when it sits beside its own text; `checked` + `onCheckedChange` or
`defaultChecked`. The off track is 1.31:1 by design, so a Switch is never
alone without words beside it.

```tsx
// Correct
<Switch label="Draft a reply to every comment" defaultChecked />

// Incorrect — a bare switch: the off track is 1.31:1 and nothing says what it does
<Switch aria-label="Replies" />
```

## Stepper

"Gap − 26 +" in one pill. A whole number in a small range with a meaningful
step (posts a week, minutes between posts). Use Slider when the exact number
does not matter. Props: `label` (required, visible, names the input), `min`,
`max`, `step`, `largeStep` (Shift), `value` / `defaultValue` /
`onValueChange` (`null` only mid-edit), `size`, `name`, `aria-label` (the
input's full name when the visible word does not say which one, as in a
list of topics each with "Weight %": `"Weight % for Small software"`; it
must contain `label`, and the − and + buttons take it too). The value ticks
160ms toward the side it moved; typing never animates.

## Slider

One value on a continuous range. Ink fill, 24px knob on a 6px track, the
whole 44px row is the target. Props: `aria-label` (required), `min`, `max`,
`step`, `value` / `defaultValue`, `onValueChange` (every move: keep it cheap),
`onValueCommitted` (on release: save here). A range (two knobs) is not a kit
control. Show the number beside it in `Mono` if it matters; if it matters
exactly, it is a Stepper.

## Checklist and CheckItem

Things done and not yet done, or several picks at once. Done is a filled
green circle with a tick; a done item stays in ink, never struck through
(strikethrough diffs were discarded). `Checklist` takes `aria-label` /
`aria-labelledby`, `value` / `defaultValue` (array of item values),
`readOnly` (a record the person reads but cannot tick). `CheckItem` takes
`value`, `children` (the label), `disabled`.

```tsx
// Correct — a record of the week
<Checklist aria-label="This week" readOnly defaultValue={["recorded", "drafted"]}>
  <CheckItem value="recorded">Recorded a riff</CheckItem>
  <CheckItem value="drafted">Drafted Thursday</CheckItem>
  <CheckItem value="approved">Approved it</CheckItem>
</Checklist>

// Incorrect — done items struck through and greyed: Quincy does not grade
<li className="line-through text-kit-ink-muted">Recorded a riff</li>
```

## Behaviour libraries

Decided 2026-11-16 (plans/029, revision). One component never mixes both.

```
Does Base UI cover the behaviour well (focus, keyboard, popup, aria)?
 ├── Yes → Base UI. Every control above, and every existing kit component, stays on it.
 └── No  → ui-sdk (@ui-sdk/react + @ui-sdk/core, Apache-2.0, beta; https://ui-sdk.dev).
           Examples: command palette, token input, calendar and date-time,
           number input, drag-to-reorder, tree, virtualised long lists.
```

The kit look stays the same either way: a ui-sdk component reads only
`--kit-*` utilities and follows every rule in this folder. ui-sdk is pinned
at exactly `0.1.0-beta.5`; recheck the API before every bump.

On ui-sdk (2026-11-16): `CommandPalette`, `TokenInput`, `Calendar`,
`DateTimePicker`, `Reorderable`, `Tree`. Number input stays on Base UI via
`Stepper`. ui-sdk writes `data-selected=""` — style it with an attribute
selector (`[&[data-selected]]:`), not a value-matching variant.


### Reorderable: the active row and the position

`activeKey` + `onActiveChange` pick a row: a row takes focus on a click or
the arrow keys and `onActiveChange(key)` fires; the active row is drawn in
the selected grey with `aria-current="true"`. Rows hold no controls, so the
active row's controls open under the list (page.md, "List and detail").
`describePosition(position)` says what a position means when the slot
carries it (the Lineup's day and time); every announcement then reads
"position 2 of 5, Tuesday 08:00".

### DateTimePicker: whose clock

`timeZone` (IANA) is the zone the times are written in. A time on today's
date is greyed as passed against the wall clock there, not the browser's.
Pass the account's zone; omitted, it falls back to the browser's.
