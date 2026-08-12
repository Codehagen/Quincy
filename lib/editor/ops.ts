import { createIdGenerator } from "ai"

import { changedPaths, createProvenance, stampFields } from "./provenance"
import { rippleTrack, sceneDurationUs } from "./timeline"
import type {
  Author,
  Effect,
  Keyframe,
  ProjectSnapshot,
  Scene,
  TimelineElement,
  Track,
  VideoDocument,
} from "./types"

const newElementId = createIdGenerator({ prefix: "ve", size: 16 })
const newTrackId = createIdGenerator({ prefix: "vt", size: 16 })
const newEffectId = createIdGenerator({ prefix: "vfx", size: 16 })
const newKeyframeId = createIdGenerator({ prefix: "vk", size: 16 })

/**
 * Every change to a document is one of these.
 *
 * This is the vocabulary the agent's tools compile down to, the payload that
 * streams to the browser, and the unit of undo. Keeping it a closed set is what
 * lets all three agree: a generic JSON patch would let the agent express edits
 * the timeline cannot render and undo cannot reverse.
 *
 * Ops carry their author so provenance is stamped by the reducer rather than by
 * every caller. A caller that forgets is the bug that quietly breaks undo, so
 * there is no path that can forget.
 */
export type EditOp =
  /**
   * Scene-level properties: the name, and the canvas the cut is framed in.
   *
   * The canvas is here rather than in `update_settings` because it is per-scene
   * — the atomiser turns one wide pillar into several cuts that are framed
   * differently, over the same tracks. Reframing is an edit like any other, so
   * it lands in a revision, carries an author, and undoes.
   */
  | { op: "update_scene"; sceneId: string; patch: ScenePatch }
  | { op: "add_track"; sceneId: string; track: Omit<Track, "id">; id?: string }
  | { op: "remove_track"; sceneId: string; trackId: string }
  | { op: "update_track"; sceneId: string; trackId: string; patch: TrackPatch }
  | {
      op: "insert_element"
      sceneId: string
      trackId: string
      element: TimelineElement
    }
  | {
      op: "remove_element"
      sceneId: string
      trackId: string
      elementId: string
    }
  | {
      op: "update_element"
      sceneId: string
      trackId: string
      elementId: string
      patch: Record<string, unknown>
    }
  /**
   * Replace a track's contents wholesale.
   *
   * Captions need this. Word-by-word on a 90 second talk is a few hundred
   * elements, and expressing that as a few hundred inserts would stream a few
   * hundred patches to redraw the same lane once.
   */
  | {
      op: "replace_elements"
      sceneId: string
      trackId: string
      elements: TimelineElement[]
    }
  | { op: "update_settings"; patch: Partial<VideoDocument["settings"]> }
  | { op: "rename"; name: string }

export type TrackPatch = Partial<Pick<Track, "name" | "muted" | "hidden">>

export type ScenePatch = Partial<Pick<Scene, "name" | "canvas">>

export type AppliedOp = {
  snapshot: ProjectSnapshot
  /** What actually moved, for the client to reconcile against. */
  touched: { trackIds: string[]; elementIds: string[] }
}

export class RevisionConflictError extends Error {
  constructor(
    readonly expected: number,
    readonly actual: number
  ) {
    super(`Document moved: expected revision ${expected}, found ${actual}`)
    this.name = "RevisionConflictError"
  }
}

export class DocumentLockedError extends Error {
  constructor(readonly runId: string) {
    super(`Document is locked by run ${runId}`)
    this.name = "DocumentLockedError"
  }
}

/**
 * Apply a batch of ops as one revision.
 *
 * Batching matters for more than efficiency. "Remove silences" produces one cut
 * per gap, and applying them one revision at a time would let the client render
 * a half-cut timeline — clips shifting under the playhead while more arrive.
 * One revision means the user sees the edit, not the process.
 *
 * `expectedRevision` is optimistic concurrency: state what you read, and lose if
 * the document moved. The agent reads at the start of a run and writes at the
 * end, so without this a slow run would silently discard the drag you did while
 * it was thinking.
 */
export function applyOps(
  snapshot: ProjectSnapshot,
  ops: EditOp[],
  options: { author: Author; expectedRevision?: number; runId?: string }
): AppliedOp {
  const { author, expectedRevision, runId } = options

  if (
    expectedRevision !== undefined &&
    expectedRevision !== snapshot.revision
  ) {
    throw new RevisionConflictError(expectedRevision, snapshot.revision)
  }

  // A held lock admits only its own run. The user's own edits are refused for
  // the seconds a run takes, which is the deliberate tradeoff in ./types.ts.
  if (snapshot.lock.status === "locked" && snapshot.lock.runId !== runId) {
    throw new DocumentLockedError(snapshot.lock.runId)
  }

  let document = snapshot.document
  const trackIds = new Set<string>()
  const elementIds = new Set<string>()

  for (const op of ops) {
    document = applyOne(document, op, author, trackIds, elementIds)
  }

  document = {
    ...document,
    metadata: {
      ...document.metadata,
      durationUs: documentDurationUs(document),
      updatedAt: new Date().toISOString(),
    },
  }

  return {
    snapshot: { ...snapshot, document, revision: snapshot.revision + 1 },
    touched: { trackIds: [...trackIds], elementIds: [...elementIds] },
  }
}

