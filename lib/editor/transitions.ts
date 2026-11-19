import type { EditOp } from "./ops"
import { clipRate } from "./timeline"
import { us, type Us } from "./time"
import type {
  Scene,
  Track,
  Transition,
  TransitionKind,
  VideoElement,
} from "./types"

/**
 * Transitions between two clips that meet on a track.
 *
 * Three, on purpose: a dissolve, a dip to black and a dip to white. Stored on
 * the later clip of a join (types.ts `VideoElement.transition`), so a join
 * has at most one and deleting either clip takes it with it.
 *
 * None of them changes the cut's length or moves a word. A dip darkens across
 * the join and needs nothing else. A dissolve shows the outgoing clip past its
 * own end, under the incoming one, so it needs footage the cut left out after
 * that end (the handle). Without a handle there is nothing to dissolve from,
 * and the builder says so instead of doing nothing.
 */

export const TRANSITION_KINDS: { kind: TransitionKind; label: string }[] = [
  { kind: "dissolve", label: "Dissolve" },
  { kind: "dip_black", label: "Dip to black" },
  { kind: "dip_white", label: "Dip to white" },
]

export const DEFAULT_TRANSITION_US = us(500_000)
export const MAX_TRANSITION_US = us(2_000_000)
export const MIN_TRANSITION_US = us(100_000)

/** Within a frame at 24fps, two clips meet. */
const JOIN_TOLERANCE_US = 42_000

export type TransitionWindow = {
  kind: TransitionKind
  /** Scene time where the two clips meet. */
  joinUs: Us
  /** The length that plays, after the handle has been allowed for. */
  durationUs: Us
  previous: VideoElement
  next: VideoElement
}

/** The clip that ends where this one starts, on the same track. */
export function previousClip(
  track: Track,
  element: VideoElement
): VideoElement | null {
  const index = track.elements.findIndex((candidate) => candidate.id === element.id)
  for (let i = index - 1; i >= 0; i--) {
    const candidate = track.elements[i]
    if (candidate.kind !== "video") continue
    const end = candidate.startUs + candidate.durationUs
    return Math.abs(end - element.startUs) <= JOIN_TOLERANCE_US ? candidate : null
  }
  return null
}

/** Timeline microseconds of footage left after the clip's out point. */
export function tailHandleUs(clip: VideoElement): number {
  return Math.max(0, (clip.sourceDurationUs - clip.trimEndUs) / clipRate(clip))
}

/** Every transition on a track, as the compositor plays it. */
export function transitionWindows(track: Track): TransitionWindow[] {
  const windows: TransitionWindow[] = []
  for (const element of track.elements) {
    if (element.kind !== "video" || !element.transition) continue
    const previous = previousClip(track, element)
    if (!previous) continue
    const durationUs = playableUs(element.transition, previous, element)
    if (durationUs <= 0) continue
    windows.push({
      kind: element.transition.kind,
      joinUs: element.startUs,
      durationUs,
      previous,
      next: element,
    })
  }
  return windows
}

function playableUs(
  transition: Transition,
  previous: VideoElement,
  next: VideoElement
): Us {
  // Never longer than either clip: a transition that outlasts a clip is a
  // clip you never see on its own.
  let length = Math.min(
    transition.durationUs,
    previous.durationUs,
    next.durationUs,
    MAX_TRANSITION_US
  )
  if (transition.kind === "dissolve") length = Math.min(length, tailHandleUs(previous))
  return us(Math.max(0, Math.round(length)))
}

/**
 * How opaque the dip's colour is at a scene instant, 0–1: up to full at the
 * join over half the length, back down over the other half.
 */
export function dipOpacity(atUs: number, window: TransitionWindow): number {
  if (window.kind === "dissolve") return 0
  const half = window.durationUs / 2
  if (half <= 0) return 0
  const distance = Math.abs(atUs - window.joinUs)
  return distance >= half ? 0 : 1 - distance / half
}

/**
 * The incoming clip's opacity during a dissolve, from its own start: 0 to 1
 * across the transition.
 */
export function dissolveOpacity(elementUs: number, window: TransitionWindow): number {
  if (window.kind !== "dissolve" || window.durationUs <= 0) return 1
  return Math.min(1, Math.max(0, elementUs / window.durationUs))
}

export type TransitionResult = { ops: EditOp[]; reason: string | null }

/**
 * Put a transition on the join before `elementId`, or take it off (`kind`
 * null). Returns why when it cannot: a first clip has no join, and a
 * dissolve needs footage after the outgoing clip's end.
 */
export function setTransition(
  scene: Scene,
  trackId: string,
  elementId: string,
  kind: TransitionKind | null,
  durationUs: number = DEFAULT_TRANSITION_US
): TransitionResult {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find((candidate) => candidate.id === elementId)
  if (!track || !element || element.kind !== "video")
    return { ops: [], reason: "There is no clip there to join." }

  const target = {
    action: "press" as const,
    kind: "element" as const,
    trackId,
    elementId,
  }

  if (kind === null) {
    if (!element.transition) return { ops: [], reason: "That join has no transition." }
    return {
      ops: [
        {
          op: "update_element",
          sceneId: scene.id,
          trackId,
          elementId,
          patch: { transition: null },
          target,
        },
      ],
      reason: null,
    }
  }

  const previous = previousClip(track, element)
  if (!previous)
    return {
      ops: [],
      reason: "The first clip has nothing before it to transition from.",
    }

  const length = us(
    Math.round(Math.min(MAX_TRANSITION_US, Math.max(MIN_TRANSITION_US, durationUs)))
  )
  if (kind === "dissolve" && tailHandleUs(previous) < MIN_TRANSITION_US) {
    return {
      ops: [],
      reason:
        "A dissolve needs footage after the end of the clip before it, and that clip runs to the end of its recording. A dip to black works here.",
    }
  }

  return {
    ops: [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId,
        elementId,
        patch: { transition: { kind, durationUs: length } },
        target,
      },
    ],
    reason: null,
  }
}
