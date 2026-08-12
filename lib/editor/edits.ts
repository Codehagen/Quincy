import { createIdGenerator } from "ai"

import { effectSpec } from "./effect-catalogue"
import { effectLanding, MIN_EFFECT_US, PRIMARY_PARAM } from "./effect-lane"
import {
  newEffect,
  newElement,
  newKeyframe,
  rippleOps,
  type EditOp,
} from "./ops"
import { stampFields } from "./provenance"
import {
  elementAt,
  findMainTrack,
  layOut,
  remapCaptions,
  splitBySourceRanges,
} from "./timeline"
import { us, type Us, type UsRange } from "./time"
import type {
  Animations,
  Author,
  CaptionElement,
  Effect,
  Keyframe,
  Scene,
  TimelineElement,
  Track,
  VideoElement,
} from "./types"

const newElementId = createIdGenerator({ prefix: "ve", size: 16 })

/**
 * The edits a person makes by hand, as op batches.
 *
 * Pure functions from (scene, intent) to ops, for the same reason the agent's
 * tools compile to ops: one vocabulary, one reducer, one unit of undo. A
 * component that mutated the document directly would produce changes the agent
 * could not express and undo could not reverse.
 *
 * Every one of these returns a *batch*, never a sequence to apply one at a
 * time. A split is two inserts and a remove; applying them separately would let
 * the timeline render a frame where the clip has vanished and its halves have
 * not arrived.
 */

/**
 * Cut a clip in two at an instant on the timeline.
 *
 * The trims are what make this a cut rather than a duplication. The left half
 * keeps the original's `trimStartUs` and ends where the cut fell; the right
 * half starts there and keeps the original's `trimEndUs`. Getting that wrong
 * produces two clips that each play the whole source — which looks right on the
 * timeline and plays as a stutter.
 *
 * Returns an empty batch when the cut falls on a boundary rather than inside a
 * clip. A zero-length clip is not a thing the timeline can render or the user
 * can select, so it must not be creatable.
 */
export function splitAt(
  scene: Scene,
  trackId: string,
  atUs: Us,
  /**
   * Who is cutting. Both halves are new elements, and `applyOps` only stamps
   * an insert whose provenance is absent — `newElement` always sets it, so the
   * author has to arrive here or the reducer's cannot win.
   *
   * Defaulted rather than required because every hand edit passes the same
   * thing, and a required parameter on the most-called edit in the file would
   * be four call sites writing "user".
   */
  author: Author = "user"
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  if (!track) return []

  const element = elementAt(track, atUs)
  if (!element || element.kind !== "video") return []

  const offset = atUs - element.startUs
  if (offset <= 0 || offset >= element.durationUs) return []

  const clip = element as VideoElement

  /**
   * The source instant the cut lands on.
   *
   * Scaled by the ratio between the trim window and the timeline duration,
   * because those are only equal at normal speed — a retimed clip has a
   * different length on the timeline than it occupies in its source, and
   * assuming otherwise puts the cut in the wrong frame on exactly the clips
   * someone cared enough about to retime.
   */
  const sourceSpan = clip.trimEndUs - clip.trimStartUs
  const sourceAt = us(
    Math.round(clip.trimStartUs + (offset / clip.durationUs) * sourceSpan)
  )

  /**
   * `id: undefined` is the load-bearing line here.
   *
   * `newElement` honours an id if it is handed one, and spreading the clip
   * hands it the original's — so both halves came out carrying the id of the
   * clip they replaced. Nothing looks wrong: the timeline draws two clips of
   * the right lengths in the right places. Then `remove_element` matches on id,
   * finds both, and deleting either half deletes the whole cut. It took a
   * duplicate-key warning from React to notice.
   *
   * Provenance needs no such care — newElement overwrites it with the author's
   * — which is why a half cut out of an agent's clip belongs to whoever cut it.
   * That is also why `author` is a parameter and not a constant: it was "user"
   * for as long as only a person could split, and an agent inheriting it would
   * have made its own cuts indistinguishable from the ones it must not undo.
   */
  const left = newElement<VideoElement>(
    {
      ...clip,
      id: undefined,
      durationUs: us(offset),
      trimEndUs: sourceAt,
    },
    author
  )

  const right = newElement<VideoElement>(
    {
      ...clip,
      id: undefined,
      startUs: atUs,
      durationUs: us(element.durationUs - offset),
      trimStartUs: sourceAt,
    },
    author
  )

  return [
    { op: "remove_element", sceneId: scene.id, trackId, elementId: clip.id },
    { op: "insert_element", sceneId: scene.id, trackId, element: left },
    { op: "insert_element", sceneId: scene.id, trackId, element: right },
  ]
}

