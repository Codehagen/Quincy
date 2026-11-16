# 031 — What the video editor does today (facts for the marketing page)

Read 2026-11-15 from `components/editor/*`, `lib/editor/*`, `app/api/editor/*`,
`app/(app)/cuts/*`, `app/prototypes/editor/*`, `docs/video-ingest.md`,
`plans/perf/cuts.md`. The page at `app/prototypes/video/` may only claim the
**Works today** column. **Partly** items need careful words. **Not built**
items stay off the page.

Product working name on the page: **Cuts** (the route is `/cuts`). The app
calls the editor component `Studio`, but "Studio" is the chat page, so the page
never uses that word.

## Works today

| Area | What is true | Where |
| --- | --- | --- |
| Upload | One video or audio file per drop (`video/*,audio/*`), up to 5 GB. The browser hashes the file and PUTs it straight to R2. The same file again comes back `alreadyIngested`, with no second transcode. | `upload-drop.tsx`, `api/editor/uploads`, `MAX_UPLOAD_BYTES` |
| Ingest | Probe, editing proxy (ffmpeg), waveform peaks, keyframe seek index, thumbnail. Probe and proxy are fatal; transcript, seek index and thumbnail are warnings. | `lib/editor/ingest.ts`, `api/editor/assets/[id]/ingest` |
| Transcription | Deepgram, word timestamps, at ingest. `nova-3` for English, `nova-2` fallback for other languages. Footage with no speech still ingests. | `transcriber-deepgram.ts` |
| Describe the edit | A chat beside the timeline. A model (default `anthropic/claude-sonnet-5`) calls tools. The ops stream to the timeline while it talks. The run holds the document (timeline read-only, with a reason) and saves once at the end. Max 8 steps per run. | `api/editor/projects/[id]/agent`, `lib/editor/agent.ts`, `studio-chat.tsx` |
| Agent tools | `remove_silences`, `add_captions`, `reframe` (16:9, 9:16, 1:1), `split_clip`, `delete_clip`, `crop` (what stays in frame), `punch_in` / `clear_punch_in`, `apply_look` / `clear_look`, `fade_clip`, `describe_timeline`. Each tool reports in prose what it changed, or that it changed nothing. | `agent.ts` |
| Same edits by hand | Every agent tool compiles to the same ops a button makes. One run is one revision and one undo. | `edits.ts`, `tools.ts`, `ops.ts` |
| Cut the pauses | Finds silences from word timings (default: pauses over 350 ms, 120 ms padding kept), splits the spine, closes the gaps, remaps every caption. | `tools.ts removeSilences`, `transcript.ts` |
| Captions | Built from the transcript, never automatic. Word by word or a phrase at a time. They survive later cuts because each word keeps its source time. Burned in on export. | `tools.ts addCaptions`, `composition.tsx` |
| Transcript as edit surface | The transcript panel shows the words. Drag to select words, then Delete cuts them or Zoom punches in on them. Click a line to seek. The live word follows the playhead. | `studio-transcript.tsx` |
| Timeline / lanes | Spine of clips, caption lane, effect lane, waveform, filmstrip. Split, trim by drag, delete with ripple, drag on the lane to zoom. | `studio-lanes.tsx`, `effect-lane.ts` |
| Zoom (punch-in) | Push in on a clip or a range for emphasis and ease back out; nothing changes length. From chat, the transcript or the lane. | `edits.ts punchIn`, `studio-zoom.tsx` |
| Looks | Brightness, contrast, saturation, blur, colour shift, black and white, sepia, invert. Whole spine unless a clip is named. | `effect-catalogue.ts` |
| Fades | Fade up at a clip start, down at its end. No cross-dissolve. | `edits.ts fade` |
| Frame shape | Wide 16:9, vertical 9:16, square 1:1. Reframe fits the picture inside (bars), `crop` chooses what fills the frame. | `document.ts`, `studio.tsx` frame picker |
| Export | MP4, rendered in the browser tab with `@remotion/web-renderer` (WebCodecs), same compositor as the preview, real percentage on the button. Size is the canvas size. | `use-export.ts`, `export-button.tsx` |
| Model spend | Each agent run writes a `usage_event`. Rolling 24-hour ceiling (`ceilingVerdict`) shared with the chat, input size check, entitlement gate before the lock. | agent route |

## Partly

- **Browser support for export.** Export needs WebCodecs. A browser without it gets "This browser cannot encode video." Say "exports an MP4 from your browser", do not promise every browser.
- **Length.** Ingest runs in a 300 s Vercel function. A long 4K take can hit that ceiling and fail. Say "short recordings" or say nothing about length.
- **Non-English speech.** Works through the `nova-2` fallback; quality was measured on one sample only. Do not lead with languages.
- **One recording per project.** A project opens on one asset. You can split it into many clips, but you cannot drop several takes into one cut yet. "Drop a recording", not "drop your clips".
- **Discoverability.** `/cuts` is deliberately not in the sidebar ("the largest unfinished surface in the app"). The page is a prototype; it should read as early access.
- **Cost metering for ingest.** Deepgram and transcode spend are not written to `usage_event`, and ingest has no cooldown. Only the agent run is metered. Do not claim "every minute is on your credits page".

## Not built

- Several takes in, best take picked. `vision` is a port in `ingest.ts` ("earns its place with b-roll and best-take") but nothing wires it.
- B-roll, music placement, voiceover. The `audio` track kind exists; no tool or UI adds music. (The editor prototype's "Place music" step is fixture only.)
- Text overlays / titles from the agent. The `text` element kind exists; no tool.
- Posting a cut. No channel takes video; nothing publishes from `/cuts`. So "Approve and post" does not exist for video, and no numbers come back for a cut.
- Numbers against your median for a posted video. Depends on the line above.
- Quincy starting a cut on its own or messaging "your cut is ready". Runs happen only when you type in the editor.
- Several cuts from one recording, one per platform. The `/rhythm` copy mentions three uploads with three first seconds; that is a rhythm idea, not editor code.
- Cross-dissolves, keyframe animation beyond fades, speed changes, audio cleanup.

## What this means for the page

- Lead with what is true and unusual: you say the edit in a sentence, the
  timeline moves while it works, and every change is a normal edit you can undo
  or redo by hand. The transcript is a second place to cut.
- "Your cut is ready. Held for your read." is **not true today** as a message
  Quincy sends. On the page it may only show as what happens inside the editor
  after you ask (the run ends, the cut waits for you). Wording: the cut waits,
  you export it. Not "Quincy posts it".
- Quincy drafts, you send: for video that means Quincy cuts, you export. No
  autoposting, and also no posting at all yet. Say so plainly.
- The median section is a future promise. Either cut it or label it "Coming"
  with no numbers.

## Open questions for the owner

1. Is "Cuts" the name, or a placeholder?
2. Ship the median section as "coming", or drop it until a channel takes video?
3. Should the page say "early access" outright, given `/cuts` is not in the sidebar?
4. Ingest spend is not metered and has no cooldown. That is a `Money` rule gap,
   separate from this page, and worth a plan of its own.
