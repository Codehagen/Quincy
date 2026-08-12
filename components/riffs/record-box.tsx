"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Loading03Icon,
  Mic01Icon,
  PauseIcon,
  PlayIcon,
  StopIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { useIsMobile } from "@/hooks/use-mobile"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { MAX_AUDIO_SECONDS } from "@/lib/voice-note"

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

/** `m:ss`. Tabular figures at the call site so the timer does not jitter. */
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

/**
 * Mean of a slice, not a sample of it.
 *
 * Pure, exported and tested. Sampling every nth reading draws a waveform of
 * whichever frames happened to land on the stride, which for a ten-minute take
 * is a picture of the sampling rather than of the speech. Loudness is a mean.
 */
export function downsampleLevels(source: number[], bars: number): number[] {
  if (bars <= 0) return []
  if (source.length === 0) return new Array<number>(bars).fill(0)

  const out: number[] = []
  const per = source.length / bars
  for (let i = 0; i < bars; i++) {
    const from = Math.floor(i * per)
    const to = Math.max(
      from + 1,
      Math.min(source.length, Math.floor((i + 1) * per))
    )
    let sum = 0
    for (let j = from; j < to; j++) sum += source[j] ?? 0
    out.push(sum / (to - from))
  }
  return out
}

/**
 * Why the microphone did not open, in a sentence that names the fix.
 *
 * Pure, exported and tested, because it is five branches of pure judgment
 * wrapped around no logic at all — the exact shape that rots silently. There
 * is no DOM test environment in this repo (vitest runs `environment: "node"`),
 * so the alternative to extracting this was not testing the decision at all.
 *
 * `cause` is `null` for the case where the API is simply absent, which is not
 * an exception anybody threw: on an insecure origin `navigator.mediaDevices`
 * is undefined, and the caller checks that before it ever calls getUserMedia.
 */
