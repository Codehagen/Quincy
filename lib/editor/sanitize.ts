import { clipRate } from "./timeline"
import type { Scene, TimelineElement, VideoDocument } from "./types"

/**
 * A stored document made safe to open.
 *
 * Every write goes through ops that keep times whole and windows inside their
 * source, so a document that breaks these rules came from somewhere else: a
 * row edited by hand, a version before a rule existed, a client with a bug.
 * Opening one should not be how the editor finds out — a NaN start puts every
 * later clip at NaN, and a trim past the end of the footage plays black.
 *
 * Repairs only what cannot be right and leaves the rest alone. Returns the
 * same object when nothing needed repair, so callers can compare by identity.
 */

/** How far a trim may run past the source's known end before it is pulled back. */
const SOURCE_SLACK_US = 60_000_000

const whole = (value: unknown, fallback = 0): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.round(value))
    : fallback

export function sanitizeDocument(document: VideoDocument): VideoDocument {
  let changed = false

  const scenes = document.scenes.map((scene) => {
    const repaired = sanitizeScene(scene)
    if (repaired !== scene) changed = true
    return repaired
  })

  const currentSceneId = scenes.some(
    (scene) => scene.id === document.currentSceneId
  )
    ? document.currentSceneId
    : ((scenes.find((scene) => scene.isMain) ?? scenes[0])?.id ??
      document.currentSceneId)
  if (currentSceneId !== document.currentSceneId) changed = true

  const durationUs = whole(document.metadata.durationUs)
  if (durationUs !== document.metadata.durationUs) changed = true

  if (!changed) return document
  return {
    ...document,
    scenes,
    currentSceneId,
    metadata: {
      ...document.metadata,
      durationUs: durationUs as VideoDocument["metadata"]["durationUs"],
    },
  }
}

function sanitizeScene(scene: Scene): Scene {
  let changed = false
  const tracks = scene.tracks.map((track) => {
    let trackChanged = false
    const elements = track.elements.map((element) => {
      const repaired = sanitizeElement(element)
      if (repaired !== element) trackChanged = true
      return repaired
    })
    if (!trackChanged) return track
    changed = true
    return { ...track, elements }
  })
  return changed ? { ...scene, tracks } : scene
}

function sanitizeElement(element: TimelineElement): TimelineElement {
  const startUs = whole(element.startUs)
  let durationUs = whole(element.durationUs)

  if (element.kind !== "video") {
    if (startUs === element.startUs && durationUs === element.durationUs)
      return element
    return { ...element, startUs, durationUs } as TimelineElement
  }

  const sourceUs = whole(element.sourceDurationUs, Number.POSITIVE_INFINITY)
  const limit = sourceUs + SOURCE_SLACK_US
  let trimStartUs = Math.min(
    whole(element.trimStartUs),
    Number.isFinite(sourceUs) ? sourceUs : Infinity
  )
  let trimEndUs = whole(element.trimEndUs, trimStartUs + durationUs)
  if (trimEndUs > limit)
    trimEndUs = Number.isFinite(sourceUs) ? sourceUs : trimEndUs
  if (trimEndUs <= trimStartUs) {
    trimEndUs = trimStartUs + durationUs
    if (Number.isFinite(sourceUs) && trimEndUs > sourceUs) {
      trimEndUs = sourceUs
      trimStartUs = Math.max(0, sourceUs - durationUs)
    }
  }
  if (durationUs === 0)
    durationUs = Math.round((trimEndUs - trimStartUs) / clipRate(element))

  if (
    startUs === element.startUs &&
    durationUs === element.durationUs &&
    trimStartUs === element.trimStartUs &&
    trimEndUs === element.trimEndUs
  ) {
    return element
  }
  return {
    ...element,
    startUs,
    durationUs,
    trimStartUs,
    trimEndUs,
  } as TimelineElement
}
