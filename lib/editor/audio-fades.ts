import { newKeyframe, type EditOp } from "./ops"
import { us } from "./time"
import type { AudioElement, Scene } from "./types"

/**
 * Fades on a sound clip: up from silence at its start, down to silence at
 * its end.
 *
 * Written as the clip's `volume` channel (0 to 1, element-local), which the
 * composition already multiplies into the bed's gain (composition.tsx
 * `fadeGain`), so a fade is heard in the preview and the export the same
 * way, with no new field for either to learn.
 */

export type AudioFades = { inUs: number; outUs: number }

/** The fades a clip carries now, read off its volume channel. Absent is none. */
export function audioFades(element: AudioElement): AudioFades {
  const keys = element.animations.channels["volume"]?.keys ?? []
  if (keys.length === 0) return { inUs: 0, outUs: 0 }
  const first = keys[0]
  const last = keys[keys.length - 1]
  const inUs =
    first.value === 0 && keys.length > 1 ? keys[1].timeUs - first.timeUs : 0
  const outUs =
    last.value === 0 && keys.length > 1
      ? last.timeUs - keys[keys.length - 2].timeUs
      : 0
  return { inUs: Math.max(0, inUs), outUs: Math.max(0, outUs) }
}

/**
 * Set both fades on a sound clip. Each is clamped so the two never cross:
 * together they take at most the whole clip. Zero on both clears the
 * channel.
 */
export function setAudioFades(
  scene: Scene,
  trackId: string,
  elementId: string,
  fades: AudioFades
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find(
    (candidate) => candidate.id === elementId
  )
  if (!track || !element || element.kind !== "audio") return []
  const clip = element as AudioElement
  const length = clip.durationUs

  let inUs = Math.max(0, Math.round(fades.inUs))
  let outUs = Math.max(0, Math.round(fades.outUs))
  if (inUs + outUs > length) {
    const scale = length / (inUs + outUs)
    inUs = Math.floor(inUs * scale)
    outUs = Math.floor(outUs * scale)
  }

  const channels = { ...clip.animations.channels }
  if (inUs === 0 && outUs === 0) {
    delete channels["volume"]
  } else {
    const keys = [
      ...(inUs > 0
        ? [
            newKeyframe({ timeUs: us(0), value: 0, interpolation: "linear" }),
            newKeyframe({
              timeUs: us(inUs),
              value: 1,
              interpolation: "linear",
            }),
          ]
        : [newKeyframe({ timeUs: us(0), value: 1, interpolation: "linear" })]),
      ...(outUs > 0
        ? [
            newKeyframe({
              timeUs: us(length - outUs),
              value: 1,
              interpolation: "linear",
            }),
            newKeyframe({
              timeUs: us(length),
              value: 0,
              interpolation: "linear",
            }),
          ]
        : [
            newKeyframe({
              timeUs: us(length),
              value: 1,
              interpolation: "linear",
            }),
          ]),
    ]
    channels["volume"] = { path: "volume", keys }
  }

  return [
    {
      op: "update_element",
      sceneId: scene.id,
      trackId,
      elementId,
      patch: { animations: { channels } },
      target: { action: "press", kind: "element", trackId, elementId },
    },
  ]
}
