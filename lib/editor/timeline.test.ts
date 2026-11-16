import { describe, expect, it } from "vitest"

import { DEFAULT_CAPTION_STYLE } from "./document"
import { createProvenance } from "./provenance"
import { secondsToUs, us, type Us } from "./time"
import {
  remapCaptions,
  rippleTrack,
  sourceToTimelineUs,
  speechRegions,
  splitBySourceRanges,
  trackEndUs,
} from "./timeline"
import type { CaptionElement, CaptionToken, Track, VideoElement } from "./types"

const s = (seconds: number) => secondsToUs(seconds) as Us

function videoElement(overrides: Partial<VideoElement> = {}): VideoElement {
  return {
    kind: "video",
    id: "el-1",
    name: "clip",
    mediaId: "media-1",
    startUs: us(0),
    durationUs: s(10),
    trimStartUs: us(0),
    trimEndUs: s(10),
    sourceDurationUs: s(60),
    transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
    opacity: 1,
    blendMode: "normal",
    volume: 1,
    muted: false,
    effects: [],
    animations: { channels: {} },
    provenance: createProvenance("user"),
    ...overrides,
  }
}

function spine(elements: VideoElement[]): Track {
  return {
    id: "track-main",
    kind: "video",
    name: "Main",
    isMain: true,
    elements,
  }
}

function token(overrides: Partial<CaptionToken> = {}): CaptionToken {
  return {
    id: "tok-1",
    text: "hei",
    startUs: us(0),
    endUs: s(0.3),
    sourceMediaId: "media-1",
    sourceElementId: "el-1",
    sourceStartUs: us(0),
    sourceEndUs: s(0.3),
    ...overrides,
  }
}

function caption(tokens: CaptionToken[], startUs: Us): CaptionElement {
  const span = tokens.length
    ? us(
        Math.max(...tokens.map((t) => t.endUs)) -
          Math.min(...tokens.map((t) => t.startUs))
      )
    : us(0)

  return {
    kind: "caption",
    id: `cap-${startUs}`,
    name: "Caption",
    startUs,
    durationUs: span,
    tokens,
    style: DEFAULT_CAPTION_STYLE,
    transform: { position: { x: 0, y: 0 }, scaleX: 1, scaleY: 1, rotate: 0 },
    provenance: createProvenance("agent"),
  }
}

describe("rippleTrack", () => {
  it("closes the hole a cut left behind", () => {
    const track = spine([
      videoElement({ id: "a", startUs: us(0), durationUs: s(5) }),
      videoElement({ id: "b", startUs: s(8), durationUs: s(5) }),
    ])

    expect(rippleTrack(track)).toEqual([
      expect.objectContaining({ id: "b", startUs: s(5) }),
    ])
  })

  it("reports nothing when the track is already gapless", () => {
    // Every returned element becomes an update op, and an op that changes
    // nothing would still stamp provenance — repainting a clip nobody edited.
    const track = spine([
      videoElement({ id: "a", startUs: us(0), durationUs: s(5) }),
      videoElement({ id: "b", startUs: s(5), durationUs: s(5) }),
    ])

    expect(rippleTrack(track)).toEqual([])
  })

  it("compounds across several gaps", () => {
    const track = spine([
      videoElement({ id: "a", startUs: us(0), durationUs: s(2) }),
      videoElement({ id: "b", startUs: s(5), durationUs: s(2) }),
      videoElement({ id: "c", startUs: s(10), durationUs: s(2) }),
    ])

    const moved = rippleTrack(track)
    expect(moved.map((el) => [el.id, el.startUs])).toEqual([
      ["b", s(2)],
      ["c", s(4)],
    ])
  })
})

