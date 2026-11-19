# Plan 036: Cuts — Quincy works the desk in front of you

> **Executor instructions**: Follow this plan phase by phase. Each phase is
> its own branch and its own PR; do not start a phase before the previous one
> is merged. Run every verification step and confirm the expected result
> before moving on. If anything in "STOP conditions" occurs, stop and report —
> do not improvise. When a phase is done, update its status row below and the
> row in `plans/README.md`.
>
> **Drift check (run first, every phase)**:
> `git diff --stat 4b458c4..HEAD -- components/editor lib/editor app/api/editor "app/(app)/cuts" components/ui components/ai-elements`
> On any change, compare the claims under "What exists" with the live code; a
> mismatch is a STOP.

## Status

| Phase | What | Spend | Effort | Status |
| --- | --- | --- | --- | --- |
| A | The cursor, the run in the margin, the receipt, one undo, the gate | none new | L | DONE (uncommitted) |
| B | Filmstrip with waveform, and the reading of the take that writes the starters | none new | M | DONE (uncommitted) |
| C | The self-check: Quincy looks at its own cut | new model spend | M | DONE (uncommitted) |
| D | Three cuts from one recording | 3× a run | L | DONE (uncommitted) |
| E | The desk: objects on the recess, the lab's waveform, a ruler that reads | none | M | DONE (uncommitted) |
| F | The mock: the real editor on a fixture take, for tuning the motion | none | S | DONE (uncommitted) |
| G | Arrival and pace: the scan on first open, replays that wait like a model, the self-check's black frame | none | M | DONE (uncommitted; not verified in a browser) |
| H | A calm margin: shadcn's Chat pattern as shipped, one entrance per moment | none | M | DONE (uncommitted; verified in the mock) |

- **Priority**: P1 for A and B (owner, 2026-11-17: "make it ready now"); C and D follow.
- **Risk**: MEDIUM. A and B change the editor's most visible surface but spend nothing new. C and D spend money on a person's behalf and fall under AGENTS.md › Money.
- **Planned at**: commit `4b458c4`, 2026-11-17.
- **Decided in**: the Cuts lab, `/prototypes/lab/cuts`, rounds 1–5. Pieces **52** (one cut) and **53** (three cuts) are the reference for every phase. Read `app/prototypes/lab/cuts/round-4/BRIEF.md` (the motion timeline) and `round-5/BRIEF.md` (the gate and the audit) before writing code.

## Why this matters

Cuts works today (plans/031): you say the edit, the ops stream into the
timeline, one run is one undo. But the work is invisible — the lanes change
and the chat prints lines. The lab showed that the same run, drawn as a cursor
that drag-selects a pause, presses ⌫ and watches the gap close, reads as
Quincy *doing the edit in front of you*. The owner's words: "people find it
WOW when it looks like the cursor does it in front of them; it clicks and
highlights at high speed, so it looks like it works fast."

This is not decoration. Every press is one real op landing on its real
target, so the cursor is the most honest receipt the editor can give: you see
what changed, where, in order, and one undo takes it back.

## What was decided (and what lost)

Write this block into `docs/design/decisions.md` in phase A, step 1.

| Decision | Chosen | Lost, and why |
| --- | --- | --- |
| Layout | Timeline first: large preview, full lanes, chat as a narrow margin (lab 02) | Chat-first with lanes in a drawer (01), transcript as the timeline (03), one cut on a grey stage (04), phone in the middle (05): each hid the lanes a hand-cutter needs |
| The run | Ops land on the lanes while the margin counts steps; lanes read-only under the reason (06) | — |
| Quincy's cursor | An ink arrow with a "Quincy" name tag (21/41/49/52) that operates the desk like a person, compressed | The friend riding along (22/42): softer, but the name says whose hand it is. Numbered presses (23), the tag narrating the op (25): more to read, less to watch |
| Target tone | Ink by default; the highlighter yellow (24/43/50) is the tuned alternative and stays off | Yellow on every hit reads as alarm on a long run |
| Receipt | One summary line with the numbers, then prose that names what changed in words only (07, audit 7) | Steps-as-receipt (26): too long after a big run |
| Undo | One run = one revision chip = one undo, no cursor on undo (09, 28) | Undo running the cursor backwards (27): charming once, slow every time after |
| Stop | Esc/Stop parks the cursor and keeps what landed; unlanded steps read "skipped" (30) | — |
| The gate | **Edit without asking unless the change is very large** (owner, round 5). Ask only when a run would remove more than 30 % of the take's length, or remove whole spoken sentences (not fillers or pauses), also on the first run. Never for pauses, fillers, captions, push-ins, looks, fades or reframes | Ask every time (45): kills the cursor. Ask once per project (46): the owner found even that one question too many |
| First run | The sample opens free (14); the reading of the take ends in what Quincy noticed (31); starters carry the reason they exist (32); after a run starters become next steps and never re-offer a finished request | Questions while uploading (11), copy this pacing (13), each answer is an edit (15) |
| Self-check | Quincy looks at three frames of its own cut and fixes what it sees (38) | — |
| Several cuts | Three cuts in the desk, one large preview of the recommended cut, three spines in the lanes panel, three cursors that never move in lockstep, a recommendation in words, never a score (48/51/53) | Three columns (40/47): previews too small to judge |
| Clips | Filmstrip of frame tiles with the waveform under it, inside one clip (round 5) | Waveform only |
| The chat margin | **Real shadcn** (registry components + the AI Elements patterns copied into `components/ai-elements/`), scoped to the kit by `.cuts-shadcn` | AI Elements anatomy rebuilt on our own kit (round 2): the owner asked for shadcn itself |

**The shadcn decision departs from AGENTS.md** ("New UI uses the kit's
`--kit-*` tokens"). In phase A, step 1, add one paragraph to AGENTS.md under
"Base UI, not Radix": the editor's chat margin is built from shadcn registry
components and `components/ai-elements/`, themed to the kit by a scope class
that maps shadcn's variables onto `--kit-*`; nothing else in the app uses
them without a decision of its own.

### The motion numbers (owner: "the defaults feel good")

From `app/prototypes/lab/cuts/round-4/` `DEFAULT_TUNE`, locked:

```
glide: 110–220ms (distance / 4, clamped) · press: 90ms · gaps: 140→60ms
(shrinking through the run) · tone: ink · ring: on · speed: 1×
easing: cubic-bezier(0.23, 1, 0.32, 1) on the glide (a transition, so a new
target retargets) · next glide starts press + 80ms
```

The full per-element timeline (lead, support, decoration, what does not
move) is the table in `round-4/BRIEF.md`; port it as written.

## What exists (from the code at 4b458c4)

- **Agent route** `app/api/editor/projects/[id]/agent/route.ts`: `streamText`
  → `toUIMessageStream`, entitlement gate, `ceilingVerdict` /
  `inputVerdict` above the lock, `lockProject` per project, `recordUsage`.
- **Tools** `lib/editor/agent.ts` `editorTools()`: `remove_silences`,
  `add_captions`, `reframe`, `split_clip`, `delete_clip`, `crop`, `punch_in`,
  `clear_punch_in`, `apply_look`, `clear_look`, `fade_clip`,
  `describe_timeline`. Each reports in prose what changed (`remove_silences`
  already states the share of the take it removed).
- **Ops stream as transient `data-ops` parts** and go straight into the
  document (`components/editor/studio-chat.tsx`, `onData`), deliberately not
  kept in `message.parts`. This is the stream the cursor reads.
- **Document** `lib/editor/types.ts`: `VideoDocument.scenes: Scene[]` with
  `currentSceneId`; a scene is an independent timeline over the same assets.
  Phase D needs no new document shape.
- **Lanes** `components/editor/studio-lanes.tsx` already draw filmstrips
  (`Filmstrip` sheets) and a waveform.
- **Ingest** `lib/editor/ingest.ts` has a `vision` port that nothing wires.
- **Lab reference code** to port, not import: `app/prototypes/lab/cuts/round-4/`
  (`director.ts`, `cursor.tsx`, `lanes.tsx`, `motion.css`) and `round-5/`.
  shadcn components are installed in `components/ui/` (`button`, `message`,
  `bubble`, `trace`, `marker`, `item`, `collapsible`, `separator`,
  `checkbox`, `message-scroller`) and patterns in `components/ai-elements/`
  (`tool`, `task`, `subagent`, `confirmation`, `checkpoint`, `suggestion`,
  `status-icon`); `class-variance-authority` was added for them.

## The one contract every phase keeps

**A cursor press is an op landing.** The cursor never draws anything that did
not happen.

- Every op that changes the document carries a `target`: the id of the
  element it acts on (clip, caption range, effect, the captions button), and
  for range ops the time range. Add `target` to the op type in
  `lib/editor/ops.ts`; the builders in `edits.ts` / `tools.ts` fill it.
- The client resolves `target` to a DOM node by a `data-target` attribute on
  the lanes, measured at glide time (never hardcoded coordinates).
- Order: a `data-ops` part arriving starts the gesture (glide, hover, drag
  selection); the document change and the press land together. If the part
  arrives before the gesture finishes, the change waits for the press, at most
  one press (≤ ~300 ms), never longer.
- Replay, Stop, Undo and unmount cancel every pending timer
  (`AbortController`). Nothing stacks.
- `prefers-reduced-motion`: no cursor, no drag boxes; targets change in order
  60 ms apart with an opacity-only highlight.
- The person's pointer is never covered: everything Quincy draws is
  `pointer-events: none`.

## Phase A — the cursor, the run, the receipt, the gate

**Branch** `feat/cuts-at-the-desk`.

1. **Write the decision down.** The table and motion numbers above into
   `docs/design/decisions.md` ("Cuts, decided"), and the AGENTS.md paragraph
   on shadcn. Add `app/prototypes/lab/cuts/DECISION.md` pointing at both.
2. **Ops carry targets.** Add `target` to ops; fill it in every builder; unit
   tests in `ops.test.ts` / `edits.test.ts` / `tools.test.ts` assert that
   every op a tool emits has a target that exists in the scene it was built
   from.
3. **The director.** Port `round-4/director.ts` into
   `components/editor/agent-cursor/` (`director.ts`, `agent-cursor.tsx`,
   `agent-cursor.css`). It consumes `data-ops` (not tool parts — the real
   stream already carries ops) and drives the cursor and the document apply.
   The cursor reads timing from the locked numbers above as CSS variables on
   the editor root. No React state per frame: positions go through refs and
   `translate`.
4. **Lanes become targets.** `studio-lanes.tsx` gets `data-target` on clips,
   pauses, caption chips, the captions button and the zoom control; hover,
   selection and hit layers as in `round-4/lanes.tsx`; clips slide on
   `translate` when a gap closes (the removed clip leaves layout at once).
   Lanes are read-only while a run holds the document (this exists; keep the
   reason line, fade 120 ms).
5. **The margin in shadcn.** Rebuild `studio-chat.tsx`'s run rendering on
   `components/ai-elements/` (`task` for the run, `checkpoint` for the
   revision, `suggestion` for starters/next steps, `confirmation` for the
   gate) inside `.cuts-shadcn`. Move `round-3/shadcn-scope.css` to
   `components/editor/cuts-shadcn.css`; it must also carry the two fixes the
   lab made to shadcn's button (no `transition-all`; hover is
   `--kit-primary-hover`, not an alpha). The receipt: summary line holds the
   numbers ("5 edits · 0:37.0 → 0:32.5", tabular-nums); prose names changes in
   words; steps are two-column rows (label | duration); next steps directly
   under the checkpoint; starters never re-offer a finished request.
