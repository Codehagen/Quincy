import { insertOnSpine, MAX_FREEZE_US, MINIMUM_CLIP_US } from "./edits"
import type { EditOp } from "./ops"
import { findMainTrack, timelineToSourceUs } from "./timeline"
import { us } from "./time"
import type { Author, Scene, VideoElement } from "./types"

/** How long a new still holds when nobody says. Long enough to read a face. */
export const DEFAULT_FREEZE_US = 2_000_000

/**
 * Hold the frame under the playhead.
 *
 * The clip there is split at the playhead and a still of that frame goes
 * between the halves, so the picture stops, holds, and plays on from where it
 * stopped. The hold is silent and pushes the rest of the cut along with its
 * captions, like any insert on the spine. One batch, one undo.
 *
 * The still is a video clip with `frozen` set and an empty source window
 * (types.ts), so it trims, moves, zooms and deletes like any other clip,
 * and nothing in the transcript lands inside it.
 */
export function freezeFrame(
  scene: Scene,
  atUs: number,
  durationUs: number = DEFAULT_FREEZE_US,
  author: Author = "user"
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []
  const hit = timelineToSourceUs(spine, atUs)
  if (!hit) return []

  const length = us(
    Math.round(Math.min(MAX_FREEZE_US, Math.max(MINIMUM_CLIP_US, durationUs)))
  )
  const { speed: _speed, transition: _transition, ...rest } = hit.clip
  const still: VideoElement = {
    ...rest,
    name: `${hit.clip.name} (still)`,
    startUs: us(0),
    durationUs: length,
    trimStartUs: hit.sourceUs,
    trimEndUs: hit.sourceUs,
    frozen: true,
    // A held frame is a picture of a moment, not a continuing push: the
    // clip's zooms and keyframes stay with the footage they were set on.
    effects: [],
    animations: { channels: {} },
  }
  return insertOnSpine(scene, still, atUs, author)
}
