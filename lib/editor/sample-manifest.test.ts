import { describe, expect, it } from "vitest"

import { parseSampleManifest, sampleContentHash } from "./sample-manifest"

const valid = {
  version: 1,
  filename: "sample.mp4",
  mimeType: "video/mp4",
  sizeBytes: 4_200_000,
  contentHash: sampleContentHash("ab".repeat(32)),
  probe: {
    durationUs: 15_000_000,
    width: 1080,
    height: 1920,
    fps: 30,
    rotation: 0,
    hasAudio: true,
  },
  filmstrip: { count: 40, intervalUs: 375_000, tileWidth: 156, tileHeight: 88 },
  transcriptProvider: "deepgram",
  files: {
    proxy: "proxy.mp4",
    seekIndex: "seek.json",
    thumbnail: "thumb.jpg",
    filmstrip: "strip.jpg",
    transcript: "transcript.json",
  },
}

describe("parseSampleManifest", () => {
  it("accepts what the prepare script writes", () => {
    expect(parseSampleManifest(valid)).toEqual(valid)
  })

  it("treats nothing at all as no sample", () => {
    expect(parseSampleManifest(null)).toBeNull()
    expect(parseSampleManifest("{}")).toBeNull()
  })

  it("refuses a file name that is a path", () => {
    // The names are joined onto the sample directory and read from disk.
    expect(
      parseSampleManifest({
        ...valid,
        files: { ...valid.files, proxy: "../../.env.local" },
      })
    ).toBeNull()
  })

  it("refuses a content hash outside the sample prefix", () => {
    // A sample key must never land on a real upload's objects.
    expect(
      parseSampleManifest({ ...valid, contentHash: "xxh3-128:1:abc" })
    ).toBeNull()
  })

  it("refuses a filmstrip sheet without its geometry", () => {
    expect(parseSampleManifest({ ...valid, filmstrip: null })).toBeNull()
  })

  it("accepts a sample with no filmstrip at all", () => {
    expect(
      parseSampleManifest({
        ...valid,
        filmstrip: null,
        files: { ...valid.files, filmstrip: null },
      })
    ).not.toBeNull()
  })
})
