import { insertOnSpine } from "./edits"
import { newElement, type EditOp } from "./ops"
import { placeElement } from "./placement"
import { us } from "./time"
import type { Scene, TimelineElement, VideoElement } from "./types"

/**
 * Copy, paste and duplicate on the timeline.
 *
 * The clipboard holds an element, not a reference: a clip copied and then
 * cut out of the spine still pastes. It lives in the editor, not the system
 * clipboard, because a clip is not text and nothing outside Quincy can use
 * it.
 *
 * The spine and the lanes over it answer differently, for the reason every
 * spine edit does: the spine is the cut, so a clip pasted into it pushes
 * what follows along (insertOnSpine); a picture or a title pasted over it
 * lands at the playhead on a lane where it fits, and a new lane when none
 * does (placement.ts), so nothing is covered.
 */

export type ClipboardItem = { element: TimelineElement; fromSpine: boolean }

/** Where an element sits, and whether that is the spine. */
export function locateElement(
  scene: Scene,
  elementId: string
): { element: TimelineElement; trackId: string; onSpine: boolean } | null {
  for (const track of scene.tracks) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (element)
      return { element, trackId: track.id, onSpine: Boolean(track.isMain) }
  }
  return null
}

export function copyElement(
  scene: Scene,
  elementId: string
): ClipboardItem | null {
  const found = locateElement(scene, elementId)
  if (!found || found.element.kind === "caption") return null
  return { element: found.element, fromSpine: found.onSpine }
}

/** Paste at an instant. A spine clip goes back into the spine. */
export function pasteElement(
  scene: Scene,
  item: ClipboardItem,
  atUs: number
): EditOp[] {
  const at = Math.max(0, Math.round(atUs))
  if (item.fromSpine && item.element.kind === "video") {
    return insertOnSpine(scene, item.element as VideoElement, at)
  }
  const copy = freshCopy(item.element, at)
  return placeElement(scene, copy)
}

/**
 * A copy right after the original: on the spine it follows the clip and the
 * rest moves along; over it, it starts where the original ends, on the same
 * lane when there is room.
 */
export function duplicateElement(scene: Scene, elementId: string): EditOp[] {
  const found = locateElement(scene, elementId)
  if (!found || found.element.kind === "caption") return []
  const end = found.element.startUs + found.element.durationUs

  if (found.onSpine && found.element.kind === "video") {
    return insertOnSpine(scene, found.element as VideoElement, end)
  }
  const copy = freshCopy(found.element, end)
  return placeElement(scene, copy, { preferTrackId: found.trackId })
}

/** The same element with a new id, a person's provenance, at a new start. */
function freshCopy(element: TimelineElement, startUs: number): TimelineElement {
  const { id: _id, provenance: _provenance, ...rest } = element
  return newElement<TimelineElement>({ ...rest, startUs: us(startUs) }, "user")
}