/**
 * Remove a clip and close the gap behind it.
 *
 * Ripple by default, and not as an option. This is the spine of a talking head:
 * a hole in it is a hole in the cut, and every editor that leaves one makes
 * "delete" a two-step operation where the second step is remembering. The ops
 * that close the gap are computed against the scene *after* the removal, which
 * is why this applies the removal to a local copy first rather than emitting
 * both against the original.
 */
export function deleteAndRipple(
  scene: Scene,
  trackId: string,
  elementId: string
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  if (!track) return []
  if (!track.elements.some((element) => element.id === elementId)) return []

  const without: Scene = {
    ...scene,
    tracks: scene.tracks.map((candidate) =>
      candidate.id === trackId
        ? {
            ...candidate,
            elements: candidate.elements.filter(
              (element) => element.id !== elementId
            ),
          }
        : candidate
    ),
  }

  const remaining = without.tracks.find(
    (candidate) => candidate.id === trackId
  )!.elements

  return [
    { op: "remove_element", sceneId: scene.id, trackId, elementId },
    ...rippleOps(without, trackId),
    ...captionsFollowing(scene, trackId, layOut(remaining)),
  ]
}

/**
 * Cut words out of the recording, wherever they currently sit.
 *
 * What deleting a selection in the transcript means. The ranges arrive in
 * *source* time because that is what a transcript knows — `splitBySourceRanges`
 * says so, and the token binding exists to answer it — so this survives a spine
 * that has already been cut, reordered or tightened. Handing it timeline ranges
 * would work until the first edit moved something.
 *
 * The same primitive silence removal uses, and deliberately: a person deleting
 * a filler word and an agent removing dead air are the same operation on the
 * same footage, and two implementations of it would be two chances to ripple
 * differently. This lives here rather than in tools.ts because it needs no
 * transcript to be fetched — the words are already in the document.
 *
 * Refuses to empty the spine. A selection covering every word is a select-all
 * followed by delete, and answering that with a cut of nothing is worse than
 * answering with nothing at all.
 */
export function deleteSpeech(
  scene: Scene,
  cuts: { mediaId: string; ranges: UsRange[] }[]
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []

  const byMedia = new Map(cuts.map((cut) => [cut.mediaId, cut.ranges]))
  if (byMedia.size === 0) return []

  let changed = false

  const cut = spine.elements.flatMap((element): TimelineElement[] => {
    if (element.kind !== "video") return [element]

    const ranges = byMedia.get(element.mediaId)
    if (!ranges || ranges.length === 0) return [element]

    const pieces = splitBySourceRanges(element, ranges, newElementId)
    // An untouched clip comes back as the same object. Repainting it would
    // stamp somebody's name on a clip they did not edit, and undoing this
    // would leave the whole spine looking hand-cut.
    if (pieces.length === 1 && pieces[0] === element) return pieces

    changed = true

    return pieces.map((piece) => ({
      ...piece,
      provenance: stampFields(piece.provenance, "user", [
        "startUs",
        "durationUs",
        "trimStartUs",
        "trimEndUs",
      ]),
    }))
  })

  if (!changed || cut.length === 0) return []

  const remaining = layOut(cut)

  return [
    {
      op: "replace_elements",
      sceneId: scene.id,
      trackId: spine.id,
      elements: remaining,
    },
    ...captionsFollowing(scene, spine.id, remaining),
  ]
}

/**
 * Trim one edge of a clip.
 *
 * The timeline duration and the source trim move together, because they are two
 * views of one edge — moving only the duration would slide the clip's content
 * under it, and moving only the trim would leave a gap the ripple then closes
 * by shifting everything downstream for a change the user made in place.
 *
 * Clamped so a trim cannot pass the opposite edge or run out of source. Without
 * the source clamp, dragging a clip's end past the end of the footage produces
 * a clip that plays black.
 */
