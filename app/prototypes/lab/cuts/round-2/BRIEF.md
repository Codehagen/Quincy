# Cuts, round 2 — the cursor

## Picks

The owner kept **02, 06, 07, 09, 10, 12, 14, 16** (2026-11-17). In his words:

> "Keep: 02, 06, 07, 09, 10, 12, 14, 16 jeg liker også hvordan [et
> nettleser-agent] gjør det når den viser cursor hvor den går. Jeg skjønner
> at det ikke er cursor som redigerer, men personer syns det er WOW når de
> ser ut som cursoren gjør det foran dem, og det vil være som magic. At den
> trykker og highlighter i rask speed. Slik at det ser ut som den jobber
> fort."

In English: he likes how a browser agent shows its cursor moving to where it
acts. He knows the cursor is not what edits, but people find it "WOW" when a
cursor seems to do the work in front of them, like magic. It presses and
highlights at high speed, so it looks like it works fast. (The reference is
described by what it does: an agent's cursor that moves to each target,
presses and highlights at speed. It is not named.)

On the margin, also his words: "Også for sidebaren ønsker jeg at vi skal
bruke best practice fra Shadcn": the chat margin follows shadcn's AI
Elements anatomy.

## What the kept pieces share — keep all of it

- **02's desk is the base surface of every piece**: a large preview, the
  full lanes under it, the chat as a narrow margin of short prose.
- 06: the lanes move while the chat talks.
- 07: the receipt is prose, with the length against the take.
- 09: one run is one revision; Undo and Redo really toggle it.
- 10: ask first, once. The question is the receipt in advance; lines can
  be unticked; Go on Enter; "Just go on this project".
- 12: the empty chat says what Quincy already read, then whole starters.
- 14: the sample opens free.
- 16: three cuts from one take.
- Quincy's work is visible and reversible as one unit.

## Discarded — leave out

01 (chat first, timeline in a drawer), 03 (transcript as the timeline), 04
(the cut on a grey stage), 05 (phone in the middle and its scenes row), 08
(marks on the transcript), 11 (questions while it uploads), 13 (copy the
pacing), 15 (each answer is an edit), 17 (held for your read), 18 (export),
19 (the cut becomes a post), 20 (drag words to the cut).

## New: Quincy's cursor

A second cursor that is clearly Quincy's (an ink arrow with a name tag or
the friend; never the pen blue). It draws the op stream: it glides to each
op's real target (a pause on the waveform, the "um", the caption lane's
button, the strong line, the caption on the picture), presses (a short
ring), and the target flashes and changes at that moment. Fast: a glide of
120–200 ms with a strong ease-out, a press of about 80 ms, a short dwell; a
whole tighten run reads in 2–4 s.

**The contract, for building it for real.** Every edit is a tool part whose
input carries a `target`, the `data-q` of the element it acts on. The cursor
reads the stream and nothing else. `input-available` is the glide;
`output-available` is the press, at the instant the target changes. A press
that is not an op cannot be drawn, because there is nothing else to read.
Positions are measured from the DOM at each glide, never hardcoded, so when
an earlier op moves the lanes, the next glide goes to where the target now
is. `round-2/cursor.tsx` (`AgentCursor`) is built this way, so it can move
into the kit.

- The person's pointer stays theirs. Quincy's cursor is a drawn layer that
  takes no input. Esc, or Stop in the margin, stops the stream; the cursor
  parks and every edit that landed stays whole.
- It plays once, when the piece is first on screen, and holds the end.
  Replay is in the margin.
- Reduced motion: no cursor, no glide. The targets still change in order,
  each with a brief highlight.

## The chat margin: AI Elements anatomy on the kit, driven by the scripted transport; the cursor reads tool parts

Every piece's chat runs through the real `useChat` lifecycle on
`@shadcn/helpers/ai-sdk`: `createChat()` turns and `chat.transport()`,
the shape of `lib/chat-fixtures/*` (fixtures in `round-2/chat.ts`). There is
no model, no API route and no network. Edits use the editor's real tool
names (`remove_silences`, `delete_clip`, `add_captions`, `punch_in`,
`reframe`; `move_captions`, `check_frames`, `read_take`, `plan_cut` and
`cut_variant` are new to this lab). The patterns, rebuilt on the kit in
`round-2/elements/` (anatomy and behaviour copied, never shadcn's styles or
icons):

| Kept idea | Pattern | Here |
| --- | --- | --- |
| 06, the run | Task and Tool on Trace | every step the same line; the task folds to one summary when the run ends |
| 07, the receipt | the text part after the steps | `MessageText` |
| 09, one run, one undo | Checkpoint | a marker after the run; Undo returns to before it, Redo puts it back |
| 10, ask first once | Confirmation | a `needsApproval` tool; Go is `addToolApprovalResponse`, wired with `sendAutomaticallyWhen`; unticked lines ride on the approval's reason |
| 12, starters | Suggestion | one press sends a whole request |
| 16 and variants | Subagent | three `cut_variant` parts streaming their own steps as preliminary outputs, then the recommendation |
| self-check | a Tool whose output carries frames | `check_frames` |
| reading the take | a Tool with preliminary outputs | `read_take`: transcribing, reading the picture, reading the delivery |

## Also new

- **Variants.** One prompt makes three cuts in parallel, each with its own
  brief and hook. Quincy recommends one with a reason in words ("the hook
  lands at 0.8 s"), never a numeric score.
- **Self-check.** After a run, Quincy renders a few frames and looks at its
  own cut. This is a step in the run: "Looked at 3 frames: the caption
  covers the chin at 0:04", then it moves the caption up.
- **Reading the take on upload.** A short scan stage (transcribing, reading
  the picture, reading the delivery) that ends in what Quincy noticed.

## The asks

- **a, 21–25: the cursor in the 02 layout.** Five takes on how Quincy's
  cursor looks and moves while it tightens the take: tag or friend, the
  press ring, a trail or none, the highlight colour within the kit rules,
  speed, and narration in sync with the margin.
- **b, 26–30: run, receipt, undo with the cursor (06 + 07 + 09).** The
  cursor's run ends in the prose receipt and the single checkpoint. Undo
  either makes the cursor run backwards fast or just reverts; both are
  shown. 10's ask-first-once is the gate before the cursor starts. Stop
  keeps what landed.
- **c, 31–35: the first run (12 + 14 + reading the take).** Drop the take or
  open the free sample, then the scan stage, then starters that say what
  Quincy read. Pick one, and the cursor makes the first cut.
- **d, 36–40: several cuts (16 + variants + self-check).** Three cursors
  work three cuts at once, then the recommendation with a reason, the
  self-check and picking one. 05's scenes row is not kept, so each piece
  finds the three cuts a home inside the 02 layout: stacked spines, small
  previews over the lanes, a switch, or three columns.