6. **The gate, on the server.** In `lib/editor/agent.ts`, a tool whose
   built ops would remove more than 30 % of the scene's length or any whole
   spoken sentence (a sentence from `turn-sentences.ts` whose words are all
   removed, fillers excluded) returns an approval request instead of
   applying: use the AI SDK tool approval (`needsApproval` as a function that
   dry-runs the builder) and the `confirmation` pattern on the client, wired
   with `addToolApprovalResponse` + `sendAutomaticallyWhen`. The approval
   says which reason applies, in words ("This removes 3 spoken sentences and
   40 % of the take, so I ask first."). Unit-test the rule on fixtures: a
   pause-only tighten passes, captions pass, a 41 % cut asks, one removed
   sentence asks.
7. **Stop.** Esc and a Stop control in the margin abort the stream
   (`stop()` from `useChat`) and the director; what landed stays and is
   saved as the run's revision; unlanded steps render "skipped".
8. **Audit rules carried over** (round 5): one place for time (no badge on
   the preview; header precision = transport), the friend once per run,
   quiet empty lanes, derived nested radii, depth from elevation tokens.

9. **Full screen** (owner, added 2026-11-17: "Inne på cuts er det også bare
   å hide sidebaren helt til venstre slik at vi får full screen mode"). On
   `/cuts` and `/cuts/[id]` the app sidebar, its phone bar and its sheet are
   not rendered; decided from the pathname in the shell, so the server
   render already has no sidebar (no flash, no shift). The way out is a real
   link: the editor rail's first control ("Back to Studio", 44 px) and
   "Back to Studio" on the list. Recorded in docs/design/decisions.md.

**Verification (A)**
- `pnpm typecheck`, `pnpm lint`, `pnpm test` (owner runs them; agents do not
  build locally on this machine).
- Signed in as `dev@quincy.test` (memory: verify a signed-in page by signing
  the session cookie; never the real account), open the **sample** cut (it
  spends nothing) and run "Tighten the edit": the cursor drag-selects each
  pause, ⌫, gaps close, one revision chip, Undo restores in one step, console
  clean. Then "Make it under 20 s": the approval appears with its reason;
  Deny leaves the scene untouched; Approve runs it.
- Reduced motion on: no cursor, targets change in order, nothing animates
  position.
- Live model runs cost money: **ask the owner before** running the agent on
  a real recording (memory: ask before live verify).

## Phase A — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-17. Departures from the
steps above, and why:

- **Steps, not one batch, for a tightening.** `remove_silences` was one
  `replace_elements` for the whole take, so the cursor had nothing per pause
  to press. The agent now uses `removeSilenceSteps` (lib/editor/tools.ts): one
  pause per step, each a whole consistent cut (spine and captions together),
  committed and streamed as its own `data-ops` part, so one part is one press.
  The button path keeps the single batch; a test asserts both arrive at the
  same cut. Two ceilings bound the stream: `MAX_CUT_STEPS` (12; past it,
  neighbouring pauses share a step, and a range target carries several
  spans) and `MAX_CAPTION_ELEMENTS_STREAMED` (1200 caption elements re-sent
  over a whole tightening). The run still saves once, at the end.
- **The target shape.** `OpTarget` is `{ action: "cut" | "zoom" | "press" }`
  plus `element` (with `atUs` for a split), `effect`, `range` (scene-time
  spans), `track` (a look or framing on the whole spine) or `control`
  (`captions`, `frame`). Builders fill it with `aimed()`; `targetInScene()` is
  the test. A range has no DOM node of its own: the director places it on the
  lane (`data-target="track:<id>"`) as a fraction of the lane's width, which
  is the same "measured at glide time" the contract asks for.
- **`toolApproval`, not `needsApproval`.** AI SDK 7 deprecates the tool-level
  `needsApproval`; the gate is the call-level `toolApproval` function in the
  agent route, which dry-runs the same builder the tool executes
  (`dryRun` in lib/editor/agent.ts, `gateVerdict` in lib/editor/gate.ts).
  The reason travels as a `data-gate` part beside the SDK's approval request.
  Approvals are not HMAC-signed (`experimental_toolApprovalSecret`): a forged
  approval only skips a question about the person's own project.
- **Sentences come from the transcript, not `turn-sentences.ts`.** That file
  holds the tools' words. Sentences are the take's punctuated words
  (`spokenSentences`, gate.ts); fillers use `DEFAULT_FILLERS` in
  transcript.ts, so no `fillers.ts` yet (phase B can add one).
- **Only `delete_clip` is measured.** Every other tool is exempt by what it is
  (`EXEMPT_TOOLS`); a test fails when a tool is in neither list. `delete_clip`
  now takes `clipNumbers` so "make it under 20 s" is one call and one
  question, and deletes last-first, one step per clip.
- **First run (corrected by the coordinator after review).** The agent built
  "never ask on the first run" as the plan said, which let a first "cut it to
  10 s" through unasked. That contradicts the owner's rule (ask when the
  change is very large), so the bypass is removed: a large edit asks on the
  first run too.
- **The pace.** The locked numbers run at piece 52's pace (× 1.3), the run
  the owner approved; they live as CSS variables on `.agent-desk` and the
  director reads them at the start of each run. An approach (glide + drag) is
  capped at 300 ms so a change never waits longer than about a press for it.
- **Stop lands what arrived.** The server's working copy already holds every
  op that streamed and saves them on abort, so Stop lands every queued beat at
  once (no cursor) and parks; only calls whose ops never arrived read
  "skipped". Skipping arrived ops would leave the screen and the save apart.
- **Zoom control.** The "Zoom" control over a selection is drawn on the
  cursor's layer (`data-target="control:zoom"`), as in the lab; the toolbar's
  hand "+ Zoom" stays where it was.
- **Captions control.** The empty caption lane now has a real
  "+ Captions from the transcript" button (the cursor's `control:captions`);
  by hand it reads the stored transcript route and spends nothing.
- **One place for time.** The transport now reads in tenths
  (`formatClockTenths`), the same precision as the run's summary line.
- **Replay for development.** `?replay=1` on a Cuts page (development only;
  the route ignores it when `NODE_ENV` is production) swaps the model for a
  scripted one (lib/editor/replay-model.ts): real tools, real gate, real
  stream and save, no model call and no usage row. It replaces the recorded
  fixture the brief suggested, because a fixture's element ids would not
  match a fresh project's.
- **Not verified in a browser.** Signing in as `dev@quincy.test` through
  /login did not complete in the agent's browser; see the report. The
  verification steps above still stand for the owner's run.

## Phase B — filmstrip with waveform, and the reading of the take

**Branch** `feat/cuts-reading`. Depends on A.

1. **Clips.** Each clip draws frame tiles from its `Filmstrip` sheet at a
   fixed tile width (tiles keep their shape; a narrow clip shows fewer), the
   waveform as a thin strip under them inside the same clip, one
   `rounded-kit-chip` outer radius with square inner strips clipped by the
   parent. A clip narrower than its label hides the label (kept for screen
   readers); speech either side of a removed remnant joins into one clip, so
   no slivers. Must render identically on server and client.
2. **The reading, without a new model call.** At the end of ingest, compute
   from the transcript and word timings: length, word count, speakers, pauses
   over a second (count and total), fillers ("um", "eh", "liksom"… per
   language, a small list in `lib/editor/fillers.ts`). Store it on the asset.
   The margin opens on "What I noticed" from these numbers, and the starters
   carry their reason ("Tighten the edit · 2 pauses and an 'um', 4.5 s").
   "The strong line to push in on" needs a model; it waits for phase C.
3. **The sample** opens free from the drop surface, as now
   (`sample-button.tsx`), with the reading already computed in its manifest.

**Verification (B)**: ingest of the sample manifest yields the reading;
starters match it; the filmstrip has no hydration warning on reload; a
3-second clip shows one tile and no label.

## Phase B — as built

Uncommitted on `feat/cuts-at-the-desk` (not its own branch), 2026-11-18.
Departures from the steps above, and why:

- **The reading is computed, not stored.** No migration: `readTake`
  (lib/editor/reading.ts) counts it from the transcript where the cut page
  resolves its media (`app/(app)/cuts/[id]/page.tsx`); the asset row already
  carries the transcript, so this is no new query, and only the numbers
  cross to the client (`MediaEntry.reading`). The sample needs no manifest
  change: its transcript is copied onto the asset, so its reading is
  computed the same way when it opens.
- **What it counts.** Length, words, speakers (one when there is no
  diarisation), pauses between words longer than a second (count and total;
  dead air at the head and tail is not counted), standalone fillers by word,
  and the first spoken sentence. `strongLine` is a named field that is
  always null until phase C.
- **One filler list.** `lib/editor/fillers.ts` (English and Norwegian) is
  now the only list: `DEFAULT_FILLERS` in transcript.ts and the gate's
  sentence reading both use it. "like" is out: it is a real word most of
  the time, and cutting it turned "I like it" into "I it". The cutting tool
  therefore no longer removes "like".
- **Starters carry their reason, or are not offered.** Tighten only with
  pauses ("2 pauses over a second, 4.5 s"); its reason names pauses and no
  fillers, because `remove_silences` does not cut fillers. Captions only
  when there are words and the cut has none yet. Vertical only when the
  cut's canvas is wide. "Push in on the first line" quotes that line.
  Without a transcript the margin keeps the old fixed starters.
- **Clips.** One `rounded-kit-chip` outer with `shadow-kit-control`, a 30px
  row of frames over a 14px waveform strip, both square and clipped by the
  clip. A tile's width is the row height times the sheet's aspect, so a
  narrow clip shows fewer tiles; each tile shows the source under its own
  x. The name sits on a small plate; under its width (capped at 72px, so a
  long name truncates instead of vanishing) it is `sr-only`. Before the
  lane is measured it shows, on server and client alike.
- **Not done: joining speech across a removed remnant.** Step 1's "no
  slivers" needs a change to the cutting ops, not the drawing; it waits.
- **Verified in a browser** on `/cuts/vp-vIW0U9JXt1tnPD57` as
  `dev@quincy.test`: clean console on reload (no hydration warning); tiles
  and strip in the clip; a 24px clip from a split showed one tile and no
  visible label (split undone); the margin showed "1.3 s, 5 words, one
  voice." and "No pause runs over a second.", with no Tighten, no Captions
  (the cut has them) and no Vertical (the canvas is 9:16).

## Phase C — the self-check

**Branch** `feat/cuts-self-check`. Depends on A. **Spends money.**

1. After a run that changed the picture or captions, the client grabs three
   frames from the proxy at the run's changed ranges (canvas from the
   `<video>`; no server render), uploads them small, and the agent gets one
   `check_frames` step with a vision-capable model: "is a caption covering a
   face, is the framing off, is the push-in on the speaker". It may emit ops
   (move captions, adjust the crop) that land through the same director.
2. Also here: the strong line for the reading (B2), one cheap model call over
   the transcript at ingest — metered.
3. **Money (AGENTS.md):** ceiling = at most one `check_frames` per run and
   at most 3 frames; the reading's strong-line call at most once per asset.
   Both write `usage_event` (`model` = the model slug; frames counted in the
   row's metadata). Both sit under the existing `ceilingVerdict` for the day.
   The check runs only when the run changed picture or captions.

**Verification (C)**: a run on the sample with captions shows the check in
the margin with its frames; `usage_event` has one row for it; a second
request in the same run does not check again.

## Phase C — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18. Departures from the
steps above, and why:

- **The check is its own request, not a step of the agent run.** The frames
  come from the browser after the cursor has parked, so the run's stream is
  over by then. A run that committed a picture or caption tool
  (`CHECKED_TOOLS` in lib/editor/self-check.ts: add_captions, reframe, crop,
  punch_in, apply_look) ends with a signed `data-check` offer (HMAC over
  project, run and a 10-minute expiry, keyed on `BETTER_AUTH_SECRET`). The
  margin grabs up to three frames and POSTs them once to
  `app/api/editor/projects/[id]/check`. While the offer is pending or the
  check runs, the run stays busy, so the fix joins the run's undo group and
  its receipt: one run, one undo, check included.
- **One structured call, deterministic fixes.** The vision model
  (`CHECK_MODEL = "openai/gpt-5.6-luna"`, vision-capable and priced in
  lib/pricing.ts) answers a schema: a note per frame, `captions: up|down|null`,
  `keep: center|left|right|top|bottom|null`, one sentence. The server builds
  the fixes with `moveCaptions` (one `replace_elements` on the caption lane,
  10 % of the frame per step, never below the style's place, never above
  half the frame) and the existing `cropSpine`, saves one revision, and
  returns the batches; the margin lands each through the director, one
  press each. The composition now honours a caption's `transform.position.y`.
- **The guards, where they sit.** In the check route: entitlement and the AI
  key, a 500 KB body cap, 1–3 JPEG data URLs of at most 160 KB each, the
  signed offer for this project, `ceilingVerdict` for the day, one check per
  run (a `usage_event` row tagged `check:<runId>:<n>f` is the attempt log,
  written in a `finally` so a failed call counts too), and the project lock
  so two checks cannot overlap. The frames travel inline: three small JPEGs
  are about 150 KB, far under the 4.5 MB body limit.
- **No metadata column.** `usage_event` has none, so the frame count rides in
  the `conversation_id` tag (`check:<runId>:3f`). A column would be a
  migration.
- **Frames are approximate.** Drawn from the proxy on a canvas with the
  clip's fit and crop and the caption on top; a push-in's zoom and a look's
  colour are not drawn. A proxy the canvas cannot read (no CORS) sends
  nothing and spends nothing.
- **The strong line is asked for lazily, not at ingest.** The ingest worker
  has no entitlement context, and the sample and every existing asset would
  never get one. The cut page asks `POST /api/editor/assets/[id]/strong-line`
  when its reading has none; the server answers from cache for free, or
  makes the one call (`STRONG_LINE_MODEL`, numbered sentences in, an index
  out, so the line is always a real sentence of the take) behind the
  entitlement gate and the day's ceiling. A take of one sentence makes no
  call.
- **Where the strong line is cached: a key on the stored transcript.**
  `video_asset.transcript.quincy_strong_line` (`pending | done | failed`).
  No migration, and it lives and goes with the words it was chosen from. The
  `pending` slot is an atomic claim (written only where no slot exists), so
  two tabs cannot both pay; a failed call stays `failed` and is never
  retried. This breaks "the provider's response, verbatim" by one extra key;
  `wordsFromDeepgram` ignores it. If that is not acceptable, the alternative
  is a column, which is a migration.
- **Replay.** `?replay=1` runs the whole check path: real offer, real frames,
  the route with `replayCheck` (lib/editor/replay-model.ts) in place of the
  model, a real fix and save, and no usage row (a dev-only in-memory set
  holds one check per run). The strong-line route answers the longest
  sentence in replay and stores nothing.
- **Verified in a browser** on `/cuts/vp-vIW0U9JXt1tnPD57?replay=1` as
  `dev@quincy.test`: "add captions" ran, the margin showed "Looking at 2
  frames of the cut" with the two thumbnails, then the notes; the caption
  lifted on the preview; the receipt read Revision 64; one "Undo the run"
  took back the captions and the lift together; no console errors. (The
  1.3 s take gives two frames: three would sit closer than half a second.)
  The second-check refusal and the usage rows are covered by tests, not by
  the browser, since replay writes no usage.

## Phase D — three cuts from one recording

**Branch** `feat/cuts-three`. Depends on A and C. **Spends 3× a run.**

1. "Make three cuts" creates three scenes (existing `scenes[]`) with a brief
   each (where it goes, the hook, the length), runs the three edits in
   parallel, each with its own cursor (starts 0 / 90 / 170 ms, different
   paces, the recommended cut leads; B and C smaller and fainter), each ending
   in its self-check, then the recommendation **in words with its reason**
   ("A opens on the strong line at 0:00.8"), never a score. Layout as lab 53:
   one large preview of the recommended cut, three spines in the lanes panel.
2. **Locks.** `lockProject` is per project; three parallel runs need either
   one orchestrating run that holds the project lock and applies the three
   scenes' ops, or a per-scene lock. Prefer the single orchestrating run (one
   lock, one revision per scene, one stream). Decide before coding; record it
   here.
3. **Money:** a three-cuts request is a ceiling of three runs' steps plus
   three checks, counted against the day's `ceilingVerdict` *before* it
   starts (refuse if the remaining budget cannot cover all three); a
   **cooldown** of 60 s per project between three-cuts requests (the
   `lib/cooldown.ts` shape), because a person can press it repeatedly. Meter
   each sub-run through `usage_event`.

**The lock, decided before code (2026-11-18): one orchestrating run.** The
agent route is ours, so nothing stops one request from doing all three: a
three-cuts request (`mode: "three-cuts"` in the chat body) takes the project
lock once, under one run id, and runs three sub-runs in parallel inside it.
Each sub-run has its own tools over a working snapshot that is shared but
scoped to its scene (ops already carry `sceneId`, and JavaScript applies one
commit at a time, so the three cannot interleave inside one op). Every
`data-ops` part carries the `sceneId`, and the browser hands it to that
scene's cursor. At the end the run saves three times in a row, A then B then
C, each save adding one scene to what is stored: one revision per scene. A
per-scene lock would need a lock column per scene (a migration) and three
saves racing on one revision counter; it lost.

**Verification (D)**: on the sample, three scenes appear, three cursors run
out of step, the recommendation names a reason, one undo per scene; a second
press within 60 s is refused with the time left; the day's ceiling refuses a
request it cannot cover.

## Phase D — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18. Departures and the
places things sit:

- **One orchestrating run** (decided above): `lib/editor/three-cuts-run.ts`,
  reached from the agent route when the chat body says `mode: "three-cuts"`
  (the margin sends it for "Make three cuts" and for typed requests that
  `asksForThreeCuts` matches). Sub-runs use `scopedTo` (lib/editor/agent.ts)
  over one working snapshot; every `data-ops` part carries `sceneId`. Three
  saves at the end, A then A+B then A+B+C: one revision per cut.
- **New ops, no new shape**: `add_scene`, `remove_scene` (the main scene
  never goes; the screen falls back to it) and `select_scene`. A cut is a
  copy of the scene on screen under a new scene id; element ids are shared
  with the source, so each cursor looks its targets up inside its own spine
  (`data-cut-scene`), never across the desk.
- **The briefs need no model call**: `briefsFor` (lib/editor/three-cuts.ts)
  writes them from the reading: A for Reels and TikTok on the strong line
  (the first line when none has been chosen), B for LinkedIn on the first
  line, C a Shorts teaser; lengths 30/60/15 s, capped at the take.
- **The recommendation**: `recommend` picks A whenever A landed (its cursor
  led, it is built on the strong line), else the first cut that landed, and
  states only facts read off the cut: its length against its brief, its
  frame, and where it pushes in on the hook. No score. It renders inside the
  recommended cut's section, in the same frame its fold settles, and the
  live region says it.
- **The gate inside three cuts denies instead of asking**: nobody is there to
  answer mid-run, so a cut the gate would ask about is not made (the
  `denied` reason says to ask for it in that cut alone).
- **Guards and where they sit** (all in `threeCutsResponse`, before the lock
  in this order): the 60 s cooldown per project (`THREE_CUTS_COOLDOWN_MS`,
  `spendCooldown` on `three-cuts:<projectId>`, answered 429 with
  `secondsLeft`); the ceiling (`ceilingCovers` in lib/chat-guards.ts against
  `threeCutsNeedMicros`: three runs at `MAX_STEPS` × 8k input / 500 output
  tokens plus three checks at 3k / 600, nothing counted as cached); then the
  lock; then the attempt log (a zero-cost `editor:three-cuts` row) the
  cooldown reads. Each sub-run keeps the step cap and writes its own
  `usage_event` row (`three-cuts:<projectId>:<letter>`) in a `finally`. Each
  check's offer is signed with its scene id and a sub-run id
  (`<runId>-<letter>`), so the check route's one-check-per-run guard holds
  per cut; the checks run one after another (they take the project lock).
- **Cursors**: the director now holds lanes (`LaneConfig`: key, label,
  support, delay, pace). A run on the scene on screen is one lane; three cuts
  are three, from `cutLane(index)`: 0/90/170 ms, pace ×1, ×1.08, ×0.94. The
  lead is "Quincy · A" with the ring; B and C have a smaller tag, no ring,
  70 % opacity. Stale lanes from an earlier three-cuts run are stopped and
  dropped when a new run names its cuts (found in the browser: a dropped
  lane kept the run busy).
- **Layout**: the preview shows A (A's creation selects it). The lanes panel
  shows three spines (`components/editor/cut-spines.tsx`), the lead on the
  object surface with its elevation, B and C flatter; clips sit by
  `translate` in container units. A row of toggle buttons switches cuts
  (`SceneSwitch`); "Open" puts one cut in the full lanes.
- **One undo per cut**: each cut's checkpoint reads its revision and "Undo
  cut B", which applies `remove_scene` as a hand edit (so ⌘Z brings it back).
  The run is still one entry in the history for ⌘Z.
- **Replay** plays the whole flow: the briefs are written in words the
  scripted model knows (square, phrase, fade in were added to it), the
  check runs scripted, and the cooldown uses an in-memory map since replay
  writes no usage.
- **Not done: sliver clips.** Dropping a sub-0.3 s piece safely needs the
  words (a short piece can hold a real word), and the primitive
  (`splitBySourceRanges`) is shared by the gate's dry run and transcript
  deletes. Follow-up: pass the words into `cutSourceRanges` and fold a piece
  under 0.3 s that holds no word into the removed range.
- **Verified in a browser** with `?replay=1` on `/cuts/vp-vIW0U9JXt1tnPD57`
  as `dev@quincy.test`: three spines, three cursors, a check per cut, the
  recommendation in the margin and the live region, "Undo cut B" removed B
  alone, a second request inside 60 s answered "Try again in 41 seconds", and
  a second run in the same session settled. The project was put back to its
  one main scene afterwards. The ceiling refusal is covered by tests only.

## Phase E — the desk

**What.** The owner, 2026-11-18, after D: the waveform must look like the
lab's, and the editor should look more like the editor he studied. The
editor was flat: hairlines between regions, a text-button toolbar whose
clock wrapped onto two lines, a ruler that printed "00:00" five times on a
1.3 s clip, and a faint grey waveform under the filmstrip.

**Why.** The desk is the kit's own rule (docs/design/surfaces.md): objects
lifted by elevation, the grey stage only as a recess. Applied to the editor,
every region becomes an object you can see the edge of, and the screen reads
as a desk with things on it rather than one plane cut by lines.

**The shape.** Top bar and rail on the ground; inside them the recess, its
top-left corner rounded into the ground; on it, 8px apart: the library card,
the preview (no card), a small side-panel rail, the timeline card under
both, and the chat card at full height on the right.

1. Top bar: back to Studio, "All cuts", the project name (renamable in
   place); centre the frame menu and undo/redo; right Share, Export (the one
   ink fill).
2. Rail with labels; the picked tool is the well grey. A library card, open
   on Media, closes when the active rail item is pressed again.
3. The preview on the recess, centred, with its handles.
4. A floating rail: Chat, Transcript, Hide panel. It replaces the tabs.
5. The chat card leads its empty state with "What should we cut?", then
   what Quincy noticed, then the starters as chips with an icon and reason.
6. The timeline card: play and the clock on one line, the cuts menu, split,
   delete, the zoom effect, and the timeline zoom as a slider between − and
   +; the ruler; the lanes. The main lane is taller: 44px of frames over a
   16px waveform strip, inside one clip, ink ring when selected.
7. The waveform drawn as the lab drew it, from the real peaks.
8. Everything A–D built keeps its `data-target`s.

## Phase E — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18. Where it sits and the
departures:

- **Frame** (`components/editor/studio-frame.tsx`): rewritten as the desk.
  The ground is KitRoot's; the recess is `bg-kit-stage` with
  `rounded-tl-kit-stage`; every object is `rounded-kit-object bg-kit-object
  shadow-kit-object`. The library collapses on `grid-template-columns` (one
  200ms transition, none under reduced motion, `inert` while shut). The side
  panel hides with `hidden`, never unmounts, so a live run keeps streaming.
  `studio-side.tsx` (the tabs) is deleted.
- **Controls** (`components/editor/desk-controls.tsx`): `DeskIconButton`, a
  quiet 32px square with an aria-label and a kit Tooltip that adds the
  shortcut (⌘Z, ⇧⌘Z, S, ⌫); `FrameMenu`; `SceneMenu` (phase D's row of
  toggles, now "The take ▾" in the timeline's toolbar); `TimelineZoom`, a kit
  Slider on log2 of the zoom between − and +. `ZoomControls` and
  `SceneSwitch` are deleted.
- **Departure: no preview zoom.** The brief's "zoom out / Fit / zoom in for
  the preview" has nothing behind it: the preview has no zoom. Fit and Fill
  (how the picture meets the frame) live in the frame menu with the shape,
  as one decision; the trigger reads "16:9 · Fit". `control:frame` is on the
  trigger.
- **Departure: no "All assets" tab, no add button.** The app has no listing
  of every upload and no way to add a second recording to a cut; a tab or a
  button that does nothing reads as broken. The library is "This project"
  with a search by file name and one tile per recording (the filmstrip
  sheet's middle tile, a duration badge, the file name).
- **Departure: no version history, no new-chat, no attach, no mic.** None
  exists, so none is shown. Share exists only as a word: it is disabled with
  "Sharing a cut is not built yet" (plans/031) instead of a dead button.
- **Project name** (`components/editor/project-name.tsx`): an input that
  reads as the title; Enter or blur commits one `rename` op (so ⌘Z takes it
  back, and the save writes the project's title), Escape reverts.
- **Waveform** (`ClipWaveform` in studio-parts.tsx): one SVG of rounded
  bars on the lab's 3px pitch, 1.6px wide, centred, `fill-kit-ink-muted`,
  heights rounded to 2 decimals. Bars come from the asset's peaks, loudest
  per bar, against the asset's own loudest moment, on a square root with a
  floor of a quarter of the strip (the lab's bars start there); silence is a
  1.5px dot. Drawn only once the clip is measured, so server and client
  agree. Clip anatomy: 44px frames over a 16px strip; the main lane is 76px.
- **Ruler** (`components/editor/ruler.ts`, tested): marks on a round step
  (frames, 0.1, 0.2, 0.5, 1, 2, 5 s …) from one label per ~96px of lane;
  labels carry the precision the step needs (00:00.2, 00:01, or mm:ss:ff
  under a tenth), never repeat, and the ones near the end read to the left
  of their tick so the lane gets no scrollbar from them.
- **Chat** (`studio-chat.tsx`, `components/ai-elements/suggestion.tsx`): the
  question leads, the hand-editing hint moved under the starters, and every
  suggestion carries an icon for what kind of edit it is.
- **Verified in a browser** on `/cuts/vp-vIW0U9JXt1tnPD57?replay=1` as
  `dev@quincy.test`, at 1440×717 and 1280×717 (the window's real inner
  size): no horizontal page scroll, the clock on one line, ruler labels
  00:00.0 … 00:01.2 distinct, the waveform visible in the clip, no console
  errors. "Push in on the first line" drove the cursor onto
  `control:zoom` over the clip and the caption lane; "Make it vertical"
  pressed `control:frame` on the new menu; both runs were undone with "Undo
  the run". A rename to "wide take" saved and was undone with the top-bar
  Undo. The project was left as found. Dark mode was looked at once and the
  theme put back to light.
- **Seen, not fixed:** the clip's right trim handle pokes 6px past the lane
  at fit, so the lanes scroller has 6px of horizontal scroll (from before
  this phase).

## Phase F — the mock

Owner, 2026-11-18: "we need a mock so we can iterate on the animation, the
cursor, etc." The lab's rounds tuned a copy of the desk; after E the real
desk is what needs tuning, and every run of it needed a signed-in session,
a real project and the replay route. The mock is the real `Studio` on a
fixture take, with the network answered in the page, so tuning there is
tuning the product.

## Phase F — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18. At
`/prototypes/cuts-mock` (no session; the prototypes layout's production
gate applies; `noindex`).

- **The seam: `harness` on `Studio`** (`StudioHarness` in
  components/editor/studio-chat.tsx): `{ transport, fetch }`. With it the
  cutting chat uses the given `ChatTransport`, and the five other requests
  the editor makes (autosave PUT, the read-back after Stop, the self-check
  POST, the hand captions' transcript, the strong line) go through the given
  `fetch`. Without it nothing changes: `useDocument`, `useSelfCheck` and
  `useStrongLine` default to `networkFetch` (use-document.ts), the chat to
  its `DefaultChatTransport`. Nothing in production imports the mock.
- **The take** is generated, not recorded: `scripts/make-cuts-mock-take.sh`
  makes a 37 s, 768×432, 24 fps test picture (1.7 MB) with a tone burst per
  word of `app/prototypes/cuts-mock/take-words.json` and true silence
  between, so the waveform's gaps are the transcript's pauses; then the
  filmstrip in ingest's shape (`planFilmstrip`: 78 tiles of 156×88) and the
  seek index (20 ms peaks decoded back from the take, a keyframe every 2 s).
  The words are the lab's founder take, 62 words: pauses of 2.5 s and 2.1 s
  (at 4 s and 13 s), one "um". The strong line is fixed ("The screens
  weren't the product."), so no strong-line call is ever made.
- **Real ops, scripted stream.** Each scenario executes the editor's own
  tools (`editorTools` over `createRun`, record.ts) on its starting cut and
  writes what they committed with `@shadcn/helpers/ai-sdk` `createChat`, in
  the route's order: tool input, one `data-ops` per step, the tool's answer,
  a line, `data-saved`, and `data-check` when `needsCheck` says so. The gate
  is the real `dryRun` + `gateVerdict`, asked with the helper's
  `needsApproval` and a `data-gate` part; three cuts mirrors
  three-cuts-run.ts (`briefsFor`, `copyScene`, scoped sub-runs dealt
  round-robin, `recommend`). The page's server (server.ts) applies every
  streamed op to its own copy, as the route's working copy does, so Stop's
  read-back and the self-check (`replayCheck` + `fixSteps`) see what a live
  run leaves. The document is built in the browser only: `documentForAsset`
  reads the clock, which the server prerender refuses.
- **Scenarios**: Tighten · Add captions · Push in on the strong line · Make
  it under 20 s (starts from the tightened cut; asks) · Stop mid-run (a
  9-step tightening plus captions, streamed slowly; presses the real Stop
  after N presses of the lead cursor, N in the chrome) · Three cuts ·
  Self-check (starts captioned, "make it vertical", the look lifts the
  caption). Replay (or R) remounts the editor on the fixture, which is what
  cancels every pending timer.
- **Tune panel** (tune.tsx, the lab's round-5 panel): speed divides
  `--agent-pace` (1.3 at 1×), glide min/max, press, gap first/last write the
  `--agent-*` variables inline on `.agent-desk`; tone and ring are data
  attributes the mock's own CSS reads; "reduce motion" answers the
  `prefers-reduced-motion` query in the page (reduced.ts) so the real hook
  and director take their reduced path, with agent-cursor.css's media block
  mirrored in mock.css. Values survive Replay; "Copy config" copies the
  lab's line. Defaults are the locked numbers.
- **One product change for the speed control**: `readTiming` now scales the
  approach cap (300 ms) by pace against 1.3. At the editor's own pace it is
  unchanged; without it 0.25× clipped every glide to 300 ms.
- **Fixed from phase E**: the clip's trim handles sit inside the clip (as
  the effect chips' do), so the last clip's end handle no longer pokes 6 px
  past the lane; the lanes have no sideways scroll. The hit area keeps its
  size (12 px wide, the clip's 60 px height).
- **Verified in a browser** at 1440×783: every scenario ran end to end with
  the cursor on its targets (the lane for cuts, the Zoom control for the
  push-in, three cursors for three cuts), the gate asked and "Cut it" landed
  (32.8 → 10.6 s), Stop after 3 presses kept 3 edits, the self-check showed
  three frames from the take and lifted the caption. Replay twice mid-run
  left one run and one receipt. Presses 452 ms apart at 1×, 1781 ms at
  0.25×. Reduced motion: no cursor sampled visible, edits landed. Console
  clean; no request to `/api/`.
- **Fixed after F**: a drag on the timeline drew an opaque grey box over the
  lanes. It was the drag-to-zoom band, filled with `bg-kit-track`, so it hid
  the clips it was choosing. It is now a tint (`bg-kit-ink/8`) that names the
  range ("Zoom to 00:11–00:24"), and a drag that starts on the ruler scrubs
  (the playhead and preview follow; `touch-none` on the ruler) instead of
  choosing a range (studio-lanes.tsx).
- **Seen, not fixed**: the push-in's self-check frame came back black once
  (one frame at 22.7 s); the editor's grab, not the mock. Replay's check says
  "Looked at 1 frames".

## Phase G — arrival and pace

Owner, 2026-11-18, after F: fix the black frame in the self-check; scan the
take in first, because the arrival must look very good; and the runs look
too fast, likely because nothing waits the way a model does.

**What.** Three changes. (1) The self-check never sends a frame it drew
before the video had a picture. (2) The first time a take is opened after
it was read, the margin plays the reading before it offers anything: three
passes, a sweep over the Main lane, then "What I noticed" and the starters
in one entrance. (3) The replay model and the mock wait like a model:
a think before the first tool, a model step between calls, the line
streamed a word at a time.

**Why.** A black frame is a check paid for on nothing. The arrival is the
first thing a person sees Quincy do with their take, and it is honest only
if it plays once and shows the reading's own values. The motion was tuned
against back-to-back parts no live run sends; the gaps a person sees come
from the model, so the mock has to have them too.

## Phase G — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18.

- **The black frame: a draw before the decoder had a frame.** grab.ts made
  a fresh `<video>`, set `currentTime` at once and drew on `seeked`. A fresh
  element told to seek before its metadata seeks from the default start,
  and `seeked` can fire before a decoded frame of the new instant is there;
  `drawImage` then draws nothing over the black fill. Now `frameAt` waits
  for `loadedmetadata`, then `seeked`, then a presented frame
  (`requestVideoFrameCallback`, raced against 250 ms where a detached video
  never presents), then `readyState >= HAVE_CURRENT_DATA`. A 16×9 probe of
  the video's pixels rejects an all-dark frame (luma ≤ 14) and retries once
  three frames later; still dark, the frame is not sent. Time mapping moved
  to `timelineToSourceUs` (lib/editor/timeline.ts, tested): through the
  window's own ratio, kept one frame inside the window and the media, since
  a seek to a window's end or past the last frame shows no picture.
- **The arrival** (components/editor/arrival/): `passes.ts` holds the
  timeline and the values; `use-arrival.ts` decides and steps it;
  `arrival.tsx` and `arrival.css` draw the passes and the sweep. Timeline:
  pass i starts at i × 560 ms and resolves 660 ms later (the next starts
  100 ms before the last settles), the sweep reaches a third of the take as
  each pass resolves (1780 ms), the noticed block and starters enter
  together at 1860 ms (opacity and a 6 px rise, 240 ms, ease-out) while the
  passes fade out in 150 ms: about 2.1 s. The pass being read is ink; done
  passes are muted with a check and their finding.
- **Honest by rule.** It plays once per asset: a `quincy.cuts.read:<asset>`
  key in localStorage, written on the first decision (no migration). A
  storage that throws means it does not play. Under reduced motion it opens
  settled (and still counts as seen). The values are the reading's
  (`scanPasses`): words and voices; the file's shape and rate for the
  picture ("Shot wide, 16:9 at 24 fps"), not "face centred", because
  nothing has looked at the picture yet; pauses, fillers and whether the
  strong line is chosen. There is no ingest-in-progress state in the editor
  (the cut page opens after ingest), so no pass follows live progress.
- **Never in the way.** The composer works throughout; typing or sending
  skips to the settled margin. The noticed block keeps its space while the
  passes read over it (`inert`, opacity 0), so nothing moves when it
  arrives. The live region says the reading once, when it settles. A
  re-open draws settled before the first paint, with no entrance.
- **Departure: the ring turns.** The run's steps use a still ring
  (status-icon.tsx); the brief asked for spinner → check, so the pass's
  ring turns while it reads, for at most 660 ms. Revert to the still ring
  if it reads as a second idiom.
- **The pace** (lib/editor/pace.ts, tested): `none` (the old stream),
  `realistic` (think 1.2 s, steps 600–900 ms, 32 ms a word) and `slow`
  (2.4 s, 1.2–1.8 s, 60 ms). The jitter is mulberry32 on a seed, so a
  replay is the same run every time (the mock seeds on the request's text,
  three cuts on the cut's letter). The replay model sleeps on the request's
  abort signal, so Stop is not held up. Steps inside one tool call keep the
  tool's 40 ms: no model sits between them. In three cuts one wait stands
  for the three parallel models, taken where a cut's next step starts a new
  call. The live route is unchanged.
- **The director under a slow stream** (read, not changed): when the queue
  runs dry mid-run the loop ends without parking (`if (!this.streaming)
  this.park()`), so the cursor rests on its last target; the next `push`
  restarts the loop and glides from there. Nothing moves it meanwhile.
- **The mock**: Replay plays the scan (`harness.arrival = "always"`) and
  types its prompt after the scan has settled. The tune panel has "model
  pace" (none / realistic / slow, realistic by default) and "scan on
  arrival", both in Copy config.
- **Not verified in a browser.** Navigating the agent's own tab to the mock
  was refused by the session's permission check, so the scan, the chain at
  realistic pace, the frames and the reduced path are verified by tests and
  by reading only. The owner's run of the mock stands as the check.

## Phase H — a calm margin

Owner, 2026-11-18: "på høyresiden er det veldig raske bevegelser som ikke
ser jo bra ut. Er det best practice fra shadcn her også?" and "It just
looks very messy on the right side." Then: "Jeg ønsker at vi skal følge
shadcn standarden": the margin follows shadcn's Chat pattern and the
chatbot template (github.com/shadcn-ui/chatbot-template) as they ship,
not our variation of them.

**What.** The margin is built from the standard parts: Empty for the empty
state, Message Scroller + Message + Bubble for the thread, Trace for every
step (the run as Task, the arrival's passes as Task steps, the "Thinking"
line), Suggestion for starters and next steps, Prompt Input on Input Group
for the composer, Checkpoint and Confirmation as before. Only the person's
message animates in. The run folds once. The receipt, the checkpoint and
the next steps arrive together.

**Why.** In the mock, the empty state was replaced by the thread in one
frame, the run's steps popped in and then folded in a jump, the receipt
and the next steps replaced the starters in a second jump, and the
top-pinned thread jerked as it grew. The pattern solves each of these,
and the owner asked for the standard.

## Phase H — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18.

- **Installed with the CLI**: `empty`, `input-group` (and its `input`,
  `textarea`). globals.css unchanged; the `cn` import fixed to
  `@/lib/utils` and the stray `cn` package removed. A shadcn `tooltip`
  was tried and removed: it portals out of `.cuts-shadcn` and would paint
  with the old tokens; the kit Tooltip is used for a suggestion's reason.
- **The timeline.** Send: the empty state leaves (opacity 0, 4px up,
  150ms, out of the layout as an inert copy) while the person's message
  slides up (the site's `MESSAGE_ANIMATIONS["slide-up"]`: opacity and
  10px, 260ms, `[0.16, 1, 0.3, 1]`, as CSS since the app has no motion
  library). "Reading the cut" (a running Trace line, shimmer) sits under
  it until the reply's row opens with the same line. The run is one
  `TraceCollapsible`, open while it works, "Cutting · n of m" turning
  to "Cut · n edits · a → b", folded by Trace's own height transition
  (200ms). With the fold, the receipt's words, the checkpoint and the
  next steps enter as one (opacity, 180ms). Sending again takes the next
  steps out at once. Reduced motion: no entrance, no fold transition.
- **Departure: no autoScroll.** The Chat demo has none, and the scroller's
  docs put it first: never move the reader. With autoScroll on, a receipt
  taller than the room under the request scrolled the margin 90px in one
  frame. Now a request anchors 60px from the top (a 48px peek of the turn
  before) and stays there; what does not fit is below, with the scroll
  button.
- **Two rules of the scroller, learned in the mock.** It anchors a new
  request only when the row count grows. A row removed in the same commit
  (the next steps, the waiting line) kept the count equal, and it
  re-anchored to the first request instead. So the next steps live inside
  the last turn's row, and "Reading the cut" inside the request's row.
- **Removed**: the "Quincy" author line and the friend on every turn (the
  pattern has none), the header's Stop (Stop is the composer's button,
  Esc still works), the kit Composer here, the grid fold, the still ring
  (the pattern's spinner and shimmer now), the shimmer override.
- **Suggestions** are the pattern's outline `sm` buttons, wrapping; the
  reason each was offered is its tooltip, so a touch screen no longer
  shows it. Send is `outline`, not the pattern's filled button: the
  editor's one action is Export.
- **The mock**: an "auto-send" toggle (on by default), which sends 1.5 s
  after the starters land; off, nothing is sent until the person picks or
  types. Stop mid-run finds the composer's Stop by its label.
- **Verified in the mock** by sampling the margin every 200ms: Tighten →
  Add captions → Make it vertical, and Make it under 20 s through the
  gate ("Cut it"). Each request held at 12px (first) or 60px (later) from
  the top from its first frame, the composer never moved, one fold per
  run, never two sets of suggestions, the passes' height constant through
  the scan. Three cuts and Stop mid-run (3 edits kept) ran end to end;
  auto-send off sent nothing. Console clean. `/cuts/vp-vIW0U9JXt1tnPD57`
  (as `dev@quincy.test`) renders the new empty state and composer.

## The owner's local take — as built

Uncommitted on `feat/cuts-at-the-desk`, 2026-11-18. The mock can play a
real recording instead of the drawn one, kept off the public tree.

- **Made locally, never committed.** `scripts/make-cuts-mock-local.sh
  <video>` makes the editing copy (short side 432, the source's own aspect,
  H.264 + AAC, faststart), the filmstrip (ingest's `planFilmstrip`), the
  seek index and the 16 kHz audio. `scripts/transcribe-cuts-mock-local.ts`
  makes one Deepgram request through the editor's transcriber (the language
  retry off, a second request refused) and writes the words and
  `manifest.json`; the strong line is the longest of `spokenSentences`, so
  no model call. All of it lands in `public/prototypes/cuts-mock/local/`,
  which is gitignored.
- **Fetched, not imported.** fixture.ts exports the tracked take and
  `loadLocalTake`, which reads the manifest at runtime; a 404 keeps the
  drawn take, so the build and anyone without the files are unchanged.
  The chrome says which take is on.
- **Scenarios follow the take.** "Make it under N s" asks for a little over
  half the take (20 s on 37 s, 12 s on 21 s), so the gate still asks; the
  self-check reframes to a shape the take is not (square for portrait); the
  tighten reply mentions the "um" only when the take has a filler.
- **The owner's local take** (portrait, 21 s, 43 words) ran every scenario
  end to end: tighten 21.2 → 13.0 s, captions with the lifted caption, the
  push-in on the strong line, the gate asked and "Cut it" landed (13.0 →
  8.7 s), Stop after 3 presses kept 3 edits, three cuts, the self-check to
  square. Console clean.
- **Fixed: "Make it vertical" looked like nothing happened.** The canvas
  did change, but a clip with no `fit` draws `contain`, and the `reframe`
  tool changed only the canvas: a 16:9 take became a strip between two bars
  inside 9:16. The tool now fills the new frame around the centre
  (`cropSpine` with `cover`, in the same step) unless asked `show: "whole"`
  for a screen recording; the `reframe` edit and the frame menu are as
  before. Tested in agent.test.ts; in the mock the drawn take goes
  9:16 · Fill with the face centred.

## Polish pass

Owner, 2026-11-18: "På resten vi har må vi gjøre en polish på siden også."
Finish, not redesign: no behaviour changes. Audited in the mock
(`/prototypes/cuts-mock`, the owner's local take) at 1440 and 1280 wide,
light and dark, with a layout-shift observer over Replay, a run and the
self-check, and every control focused from the keyboard.

Already right, and left alone: `antialiased` on the root; no weight change
on hover or selection; real `…` and curly quotes in every string on screen;
`text-wrap: balance` on "What should we cut?" and "What I noticed"; every
clock, duration and step length on `tabular-nums`; focus rings ink or grey
everywhere but one; the self-check's frames keep the cut's aspect before
they load; the arrival holds the noticed block's space; the cursor layer,
the drag band, the hover head and the sweep take no pointer events.

| Area | Before | After | Why |
| --- | --- | --- | --- |
| Top bar | The frame trigger is as wide as its label: "9:16 · Fit" → "1:1 · Fill" moved Undo and Redo 3px. | The label keeps a minimum width. | A control should not move because a neighbour changed its words. |
| Timeline | The ruler drew seven labels before the lane was measured, then redrew at one per 96px: every label jumped on load and on Replay. | Labels are hidden until the lane has a width. | No layout shift on load. |
| Timeline | The ruler (the scrub strip) is 20px tall on touch. | 44px under a coarse pointer; 20px with a mouse. No pseudo-element: the scroller clips above it and the effect chips sit below it. | Tap targets ≥ 44px; hit areas never overlap. |
| Timeline | A clip's trim handle took the browser's 1px grey outline on focus; the effect chip's handle drew the 2px ink ring. | The clip's handle draws the same ring as the chip's. | One focus ring on the page. |
| Timeline | Play is 28px with a 28px target, and the triangle sits centred by its box, so it reads left. | A 44px target from a pseudo-element; the triangle 1px right. | Hit areas; align by eye. |
| Timeline | The empty Effects lane is a blank dashed row. | It says what goes there and how: "Zooms go here. + Zoom adds one." Inert text. | Empty states teach. |
| Timeline | The lanes' z-10/20/30 and the cursor layer's z-index 30 compete with the page's own layers. | The lanes' content and `.agent-desk` are their own stacking contexts (`isolation: isolate`). | Local z-index stays local. |
| Cursor | The agent layer takes no pointer events but its text (the tag, the caption) can be selected by a drag across the desk. | `user-select: none` on the layer; the hover head's label too. | Decorative layers are inert. |
| Margin | A long suggestion ("Push in on “…”") wraps centred, with the icon far from its text and an orphan on the last line. | Wrapped suggestions read from the start, `text-wrap: pretty`. | Line breaks a person can read. |
| Margin | The checkpoint's "Revision 2" is a counter in proportional digits. | `tabular-nums`, from the `.cuts-shadcn` scope. | Numbers that change do not jiggle. |
| Margin | shadcn's Button carries `transition-all`; the scope overrides it inside the margin only. | `components/ui/button.tsx` names its properties. | No `transition-all` (AGENTS.md). |
| Mock | At 1280 wide the harness covered the project name. | The harness is compact (a narrower picker, "local" / "studio"), so it fits between the breadcrumb and the frame menu at 1280. | The harness must not hide the design being judged. |
| Mock | The closed tune panel was 320px wide over the library card's corner. | Closed, it is as wide as its word. | Same. |
| Mock | After a reload the picker could show the last scenario while the editor loaded "Tighten": the browser restored the form value, React state started at its default. The tune panel's inputs had the same drift. | Every harness control has `autocomplete="off"`, and the picker is set from the loaded state on mount. | The chrome says what is on screen. |

**Seen, not changed** (with the reason):

- The desk's 32px icon buttons (Undo, Redo, Split, Delete, the panel rail)
  are 32px with a mouse. They sit 2px apart; a 40px pseudo-element would
  overlap the neighbour. Touch gets 44px from the global rule.
- The trim handles are 12px wide. Two clips butt against each other, and the
  clip body under the handle is the select and move target; wider would
  overlap both.
- The message scroller's fade (`scroll-fade-b`) sits over a scrolling
  thread, and its Scroll-to-end button is 27px. Both are shadcn's Chat as
  shipped (phase H keeps it unforked).
- The timeline zoom thumb reads loud in dark mode: it is the kit Slider,
  shared with other pages.
- The library's "No recording in this project yet." cannot show in the
  editor (a cut always opens on its recording), so it was not given an
  action.
- The self-check's receipt says "1 edit" while its screen-reader line says
  "2 edits" (the caption lift is counted once in each). A wording question,
  not polish.

## Review fixes

A UI review of the editor, 2026-11-18. Each finding, and what changed.

- **Space and S hit the timeline from the chat thread** (blocking). The
  thread is a focusable scroller, not a text field, so S split the clip and
  broke "Undo the run". The chat margin is now its own key scope
  (`data-chat-keys`); the decision moved out of the effect into
  `components/editor/editor-keys.ts` and is tested. Escape and ⌘Z / ⇧⌘Z stay
  global.
- **Timeline toolbar overlapped below ~1000px** (blocking). The media panel
  starts closed below `xl` (decided in CSS until the width is known, so no
  flash; after that by `matchMedia`, until the person picks). The toolbar's
  groups never shrink; the row wraps to a second, right-aligned row when it
  must, and the hidden "Read-only while Quincy cuts" line takes only what is
  left (basis 0, truncates). The zoom drops its slider below a 768px timeline
  (container query); − and + stay. "Cuts needs a wider screen" now shows
  below `lg` (1024). Measured at 1440, 1280, 1100, 1024 (three cuts, panel
  open: two rows, no overlap) and 980 (the message).
- **Receipt descriptions failed contrast** (blocking). Trace descriptions are
  `--kit-ink-muted` in the scope, no alpha: 5.3:1 light, 6.7:1 dark.
- **Long step titles left the icon alone above them.** The fold's trigger is
  a grid (icon | title | chevron, the line inside it `display: contents`);
  other lines that start with an icon are icon | title. Only the title wraps.
- **The fold trigger and Scroll-to-end had 20px and 27px targets.** 44px
  `::after` under a coarse pointer, in the scope.
- **The media panel animated `grid-template-columns`.** The column snaps;
  the content comes in on translate (8px) and opacity, 200ms ease-out; none
  with reduced motion.
- **The zoom slider announced log2 of the zoom.** The kit Slider takes
  `getAriaValueText`; the zoom says "2.0×".
- **Nits.** The trace chevron's rotate has a reduced-motion path; the two
  `ease-in` exits (the empty state, the arrival's passes) use the kit's
  ease-out at the same durations; the scope's hover rule is limited to
  outline and ghost buttons (`components/ui/button.tsx` now sets
  `data-variant` and `data-size`, as current shadcn does); the app shell's
  comment names the editor header's back arrow as the way out.
- **Three cuts' spines drew each clip as an empty grey box.** The main lane's
  frames-over-waveform is now one part, `ClipFace` (studio-parts.tsx), and
  both the lane clip and the spine clip draw through it. The spine passes its
  own height (36px lead, 28px B and C; the spines grew from 32/24 so a tile
  reads as a shot): the wave keeps the lane's 16-of-60 share, tiles keep
  their aspect, so a narrow clip shows fewer. Each spine reads its width from
  a ResizeObserver (on resize, not per frame); before that, server and client
  both draw the empty frame row. The clip keeps `data-target`, and is now a
  `div`, since it holds blocks. Verified in the mock: tiles and wave on all
  three spines, three cursors ran on them, console clean.

A second review, 2026-11-19:

- **A stale "Undo the run" undid another run.** Tighten, ⌘Z, then three
  cuts: Tighten's checkpoint read "Revision 2 · Undo the run" again, and
  pressing it took the three cuts out. The checkpoint compared stack depths,
  and a run undone and replaced leaves the depth where it was. Now each undo
  entry has an id (`components/editor/history.ts`, used by use-document's
  reducer), a run records the entry it committed, and its checkpoint acts
  only while that entry is on top of the undo stack (Undo) or the redo stack
  (Redo). Otherwise it is inert: "Revision N" while still applied under a
  later change, "Run undone" while further down the redo stack, "Undone" once
  a new change forked it away. Tested in `history.test.ts`, the repro
  included. Verified in the mock: after the three cuts, Tighten's checkpoint
  reads "Undone", disabled.
- **Scroll-to-end moved under reduced motion**, and its exit ran 400ms on an
  ease-in. In the scope: the exit is 150ms on the kit's ease-out; with
  reduced motion it only fades (no translate, no scale).
- **An undone cut showed "· 00:00.0".** A removed scene has no length; the
  fold title drops the clock when the cut's scene is not there.
- **The thread's focus ring** was shadcn's 1px auto outline. In the scope the
  focused thread takes the desk's ring: 2px `--kit-focus`, inset 2px (the
  scroller's root clips outside it).

## Not in this plan

- Posting a cut (no channel takes video yet — plans/031).
- Copying the pacing of a pasted short (lab 13).
- Moving the cursor into `components/kit` as a general agent cursor for other
  pages: after D, if a second surface wants it.
- Removing the lab: the lab's rounds stay as the record (lab README). Delete
  only round 2's `elements/` once nothing imports it.

## STOP conditions

- An op cannot be given a target that exists in the DOM (the contract fails):
  stop, report which op.
- The gate cannot be decided before ops apply (needs the dry run to differ
  from the real build): stop.
- shadcn's CLI or an update rewrites tokens in `app/globals.css`: revert and
  stop.
- Any phase C/D path that can spend without a `usage_event` row, or a button
  that can be pressed again without a cooldown: stop. A comment explaining why
  a guard is unnecessary is the smell (AGENTS.md › Money).
- A verification would run the agent on a real recording or the real account:
  ask the owner first.

## Audit fixes (server)

An audit of the server half found ten gaps. All are fixed, with tests, and
none needed a migration or a new environment variable.

- **Locks.** A lock older than five minutes (`LOCK_STALE_MS`) can be taken
  over, so a function the platform kills no longer leaves a project read-only
  for good. `unlockProject` takes the run id and releases only that run's
  lock. The agent route and three-cuts give the lock back on any throw
  between the lock and the stream, and a message without `parts` no longer
  throws.
- **Gate.** It measures the spine's end, not the scene's. A run keeps one
  ledger: removed spine time is added up across calls and steps against the
  spine at run start, and calls in one step are measured on top of each
  other. Sentences count from the start of the run. The exempt tools still
  never ask and never count. `remove_silences` refuses padding below 0 and
  minimums below 250 ms, and `detectSilences` clamps the same values.
- **Approvals.** `experimental_toolApprovalSecret` comes from an HMAC of
  `BETTER_AUTH_SECRET` under its own label (`lib/editor/server-keys.ts`). The
  `data-gate` part carries the clip ids it measured, signed. A yes runs only
  if the same clips would go.
- **Metering.** The agent run, each three-cuts sub-run and the self-check
  add up usage step by step. Stop, a throw or a parse failure no longer
  records zero.
- **Cooldowns.** The agent route has a 3 s cooldown per person. Each signed
  gate question gives its answer one skip. Three-cuts has a 60 s cooldown per
  person on top of the one per project.
- **Self-check.** The run's usage row is written as a claim under the lock,
  before the model call, and filled in afterwards. The agent run unlocks
  before it sends `data-check`.
- **Strong line.** The slot is settled before metering, and each write is
  guarded on its own. A `pending` claim older than 60 s can be taken again.
- The outer UI stream on the agent route now gets `originalMessages`.
  Without it, the run that follows a yes ended in a stream error.

## Audit fixes (debt)

A cleanup after the server fixes. Behaviour is unchanged except where a line
says so.

- **Stop stops spending.** The agent route gives `streamText` the request's
  abort signal, as three-cuts already did, so Stop ends the model call and not
  only the stream. The steps that finished are still in the meter and are
  recorded by `onFinish`. The route test asserts the signal reaches the call.
- **Attempt rows stay off /credits.** `editor:agent` and `editor:three-cuts`
  rows only shadow a run that meters itself in a second row
  (`lib/usage-attempts.ts`). `recentUsage` leaves them out of the list and
  `summariseUsage` does not count them as turns; cost is unchanged, since they
  cost nothing. The continuation rows carry the `editor:agent` label, so they
  follow the same rule. `cuts:ingest` stays: it is the only record of an ingest.
- **Typed data parts.** `lib/editor/stream-parts.ts` holds one map of the data
  parts and `CutsMessage`. The route, three-cuts-run, the mock and the margin
  write and read through it, and the `part.data as …` casts are gone.
- **`currentScene(document)`** in `lib/editor/document.ts` replaces the ten
  copies of "the scene on screen, else the first".
- **The mock says what it is.** `cuts-mock/three-cuts.ts` keeps its own calls
  per cut (the motion the owner approved) and its header now says so and why,
  instead of claiming the replay model's calls. Its gate reads `GATED_TOOLS`
  and the verdict, as the route does.
- **StudioChat draws, `useCutsStream` runs.** The transport, the data parts,
  Stop and its read-back, the undo group and the self-check moved to
  `components/editor/use-cuts-stream.ts`. The rules it keeps (the gate holds
  the run open, what one receipt counts, the run state) are pure functions in
  `components/editor/cuts-stream.ts`, tested in node.
- **Dead code.** `AgentMark` is gone, and the names used only in their own
  file in `gate.ts`, `three-cuts.ts` and `director.ts` are no longer exported.
- **AGENTS.md** names the margin by its files and lists the shadcn and AI
  Elements components it really uses.
