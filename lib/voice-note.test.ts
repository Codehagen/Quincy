import { describe, expect, it, vi } from "vitest"

import { MAX_SCRAP_CHARS, MAX_TRANSCRIPT_CHARS } from "./riffs"
import {
  MAX_AUDIO_BYTES,
  MAX_AUDIO_SECONDS,
  TRANSCRIBE_COST_MICROS_PER_SECOND,
  transcribeVoiceNote,
  type TranscribeCall,
} from "./voice-note"

/**
 * The model call itself is not exercised here — no network, no key, following
 * the repo's split (lib/adapt.test.ts, lib/drafting.test.ts). The live check is
 * scripts/verify-voice-e2e.ts.
 *
 * What is worth pinning is the ring of guards around it. Every one of them
 * stands between a recording nobody should pay to read and a riff that pays to
 * read it, and three of the four cannot be observed from the outside: a
 * silent recording and a working one produce the same successful API call.
 */

const ok =
  (text: string, durationInSeconds?: number): TranscribeCall =>
  async () => ({ text, durationInSeconds })

const audio = (bytes: number) => new Uint8Array(bytes).fill(1)

describe("transcribeVoiceNote", () => {
  it("returns the transcript, trimmed, with its duration", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: { transcribe: ok("  per-seat pricing is wrong for us  ", 42) },
    })

    expect(result).toEqual({
      ok: true,
      text: "per-seat pricing is wrong for us",
      seconds: 42,
    })
  })

  it("refuses an empty blob without calling the model", async () => {
    const transcribe = vi.fn()

    const result = await transcribeVoiceNote({
      audio: new Uint8Array(0),
      deps: { transcribe },
    })

    expect(result).toMatchObject({ ok: false, reason: "empty" })
    // The point of the guard: a zero-byte upload must not become a paid call.
    expect(transcribe).not.toHaveBeenCalled()
  })

  it("refuses a blob over the byte ceiling without calling the model", async () => {
    const transcribe = vi.fn()

    const result = await transcribeVoiceNote({
      audio: audio(MAX_AUDIO_BYTES + 1),
      deps: { transcribe },
    })

    expect(result).toMatchObject({ ok: false, reason: "too-big" })
    expect(transcribe).not.toHaveBeenCalled()
  })

  /**
   * The failure this guard exists for.
   *
   * A muted microphone, a permission revoked mid-recording, or genuine silence
   * all produce a *successful* call that returns nothing. Left alone that
   * becomes a riff with an empty scrap and a second model call spent looking
   * for angles in it — and the card would show a working skeleton over an
   * empty quote, which reads as a bug rather than as "say that again".
   */
  it("treats a confident empty answer as a failure", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: { transcribe: ok("   ", 12) },
    })

    expect(result).toMatchObject({ ok: false, reason: "empty" })
  })

  it("stops a recording past the duration ceiling", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: { transcribe: ok("a very long walk", MAX_AUDIO_SECONDS + 1) },
    })

    expect(result).toMatchObject({ ok: false, reason: "too-long" })
  })

  it("accepts a recording exactly at the ceiling", async () => {
    // Off-by-one on a ceiling is the classic way a limit becomes one less than
    // it says. The message quotes the number in minutes, so being wrong here
    // would also make the copy a lie.
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: { transcribe: ok("right on time", MAX_AUDIO_SECONDS) },
    })

    expect(result).toMatchObject({ ok: true })
  })

  /**
   * A guard against a money hole that shipped for about an hour.
   *
   * `openai/gpt-4o-transcribe` through the Gateway returns a transcript with
   * `durationInSeconds` undefined — measured live 2026-08-08. With no
   * fallback, `seconds` was 0 on every real note, `recordTranscriptionCost`
   * returned early on its `<= 0` check, and the entire feature metered as free
   * while spending real money. Nothing threw and nothing logged; the number
   * was simply never written.
   *
   * So the browser's measured length is carried through and used whenever the
   * provider reports none. These two tests are the difference between the bug
   * and the fix.
   */
  it("falls back to the browser's clock when the provider reports no duration", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      recordedSeconds: 47,
      deps: { transcribe: ok("no duration reported") },
    })

    expect(result).toEqual({
      ok: true,
      text: "no duration reported",
      seconds: 47,
    })
  })

  it("prefers the provider's duration over the browser's when both exist", async () => {
    // The provider measured the file; the browser measured a wall clock that
    // includes however long it took to press stop. Only the first is a fact
    // about the audio.
    const result = await transcribeVoiceNote({
      audio: audio(64),
      recordedSeconds: 47,
      deps: { transcribe: ok("both reported", 42) },
    })

    expect(result).toMatchObject({ ok: true, seconds: 42 })
  })

  it("still yields zero when neither side knows", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: { transcribe: ok("nobody counted") },
    })

    expect(result).toMatchObject({ ok: true, seconds: 0 })
  })

  it("does not let a hostile client duration invent a bill", async () => {
    // Clamped to twice the ceiling, which is over the limit and so lands in
    // the refusal below rather than being charged. Clamping to the ceiling
    // exactly would rewrite an over-long note into a legal one.
    const result = await transcribeVoiceNote({
      audio: audio(64),
      recordedSeconds: 999_999,
      deps: { transcribe: ok("a long walk indeed") },
    })

    expect(result).toMatchObject({ ok: false, reason: "too-long" })
  })

  it("turns a thrown model error into a refusal rather than a throw", async () => {
    const result = await transcribeVoiceNote({
      audio: audio(64),
      deps: {
        transcribe: async () => {
          throw new Error("gateway exploded")
        },
      },
    })

    // A throw here would reach the workflow step and be retried, spending the
    // same money for the same answer. The riff needs a reason, not a stack.
    expect(result).toMatchObject({ ok: false, reason: "model-failed" })
  })
})

