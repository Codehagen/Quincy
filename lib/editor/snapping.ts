import type { Scene } from "./types"

/**
 * Where a drag snaps on the timeline.
 *
 * Points are clip edges on every track, the playhead, chapter starts and the
 * edges of spoken words. The last is the one an editor without a transcript
 * cannot offer: a cut or a placement that snaps to a word edge never lands
 * inside a word.
 *
 * The threshold is a distance on screen, converted to time at the current
 * zoom, so snapping feels the same zoomed in and zoomed out.
 */

export type SnapKind = "edge" | "playhead" | "chapter" | "word"

export type SnapPoint = { atUs: number; kind: SnapKind }

export type SnapResult = { atUs: number; point: SnapPoint | null }

/** Screen pixels within which a drag snaps. */
export const SNAP_THRESHOLD_PX = 10

export function snapThresholdUs(pxPerUs: number, px = SNAP_THRESHOLD_PX): number {
  return pxPerUs > 0 ? px / pxPerUs : 0
}

export function snapPoints(
  scene: Scene,
  options: {
    playheadUs?: number
    chaptersUs?: number[]
    wordEdgesUs?: number[]
    /** The element being dragged, whose own edges must not attract it. */
    excludeElementId?: string
  } = {}
): SnapPoint[] {
  const points: SnapPoint[] = [{ atUs: 0, kind: "edge" }]
  for (const track of scene.tracks) {
    if (track.kind === "caption") continue
    for (const element of track.elements) {
      if (element.id === options.excludeElementId) continue
      points.push(
        { atUs: element.startUs, kind: "edge" },
        { atUs: element.startUs + element.durationUs, kind: "edge" }
      )
    }
  }
  if (options.playheadUs !== undefined)
    points.push({ atUs: options.playheadUs, kind: "playhead" })
  for (const atUs of options.chaptersUs ?? [])
    points.push({ atUs, kind: "chapter" })
  for (const atUs of options.wordEdgesUs ?? [])
    points.push({ atUs, kind: "word" })
  return points
}

/** Rank on ties: an edit point beats a word edge at the same distance. */
const RANK: Record<SnapKind, number> = {
  edge: 0,
  playhead: 1,
  chapter: 2,
  word: 3,
}

/**
 * The nearest point within the threshold, or the time unchanged. `disabled`
 * is Shift held: the person asked for exactly where the pointer is.
 */
export function snap(
  atUs: number,
  points: SnapPoint[],
  thresholdUs: number,
  disabled = false
): SnapResult {
  if (disabled || thresholdUs <= 0) return { atUs, point: null }
  let best: SnapPoint | null = null
  let bestDistance = Infinity
  for (const point of points) {
    const distance = Math.abs(point.atUs - atUs)
    if (distance > thresholdUs) continue
    if (
      distance < bestDistance ||
      (distance === bestDistance && best && RANK[point.kind] < RANK[best.kind])
    ) {
      best = point
      bestDistance = distance
    }
  }
  return best ? { atUs: best.atUs, point: best } : { atUs, point: null }
}

/**
 * Snap a span that moves as one (a dragged clip): whichever of its two edges
 * is nearer a point decides, and the span keeps its length.
 */
export function snapSpan(
  startUs: number,
  durationUs: number,
  points: SnapPoint[],
  thresholdUs: number,
  disabled = false
): SnapResult {
  const head = snap(startUs, points, thresholdUs, disabled)
  const tail = snap(startUs + durationUs, points, thresholdUs, disabled)
  const headMoved = head.point ? Math.abs(head.atUs - startUs) : Infinity
  const tailMoved = tail.point
    ? Math.abs(tail.atUs - (startUs + durationUs))
    : Infinity
  if (!head.point && !tail.point) return { atUs: startUs, point: null }
  return headMoved <= tailMoved
    ? head
    : { atUs: tail.atUs - durationUs, point: tail.point }
}
