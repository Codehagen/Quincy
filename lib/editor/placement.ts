import { createIdGenerator } from "ai"

import { createTrack } from "./document"
import { newElement, type EditOp } from "./ops"
import { findMainTrack, sceneDurationUs } from "./timeline"
import { us } from "./time"
import type {
  AudioElement,
  Author,
  ImageElement,
  Scene,
  TimelineElement,
  Track,
  TrackKind,
  VideoElement,
} from "./types"

/**
 * Where a thing lands when it is dropped, pasted or placed by Quincy.
 *
 * One pure function answers two questions before any op is built: which
 * track, and whether that track has to be made first. The drop in the lanes,
 * the library's Add button and the agent's `place_media` all call it, so a
 * hand and Quincy put the same thing in the same place.
 *
 * The rules:
 *
 * - Each element kind has one track kind. A picture over the cut is b-roll,
 *   a music bed is audio, a title is text.
 * - Tracks paint in document order, later on top. So the spine comes first,
 *   b-roll over it, text over that, captions over everything they could be
 *   hidden behind, and audio last (it paints nothing).
 * - Elements on one track never overlap. A span that does not fit on any
 *   track of its kind gets a new track rather than covering what is there.
 */

const newTrackId = createIdGenerator({ prefix: "vt", size: 16 })

/** Which lane an element of this kind lives on, off the spine. */
export function trackKindFor(
  kind: TimelineElement["kind"] | "overlay_video"
): TrackKind {
  switch (kind) {
    case "image":
    case "overlay_video":
      return "broll"
    case "audio":
      return "audio"
    case "text":
      return "text"
    case "caption":
      return "caption"
    case "video":
      return "video"
  }
}

/** Paint order: lower draws underneath. Audio draws nothing and goes last. */
const LAYER: Record<TrackKind, number> = {
  video: 0,
  broll: 1,
  graphic: 2,
  text: 3,
  caption: 4,
  audio: 5,
}

/**
 * Where a new track of this kind goes: after the last track that paints at
 * or under its layer, so a second b-roll lane lands over the first and still
 * under the titles.
 */
export function insertIndexFor(scene: Scene, kind: TrackKind): number {
  const layer = LAYER[kind]
  let index = 0
  scene.tracks.forEach((track, position) => {
    if (LAYER[track.kind] <= layer) index = position + 1
  })
  return index
}

export type PlacementSpan = { startUs: number; durationUs: number }

export type Placement =
  | { kind: "existing"; trackId: string }
  | { kind: "new"; trackKind: TrackKind; index: number }

/** Whether a span sits on a track without overlapping what is there. */
export function spanFits(
  track: Track,
  span: PlacementSpan,
  excludeElementId?: string
): boolean {
  const end = span.startUs + span.durationUs
  return track.elements.every(
    (element) =>
      element.id === excludeElementId ||
      element.startUs + element.durationUs <= span.startUs ||
      element.startUs >= end
  )
}

export function resolvePlacement(
  scene: Scene,
  trackKind: TrackKind,
  span: PlacementSpan,
  options: { preferTrackId?: string; excludeElementId?: string } = {}
): Placement {
  const preferred = options.preferTrackId
    ? scene.tracks.find((track) => track.id === options.preferTrackId)
    : undefined
  if (
    preferred &&
    preferred.kind === trackKind &&
    !preferred.isMain &&
    spanFits(preferred, span, options.excludeElementId)
  ) {
    return { kind: "existing", trackId: preferred.id }
  }

  const open = scene.tracks.find(
    (track) =>
      track.kind === trackKind &&
      !track.isMain &&
      spanFits(track, span, options.excludeElementId)
  )
  if (open) return { kind: "existing", trackId: open.id }

  return { kind: "new", trackKind, index: insertIndexFor(scene, trackKind) }
}

/**
 * The ops that put one element where placement says: a new track first when
 * it needs one, then the element. One revision, one undo.
 */
