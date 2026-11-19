# Plan 042: Cuts — the basics, built our own way

> **Executor instructions**: This is a programme plan. Each phase below is its
> own branch, its own PR and, before code, its own detailed plan
> (`plans/043…`), written against the code at that moment. Do not start a
> phase before the one it depends on is merged. On a STOP condition, stop and
> report.
>
> **Drift check (run first, every phase)**:
> `git diff --stat 484f6f6..HEAD -- lib/editor components/editor app/api/editor "app/(app)/cuts"`
> On any change, compare the claims under "What exists" with the live code; a
> mismatch is a STOP.

## Status

| Phase | What | Tier | Effort | Spend | Depends on | Status |
| --- | --- | --- | --- | --- | --- | --- |
| A | Add media to a project: a second take, b-roll, images | Basic | L | storage only | — | TODO |
| B | Text and titles | Basic | M | none | — | TODO |
| C | Music and sound, ducked under speech | Basic | M | storage only | A (upload into a project) | TODO |
| D | Correct a word without cutting it | Basic | S | none | — | TODO |
| E | Export: caption files, chapters, resolution | Basic | S | none | — | TODO |
| F | Speed per clip | Basic | M | none | — | TODO |
| G | Transitions between clips | Basic | S | none | — | TODO |
| H | Settings: the project's frame, rate and background | Basic | S | none | — | TODO |
| I | Caption style presets | Later | S | none | B | TODO |
| J | Look presets | Later | S | none | — | TODO |
| K | Speakers in the transcript | Later | S | none | — | TODO |
| L | Short clips from a long recording | Later | L | model spend | A, B | TODO |
| M | Picture in picture and two-person layouts | Later | M | none | A | TODO |
| N | Import caption files, export an edit list | Later | M | none | E | TODO |
| O | Background removal | Later | L | model spend | A | TODO |

- **Priority**: P1 for A–E (owner, 2026-11-19: "some basic things we must have"), P2 for F–H, P3 for I–O.
- **Planned at**: commit `484f6f6`, 2026-11-19.
- **Rule for this whole plan**: everything is our own code. No editor code is
  copied or vendored from elsewhere. Open file formats (SRT, WebVTT, CMX 3600
  EDL, FCPXML) are specifications, not code, and are fine to implement.

## Why this matters

Cuts is strong on speech: transcript cuts, stumble clean-up, restore, readable
captions, chapters, a cleaned voice, a recorder. What it cannot do is build a
video out of more than one recording. The rail in
`components/editor/studio-frame.tsx` (`RAIL`) shows Images, Sounds, Text,
Transitions and Settings as "not built yet", and the library
(`studio-library.tsx`) says plainly that "there is no way to add a second
recording to a cut". These are the basics a person expects from any editor.

We build the basics, not a feature catalogue. Every phase ships twice: as an
agent tool Quincy uses, and as a control a person presses, writing the same
ops. That is the point of the product: Quincy does the edit, the person can
correct it by hand, and one undo takes a run back.

## What exists (from the code at 484f6f6)

