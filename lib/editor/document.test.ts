import { describe, expect, it } from "vitest"

import {
  canvasForSource,
  documentForAsset,
  LANDSCAPE_CANVAS,
  SQUARE_CANVAS,
  VERTICAL_CANVAS,
} from "./document"
import { findMainTrack } from "./timeline"
import { secondsToUs } from "./time"

const asset = {
  id: "va-1",
  filename: "IMG_8762.MOV",
  durationUs: secondsToUs(144.553),
  width: 3840,
  height: 2160,
  fps: 30,
  rotation: 0,
}

describe("canvasForSource", () => {
  it("opens a wide recording wide", () => {
    // The pillar recording is a webcam, a screen share, a camera on a tripod.
    // Opening it 9:16 greets you with your own footage cropped by a machine
    // that has not been told what matters in the frame.
    expect(canvasForSource({ width: 3840, height: 2160 })).toEqual(
      LANDSCAPE_CANVAS
    )
  })

  it("opens a portrait recording vertical", () => {
    expect(canvasForSource({ width: 1080, height: 1920 })).toEqual(
      VERTICAL_CANVAS
    )
  })

  it("reads a sideways phone by its display shape, not its stored one", () => {
    // The single most common footage there is: stored 1920x1080 with rotation
    // 90, displayed 1080x1920. Reading the stored dimensions opens a portrait
    // recording in a landscape canvas and pillarboxes it on both sides.
    expect(
      canvasForSource({ width: 1920, height: 1080, rotation: 90 })
    ).toEqual(VERTICAL_CANVAS)

    expect(
      canvasForSource({ width: 1920, height: 1080, rotation: 270 })
    ).toEqual(VERTICAL_CANVAS)
  })

  it("leaves 180 alone, which only flips", () => {
    // Upside down is still landscape. Swapping the axes here would be a bug
    // that only shows up on footage shot with the phone inverted.
    expect(
      canvasForSource({ width: 1920, height: 1080, rotation: 180 })
    ).toEqual(LANDSCAPE_CANVAS)
  })

  it("calls a roughly square source square", () => {
    expect(canvasForSource({ width: 1080, height: 1080 })).toEqual(
      SQUARE_CANVAS
    )
  })

  it("treats 4:3 as wide", () => {
    // A 1440x1080 camera and a 1920x1080 one are both "wide" to every decision
    // downstream, and a canvas per source aspect means an export preset per
    // source aspect.
    expect(canvasForSource({ width: 1440, height: 1080 })).toEqual(
      LANDSCAPE_CANVAS
    )
  })

  it("falls back to landscape when the probe found nothing", () => {
    // A container with no dimensions still has to open somewhere, and a zero
    // would divide.
    expect(canvasForSource({ width: 0, height: 0 })).toEqual(LANDSCAPE_CANVAS)
  })
})

describe("documentForAsset", () => {
  it("puts one untrimmed clip on the spine", () => {
    // The opening state is deliberately boring: your footage as you shot it,
    // and every difference from that is something someone did.
    const document = documentForAsset(asset)
    const main = findMainTrack(document.scenes[0])

    expect(main?.elements).toHaveLength(1)

    const [clip] = main!.elements
    expect(clip.startUs).toBe(0)
    expect(clip.durationUs).toBe(asset.durationUs)
    expect(clip).toMatchObject({
      kind: "video",
      mediaId: "va-1",
      trimStartUs: 0,
      trimEndUs: asset.durationUs,
    })
  })

  it("credits the import to the user", () => {
    // So undoing an agent run does not take your own import with it.
    const document = documentForAsset(asset)
    const [clip] = findMainTrack(document.scenes[0])!.elements

    expect(clip.provenance.createdBy).toBe("user")
  })

  it("opens at the shape of the footage", () => {
    expect(documentForAsset(asset).settings.canvas).toEqual(LANDSCAPE_CANVAS)

    expect(
      documentForAsset({ ...asset, width: 1080, height: 1920 }).settings.canvas
    ).toEqual(VERTICAL_CANVAS)
  })

  it("leaves the caption lane empty even when there is a transcript", () => {
    // Captions are an edit. Burning them in at import means the first thing you
    // see is a style choice nobody made.
    const captions = documentForAsset(asset).scenes[0].tracks.find(
      (track) => track.kind === "caption"
    )

    expect(captions).toBeDefined()
    expect(captions?.elements).toEqual([])
  })

  it("never carries a zero frame rate", () => {
    // A container with no rate is common — screen recordings, streams saved to
    // disk — and zero makes every frame-snapping calculation a division by it.
    expect(documentForAsset({ ...asset, fps: 0 }).settings.fps).toBe(30)
    expect(documentForAsset({ ...asset, fps: null }).settings.fps).toBe(30)
  })

  it("names the project after the file, minus the extension", () => {
    expect(documentForAsset(asset).metadata.name).toBe("IMG_8762")
    expect(
      documentForAsset({ ...asset, filename: ".hidden" }).metadata.name
    ).toBe("Untitled")
  })

  it("records the duration so a project list need not load scenes", () => {
    expect(documentForAsset(asset).metadata.durationUs).toBe(asset.durationUs)
  })
})