export function placeElement(
  scene: Scene,
  element: TimelineElement,
  options: { preferTrackId?: string; trackName?: string } = {}
): EditOp[] {
  const trackKind = trackKindFor(
    element.kind === "video" ? "overlay_video" : element.kind
  )
  const placement = resolvePlacement(scene, trackKind, element, options)

  const ops: EditOp[] = []
  let trackId: string
  if (placement.kind === "new") {
    trackId = newTrackId()
    const { id: _ignored, ...track } = createTrack(placement.trackKind, {
      ...(options.trackName ? { name: options.trackName } : {}),
    })
    ops.push({
      op: "add_track",
      sceneId: scene.id,
      track,
      id: trackId,
      index: placement.index,
      target: { action: "press", kind: "control", control: "frame" },
    })
  } else {
    trackId = placement.trackId
  }

  ops.push({
    op: "insert_element",
    sceneId: scene.id,
    trackId,
    element,
    // The element does not exist until this lands, so the cursor presses the
    // lane it lands on. A new lane is pressed as the frame: it is not drawn yet.
    target:
      placement.kind === "existing"
        ? { action: "press", kind: "track", trackId }
        : { action: "press", kind: "control", control: "frame" },
  })
  return ops
}

/* ── Media ─────────────────────────────────────────────────────────────── */

/** What placement needs to know about a library item. */
export type PlaceableMedia = {
  id: string
  filename: string
  kind: "video" | "audio" | "image"
  durationUs: number | null
  hasAudio?: boolean
}

/** How long a still sits on the cut when nobody says. */
export const DEFAULT_IMAGE_US = us(4_000_000)

/** The shortest thing placement will put down. */
export const MIN_PLACED_US = us(500_000)

export type PlaceAs = "spine" | "overlay" | "music"

/**
 * Put a library item on the cut.
 *
 * - `spine`: a second take, appended to the end of the main track, sound on.
 * - `overlay`: b-roll or an image over the spine at `atUs`, muted, for
 *   `durationUs` or the media's length.
 * - `music`: an audio bed from `atUs` to the end of the cut, ducked under
 *   speech, at a bed's level.
 */
