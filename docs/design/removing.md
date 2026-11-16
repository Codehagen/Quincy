# Removing things

Which button is the action (the ink pill) is in actions.md. A removal is never
the action.

```
What happens when it is removed?
 ├── It can come back: it still exists, only out of view (dismiss, archive,
 │   move out of the queue)
 │    → a quiet Button ("Dismiss"). The item folds away (Arrive presence) and
 │      an UndoBar arrives where it stood and takes focus. No confirmation.
 ├── It is gone for good
 │    ├── Is it the person's own work, and is this the only copy?
 │    │   (a riff, a draft, a take recorded on this page and not yet sent)
 │    │    → HoldButton. Holding is the confirmation; letting go cancels.
 │    └── No: another copy exists, or nothing of theirs is lost
 │        (a FileChip for a file still on their device, a search query)
 │         → the plain control: FileChip's ×, SearchField's clear. No hold.
 └── It sits in a Menu → MenuItem tone="danger", only for a removal an Undo
      can take back: it runs at once and the UndoBar appears. A Menu row
      cannot be held, so a delete-for-good is a HoldButton in the detail,
      never a row.
```

**One removal per thing.** A take shown as a FileChip has no × when a
HoldButton ("Throw it away") removes it: a × beside a hold for the same
thing makes the hold pointless. A FileChip gets `onRemove` only when the
file is still on the person's device, so removing it from the page loses
nothing.

`Button variant="danger"` is for a destructive action that is none of those:
rare. Never a confirmation dialog for something an Undo can take back:
a dialog is two clicks where the second becomes reflex. `AlertDialog` stays
for the genuinely irreversible that a hold cannot express (AGENTS.md).

## UndoBar

The Undo after a removal that can come back. Its own Card on the Stage, in
the place of the object that went: one muted sentence and a quiet Undo.

Props: `show`, `children` (the sentence), `onUndo`, `width` (the width of the
object it stands in for: `with-margin` in a list and detail), `onExitComplete`,
`ref` (the Undo button, for a MenuPanel `finalFocus`).

- **On the Stage, not inside a Card.** It stands where the removed object
  stood, so it keeps its place when the list the item came from turns into
  the empty state. Inside the list Card it would leave with the list.
- **Keep it mounted** with `show={undo != null}`, in the same Stage as the
  item, after the detail. It arrives with Arrive (`appear`), folds away with
  Arrive's exit, and a closed one costs the Stage no gap.
- **Focus lands on Undo** the moment it shows. Built in: do not add an
  effect. Undo is described by the sentence, so a screen reader hears what
  it brings back. When Undo is pressed, focus the restored item (its row),
  because the bar is leaving.
- **It never times out.** A timer is motion nobody caused (motion.md), and a
  timed Undo is gone before a screen-reader user or a slow reader gets to
  it. The item still exists, so keeping the Undo costs nothing. It leaves
  on the person's next action on the page: clear it at the top of every
  other handler (`clearUndo()` in Record, Send, a row press).
- **One per page.** A second removal replaces the sentence; Undo brings back
  the last one.
- **The sentence** is past tense and names the thing, not the verb's
  object type: `Dismissed the voice note from today.`, never `Item removed.`

```tsx
// Correct — the item folds away; the bar stands in its place and takes focus
<Stage lead="This is what came back.">
  <List width="with-margin">…rows…</List>
  {open ? <RiffDetail key={open.id} … /> : null}
  <UndoBar show={undo != null} width="with-margin" onUndo={restore}>
    {undo ? `Dismissed ${undo.phrase}.` : null}
  </UndoBar>
</Stage>

// Incorrect — a hand-built bar, a focus effect, and a timer
useEffect(() => { const t = setTimeout(() => setUndo(null), 5000); return () => clearTimeout(t) }, [undo])
<div className="self-stretch"><Arrive show={undo != null} appear><Card>…<Button ref={undoRef}>Undo</Button></Card></Arrive></div>
```

## HoldButton

Hold 1.2s to confirm; let go to cancel. The quiet control with a red label
and a muted "hold" after it; a danger-tint fill sweeps across while held and
drains back on release. The kit's port of `components/hold-to-confirm.tsx`
(AGENTS.md "Destructive actions"), keeping its four load-bearing behaviours:
rAF progress (not a CSS transition), resume from the current fill, `touch-action:
none`, and Space/Enter hold with release on blur.

Props: `children` (string, the action: "Delete the riff"), `onConfirm` (may be
async; a throw returns it to idle for a retry), `pendingLabel` ("Deleting…",
shown and announced while `onConfirm` runs), `doneLabel` (default "Done"),
`disabled`, `aria-describedby`, `ref`. There is no duration prop: 1200ms is
calibrated, so no call site drifts. There is no ink HoldButton: it is never
the action.

```tsx
// Correct — away from the action, at the other end of the row
<div className="flex gap-kit-controls"><Button variant="action">Draft this</Button></div>
<HoldButton pendingLabel="Deleting…" onConfirm={deleteRiff}>Delete the riff</HoldButton>

// Incorrect — a hold for something an Undo could take back
<HoldButton onConfirm={dismiss}>Dismiss</HoldButton>
```
