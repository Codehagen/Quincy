# Plan 037: Cuts — speech cut the way a person hears it

## Status

| Part | What | Spend | Status |
| --- | --- | --- | --- |
| 1 | Stumbles: repetitions, false starts and set-off filler phrases, from the transcript | none | DONE |
| 2 | The transcript shows what a cut took, and puts it back | none | DONE |
| 3 | Readable caption lines (caption rules v2) | none | DONE |
| 4 | Cut edges snapped to quiet audio, and a frame of soft sound at each join | none | DONE |
| 5 | A clean-up reviewed before it cuts | none | DONE |
| 6 | A cleaned voice track | function time; cooldown + zero-cost row | DONE |
| 7 | Chapters, bound to the source | none | DONE |
| 8 | Record a take in the browser, with a teleprompter | none | DONE |
| 9 | Preview speed | none | DONE |
| 10 | A cut style kept in the Brain | none | DONE |
| 11 | Stored documents repaired on load | none | DONE |

## Why

Filler sounds were the only stumble Quincy could cut. A take has more that
cost the same seconds and read worse in captions: "we we shipped", "we should,
um, we need to", "it was, like, huge". Every one of them is visible in a timed
transcript, so finding them is rules over words, timings and punctuation, with
no model call and nothing bought. That also makes every result explainable:
each names its kind and its words, and the receipt counts them.

The rest follows from the same idea, that the transcript is the edit: a cut
should be readable where it was and reversible in one press, a caption line
should end where a reader expects it to, and a join should not click.

## What was built

- **`lib/editor/disfluency.ts`**: `detectDisfluencies` (hesitation, then
  repetition, then false start, then discourse; each word claimed once, the
  more certain reading first), `cleanUpCuts`, the receipt. English and
  Norwegian word lists, with doubles people mean ("very very", "nei nei")
  left alone. Agent tool `clean_up_speech`, gate-exempt for the reason given
  in `gate.ts`.
- **`lib/editor/transcript-edit.ts`**: `cutAways` (the words a cut took, by
  gap, with where the cut joins) and `cleanUpReview`. The studio reads the
  recording's transcript when the panel opens and shows both; Restore is
  `restoreSpeech` in `tools.ts`, which grows the neighbouring piece back over
  the gap.
- **`groupReadable`** in `transcript.ts`: lines of the asked size plus up to
  two, never ending on a weak word, broken at sentence ends and pauses, filler
  sounds hidden. New projects carry `settings.rules.captions = 2`; older ones
  keep rules 1 and the captions they were made with.
- **`refine-cuts.ts`** snaps cut edges into the quietest nearby audio without
  entering a word; **`audio-edges.ts`** ramps one frame at joins that skip
  source.
- **The cleaned voice**: see docs/video-ingest.md, "The cleaned voice".
- **Chapters**: `metadata.chapters`, bound to source time, validated in
  `chapters.ts`; agent tool `set_chapters`; headings in the transcript and
  "Copy chapters".
- **Recorder**: `record-take-panel.tsx`, feeding the upload a dropped file
  takes. The script stays in localStorage.
- **Cut style**: Brain kind `cut_style` (pause and caption defaults), read at
  the start of each run and saved by `save_cut_style` when the person asks.
- **`sanitize.ts`**: NaN or negative times, trims past the source, a missing
  current scene, repaired in `getProject` so every reader opens the same
  document.

## Verification

`pnpm typecheck`, `pnpm lint`, `pnpm test`. Not yet verified in a browser:
the recorder (needs a camera), the voice track on a real upload, and the
transcript panel against a long take.
