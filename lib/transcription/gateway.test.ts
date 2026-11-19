import { describe, expect, it, vi } from "vitest"

import {
  createGatewaySpeechToText,
  DEFAULT_GATEWAY_TRANSCRIBE_MODEL,
} from "./gateway"
import { isStoredTranscript } from "./speech-to-text"

describe("createGatewaySpeechToText", () => {
  it("sends the file as it came, with the model and language", async () => {
    const call = vi
      .fn()
      .mockResolvedValue({ text: "Hei", durationInSeconds: 3 })
    const bytes = new Uint8Array([1, 2, 3])
    const result = await createGatewaySpeechToText({
      language: "no",
      call,
    }).transcribe({
      kind: "file",
      bytes,
      mediaType: "audio/webm",
    })

    expect(call).toHaveBeenCalledWith({
      model: DEFAULT_GATEWAY_TRANSCRIBE_MODEL,
      audio: bytes,
      language: "no",
    })
    expect(result).toMatchObject({
      provider: "gateway",
      text: "Hei",
      words: null,
      durationSeconds: 3,
    })
    expect(isStoredTranscript(result.stored)).toBe(true)
  })

  it("says it gives no words, so the editor will not take it", () => {
    expect(createGatewaySpeechToText().givesWords).toBe(false)
  })
})
