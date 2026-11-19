import type { Box } from "./types"

/**
 * Moving and sizing a picture on the preview, in fractions of the canvas.
 *
 * Pure so the handles on the preview and the agent's layouts share one set of
 * rules. Snapping is to the frame: its edges and its centre lines, within a
 * few screen pixels. Shift turns it off. Corners keep the aspect, edges
 * stretch one side.
 */

export const FULL_FRAME: Box = { x: 0, y: 0, width: 1, height: 1 }

/** Screen pixels within which a box edge or centre snaps to the frame. */
export const BOX_SNAP_PX = 8

/** The smallest a box may get, as a fraction of the frame. */
export const MIN_BOX = 0.05

export type SnapGuide = { axis: "x" | "y"; at: number }

const LINES = [0, 0.5, 1]

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value))
}

/** Snap the box's left/centre/right (or top/middle/bottom) to the frame. */
function snapAxis(
  start: number,
  size: number,
  threshold: number
): { start: number; guide: number | null } {
  let best: { start: number; guide: number; distance: number } | null = null
  for (const line of LINES) {
    for (const anchor of [0, 0.5, 1]) {
      const at = start + size * anchor
      const distance = Math.abs(at - line)
      if (distance <= threshold && (!best || distance < best.distance)) {
        best = { start: line - size * anchor, guide: line, distance }
      }
    }
  }
  return best ? { start: best.start, guide: best.guide } : { start, guide: null }
}

export function moveBox(
  box: Box,
  delta: { x: number; y: number },
  options: { threshold?: number; snap?: boolean } = {}
): { box: Box; guides: SnapGuide[] } {
  const threshold = options.threshold ?? 0.01
  let x = box.x + delta.x
  let y = box.y + delta.y
  const guides: SnapGuide[] = []
  if (options.snap !== false) {
    const sx = snapAxis(x, box.width, threshold)
    const sy = snapAxis(y, box.height, threshold)
    x = sx.start
    y = sy.start
    if (sx.guide !== null) guides.push({ axis: "x", at: sx.guide })
    if (sy.guide !== null) guides.push({ axis: "y", at: sy.guide })
  }
  // Allowed partly off the frame, never wholly: a box you cannot grab back
  // is a picture you cannot fix.
  x = clamp(x, -box.width + MIN_BOX, 1 - MIN_BOX)
  y = clamp(y, -box.height + MIN_BOX, 1 - MIN_BOX)
  return { box: { ...box, x, y }, guides }
}

export type Handle = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w"

/**
 * Resize from a handle. Corners keep the aspect the box had when the drag
 * started (`aspect` = width / height in canvas pixels); edges change one side.
 */
export function resizeBox(
  box: Box,
  handle: Handle,
  delta: { x: number; y: number },
  options: { aspect?: number; canvasAspect?: number } = {}
): Box {
  let { x, y, width, height } = box
  const west = handle.includes("w")
  const east = handle.includes("e")
  const north = handle.startsWith("n")
  const south = handle.startsWith("s")

  if (east) width += delta.x
  if (west) {
    width -= delta.x
    x += delta.x
  }
  if (south) height += delta.y
  if (north) {
    height -= delta.y
    y += delta.y
  }

  const corner = (west || east) && (north || south)
  if (corner) {
    // Keep the shape: the box's aspect in canvas pixels, converted into
    // fractions with the canvas's own.
    const canvasAspect = options.canvasAspect ?? 16 / 9
    const aspect = options.aspect ?? (box.width * canvasAspect) / box.height
    const ratio = aspect / canvasAspect // width fraction per height fraction
    const byWidth = Math.abs(width - box.width) >= Math.abs(height - box.height) * ratio
    if (byWidth) {
      const nextHeight = width / ratio
      if (north) y = box.y + box.height - nextHeight
      height = nextHeight
    } else {
      const nextWidth = height * ratio
      if (west) x = box.x + box.width - nextWidth
      width = nextWidth
    }
  }

  if (width < MIN_BOX) {
    if (west) x -= MIN_BOX - width
    width = MIN_BOX
  }
  if (height < MIN_BOX) {
    if (north) y -= MIN_BOX - height
    height = MIN_BOX
  }
  return { x, y, width, height }
}

/** Corner presets for picture in picture, a quarter of the frame wide. */
export function cornerBox(
  corner: "top_left" | "top_right" | "bottom_left" | "bottom_right",
  options: { size?: number; margin?: number; canvasAspect?: number; sourceAspect?: number } = {}
): Box {
  const size = options.size ?? 0.3
  const margin = options.margin ?? 0.04
  const canvasAspect = options.canvasAspect ?? 16 / 9
  const sourceAspect = options.sourceAspect ?? 16 / 9
  const width = size
  const height = (size * canvasAspect) / sourceAspect
  const marginY = margin * canvasAspect
  const x = corner.endsWith("left") ? margin : 1 - width - margin
  const y = corner.startsWith("top") ? marginY : 1 - height - marginY
  return { x, y, width, height }
}

/** Two halves of the frame, for two people side by side. */
export function sideBySide(side: "left" | "right"): Box {
  return { x: side === "left" ? 0 : 0.5, y: 0, width: 0.5, height: 1 }
}

export function isFullFrame(box: Box | undefined): boolean {
  return (
    !box ||
    (box.x === 0 && box.y === 0 && box.width === 1 && box.height === 1)
  )
}
