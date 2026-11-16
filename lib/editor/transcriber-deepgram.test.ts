import { describe, expect, it } from "vitest"

import { wordsFromDeepgram } from "./transcript"

import {
  createDeepgramTranscriber,
  isDeepgramConfigured,
  listenUrl,
  modelFor,
  MissingDeepgramKeyError,
  readDeepgramOptions,
} from "./transcriber-deepgram"

describe("listenUrl", () => {
  it("describes the audio, because raw PCM carries no header", () => {
    // These three are the container's job, and there is no container. Get the
    // rate wrong and the words are right while every timestamp is scaled.
    const url = new URL(listenUrl(16000, { apiKey: "k" }))

    expect(url.searchParams.get("encoding")).toBe("linear16")
    expect(url.searchParams.get("sample_rate")).toBe("16000")
    expect(url.searchParams.get("channels")).toBe("1")
  })

  it("asks for the fields captions are rendered from", () => {
    // Without punctuate and smart_format there is no punctuated_word, and
    // captions arrive as lowercase word soup.
    const url = new URL(listenUrl(16000, { apiKey: "k" }))

    expect(url.searchParams.get("punctuate")).toBe("true")
    expect(url.searchParams.get("smart_format")).toBe("true")
    expect(url.searchParams.get("utterances")).toBe("true")
  })

  it("diarizes by default", () => {
    // A two-person interview where every word has the same speaker cannot be
    // cut into a conversation, and turning this on later means re-transcribing.
    expect(
      new URL(listenUrl(16000, { apiKey: "k" })).searchParams.get("diarize")
    ).toBe("true")
  })

  it("carries the rate it was handed, not the one we hoped for", () => {
    expect(
      new URL(listenUrl(48000, { apiKey: "k" })).searchParams.get("sample_rate")
    ).toBe("48000")
  })

  it("pins the model rather than taking the provider default", () => {
    expect(
      new URL(listenUrl(16000, { apiKey: "k" })).searchParams.get("model")
    ).toBe("nova-3")
    expect(
      new URL(
        listenUrl(16000, { apiKey: "k", model: "nova-2" })
      ).searchParams.get("model")
    ).toBe("nova-2")
  })
})

describe("readDeepgramOptions", () => {
  it("says what is missing rather than failing at the request", () => {
    expect(() => readDeepgramOptions({})).toThrow(MissingDeepgramKeyError)
  })

  it("treats an empty model as unset", () => {
    // .env.example ships DEEPGRAM_MODEL="" and an empty string in the query
    // string is a 400 from the provider, not a default.
    //
    // Unset rather than nova-3, because the model is now a function of the
    // language and neither is known until both have been read. `modelFor`
    // resolves it, and the guarantee that matters is the one below.
    const options = readDeepgramOptions({
      DEEPGRAM_API_KEY: "k",
      DEEPGRAM_MODEL: "",
    })

    expect(options.model).toBeUndefined()
    expect(modelFor(options)).toBe("nova-3")
  })

  it("reads the language, and picks a model that speaks it", () => {
    const options = readDeepgramOptions({
      DEEPGRAM_API_KEY: "k",
      DEEPGRAM_LANGUAGE: "no",
    })

    expect(options.language).toBe("no")
    expect(modelFor(options)).toBe("nova-2")
  })

  it("is not configured without a key", () => {
    expect(isDeepgramConfigured({})).toBe(false)
    expect(isDeepgramConfigured({ DEEPGRAM_API_KEY: "k" })).toBe(true)
  })
})

describe("createDeepgramTranscriber", () => {
  it("puts the provider's own words in the failure", async () => {
    // "transcript: 400" lands in warnings as something nobody can act on. The
    // body says which parameter was wrong.
    const fetchMock = async () =>
      new Response(JSON.stringify({ err_msg: "sample rate not supported" }), {
        status: 400,
      })

    const original = globalThis.fetch
    globalThis.fetch = fetchMock as typeof fetch

    try {
      const transcriber = createDeepgramTranscriber({ apiKey: "k" })
      await expect(
        transcriber.transcribe(new Int16Array(16), 16000)
      ).rejects.toThrow(/sample rate not supported/)
    } finally {
      globalThis.fetch = original
    }
  })

  it("returns the response verbatim", async () => {
    // Stored as-is on video_asset.transcript; wordsFromDeepgram is the only
    // thing that reads the shape.
    const body = { results: { channels: [{ alternatives: [{ words: [] }] }] } }

    const original = globalThis.fetch
    globalThis.fetch = (async () =>
      new Response(JSON.stringify(body))) as typeof fetch

    try {
      const transcriber = createDeepgramTranscriber({ apiKey: "k" })
      await expect(
        transcriber.transcribe(new Int16Array(16), 16000)
      ).resolves.toEqual(body)
    } finally {
      globalThis.fetch = original
    }
  })

  it("sends only the samples, not the whole backing buffer", async () => {
    // A subarray's .buffer is the entire file. Sending it would upload
    // everything to transcribe a slice.
    const backing = new Int16Array(1000)
    const slice = backing.subarray(0, 8)

    let sentBytes = -1
    const original = globalThis.fetch
    globalThis.fetch = (async (_url: string, init: RequestInit) => {
      sentBytes = (init.body as Uint8Array).byteLength
      return new Response("{}")
    }) as unknown as typeof fetch

    try {
      await createDeepgramTranscriber({ apiKey: "k" }).transcribe(slice, 16000)
      expect(sentBytes).toBe(16)
    } finally {
      globalThis.fetch = original
    }
  })
})

