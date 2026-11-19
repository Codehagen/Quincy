import { cornerBox, FULL_FRAME, isFullFrame, sideBySide } from "./box"
import type { EditOp } from "./ops"
import type { Box, ImageElement, Scene, VideoElement } from "./types"

/**
 * Where a picture sits on the frame: the whole frame, a corner (picture in
 * picture), or one half of two side by side. Stored as a box on the element
 * (types.ts `Box`), so the preview handles and these presets are one field.
 */

export type LayoutKey =
  | "full"
  | "top_left"
  | "top_right"
  | "bottom_left"
  | "bottom_right"
  | "left"
  | "right"

export const LAYOUTS: { key: LayoutKey; label: string }[] = [
  { key: "full", label: "Full frame" },
  { key: "top_left", label: "Top left" },
  { key: "top_right", label: "Top right" },
  { key: "bottom_left", label: "Bottom left" },
  { key: "bottom_right", label: "Bottom right" },
  { key: "left", label: "Left half" },
  { key: "right", label: "Right half" },
]

export function layoutBox(
  key: LayoutKey,
  options: { canvasAspect: number; sourceAspect: number }
): Box {
  switch (key) {
    case "full":
      return FULL_FRAME
    case "left":
    case "right":
      return sideBySide(key)
    default:
      return cornerBox(key, options)
  }
}

/** Put a box on a clip or picture; the whole frame clears it. */
export function setBox(
  scene: Scene,
  trackId: string,
  elementId: string,
  box: Box
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find((candidate) => candidate.id === elementId)
  if (!element || (element.kind !== "video" && element.kind !== "image")) return []
  const current = (element as VideoElement | ImageElement).box
  const next = isFullFrame(box) ? null : roundBox(box)
  if (next === null && isFullFrame(current)) return []
  if (
    next &&
    current &&
    next.x === current.x &&
    next.y === current.y &&
    next.width === current.width &&
    next.height === current.height
  )
    return []
  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId,
      elementId,
      patch: { box: next },
      target: { action: "press", kind: "element", trackId, elementId },
    },
  ]
}

function roundBox(box: Box): Box {
  const r = (value: number) => Math.round(value * 10_000) / 10_000
  return { x: r(box.x), y: r(box.y), width: r(box.width), height: r(box.height) }
}
