"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Mic01Icon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"

import { useIsMobile } from "@/hooks/use-mobile"
import {
  Button,
  Dialog,
  DialogClose,
  DialogFooter,
  DialogPanel,
  DialogTrigger,
  HoldButton,
  IconButton,
  Mono,
  Sheet,
  SheetClose,
  SheetFooter,
  SheetPanel,
  SheetTrigger,
  Text,
} from "@/components/kit"
import { MAX_AUDIO_SECONDS } from "@/lib/voice-note"

import {
  downsampleLevels,
  formatElapsed,
  microphoneFailureMessage,
} from "./record-helpers"

/**
 * Say it out loud; hear it back; come back to angles.
 *
 * The surface plans/018 was written for. Somebody has a thought on a walk, says
 * it into their phone, and finds riffs waiting when they sit down.
 *
 * **Stopping does not send.** Decided from the four-way prototype at
 * /prototypes/record on 2026-08-08 (Current / Instant / Hold / Review), and it
 * is the one thing that changed: the recorder hands you the take — the real
 * waveform of what you just said, playable — and asks. Send, record again, or
 * throw it away. The argument is that "Quincy reads through the false starts"
 * becomes a promise you can check *before* paying for it, and the failures it
 * catches are the ones that actually happen: the pocket recording, the take
 * where you trailed off, the ten-minute ceiling firing on a phone you forgot
 * about. At roughly $0.013 a run, three seconds of listening is cheap.
 *
 * The cost is real and deliberately bounded: this feature is "say it and walk
 * on", so the confirm step has to be fast to leave. Send is the primary and it
 * is where focus lands; nothing here invites you to linger.
 *
 * **A sheet on a phone, a dialog on a desktop.** `useIsMobile` and
 * `Sheet side="bottom"`, the same split `components/ui/sidebar.tsx` already
 * makes. This is the walk-and-talk feature, so the phone is the primary device,
 * and a centred dialog puts the one control you are aiming at in the middle of
 * the screen where a thumb does not reach. Rejected: a toast for the confirm
 * step. `components/drafts/draft-pane.tsx` already wrote that rule down — a
 * timed, dismissible container is a deadline on noticing your own mistake, and
 * the take is the one thing in this product nobody can say twice.
 *
 * **The meter is the feature, not decoration.** The one question a recorder has
 * to answer while it runs is "is it hearing me?", and silence with no response
 * is indistinguishable from a dead microphone. A live transcript would answer
 * it too, and that is the expensive way: a streaming session per minute to
 * display words nobody is reading on the network least able to carry them. The
 * meter answers it from the local audio stream — no request, no cost, and it
 * keeps working with the signal gone.
 */

/**
 * How many bars of history the live meter shows, and how often it advances.
 *
 * A scrolling history rather than a single level that jumps around. The
 * difference matters: a bar showing the current level proves the mic is live
 * *now*, and one that scrolls proves it heard the sentence you just said.
 *
 * 24 bars at 20Hz is about 1.2 seconds — long enough to see a phrase, short
 * enough that the whole thing fits beside a timer.
 */
const BARS = 24
const FRAME_MS = 1000 / 20

/**
 * How many bars the finished take is drawn with.
 *
 * More than the live meter, because this one is a shape rather than a signal:
 * you are looking for the pause where you lost the thread, and 24 buckets
 * average a ten-minute recording into mush.
 */
const WAVE_BARS = 56

/**
 * The reduced-motion rate.
 *
 * The meter is information, so it is damped rather than removed — removing it
 * would take away the only answer to "is this working?" from the people who
 * asked for less movement, not less feedback. At 6Hz it still tracks speech
 * and stops flickering. The global block in app/globals.css cannot do this
 * one: it flattens CSS durations, and this is a rAF loop writing a custom
 * property, exactly like `hold-to-confirm`.
 */
const REDUCED_FRAME_MS = 1000 / 6

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

