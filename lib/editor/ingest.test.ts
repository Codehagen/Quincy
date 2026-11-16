import { describe, expect, it, vi } from "vitest"

import {
  DEFAULT_PROXY_FOR_FPS,
  runIngest,
  visionHandleIsLive,
  type IngestPorts,
  type MediaSource,
} from "./ingest"
import { peaksFromPcm } from "./media"

const source: MediaSource = { kind: "path", path: "/tmp/in.mov" }

const input = {
  assetId: "a1",
  filename: "IMG_8762.MOV",
  mimeType: "video/quicktime",
  sizeBytes: 818670144,
  contentHash: "xxh3-128:818670144:49bfd3",
  source,
}

const probeJson = {
  format: { duration: "144.553" },
  streams: [
    {
      codec_type: "video",
      codec_name: "hevc",
      width: 3840,
      height: 2160,
      avg_frame_rate: "30/1",
    },
    { codec_type: "audio", codec_name: "aac" },
  ],
}

function ports(overrides: Partial<IngestPorts> = {}): IngestPorts {
  return {
    storage: {
      put: vi.fn().mockResolvedValue(undefined),
      url: vi.fn().mockResolvedValue("https://example.test/x"),
      exists: vi.fn().mockResolvedValue(false),
    },
    transcoder: {
      probe: vi.fn().mockResolvedValue(probeJson),
      proxy: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])),
      audio: vi
        .fn()
        .mockResolvedValue({ pcm: new Int16Array(1600), sampleRate: 16000 }),
      thumbnail: vi.fn().mockResolvedValue(new Uint8Array([4])),
      filmstrip: vi.fn().mockResolvedValue(new Uint8Array([5])),
    },
    transcriber: {
      transcribe: vi.fn().mockResolvedValue({ results: {} }),
      name: "deepgram",
    },
    peaksFromPcm,
    ...overrides,
  }
}

