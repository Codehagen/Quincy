import { describe, expect, it } from "vitest"

import { wordsFromTranscript } from "@/lib/editor/transcript"

import {
  audioFile,
  audioSeconds,
  isStoredTranscript,
  pcmTranscriber,
  storedTranscript,
  wavFromPcm,
  type SpeechToText,
  type Transcription,
} from "./speech-to-text"

const words = [
  { word: "hei", punctuated_word: "Hei,", start: 0.1, end: 0.4 },
  {
    word: "alle",
    punctuated_word: "alle.",
    start: 0.5,
    end: 0.9,
    confidence: 0.8,
  },
]

describe("storedTranscript", () => {
  it("is read by the editor the same way as a Deepgram response", () => {
    const stored = storedTranscript({
      provider: "self-hosted",
      model: "m",
      text: "Hei, alle.",
      words,
    })

    expect(isStoredTranscript(stored)).toBe(true)
    expect(wordsFromTranscript(stored)).toEqual([
      {
        text: "Hei,",
        startUs: 100_000,
        endUs: 400_000,
        confidence: 1,
        speaker: undefined,
      },
      {
        text: "alle.",
        startUs: 500_000,
        endUs: 900_000,
        confidence: 0.8,
        speaker: undefined,
      },
    ])
  })

  it("survives a trip through JSON, which is how the row keeps it", () => {
    const stored = JSON.parse(
      JSON.stringify(
        storedTranscript({ provider: "p", model: "m", text: "", words })
      )
    )
    expect(wordsFromTranscript(stored)).toHaveLength(2)
  })

  it("is not mistaken for a Deepgram response, or the other way round", () => {
    expect(isStoredTranscript({ results: {} })).toBe(false)
    expect(isStoredTranscript(null)).toBe(false)
  })
})

describe("wavFromPcm", () => {
  it("puts a 44-byte mono 16-bit header in front of the samples", () => {
    const wav = wavFromPcm(new Int16Array([1, -1, 300]), 16000)
    const view = new DataView(wav.buffer)
    const text = (at: number) => String.fromCharCode(...wav.slice(at, at + 4))

    expect(wav.byteLength).toBe(44 + 6)
    expect(text(0)).toBe("RIFF")
    expect(text(8)).toBe("WAVE")
    expect(view.getUint16(22, true)).toBe(1)
    expect(view.getUint32(24, true)).toBe(16000)
    expect(view.getUint16(34, true)).toBe(16)
    expect(view.getUint32(40, true)).toBe(6)
    expect(view.getInt16(48, true)).toBe(300)
  })

  it("takes only a subarray's own samples", () => {
    const slice = new Int16Array(1000).subarray(10, 14)
    expect(wavFromPcm(slice, 16000).byteLength).toBe(44 + 8)
  })
})

describe("audioFile and audioSeconds", () => {
  it("passes a file through and wraps samples", () => {
    const bytes = new Uint8Array([1, 2])
    expect(audioFile({ kind: "file", bytes, mediaType: "audio/webm" })).toEqual(
      {
        bytes,
        mediaType: "audio/webm",
      }
    )
    expect(
      audioFile({ kind: "pcm", samples: new Int16Array(4), sampleRate: 16000 })
        .mediaType
    ).toBe("audio/wav")
  })

  it("knows the length of samples and not of a file", () => {
    expect(
      audioSeconds({
        kind: "pcm",
        samples: new Int16Array(32000),
        sampleRate: 16000,
      })
    ).toBe(2)
    expect(
      audioSeconds({
        kind: "file",
        bytes: new Uint8Array(9),
        mediaType: "audio/webm",
      })
    ).toBeNull()
  })
})

describe("pcmTranscriber", () => {
  const speech = (result: Partial<Transcription>): SpeechToText => ({
    name: "test",
    givesWords: true,
    maxPasses: 3,
    transcribe: async () => ({
      provider: "test",
      model: "m",
      text: "",
      words: [],
      stored: { kept: true },
      ...result,
    }),
  })

  it("hands ingest what the provider stores, and its pass count", async () => {
    const transcriber = pcmTranscriber(speech({}))
    expect(transcriber.maxPasses).toBe(3)
    await expect(
      transcriber.transcribe(new Int16Array(16), 16000)
    ).resolves.toEqual({ kept: true })
  })

  it("refuses text with no word timings under it", async () => {
    // Stored, it would read as a silent take, and silence removal would cut
    // the whole recording.
    await expect(
      pcmTranscriber(speech({ text: "Hei", words: [] })).transcribe(
        new Int16Array(16),
        16000
      )
    ).rejects.toThrow(/without word timings/)
    await expect(
      pcmTranscriber(speech({ words: null })).transcribe(
        new Int16Array(16),
        16000
      )
    ).rejects.toThrow(/without word timings/)
  })

  it("passes the measured voice on, for a provider that judges by it", async () => {
    let seen: number | undefined
    const transcriber = pcmTranscriber({
      ...speech({}),
      transcribe: async (_audio, options) => {
        seen = options?.voicedSeconds
        return { provider: "t", model: "m", text: "", words: [], stored: {} }
      },
    })
    await transcriber.transcribe(new Int16Array(16), 16000, {
      voicedSeconds: 7,
    })
    expect(seen).toBe(7)
  })
})