describe("language", () => {
  it("is left off when nothing was configured", () => {
    // Deepgram's own default is English, and stating it here would make an
    // unconfigured install look deliberate.
    expect(
      new URL(listenUrl(16000, { apiKey: "k" })).searchParams.has("language")
    ).toBe(false)
  })

  it("is sent when it is known", () => {
    expect(
      new URL(
        listenUrl(16000, { apiKey: "k", language: "no" })
      ).searchParams.get("language")
    ).toBe("no")
  })
})

describe("modelFor", () => {
  it("uses nova-3 for English and for no language at all", () => {
    expect(modelFor({ apiKey: "k" })).toBe("nova-3")
    expect(modelFor({ apiKey: "k", language: "en" })).toBe("nova-3")
    expect(modelFor({ apiKey: "k", language: "multi" })).toBe("nova-3")
  })

  it("falls back to nova-2 for a language nova-3 cannot speak", () => {
    // The bug this exists to prevent: nova-3 asked for Norwegian does not
    // refuse, it transcribes fifteen seconds of Norwegian as "Okay. Okay." at
    // 0.975 confidence. A confident wrong answer is worse than an error,
    // because silence removal then cuts the talk down to those two words.
    expect(modelFor({ apiKey: "k", language: "no" })).toBe("nova-2")
    expect(modelFor({ apiKey: "k", language: "sv" })).toBe("nova-2")
  })

  it("never overrides a model somebody pinned", () => {
    expect(modelFor({ apiKey: "k", model: "nova-3", language: "no" })).toBe(
      "nova-3"
    )
  })
})

describe("transcribe fallback", () => {
  /** A Deepgram response carrying `count` words, which is all the check reads. */
  const reply = (count: number) => ({
    results: {
      channels: [
        {
          alternatives: [
            {
              transcript: "x ".repeat(count).trim(),
              words: Array.from({ length: count }, (_, i) => ({
                word: `w${i}`,
                punctuated_word: `w${i}`,
                start: i * 0.4,
                end: i * 0.4 + 0.3,
                confidence: 0.9,
              })),
            },
          ],
        },
      ],
    },
  })

  function stubDeepgram(byLanguage: Record<string, number>) {
    const asked: (string | null)[] = []

    const original = globalThis.fetch
    globalThis.fetch = (async (input: string | URL) => {
      const language = new URL(String(input)).searchParams.get("language")
      asked.push(language)
      return new Response(
        JSON.stringify(reply(byLanguage[language ?? "en"] ?? 0)),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    }) as typeof fetch

    return { asked, restore: () => (globalThis.fetch = original) }
  }

  const pcm = new Int16Array(16000)

  it("keeps the first result when it describes the audio", async () => {
    const stub = stubDeepgram({ en: 30 })

    try {
      const transcriber = createDeepgramTranscriber({
        apiKey: "k",
        languages: ["en", "no"],
      })
      await transcriber.transcribe(pcm, 16000, { voicedSeconds: 10 })

      // One request. The retry is not a routine second opinion — it costs a
      // call per candidate and only earns that on evidence.
      expect(stub.asked).toHaveLength(1)
    } finally {
      stub.restore()
    }
  })

  it("tries the other languages when the words do not match the audio", async () => {
    // The shipped failure, in miniature: English returns two words for ten
    // seconds of voice, Norwegian returns twenty-six.
    const stub = stubDeepgram({ en: 2, no: 26 })

    try {
      const transcriber = createDeepgramTranscriber({
        apiKey: "k",
        languages: ["en", "no"],
      })

      const result = await transcriber.transcribe(pcm, 16000, {
        voicedSeconds: 10,
      })

      expect(stub.asked).toContain("no")
      expect(wordsFromDeepgram(result)).toHaveLength(26)
    } finally {
      stub.restore()
    }
  })

  it("does not retry without a measurement to judge by", async () => {
    // No voiced seconds means no evidence. Guessing would send every silent
    // clip round every candidate language.
    const stub = stubDeepgram({ en: 1 })

    try {
      const transcriber = createDeepgramTranscriber({
        apiKey: "k",
        languages: ["en", "no"],
      })
      await transcriber.transcribe(pcm, 16000)

      expect(stub.asked).toHaveLength(1)
    } finally {
      stub.restore()
    }
  })

  it("keeps what it has when a candidate fails", async () => {
    const original = globalThis.fetch
    let call = 0

    globalThis.fetch = (async () => {
      call++
      if (call === 1) {
        return new Response(JSON.stringify(reply(2)), { status: 200 })
      }
      throw new Error("network")
    }) as typeof fetch

    try {
      const transcriber = createDeepgramTranscriber({
        apiKey: "k",
        languages: ["en", "no"],
      })

      const result = await transcriber.transcribe(pcm, 16000, {
        voicedSeconds: 10,
      })

      // A failed candidate is not a reason to lose the transcript we have.
      expect(wordsFromDeepgram(result)).toHaveLength(2)
    } finally {
      globalThis.fetch = original
    }
  })
})