export function trimEdge(
  scene: Scene,
  trackId: string,
  elementId: string,
  edge: "start" | "end",
  deltaUs: number
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find(
    (candidate) => candidate.id === elementId
  )

  if (!track || !element || element.kind !== "video") return []

  const clip = element as VideoElement
  const delta = clampTrimDelta(clip, edge, deltaUs)
  if (delta === 0) return []

  if (edge === "end") {
    return withRipple(scene, trackId, {
      op: "update_element",
      sceneId: scene.id,
      trackId,
      elementId,
      patch: {
        durationUs: us(clip.durationUs + delta),
        trimEndUs: us(clip.trimEndUs + delta),
      },
    })
  }

  // Dragging the start right shortens the clip and moves into the source; the
  // clip's position on the timeline moves with it, and the ripple closes up.
  return withRipple(scene, trackId, {
    op: "update_element",
    sceneId: scene.id,
    trackId,
    elementId,
    patch: {
      startUs: us(clip.startUs + delta),
      durationUs: us(clip.durationUs - delta),
      trimStartUs: us(clip.trimStartUs + delta),
    },
  })
}

/** Roughly a frame at 25fps. A clip shorter than this is a slip, not an edit. */
export const MINIMUM_CLIP_US = 40_000

/**
 * How far this edge can actually move, given where the source runs out.
 *
 * Exported because the drag has to draw the same answer the edit will produce.
 * A preview that follows the pointer past the end of the footage shows the clip
 * growing and then snapping back on release — the handle stopping dead at the
 * limit is the interface saying there is no more film, which is true.
 */
export function clampTrimDelta(
  clip: VideoElement,
  edge: "start" | "end",
  deltaUs: number
): number {
  if (edge === "end") {
    const room = clip.sourceDurationUs - clip.trimEndUs
    return Math.max(MINIMUM_CLIP_US - clip.durationUs, Math.min(deltaUs, room))
  }

  return Math.max(
    -clip.trimStartUs,
    Math.min(deltaUs, clip.durationUs - MINIMUM_CLIP_US)
  )
}

/**
 * What the timeline looks like mid-drag, in one number.
 *
 * Positive lengthens the clip and pushes everything after it right; negative
 * shortens and pulls left. Both edges reduce to this because a ripple trim does
 * not move the clip on the timeline — the clips are contiguous, so the edit
 * changes which part of the source plays and how long for, and the rest of the
 * cut closes up behind it. Dragging the in-point right therefore holds the left
 * edge still and brings the right one in, which is what every NLE does and what
 * the ripple would produce anyway a frame later.
 */
export function trimPreviewDeltaUs(
  clip: VideoElement,
  edge: "start" | "end",
  deltaUs: number
): number {
  const delta = clampTrimDelta(clip, edge, deltaUs)
  return edge === "end" ? delta : -delta
}

/**
 * Apply an op to a local copy, then emit it with the ripple it implies.
 *
 * The ripple has to be computed against the scene as it will be, not as it is —
 * otherwise every clip downstream gets an update returning it to where it
 * already was, and the batch is mostly no-ops that still count as an edit.
 */
function withRipple(
  scene: Scene,
  trackId: string,
  op: Extract<EditOp, { op: "update_element" }>
): EditOp[] {
  const applied: Scene = {
    ...scene,
    tracks: scene.tracks.map((track) =>
      track.id === trackId
        ? {
            ...track,
            elements: track.elements.map((element) =>
              element.id === op.elementId
                ? ({ ...element, ...op.patch } as TimelineElement)
                : element
            ),
          }
        : track
    ),
  }

  const moved = applied.tracks.find((track) => track.id === trackId)!.elements

  return [
    op,
    ...rippleOps(applied, trackId),
    ...captionsFollowing(scene, trackId, layOut(moved)),
  ]
}

/**
 * Change the shape of the frame this scene is cut in.
 *
 * A project opens at the shape of its footage, which means a phone recording
 * held upright opens 9:16 and a webcam opens 16:9 — correct in both cases, and
 * neither is a decision the user is stuck with. This is the edit that moves
 * between them: one scene-level op, so it lands in a revision, undoes with
 * Cmd+Z, and reads back as something someone chose rather than a default that
 * happened to them.
 *
 * It writes the canvas onto the *scene* even when the document already carries
 * the same shape in settings. The document's canvas is the fallback for a scene
 * that has never been framed; once someone frames one, the scene answers for
 * itself, and a later scene added by the atomiser is free to disagree.
 *
 * Nothing about the clips moves. The whole picture is fitted inside the new
 * frame, so going wider adds bars rather than cropping — `cropClip` is how
 * someone chooses to fill it instead, and which part survives when they do.
 */
export function reframe(
  scene: Scene,
  canvas: { width: number; height: number }
): EditOp[] {
  if (
    scene.canvas &&
    scene.canvas.width === canvas.width &&
    scene.canvas.height === canvas.height
  ) {
    return []
  }

  return [{ op: "update_scene", sceneId: scene.id, patch: { canvas } }]
}

