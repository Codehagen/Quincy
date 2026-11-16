# Plan 018: Say it out loud — voice notes become riffs

> Written **after** execution rather than before it, unlike 015 and 016. The
> shape of this one was settled by research (which provider, which mechanism)
> and then by two bugs that only a live run could find, so a plan written first
> would have been fiction on the points that mattered. What follows is the
> record: what was built, what was decided, and what the live runs changed.

## Status

- **Priority**: P1 — the first input to /riffs that does not require the user
  to be at a keyboard, and the reason the page exists.
- **Effort**: L
- **Risk**: MED — introduces the product's first durable background
  infrastructure and a second per-minute spend.
- **Depends on**: the riffs table (referenced in code as plans/017; the file
  was never written), 016 (the rhythm dispatcher, for the money patterns).
- **Category**: feature
- **Executed at**: 2026-08-08, branch `feat/voice-riffs`

## Why this matters

`lib/sources.ts` has listed **"Voice notes — what you said out loud,
transcribed"** since before anything could produce one, and the /riffs demo
fixtures have shipped a `sourceId: "voice"` card the whole time. The page's
entire premise is that a half-formed thought should be catchable at the moment
you have it, and every input it had until now required sitting down and typing.

The framing that decided the design came from the checkpoint that asked for it:
*"walk, speak, come back to riffs waiting."* Nobody is watching a screen in that
sentence, and that single fact ruled out the obvious build.

## The decisions

### Batch transcription, not a live session

The neighbouring project (`realagent`) has a working OpenAI Realtime
transcription box — WebRTC, ephemeral client secrets, `gpt-realtime-whisper`,
deltas streaming into a textarea. It was tempting to port it and it would have
been wrong here.

Streaming transcription is a **feedback** feature: it exists so somebody
watching a box sees words appear. On a walk there is no box and no watcher, so
streaming buys a display nobody reads, on the mobile network least able to
deliver it, at a per-minute session cost.

What the recorder actually has to answer is *"is the mic hearing me?"* — and
silence with no response is indistinguishable from a dead microphone. That is a
system-status problem, and it is answered by a **level meter** drawn from the
local audio stream: no request, no cost, faster than any round trip, and it
keeps working when the signal drops.

A live dictation surface may still earn its place later, for somebody at a desk
who wants to speak instead of type. That is a different surface from this one.

### Through the AI Gateway, not a provider key

`@ai-sdk/gateway` lists transcription models natively (`openai/gpt-4o-transcribe`,
`openai/whisper-1`, `xai/grok-stt`, and the realtime ones), and
`AI_GATEWAY_API_KEY` is already in production. So no new secret, one billing
surface, and the provider is a string in `VOICE_NOTE_MODEL` rather than a
dependency.

`DEEPGRAM_API_KEY` is also in the environment and `lib/editor/transcriber-deepgram.ts`
is a working batch transcriber, but it exists for the video editor's word
timestamps. Pointing a second feature at it would make one provider load-bearing
for two unrelated things.

### Vercel Workflow, not `after()` and not Trigger.dev

