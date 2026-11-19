import { createScene } from "./document"
import { applyOps, newElement, type EditOp } from "./ops"
import { findMainTrack } from "./timeline"
import { secondsToUs, us } from "./time"
import {
  UNLOCKED,
  type Scene,
  type VideoDocument,
  type VideoElement,
} from "./types"

/** Three ten-second clips of one take on the spine, back to back. Tests only. */
export function threeClipScene(): Scene {
  const base = createScene({})
  const main = findMainTrack(base)!
  main.elements = [0, 1, 2].map((index) =>
    newElement<VideoElement>(
      {
        kind: "video",
        name: `clip ${index}`,
        mediaId: "va-1",
        startUs: secondsToUs(index * 10),
        durationUs: secondsToUs(10),
        trimStartUs: secondsToUs(index * 10),
        trimEndUs: secondsToUs(index * 10 + 10),
        sourceDurationUs: secondsToUs(60),
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
      },
      "user"
    )
  )
  return base
}

export function documentOf(scene: Scene): VideoDocument {
  return {
    version: 1,
    metadata: {
      id: "vp-1",
      name: "t",
      durationUs: us(0),
      createdAt: "",
      updatedAt: "",
    },
    settings: {
      fps: 30,
      canvas: { width: 1920, height: 1080 },
      background: { type: "color", color: "#000" },
    },
    scenes: [scene],
    currentSceneId: scene.id,
  } as VideoDocument
}

/** Apply ops to a document as a person would, and return the result. */
export function applyAsUser(
  document: VideoDocument,
  ops: EditOp[]
): VideoDocument {
  return applyOps({ document, revision: 0, lock: UNLOCKED }, ops, {
    author: "user",
  }).snapshot.document
}
