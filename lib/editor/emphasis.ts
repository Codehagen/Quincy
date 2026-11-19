import { punchIn } from "./edits"
import type { EditOp } from "./ops"
import { normaliseWord } from "./fillers"
import { clipRate, findMainTrack, sceneDurationUs } from "./timeline"
import { us, type Us } from "./time"
import type { Word } from "./transcript"
import type { Scene, TimelineElement } from "./types"

/**
 * Zoom as an editor uses it: rarely, and for a reason.
 *
 * The first punch-in pushed to 1.3 and held it for the whole clip, and
 * nothing stopped it being asked for again on the next clip and the one after
 * that. A push-in is emphasis, and emphasis that repeats stops being
 * emphasis: the eye reads the third zoom in ten seconds as the camera
 * wobbling, not as the line mattering. So this file holds the rules a
 * restrained edit follows:
 *
 * - **Motivated.** A push sits on a line, from just before its first word to
 *   just after its last (`lineWindow`), not across a whole clip.
 * - **Subtle.** 1.12 by default; past about 1.25 a talking head stops
 *   reading as a closer shot and starts reading as a crop.
 * - **Rationed.** No two pushes closer than `MIN_GAP_US`, and pushed-in time
 *   at most `MAX_SHARE` of the cut (`emphasisRefusal`).
 *
 * The one zoom that may repeat is the *frame step* (`frameSteps`): a still,
 * slightly closer framing on every other clip, which is how a jump cut in a
 * talking-head vlog is hidden. It never moves on screen, so it does not read
 * as emphasis, and it is only ever put on by a style that asks for it.
 */

/** The default push: a closer shot, not a crop. */
export const SUBTLE_SCALE = 1.12

/** Past this a person has to ask by number. */
export const STRONG_SCALE = 1.25

/** No two pushes closer than this. */
export const MIN_GAP_US = 8_000_000

/** At most this share of the cut sits pushed in. */
export const MAX_SHARE = 0.25

/** How long a push holds when nobody gives it a window. */
export const DEFAULT_PUSH_US = 3_000_000

/** Room before a line's first word, so the push is underway as it lands. */
const LINE_LEAD_US = 200_000

/** Room after its last word, so the release does not cut the word off. */
const LINE_TAIL_US = 400_000

/** The frame step's scale: enough to read as a new shot, too little to notice. */
export const FRAME_STEP_SCALE = 1.08

/** A ramp at or under this is a cut to a closer frame, not a push. */
const STEP_RAMP_US = 50_000

export type ZoomWindow = {
  elementId: string
  startUs: number
  endUs: number
  /** A still closer frame (a jump-cut step), not a moving push. */
  step: boolean
}

/** Every zoom on the spine, as the stretch of the cut it covers. */
export function zoomWindows(scene: Scene): ZoomWindow[] {
  const spine = findMainTrack(scene)
  if (!spine) return []
  const windows: ZoomWindow[] = []

  for (const element of spine.elements) {
    if (!("effects" in element)) continue
    for (const effect of element.effects) {
      if (!effect.enabled || effect.type !== "zoom") continue
      const channel = channelsOf(element)[`effects.${effect.id}.params.scale`]
      const keys = channel?.keys ?? []
      if (keys.length === 0) {
        windows.push({
          elementId: element.id,
          startUs: element.startUs,
          endUs: element.startUs + element.durationUs,
          step: false,
        })
        continue
      }
      const first = keys[0].timeUs
      const last = keys[keys.length - 1].timeUs
      const step =
        keys.length === 2 && keys[1].timeUs - keys[0].timeUs <= STEP_RAMP_US
      windows.push({
        elementId: element.id,
        startUs: element.startUs + first,
        // A held push stays in to the end of the clip.
        endUs:
          step || keys.length === 2
            ? element.startUs + element.durationUs
            : element.startUs + last,
        step,
      })
    }
  }

  return windows.sort((a, b) => a.startUs - b.startUs)
}

function channelsOf(element: TimelineElement) {
  return "animations" in element && element.animations
    ? element.animations.channels
    : {}
}

/**
 * Why a push over this window would be one too many, or null when it fits.
 *
 * A push on the same clip replaces the one there (`punchIn`), so that clip's
 * own push is not counted against it.
 */
export function emphasisRefusal(
  scene: Scene,
  elementIds: string | readonly string[],
  window: { startUs: number; endUs: number }
): string | null {
  const replaced = new Set(
    typeof elementIds === "string" ? [elementIds] : elementIds
  )
  const others = zoomWindows(scene).filter(
    (zoom) => !zoom.step && !replaced.has(zoom.elementId)
  )

  const near = others.find(
    (zoom) =>
      zoom.endUs > window.startUs - MIN_GAP_US &&
      zoom.startUs < window.endUs + MIN_GAP_US
  )
  if (near) {
    return `There is already a push-in at ${clock(near.startUs)}, less than ${MIN_GAP_US / 1_000_000} s away. Two pushes that close read as the camera moving, not the line mattering.`
  }

  const cutUs = sceneDurationUs(scene)
  const pushed =
    others.reduce((sum, zoom) => sum + (zoom.endUs - zoom.startUs), 0) +
    (window.endUs - window.startUs)
  if (cutUs > 0 && pushed / cutUs > MAX_SHARE) {
    return `That would leave ${Math.round((pushed / cutUs) * 100)}% of the cut pushed in. Past ${Math.round(MAX_SHARE * 100)}% the zoom stops reading as emphasis.`
  }

  return null
}

export type LineSegment = { elementId: string; fromUs: Us; toUs: Us }

