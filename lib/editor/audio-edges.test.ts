import { describe, expect, it } from "vitest"

import { cutEdges, edgeGain } from "./audio-edges"
import type { Track, VideoElement } from "./types"

const clip = (
  id: string,
  startUs: number,
  trimStartUs: number,
  durationUs: number
) =>
  ({
    id,
    kind: "video",
    mediaId: "m",
    startUs,
    durationUs,
    trimStartUs,
    trimEndUs: trimStartUs + durationUs,
  }) as unknown as VideoElement

const track = (...elements: VideoElement[]) =>
  ({ elements }) as unknown as Track

describe("cutEdges", () => {
  it("softens a join that skips source, and not one that runs on", () => {
    const edges = cutEdges(
      track(
        clip("a", 0, 0, 1_000_000),
        clip("b", 1_000_000, 2_000_000, 1_000_000),
        clip("c", 2_000_000, 3_000_000, 1_000_000)
      )
    )
    expect(edges.get("a")).toEqual({ in: false, out: true })
    expect(edges.get("b")).toEqual({ in: true, out: false })
    expect(edges.get("c")).toEqual({ in: false, out: false })
  })
})

describe("edgeGain", () => {
  it("ramps the edge frames only", () => {
    const edges = { in: true, out: true }
    expect(edgeGain(0, 30, edges)).toBe(0.5)
    expect(edgeGain(1, 30, edges)).toBe(1)
    expect(edgeGain(29, 30, edges)).toBe(0.5)
    expect(edgeGain(0, 30, { in: false, out: false })).toBe(1)
    expect(edgeGain(0, 30, undefined)).toBe(1)
  })
})