describe("runIngest", () => {
  it("produces everything the editor needs to open the asset", async () => {
    const result = await runIngest(input, ports())

    expect(result.probe).toMatchObject({ width: 3840, fps: 30, hasAudio: true })
    expect(result.keys.proxy).toContain("derived/proxy/v2/")
    expect(result.transcriptProvider).toBe("deepgram")
    expect(result.warnings).toEqual([])
  })

  it("skips the transcode when the proxy already exists", async () => {
    // The payoff for content addressing: a second cut of the same talk reuses
    // the proxy instead of spending minutes rebuilding it.
    const p = ports()
    p.storage.exists = vi.fn().mockResolvedValue(true)

    await runIngest(input, p)

    expect(p.transcoder.proxy).not.toHaveBeenCalled()
  })

  it("still succeeds when transcription fails", async () => {
    // Deepgram being down should not stop you scrubbing footage.
    const p = ports()
    p.transcriber.transcribe = vi.fn().mockRejectedValue(new Error("429"))

    const result = await runIngest(input, p)

    expect(result.transcript).toBeNull()
    expect(result.warnings[0]).toContain("transcript")
  })

  it("still succeeds when the thumbnail fails", async () => {
    const p = ports()
    p.transcoder.thumbnail = vi.fn().mockRejectedValue(new Error("no frame"))

    const result = await runIngest(input, p)
    expect(result.warnings[0]).toContain("thumbnail")
  })

  it("fails the asset when the proxy cannot be built", async () => {
    // Fatal, unlike the rest: without a proxy there is nothing to edit.
    const p = ports()
    p.transcoder.proxy = vi.fn().mockRejectedValue(new Error("bad codec"))

    await expect(runIngest(input, p)).rejects.toThrow("bad codec")
  })

  it("does not look for speech in a silent screen recording", async () => {
    const p = ports()
    p.transcoder.probe = vi
      .fn()
      .mockResolvedValue({ ...probeJson, streams: [probeJson.streams[0]] })

    const result = await runIngest(input, p)

    expect(p.transcriber.transcribe).not.toHaveBeenCalled()
    expect(result.transcript).toBeNull()
    // And it is not a warning — an asset with no audio has no transcript by
    // definition, so flagging it would train the user to ignore warnings.
    expect(result.warnings).toEqual([])
  })

  it("fetches a vision handle when one is configured", async () => {
    const expiresAt = new Date(Date.now() + 48 * 3600 * 1000)
    const p = ports({
      vision: {
        upload: vi.fn().mockResolvedValue({ uri: "files/x", expiresAt }),
      },
    })

    const result = await runIngest(input, p)
    expect(result.vision).toEqual({ uri: "files/x", expiresAt })
  })

  it("carries on when vision upload fails", async () => {
    const p = ports({
      vision: { upload: vi.fn().mockRejectedValue(new Error("quota")) },
    })

    const result = await runIngest(input, p)
    expect(result.vision).toBeNull()
    expect(result.warnings[0]).toContain("vision")
  })

  it("reports progress in pipeline order", async () => {
    const steps: string[] = []
    await runIngest(input, ports({ onProgress: (step) => steps.push(step) }))

    expect(steps).toEqual([
      "probing",
      "transcoding",
      "extracting-audio",
      "transcribing",
      "indexing",
      "thumbnailing",
      "done",
    ])
  })

  it("writes peaks and keyframes as one seek index", () => {
    // One object because the timeline reads both on the same frame: the
    // waveform is drawn from the peaks and a click snaps to a keyframe.
    const p = ports()
    p.transcoder.keyframes = vi.fn().mockResolvedValue([0, 2_000_000])

    return runIngest(input, p).then((result) => {
      expect(result.seekIndex.keyframesUs).toEqual([0, 2_000_000])
      expect(result.seekIndex.values.length).toBeGreaterThan(0)

      const written = (p.storage.put as ReturnType<typeof vi.fn>).mock.calls
      const index = written.find(([key]) => key.startsWith("derived/seek/"))
      expect(index).toBeDefined()
      expect(JSON.parse(new TextDecoder().decode(index![1]))).toMatchObject({
        keyframesUs: [0, 2_000_000],
      })
    })
  })

  it("reads keyframes from the proxy, not the source", async () => {
    // The browser plays the proxy. Seeking to a keyframe of a file nothing
    // decodes lands the playhead near the right place, which reads as a bug.
    const proxyBytes = new Uint8Array([1, 2, 3])
    const p = ports()
    p.transcoder.proxy = vi.fn().mockResolvedValue(proxyBytes)
    p.transcoder.keyframes = vi.fn().mockResolvedValue([])

    await runIngest(input, p)

    expect(p.transcoder.keyframes).toHaveBeenCalledWith({
      kind: "bytes",
      bytes: proxyBytes,
    })
  })

  it("leaves an existing seek index alone when the proxy is reused", async () => {
    // Same content hash means the index beside it already describes this exact
    // file. Rewriting it would spend a proxy-sized read to produce identical
    // bytes — and with no proxy in hand, an empty keyframe list at that.
    const p = ports()
    p.storage.exists = vi.fn().mockResolvedValue(true)
    p.transcoder.keyframes = vi.fn().mockResolvedValue([0])

    await runIngest(input, p)

    const written = (p.storage.put as ReturnType<typeof vi.fn>).mock.calls
    expect(written.some(([key]) => key.startsWith("derived/seek/"))).toBe(false)
    expect(p.transcoder.keyframes).not.toHaveBeenCalled()
  })

  it("still succeeds when the keyframe read fails", async () => {
    // Seeking falls back to whatever the browser does on its own, which is
    // approximate rather than absent.
    const p = ports()
    p.transcoder.keyframes = vi.fn().mockRejectedValue(new Error("no packets"))

    const result = await runIngest(input, p)

    expect(result.seekIndex.keyframesUs).toEqual([])
    expect(result.warnings[0]).toContain("seek index")
  })

  it("indexes a silent screen recording too", async () => {
    // No audio means no peaks, but the seek index is what makes scrubbing
    // land on a frame, and a screen recording is the case that needs it most.
    const p = ports()
    p.transcoder.probe = vi
      .fn()
      .mockResolvedValue({ ...probeJson, streams: [probeJson.streams[0]] })
    p.transcoder.keyframes = vi.fn().mockResolvedValue([0, 2_000_000])

    const result = await runIngest(input, p)

    expect(result.seekIndex.keyframesUs).toEqual([0, 2_000_000])
    expect(result.seekIndex.values).toEqual([])
  })
})

describe("DEFAULT_PROXY_FOR_FPS", () => {
  it("conforms 60fps down to 30", () => {
    // Short-form is watched at 30 and the compositor draws half as many frames.
    expect(DEFAULT_PROXY_FOR_FPS(60).fps).toBe(30)
  })

  it("leaves a 24fps film-look source alone", () => {
    // Conforming up duplicates frames and makes motion judder.
    expect(DEFAULT_PROXY_FOR_FPS(24).fps).toBe(24)
  })

  it("falls back to 30 when probe found no rate", () => {
    expect(DEFAULT_PROXY_FOR_FPS(0).fps).toBe(30)
  })
})

describe("visionHandleIsLive", () => {
  it("says no to a handle that has expired", () => {
    expect(visionHandleIsLive(new Date(Date.now() - 1000))).toBe(false)
  })

  it("says no to a handle expiring within the minute", () => {
    // One expiring mid-request is the same failure as one long dead.
    expect(visionHandleIsLive(new Date(Date.now() + 30_000))).toBe(false)
  })

  it("says yes to a fresh handle", () => {
    expect(visionHandleIsLive(new Date(Date.now() + 3600_000))).toBe(true)
  })

  it("says no when there is no handle", () => {
    expect(visionHandleIsLive(null)).toBe(false)
  })
})
