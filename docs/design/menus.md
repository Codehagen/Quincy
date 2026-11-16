# Menus and small controls

Select and Menu share one white panel; IconButton is the round control.
Rows (`List`, `ListHeading`, ListRow, NavRow) and FileChip are in lists.md.
The "which control for a choice" tree is in controls.md, text entry in
forms.md.

## Select and Menu

Both open the same white panel (18px radius, 6px pad, 12px rows). The
highlighted row is the selected grey (`bg-kit-selected`), never blue.

```
Does picking a row store a value that the trigger then shows?
 ├── Yes → Select. The picked row is ink at 560 with an ink tick
 └── No, the row runs a command (Rename, Duplicate, Delete) → Menu
```

**Select** props: `options`, `value` / `defaultValue` / `onValueChange`,
`placeholder` (muted), `size`, `name`, `required`, and `aria-label` when it is
not inside a `Field`.

**Menu**: `Menu` > `MenuTrigger` (a quiet control, or
`render={<IconButton icon={…} aria-label="More" />}`) > `MenuPanel` (`side`,
`align`, `finalFocus`, `width` `content` (default) | `wide`: 18rem capped
inside the viewport, for rows whose titles vary, such as a history) > `MenuItem` (`icon`, `tone` `ink` | `danger`,
`onClick`), `MenuLinkItem` (`href`, `icon`: a row that goes to a page; the
menu closes on the way out), `MenuRadioGroup` + `MenuRadioItem` (one choice
of several in place, such as the theme; the picked row carries an ink check
and the label never moves), `MenuGroup` + `MenuGroupLabel` (rows that belong
together under a muted label), and `MenuSeparator`. Destructive rows go
last, after a separator, `tone="danger"`.

**A command that removes its own trigger must name where focus goes.**
Dismiss, Delete or Move from a "More" menu removes the object the menu was
opened from, and with it the trigger focus would return to. Keyboard focus
then falls to `body`, and the person has to Tab from the top of the page.

```
Does the command remove or move the Menu's trigger?
 ├── No  → nothing to do: focus returns to the trigger
 ├── Yes, and the Menu stays mounted → MenuPanel finalFocus={ref to the replacement}
 └── Yes, and the Menu unmounts with it (the detail Card is keyed by the item)
      → focus the replacement from the parent in an effect after the state change
```

The replacement is whatever now stands in that place: the UndoBar for the
dismissal (removing.md), else the next row. `finalFocus` takes a ref or a
function returning the element. In development, a command that leaves focus
on `body` warns once.

```tsx
// Correct — the UndoBar takes focus itself the moment it shows
<MenuItem tone="danger" onClick={dismiss}>Dismiss the riff</MenuItem>
<UndoBar show={undo != null} onUndo={restore}>{undo?.sentence}</UndoBar>

// Incorrect — the riff and its menu are gone, and focus with them
<MenuItem tone="danger" onClick={() => setRiffs(rs => rs.filter(r => r.id !== id))}>Dismiss</MenuItem>
```

When the Menu stays mounted, `finalFocus` can take the UndoBar's `ref` (its
Undo button). Never hand-build an Undo bar: UndoBar's focus works because it
is interactive from the commit that shows it, and a hand-built bar inside an
Arrive that mounts hidden and flips on the next frame is still `inert` when
the focus call runs.

## IconButton

The round white control. Use for a secondary action that has a universally
read icon (more, close, attach) where a word would not fit. `icon`,
`aria-label` (required: the action, "Attach a file", not "Paperclip"), `size`
`md` | `lg`. There is no ink IconButton: the one action on a view has a word
on it, so it is `Button variant="action"`.

```tsx
// Correct
<Button variant="action" icon={SentIcon}>Send</Button>
<IconButton icon={Attachment01Icon} aria-label="Attach a file" />

// Incorrect — the view's main action as an unlabelled round icon
<IconButton icon={SentIcon} aria-label="Send" />
```
