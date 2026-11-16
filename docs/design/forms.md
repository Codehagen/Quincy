# Forms

Fields are white controls on the object: the same surface as a quiet Button
(`bg-kit-control` + `shadow-kit-control`, 36px tall), at 12px radius rather
than a pill, because text sits in them. Invalid is a
1.5px danger ring, never a red fill. Choices (Select, Switch, Stepper) are in
controls.md; this file is text entry and the field around a control.

## The form

- A real `<form>`, so Enter submits. Never a `div` with an `onClick` on Save.
- Fields stack in a `flex flex-col gap-kit-group` group. 20px between
  fields (spacing.md); no `space-y-*`.
- One `Button type="submit"` with `pending` and a `pendingLabel`
  ("Saving…"). It is always `type="submit"`; whether it is
  `variant="action"` follows "Which action wins" (actions.md): always on a
  page whose job is the form (Settings, sign-in), and on a page with other
  work only while the form holds the person's unsent words. Otherwise it is
  a quiet submit, and Enter still submits.
- A destructive action sits away from submit, at the other end of the row or
  in its own section, and uses `HoldButton` when letting go should cancel
  (removing.md).
- A failure that is not about one field (the server refused, no channel) is
  not a field error: it follows states.md, "Refused or failed".

## Field

Wraps exactly one control: Input, Textarea, Select, Switch or Stepper. It
renders label, control, description, error, in that order, and wires the
label and the messages to the control (`aria-describedby`, `data-invalid`).

Props: `label` (required, always visible: a placeholder is not a label),
`description` (one muted line), `validate` (returns the message or `null`,
may be async), `error` (a message from outside, such as the server), `name`,
`disabled`.

Validation timing is built in, so never add your own: `validate` runs on blur
until it has failed once, then on every change, so the message leaves the
moment it is fixed (reward early, punish late). Errors render under their own
field, never as a summary above the form. Clear `error` when the value
changes.

```tsx
// Correct
<form onSubmit={save} className="flex flex-col gap-kit-group">
  <Field label="Email" validate={(v) => (String(v).includes("@") ? null : "That address has no @.")}>
    <Input type="email" name="email" autoComplete="email" />
  </Field>
  <Button variant="action" type="submit" pending={saving} pendingLabel="Saving…">Save</Button>
</form>

// Correct — a form on a page whose action is elsewhere: the action only while it holds words
<Button type="submit" variant={text.trim() ? "action" : "quiet"} pending={sending} pendingLabel="Sending…">Find the angles</Button>

// Incorrect — a placeholder standing in for the label: it disappears on the first keystroke
<Input type="email" placeholder="Email" aria-label="Email" />
```

## Input

One line. `type` `text` (default) | `email` | `password` | `url` | `tel` |
`time` | `date`. `time` and `date` are the browser's own controls (the native
picker on a phone, typed digits on a desktop), tabular; `TimeInput` and
`DateInput` are named wrappers for them. A date and a posting time together
is DateTimePicker. `mono` sets the value in the Mono face, for a value read
character by character (a webhook URL, a signing secret), never for prose.
Nothing else exists: search is SearchField, a number with a range is
Stepper. Pick the real type even when `text` would work, because the type
chooses the mobile keyboard and autofill. Always inside a Field. Controlled
with `value` + `onValueChange`, uncontrolled with `defaultValue`.

## Textarea

Several lines. Grows with its content between 80px and 320px
(`field-sizing: content`). Enter inserts a newline; ⌘/Ctrl+Enter submits the
enclosing form (`requestSubmit`, so validation runs), or calls
`onSubmitShortcut`. `size="document"` is for the whole text of a page (a
brain page in source view): it opens at 320px and has no ceiling, so the
page scrolls, not a box inside it. The corner hint shows "⌘ ↵" or "Ctrl ↵" after mount
(`useModKey`); `shortcutHint={false}` hides it. Props: `value` /
`defaultValue` / `onValueChange`, `rows` (default 3), `size` `field`
(default) | `document`, `onSubmitShortcut`, `shortcutHint`.

```
How long is the answer?
 ├── One line, a known kind (email, URL, name) → Input with its type
 ├── A sentence or more, or it may have line breaks → Textarea
 └── A query that filters what is on screen → SearchField
```

## SearchField

Filters or finds. Magnifier, input, and a round clear button once there is
text; Escape clears, and clearing returns focus to the input. Props: `value`
/ `defaultValue` / `onValueChange`, `aria-label` (default "Search"; set it
when the page has two), `size` `md` | `lg` (`lg` only as a page's main
search), `placeholder`. Not inside a Field: the magnifier is its label.
Spellcheck and autocomplete are off.

## Never

- `font-size` under 16px on a coarse pointer. The kit sets 16px there so iOS
  never zooms on focus; never patch it with `maximum-scale=1`.
- `autoFocus` on a field below the fold, or on mobile. It opens the keyboard
  over the page the person came to read.
- A disabled submit that means "not valid yet". Let it submit, and show the
  errors under their fields.
- A red-filled field, a red banner summarising errors, or an error before the
  person has left the field once.
