import { experimental_transcribe as transcribe } from "ai"
import { gateway } from "@ai-sdk/gateway"

import { db } from "./db"
import { usageEvent } from "./schema-app"

/**
 * Audio in, words out. See plans/018.
 *
 * **Not to be confused with `lib/voice.ts`**, which is the *writing* voice —
 * the corpus compile that reads what the user published to learn how they
 * write. This file is about the other sense of the word: a thing said out
 * loud, on a walk, into a phone. `lib/sources.ts` already calls that source
 * "Voice notes" and has since before anything could produce one.
 *
 * **Why a transcript and not a live session.** The feature this serves is
 * "speak on a walk, come back to riffs waiting" — nobody is watching a box
 * fill, so streaming buys a display no one reads on the network least able to
 * deliver it. The recorder answers "is the mic on?" with a level meter drawn
 * from the local audio stream, which is faster than any network round trip and
 * survives losing signal entirely. A live session earns its place only if
 * somebody is at a desk watching the words land, and that is a different
 * surface from this one.
 *
 * **Through the Gateway, not a provider SDK.** Every other model call in the
 * product goes out through `AI_GATEWAY_API_KEY`, and transcription needs no
 * exception: the Gateway lists transcription models natively, so the provider
 * is a string this file can change rather than a key somebody has to add to
 * Vercel. `DEEPGRAM_API_KEY` is in the environment and could have done this —
 * `lib/editor/transcriber-deepgram.ts` is a working batch transcriber — but it
 * exists for the video editor's word timestamps, and pointing a second feature
 * at it would make one provider load-bearing for two unrelated things.
 */

/**
 * Deliberately configurable, matching `CHAT_MODEL`.
 *
 * `gpt-4o-transcribe` rather than `whisper-1` (older, worse on accented
 * Norwegian) or `gpt-realtime-whisper` (built for streaming sessions; its
 * advantage is latency, which is worth nothing to a job nobody is watching).
 * `xai/grok-stt` is the other batch option through the same Gateway and is one
 * env var away if this one disappoints on Norwegian.
 */
const MODEL = process.env.VOICE_NOTE_MODEL ?? "openai/gpt-4o-transcribe"

/** Exported so the call site can label `usage_event` with the same string. */
export const VOICE_NOTE_MODEL = MODEL

/**
 * The language spoken, or undefined to let the model detect it.
 *
 * Worth stating rather than detecting when it is known. `lib/editor/
 * transcriber-deepgram.ts` records what the alternative costs: a model asked
 * for English transcribes Norwegian *as* English and returns something short
 * and confident — "Okay. Okay." at 0.975 confidence for fifteen seconds of
 * speech. That is the worst kind of wrong, because it reads as a quiet
 * recording rather than a failed one. Reuses `DEEPGRAM_LANGUAGE` rather than
 * adding a second language variable that could disagree with it.
 */
const LANGUAGE = process.env.DEEPGRAM_LANGUAGE || undefined

/* ── Ceilings ─────────────────────────────────────────────────────────────
   AGENTS.md: every path that spends needs a ceiling AND, if a human can
   trigger it, a cooldown. Both, not either. A voice note is triggered by a
   person pressing a button, so both apply.
   ───────────────────────────────────────────────────────────────────────── */

/**
 * The most audio one note may carry.
 *
 * A ceiling counts the thing being *bought*, not the thing being kept — the
 * distinction AGENTS.md draws, and the one `collectBookmarks` got wrong. What
 * is bought here is audio duration, and bytes are the only proxy available
 * before the file is decoded: the browser sends a blob, and asking the server
 * to probe its duration first would mean running ffmpeg on every upload to
 * decide whether to spend a cent.
 *
 * 24 MB of Opus at the recorder's bitrate is comfortably longer than
 * `MAX_SECONDS` allows, so this is the backstop and the clock below is the
 * real limit. It exists because a blob's byte count is the one thing that can
 * be checked without trusting the client.
 */
export const MAX_AUDIO_BYTES = 24 * 1024 * 1024

