# Buttons and links

Which `variant` gets the ink fill is in actions.md; how to remove things is
in removing.md. Every button is a pill (`rounded-full`), as the landing's
call to action and reply chips.

## Button, ButtonLink or TextLink

```
Does pressing it go somewhere (a page, a section, another site)?
 ├── Yes
 │    ├── Is it inside a sentence?         → TextLink
 │    └── Does it stand alone as a control? → ButtonLink
 └── No, it does something here
      ├── Only an icon fits (more, close, attach) → IconButton (menus.md)
      ├── Destroys something and letting go should cancel → HoldButton (removing.md)
      └── Default → Button
```

Never `<Button render={<a/>} nativeButton={false}>`. Base UI then gives the
anchor `role="button"`, and a screen reader announces a link as a button.
The props still compile for old call sites; they are deprecated and warn in
development.

## Button

Variants: `action`, `quiet`, `danger`, `ghost`. Nothing else exists; an
unlisted variant is a bug. Sizes: `md` (36px, default), `lg` (44px, a hero
action only), and for a workspace's toolbar and foot only `sm` (32px) and
`xs` (28px), with the 13px label and icons at stroke 1.75 (workspace.md).
Nothing else.

- `quiet` — **the default.** Edit, Undo, Cancel, everything that is not the
  action: a white pill with a ring and a soft fall, ink label. A forgotten
  variant falls back to quiet, so it never adds a second ink fill.
- `action` — the one action on a view (actions.md). An ink pill
  (`bg-kit-primary`, label `text-kit-primary-on`); in dark mode a light
  pill. Never blue: blue is the pen (colour.md).
- `danger` — destructive only: the quiet control with a red label, never a
  red fill. Sits away from the action.
- `ghost` (2026-11-16) — no surface at rest, muted label; the row-hover
  grey and ink on hover and while its menu is open. Only in a workspace's
  toolbar or foot, beside other controls (Clear after the filters, Undo in
  the foot), where six floating pills would be the noise. Never in a Card,
  never the action, never alone on a page.

Props that change behaviour:

- `icon` — a leading hugeicon, `aria-hidden`. Only when it adds
  recognition: a tick on Approve, not an icon on every button.
- `pending` + `pendingLabel` — disables the button, keeps it focusable, sets
  `aria-busy`, shows the label ("Drafting…") and announces it through a
  polite live region beside the button. The button reserves the wider of the
  two labels, so nothing moves. Every async press uses it.
- `type` — defaults to `button`. Pass `type="submit"` inside a form.
- `mark` — a leading glyph that is not a hugeicon (Google's G), sized to the
  icon. `icon` when a hugeicon exists.
- `iconEnd` — a trailing hugeicon, for a control that leads on ("Manage →").
  Never both a leading and a trailing icon.
- `width` — `auto` (default) | `full`, to span its column (an auth card).
  Never a fixed or minimum width.
- `reserve` — the other labels this button can show ("Preview" while it
  says "Edit", "Copied" while it says "Copy"). It reserves the widest, as
  for `pendingLabel`, so a toggle never moves under the pointer.
- `shortcut` — one key that does the same thing on this surface ("U" for
  Undo, "D" for Draft), drawn as an 18px `Kbd` at the label's end (on-ink
  on the action) and hidden on touch. It sets `aria-keyshortcuts` (the key
  in lower case unless you pass your own). It only shows the key: the
  surface's own handler does the work (workspace.md, "Keys"). The key side
  of the pill takes 2px less, as an icon's does.

What it does for you, so do not redo it: press scales to `--kit-press-scale` (0.96) in 140ms;
colour changes in 200ms; hover on the ink fill is `--kit-primary-hover` (a
mix toward the ground, never an alpha); a
44px-tall hit area on coarse pointers; a 2px ink focus ring offset 2px.

