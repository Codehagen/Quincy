import { describe, expect, it } from "vitest"

import {
  contentKey,
  filmstripArgs,
  FILMSTRIP_TILES,
  keyframeAtOrBefore,
  parseFrameRate,
  parseProbe,
  peaksFromPcm,
  planFilmstrip,
  DEFAULT_PROXY,
  proxyArgs,
  storageKeys,
  thumbnailArgs,
} from "./media"
import { LANDSCAPE_CANVAS, VERTICAL_CANVAS } from "./document"
import { secondsToUs } from "./time"
import { us } from "./time"

describe("parseFrameRate", () => {
  it("reads a plain rate", () => {
    expect(parseFrameRate("30/1")).toBe(30)
  })

  it("reads NTSC as 29.97 rather than NaN", () => {
    // ffprobe reports a rational string. Parsing it as a float gives NaN, and
    // a NaN frame rate makes every frame calculation downstream NaN too.
    expect(parseFrameRate("30000/1001")).toBe(29.97)
  })

  it("survives the 0/0 that streams report", () => {
    expect(parseFrameRate("0/0")).toBe(0)
  })

  it("survives a missing value", () => {
    expect(parseFrameRate(undefined)).toBe(0)
  })
})

describe("parseProbe", () => {
  const base = {
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

  it("reads the shape the editor branches on", () => {
    expect(parseProbe(base)).toMatchObject({
      durationUs: 144_553_000,
      width: 3840,
      height: 2160,
      fps: 30,
      hasAudio: true,
      videoCodec: "hevc",
    })
  })

  it("reads rotation from display-matrix side data", () => {
    const probe = parseProbe({
      ...base,
      streams: [
        { ...base.streams[0], side_data_list: [{ rotation: -90 }] },
        base.streams[1],
      ],
    })

    // Negative in the side data is clockwise; the editor wants 0..359.
    expect(probe.rotation).toBe(270)
  })

  it("falls back to the legacy rotate tag", () => {
    // Reading only side data leaves footage from half the phones sideways.
    const probe = parseProbe({
      ...base,
      streams: [
        { ...base.streams[0], tags: { rotate: "90" } },
        base.streams[1],
      ],
    })

    expect(probe.rotation).toBe(90)
  })

  it("reports no audio for a silent screen recording", () => {
    const probe = parseProbe({ ...base, streams: [base.streams[0]] })
    expect(probe.hasAudio).toBe(false)
    expect(probe.audioCodec).toBeNull()
  })

  it("does not throw on a container missing everything", () => {
    // Screen recordings and saved streams turn up without a duration often
    // enough that rejecting them would reject files that edit fine.
    expect(parseProbe({})).toMatchObject({ durationUs: 0, fps: 0, width: 0 })
  })
})

describe("proxyArgs", () => {
  const args = proxyArgs("in.mov", "out.mp4").join(" ")

  it("forces the one pixel format browsers reliably decode", () => {
    // 10-bit and 4:2:2 fail in browser decode even where the codec is fine.
    expect(args).toContain("-pix_fmt yuv420p")
  })

  it("forces a constant frame rate", () => {
    // Variable frame rate footage makes frame-accurate seeking meaningless,
    // and every screen recording is variable frame rate.
    expect(args).toContain("-vsync cfr")
  })

  it("moves the moov atom to the front", () => {
    // Otherwise playback waits for a full download instead of starting on the
    // first range request.
    expect(args).toContain("-movflags +faststart")
  })

  it("keeps keyframes two seconds apart so scrubbing lands near one", () => {
    expect(args).toContain("-g 60")
  })

  it("only ever shrinks", () => {
    // Upscaling costs bytes and adds nothing — the pixels are not there.
    expect(args).toContain("min(1920,iw)")
    expect(args).toContain("min(1920,ih)")
  })

  it("caps the long edge at the canvas, not below it", () => {
    // The whole point. `maxEdge` caps the *long* edge and the canvas is 1920 on
    // its long edge in every orientation, so anything smaller ships a proxy the
    // compositor has to upscale — which is what the preview and every exported
    // file were doing at 720.
    expect(DEFAULT_PROXY.maxEdge).toBe(
      Math.max(VERTICAL_CANVAS.width, VERTICAL_CANVAS.height)
    )
    expect(DEFAULT_PROXY.maxEdge).toBe(
      Math.max(LANDSCAPE_CANVAS.width, LANDSCAPE_CANVAS.height)
    )
  })

  it("encodes well enough to survive a second encode", () => {
    // The proxy is a source for the export encode, not a final. Artefacts it
    // carries get re-compressed rather than dropped.
    expect(DEFAULT_PROXY.crf).toBeLessThanOrEqual(20)
  })

  it("holds audio sync on sources that drift", () => {
    expect(args).toContain("aresample=async=1")
  })
})

describe("thumbnailArgs", () => {
  it("seeks before the input, not after", () => {
    // After -i, ffmpeg decodes up to the point. On a long file that is the
    // difference between instant and thirty seconds.
    const args = thumbnailArgs("in.mp4", "out.jpg", us(5_000_000))
    expect(args.indexOf("-ss")).toBeLessThan(args.indexOf("-i"))
    expect(args[args.indexOf("-ss") + 1]).toBe("5.000")
  })
})

describe("peaksFromPcm", () => {
  it("buckets samples at the requested interval", () => {
    // 16kHz at 20ms per bucket is 320 samples each.
    const pcm = new Int16Array(3200)
    expect(peaksFromPcm(pcm, 16000, us(20_000)).values).toHaveLength(10)
  })

  it("keeps the peak rather than the average", () => {
    // RMS flattens transients until a percussive talk draws as a flat bar.
    const pcm = new Int16Array(320)
    pcm[10] = 32767
    const { values } = peaksFromPcm(pcm, 16000, us(20_000))
    expect(values[0]).toBeCloseTo(1, 2)
  })

  it("reports silence as zero", () => {
    const { values } = peaksFromPcm(new Int16Array(320), 16000, us(20_000))
    expect(values[0]).toBe(0)
  })

  it("handles a tail shorter than one bucket", () => {
    const pcm = new Int16Array(500)
    expect(peaksFromPcm(pcm, 16000, us(20_000)).values).toHaveLength(2)
  })
})

describe("contentKey", () => {
  it("puts the size in the key alongside the hash", () => {
    // Two files can then only collide if they are both the same length and
    // the same hash.
    expect(contentKey(818670144, "49bfd3014c9d")).toBe(
      "xxh3-128:818670144:49bfd3014c9d"
    )
  })
})

describe("keyframeAtOrBefore", () => {
  const index = (keyframesUs: number[]) => ({
    keyframesUs: keyframesUs as never,
  })

  it("finds the keyframe a decoder would start from", () => {
    expect(
      keyframeAtOrBefore(us(2_100_000), index([0, 2_000_000, 4_000_000]))
    ).toBe(2_000_000)
  })

  it("returns the keyframe itself when the time is exactly one", () => {
    expect(keyframeAtOrBefore(us(2_000_000), index([0, 2_000_000]))).toBe(
      2_000_000
    )
  })

  it("has no answer before the first keyframe", () => {
    // Null rather than zero. "There is no keyframe here" and "the keyframe is
    // at zero" are different facts, and a cut path that confused them would
    // copy a stream from a point that is not a keyframe.
    expect(keyframeAtOrBefore(us(500_000), index([1_000_000]))).toBeNull()
  })

  it("has no answer without an index", () => {
    expect(keyframeAtOrBefore(us(1_234_567), null)).toBeNull()
    expect(keyframeAtOrBefore(us(1_234_567), index([]))).toBeNull()
  })

  it("does not care about the order the index arrived in", () => {
    expect(
      keyframeAtOrBefore(us(5_000_000), index([4_000_000, 0, 2_000_000]))
    ).toBe(4_000_000)
  })
})

describe("storageKeys", () => {
  it("versions the derivative paths", () => {
    // So changing the proxy recipe does not mean serving the old proxy from a
    // key the new code believes it wrote.
    // v2 is the 1920-long-edge proxy. The version is in the path so a rebuilt
    // proxy lands on a new object rather than overwriting a URL something may
    // already hold, and so an asset keeps playing v1 until the backfill has
    // actually replaced it.
    expect(storageKeys.proxy("abc")).toBe("derived/proxy/v2/abc.mp4")
    expect(storageKeys.seekIndex("abc")).toBe("derived/seek/v1/abc.json")
  })

  it("stores originals by content hash alone", () => {
    expect(storageKeys.original("abc")).toBe("assets/abc")
  })
})

describe("planFilmstrip", () => {
  it("samples a short clip densely enough not to repeat itself", () => {
    const plan = planFilmstrip(secondsToUs(15))

    // Fifteen seconds at the 200ms floor is 75 frames. At the old 40-tile
    // ceiling it was 30, and a clip a third of the take got ten of them across
    // a lane with room for twenty — every picture drawn twice.
    expect(plan.intervalUs).toBe(200_000)
    expect(plan.count).toBe(75)
  })

  it("gives even a second and a half more than three frames", () => {
    // The fixture that made the repetition obvious: 3 frames across a whole
    // lane is one picture stacked four times.
    expect(planFilmstrip(secondsToUs(1.5)).count).toBe(8)
  })

  it("caps a long one by what the sheet can hold", () => {
    const plan = planFilmstrip(secondsToUs(600))

    // 156px tiles, so 78 fit the 12288px budget — that binds long before the
    // 240 ceiling does. One frame every eight seconds across a ten minute talk.
    expect(plan.count).toBe(78)
    expect(plan.count * plan.tileWidth).toBeLessThanOrEqual(12288)
  })

  it("never plans a sheet with nothing in it", () => {
    // A clip shorter than the interval still has a first frame, and a tile
    // count of zero is an ffmpeg command that writes no file at all.
    expect(planFilmstrip(0).count).toBe(1)
    expect(planFilmstrip(secondsToUs(0.2)).count).toBe(1)
  })

  it("gives every tile the same shape, whatever the footage", () => {
    // Uniform, and cropped to it. The reference's spine canvas was read and
    // autocorrelated: a 79px pitch in a 44px lane, which is 16:9 on the same
    // portrait footage. Source aspect at that height is 24px across, which is
    // two characters wide and unreadable.
    const plan = planFilmstrip(secondsToUs(15))

    expect(plan.tileWidth).toBe(156)
    expect(plan.tileHeight).toBe(88)
    expect(plan.tileWidth / plan.tileHeight).toBeCloseTo(16 / 9, 1)
  })

  it("keeps every sheet inside a texture a browser will hold", () => {
    for (const seconds of [1, 15, 60, 600, 3600]) {
      const plan = planFilmstrip(secondsToUs(seconds))
      expect(plan.count * plan.tileWidth).toBeLessThanOrEqual(12288)
    }
  })

  it("never samples faster than five a second", () => {
    for (const seconds of [1, 5, 15, 19, 20, 60]) {
      expect(
        planFilmstrip(secondsToUs(seconds)).intervalUs
      ).toBeGreaterThanOrEqual(200_000)
    }
  })
})

describe("filmstripArgs", () => {
  it("samples, resizes and tiles in one pass", () => {
    // Portrait, so the sheet has room and the interval lands on the 200ms
    // floor rather than on whatever the budget allowed.
    // Fifteen seconds, which is short enough that the 200ms floor decides the
    // interval rather than the sheet budget.
    const args = filmstripArgs(
      "in.mp4",
      "out.jpg",
      planFilmstrip(secondsToUs(15))
    )
    const filter = args[args.indexOf("-vf") + 1]

    expect(filter).toContain("fps=5.000000")
    expect(filter).toContain("scale=156:88")
    // Cover then crop. Every tile is the same 1.6:1 window, so a portrait
    // frame loses its top and bottom and an ultrawide loses its sides.
    expect(filter).toContain("crop=156:88")
    expect(filter).toContain("tile=75x1")
    expect(args).toContain("-frames:v")
  })

  it("asks for one image, not a video", () => {
    const args = filmstripArgs(
      "in.mp4",
      "out.jpg",
      planFilmstrip(secondsToUs(5))
    )
    expect(args[args.indexOf("-frames:v") + 1]).toBe("1")
    expect(args[args.length - 1]).toBe("out.jpg")
  })
})