// The impure clock, read only from event handlers and interval callbacks —
// never during render. Reading it through a named function keeps the component
// body clean for the purity lint, which cannot tell the two cases apart. The
// same dodge, for the same reason, as components/hold-to-confirm.tsx.
const nowMs = () => Date.now()

/**
 * What `MediaRecorder` will actually give us, best first.
 *
 * Not negotiable from script — Chrome and Firefox produce webm/opus, Safari
 * produces mp4/aac, and asking for the other one throws. So the list is what
 * the platform offers rather than what we would pick, and the server's
 * accepted set is the same list seen from the other end.
 */
const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
]

function pickMimeType(): string {
  if (typeof MediaRecorder === "undefined") return ""
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? ""
}

/**
 * Which speaker iOS should use, said out loud rather than guessed at.
 *
 * The review step was silent on an iPhone, and neither the recording nor the
 * blob was at fault — the take that prompted this transcribed a full sentence.
 * iOS decides *where* page audio goes from an audio session category, and a
 * page that has called `getUserMedia` is in `play-and-record`: output routes to
 * the earpiece receiver, at call volume, for a phone you are holding at arm's
 * length. Releasing the tracks does not reliably put it back. On top of that,
 * the default category obeys the hardware ring/silent switch, so a phone on
 * silent plays a take to nobody — and this is the walk-and-talk feature, which
 * is to say the feature used by a phone that lives in a pocket on silent.
 *
 * Both are the same setting, and Safari has let us state it since 16.4.
 * `playback` means "this is the content, not a notification": main speaker,
 * ring switch ignored. Feature-detected because it is WebKit-only — every
 * other browser routes correctly without being asked and returns undefined
 * here.
 *
 * Not typed in lib.dom yet, hence the cast. Narrowed to the two categories
 * this component actually moves between so a third cannot be passed by
 * accident.
 */
function setAudioSession(type: "playback" | "play-and-record") {
  if (typeof navigator === "undefined") return
  const session = (
    navigator as Navigator & { audioSession?: { type: string } }
  ).audioSession
  if (!session) return
  /**
   * A hint that fails is still only a hint.
   *
   * The truthy check above proves something is there, not that it is the
   * thing this cast claims — a shim, a future spelling, or a read-only
   * property would all pass it and throw on assignment. Which would matter
   * far more than losing the routing: the `startRecording` call site runs one
   * line after `streamRef.current = stream` and is invoked as
   * `void startRecording()`, so a throw becomes an unhandled rejection that
   * skips `teardown` and leaves the microphone — and the browser's recording
   * indicator — on, with nothing on screen to say why. This file already
   * names that as the worst bug this feature could have.
   */
  try {
    session.type = type
  } catch {
    // Routing stays wherever the platform left it. Playback may be quiet on
    // that browser; everything else about the recorder still works.
  }
}

// The pure helpers live in record-helpers.ts, so their test does not load
// the kit (next/font) to reach them. Re-exported for existing callers.
export { downsampleLevels, formatElapsed, microphoneFailureMessage }

/**
 * `idle` — nothing captured. `recording` — the mic is open.
 * `review` — a take exists and nothing has been sent or spent.
 * `sending` — the upload is in flight.
 */
type Phase = "idle" | "recording" | "review" | "sending"

/** One finished recording, everything the review step needs. */
type Take = {
  blob: Blob
  mimeType: string
  /** Object URL for playback. Revoked whenever the take is dropped. */
  url: string
  /**
   * Measured off the clock rather than left to the provider.
   *
   * `openai/gpt-4o-transcribe` returns a transcript with no duration on it, and
   * without a number the whole feature meters as zero — nothing errors, the
   * cost is simply never recorded.
   */
  seconds: number
  /** The take's own RMS readings, downsampled to `WAVE_BARS`. */
  levels: number[]
}

