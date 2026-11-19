import type { EditOp } from "./ops"
import type { CaptionElement, DocumentMetadata, Scene } from "./types"

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
