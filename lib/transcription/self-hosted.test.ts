import { afterEach, describe, expect, it, vi } from "vitest"

import { wordsFromTranscript } from "@/lib/editor/transcript"

import { createSelfHostedSpeechToText } from "./self-hosted"

const pcm = {
  kind: "pcm" as const,
  samples: new Int16Array(32000),
  sampleRate: 16000,
}

function stub(reply: unknown, status = 200) {
  const calls: { url: string; init: RequestInit }[] = []
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit) => {
      calls.push({ url, init })
      return new Response(JSON.stringify(reply), { status })
    })
  )
  return calls
}

afterEach(() => vi.unstubAllGlobals())

describe("createSelfHostedSpeechToText", () => {
  it("asks the common endpoint for word timings, in the language set", async () => {
    const calls = stub({ text: "", words: [] })
    await createSelfHostedSpeechToText({
      baseUrl: "http://stt.local:8000/v1/",
      model: "nb-large",
      language: "no",
      apiKey: "secret",
    }).transcribe(pcm)

    expect(calls[0].url).toBe("http://stt.local:8000/v1/audio/transcriptions")
    const form = calls[0].init.body as FormData
    expect(form.get("model")).toBe("nb-large")
    expect(form.get("response_format")).toBe("verbose_json")
    expect(form.getAll("timestamp_granularities[]")).toEqual(["word"])
    expect(form.get("language")).toBe("no")
    expect((form.get("file") as Blob).type).toBe("audio/wav")
    expect(calls[0].init.headers).toEqual({ Authorization: "Bearer secret" })
  })

  it("stores words the editor reads like any other transcript", async () => {
    stub({
      text: " Hei alle ",
      language: "norwegian",
      duration: 2,
      words: [
        { word: " Hei", start: 0.1, end: 0.4, probability: 0.9 },
        { word: "alle", start: 0.5, end: 0.9 },
        { word: "broken" },
      ],
    })
    const result = await createSelfHostedSpeechToText({
      baseUrl: "http://s/v1",
      model: "m",
    }).transcribe(pcm)

    expect(result.text).toBe("Hei alle")
    expect(result.durationSeconds).toBe(2)
    expect(wordsFromTranscript(result.stored).map((w) => w.text)).toEqual([
      "Hei",
      "alle",
    ])
    expect(wordsFromTranscript(result.stored)[0].confidence).toBe(0.9)
  })

  it("meters the audio before the request, and sends nothing if the meter fails", async () => {
    const calls = stub({ text: "" })
    const order: string[] = []
    await createSelfHostedSpeechToText({
      baseUrl: "http://s/v1",
      model: "m",
      onRequest: async (seconds) => {
        order.push(`meter ${seconds}`)
      },
    }).transcribe(pcm)
    expect(order).toEqual(["meter 2"])
    expect(calls).toHaveLength(1)

    const refused = stub({ text: "" })
    await expect(
      createSelfHostedSpeechToText({
        baseUrl: "http://s/v1",
        model: "m",
        onRequest: async () => {
          throw new Error("over the day")
        },
      }).transcribe(pcm)
    ).rejects.toThrow("over the day")
    expect(refused).toHaveLength(0)
  })

  it("says what the server said when it fails", async () => {
    stub({ error: "model not loaded" }, 503)
    await expect(
      createSelfHostedSpeechToText({
        baseUrl: "http://s/v1",
        model: "m",
      }).transcribe(pcm)
    ).rejects.toThrow(/self-hosted 503: .*model not loaded/)
  })
})
