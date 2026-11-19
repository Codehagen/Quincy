import { describe, expect, it } from "vitest"

import { MissingDeepgramKeyError } from "./deepgram"
import {
  isSpeechConfigured,
  SpeechConfigError,
  speechProviderFor,
  speechToTextFor,
} from "./index"

describe("speechProviderFor", () => {
  it("keeps today's providers when nothing is set", () => {
    expect(speechProviderFor("editor", {})).toBe("deepgram")
    expect(speechProviderFor("voice-note", {})).toBe("gateway")
  })

  it("reads each feature's own setting", () => {
    const env = {
      EDITOR_TRANSCRIBER: " Self-Hosted ",
      VOICE_NOTE_TRANSCRIBER: "deepgram",
    }
    expect(speechProviderFor("editor", env)).toBe("self-hosted")
    expect(speechProviderFor("voice-note", env)).toBe("deepgram")
  })

  it("refuses the Gateway for the editor, and says why", () => {
    expect(() =>
      speechProviderFor("editor", { EDITOR_TRANSCRIBER: "gateway" })
    ).toThrow(/no word timings/)
    expect(() =>
      speechProviderFor("editor", { EDITOR_TRANSCRIBER: "nope" })
    ).toThrow(SpeechConfigError)
  })
})

describe("isSpeechConfigured", () => {
  it("follows what the chosen provider needs", () => {
    expect(isSpeechConfigured("editor", {})).toBe(false)
    expect(isSpeechConfigured("editor", { DEEPGRAM_API_KEY: "k" })).toBe(true)
    expect(isSpeechConfigured("voice-note", {})).toBe(true)
    expect(
      isSpeechConfigured("editor", {
        EDITOR_TRANSCRIBER: "self-hosted",
        SELF_HOSTED_STT_URL: "http://s/v1",
      })
    ).toBe(false)
    expect(
      isSpeechConfigured("editor", {
        EDITOR_TRANSCRIBER: "self-hosted",
        SELF_HOSTED_STT_URL: "http://s/v1",
        SELF_HOSTED_STT_MODEL: "m",
      })
    ).toBe(true)
  })
})

describe("speechToTextFor", () => {
  it("builds the provider each feature is set to", () => {
    expect(speechToTextFor("editor", {}, { DEEPGRAM_API_KEY: "k" }).name).toBe(
      "deepgram"
    )
    expect(speechToTextFor("voice-note", {}, {}).name).toBe("gateway")
    expect(
      speechToTextFor(
        "editor",
        {},
        {
          EDITOR_TRANSCRIBER: "self-hosted",
          SELF_HOSTED_STT_URL: "http://s/v1",
          SELF_HOSTED_STT_MODEL: "m",
        }
      ).name
    ).toBe("self-hosted")
  })

  it("keeps the editor's language retries, and drops them for a voice note", () => {
    const env = {
      DEEPGRAM_API_KEY: "k",
      DEEPGRAM_LANGUAGE: "no",
      DEEPGRAM_LANGUAGES: "no,en",
      VOICE_NOTE_TRANSCRIBER: "deepgram",
    }
    expect(speechToTextFor("editor", {}, env).maxPasses).toBe(2)
    expect(speechToTextFor("voice-note", {}, env).maxPasses).toBe(1)
  })

  it("throws a sentence when the provider is not set up", () => {
    expect(() => speechToTextFor("editor", {}, {})).toThrow(
      MissingDeepgramKeyError
    )
    expect(() =>
      speechToTextFor("editor", {}, { EDITOR_TRANSCRIBER: "self-hosted" })
    ).toThrow(/SELF_HOSTED_STT_URL/)
  })
})
