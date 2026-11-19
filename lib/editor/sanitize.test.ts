import { describe, expect, it } from "vitest"

import { createDocument } from "./document"
import { newElement } from "./ops"
import { sanitizeDocument } from "./sanitize"
import { findMainTrack } from "./timeline"
import { us } from "./time"
import type { VideoDocument, VideoElement } from "./types"

function withClip(fields: Partial<VideoElement>): VideoDocument {
  const document = createDocument({ name: "Take" })
  const main = findMainTrack(document.scenes[0])!
  main.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: "take.mp4",
        mediaId: "m",
        startUs: us(0),
        durationUs: us(10_000_000),
        trimStartUs: us(0),
        trimEndUs: us(10_000_000),
        sourceDurationUs: us(10_000_000),
        transform: {
          position: { x: 0, y: 0 },
          scaleX: 1,
          scaleY: 1,
          rotate: 0,
        },
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
        ...fields,
      },
      "user"
    ),
  ]
  return document
}

const clipOf = (document: VideoDocument) =>
  findMainTrack(document.scenes[0])!.elements[0] as VideoElement

describe("sanitizeDocument", () => {
  it("returns a sound document as the same object", () => {
    const document = withClip({})
    expect(sanitizeDocument(document)).toBe(document)
  })

  it("repairs times that cannot be right", () => {
    const repaired = clipOf(
      sanitizeDocument(
        withClip({
          startUs: Number.NaN as never,
          trimStartUs: -5 as never,
          trimEndUs: us(500_000_000),
        })
      )
    )
    expect(repaired.startUs).toBe(0)
    expect(repaired.trimStartUs).toBe(0)
    expect(repaired.trimEndUs).toBe(10_000_000)
  })

  it("points a missing current scene at the main one", () => {
    const document = { ...withClip({}), currentSceneId: "gone" }
    expect(sanitizeDocument(document).currentSceneId).toBe(
      document.scenes[0].id
    )
  })
})