- **Document** `lib/editor/types.ts`: `TrackKind` already has `video`,
  `broll`, `audio`, `caption`, `text`, `graphic`. `TextElement` exists.
  `AudioElement` exists with `ducking` (derived from the transcript's words).
  `VideoElement` comments already separate `durationUs` from the trim window
  "only equal at normal speed", so speed has a place to live. There is no
  image element.
- **Compositor** `components/editor/composition.tsx` renders `video`,
  `caption` and `text`. It does **not** render `AudioElement`: a music track
  in the document would be silent today. Preview and export share this one
  compositor (`use-export.ts`, `@remotion/web-renderer`), so anything added
  here exports as it previews.
- **Upload** `app/api/editor/uploads/route.ts`: hash first, presigned PUT to
  R2, dedupe by hash, limits checked before bytes. `upload-drop.tsx` then
  creates a *new* project (`router.push('/cuts/' + projectId)`). Nothing adds
  an asset to an existing project.
- **Transcriber** `lib/editor/transcriber-deepgram.ts` requests `diarize`
  by default, so speaker turns are already in the transcript.
- **Agent** `lib/editor/agent.ts` `editorTools()`: `remove_silences`,
  `remove_fillers`, `add_captions`, `reframe`, `split_clip`, `delete_clip`,
  `crop`, `punch_in`, `clear_punch_in`, `apply_look`, `clear_look`,
  `fade_clip`, `clean_up_speech`, `read_transcript`, `set_chapters`,
  `clean_sound`, `save_cut_style`, `describe_timeline`. The gate is
  `lib/editor/gate.ts`. Ops carry a `target` so the cursor can show them
  (plan 036's contract: a cursor press is an op landing).

## The contracts every phase keeps

1. **One op set, two hands.** The agent tool and the manual control call the
   same builder in `lib/editor/tools.ts` and emit the same ops. No phase adds
   a code path only one of them can reach.
2. **Every op has a target** the cursor can press (plan 036).
3. **Preview is export.** New element kinds are drawn in `composition.tsx`
   and nowhere else.
4. **Adding is not gated, removing is.** Adding media, text, music or a
   transition never asks first. A change that removes more than the gate's
   threshold still asks (`gate.ts`).
5. **Stored documents keep opening.** A new field is optional, and
   `sanitize.ts` repairs or drops what an older document cannot carry.
6. **The rail button turns on in the phase that makes it work**, never before.

## UI patterns to get right

Studied 2026-11-19 in two open editors (read for approach only, nothing
copied). Most of the work in these phases is UI, and these are the parts
that decide whether it feels right. Each detailed phase plan specifies them.

1. **Placement is a pure function** (A, B, C, M). Dropping something answers
   two questions before any op: which track, and at what time. Write it as
   `resolvePlacement(scene, elementKind, span, strategy) → existing track |
   new track at index`, tested without a DOM. Rules:
   - each element kind has one track kind (image → `broll`, music →
     `audio`, title → `text`);
   - tracks are ordered overlays above, the spine in the middle, audio
     below; a new audio track never lands above the spine;
   - clips on one track never overlap: if the span does not fit, the drop
     makes a new track instead of covering what is there;
   - the spine stays magnetic: it starts at 0 and has no gaps (our
     `rippleOps` already does this);
   - the agent's tools call the same function, so Quincy and a hand land
     things in the same place.
2. **Drop feedback before the drop** (A). While dragging from the library,
   draw where it will land: a ghost on the target track, or a line between
   tracks when a new one will be made.
3. **Snapping** (A, B, F, G). On the timeline, snap to clip edges, the
   playhead, chapter marks and word edges, within about 10 screen pixels
   (converted to time at the current zoom). Show a line when it snaps. Hold
   Shift to turn it off. Snapping to word edges is ours: no cut lands inside
   a word.
4. **Handles on the preview** (A, B, M). Selecting an image, a title or a
   picture-in-picture shows move, scale and rotate handles on the preview.
   Snap to the frame's centre lines and edges within about 8 screen pixels,
   rotation to every 90° within 5°. Shift turns snapping off. Corner handles
   keep the aspect.
5. **Edit text where it is** (B). Double-click a title on the preview to type
   in place; Enter or a click outside commits as one op, Escape cancels.
   The same for a word in the transcript (D).
6. **One properties panel, tabs by kind** (A–G). A registry from element kind
   to tabs (Transform, Text, Sound, Speed, Effects), so a new kind adds an
   entry instead of a new panel. Our rail opens the library; the selected
   clip's settings live in the toolbar row that already holds effects.
7. **Volume on the clip** (C). A level line drawn across an audio clip that
   you drag up or down, with the ducking envelope shown under it.
8. **Speed as a few presets plus a number** (F). 0.5×, 1×, 1.5×, 2× and a
   field, pitch kept by default. Speed belongs to the clip, and the time maps
   both ways (`clip time ↔ source time`) in one helper that captions,
   restore and the cursor all use.
9. **Export in one dialog** (E). Video (resolution: source, 720p, 1080p,
   4K), sound only, and text (SRT, VTT, plain transcript, chapters). The
   resolution default follows the source.
10. **Every drag is one undo** (all). Group the ops of a drag or a typed edit
    into one revision, as trim already does.

Where the studied editors leave a gap we fill it ourselves: neither has
transitions between clips, and only one of them binds the timeline to the
transcript. Phase G and the transcript rules (word-edge snapping, corrected
words keeping their source) are designed here, not borrowed.

## Phases

### A. Add media to a project (L)

The foundation for B-roll, images, music and layouts.

- Upload into an existing project: the upload route takes an optional
  `projectId`; the drop and the library's new "Add" button use it instead of
  creating a project.
- A second take lands as a new clip on the spine or a new scene; b-roll lands
  on a `broll` track over the spine, muted by default.
- New `ImageElement` (`kind: "image"`, `mediaId`, `durationUs`, `transform`,
  `fit`, `animations`), drawn in the compositor. Ingest for images is store
  and thumbnail only: no transcript, no proxy.
- The Images rail opens the library filtered to images.
- Agent tool `place_media`: puts a library item at a word or a time
  ("show the dashboard while I talk about numbers"). It reads the transcript
  to find the moment; it never fetches media from the web.
- **Verify**: two-recording project previews and exports; an image over the
  spine for 3 s exports at the same frames it previews; an old document opens
  unchanged.

### B. Text and titles (M)

- The Text rail: add a title card, a lower third (name and role) and an end
  card. Three styles, built on `CaptionStyle`, editable in place on the
  preview.
- Agent tool `add_text`: writes the words from the transcript and the Brain
  (the person's name and role), places them, reports what it wrote.
- **Verify**: a lower third added by hand and one added by Quincy are the same
  ops; both export.

### C. Music and sound (M)

- Render `AudioElement` in the compositor, with `volume`, fades and the
  `ducking` envelope already in the type.
- The Sounds rail: upload a track (through phase A's upload), place it under
  the cut, set the bed level, ducking on by default.
- Agent tool `add_music`: chooses from the person's own uploaded tracks only.
  A licensed library is out of scope.
- **Verify**: speech stays intelligible with a bed at 0.2; exported loudness
  of the voice is unchanged with ducking on.

### D. Correct a word without cutting it (S)

- In the transcript panel, edit a word's text. Only `CaptionToken.text`
  changes; the source binding and the timing stay.
- Find and replace across the take ("Quinsy" → "Quincy").
- A per-person vocabulary in the Brain (names, products, terms) that the
  agent applies after transcription, with a receipt that lists each change.
- Agent tool `correct_words`.
- **Verify**: a corrected word still cuts and restores at its original source
  range.

### E. Export: caption files, chapters, resolution (S)

- Download captions as SRT and WebVTT, built from the same lines
  `groupReadable` shows.
- Chapters as plain text (already copyable) and as WebVTT chapters.
- Resolution choice at export: 720p, 1080p, source. The canvas aspect is kept.
- Quincy attaches the caption file when a cut goes to publishing.
- **Verify**: the SRT's times match the exported video's captions frame for
  frame on a fixture take.

### F. Speed per clip (M)

- `VideoElement.speed` (0.5–2, absent is 1). `durationUs` follows from the
  trim window and the speed. Audio keeps its pitch.
- A speed control in the clip toolbar; agent tool `set_speed`.
- Gate: a speed-up that shortens the take past the gate's threshold asks
  first, as a removal would.
- **Verify**: captions stay on their words at 1.5×; restore and the
  transcript's cut-aways still find their source ranges.

### G. Transitions between clips (S)

- Three: cross dissolve, dip to black, dip to white. Stored on the join
  between two adjacent clips, with a duration.
- The Transitions rail; agent tool `add_transition`.
- **Verify**: a dissolve borrows handle frames and never shortens speech; a
  join with no handle says so instead of doing nothing (plan 040's rule).

### H. Settings (S)

- The Settings rail: frame shape (the same three `reframe` uses), frame rate,
  background colour, caption rules version.
- No agent tool: the existing `reframe` covers what a person asks for.

### I–O. Later

- **I. Caption style presets**: four to six named looks over `CaptionStyle`,
  beside the cut style kept in the Brain.
- **J. Look presets**: warm, cool, punchy, black and white, built from the
  adjustments in `effect-catalogue.ts`; no new effect types.
- **K. Speakers**: show the speaker turns the transcriber already returns;
  name a speaker once; cut by speaker ("remove everything the host says
  before the guest starts").
- **L. Short clips from a long recording**: find the strongest stand-alone
  passages, cut each in the person's cut style, with captions and a title.
  Builds on three cuts (`three-cuts.ts`). Spends model time: metered,
  entitlement-gated, AGENTS.md › Money.
- **M. Picture in picture and layouts**: a second video over the spine at a
  corner; a side-by-side for two people.
- **N. Import a caption file; export an edit list** (CMX 3600 EDL, FCPXML) for
  people who finish elsewhere.
- **O. Background removal**: needs a segmentation model; plan it with a cost
  number, like the cleaned voice.

## Deliberately not built

- A template marketplace, stickers, trending sounds, an effects catalogue.
  They trade depth for volume (docs/vision.md).
- Voice cloning to insert words that were never said. Quincy publishes in the
  person's name; a fabricated word is a trust problem.
- Video generated from a prompt. A different product.

## Commands you will need

| Purpose | Command | Expected |
|---|---|---|
| Typecheck | `pnpm typecheck` | exit 0 |
| Lint | `pnpm lint` | 0 errors |
| Tests | `pnpm test` | all pass |
| Mock studio | `pnpm dev`, then `/prototypes/cuts-mock` | the phase's control works on the fixture take |

## STOP conditions

- The compositor stops being the one renderer for preview and export.
- A phase needs an op the cursor cannot target.
- A phase would need code copied from another project.
- Phase A shows that a second asset per project needs a schema change to the
  project or asset tables beyond a join. Report the shape before migrating.
