import { describe, expect, it } from "vitest"

import {
  cooldownMessage,
  DAILY_TRANSCRIBE_SECONDS,
  dailyVerdict,
  DEEPGRAM_COST_MICROS_PER_SECOND,
  MAX_RECORDING_SECONDS,
  recordingVerdict,
  transcriptionCostMicros,
} from "./ingest-limits"

describe("recordingVerdict", () => {
  it("admits a recording at the ceiling exactly", () => {
    expect(recordingVerdict(MAX_RECORDING_SECONDS)).toEqual({ ok: true })
  })

  it("refuses one past it, in minutes", () => {
    const verdict = recordingVerdict(45 * 60)
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toContain("45 minutes")
  })

  it("admits a container that reported no duration", () => {
    // The probe is forgiving; the PCM length is checked again before
    // transcription, so zero here is not a way around the ceiling.
    expect(recordingVerdict(0)).toEqual({ ok: true })
    expect(recordingVerdict(Number.NaN)).toEqual({ ok: true })
  })
})

describe("dailyVerdict", () => {
  it("admits when the day has room for the request", () => {
    expect(dailyVerdict({ usedSeconds: 600, requestSeconds: 600 })).toEqual({
      ok: true,
    })
  })

  it("admits a request that lands on the ceiling exactly", () => {
    expect(
      dailyVerdict({
        usedSeconds: DAILY_TRANSCRIBE_SECONDS - 60,
        requestSeconds: 60,
      })
    ).toEqual({ ok: true })
  })

  it("refuses a request that would cross the ceiling", () => {
    const verdict = dailyVerdict({
      usedSeconds: DAILY_TRANSCRIBE_SECONDS - 60,
      requestSeconds: 61,
    })
    expect(verdict.ok).toBe(false)
  })

  it("refuses everything once the day is spent, even a zero request", () => {
    const verdict = dailyVerdict({ usedSeconds: DAILY_TRANSCRIBE_SECONDS })
    expect(verdict.ok).toBe(false)
    if (!verdict.ok) expect(verdict.error).toContain("tomorrow")
  })

  it("admits the pre-upload check while anything is left", () => {
    expect(dailyVerdict({ usedSeconds: DAILY_TRANSCRIBE_SECONDS - 1 })).toEqual({
      ok: true,
    })
  })
})

describe("cooldownMessage", () => {
  it("says second, not seconds, for one", () => {
    expect(cooldownMessage(1)).toContain("1 second.")
    expect(cooldownMessage(42)).toContain("42 seconds.")
  })
})

describe("transcriptionCostMicros", () => {
  it("prices per second and never goes negative", () => {
    expect(transcriptionCostMicros(60)).toBe(60 * DEEPGRAM_COST_MICROS_PER_SECOND)
    expect(transcriptionCostMicros(-5)).toBe(0)
  })
})