export type LineWindow = {
  /** The clip the line starts in. */
  elementId: string
  /** The whole stretch, lead and tail included. */
  fromUs: Us
  toUs: Us
  /**
   * The same stretch, clip by clip. A tightened take splits a line wherever a
   * pause inside it was shortened, so one line can cross several clips.
   */
  segments: LineSegment[]
}

/**
 * The stretch of the cut a spoken line covers, with room either side, clip
 * by clip. Matches whole words, ignoring case and punctuation; null when the
 * line is not in the cut (cut out, or misquoted).
 *
 * Mapped through the clips themselves rather than `sourceToTimelineUs`,
 * because a word's end is exclusive: a line whose last word ends exactly at
 * a clip's out-point is whole, and an instant lookup would call it gone.
 */
export function lineWindow(
  scene: Scene,
  words: Word[],
  mediaId: string,
  line: string
): LineWindow | null {
  const spine = findMainTrack(scene)
  const needle = line.split(/\s+/).map(normaliseWord).filter(Boolean)
  if (!spine || needle.length === 0) return null

  const spoken = words.map((word) => normaliseWord(word.text))
  for (let i = 0; i + needle.length <= spoken.length; i++) {
    if (!needle.every((part, k) => spoken[i + k] === part)) continue

    const sourceStart = words[i].startUs
    const sourceEnd = words[i + needle.length - 1].endUs
    const pieces: LineSegment[] = []
    for (const element of spine.elements) {
      if (element.kind !== "video" || element.mediaId !== mediaId) continue
      const from = Math.max(sourceStart, element.trimStartUs)
      const to = Math.min(sourceEnd, element.trimEndUs)
      if (to <= from) continue
      const rate = clipRate(element)
      pieces.push({
        elementId: element.id,
        fromUs: us(element.startUs + (from - element.trimStartUs) / rate),
        toUs: us(element.startUs + (to - element.trimStartUs) / rate),
      })
    }
    if (pieces.length === 0) continue
    pieces.sort((a, b) => a.fromUs - b.fromUs)

    // The first word has to have survived; a line that starts mid-word was
    // cut into, and the push would land on a fragment.
    const firstClip = spine.elements.find((e) => e.id === pieces[0].elementId)
    if (
      !firstClip ||
      firstClip.kind !== "video" ||
      firstClip.trimStartUs > sourceStart
    ) {
      continue
    }

    const first = pieces[0]
    const last = pieces[pieces.length - 1]
    const lastClip = spine.elements.find((e) => e.id === last.elementId)!
    const lastEnd = lastClip.startUs + lastClip.durationUs
    first.fromUs = us(Math.max(firstClip.startUs, first.fromUs - LINE_LEAD_US))
    last.toUs = us(Math.min(lastEnd, last.toUs + LINE_TAIL_US))
    // Between the first and the last, a push holds to each cut.
    for (const piece of pieces.slice(0, -1)) {
      const clip = spine.elements.find((e) => e.id === piece.elementId)!
      piece.toUs = us(clip.startUs + clip.durationUs)
    }
    for (const piece of pieces.slice(1)) {
      const clip = spine.elements.find((e) => e.id === piece.elementId)!
      piece.fromUs = us(clip.startUs)
    }

    return {
      elementId: first.elementId,
      fromUs: first.fromUs,
      toUs: last.toUs,
      segments: pieces,
    }
  }
  return null
}

/**
 * One push across a line, however many clips it crosses: in on the first,
 * held through the middle, released on the last. Refused (with the reason)
 * when it would be one push too many.
 */
export function pushOnLine(
  scene: Scene,
  line: LineWindow,
  scale: number = SUBTLE_SCALE
): { ops: EditOp[]; refusal: string | null } {
  const ids = line.segments.map((segment) => segment.elementId)
  const refusal = emphasisRefusal(scene, ids, {
    startUs: line.fromUs,
    endUs: line.toUs,
  })
  if (refusal) return { ops: [], refusal }

  const count = line.segments.length
  const ops = line.segments.flatMap((segment, index) =>
    punchIn(scene, segment.elementId, {
      scale,
      fromUs: segment.fromUs,
      toUs: segment.toUs,
      hold: index < count - 1,
      startIn: index > 0,
    })
  )
  return { ops, refusal: null }
}

/**
 * A still, slightly closer frame on every other clip of the spine.
 *
 * Where two clips of one take meet, the speaker jumps; at the same framing
 * that jump is the thing people notice. At a slightly different framing it
 * reads as a second camera. Only clips that sit after a cut in the take get
 * one (the clip before is from earlier in the same recording), and a clip
 * that already carries a push keeps it.
 */
export function frameSteps(scene: Scene): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []
  const pushed = new Set(
    zoomWindows(scene)
      .filter((zoom) => !zoom.step)
      .map((zoom) => zoom.elementId)
  )

  const ops: EditOp[] = []
  let closer = false
  let previous: TimelineElement | undefined
  for (const element of spine.elements) {
    const jump =
      previous !== undefined &&
      element.kind === "video" &&
      previous.kind === "video" &&
      element.mediaId === previous.mediaId &&
      element.trimStartUs > previous.trimStartUs
    closer = jump ? !closer : false
    previous = element
    if (!closer || pushed.has(element.id)) continue

    // Each step patches its own clip, so they are independent of each other.
    ops.push(
      ...punchIn(scene, element.id, {
        scale: FRAME_STEP_SCALE,
        hold: true,
        rampUs: us(1),
      })
    )
  }
  return ops
}

function clock(atUs: number): string {
  const seconds = Math.floor(atUs / 1_000_000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`
}