export function microphoneFailureMessage(
  cause: { name?: string } | null,
  isSecureContext: boolean
): string {
  if (!cause) {
    /**
     * Nothing threw — the API is not there.
     *
     * On a secure origin that means a browser without a media stack. On an
     * insecure one it means the origin, and the fix is the URL rather than
     * anything the user can do in this dialog. Worth separating because this
     * is the walk-and-talk feature: the phone is the primary device, and
     * `http://192.168.x.x:3000` is the ordinary way somebody reaches it.
     */
    return isSecureContext
      ? "This browser cannot record audio."
      : "Recording needs a secure connection. Open Quincy over https and try again."
  }

  switch (cause.name) {
    /**
     * They said no, or the browser remembers them saying no — and in that case
     * nothing this app does will bring the prompt back, so the sentence has to
     * point at the address bar rather than at a retry.
     */
    case "NotAllowedError":
      return "Quincy needs the microphone. Allow it in your browser’s address bar and try again."
    case "NotFoundError":
      return "No microphone found."
    /** The browser saying it has no media stack. Measured from headless
     *  Chromium, which is also how a stripped-down webview answers. */
    case "NotSupportedError":
      return "This browser cannot record audio."
    /** In use by something else, or the OS refused the device. */
    case "NotReadableError":
      return "Something else is using the microphone. Close it and try again."
    default:
      return "Could not open the microphone."
  }
}

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
  variant = "default",
}: {
  /**
   * Where the trigger is rendered, matching `AdaptBox`'s vocabulary.
   *
   * - `default` — a page header. Small and outlined.
   * - `empty` — the empty state, at full weight.
   * - `instrument` — the capture card at the top of /riffs, also at full
   *   weight. Record is the filled one in both of those places: it is the
   *   route that produces the user's own material, and this page exists for
   *   that rather than for adapting somebody else's post.
   */
  variant?: "default" | "empty" | "instrument"
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
    if (next) return

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
    <Button
      type="button"
      // Filled wherever capture is the point of the surface — the empty state
      // and the instrument — outlined when it is a control in a page header.
      variant={variant === "default" ? "outline" : "default"}
      size={variant === "default" ? "sm" : "default"}
    >
      <HugeiconsIcon
        aria-hidden="true"
        data-icon="inline-start"
        icon={Mic01Icon}
      />
      Record a thought
    </Button>
  )

  const title = reviewing ? "Send this to Quincy?" : "Record a thought"

  const description = reviewing
    ? "Listen back if you want. Quincy reads through false starts, so a messy take is fine — a take that stopped early is not."
    : "Say it however it comes out. You get to hear it back before anything is sent."

  const stage = reviewing ? (
    <div className="flex flex-col items-center gap-5 py-6">
      {/* No caption track: this is the user's own voice, seconds old, and there
          is no transcript in existence until the send happens. */}
      <audio
        ref={audioRef}
        src={take.url}
        preload="metadata"
        onEnded={stopPlayback}
        /**
         * A take the browser cannot decode says so, rather than sitting there.
         *
         * The decode failure and the muted speaker look identical to whoever
         * pressed play, and only one of them is worth re-recording for. The
         * sentence points at Send because the transcript is produced from the
         * blob server-side, and that path does not care whether this browser
         * could open it.
         */
        onError={() => {
          stopPlayback()
          setFailure("Could not play that back here. Sending it still works.")
        }}
      />

      <div className="flex w-full items-center gap-4">
        <Button
          type="button"
          variant="outline"
          size="icon-lg"
          onClick={togglePlayback}
          aria-label={
            playing ? "Pause the recording" : "Play the recording back"
          }
          // 36px control, 44px target. The pseudo-element rather than a bigger
          // button, because the button's size is what balances it against the
          // waveform beside it.
          className="relative shrink-0 [touch-action:manipulation] rounded-full before:absolute before:-inset-1"
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={playing ? PauseIcon : PlayIcon}
          />
        </Button>

        <Waveform levels={take.levels} ref={waveRef} />

        <p className="shrink-0 font-mono text-caption text-muted-foreground tabular-nums">
          {formatElapsed(take.seconds)}
        </p>
      </div>
    </div>
  ) : (
    <div className="flex flex-col items-center gap-5 py-6">
      {/**
       * The live meter.
       *
       * `aria-hidden`, and not an oversight: twenty-four bars have nothing to
       * say to a screen reader, and the live region below carries the same fact
       * in words. Each bar reads its own custom property, so the rAF loop
       * writes numbers and CSS does the drawing.
       */}
      <div
        ref={meterRef}
        aria-hidden="true"
        // Purely visual, so it is inert: it cannot take a click from the Record
        // button underneath it, and a drag across the dialog does not leave
        // twenty-four selected empty spans behind.
        className="pointer-events-none flex h-12 items-center justify-center gap-[3px] select-none"
      >
        {Array.from({ length: BARS }, (_, i) => (
          <span
            key={i}
            style={{
              /**
               * `--l{i}` is written by the rAF loop and defaults to 0.
               *
               * The floor keeps a silent bar visible rather than collapsing it
               * to nothing — a row that vanishes in quiet reads as broken
               * rather than as quiet, which is the opposite of what a liveness
               * indicator is for. 0.13 of 48px is a deliberate 6px hairline.
               */
              transform: `scaleY(calc(0.13 + 0.87 * var(--l${i}, 0)))`,
            }}
            className={
              // scaleY off a full-height box: transform only, so a moving bar
              // never lays anything out. `transition-transform` names the
              // property — `transition-all` is banned here and would drag the
              // colour swap below into the same 75ms.
              "h-full w-[3px] origin-center rounded-full transition-transform duration-75 " +
              (recording ? "bg-signal" : "bg-border")
            }
          />
        ))}
      </div>

      {/* Tabular figures, because both digits change while you watch and
          proportional ones make a clock jitter — the same reason the riff
          counts on the page behind use them. */}
      <p className="font-mono text-section tabular-nums" aria-hidden="true">
        {formatElapsed(elapsed)}
      </p>
    </div>
  )

  /**
   * One live region for the whole action, matching `AdaptBox`.
   *
   * Two lines reserved, not one. `min-h-5` held 20px, which was under even a
   * single line. Measured: one line renders 27px and the two longest messages —
   * the permission refusal and the https one — render 46px. The surface is
   * centred, so that 19px arrived as the footer sliding out from under the
   * cursor at the exact moment somebody was reaching for it. Both of those
   * messages are *first-run* outcomes, so this is the common path rather than
   * an edge case.
   */
  const status = (
    <div
      aria-live="polite"
      className="min-h-[2.875rem] pb-2 text-center text-pretty"
    >
      {recording ? (
        <p className="text-caption text-muted-foreground">
          {/**
           * The duration, in words, once there is one worth saying.
           *
           * The timer above is `aria-hidden` — a per-second live update would
           * talk over everything — which left a screen-reader user with no way
           * at all to know how long they had been recording, against a
           * ten-minute cap that stops them without warning. This changes only
           * on the minute, so it announces at most nine times.
           */}
          {elapsed >= 60
            ? `Listening, ${Math.floor(elapsed / 60)} ${Math.floor(elapsed / 60) === 1 ? "minute" : "minutes"} in. Press stop when you are done.`
            : "Listening. Press stop when you are done."}
        </p>
      ) : sending ? (
        <p className="text-caption text-muted-foreground">
          Sending it to Quincy…
        </p>
      ) : failure ? (
        <p className="text-caption text-destructive">{failure}</p>
      ) : reviewing ? (
        <p className="text-caption text-muted-foreground">
          Nothing has been sent yet, and nothing has been spent yet.
        </p>
      ) : (
        <p className="text-caption text-muted-foreground">
          Up to {MAX_AUDIO_SECONDS / 60} minutes.
        </p>
      )}
    </div>
  )

  /**
   * The record control, before there is a take.
   *
   * One width for all three states, because the label is the width. Measured:
   * "Record" makes an 89px button, "Stop and send" 136px and "Sending…" 104px.
   * The button is centred, so every state change moved it 20-24px in both
   * directions — at the visual centre of the surface, on the one control
   * anybody is aiming at.
   */
  const recordControl = recording ? (
    <Button
      type="button"
      variant="outline"
      onClick={stopRecording}
      className="min-w-36"
    >
      <HugeiconsIcon
        aria-hidden="true"
        data-icon="inline-start"
        icon={StopIcon}
      />
      Stop
    </Button>
  ) : (
    <Button
      type="button"
      onClick={() => void startRecording()}
      disabled={sending}
      className="min-w-36"
    >
      <HugeiconsIcon
        aria-hidden="true"
        data-icon="inline-start"
        icon={sending ? Loading03Icon : Mic01Icon}
        className={sending ? "animate-spin" : undefined}
      />
      {sending ? "Sending…" : "Record"}
    </Button>
  )

  /**
   * The decision, once there is a take.
   *
   * Discard sits on the far side of the row from Send with the whole width
   * between them: proximity implies equivalence, and one of these two deletes
   * the thing nobody can say twice.
   */
  const reviewControls = (
    <>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          dropTake()
          setFailure(null)
          setElapsed(0)
          setPhase("idle")
        }}
        disabled={sending}
      >
        Discard
      </Button>
      <div className="flex flex-col-reverse gap-2 sm:flex-row">
        <Button
          type="button"
          variant="outline"
          onClick={() => void startRecording()}
          disabled={sending}
        >
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-start"
            icon={Mic01Icon}
          />
          Record again
        </Button>
        <Button
          ref={sendRef}
          type="button"
          onClick={() => void send()}
          disabled={sending}
        >
          {/* The spinner only exists while it spins. Send carries no icon of
              its own — the label is the whole action, and an icon beside it
              would compete with "Record again" for the same glance. */}
          {sending ? (
            <HugeiconsIcon
              aria-hidden="true"
              data-icon="inline-start"
              icon={Loading03Icon}
              className="animate-spin"
            />
          ) : null}
          {sending ? "Sending…" : "Send to Quincy"}
        </Button>
      </div>
    </>
  )

  /**
   * A sheet on a phone, a dialog on a desktop.
   *
   * The same split `components/ui/sidebar.tsx` makes, for the same reason: a
   * centred dialog puts its primary control in the middle of a phone screen,
   * which is the one place a thumb holding the phone cannot reach. `useIsMobile`
   * resolves in an effect, so its first value is `false` — harmless here,
   * because nothing is rendered until somebody taps the trigger, by which point
   * it has settled.
   */
  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetTrigger render={trigger} />
        <SheetContent
          side="bottom"
          // The safe-area floor is not optional on the device this is for: a
          // bottom-anchored control sits under the home indicator without it.
          className="gap-0 rounded-t-2xl px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
        >
          <SheetHeader className="px-0 pt-0">
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription className="text-pretty">
              {description}
            </SheetDescription>
          </SheetHeader>

          {stage}
          {status}

          {/* Full-width and 48px tall in the thumb zone, which is the whole
              argument for the sheet. */}
          <div className="flex flex-col gap-2 *:h-12 *:w-full *:[touch-action:manipulation]">
            {reviewing ? (
              <>
                <Button
                  ref={sendRef}
                  type="button"
                  onClick={() => void send()}
                  disabled={sending}
                >
                  {sending ? (
                    <HugeiconsIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      icon={Loading03Icon}
                      className="animate-spin"
                    />
                  ) : null}
                  {sending ? "Sending…" : "Send to Quincy"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void startRecording()}
                  disabled={sending}
                >
                  <HugeiconsIcon
                    aria-hidden="true"
                    data-icon="inline-start"
                    icon={Mic01Icon}
                  />
                  Record again
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => {
                    dropTake()
                    setFailure(null)
                    setElapsed(0)
                    setPhase("idle")
                  }}
                  disabled={sending}
                >
                  Discard
                </Button>
              </>
            ) : (
              <>
                {recording ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={stopRecording}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      icon={StopIcon}
                    />
                    Stop
                  </Button>
                ) : (
                  <Button
                    type="button"
                    onClick={() => void startRecording()}
                    disabled={sending}
                  >
                    <HugeiconsIcon
                      aria-hidden="true"
                      data-icon="inline-start"
                      icon={sending ? Loading03Icon : Mic01Icon}
                      className={sending ? "animate-spin" : undefined}
                    />
                    {sending ? "Sending…" : "Record"}
                  </Button>
                )}
                <SheetClose
                  render={
                    <Button type="button" variant="ghost" disabled={sending}>
                      {recording ? "Discard" : "Close"}
                    </Button>
                  }
                />
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger render={trigger} />

      <DialogContent
        className="sm:max-w-md"
        /**
         * No `initialFocus`, and Base UI lands on Record. Verified, not assumed.
         *
         * `AdaptBox` needs the prop because it wants the *textarea* rather
         * than the first focusable thing, and it has to fight Base UI's own
         * focus management to get it. Here the first focusable thing already
         * is the next action, so the default is the right answer.
         *
         * An accidental Enter therefore starts a recording. That is acceptable
         * and was checked rather than waved past — and it is cheaper now than
         * it was: stopping lands on a review step, so nothing is uploaded and
         * no money is spent until somebody presses Send.
         */
      >
        <DialogHeader>
          {/* `text-pretty` at the call site rather than in the primitive.
              `AlertDialogDescription` already carries it and `DialogDescription`
              does not, which is an inconsistency in components/ui rather than
              here — worth fixing there, but not inside this change, where it
              would silently reflow every dialog in the app. */}
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="text-pretty">
            {description}
          </DialogDescription>
        </DialogHeader>

        {stage}
        {status}

        {reviewing ? (
          <DialogFooter className="sm:justify-between">
            {reviewControls}
          </DialogFooter>
        ) : (
          <DialogFooter className="sm:justify-between">
            <DialogClose
              render={
                <Button type="button" variant="ghost" disabled={sending}>
                  {recording ? "Discard" : "Close"}
                </Button>
              }
            />
            {recordControl}
          </DialogFooter>
        )}
      </DialogContent>
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
      <WaveformRow levels={levels} tone="bg-border" />
      <div
        className="absolute inset-0"
        style={{ clipPath: "inset(0 calc((1 - var(--played, 0)) * 100%) 0 0)" }}
      >
        <WaveformRow levels={levels} tone="bg-signal" />
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