export function placeMedia(
  scene: Scene,
  media: PlaceableMedia,
  options: {
    as: PlaceAs
    atUs?: number
    durationUs?: number
    author: Author
    preferTrackId?: string
  }
): EditOp[] {
  // The cut is the spine: overlays may run past its end, and a take appended
  // after them would leave a hole in the picture.
  const main = findMainTrack(scene)
  const cutUs = main
    ? us(main.elements.reduce((end, element) => Math.max(end, element.startUs + element.durationUs), 0))
    : sceneDurationUs(scene)
  const sourceUs = media.durationUs ?? 0
  const atUs = us(Math.max(0, Math.round(options.atUs ?? 0)))

  if (options.as === "spine") {
    if (media.kind !== "video" || sourceUs <= 0) return []
    const spine = findMainTrack(scene)
    if (!spine) return []
    const clip = newElement<VideoElement>(
      {
        kind: "video",
        name: media.filename,
        mediaId: media.id,
        startUs: cutUs,
        durationUs: us(sourceUs),
        trimStartUs: us(0),
        trimEndUs: us(sourceUs),
        sourceDurationUs: us(sourceUs),
        transform: IDENTITY,
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      options.author
    )
    return [
      {
        op: "insert_element",
        sceneId: scene.id,
        trackId: spine.id,
        element: clip,
        target: { action: "press", kind: "track", trackId: spine.id },
      },
    ]
  }

  if (options.as === "music") {
    if (media.kind === "image" || sourceUs <= 0) return []
    const room = Math.max(MIN_PLACED_US, (cutUs || sourceUs) - atUs)
    const length = us(Math.min(sourceUs, options.durationUs ?? room))
    const bed = newElement<AudioElement>(
      {
        kind: "audio",
        name: media.filename,
        mediaId: media.id,
        startUs: atUs,
        durationUs: length,
        trimStartUs: us(0),
        trimEndUs: length,
        sourceDurationUs: us(sourceUs),
        volume: MUSIC_BED_VOLUME,
        muted: false,
        ducking: { ...DEFAULT_DUCKING },
        animations: { channels: {} },
      },
      options.author
    )
    return placeElement(scene, bed, {
      preferTrackId: options.preferTrackId,
      trackName: "Music",
    })
  }

  // Overlay.
  if (media.kind === "image") {
    const length = us(
      Math.max(MIN_PLACED_US, Math.round(options.durationUs ?? DEFAULT_IMAGE_US))
    )
    const still = newElement<ImageElement>(
      {
        kind: "image",
        name: media.filename,
        mediaId: media.id,
        startUs: atUs,
        durationUs: length,
        fit: "contain",
        opacity: 1,
        transform: IDENTITY,
        effects: [],
        animations: { channels: {} },
      },
      options.author
    )
    return placeElement(scene, still, { preferTrackId: options.preferTrackId })
  }

  if (media.kind !== "video" || sourceUs <= 0) return []
  const length = us(
    Math.max(
      MIN_PLACED_US,
      Math.min(sourceUs, Math.round(options.durationUs ?? sourceUs))
    )
  )
  const broll = newElement<VideoElement>(
    {
      kind: "video",
      name: media.filename,
      mediaId: media.id,
      startUs: atUs,
      durationUs: length,
      trimStartUs: us(0),
      trimEndUs: length,
      sourceDurationUs: us(sourceUs),
      transform: IDENTITY,
      fit: "cover",
      opacity: 1,
      blendMode: "normal",
      volume: 1,
      // B-roll plays under the voice, not over it.
      muted: true,
      effects: [],
      animations: { channels: {} },
    },
    options.author
  )
  return placeElement(scene, broll, { preferTrackId: options.preferTrackId })
}

/**
 * Move an element to another time, and to another lane of its kind when the
 * pointer says so. Lands where placement allows: on the asked lane when it
 * fits there, else on the first that fits, else on a new one.
 */
export function moveElement(
  scene: Scene,
  trackId: string,
  elementId: string,
  options: { startUs: number; toTrackId?: string }
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find((candidate) => candidate.id === elementId)
  if (!track || !element || track.isMain || element.kind === "caption") return []

  const startUs = us(Math.max(0, Math.round(options.startUs)))
  const span = { startUs, durationUs: element.durationUs }
  const placement = resolvePlacement(scene, track.kind, span, {
    preferTrackId: options.toTrackId ?? trackId,
    excludeElementId: elementId,
  })

  if (placement.kind === "existing" && placement.trackId === trackId) {
    if (startUs === element.startUs) return []
    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId,
        elementId,
        patch: { startUs },
        target: { action: "press", kind: "element", trackId, elementId },
      },
    ]
  }

  const ops: EditOp[] = [
    {
      op: "remove_element",
      sceneId: scene.id,
      trackId,
      elementId,
      target: { action: "press", kind: "element", trackId, elementId },
    },
  ]
  const moved = { ...element, startUs } as TimelineElement
  if (placement.kind === "existing") {
    ops.push({
      op: "insert_element",
      sceneId: scene.id,
      trackId: placement.trackId,
      element: moved,
      target: { action: "press", kind: "track", trackId: placement.trackId },
    })
  } else {
    const id = newTrackId()
    const { id: _ignored, ...fresh } = createTrack(placement.trackKind)
    ops.push(
      {
        op: "add_track",
        sceneId: scene.id,
        track: fresh,
        id,
        index: placement.index,
        target: { action: "press", kind: "control", control: "frame" },
      },
      {
        op: "insert_element",
        sceneId: scene.id,
        trackId: id,
        element: moved,
        target: { action: "press", kind: "control", control: "frame" },
      }
    )
  }
  // A lane left empty by the move goes with it, so the timeline only shows
  // tracks that hold something.
  if (track.elements.length === 1) {
    ops.push({ op: "remove_track", sceneId: scene.id, trackId })
  }
  return ops
}

/** A music bed under a voice: present, never competing. */
export const MUSIC_BED_VOLUME = 0.5

export const DEFAULT_DUCKING = {
  enabled: true,
  amount: 0.35,
  attackUs: us(150_000),
  releaseUs: us(400_000),
}

const IDENTITY = {
  position: { x: 0, y: 0 },
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
}

/** Everything that references media, for the library and the server's URL list. */
export function referencedMediaIds(scenes: Scene[]): string[] {
  const ids = new Set<string>()
  for (const scene of scenes)
    for (const track of scene.tracks)
      for (const element of track.elements)
        if ("mediaId" in element && element.mediaId) ids.add(element.mediaId)
  return [...ids]
}