/**
 * The most audio one note may *pay for*, in seconds.
 *
 * Ten minutes. Long enough for a walk's worth of thinking out loud, short
 * enough that a phone left recording in a pocket costs cents rather than
 * dollars. Enforced client-side by stopping the recorder and server-side by
 * refusing the blob, because the first is a courtesy and only the second is a
 * guard.
 */
export const MAX_AUDIO_SECONDS = 10 * 60

/**
 * How often one person may spend on this.
 *
 * A cooldown, not a claim — AGENTS.md is explicit that these are different and
 * that a claim alone leaves a button pressable all afternoon. Deliberately
 * shorter than `IMPORT_COOLDOWN_MS`/`MANUAL_RUN_COOLDOWN_MS` (10 minutes):
 * those bound a rhythm that reads a whole timeline, this bounds one person
 * speaking one thought, and ten minutes between two voice notes would make the
 * feature unusable for the exact walk it was built for. Thirty seconds stops a
 * stuck finger and a retry loop without ever being felt by a human talking.
 */
export const VOICE_NOTE_COOLDOWN_MS = 30 * 1000

/**
 * What a second of transcription costs, in micro-dollars.
 *
 * ~$0.006 per minute as of 2026-08, so 100 micros per second. An estimate in
 * exactly the sense lib/pricing.ts means: the Gateway bills on its own terms
 * and its dashboard is the invoice. Recorded per-second rather than per-token
 * because transcription is not priced in tokens, which is also why this goes
 * through the `x:read`-shaped path below rather than through `recordUsage`.
 */
export const TRANSCRIBE_COST_MICROS_PER_SECOND = 100

export type TranscriptionOutcome =
  | {
      ok: true
      /** What was said, as the model heard it. Never cleaned up here. */
      text: string
      /** Audio length in seconds, when the provider reported one. */
      seconds: number
    }
  | {
      ok: false
      reason: "too-long" | "too-big" | "empty" | "model-failed"
      message: string
    }

export type VoiceTranscriber = (input: {
  audio: Uint8Array
  mediaType: string
}) => Promise<TranscriptionOutcome>

/**
 * The model call, behind a port.
 *
 * Injected rather than imported at the call site so the guards around it can
 * be tested without a network or an API key — the same shape
 * `createRiffFromPost` uses for `generateAngles` and `lib/editor/ingest.ts`
 * uses for its `Transcriber`. The guards are the part worth testing: they are
 * what stands between a silent recording and a riff that spends money on it.
 */
export type TranscribeCall = (input: {
  audio: Uint8Array
}) => Promise<{ text: string; durationInSeconds?: number }>

const callModel: TranscribeCall = async ({ audio }) =>
  transcribe({
    model: gateway.transcription(MODEL),
    audio,
    providerOptions: LANGUAGE ? { openai: { language: LANGUAGE } } : undefined,
    /**
     * One retry, not the default two.
     *
     * Every retry re-uploads the whole blob and pays for the whole
     * transcription again. The default is tuned for a text call costing a
     * fraction of a cent; here a stuck retry loop on a ten-minute note is real
     * money for a job nobody is watching. Workflow retries the step around
     * this anyway, so a genuine transient failure still gets more than one
     * chance — it just gets it with a fresh step rather than inside one.
     */
    maxRetries: 1,
  })

/**
 * One audio blob becomes one transcript.
 *
 * Returns a result object rather than throwing, matching `createRiffFromPost`:
 * by the time this fails the caller may already have written a riff row, and a
 * throw would leave that row with no way to say what went wrong.
 */
