# Actions: which one is the ink pill

How to remove things (the removal tree, `UndoBar`, `HoldButton`) is in
removing.md.

## One action per view

`variant="action"` is the one next step the view exists for: the ink pill.
An ink pill that appears twice means neither is the next step, and the page
has no hierarchy. (Before 2026-11-16 this fill was blue; the rule did not
change, only the colour.)

**A view is a Stage**, counting everything stacked in it. **A page shows one
action at a time**: when a page has several Stages, only one of them holds an
action at any moment. Which one is decided by the precedence below, worked
out once per render from the page's state, never per component.

### Which action wins

```
Which Button on this page is variant="action" right now? Ask in order; the first yes wins.
 1. Is the person in the middle of something on this page?
    (recording; a take waiting to be sent; words typed into a form and not sent;
     a form with changes not saved)
     → its next step: Stop, Send to Quincy, Find the angles, Save.
 2. Is an item open whose next step is waiting?
    (an open riff whose pick is not drafted; a draft waiting for approval)
     → that step: the pick's Draft this, Approve.
 3. Does the page have a standing step for when nothing is open or underway?
     → that step: Record a thought.
 4. None of these → no action. A page with no ink pill is correct when there is
    nothing to do next; never promote a quiet control to fill the gap.
```

Ideas, worked through: idle with a riff open → its pick's Draft is the
action, Record is quiet. Press Record → Stop is the action, the pick's Draft
goes quiet. Stop → Send is the action. Send → nothing is underway, so the
open riff's pick is the action again. Type into Write it → Find the angles is
the action; clear the words and it goes back to quiet.

Compute it as one value high in the screen, and pass a boolean down:

```tsx
// Correct — one decision, in order, at the top of the screen
const busy = phase !== "idle" || text.trim() !== ""
const pickIsAction = !busy && pickWaiting(open)
const recordIsAction = !busy && !pickIsAction
<Recorder isAction={busy || recordIsAction} … />   // Stop, Send and the submit read it
<RiffDetail pickIsAction={pickIsAction} … />

// Incorrect — each component decides it is the action
<Button variant="action">Record a thought</Button>   // and, two Stages down:
<Button variant="action">Draft this</Button>
```

### Per item

```
Should this Button be variant="action"?
 ├── Is it inside a ListRow, a menu, or a toolbar of equals?  → No. Quiet
 ├── Does the same verb repeat once per item (Draft on every angle)?
 │    ├── Is there one item Quincy would start with (its pick)? → that one only,
 │    │    and only when the precedence above gives it the action
 │    └── No → none. Every repetition is quiet; repetition is not hierarchy
 ├── Is it destructive?                                        → No. danger or HoldButton (removing.md)
 ├── Does the precedence above give the action to something else? → No. Quiet
 └── Is it the single next step this Stage exists for?         → Yes. action
```

In development, a second action on screen in one KitPage (else Stage, else
Card) warns once in the console. Content the person cannot see does not
count: a closed `Arrive` (`inert`), a `hidden` element (a `keepMounted`
TabPanel that is not open), anything `display: none`. So Approve swapping
for its Undo is fine, and so is a submit in a closed tab.

```tsx
// Correct — the pick carries the ink fill; the same verb elsewhere is quiet
{angles.map((a) => <Button key={a.id} variant={a.id === pick?.id ? "action" : "quiet"} aria-describedby={`hook-${a.id}`}>Draft this</Button>)}

// Incorrect — an action on every item, and a second one in the recorder above it
<Button variant="action">Draft this</Button><Button variant="action">Draft this</Button>
```

### Forms

A form's submit is `type="submit"` always, so Enter submits. It is
`variant="action"` when the precedence gives it the action: always on a page
whose job is the form (Settings, sign-in), and on a page with other work
only while the form holds the person's unsent words (step 1). Otherwise it
is a quiet submit. forms.md says the same. A ButtonLink with
`variant="action"` counts like a Button.
