import type { Track, VideoElement } from "./types"

/**
 * Soft audio at a cut.
 *
 * Where two pieces of a take are butted together, the waveform jumps from
 * wherever one piece stopped to wherever the next one starts. Even with the
 * cut on a quiet instant (refine-cuts.ts) the jump can land mid-cycle and
 * click. A frame of ramp either side of a join takes the click out without
 * taking a syllable: cuts are padded, so the frame at an edge is room tone.
 *
 * Only joins that are actually cuts are softened. A clip that runs on into
 * the next piece of the same recording (a split that was never moved) is
 * continuous sound, and ramping there would put a dip where nothing changed.
 */

export type AudioEdges = { in: boolean; out: boolean }

/** Frames of ramp at a softened edge. */
export const EDGE_FRAMES = 1

export function cutEdges(track: Track): Map<string, AudioEdges> {
  const clips = track.elements
    .filter(
      (element): element is VideoElement =>
        element.kind === "video" && !element.hidden
    )
    .sort((a, b) => a.startUs - b.startUs)

  const edges = new Map<string, AudioEdges>()
  clips.forEach((clip, index) => {
    const before = clips[index - 1]
    const after = clips[index + 1]
    edges.set(clip.id, {
      in: Boolean(before) && !continuous(before, clip),
      out: Boolean(after) && !continuous(clip, after),
    })
  })
  return edges
}

/** Two clips that play as one sound: back to back on the timeline and in the source. */
function continuous(first: VideoElement, second: VideoElement) {
  return (
    first.mediaId === second.mediaId &&
    first.startUs + first.durationUs === second.startUs &&
    first.trimEndUs === second.trimStartUs
  )
}

/**
 * The gain on one frame of a clip `length` frames long: a linear ramp over
 * `EDGE_FRAMES` at each softened edge, one everywhere else.
 */
export function edgeGain(
  frame: number,
  length: number,
  edges: AudioEdges | undefined
): number {
  if (!edges) return 1
  let gain = 1
  if (edges.in && frame < EDGE_FRAMES) {
    gain = Math.min(gain, (frame + 1) / (EDGE_FRAMES + 1))
  }
  const fromEnd = length - 1 - frame
  if (edges.out && fromEnd < EDGE_FRAMES) {
    gain = Math.min(gain, (fromEnd + 1) / (EDGE_FRAMES + 1))
  }
  return gain
}