/**
 * Where the frame sits on footage it does not match.
 *
 * The nine points a crop is normally described by. Named rather than numeric
 * because that is how the decision is actually made — "keep them on the left",
 * not "0.15" — and a name survives a change of footage where a pixel offset
 * does not.
 */
export const CROP_POINTS = {
  center: { x: 0.5, y: 0.5 },
  left: { x: 0.15, y: 0.5 },
  right: { x: 0.85, y: 0.5 },
  top: { x: 0.5, y: 0.15 },
  bottom: { x: 0.5, y: 0.85 },
} as const

export type CropPoint = keyof typeof CROP_POINTS

/**
 * Choose what survives the crop on one clip, and whether it crops at all.
 *
 * 0.15 rather than 0 for the edge points. Pinning a subject to the literal edge
 * of the source is almost never what "keep them on the left" means — it means
 * put them in the left of the frame, and a sliver of headroom on the outside is
 * the difference between a framing and an accident.
 */
export function cropClip(
  scene: Scene,
  elementId: string,
  options: {
    at?: CropPoint | { x: number; y: number }
    fit?: "cover" | "contain"
  }
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (element.kind !== "video") return []

  const patch: Record<string, unknown> = {}

  if (options.at !== undefined) {
    const point =
      typeof options.at === "string" ? CROP_POINTS[options.at] : options.at

    patch.crop = {
      x: clampToRange(point.x, 0, 1),
      y: clampToRange(point.y, 0, 1),
    }
  }

  if (options.fit !== undefined) patch.fit = options.fit

  if (Object.keys(patch).length === 0) return []

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch,
    },
  ]
}

/**
 * The same framing on every clip on the spine.
 *
 * What "reframe this vertically and keep them on the left" means, since a cut
 * is several clips of the same recording and framing one of them differently
 * from the rest is a jump, not a decision.
 */
export function cropSpine(
  scene: Scene,
  options: {
    at?: CropPoint | { x: number; y: number }
    fit?: "cover" | "contain"
  }
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []

  return spine.elements.flatMap((element) =>
    cropClip(scene, element.id, options)
  )
}

/* ── Effects ──────────────────────────────────────────────────────────────
   A punch-in is not a cut, so nothing here moves a clip, ripples a track or
   touches a caption. It writes an effect onto the element and a curve that
   drives one of its parameters, which is why these are the shortest edits in
   the file and still land as a revision like any other.
   ──────────────────────────────────────────────────────────────────────── */

/** Lands the push rather than arriving at speed. easeOutQuint. */
const PUSH_EASING: [number, number, number, number] = [0.22, 1, 0.36, 1]

/** Symmetric, because a release that snaps reads as a mistake. */
const RELEASE_EASING: [number, number, number, number] = [0.4, 0, 0.2, 1]

/** Long enough to read as a move, short enough not to read as a drift. */
const DEFAULT_RAMP_US = 600_000

/**
 * 1.3. Far enough that the cut to it registers, close enough that a 1080p
 * proxy still has the pixels — a punch past about 1.6 is visibly softer than
 * the frame it interrupted.
 */
const DEFAULT_PUNCH_SCALE = 1.3

export type PunchInOptions = {
  scale?: number
  /** Scene time the push begins. Defaults to the clip's own start. */
  fromUs?: Us
  /** Scene time the release finishes. Defaults to the clip's end. */
  toUs?: Us
  rampUs?: Us
  /** The point pushed into, in 0–1 of the frame. Centre is the default. */
  origin?: { x: number; y: number }
  /** Stay in rather than easing back out. */
  hold?: boolean
}

/**
 * Push into a clip and back out.
 *
 * The zoom is an `effect` on the element with a keyframed `scale`, not a change
 * to the element's transform, and the difference matters for undo: the
 * transform is where a person's framing lives, and an agent adding emphasis
 * must not overwrite it. They multiply at render time in `effects.ts`.
 *
 * An existing zoom on the same clip is *replaced*, not stacked. Effects
 * compose, so a second punch-in on a clip that already had one would push to
 * 1.69 and the agent would have no way to know it had — asking twice for a
 * punch-in should look like asking once.
 */