export function RecordBox({
  isAction = false,
  onOpen,
  onCaptured,
}: {
  /**
   * Whether Record a thought is the page's one action right now. The page
   * decides (docs/design/actions.md, "Which action wins"): it is the standing
   * step when no open idea is waiting on a Draft. Inside the dialog, Record,
   * Stop and Send are always the action; the dialog is its own view.
   */
  isAction?: boolean
  /** Called when the recorder opens, so the page can clear its Undo. */
  onOpen?: () => void
  /** The riff the take became, so the page can open it. */
  onCaptured?: (riffId: string) => void
}) {
  const router = useRouter()
  const isMobile = useIsMobile()

  const [open, setOpen] = React.useState(false)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [elapsed, setElapsed] = React.useState(0)
  const [failure, setFailure] = React.useState<string | null>(null)
  const [take, setTake] = React.useState<Take | null>(null)
  const [playing, setPlaying] = React.useState(false)

  /**
   * Everything the browser hands out that has to be given back.
   *
   * In refs rather than state because none of it renders, and because the
   * cleanup path has to reach the *current* values from an effect that must
   * not re-run when they change. A `MediaStream` left running keeps the
   * browser's recording indicator lit after the dialog is gone, which reads to
   * the user as an app that is still listening — the worst possible bug for
   * this particular feature to have.
   */
  const streamRef = React.useRef<MediaStream | null>(null)
  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const audioCtxRef = React.useRef<AudioContext | null>(null)
  const rafRef = React.useRef<number | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const meterRef = React.useRef<HTMLDivElement>(null)
  const startedAtRef = React.useRef(0)
  /** Every level of the current take, for the waveform the review step draws. */
  const takeLevelsRef = React.useRef<number[]>([])

  /** The player, and the loop that moves the played portion of the waveform. */
  const audioRef = React.useRef<HTMLAudioElement>(null)
  const waveRef = React.useRef<HTMLDivElement>(null)
  const playRafRef = React.useRef<number | null>(null)

  /** Focus target when the take arrives, so it never falls back to `<body>`. */
  const sendRef = React.useRef<HTMLButtonElement>(null)

  /**
   * Which attempt is current, so an abandoned one cannot write state.
   *
   * The upload is a `fetch` nobody awaits from the UI, and the dialog can be
   * closed while it is in flight — Escape and the X both do it, and neither is
   * covered by disabling the Cancel button. Without this the sequence is:
   * close (which clears the error), the abandoned upload rejects, it sets a
   * failure on a dialog nobody is looking at, and that sentence is sitting
   * there the *next* time somebody opens it, describing a recording they
   * already walked away from.
   *
   * Bumped on every close and every new recording, so only the attempt that
   * still owns the dialog may report anything.
   */
  const attemptRef = React.useRef(0)

  const stopPlayback = React.useCallback(() => {
    if (playRafRef.current !== null) {
      cancelAnimationFrame(playRafRef.current)
      playRafRef.current = null
    }
    const audio = audioRef.current
    if (audio) {
      audio.pause()
      audio.currentTime = 0
    }
    setPlaying(false)
    waveRef.current?.style.setProperty("--played", "0")
  }, [])

  /** Releases the microphone and everything hanging off it. Safe to call
   *  twice — every branch nulls what it closes. */
  const teardown = React.useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    const recorder = recorderRef.current
    if (recorder && recorder.state !== "inactive") {
      // `onstop` is what produces the take; detach it first so a teardown from
      // a closing dialog cancels the recording rather than silently keeping it.
      recorder.ondataavailable = null
      recorder.onstop = null
      recorder.stop()
    }
    recorderRef.current = null

    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null

    void audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null

    chunksRef.current = []
  }, [])

  /**
   * Throws the take away and gives the memory back.
   *
   * The object URL matters: without the revoke, every recording made in a
   * session is pinned for as long as the tab lives, and a ten-minute take is
   * megabytes. The rule this feature ships with is that audio dies as soon as
   * it has served its purpose, and the client is not exempt from it.
   */
  const dropTake = React.useCallback(() => {
    stopPlayback()
    setTake((current) => {
      if (current) URL.revokeObjectURL(current.url)
      return null
    })
    takeLevelsRef.current = []
  }, [stopPlayback])

  // The unmount guard. A user who navigates away mid-recording never runs the
  // dialog's close handler, and the mic would stay open across the route
  // change.
  React.useEffect(() => {
    return () => {
      teardown()
      if (playRafRef.current !== null) cancelAnimationFrame(playRafRef.current)
    }
  }, [teardown])

  /**
   * The take arrived, so focus follows it.
   *
   * The button that was focused — Stop — unmounts at this moment, and a focused
   * element disappearing drops focus to `<body>`: a keyboard user would be
   * tabbing from the top of the document to reach a decision about their own
   * recording. Send is both the primary action and the safe one.
   */
  React.useEffect(() => {
    if (phase === "review") sendRef.current?.focus()
  }, [phase])

  /**
   * The live meter loop.
   *
   * Writes `--level-N` custom properties straight to the container's style and
   * never touches React state. At 20Hz a `setState` per frame would re-render
   * the dialog twenty times a second to move twenty-four bars, which is the
   * re-render storm the performance rules exist to prevent — the same
   * reasoning `hold-to-confirm` gives for driving its fill from rAF.
   */
  const runMeter = React.useCallback((analyser: AnalyserNode) => {
    const buffer = new Uint8Array(analyser.fftSize)
    const history = new Array<number>(BARS).fill(0)
    const frameMs = prefersReduced() ? REDUCED_FRAME_MS : FRAME_MS
    let last = 0

    const tick = (now: number) => {
      rafRef.current = requestAnimationFrame(tick)
      if (now - last < frameMs) return
      last = now

      analyser.getByteTimeDomainData(buffer)

      /**
       * RMS, not peak.
       *
       * Peak reads as full the moment anything clips and sits near zero
       * otherwise, so it answers "is there sound" as a boolean. RMS tracks how
       * loud the speech actually is, which is what makes the meter show a
       * sentence's shape rather than a row of on/off lights — and it is what
       * makes the finished waveform worth looking at.
       */
      let sum = 0
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128
        sum += v * v
      }
      const rms = Math.sqrt(sum / buffer.length)

      // Speech sits low on a linear scale; the curve lifts a normal talking
      // voice into the visible half without letting a shout saturate it.
      const level = Math.min(1, Math.sqrt(rms) * 1.8)

      history.shift()
      history.push(level)
      takeLevelsRef.current.push(level)

      const node = meterRef.current
      if (!node) return
      for (let i = 0; i < BARS; i++) {
        node.style.setProperty(`--l${i}`, history[i].toFixed(3))
      }
    }

    rafRef.current = requestAnimationFrame(tick)
  }, [])

  async function startRecording() {
    // A new attempt supersedes any upload still in flight from the last one.
    attemptRef.current += 1
    setFailure(null)
    dropTake()
    takeLevelsRef.current = []

    /**
     * The secure-context gate, before anything is asked for.
     *
     * `navigator.mediaDevices` is **undefined** on an insecure origin — not a
     * rejected promise, just missing — so calling `.getUserMedia` on it throws
     * a `TypeError` that the catch below reports as "Could not open the
     * microphone." True in the sense that it did not open, and useless: the
     * fix is the URL, and nothing in that sentence points at it.
     *
     * Not a hypothetical. This is the walk-and-talk feature, so the phone is
     * the primary device, and the ordinary way to get this branch on a phone
     * is `http://192.168.x.x:3000` — somebody testing the dev server from
     * their own pocket. Localhost is exempt from the rule, which is exactly
     * why it never shows up on the machine doing the building.
     */
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setFailure(microphoneFailureMessage(null, window.isSecureContext))
      return
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        /**
         * The browser's own cleanup, asked for by name.
         *
         * A walk is wind, traffic and a phone in a pocket. These three are
         * implemented in the audio stack far better than anything downstream
         * could do to a compressed blob, and turning them on costs nothing.
         */
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
    } catch (cause) {
      // A refusal and a failure need different sentences. The mapping is in
      // `microphoneFailureMessage` so it can be tested without a DOM.
      setFailure(
        microphoneFailureMessage(
          cause as { name?: string },
          window.isSecureContext
        )
      )
      return
    }

    streamRef.current = stream

    // The mic is open, so say so. iOS is already in this category by now —
    // stating it is what makes the flip back to `playback` at the review step
    // a transition between two things this component asked for, rather than a
    // guess about which one the platform left us in.
    setAudioSession("play-and-record")

    const mimeType = pickMimeType()
    if (!mimeType) {
      teardown()
      setFailure("This browser cannot record audio.")
      return
    }

    const recorder = new MediaRecorder(stream, { mimeType })
    recorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) chunksRef.current.push(event.data)
    }

    /**
     * Stopping produces a take. It does not send one.
     *
     * The decision from /prototypes/record: nothing is uploaded and no money
     * is spent until somebody has seen what they captured. Read the clock
     * before `teardown` clears anything, and read it here rather than from
     * `elapsed` state because the 1Hz interval may be up to a second stale.
     */
    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mimeType })
      const seconds = Math.max(
        1,
        Math.round((nowMs() - startedAtRef.current) / 1000)
      )
      const levels = downsampleLevels(takeLevelsRef.current, WAVE_BARS)
      // Release the mic before anything else. There is no reason to hold it —
      // and the browser's recording indicator — through a review step.
      teardown()

      if (blob.size === 0) {
        setPhase("idle")
        setFailure("That recording came out empty. Check the microphone.")
        return
      }

      setTake({
        blob,
        mimeType,
        url: URL.createObjectURL(blob),
        seconds,
        levels,
      })
      setPhase("review")
    }

    const ctx = new AudioContext()
    audioCtxRef.current = ctx
    const analyser = ctx.createAnalyser()
    // Small window: this is a level meter, not a spectrum. 1024 samples is
    // ~21ms at 48kHz, which tracks speech without averaging it flat.
    analyser.fftSize = 1024
    ctx.createMediaStreamSource(stream).connect(analyser)

    startedAtRef.current = nowMs()
    setElapsed(0)
    setPhase("recording")
    recorder.start()
    runMeter(analyser)
  }

  function stopRecording() {
    const recorder = recorderRef.current
    if (!recorder || recorder.state === "inactive") return
    // `onstop` fires after the last `ondataavailable`, which is what makes the
    // blob complete. Building it from here instead would drop the final chunk.
    recorder.stop()
  }

  /**
   * The elapsed clock, and the ceiling.
   *
   * The cap now ends the take rather than sending it, which is strictly better
   * than what shipped: ten minutes of pocket noise stops at the review step,
   * where Discard costs nothing, instead of being uploaded and charged for.
   */
  React.useEffect(() => {
    if (phase !== "recording") return

    const id = setInterval(() => {
      const seconds = Math.floor((nowMs() - startedAtRef.current) / 1000)
      setElapsed(seconds)
      if (seconds >= MAX_AUDIO_SECONDS) stopRecording()
    }, 1000)

    return () => clearInterval(id)
  }, [phase])

  /**
   * Playback progress, written as a custom property.
   *
   * The denominator is the measured length, never `audio.duration`: a
   * `MediaRecorder` webm blob reports `Infinity` there in Chrome, which is the
   * same class of silently-wrong number as the transcription that metered as
   * free. And it writes to the DOM rather than to state, because 56 spans
   * re-rendering sixty times a second to recolour themselves is exactly the
   * storm the meter loop already avoids.
   */
  function togglePlayback() {
    const audio = audioRef.current
    if (!audio || !take) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      if (playRafRef.current !== null) cancelAnimationFrame(playRafRef.current)
      playRafRef.current = null
      return
    }

    function step() {
      const node = waveRef.current
      const el = audioRef.current
      if (!node || !el || !take) return
      node.style.setProperty(
        "--played",
        Math.min(1, el.currentTime / take.seconds).toFixed(4)
      )
      playRafRef.current = requestAnimationFrame(step)
    }

    /**
     * Out of the speaker, not the earpiece, and not muted by the ring switch.
     *
     * Set on every play rather than once on mount: "Record again" reopens the
     * mic and puts iOS back into `play-and-record`, so the review step has to
     * reclaim the category each time it is reached.
     */
    setAudioSession("playback")

    /**
     * Optimistic, then reverted — because a rejection here used to be invisible.
     *
     * `play()` returns a promise, and `void`ing it meant that a take iOS
     * refused to decode flipped the button to Pause, left the waveform frozen
     * at zero, and said nothing. That is the same failure as a silent speaker
     * from the outside, which is exactly the ambiguity that made this bug take
     * a session to find. Kept optimistic so the button still responds on the
     * frame it is pressed; `stopPlayback` puts it back if the promise rejects.
     */
    void audio.play().catch((cause: { name?: string }) => {
      /**
       * Our own `pause()` is not a failure, and it is the common rejection.
       *
       * `play()` stays pending until playback actually begins, and anything
       * that pauses inside that window rejects it with `AbortError` — the
       * Pause button two lines up, `stopPlayback` from Discard or Send, and
       * `dropTake` from closing the sheet. All four are the user getting what
       * they asked for. Reporting them would put a red sentence under a take
       * somebody simply paused, and rewind it to zero on the way past, since
       * `stopPlayback` resets `currentTime` where the Pause branch
       * deliberately does not.
       *
       * The close case is worse than wrong, it is durable: `onOpenChange`
       * clears the failure and *then* this rejects, so the message would be
       * sitting there the next time the recorder opens — the same stale-error
       * bug `attemptRef` exists to prevent on the upload path.
       */
      if (cause?.name === "AbortError") return
      stopPlayback()
      setFailure("Could not play that back here. Sending it still works.")
    })
    setPlaying(true)
    step()
  }

  async function send() {
    if (!take) return

    const attempt = attemptRef.current
    /** True while this upload is still the one the dialog is showing. */
    const current = () => attemptRef.current === attempt

    stopPlayback()
    setPhase("sending")
    setFailure(null)

    try {
      const response = await fetch("/api/voice-notes", {
        method: "POST",
        headers: {
          "content-type": take.mimeType,
          // Metering only. The server clamps it and never trusts it as a
          // limit — `MAX_AUDIO_BYTES` is the guard. See the route.
          "x-voice-note-seconds": String(take.seconds),
        },
        body: take.blob,
      })

      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: string
        } | null
        if (!current()) return
        // Back to the take, not to idle: the recording is still here and still
        // sendable, and dropping somebody to an empty recorder after a failed
        // send would throw away the thing they cannot say twice.
        setPhase("review")
        setFailure(body?.error ?? "Could not send that recording.")
        return
      }

      /**
       * The refresh happens even for an abandoned attempt, deliberately.
       *
       * The riff exists — the server made it before it answered — so the list
       * behind the dialog is out of date whether or not anybody is still
       * watching this component. Only the *messages* are scoped to the current
       * attempt; the fact of the recording is not.
       */
      const sent = (await response.json().catch(() => null)) as {
        riffId?: string
      } | null
      if (sent?.riffId) onCaptured?.(sent.riffId)
      if (current()) {
        dropTake()
        setPhase("idle")
        setElapsed(0)
        setOpen(false)
      }
      // The working card is in the list behind this. The page is a server
      // component, so it has to re-read.
      router.refresh()
    } catch {
      if (!current()) return
      setPhase("review")
      setFailure("Could not send that recording. Try again.")
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      onOpen?.()
      return
    }

    // Closing mid-recording — or on an unsent take — throws it away rather
    // than sending it. `teardown` detaches `onstop`, so this is a cancel and
    // not a silent submit: dismissing a dialog must never be a way to publish
    // something.
    teardown()
    dropTake()
    // Any upload still in flight stops owning the dialog here, so it cannot
    // leave a stale message for whoever opens it next.
    attemptRef.current += 1
    setPhase("idle")
    setElapsed(0)
    setFailure(null)
  }

  const recording = phase === "recording"
  const reviewing = phase === "review" && take !== null
  const sending = phase === "sending"

  const trigger = (
    <Button variant={isAction ? "action" : "quiet"} icon={Mic01Icon}>
      Record a thought
    </Button>
  )

  const title = reviewing ? "Send this to Quincy?" : "Record a thought"

  const description = reviewing
    ? "Listen back if you want. I read through false starts, so a messy take is fine. A take that stopped early is not."
    : "Say it however it comes out. You hear it back before anything is sent."

  const stage = reviewing ? (
    <div className="flex flex-col items-center gap-kit-group py-kit-related">
      {/* No caption track: this is your own voice, seconds old, and there is
          no transcript until the send happens. */}
      <audio
        ref={audioRef}
        src={take.url}
        preload="metadata"
        onEnded={stopPlayback}
        /**
         * A take the browser cannot decode says so. The decode failure and a
         * muted speaker look the same to whoever pressed play, and only one is
         * worth re-recording for; the transcript is made server-side from the
         * blob, so Send still works.
         */
        onError={() => {
          stopPlayback()
          setFailure("Could not play that back here. Sending it still works.")
        }}
      />

      <div className="flex w-full items-center gap-kit-related">
        <IconButton
          icon={playing ? PauseIcon : PlayIcon}
          onClick={togglePlayback}
          aria-label={playing ? "Pause the recording" : "Play the recording back"}
        />

        <Waveform levels={take.levels} ref={waveRef} />

        <Mono>{formatElapsed(take.seconds)}</Mono>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-kit-group py-kit-related">
      {/**
       * The live meter. `aria-hidden`: twenty-four bars say nothing to a
       * screen reader, and the live region below carries the same fact in
       * words. Each bar reads its own custom property, so the rAF loop writes
       * numbers and CSS does the drawing.
       */}
      <div
        ref={meterRef}
        aria-hidden="true"
        className="pointer-events-none flex h-12 items-center justify-center gap-[3px] select-none"
      >
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            style={{
              // The floor keeps a silent bar visible: a row that vanishes in
              // quiet reads as broken, not quiet. 0.13 of 48px is a 6px hairline.
              transform: `scaleY(calc(0.13 + 0.87 * var(--l${i}, 0)))`,
            }}
            className={
              // Transform only, so a moving bar never lays anything out.
              "h-full w-[3px] origin-center rounded-full transition-transform duration-75 motion-reduce:transition-none " +
              (recording ? "bg-kit-live" : "bg-kit-track")
            }
          />
        ))}
      </div>

      {/* Tabular figures: both digits change while you watch. */}
      <p aria-hidden="true" className="font-kit-mono text-kit-figure text-kit-ink tabular-nums">
        {formatElapsed(elapsed)}
      </p>
    </div>
  )

  /**
   * One live region for the whole action, with two lines reserved: the two
   * longest messages (the permission refusal and the https one) are first-run
   * outcomes, and a one-line box slid the footer out from under the cursor.
   */
  const status = (
    <div aria-live="polite" className="min-h-[2.875rem] text-center text-pretty">
      {recording ? (
        <Text variant="small" tone="muted">
          {/* The duration in words, once a minute: the timer above is
              aria-hidden, and the cap stops a take without warning. */}
          {elapsed >= 60
            ? `Listening, ${Math.floor(elapsed / 60)} ${Math.floor(elapsed / 60) === 1 ? "minute" : "minutes"} in. Press Stop when you are done.`
            : "Listening. Press Stop when you are done."}
        </Text>
      ) : sending ? (
        <Text variant="small" tone="muted">
          Sending it to Quincy…
        </Text>
      ) : failure ? (
        <Text variant="small">{failure}</Text>
      ) : reviewing ? (
        <Text variant="small" tone="muted">
          Nothing has been sent yet, and nothing has been spent.
        </Text>
      ) : (
        <Text variant="small" tone="muted">
          Up to {MAX_AUDIO_SECONDS / 60} minutes.
        </Text>
      )}
    </div>
  )

  const discardTake = () => {
    dropTake()
    setFailure(null)
    setElapsed(0)
    setPhase("idle")
  }

  /**
   * The controls, the same on a phone and a desktop: only the frame changes.
   * Recording, Stop is the action; with a take, Send is. Throwing the take
   * away is a hold (removing.md: your own words, the only copy), at the far
   * end from Send.
   */
  const controls = reviewing ? (
    <>
      {/* Pushed to the far end of the row, away from Send. */}
      <div className="flex max-sm:*:w-full sm:mr-auto">
        <HoldButton onConfirm={discardTake} disabled={sending}>
          Throw it away
        </HoldButton>
      </div>
      <Button icon={Mic01Icon} onClick={() => void startRecording()} disabled={sending}>
        Record again
      </Button>
      <Button
        ref={sendRef}
        variant="action"
        onClick={() => void send()}
        pending={sending}
        pendingLabel="Sending…"
      >
        Send to Quincy
      </Button>
    </>
  ) : (
    <>
      {isMobile ? (
        <SheetClose disabled={sending}>{recording ? "Discard" : "Close"}</SheetClose>
      ) : (
        <DialogClose disabled={sending}>{recording ? "Discard" : "Close"}</DialogClose>
      )}
      {recording ? (
        <Button variant="action" icon={StopIcon} onClick={stopRecording}>
          Stop
        </Button>
      ) : (
        <Button
          variant="action"
          icon={Mic01Icon}
          onClick={() => void startRecording()}
          pending={sending}
          pendingLabel="Sending…"
        >
          Record
        </Button>
      )}
    </>
  )

  /**
   * A sheet on a phone, a dialog on a desktop: a centred dialog puts its
   * controls in the middle of a phone screen, where a thumb holding the phone
   * cannot reach. The kit Sheet rises from the bottom there and pads for the
   * home indicator. `useIsMobile` settles before anybody taps the trigger.
   *
   * No `initialFocus` on the dialog: Base UI lands on the first control after
   * the close button, and stopping lands on a review step, so an accidental
   * Enter spends nothing.
   */
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={trigger} />
        <SheetPanel title={title} description={description} footer={<SheetFooter>{controls}</SheetFooter>}>
          {stage}
          {status}
        </SheetPanel>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogPanel title={title} description={description} footer={<DialogFooter>{controls}</DialogFooter>}>
        {stage}
        {status}
      </DialogPanel>
    </Dialog>
  )
}

