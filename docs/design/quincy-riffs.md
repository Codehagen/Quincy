# Quincy cards: ideas (riffs)

The idea family from plans/030: `RiffCard` + `AngleTabs` (#2), from
`@/components/quincy`. Kit only. Live at `/prototypes/kit#riff-card`.

**The person never reads the word "riff".** In code a riff (shown as "ideas")
is raw material plus its angles, and an angle is an idea. On screen the
material is named by its source: "3 ideas from your voice note", "Draft this
idea", "No ideas waiting". `ideasFrom(riff)`, `sourcePhrase(label)` and
`dismissedSentence(riff)` write those sentences; never write them by hand.
Code names (`Riff`, `Angle`, `RiffCard`) stay as they are for now.

## RiffCard

One riff, open, up to Draft this idea. Use it as the detail under the list
on the Ideas page, and wherever Studio offers one. The list is ListRows titled
by `riffTitle(riff)` that open a RiffCard; the card is never a row.

Props: `riff` (`Riff`, lib/riffs.ts:306), `onDraft(angle) => Promise<DraftAngleResult>`
(lib/angle-draft.ts:210, the `draftAngle` action), `onDismiss(riff)`,
`isAction`, `readings` (`AngleReading` per angle id), `onRetry`, `meta`, `ref`.
Key it by the riff (`key={riff.id}`).

- **The pick is Quincy's start.** `pickAngle(riff)` is the lowest-positioned
  idea nobody has drafted, the rule `WaitingRiffPick.hook` states in
  lib/waiting-work.ts, so the Studio greeting and the card offer the same one.
  The card opens on its tab.
- **Draft this idea is the action only when the page says so.** Pass `isAction`
  from the page's precedence (actions.md). Only the open tab's panel is
  rendered, so one Draft is ever on screen.
- **It stays pending until the idea comes back drafted.** Between the
  action's answer and the page's refresh a second press would draft twice.
- **A refusal replaces the button**, with its way out: `entitlement` →
  See plans, `no-channel` → Connect a channel, anything else → Try again.
  The message is the action's own sentence, in ink, no red.
- **One Highlight, one MarginNote.** Only the open idea's sentence is
  highlighted; the note (`AngleReading.note`) writes in after the sweep.
- **Dismiss is quiet, under a Rule.** The page folds the card away (Arrive)
  and shows an `UndoBar` on the Stage with `dismissedSentence(riff)`.
- A scrap over 600 characters shows the passage around the highlighted
  sentence, with "Show all of it".

States, from `Riff.state`: `working` (the friend reading: "Reading it. Ideas
usually land within a minute."; `stuck` says it is slower than usual) ·
`ready` (tabs) · `failed` (`failure` in grey after "I couldn't find a post in
this one.", Try again when `onRetry`) · all drafted ("Every idea here is
drafted.", Dismiss the rest) · drafted (Open Drafts takes focus) · drafted
as fallback (`fellBack`: "only the hook came out").

```tsx
// Correct — the page decides the action and owns the UndoBar
<Stage lead="This is what came back.">
  <List width="with-margin">{rows}</List>
  <Arrive show={!leaving}><RiffCard key={open.id} riff={open} isAction={!busy} onDraft={(a) => draftAngle({ angleId: a.id })} onDismiss={dismiss} /></Arrive>
  <UndoBar show={undo != null} width="with-margin" onUndo={restore}>{undo ? dismissedSentence(undo) : null}</UndoBar>
</Stage>

// Incorrect — the code name on screen, and a hand-made count
<Text>3 angles in this riff</Text>
```

## AngleTabs

The ideas of one riff as Tabs (lab 22): picking one swaps the panel and moves
the highlighter. RiffCard uses it; use it alone only where the same ideas are
shown without the card (Studio). Controlled: `value`, `onValueChange`,
`children(angle)` renders the open panel. Segmented is wrong here: picking
changes what is shown (controls.md).

```
How many ideas?
 ├── 1     → no tabs; the panel stands alone
 ├── 2–5   → Tabs, labelled by angleTabLabels()
 └── 6+    → still Tabs today; a riff past 5 is a data problem to fix upstream
```

Labels: the idea's kind when every idea has one ("Backstage" for Behind the
scenes, a repeat numbered "Story 2"), else "Idea 1", "Idea 2". Never the hook:
a tab is ≤ 12 characters.

## Row title — decided 2026-11-15

`riffTitle(riff)`, in order:

1. **The first idea's hook** (angle 0, drafted or not), so the row keeps its
   name while the person works through it. It is written to be a first line:
   short, specific, says what the material is for.
2. **The scrap's first sentence**, while it is still being read or failed,
   with leading dots, commas and dashes stripped (a spoken "so," stays) and
   clipped at 120 characters.
3. **The source**, when there are no words yet: "New voice note" for a kind
   of material, "New from Slack" for a vendor, "New note" with no label.

Not the scrap's first sentence always, as kit-test guessed: a spoken take
opens with filler ("…so, the deploy thing.") far more often than the point.

## Data gaps

- **The sentence an idea stands on** is stored since 2026-11-16:
  `riff_angle.line` (text, default ""), asked of the model as `line` in the
  angle schema (required, "" allowed) with one rule in `ANGLE_BASE_RULES`,
  cleaned by `settleLine` on every insert, and resolved on read by `markFor`
  into `Angle.mark` (`{ line, span }`). lib/source-span.ts forgives
  whitespace, curly quotes, dashes, "…", case and wrapping quote marks, and
  returns nothing for a paraphrase, a quote under 8 or over 240 characters,
  or a quote not in the scrap. The span is always found in code, never taken
  from the model. No mark (every angle written before the column, and one
  drawn from the whole material) renders as plain prose with the idea in
  the margin. The ≤ 6-word `note` is not started.
- **A take's length** is not on `Riff`; `meta` carries it ("4:12").
- **`CHANNELS_FOR_SHAPE`** is read from lib/riffs.ts in a client component,
  as `components/riffs/channel-gap.tsx` already does. That module imports
  the database; moving the table to a client-safe module is a small follow-up.

## ProvenanceMark

A riff's provenance: `SourceMark` plus "From @handle's post" when the idea is
borrowed (`Riff.adaptedFrom`), on the same line, because a borrowed idea is a
fact for the moment of deciding. Props: `riff` (`Pick<Riff, "sourceId" |
"sourceLabel" | "capturedAt" | "adaptedFrom">`), `meta`. The link opens the
original in a new tab.

```tsx
// Correct
<ProvenanceMark riff={riff} meta="4:12" />

// Incorrect — the borrowed post hidden behind a click
<SourceMark id={riff.sourceId} label={riff.sourceLabel} /><Button>Show source</Button>
```