export function punchIn(
  scene: Scene,
  elementId: string,
  options: PunchInOptions = {}
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []

  const scale = options.scale ?? DEFAULT_PUNCH_SCALE
  const origin = options.origin ?? { x: 0.5, y: 0.5 }

  const elementEndUs = element.startUs + element.durationUs
  const fromUs = clampToRange(
    options.fromUs ?? element.startUs,
    element.startUs,
    elementEndUs
  )
  const toUs = clampToRange(options.toUs ?? elementEndUs, fromUs, elementEndUs)

  const windowUs = toUs - fromUs
  if (windowUs <= 0) return []

  // Element-local, because a keyframe is stored relative to the element so that
  // trimming the clip does not drag the curve with it.
  const startLocalUs = fromUs - element.startUs
  const endLocalUs = toUs - element.startUs

  const requested = options.rampUs ?? DEFAULT_RAMP_US
  // Two ramps have to fit inside the window, or the push and the release cross
  // and the clip briefly scales past what was asked for.
  const rampUs = Math.max(
    1,
    Math.min(requested, options.hold ? windowUs : Math.floor(windowUs / 2))
  )

  const effect = newEffect("zoom", {
    scale,
    originX: origin.x,
    originY: origin.y,
  })

  const keys = options.hold
    ? [
        newKeyframe({
          timeUs: us(startLocalUs),
          value: 1,
          interpolation: "bezier",
          easing: PUSH_EASING,
        }),
        newKeyframe({
          timeUs: us(startLocalUs + rampUs),
          value: scale,
          interpolation: "linear",
        }),
      ]
    : [
        newKeyframe({
          timeUs: us(startLocalUs),
          value: 1,
          interpolation: "bezier",
          easing: PUSH_EASING,
        }),
        newKeyframe({
          timeUs: us(startLocalUs + rampUs),
          value: scale,
          interpolation: "linear",
        }),
        newKeyframe({
          timeUs: us(endLocalUs - rampUs),
          value: scale,
          interpolation: "bezier",
          easing: RELEASE_EASING,
        }),
        newKeyframe({
          timeUs: us(endLocalUs),
          value: 1,
          interpolation: "linear",
        }),
      ]

  const without = withoutEffects(
    element,
    (candidate) => candidate.type === "zoom"
  )

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: [...without.effects, effect],
        animations: {
          channels: {
            ...without.channels,
            [`effects.${effect.id}.params.scale`]: {
              path: `effects.${effect.id}.params.scale`,
              keys,
            },
          },
        },
      },
    },
  ]
}

/**
 * Put a look on a clip: brightness, contrast, blur, black and white.
 *
 * Static, with no curve. A look is a decision about the whole shot — a clip
 * that is black and white for two seconds in the middle is a glitch, not a
 * grade — so unlike `punchIn` this writes no keyframes, and `effect-lane.ts`
 * already draws a curveless effect as a chip spanning the clip.
 *
 * Replaces an effect of the same type rather than stacking, for the reason
 * `punchIn` gives: effects compose at render time, so a second brightness on
 * the same clip would land at 1.32 and nothing in the UI would say why. Asking
 * twice should look like asking once.
 *
 * `zoom` is refused here and belongs to `punchIn`. A zoom without a window is a
 * clip that is simply larger for its whole length, which is a framing decision
 * and one `cropClip` and `reframe` already own between them.
 */
export function applyEffect(
  scene: Scene,
  elementId: string,
  type: Exclude<Effect["type"], "zoom">,
  amount?: number
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []

  const spec = effectSpec(type)
  const value = clampToRange(amount ?? spec.initial, spec.min, spec.max)

  // Asking for the neutral value is asking for nothing. Writing it would leave
  // a chip on the lane that says "Contrast ×1.00" and changes not one pixel.
  if (value === spec.neutral) return removeEffectsOfType(scene, elementId, type)

  const without = withoutEffects(
    element,
    (candidate) => candidate.type === type
  )
  const effect = newEffect(type, { [spec.param]: value })

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: [...without.effects, effect],
        animations: { channels: without.channels },
      },
    },
  ]
}

/** Take every effect of one type off a clip, curves included. */
export function removeEffectsOfType(
  scene: Scene,
  elementId: string,
  type: Effect["type"]
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []
  if (!element.effects.some((effect) => effect.type === type)) return []

  const without = withoutEffects(element, (effect) => effect.type === type)

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: without.effects,
        animations: { channels: without.channels },
      },
    },
  ]
}

/**
 * Change how far one effect goes, without moving it or retiming it.
 *
 * What the number on a lane chip edits. The curve keeps its shape: the keys
 * sitting at the old peak move to the new one and everything else stays, so
 * taking a punch-in from 1.30 to 1.20 leaves the ease, the hold and the release
 * exactly as they were rather than rebuilding a curve someone may have retimed.
 *
 * The static param moves too. It is what an effect with no curve reads, and
 * leaving the two disagreeing is how a value that looks right in the UI renders
 * as something else the moment the keys are removed.
 */
