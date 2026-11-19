# Cuts, round 1 — wide

The video editor (**Cuts** in visible copy, decisions.md "Cuts, not Studio")
has no decided direction. This round asks it from zero, after a study of a
chat-first AI video editor the owner liked. The reference gives ideas, each
described here by what it does; it never gives a layout, and it is never
named.

## Stance

- **Quincy cuts, you export.** The video form of "Quincy drafts, you send"
  (docs/vision.md). Nothing posts from the editor; a cut waits for the
  person's read.
- **What the editor does today** is in plans/031: a spine of clips, a
  caption lane and an effect lane; the transcript as a second edit surface;
  one agent run is one revision and one undo; the run holds the timeline
  read-only while it works; tools `remove_silences`, `add_captions`,
  `reframe`, `punch_in`, `apply_look`, `fade_clip`, `split_clip`,
  `delete_clip`. Pieces may go past it (several cuts per recording, the cut
  becoming a post); those are directions, not claims.

## The fixture

One recording in every piece, so the pieces differ only in the idea: a
37-second founder talking head about shipping a shorter onboarding ("We cut
it from seven screens to two"). Two long pauses (2.3 s and 1.8 s), a filler
"um", a strong line worth a push-in ("The screens weren't the product. They
were in the way."), and a target of a 9:16 for X and LinkedIn. The cut is
37.0 s in, 32.5 s out. Where the cut becomes a post, it has the three beats.
Data lives in `fixture.ts`; the shared drawing (frame, picture, timeline,
transcript, chat lines, hand-drawn marks) in `parts.tsx`.

## Rules for every piece

- Built from `@/components/kit` on the `--kit-*` tokens, at 960×720 scaled
  into the 4:3 frame. An app surface, not a marketing picture.
- The action is the ink pill, one per view; selected is the well grey; blue
  is the pen and only names a draft's beats. At most one accent beyond ink
  and the pen (the highlighter's yellow, or the kit's green check).
- What a run removed is folded or faint, never struck through
  (decisions.md, "Strikethrough diffs").
- Work in progress is the friend's working state plus words.
- Hugeicons only; transitions name their properties; scripted pieces rest
  on a meaningful state, replay only when pressed, and jump to the end
  under reduced motion.

## The asks

- **a, 01–05: the layout of the editor.** Chat beside preview and timeline,
  balanced five ways: chat first with the timeline as a drawer; timeline
  first with chat as a margin; a transcript rail that replaces the lanes for
  a talking head; one focused cut on a grey stage; a phone-frame preview
  for the 9:16, with a scenes row over the timeline.
- **b, 06–10: the run and its receipt.** Ops landing on the lanes while the
  chat talks; a receipt in prose; marks on the transcript (folded cuts, a
  highlight on the strong line, a margin note); one run as one undo chip;
  an ask-first default that is not a toll.
- **c, 11–15: the first run.** Questions answered while the take uploads;
  starter requests on an empty chat; an inspiration slot that copies a
  short's pacing; the sample that opens without spending; every answer
  shown as the edit it becomes.
- **d, 16–20: several cuts, and the hand-off.** Three cuts from one take;
  the cut held for your read; export with honest progress; the cut becoming
  a post draft in three beats; cutting by dragging sentences into a cut
  column, with a switch between cutting video and copying text.
