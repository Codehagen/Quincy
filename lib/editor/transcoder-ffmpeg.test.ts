import { describe, expect, it } from "vitest"

import { keyframeArgs, parseKeyframes, pcmFromWav } from "./transcoder-ffmpeg"

/**
 * Build a WAV the way ffmpeg does, optionally with the LIST/INFO chunk some
 * builds insert between `fmt ` and `data`. That chunk is the whole reason this
 * reader walks rather than slicing at 44.
 */
function wav(
  samples: number[],
  { sampleRate = 16000, withListChunk = false } = {}
): Uint8Array {
  const list = withListChunk ? 8 + 10 : 0
  const dataBytes = samples.length * 2
  const total = 12 + 24 + list + 8 + dataBytes

  const bytes = new Uint8Array(total)
  const view = new DataView(bytes.buffer)
  let offset = 0

  const tag = (text: string) => {
    for (const character of text) bytes[offset++] = character.charCodeAt(0)
  }
  const u32 = (value: number) => {
    view.setUint32(offset, value, true)
    offset += 4
  }
  const u16 = (value: number) => {
    view.setUint16(offset, value, true)
    offset += 2
  }

  tag("RIFF")
  u32(total - 8)
  tag("WAVE")

  tag("fmt ")
  u32(16)
  u16(1) // PCM
  u16(1) // mono
  u32(sampleRate)
  u32(sampleRate * 2) // byte rate
  u16(2) // block align
  u16(16) // bits per sample

  if (withListChunk) {
    tag("LIST")
    u32(10)
    tag("INFOISFT") // encoder name, near enough
    offset += 2
  }

  tag("data")
  u32(dataBytes)
  for (const sample of samples) {
    view.setInt16(offset, sample, true)
    offset += 2
  }

  return bytes
}

describe("pcmFromWav", () => {
  it("reads the samples and the rate ffmpeg wrote", () => {
    const { pcm, sampleRate } = pcmFromWav(wav([0, 1000, -1000, 32767]))

    expect(sampleRate).toBe(16000)
    expect(Array.from(pcm)).toEqual([0, 1000, -1000, 32767])
  })

  it("finds the data chunk past a LIST chunk", () => {
    // Slicing at a constant 44 here reads ffmpeg's encoder name as audio: a
    // click at the head of every waveform and a transcript that starts late.
    const { pcm } = pcmFromWav(wav([7, -7], { withListChunk: true }))

    expect(Array.from(pcm)).toEqual([7, -7])
  })

  it("does not read past the end when the declared size overruns", () => {
    // A write interrupted mid-flush leaves a header promising more than the
    // file holds. Trusting it reads off the end of the buffer.
    const bytes = wav([1, 2, 3])
    const view = new DataView(bytes.buffer)
    view.setUint32(bytes.byteLength - 6 - 2, 9999, true)

    expect(() => pcmFromWav(bytes)).not.toThrow()
  })

  it("keeps the rate the file declares, not the one we asked for", () => {
    // The rate goes into Deepgram's query string. Wrong rate, right words,
    // every timestamp scaled.
    expect(pcmFromWav(wav([0], { sampleRate: 48000 })).sampleRate).toBe(48000)
  })

  it("refuses something that is not a WAV", () => {
    expect(() => pcmFromWav(new Uint8Array(64))).toThrow(/WAV/)
  })
})

describe("parseKeyframes", () => {
  it("keeps only the packets flagged as keyframes", () => {
    const csv = ["0.000000,K__", "0.033333,___", "2.000000,K__"].join("\n")

    expect(parseKeyframes(csv)).toEqual([0, 2_000_000])
  })

  it("sorts, because packets arrive in decode order", () => {
    // B-frames put presentation timestamps out of order. A seek index that is
    // not monotonic makes a binary search silently wrong.
    const csv = ["4.000000,K__", "0.000000,K__", "2.000000,K__"].join("\n")

    expect(parseKeyframes(csv)).toEqual([0, 2_000_000, 4_000_000])
  })

  it("skips packets with no timestamp", () => {
    // "N/A" is what a container with no timestamps reports. Not an error —
    // just a packet that cannot anchor a seek.
    expect(parseKeyframes("N/A,K__\n1.500000,K__")).toEqual([1_500_000])
  })

  it("rounds to whole microseconds", () => {
    // Us is an integer type. A fractional offset here would put a float back
    // into the one arithmetic the whole time module exists to keep exact.
    const [first] = parseKeyframes("0.0333333333,K__")

    expect(Number.isInteger(first)).toBe(true)
    expect(first).toBe(33_333)
  })

  it("has nothing to say about an empty read", () => {
    expect(parseKeyframes("")).toEqual([])
  })
})

describe("keyframeArgs", () => {
  it("reads packets rather than frames", () => {
    // `frame=` makes ffprobe decode the video to answer, which on a long file
    // costs about what the transcode did. Packet headers already carry the flag.
    const args = keyframeArgs("/tmp/proxy.mp4")

    expect(args).toContain("packet=pts_time,flags")
    expect(args.join(" ")).not.toContain("frame=")
  })

  it("asks the first video stream only", () => {
    expect(keyframeArgs("/tmp/proxy.mp4")).toContain("v:0")
  })
})
