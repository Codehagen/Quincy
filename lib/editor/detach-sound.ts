import { aimed, newElement, type EditOp } from "./ops"
import { placeElement } from "./placement"
import { clipRate } from "./timeline"
import type { AudioElement, Author, Scene, VideoElement } from "./types"

/**
 * Take a clip's sound off it, onto a lane of its own.
 *
 * The sound becomes an audio clip of the same recording and the same window,
 * placed where the clip is, and the clip itself goes quiet. From then on the
 * two are separate: the sound can run on under the next shot (or start before
 * this one), get its own level and fades, or be deleted. That freedom is the
 * point, and it also means the sound does not follow the clip when the cut
 * ripples: it stays where it was put, as detached sound does.
 *
 * Refuses a still (it has no sound), a clip already quiet, and a clip played
 * at another speed, whose sound an audio clip has no way to retime.
 */
export function detachSound(
  scene: Scene,
  trackId: string,
  elementId: string,
  author: Author = "user"
): EditOp[] {
  const track = scene.tracks.find((candidate) => candidate.id === trackId)
  const element = track?.elements.find(
    (candidate) => candidate.id === elementId
  )
  if (!track || !element || element.kind !== "video") return []
  const clip = element as VideoElement
  if (clip.frozen || clip.muted || clipRate(clip) !== 1) return []

  const sound = newElement<AudioElement>(
    {
      kind: "audio",
      name: `${clip.name} (sound)`,
      mediaId: clip.mediaId,
      startUs: clip.startUs,
      durationUs: clip.durationUs,
      trimStartUs: clip.trimStartUs,
      trimEndUs: clip.trimEndUs,
      sourceDurationUs: clip.sourceDurationUs,
      volume: clip.volume,
      muted: false,
      animations: { channels: {} },
    },
    author
  )

  return [
    ...aimed(
      [
        {
          op: "update_element",
          sceneId: scene.id,
          trackId,
          elementId,
          patch: { muted: true },
        },
      ],
      { action: "press", kind: "element", trackId, elementId }
    ),
    ...placeElement(scene, sound, { trackName: "Sound" }),
  ]
}