describe("splitBySourceRanges", () => {
  it("returns the original element when nothing is removed", () => {
    // Identity matters: keeping the same object keeps its provenance and any
    // keyframes hanging off it.
    const element = videoElement()
    expect(splitBySourceRanges(element, [], () => "new")).toEqual([element])
  })

  it("splits a silence out of the middle", () => {
    const element = videoElement({ trimStartUs: us(0), trimEndUs: s(10) })
    const pieces = splitBySourceRanges(
      element,
      [{ startUs: s(4), endUs: s(6) }],
      () => "piece-2"
    )

    expect(pieces).toHaveLength(2)
    expect(pieces[0]).toMatchObject({ trimStartUs: us(0), trimEndUs: s(4) })
    expect(pieces[1]).toMatchObject({ trimStartUs: s(6), trimEndUs: s(10) })
  })

  it("lays the surviving pieces out gapless", () => {
    const element = videoElement({ trimStartUs: us(0), trimEndUs: s(10) })
    const pieces = splitBySourceRanges(
      element,
      [{ startUs: s(4), endUs: s(6) }],
      () => "piece-2"
    )

    expect(pieces[0].startUs).toBe(us(0))
    expect(pieces[0].durationUs).toBe(s(4))
    // Second piece begins where the first ends, not at its old source offset.
    expect(pieces[1].startUs).toBe(s(4))
    expect(pieces[1].durationUs).toBe(s(4))
  })

  it("keeps the original id on the first piece", () => {
    // So the clip the user had selected is still selected after the cut.
    const element = videoElement({ id: "chosen" })
    const pieces = splitBySourceRanges(
      element,
      [{ startUs: s(4), endUs: s(6) }],
      () => "fresh"
    )

    expect(pieces[0].id).toBe("chosen")
    expect(pieces[1].id).toBe("fresh")
  })

  it("returns nothing when the whole clip is silence", () => {
    const element = videoElement({ trimStartUs: us(0), trimEndUs: s(10) })
    expect(
      splitBySourceRanges(
        element,
        [{ startUs: us(0), endUs: s(10) }],
        () => "x"
      )
    ).toEqual([])
  })

  it("trims the head without splitting", () => {
    const element = videoElement({ trimStartUs: us(0), trimEndUs: s(10) })
    const pieces = splitBySourceRanges(
      element,
      [{ startUs: us(0), endUs: s(3) }],
      () => "x"
    )

    expect(pieces).toHaveLength(1)
    expect(pieces[0]).toMatchObject({ trimStartUs: s(3), trimEndUs: s(10) })
  })
})

describe("sourceToTimelineUs", () => {
  it("maps a source instant through a shifted clip", () => {
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: s(10),
        trimEndUs: s(15),
        durationUs: s(5),
      }),
    ])

    // Source 12s sits 2s into a clip that starts at 0 on the timeline.
    expect(sourceToTimelineUs(track, "media-1", s(12))).toBe(s(2))
  })

  it("returns null for an instant that was cut away", () => {
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(4),
        durationUs: s(4),
      }),
      videoElement({
        id: "b",
        startUs: s(4),
        trimStartUs: s(6),
        trimEndUs: s(10),
        durationUs: s(4),
      }),
    ])

    expect(sourceToTimelineUs(track, "media-1", s(5))).toBeNull()
  })

  it("ignores clips from a different asset", () => {
    const track = spine([videoElement({ mediaId: "other" })])
    expect(sourceToTimelineUs(track, "media-1", s(1))).toBeNull()
  })
})