export const transcribeVoiceNote = async ({
  audio,
  recordedSeconds = 0,
  deps = { transcribe: callModel },
}: {
  audio: Uint8Array
  /**
   * How long the browser measured the recording to be.
   *
   * Needed because the provider does not always report one — measured
   * 2026-08-08 against `openai/gpt-4o-transcribe` through the Gateway, which
   * returns a transcript with `durationInSeconds` undefined. Left alone that
   * silently meant `recordTranscriptionCost` returned early on every single
   * voice note and the whole feature billed as zero, which is exactly the kind
   * of hole AGENTS.md's Money section is written about: nothing errors, the
   * number is simply never recorded.
   *
   * Client-supplied and therefore not a guard. `MAX_AUDIO_BYTES` is what is
   * actually enforced, on the server, before anything is sent — this is only
   * ever used to *charge*, and it is clamped so a hostile value cannot invent
   * a bill either. Understating it costs us accounting accuracy, not safety.
   */
  recordedSeconds?: number
  mediaType?: string
  deps?: { transcribe: TranscribeCall }
}): Promise<TranscriptionOutcome> => {
  if (audio.byteLength === 0) {
    return { ok: false, reason: "empty", message: "There is no audio here." }
  }

  if (audio.byteLength > MAX_AUDIO_BYTES) {
    return {
      ok: false,
      reason: "too-big",
      message: "That recording is too large to read.",
    }
  }

  let result: Awaited<ReturnType<TranscribeCall>>
  try {
    result = await deps.transcribe({ audio })
  } catch (cause) {
    console.error("[voice-note] transcription failed:", cause)
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not make out what was said.",
    }
  }

  const text = result.text.trim()

  /**
   * A confident empty answer is a failure, and it has to be caught here.
   *
   * Silence, a muted mic, or a permission that was granted and then revoked
   * all produce a successful call returning nothing. Left alone that becomes a
   * riff with an empty scrap and a model call spent finding angles in it.
   */
  if (!text) {
    return {
      ok: false,
      reason: "empty",
      message:
        "That recording came back empty. Check the microphone and try again.",
    }
  }

  /**
   * The provider's number when there is one, the browser's when there is not.
   *
   * In that order because the provider measured the audio and the browser
   * measured a wall clock, and only the first is a fact about the file. But
   * `openai/gpt-4o-transcribe` reports nothing here, so in practice the
   * fallback is the live path — see `recordedSeconds` above for what that
   * costs and why it is safe.
   *
   * Clamped, and clamped to more than the ceiling on purpose: clamping to
   * `MAX_AUDIO_SECONDS` exactly would silently rewrite an over-long recording
   * into a legal one and skip the refusal below.
   */
  const seconds = Math.min(
    Math.max(result.durationInSeconds ?? recordedSeconds, 0),
    MAX_AUDIO_SECONDS * 2
  )

  /**
   * The duration ceiling, enforced after the call rather than before it.
   *
   * Unavoidable: the length is not known until the provider reports it, short
   * of decoding the audio ourselves first. So this cannot prevent the spend —
   * `MAX_AUDIO_BYTES` is what does that, on bytes, before anything is sent.
   * What it prevents is the *second* spend: a note over the ceiling stops here
   * rather than going on to buy an angle generation on top.
   */
  if (seconds > MAX_AUDIO_SECONDS) {
    return {
      ok: false,
      reason: "too-long",
      message: `That recording is ${Math.round(seconds / 60)} minutes. Keep a voice note under ${MAX_AUDIO_SECONDS / 60}.`,
    }
  }

  return { ok: true, text, seconds }
}

/**
 * Meter the transcription.
 *
 * `model` carries `voice:transcribe` rather than a model name, the stretch
 * `x:post`, `x:read` and `x:bookmark-read` already make. lib/corpus-x.ts said
 * a third non-model cost was the moment to add a `kind` discriminator and
 * deferred it until something needed to *query* the difference; this is the
 * fourth, and the reasoning is unchanged — /credits displays the label as-is.
 *
 * Failing to meter never fails the work. The transcript already exists and the
 * money is already spent; refusing to return it because bookkeeping failed
 * would lose the user their note over a row nobody reads in real time.
 */
export async function recordTranscriptionCost(
  userId: string,
  seconds: number
): Promise<void> {
  if (seconds <= 0) return

  try {
    await db.insert(usageEvent).values({
      id: `use_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
      userId,
      model: "voice:transcribe",
      costMicros: Math.round(TRANSCRIBE_COST_MICROS_PER_SECOND * seconds),
    })
  } catch (cause) {
    console.error("[voice-note] cost not recorded:", cause)
  }
}