describe("the transcript ceiling holds a full-length note", () => {
  /**
   * Regression: found by /review on 2026-08-08.
   *
   * `completeSpokenRiff` truncated the transcript at `MAX_SCRAP_CHARS` (6,000),
   * which is written for a *pasted post* — where the argument is that the
   * transferable idea is never in the last two thousand characters. Speech is
   * the opposite: a rambling note circles and lands its point at the end,
   * which is exactly what a head-truncation throws away.
   *
   * Measured from the live verification run: 128 characters of transcript for
   * 8.1 seconds of Norwegian, so ~16 chars/second. A note at the ten-minute
   * ceiling is ~9,500 characters, so 37% of it was being discarded silently —
   * no error, no notice, just angles drawn from the half of the walk they
   * happened to say first.
   */
  it("fits a ten-minute note at the measured speaking rate", () => {
    const MEASURED_CHARS_PER_SECOND = 16
    const longest = MAX_AUDIO_SECONDS * MEASURED_CHARS_PER_SECOND

    expect(MAX_TRANSCRIPT_CHARS).toBeGreaterThanOrEqual(longest)
  })

  it("is derived from the audio ceiling, so the two cannot drift", () => {
    // Raising MAX_AUDIO_SECONDS without this would silently reintroduce the
    // truncation at the new length.
    expect(MAX_TRANSCRIPT_CHARS % MAX_AUDIO_SECONDS).toBe(0)
  })

  it("is well clear of the pasted-post ceiling it used to share", () => {
    expect(MAX_TRANSCRIPT_CHARS).toBeGreaterThan(MAX_SCRAP_CHARS)
  })
})

describe("ceilings", () => {
  it("prices a minute at roughly six tenths of a cent", () => {
    // The number lib/pricing.ts's posture applies to: an estimate, and the
    // Gateway dashboard is the invoice. Pinned so a stray edit to the
    // per-second rate shows up as a failing assertion about money.
    expect(TRANSCRIBE_COST_MICROS_PER_SECOND * 60).toBe(6_000)
  })

  it("caps a note at ten minutes", () => {
    expect(MAX_AUDIO_SECONDS).toBe(600)
  })
})