describe("remapCaptions", () => {
  it("moves a word left by exactly the cut in front of it", () => {
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(4),
        durationUs: s(4),
      }),
      videoElement({
        id: "b",
        startUs: s(4),
        trimStartUs: s(6),
        trimEndUs: s(10),
        durationUs: s(4),
      }),
    ])

    const captions = [
      caption(
        [
          token({
            id: "t",
            text: "etter",
            sourceStartUs: s(7),
            sourceEndUs: s(7.4),
          }),
        ],
        s(7)
      ),
    ]

    const [remapped] = remapCaptions(captions, track)
    // Source 7s lives 1s into the second clip, which starts at 4s.
    expect(remapped.startUs).toBe(s(5))
  })

  it("drops a word that was cut away", () => {
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(4),
        durationUs: s(4),
      }),
      videoElement({
        id: "b",
        startUs: s(4),
        trimStartUs: s(6),
        trimEndUs: s(10),
        durationUs: s(4),
      }),
    ])

    const captions = [
      caption(
        [token({ id: "gone", sourceStartUs: s(5), sourceEndUs: s(5.3) })],
        s(5)
      ),
    ]

    expect(remapCaptions(captions, track)).toEqual([])
  })

  it("handles two uneven cuts, which a uniform shift would get wrong", () => {
    // The case that proves source binding earns its keep. Words after the
    // second cut have moved by 3s; words between the cuts by only 1s. Shifting
    // every caption by one delta would put half of them in the wrong place.
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(2),
        durationUs: s(2),
      }),
      videoElement({
        id: "b",
        startUs: s(2),
        trimStartUs: s(3),
        trimEndUs: s(5),
        durationUs: s(2),
      }),
      videoElement({
        id: "c",
        startUs: s(4),
        trimStartUs: s(7),
        trimEndUs: s(9),
        durationUs: s(2),
      }),
    ])

    const captions = [
      caption(
        [token({ id: "mid", sourceStartUs: s(4), sourceEndUs: s(4.2) })],
        s(4)
      ),
      caption(
        [token({ id: "late", sourceStartUs: s(8), sourceEndUs: s(8.2) })],
        s(8)
      ),
    ]

    const [mid, late] = remapCaptions(captions, track)
    expect(mid.startUs).toBe(s(3))
    expect(late.startUs).toBe(s(5))
  })

  it("clamps a word that straddles a cut to the end of its clip", () => {
    // Otherwise the tail reaches into whatever now follows and the word appears
    // to be spoken over the next sentence.
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(4),
        durationUs: s(4),
      }),
    ])

    const captions = [
      caption(
        [token({ id: "long", sourceStartUs: s(3.8), sourceEndUs: s(4.6) })],
        s(3.8)
      ),
    ]

    const [remapped] = remapCaptions(captions, track)
    expect(remapped.startUs + remapped.durationUs).toBe(s(4))
  })

  it("returns captions in timeline order", () => {
    const track = spine([
      videoElement({
        id: "a",
        startUs: us(0),
        trimStartUs: us(0),
        trimEndUs: s(10),
        durationUs: s(10),
      }),
    ])

    const captions = [
      caption(
        [token({ id: "second", sourceStartUs: s(5), sourceEndUs: s(5.2) })],
        s(5)
      ),
      caption(
        [token({ id: "first", sourceStartUs: s(1), sourceEndUs: s(1.2) })],
        s(1)
      ),
    ]

    expect(remapCaptions(captions, track).map((c) => c.startUs)).toEqual([
      s(1),
      s(5),
    ])
  })
})

describe("speechRegions", () => {
  it("bridges the pause between words in a sentence", () => {
    // Without bridging, the music bed pumps back up on every breath.
    const captions = [
      caption([token({ id: "a", startUs: us(0), endUs: s(0.3) })], us(0)),
      caption([token({ id: "b", startUs: us(0), endUs: s(0.3) })], s(0.5)),
    ]

    expect(speechRegions(captions, s(0.4))).toEqual([
      { startUs: 0, endUs: s(0.8) },
    ])
  })

  it("keeps a real pause as two regions", () => {
    const captions = [
      caption([token({ id: "a", startUs: us(0), endUs: s(0.3) })], us(0)),
      caption([token({ id: "b", startUs: us(0), endUs: s(0.3) })], s(4)),
    ]

    expect(speechRegions(captions, s(0.4))).toHaveLength(2)
  })

  it("returns nothing when there is no speech", () => {
    expect(speechRegions([], s(0.4))).toEqual([])
  })
})

describe("trackEndUs", () => {
  it("measures to the end of the last element, not the count", () => {
    const track = spine([
      videoElement({ id: "a", startUs: us(0), durationUs: s(2) }),
      videoElement({ id: "b", startUs: s(10), durationUs: s(3) }),
    ])

    expect(trackEndUs(track)).toBe(s(13))
  })

  it("is zero for an empty track", () => {
    expect(trackEndUs(spine([]))).toBe(0)
  })
})
