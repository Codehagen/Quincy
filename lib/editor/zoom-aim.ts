import { newKeyframe, type EditOp } from "./ops"
import { sampleChannel } from "./effects"
import { us } from "./time"
import type { AnimationChannel, Keyframe, Scene } from "./types"

/**
 * A close-up that follows a point: click where to look, at the moment to look
 * there, and the zoom glides between the points you clicked.
 *
 * Built for a screen recording, where the thing worth seeing moves (a menu,
 * a button, the next field), and a centred push shows the middle of an empty
 * page. The points are keys on the zoom's own `originX` / `originY` channels,
 * which the compositor already samples (effects.ts), so the preview and the
 * export follow the same path with nothing new in between.
 *
 * One point aims the whole zoom there. Two or more make a path: the close-up
 * travels from each point to the next on an ease in and out, the way a camera
 * operator pans, never at constant speed.
 */

/** Ease in and out between two points: a pan, not a slide. */
const GLIDE_EASING: [number, number, number, number] = [0.45, 0, 0.55, 1]

/**
 * Two clicks closer than this are the same point being corrected, not a
 * second point: the later one moves the earlier one instead of adding a pan
 * a few frames long.
 */
export const AIM_MERGE_US = 200_000

export type AimPoint = { timeUs: number; x: number; y: number }

function channelPath(effectId: string, axis: "originX" | "originY"): string {
  return `effects.${effectId}.params.${axis}`
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value))
}

/**
 * Aim a zoom at a point at one moment.
 *
 * `atUs` is scene time; `point` is in 0–1 of the frame. Returns no ops when
 * the element or the zoom is not there, so a stale click does nothing.
 */
export function aimZoom(
  scene: Scene,
  elementId: string,
  effectId: string,
  atUs: number,
  point: { x: number; y: number }
): EditOp[] {
  for (const track of scene.tracks) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (!element || !("effects" in element) || !("animations" in element))
      continue
    const effect = element.effects.find(
      (candidate) => candidate.id === effectId && candidate.type === "zoom"
    )
    if (!effect) return []

    const localUs = Math.round(
      Math.min(Math.max(atUs - element.startUs, 0), element.durationUs)
    )
    const channels = element.animations.channels
    const next = {
      ...channels,
      [channelPath(effectId, "originX")]: withKey(
        channels[channelPath(effectId, "originX")],
        channelPath(effectId, "originX"),
        localUs,
        clamp01(point.x)
      ),
      [channelPath(effectId, "originY")]: withKey(
        channels[channelPath(effectId, "originY")],
        channelPath(effectId, "originY"),
        localUs,
        clamp01(point.y)
      ),
    }

    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId,
        patch: {
          animations: { ...element.animations, channels: next },
          // The resting origin follows the first point, so anything that reads
          // the plain params (the lane chip, an older reader) sees the aim too.
          effects: element.effects.map((candidate) =>
            candidate.id === effectId
              ? {
                  ...candidate,
                  params: {
                    ...candidate.params,
                    originX: firstValue(next[channelPath(effectId, "originX")]),
                    originY: firstValue(next[channelPath(effectId, "originY")]),
                  },
                }
              : candidate
          ),
        },
        target: {
          action: "press",
          kind: "element",
          trackId: track.id,
          elementId,
        },
      },
    ]
  }
  return []
}

/** Take every point off a zoom, back to pushing into where it was first aimed. */
export function clearAim(
  scene: Scene,
  elementId: string,
  effectId: string
): EditOp[] {
  for (const track of scene.tracks) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (!element || !("animations" in element)) continue
    const channels = { ...element.animations.channels }
    const x = channelPath(effectId, "originX")
    const y = channelPath(effectId, "originY")
    if (!channels[x] && !channels[y]) return []
    delete channels[x]
    delete channels[y]
    return [
      {
        op: "update_element",
        sceneId: scene.id,
        trackId: track.id,
        elementId,
        patch: { animations: { ...element.animations, channels } },
        target: {
          action: "press",
          kind: "element",
          trackId: track.id,
          elementId,
        },
      },
    ]
  }
  return []
}

/** The points a zoom follows, in scene time, for drawing them on the preview. */
export function aimPoints(
  scene: Scene,
  elementId: string,
  effectId: string
): AimPoint[] {
  for (const track of scene.tracks) {
    const element = track.elements.find(
      (candidate) => candidate.id === elementId
    )
    if (!element || !("animations" in element)) continue
    const xs = element.animations.channels[channelPath(effectId, "originX")]
    const ys = element.animations.channels[channelPath(effectId, "originY")]
    if (!xs || !ys) return []
    return xs.keys.map((key) => ({
      timeUs: element.startUs + key.timeUs,
      x: key.value,
      y: sampleChannel(ys, key.timeUs) ?? 0.5,
    }))
  }
  return []
}

function withKey(
  channel: AnimationChannel | undefined,
  path: string,
  timeUs: number,
  value: number
): AnimationChannel {
  const keys: Keyframe[] = (channel?.keys ?? []).filter(
    (key) => Math.abs(key.timeUs - timeUs) >= AIM_MERGE_US
  )
  keys.push(
    newKeyframe({
      timeUs: us(timeUs),
      value,
      interpolation: "bezier",
      easing: GLIDE_EASING,
    })
  )
  keys.sort((a, b) => a.timeUs - b.timeUs)
  return { path, keys }
}

function firstValue(channel: AnimationChannel): number {
  return channel.keys[0]?.value ?? 0.5
}