export function setEffectAmount(
  scene: Scene,
  elementId: string,
  effectId: string,
  amount: number
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []

  const effect = element.effects.find((candidate) => candidate.id === effectId)
  if (!effect) return []

  const param = PRIMARY_PARAM[effect.type]
  const path = `effects.${effect.id}.params.${param}`
  const channel = element.animations.channels[path]

  const peak = channel?.keys.reduce(
    (highest, key) => Math.max(highest, key.value),
    Number.NEGATIVE_INFINITY
  )

  const effects = element.effects.map((candidate) =>
    candidate.id === effectId
      ? { ...candidate, params: { ...candidate.params, [param]: amount } }
      : candidate
  )

  const channels = channel
    ? {
        ...element.animations.channels,
        [path]: {
          ...channel,
          keys: channel.keys.map((key) =>
            key.value === peak ? { ...key, value: amount } : key
          ),
        },
      }
    : element.animations.channels

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: { effects, animations: { channels } },
    },
  ]
}

/**
 * Drag one end of an effect, keeping the other where it is.
 *
 * The ramps keep their length and the hold in the middle absorbs the change.
 * That is the whole point: the ramp is how the push *feels*, and stretching a
 * punch-in from two seconds to four should hold longer, not accelerate more
 * slowly. Scaling the curve into the new window — the obvious implementation —
 * changes the easing of an effect you only asked to be longer.
 *
 * Each key anchors to whichever end it started nearer, which generalises past
 * the shapes we have today: a two-key hold moves its one interior key with the
 * end it belongs to, and a four-key push-release keeps its attack against the
 * start and its release against the end.
 *
 * The offsets are capped at half the new window so the ramps meet in the middle
 * rather than crossing when you drag an effect shorter than two of them. Keys
 * that cross would come out unordered, and `sampleChannel` walks rather than
 * sorts — it says so — so an unordered channel does not throw, it just samples
 * the wrong value for the rest of the clip.
 */
export function resizeEffect(
  scene: Scene,
  elementId: string,
  effectId: string,
  edge: "start" | "end",
  deltaUs: number
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []

  const effect = element.effects.find((candidate) => candidate.id === effectId)
  if (!effect) return []

  const path = `effects.${effect.id}.params.${PRIMARY_PARAM[effect.type]}`
  const channel = element.animations.channels[path]
  if (!channel || channel.keys.length < 2) return []

  const first = channel.keys[0].timeUs
  const last = channel.keys[channel.keys.length - 1].timeUs

  const newFirst =
    edge === "start"
      ? Math.round(clampToRange(first + deltaUs, 0, last - MIN_EFFECT_US))
      : first

  const newLast =
    edge === "end"
      ? Math.round(
          clampToRange(
            last + deltaUs,
            first + MIN_EFFECT_US,
            element.durationUs
          )
        )
      : last

  if (newFirst === first && newLast === last) return []

  const half = Math.floor((newLast - newFirst) / 2)

  let previous = Number.NEGATIVE_INFINITY
  const keys = channel.keys.map((key) => {
    const fromStart = key.timeUs - first
    const fromEnd = last - key.timeUs

    const placed =
      fromStart <= fromEnd
        ? newFirst + Math.min(fromStart, half)
        : newLast - Math.min(fromEnd, half)

    // Monotonic by construction above, and asserted here anyway: two keys that
    // land on the same instant are fine, one that lands before its predecessor
    // is a curve that plays backwards.
    const timeUs = Math.max(previous, placed)
    previous = timeUs

    return { ...key, timeUs: us(timeUs) }
  })

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        animations: {
          channels: {
            ...element.animations.channels,
            [path]: { ...channel, keys },
          },
        },
      },
    },
  ]
}

/**
 * Keyframes kept inside the clip they now belong to.
 *
 * Only bites when an effect is dropped on a clip shorter than itself. Clamping
 * rather than dropping the overhang, so the curve keeps its shape up to the cut
 * and holds its last value after it — a push that runs out of clip ends on the
 * cut rather than snapping back to 1 for a frame.
 */
function truncateKeys(keys: Keyframe[], maxUs: number): Keyframe[] {
  let previous = 0

  return keys.map((key) => {
    const timeUs = Math.max(previous, Math.min(key.timeUs, maxUs))
    previous = timeUs
    return { ...key, timeUs: us(timeUs) }
  })
}

