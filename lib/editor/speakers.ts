import { deleteSpeech } from "./edits"
import type { EditOp } from "./ops"
import { us, type UsRange } from "./time"
import type {
  CaptionElement,
  CaptionToken,
  DocumentMetadata,
  Scene,
} from "./types"

/**
 * Who is talking. The transcriber numbers the voices it hears; the person
 * gives the numbers names once, for the whole project, and the transcript and
 * subtitle files read them from `metadata.speakers`.
 */

export const MAX_SPEAKER_NAME = 40

/** The speaker numbers in a scene, in the order they first talk. */
export function speakerNumbers(scene: Scene): number[] {
  const seen: { speaker: number; at: number }[] = []
  for (const track of scene.tracks) {
    if (track.kind !== "caption") continue
    for (const element of track.elements as CaptionElement[]) {
      if (element.kind !== "caption") continue
      for (const token of element.tokens) {
        if (token.speaker === undefined) continue
        const at = element.startUs + token.startUs
        const known = seen.find((entry) => entry.speaker === token.speaker)
        if (!known) seen.push({ speaker: token.speaker, at })
        else if (at < known.at) known.at = at
      }
    }
  }
  return seen.sort((a, b) => a.at - b.at).map((entry) => entry.speaker)
}

export function speakerLabel(
  speaker: number,
  speakers: DocumentMetadata["speakers"]
): string {
  return speakers?.[String(speaker)] ?? `Speaker ${speaker + 1}`
}

/** Name (or, with an empty name, un-name) one speaker. */
export function nameSpeaker(
  metadata: DocumentMetadata,
  speaker: number,
  name: string
): EditOp[] {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, MAX_SPEAKER_NAME)
  const current = metadata.speakers ?? {}
  if ((current[String(speaker)] ?? "") === clean) return []
  const next = { ...current }
  if (clean) next[String(speaker)] = clean
  else delete next[String(speaker)]
  return [{ op: "update_metadata", patch: { speakers: next } }]
}

/**
 * Cut everything one speaker says, and close up the gaps.
 *
 * A turn runs from the speaker's first word to the next word someone else
 * says, so the pause after a turn goes with it and the cut lands on the
 * other voice starting, not on a breath of silence. The last turn ends with
 * its own last word. The ranges are in the recording's own time, so the cut
 * goes through `deleteSpeech` like a phrase struck in the transcript: one
 * revision, one undo, and it refuses to empty the cut.
 */
export function cutSpeaker(scene: Scene, speaker: number): EditOp[] {
  const words: { at: number; token: CaptionToken }[] = []
  for (const track of scene.tracks) {
    if (track.kind !== "caption") continue
    for (const element of track.elements as CaptionElement[]) {
      if (element.kind !== "caption") continue
      for (const token of element.tokens) {
        words.push({ at: element.startUs + token.startUs, token })
      }
    }
  }
  words.sort((a, b) => a.at - b.at)

  const byMedia = new Map<string, UsRange[]>()
  let open: { mediaId: string; startUs: number; endUs: number } | null = null
  const close = (endUs: number) => {
    if (!open) return
    const ranges = byMedia.get(open.mediaId) ?? []
    if (endUs > open.startUs)
      ranges.push({ startUs: us(open.startUs), endUs: us(endUs) })
    byMedia.set(open.mediaId, ranges)
    open = null
  }

  for (const { token } of words) {
    if (token.speaker === speaker) {
      if (open && open.mediaId !== token.sourceMediaId) close(open.endUs)
      if (!open)
        open = {
          mediaId: token.sourceMediaId,
          startUs: token.sourceStartUs,
          endUs: token.sourceEndUs,
        }
      else open.endUs = Math.max(open.endUs, token.sourceEndUs)
      continue
    }
    if (!open) continue
    // Someone else talks: the turn ends where they start, when that is in
    // the same recording and after it; otherwise on the turn's last word.
    close(
      token.sourceMediaId === open.mediaId && token.sourceStartUs >= open.endUs
        ? token.sourceStartUs
        : open.endUs
    )
  }
  if (open) close((open as { endUs: number }).endUs)

  const cuts = [...byMedia].map(([mediaId, ranges]) => ({ mediaId, ranges }))
  return cuts.length ? deleteSpeech(scene, cuts) : []
}