/**
 * The finished take, drawn from the levels the meter already collected.
 *
 * Not decoration and not a fake: these are the real RMS readings of the
 * recording, which is what makes the pause where somebody lost the thread
 * visible instead of merely claimed.
 *
 * The played portion is a clipped duplicate rather than per-bar state — 56
 * spans re-rendering to recolour themselves, sixty times a second, is a
 * re-render storm for something `clip-path` does on one element.
 */
function Waveform({
  levels,
  ref,
}: {
  levels: number[]
  ref: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{ "--played": 0 } as React.CSSProperties}
      className="pointer-events-none relative h-14 w-full select-none"
    >
      <WaveformRow levels={levels} tone="bg-kit-track" />
      <div
        className="absolute inset-0"
        style={{ clipPath: "inset(0 calc((1 - var(--played, 0)) * 100%) 0 0)" }}
      >
        <WaveformRow levels={levels} tone="bg-kit-ink" />
      </div>
    </div>
  )
}

function WaveformRow({ levels, tone }: { levels: number[]; tone: string }) {
  return (
    <div className="flex h-full w-full items-center justify-between gap-[2px]">
      {levels.map((level, i) => (
        <span
          key={i}
          // The same 0.1 floor as the live meter, for the same reason: a silent
          // stretch should read as silence, not as a gap in the drawing.
          style={{ transform: `scaleY(${(0.1 + 0.9 * level).toFixed(3)})` }}
          className={"h-full flex-1 origin-center rounded-full " + tone}
        />
      ))}
    </div>
  )
}