Trigger.dev was never a real candidate: `realagent` **migrated off it onto
Vercel Workflow** — the scars are in `workflows/registry.ts` ("Replaces
Trigger.dev's `tasks.trigger(...)`") and in comments across its workflow files.
Same author, same stack, decision already paid for.

`after()` was the cheaper option and does not survive comparison. It is not
durable: a crashed function loses the work with no retry and no row that knows
it was running. And the stuck-state story /riffs already needed — `startedAt`, a
terminal state, a retry — is precisely the machinery Workflow ships. Writing it
by hand to avoid the dependency would have been writing the dependency.

That unblocks the two-phase riff creation the previous plan deferred for exactly
this reason ("a skeleton that can hang forever with no retry is worse than ten
honest seconds").

### A second angle generator, beside the first

`generateAngles` is built around somebody else's post and its rules forbid
reusing the source's specifics — correct there, and precisely **wrong** for a
voice note, where the numbers are the user's own and stripping them leaves what
`ANGLES_RULES` itself calls a topic rather than an angle.

So `generateAnglesFromSaid` lives in `lib/adapt.ts` directly beside it, sharing
the schema. Two files would have hidden the inversion; side by side it is
visible, and `lib/adapt.test.ts` asserts the said-prompt never describes the
user's own words as somebody else's.

## What the live runs changed

Two bugs that no stubbed test could have found.

### 1. The feature metered as free

`openai/gpt-4o-transcribe` through the Gateway returns a transcript with
`durationInSeconds` **undefined**. `recordTranscriptionCost` returns early on
`seconds <= 0`, so every voice note recorded zero cost — nothing threw, nothing
logged, the number was simply never written. Exactly the shape AGENTS.md's Money
section warns about.

Fixed by carrying the browser's measured length (`x-voice-note-seconds`),
clamped on both sides, used only when the provider reports none. Regression
tests in `lib/voice-note.test.ts`.

### 2. Structured output is intermittently malformed — and not only here

The angle call failed roughly one time in five with
`object.angles.filter is not a function`. `lib/adapt.ts` already documents one
*trigger* for this (`minItems`/`maxItems`, banned since plan 015) but removing
the trigger did not remove the fault. Two distinct manglings were captured live:

1. The whole object JSON-encoded into a string inside the first property, with
   every other key missing.
2. The array collapsed into scalar root properties, with the model's own
   `<parameter name="hook">` tool-call markup leaking into the value.

`lib/structured-output.ts` answers both: `unwrapStringifiedObject` recovers (1)
for free — the data is already there, one `JSON.parse` away, and a retry would
be paying twice for an answer we hold — and `retryMalformed` bounds a second
attempt for everything else. Measured 12/12 after, with the retry visibly firing
once.

**This was never a voice bug.** The shipped adapt path shares the schema, model
and gateway; a run that hits it surfaces to the user as "Quincy could not find
an angle in that", indistinguishable from a legitimate empty answer, which is
why it would never have been reported. `generateAngles` and `generateAdaptation`
are now guarded too.

## What shipped

| Area | File |
|------|------|
| Transcription + ceilings + cooldown | `lib/voice-note.ts` |
| Malformed-output defences | `lib/structured-output.ts` |
| Own-material angle generator | `lib/adapt.ts` (`generateAnglesFromSaid`) |
| Riff lifecycle | `lib/riffs.ts` (`startVoiceRiff`, `completeVoiceRiff`, `failVoiceRiff`) |
| The durable job | `workflows/run-voice-riff.ts` |
| Upload entry point | `app/api/voice-notes/route.ts` |
| Recorder + level meter | `components/riffs/record-box.tsx` |
| Poll while working | `components/riffs/riffs-refresh.tsx` |
| Schema (`failed`, `failure`, `started_at`) | `lib/schema-app.ts`, `scripts/voice-riffs.sql` |

Money: ceiling on bytes (`MAX_AUDIO_BYTES`) and duration (`MAX_AUDIO_SECONDS`,
ten minutes), cooldown at 30s, metered through `usage_event` as
`voice:transcribe` — the fourth non-model label after `x:post`, `x:read` and
`x:bookmark-read`.

Privacy: the audio is deleted from R2 as soon as the words exist, success or
failure. The transcript is stored before angles are asked for, so an angle
failure never costs somebody the thing they cannot say twice.

## Verification

```bash
pnpm test                                                    # 657 pass
npx tsx --env-file=.env.local scripts/verify-voice-e2e.ts    # 22 checks
npx tsx --env-file=.env.local scripts/verify-voice-e2e.ts --live
```

Live-verified, not stubbed: real Norwegian speech (macOS `say -v Nora` → wav)
through the real route, R2, workflow and Gateway. Transcript came back verbatim
in 1.8s; the riff went `working → ready` in 11s; the angles kept the user's own
specifics ("en person gjør jobben for et firma på førti ansatte"), which is the
whole point of the second generator and the thing the adapt path would have
stripped.

## What the prototype changed (2026-08-08)

Four directions were built behind a picker at `/prototypes/record`, over the
real riffs page, with a real microphone and meter and a faked send. The surface
has been deleted; this is what it decided.

- **Current** — the shipped flow. Arm, then capture, in a centred dialog.
- **Instant** — opening *is* recording. Thumb-zone bottom sheet, closes before
  the send lands.
- **Hold** — press to talk, release to send, slide left to cancel, slide up to
  lock.
- **Review** — stopping produces a take you hear back before anything is sent.

**Chosen: Review, in a sheet on a phone and a dialog on a desktop.**

- **Stopping no longer sends.** `MediaRecorder.onstop` produces a `Take` — blob,
  measured seconds, and the meter's own RMS readings downsampled to 56 bars —
  and the surface asks. Send, record again, or discard. "Quincy reads through
  the false starts" becomes a promise checkable *before* paying for it, and the
  failures it catches are the ones that actually happen: the pocket recording,
  the take that trailed off, the sentence that never finished.
- **The ten-minute ceiling got strictly cheaper.** It used to stop the recorder
  and upload; now it stops the recorder and lands on the review step, where
  Discard costs nothing. Ten minutes of pocket noise is no longer billable by
  accident.
- **A failed send returns to the take, not to an empty recorder.** The recording
  is still there and still sendable. Dropping somebody to idle after a failed
  send throws away the one thing they cannot say twice.
- **Focus follows the take.** Stop unmounts at the moment the review step
  appears, and a focused element disappearing drops focus to `<body>`. Send is
  both the primary and the safe target, so focus moves there explicitly.
- **The waveform is real data, not decoration.** The meter loop already computes
  RMS per frame; the take keeps them. `downsampleLevels` means each bar rather
  than sampling the stride, because sampling a ten-minute take draws a picture
  of the stride. Pure and tested.
- **Rejected: Instant.** The fastest capture, and it makes nothing provisional —
  a mis-tap is a recording, the permission prompt lands *during* the take, and
  because the sheet closes before the send lands, a failure has nowhere to be
  said but on the card. Worth revisiting if capture speed ever measurably costs
  a thought.
- **Rejected: Hold.** Cancelling costs nothing, which is genuinely better than
  any tap-to-start design. It cannot carry a ten-minute thought, the lock is a
  gesture nobody discovers, and it is hostile to a tremor or a weak grip. The
  fallbacks that fix it (short-press-to-lock, Enter, release-while-the-permission
  -sheet-is-up) are three special cases around one gesture.
- **Rejected: a toast for the confirm step** (the shape Sonner would give it).
  `components/drafts/draft-card.tsx` already wrote the rule down: a timed,
  dismissible container is a deadline on noticing your own mistake. It is also
  non-modal, and playback plus three actions — one destructive — needs a focus
  trap. No toast library is installed and none was added.
- **Sheet on mobile, not a drawer library.** `useIsMobile` + `Sheet
  side="bottom"`, the split `components/ui/sidebar.tsx` already makes. Vaul
  would mean a second dialog system, and drag-to-dismiss over an unrecoverable
  take is the toast hazard again, gestural.

## Follow-ups

1. **`--live` mode transcribes nothing.** It exercises the real angle
   generator from a fixed transcript; real audio was verified by hand. Feeding
   a committed audio fixture through it would close that.
2. **No per-user daily ceiling**, still. Each run is capped; the day is not.
   Voice is the second scheduled-ish spender after the rhythm dispatcher and
   makes plan 016's open follow-up more pressing, not less.
3. **The stuck clock is read on page load**, not swept. Correct while somebody
   is looking; a riff that dies with the tab closed stays `working` until the
   page is next opened. A sweep earns its cron when a notification needs it.
4. **`RiffsRefresh` polls**, which is right for a ten-second wait a few times a
   day and wrong if voice becomes common enough to keep tabs open on it.
5. **Safari is unverified.** `MediaRecorder` there produces mp4/aac and the
   code handles it, but no Safari run has happened. The review step raises the
   stakes: it now plays that blob back through an `<audio>` element, and Safari
   is also the browser where `audio.duration` on a recorded blob is least
   trustworthy — which is why playback progress is computed from the measured
   seconds instead.
6. **The review step has not been driven on a real device.** Types, lint, 675
   tests and a production build are green, and the four directions were built
   and rendered, but a microphone and a session cannot be driven headlessly.
   The first real run is the verification.
7. **No toast, and not a follow-up.** Sonner was considered for the confirm
   step and rejected on the rule in `components/drafts/draft-card.tsx`; the
   weaker case — a notice *after* the send — was then declined outright on
   2026-08-08 rather than left open. The card in the list already carries both
   facts, permanently and in the place you go to read them, so a toast would
   duplicate a durable message with a disappearing one. No toast library is
   installed and none is planned.
