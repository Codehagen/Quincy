import { afterEach, describe, expect, it } from "vitest"
import type { UIMessage } from "ai"

import {
  ceilingVerdict,
  dailyCeilingMicros,
  inputVerdict,
  maxInputChars,
  maxMessages,
  measureInput,
} from "./chat-guards"

function textMessage(text: string, id = "msg_1"): UIMessage {
  return {
    id,
    role: "user",
    parts: [{ type: "text", text }],
  } as UIMessage
}

function filePartMessage(id = "msg_1"): UIMessage {
  return {
    id,
    role: "user",
    parts: [
      { type: "file", mediaType: "image/png", url: "https://example.com/a.png" },
    ],
  } as UIMessage
}

describe("inputVerdict", () => {
  it("rejects null", () => {
    expect(inputVerdict(null)).toEqual({
      ok: false,
      error: "That request did not carry a conversation.",
    })
  })

  it("rejects a non-array", () => {
    expect(inputVerdict("x")).toEqual({
      ok: false,
      error: "That request did not carry a conversation.",
    })
  })

  it("rejects an empty array", () => {
    expect(inputVerdict([])).toEqual({
      ok: false,
      error: "That request did not carry a conversation.",
    })
  })

  it("accepts a short, ordinary conversation", () => {
    const messages = [
      textMessage("hello", "msg_1"),
      textMessage("hi there", "msg_2"),
      textMessage("how are you?", "msg_3"),
    ]

    expect(inputVerdict(messages)).toEqual({ ok: true })
  })

  it("accepts exactly maxMessages() messages", () => {
    const messages = Array.from({ length: maxMessages() }, (_, i) =>
      textMessage("hi", `msg_${i}`)
    )

    expect(inputVerdict(messages)).toEqual({ ok: true })
  })

  it("rejects one more than maxMessages() messages", () => {
    const messages = Array.from({ length: maxMessages() + 1 }, (_, i) =>
      textMessage("hi", `msg_${i}`)
    )

    const verdict = inputVerdict(messages)
    expect(verdict.ok).toBe(false)
  })

  it("rejects a single message whose text exceeds maxInputChars()", () => {
    const messages = [textMessage("a".repeat(maxInputChars() + 1))]

    const verdict = inputVerdict(messages)
    expect(verdict).toEqual({
      ok: false,
      error:
        "This conversation is too long to send in one piece. Start a new one — the brain carries what matters across.",
    })
  })
})

describe("measureInput", () => {
  it("counts a non-text part as the fixed allowance", () => {
    const { chars } = measureInput([filePartMessage()])
    expect(chars).toBe(1_000)
  })

  it("sums text and non-text parts together", () => {
    const message: UIMessage = {
      id: "msg_1",
      role: "user",
      parts: [
        { type: "text", text: "hello" },
        { type: "file", mediaType: "image/png", url: "https://example.com/a.png" },
      ],
    } as UIMessage

    expect(measureInput([message]).chars).toBe(5 + 1_000)
  })
})

describe("ceilingVerdict", () => {
  it("allows spend just under the ceiling", () => {
    expect(ceilingVerdict(dailyCeilingMicros() - 1)).toEqual({ ok: true })
  })

  it("blocks spend at the ceiling", () => {
    const verdict = ceilingVerdict(dailyCeilingMicros())
    expect(verdict.ok).toBe(false)
  })

  describe("env override", () => {
    afterEach(() => {
      delete process.env.CHAT_DAILY_CEILING_MICROS
    })

    it("respects CHAT_DAILY_CEILING_MICROS", () => {
      process.env.CHAT_DAILY_CEILING_MICROS = "5000"
      expect(ceilingVerdict(5001)).toEqual({
        ok: false,
        error: "Quincy has done a full day's work already. It picks up again tomorrow.",
      })
    })
  })
})