/**
 * Move one effect along the track, across cuts.
 *
 * It used to clamp to the element it sat on, with a comment arguing that an
 * effect is a property of a clip and a punch-in dragged off the end of its shot
 * is a curve nothing samples. The first half is true and the second does not
 * follow. A split turns one shot into two elements and changes nothing about
 * the film, so an effect pinned to the piece it was created on makes every cut
 * a wall — and the walls are in places the user put there for unrelated
 * reasons. You could not drag a zoom onto the next line of a sentence you had
 * split in the middle of.
 *
 * So it travels the track and lands on whichever clip holds its new start,
 * moving between elements when it has to. The curve is rebased into the
 * destination's own clock, because keyframes are element-relative and carrying
 * them over unchanged would put the push at the same offset into a clip that
 * begins somewhere else entirely.
 *
 * It still sits inside exactly one clip. An effect spanning a cut cannot be
 * stored — it is one array entry on one element — and the honest version of
 * "half of it applies" is a curve whose tail never plays. So an effect longer
 * than the clip it is dropped on is truncated to fit, which `previewMove` draws
 * while the drag is still happening rather than springing on release.
 */
export function moveEffect(
  scene: Scene,
  elementId: string,
  effectId: string,
  deltaUs: number
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []

  const effect = element.effects.find((candidate) => candidate.id === effectId)
  if (!effect) return []

  const path = `effects.${effect.id}.params.${PRIMARY_PARAM[effect.type]}`
  const channel = element.animations.channels[path]
  if (!channel || channel.keys.length === 0) return []

  const first = channel.keys[0].timeUs
  const last = channel.keys[channel.keys.length - 1].timeUs

  const landing = effectLanding(
    track.elements
      .filter((candidate) => "effects" in candidate)
      .map((candidate) => ({
        id: candidate.id,
        startUs: candidate.startUs,
        durationUs: candidate.durationUs,
      })),
    { startUs: element.startUs + first, durationUs: last - first },
    deltaUs
  )
  if (!landing) return []

  const host = track.elements.find(
    (candidate) => candidate.id === landing.elementId
  )
  if (!host || !("effects" in host) || !("animations" in host)) return []

  const localStart = landing.startUs - host.startUs
  const shift = localStart - first
  const keys = truncateKeys(
    channel.keys.map((key) => ({ ...key, timeUs: us(key.timeUs + shift) })),
    host.durationUs
  )

  if (host.id === element.id) {
    if (shift === 0) return []

    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId: element.id,
        patch: {
          animations: {
            channels: {
              ...element.animations.channels,
              [path]: { ...channel, keys },
            },
          },
        },
      },
    ]
  }

  // Off the old clip and onto the new one, in one batch. Two ops applied
  // separately would leave a frame with the effect on both clips or on neither.
  const without = withoutEffects(
    element,
    (candidate) => candidate.id === effectId
  )

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: without.effects,
        animations: { channels: without.channels },
      },
    },
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: host.id,
      patch: {
        effects: [...host.effects, effect],
        animations: {
          channels: {
            ...host.animations.channels,
            [path]: { ...channel, keys },
          },
        },
      },
    },
  ]
}

/** Take one effect off a clip, its curve with it. */
export function removeEffect(
  scene: Scene,
  elementId: string,
  effectId: string
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element)) return []
  if (!element.effects.some((effect) => effect.id === effectId)) return []

  const without = withoutEffects(element, (effect) => effect.id === effectId)

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: without.effects,
        animations: { channels: without.channels },
      },
    },
  ]
}

/** Drop every zoom from a clip, curves included. */
export function clearZoom(scene: Scene, elementId: string): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("effects" in element) || element.effects.length === 0) return []

  const without = withoutEffects(element, (effect) => effect.type === "zoom")
  if (without.effects.length === element.effects.length) return []

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        effects: without.effects,
        animations: { channels: without.channels },
      },
    },
  ]
}

/**
 * Fade a clip up from the background and back down into it.
 *
 * This is the transition the timeline can actually express. A cross-dissolve
 * needs the outgoing and incoming clips on screen at once, and elements on a
 * track are ordered and butt-joined — two clips overlapping is not a state the
 * ops maintain. A dip through the background is the honest version until an
 * overlap has a representation, and it is what the agent should reach for when
 * asked to soften a cut.
 *
 * Zero on either side means "leave that end alone", so fading only the tail of
 * the last clip is one call and does not silently fade its head as well.
 */
