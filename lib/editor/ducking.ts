import { speechRegions } from "./timeline"
import { us, type UsRange } from "./time"
import type { AudioElement, CaptionElement, Ducking, Scene } from "./types"

/**
 * Music under a voice: where the voice is, and how far the bed comes down.
 *
 * The voice is read from the captions when there are any, because they are
 * the words exactly where they now play. Without captions the spine's
 * audible clips stand in: coarser (the bed stays down through pauses), never
 * wrong in the direction that matters, which is speech the music drowns.
 */

/** Gaps shorter than this stay ducked, so the bed does not pump on breaths. */
export const DUCK_BRIDGE_US = us(700_000)

export function voiceRegions(scene: Scene): UsRange[] {
  const captions = scene.tracks
    .filter((track) => track.kind === "caption" && !track.hidden)
    .flatMap((track) => track.elements)
    .filter((element): element is CaptionElement => element.kind === "caption")
  if (captions.length > 0) return speechRegions(captions, DUCK_BRIDGE_US)

  const spans: UsRange[] = []
  for (const track of scene.tracks) {
    if (track.kind !== "video" || track.muted) continue
    for (const element of track.elements) {
      if (element.kind !== "video" || element.muted || element.volume <= 0) continue
      spans.push({
        startUs: element.startUs,
        endUs: us(element.startUs + element.durationUs),
      })
    }
  }
  spans.sort((a, b) => a.startUs - b.startUs)
  const merged: UsRange[] = []
  for (const span of spans) {
    const last = merged[merged.length - 1]
    if (last && span.startUs - last.endUs <= DUCK_BRIDGE_US) {
      last.endUs = us(Math.max(last.endUs, span.endUs))
    } else merged.push({ ...span })
  }
  return merged
}

/**
 * The bed's gain multiplier at a scene instant: 1 in the clear, `amount`
 * under speech, ramped over attack (going down) and release (coming up).
 */
export function duckGain(
  atUs: number,
  regions: UsRange[],
  ducking: Ducking | undefined
): number {
  if (!ducking?.enabled || regions.length === 0) return 1
  const low = Math.min(1, Math.max(0, ducking.amount))
  const attack = Math.max(1, ducking.attackUs)
  const release = Math.max(1, ducking.releaseUs)

  let gain = 1
  for (const region of regions) {
    if (atUs < region.startUs - attack) break
    if (atUs >= region.startUs && atUs < region.endUs) return low
    if (atUs < region.startUs) {
      // Coming down ahead of the voice.
      const t = (region.startUs - atUs) / attack
      gain = Math.min(gain, low + (1 - low) * t)
    } else if (atUs < region.endUs + release) {
      // Coming back up after it.
      const t = (atUs - region.endUs) / release
      gain = Math.min(gain, low + (1 - low) * t)
    }
  }
  return gain
}

/** A bed's gain at an instant inside it: volume, its fades and the duck. */
export function bedGain(
  element: AudioElement,
  elementUs: number,
  regions: UsRange[]
): number {
  if (element.muted) return 0
  return element.volume * duckGain(element.startUs + elementUs, regions, element.ducking)
}
