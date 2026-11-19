/**
 * What one person may spend on video ingest, as decisions with no clock and no
 * database in them.
 *
 * AGENTS.md, "Money": a ceiling counts the thing being bought, and a path a
 * human can trigger also needs a cooldown. What ingest buys is seconds of
 * Deepgram audio (and, around it, transcode time on a function). So there are
 * three limits, and the route in app/api/editor/assets/[id]/ingest applies
 * all of them:
 *
 * - one recording may not be longer than `MAX_RECORDING_SECONDS`;
 * - one person may not transcribe more than `DAILY_TRANSCRIBE_SECONDS` in a
 *   rolling day, counted from `usage_event`;
 * - one person may not start ingests more often than `INGEST_COOLDOWN_MS`.
 *
 * The database half (reading the day's total, writing the rows) is in
 * ingest-meter.ts. This file is the part worth unit-testing.
 */

/**
 * Twenty minutes. Cuts is for short-form takes, and a talking-head take is a
 * few minutes; twenty is well past that and still keeps one file to cents.
 */
export const MAX_RECORDING_SECONDS = 20 * 60

/**
 * One hour of audio a day per person: three full-length recordings, or
 * dozens of real takes, and at most about a dollar of Deepgram.
 */
export const DAILY_TRANSCRIBE_SECONDS = 60 * 60

/**
 * One ingest start a minute per person. Long enough to stop a retry loop or a
 * stuck button, short enough that nobody cutting two takes back to back feels it.
 */
export const INGEST_COOLDOWN_MS = 60 * 1000

/**
 * What a second of Deepgram costs, in micro-dollars. An estimate, in the same
 * sense as lib/pricing.ts: nova-3 pre-recorded at list price plus the
 * diarization add-on (diarize is on by default), rounded up to $0.0099 a
 * minute. Over-reporting trips the ceiling early; under-reporting spends
 * quietly. Re-read it from Deepgram's pricing page when the plan changes.
 */
export const DEEPGRAM_COST_MICROS_PER_SECOND = 165

/** `usage_event.model` for Deepgram audio. `input_tokens` holds the seconds. */
export const DEEPGRAM_USAGE_LABEL = "deepgram:transcribe"

/**
 * `usage_event.model` and `conversation_id` for one ingest start. The row is
 * the cooldown's attempt log: it is written whether or not anything gets
 * transcribed, because a silent screen recording still costs a transcode.
 */
export const INGEST_USAGE_LABEL = "cuts:ingest"

/**
 * Cleaning a take's voice after ingest (older uploads, or one whose step
 * failed). Function time only, so a cooldown and a zero-cost row rather than
 * a ceiling: one ffmpeg pass per person per minute.
 */
export const VOICE_USAGE_LABEL = "cuts:voice"
export const VOICE_COOLDOWN_MS = 60 * 1000

export type LimitVerdict = { ok: true } | { ok: false; error: string }

function minutes(seconds: number): number {
  return Math.max(1, Math.round(seconds / 60))
}

/** One recording, against the per-recording ceiling. */
export function recordingVerdict(durationSeconds: number): LimitVerdict {
  if (!(durationSeconds > MAX_RECORDING_SECONDS)) return { ok: true }

  return {
    ok: false,
    error: `That recording is ${minutes(durationSeconds)} minutes. Cuts takes recordings up to ${MAX_RECORDING_SECONDS / 60} minutes for now.`,
  }
}

/**
 * The day's total, with or without the recording about to be bought.
 *
 * `requestSeconds` is what this run *may* buy, not what it keeps: a
 * transcriber that retries in a second language pays for the audio twice, so
 * the caller passes seconds × passes. Zero asks only "is anything left today?",
 * which is the check made before an upload starts.
 */
export function dailyVerdict({
  usedSeconds,
  requestSeconds = 0,
}: {
  usedSeconds: number
  requestSeconds?: number
}): LimitVerdict {
  if (usedSeconds >= DAILY_TRANSCRIBE_SECONDS) {
    return {
      ok: false,
      error: `Cuts has transcribed ${DAILY_TRANSCRIBE_SECONDS / 60} minutes of recordings today. It picks up again tomorrow.`,
    }
  }

  if (usedSeconds + requestSeconds > DAILY_TRANSCRIBE_SECONDS) {
    const left = DAILY_TRANSCRIBE_SECONDS - usedSeconds
    return {
      ok: false,
      error: `That recording can take up to ${minutes(requestSeconds)} minutes of transcription, and ${minutes(left)} are left today. Try a shorter one, or come back tomorrow.`,
    }
  }

  return { ok: true }
}

/** The cooldown's refusal, worded for the drop zone. */
export function cooldownMessage(secondsLeft: number): string {
  return `One recording at a time. Try again in ${secondsLeft} ${secondsLeft === 1 ? "second" : "seconds"}.`
}

/** Micro-dollars for this many seconds of Deepgram audio. */
export function transcriptionCostMicros(seconds: number): number {
  return Math.round(Math.max(0, seconds) * DEEPGRAM_COST_MICROS_PER_SECOND)
}

/**
 * Raised from inside the pipeline to refuse an asset. The route turns it into
 * the HTTP status in `status` and writes `message` on the row.
 */
export class IngestRefusedError extends Error {
  constructor(
    message: string,
    readonly status: 413 | 429
  ) {
    super(message)
    this.name = "IngestRefusedError"
  }
}