export function fade(
  scene: Scene,
  elementId: string,
  options: { inUs?: Us | number; outUs?: Us | number } = {}
): EditOp[] {
  const found = locate(scene, elementId)
  if (!found) return []

  const { track, element } = found
  if (!("animations" in element)) return []

  const inUs = Math.max(0, options.inUs ?? 0)
  const outUs = Math.max(0, options.outUs ?? 0)
  if (inUs === 0 && outUs === 0) return []

  // Both fades inside one clip must not overlap, or the curve doubles back and
  // the middle of a short clip never reaches full.
  const available = element.durationUs
  const scaleDown = inUs + outUs > available ? available / (inUs + outUs) : 1
  const rampIn = Math.floor(inUs * scaleDown)
  const rampOut = Math.floor(outUs * scaleDown)

  const keys: Keyframe[] = []

  if (rampIn > 0) {
    keys.push(
      newKeyframe({
        timeUs: us(0),
        value: 0,
        interpolation: "bezier",
        easing: RELEASE_EASING,
      }),
      newKeyframe({
        timeUs: us(rampIn),
        value: 1,
        interpolation: "linear",
      })
    )
  }

  if (rampOut > 0) {
    keys.push(
      newKeyframe({
        timeUs: us(available - rampOut),
        value: 1,
        interpolation: "bezier",
        easing: RELEASE_EASING,
      }),
      newKeyframe({
        timeUs: us(available),
        value: 0,
        interpolation: "linear",
      })
    )
  }

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId: track.id,
      elementId: element.id,
      patch: {
        animations: {
          channels: {
            ...element.animations.channels,
            opacity: { path: "opacity", keys },
          },
        },
      },
    },
  ]
}

/**
 * The element's effects minus the ones matched, and the channels minus the
 * curves that drove them.
 *
 * Dropping the effect and leaving its channel is the leak that matters here:
 * the channel is keyed by the effect's id, so it is dead data that no longer
 * animates anything and that every later read has to step over. Nothing would
 * ever look wrong, which is why it would survive.
 */
function withoutEffects(
  element: TimelineElement & { effects: Effect[]; animations: Animations },
  matches: (effect: Effect) => boolean
): { effects: Effect[]; channels: Animations["channels"] } {
  const dropped = element.effects.filter(matches).map((effect) => effect.id)
  const channels = Object.fromEntries(
    Object.entries(element.animations.channels).filter(
      ([path]) => !dropped.some((id) => path.startsWith(`effects.${id}.`))
    )
  )

  return {
    effects: element.effects.filter((effect) => !matches(effect)),
    channels,
  }
}

function locate(
  scene: Scene,
  elementId: string
): { track: Track; element: TimelineElement } | null {
  for (const track of scene.tracks) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (element) return { track, element }
  }

  return null
}

function clampToRange(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high)
}

/**
 * The caption lanes, rebuilt against a spine that has just moved.
 *
 * Every edit that changes *when* the spine plays has to carry this, and for a
 * while only `removeSilences` did — so an agent tightening a talk kept its
 * captions and a person deleting one clip left every word after it sitting
 * over the wrong footage. Two paths to the same kind of edit, one of them
 * right, which is exactly the drift that putting the edits in one place was
 * supposed to prevent.
 *
 * Remapped rather than shifted, for the reason in `remapCaptions`: delete two
 * separate clips and every word after the second has moved by a different
 * amount than the words between them. A word whose source instant is no longer
 * in the cut goes with it, rather than lingering over whatever now follows.
 *
 * Only for the spine. Trimming a b-roll overlay moves nothing captions are
 * bound to, and rebuilding them against it would be a revision that changes
 * nothing and still costs an undo.
 */
function captionsFollowing(
  scene: Scene,
  trackId: string,
  spineElements: TimelineElement[]
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine || spine.id !== trackId) return []

  const after: Track = { ...spine, elements: spineElements }

  return scene.tracks
    .filter((track) => track.kind === "caption" && track.elements.length > 0)
    .map((track) => ({
      op: "replace_elements" as const,
      sceneId: scene.id,
      trackId: track.id,
      elements: remapCaptions(
        track.elements.filter(
          (element): element is CaptionElement => element.kind === "caption"
        ),
        after
      ),
    }))
}

/** The spine, which is what every hand edit here operates on. */
export function mainTrackId(scene: Scene): string | null {
  return findMainTrack(scene)?.id ?? null
}