```tsx
// Correct — one action, the rest quiet
<Button variant="action" icon={Tick02Icon} pending={saving} pendingLabel="Approving…" onClick={approve}>Approve</Button>
<Button>Edit</Button>

// Incorrect — an action used as a filter: a picked value is Segmented
<Button variant="action">This week</Button><Button>Next week</Button>
```

### The same button on every item

A list where each item has "Draft this" or "Dismiss": keep the visible label
the same on every item, and add which item through `aria-describedby`
pointing at the item's title. Never an `aria-label` that drops the visible
words: a voice-control user says "click Draft this", and an
`aria-label="Draft: He read the pricing page…"` does not contain it (WCAG
2.5.3). An `aria-label` that does not contain the visible label warns in
development.

```tsx
// Correct
<Text weight="strong" id={hookId}>{angle.hook}</Text>
<Button aria-describedby={hookId} onClick={draft}>Draft this</Button>

// Incorrect — the accessible name no longer contains "Draft this"
<Button aria-label={`Draft: ${angle.hook}`}>Draft this</Button>
```

### Toggle buttons

A button that turns a state on and off says so in ONE way, never both:

- **The label changes** ("Record a thought" ↔ "Stop"): no `aria-pressed`. The
  label already says what pressing does next; adding pressed makes it read
  "Stop, pressed".
- **The label stays** ("Mute", "Bold"): `aria-pressed={on}`, and the look
  changes with it. If the state is a setting that applies at once, it is a
  Switch, not a toggle button.

Keep one button whose label changes, not two that swap, so focus stays put.

## ButtonLink

The Button look on a real `<a>` (next/link): announced as a link, opens in a
new tab on ⌘/Ctrl-click. Props: `href` and the rest of next/link's props,
`variant` `quiet` (default) | `action`, `size`, `icon`. There is no `danger`
(going somewhere destroys nothing), no `pending` and no `disabled`: a link
cannot be disabled. If it is not available, do not render it; say why.

```tsx
// Correct — the way out after a refusal, and the next step after a swap
<ButtonLink href="/channels">Connect LinkedIn</ButtonLink>
<ButtonLink ref={draftsRef} href="/drafts">Open Drafts</ButtonLink>

// Incorrect — a link announced as a button
<Button nativeButton={false} render={<Link href="/drafts" />}>Open Drafts</Button>
```

## TextLink

A link inside a sentence. It takes the colour of the text around it (ink or
muted) with an underline at 40% of that colour (`--kit-link-line`), offset
3px (`--kit-link-offset`); hover takes text and underline to full ink. Props:
`href`, `children`, and next/link's props. Never a raw `<a className=…>` with
its own underline: the token is the underline.

```tsx
// Correct
<Text variant="small" tone="muted">From <TextLink href={post.url}>@{post.handle}'s post</TextLink>.</Text>

// Incorrect — hand-made underline and hover, no focus ring
<a href={url} className="underline underline-offset-4 hover:text-kit-ink">@ada</a>
```

## TextButton

The TextLink look on a real `<button>`, for an action inside or under a
sentence that goes nowhere ("Wrong address? Go back and fix it", "Read my
last merged pull request"). Announced as a button. Props: `children`
(string), `onClick`, `type`, `disabled`, `pending` + `pendingLabel`. A
control that stands on its own is a Button; never copy TextLink's classes
onto a `<button>`.

ButtonLink also takes `iconEnd` and `width`, as Button.

## Never

- `className` or `style` on a Button, ButtonLink or TextLink. A one-off
  colour or size is a missing variant, which is a kit change.
- A red fill or a link variant of Button. They do not exist. A `ghost`
  outside a workspace toolbar or foot.
- A hover or pressed state made with an alpha (`bg-kit-primary/90`).
- A blue button. `--kit-action` is legacy, kept only for the showcase
  pictures (colour.md).
- A disabled action that means "not yet". Say what is missing in text
  beside it; a faded ink pill gives no reason.
- A focus ring written by hand. Every kit control already draws one.