function applyOne(
  document: VideoDocument,
  op: EditOp,
  author: Author,
  trackIds: Set<string>,
  elementIds: Set<string>
): VideoDocument {
  switch (op.op) {
    case "rename":
      return { ...document, metadata: { ...document.metadata, name: op.name } }

    case "update_settings":
      return { ...document, settings: { ...document.settings, ...op.patch } }

    case "update_scene":
      return mapScene(document, op.sceneId, (scene) => ({
        ...scene,
        ...op.patch,
      }))

    case "add_track": {
      const id = op.id ?? newTrackId()
      trackIds.add(id)
      return mapScene(document, op.sceneId, (scene) => ({
        ...scene,
        tracks: [...scene.tracks, { ...op.track, id }],
      }))
    }

    case "remove_track": {
      trackIds.add(op.trackId)
      return mapScene(document, op.sceneId, (scene) => ({
        ...scene,
        tracks: scene.tracks.filter((track) => track.id !== op.trackId),
      }))
    }

    case "update_track": {
      trackIds.add(op.trackId)
      return mapTrack(document, op.sceneId, op.trackId, (track) => ({
        ...track,
        ...op.patch,
      }))
    }

    case "insert_element": {
      trackIds.add(op.trackId)
      elementIds.add(op.element.id)
      return mapTrack(document, op.sceneId, op.trackId, (track) => ({
        ...track,
        elements: sortElements([
          ...track.elements,
          {
            ...op.element,
            provenance: op.element.provenance ?? createProvenance(author),
          },
        ]),
      }))
    }

    case "remove_element": {
      trackIds.add(op.trackId)
      elementIds.add(op.elementId)
      return mapTrack(document, op.sceneId, op.trackId, (track) => ({
        ...track,
        elements: track.elements.filter((el) => el.id !== op.elementId),
      }))
    }

    case "update_element": {
      trackIds.add(op.trackId)
      elementIds.add(op.elementId)
      return mapTrack(document, op.sceneId, op.trackId, (track) => ({
        ...track,
        elements: sortElements(
          track.elements.map((element) => {
            if (element.id !== op.elementId) return element

            const merged = { ...element, ...op.patch } as TimelineElement
            // Diff rather than trusting the patch keys: setting volume to the
            // value it already held is not an edit, and stamping it would
            // repaint an untouched clip as the agent's work.
            const paths = changedPaths(element, merged)

            return {
              ...merged,
              provenance: stampFields(element.provenance, author, paths),
            } as TimelineElement
          })
        ),
      }))
    }

    case "replace_elements": {
      trackIds.add(op.trackId)
      for (const element of op.elements) elementIds.add(element.id)
      return mapTrack(document, op.sceneId, op.trackId, (track) => ({
        ...track,
        elements: sortElements(op.elements),
      }))
    }
  }
}

/**
 * Elements stay sorted by start, which the rest of the editor relies on rather
 * than re-establishing. Ties break on id so the order is stable across saves —
 * two captions starting on the same frame must not swap places between renders.
 */
function sortElements(elements: TimelineElement[]): TimelineElement[] {
  return [...elements].sort(
    (a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id)
  )
}

function mapScene(
  document: VideoDocument,
  sceneId: string,
  fn: (scene: Scene) => Scene
): VideoDocument {
  return {
    ...document,
    scenes: document.scenes.map((scene) =>
      scene.id === sceneId ? fn(scene) : scene
    ),
  }
}

function mapTrack(
  document: VideoDocument,
  sceneId: string,
  trackId: string,
  fn: (track: Track) => Track
): VideoDocument {
  return mapScene(document, sceneId, (scene) => ({
    ...scene,
    tracks: scene.tracks.map((track) =>
      track.id === trackId ? fn(track) : track
    ),
  }))
}

function documentDurationUs(document: VideoDocument) {
  const main =
    document.scenes.find((scene) => scene.isMain) ?? document.scenes[0]
  return main ? sceneDurationUs(main) : (0 as never)
}

/* ── Helpers the agent tools and the UI both build ops with ─────────────── */

export function newElement<T extends TimelineElement>(
  element: Omit<T, "id" | "provenance"> & { id?: string },
  author: Author
): T {
  return {
    ...element,
    id: element.id ?? newElementId(),
    provenance: createProvenance(author),
  } as T
}

/**
 * An effect, with an id its animation channels can be keyed against.
 *
 * The id is the whole point of minting it here rather than inline: a channel
 * path is `effects.<id>.params.<key>`, so an effect whose id was assigned by
 * one caller and referenced by another is a curve that animates nothing. Both
 * come from the same place, once.
 */
export function newEffect(
  type: Effect["type"],
  params: Record<string, number>,
  id?: string
): Effect {
  return { id: id ?? newEffectId(), type, enabled: true, params }
}

export function newKeyframe(
  key: Omit<Keyframe, "id"> & { id?: string }
): Keyframe {
  return { ...key, id: key.id ?? newKeyframeId() }
}

/**
 * Close the gaps on a track and emit the ops that do it.
 *
 * The move after any cut on the main spine: removing a silence leaves a hole,
 * and everything downstream slides left by exactly its length. Returned as ops
 * rather than applied directly so the whole tightening lands in one revision
 * with the removals that caused it.
 */
export function rippleOps(scene: Scene, trackId: string): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  if (!track) return []

  return rippleTrack(track).map((element) => ({
    op: "update_element",
    sceneId: scene.id,
    trackId,
    elementId: element.id,
    patch: { startUs: element.startUs },
  }))
}
