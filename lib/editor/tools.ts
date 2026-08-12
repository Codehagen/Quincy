import { createIdGenerator } from "ai"

import { DEFAULT_CAPTION_STYLE } from "./document"
import { newElement, type EditOp } from "./ops"
import { stampFields } from "./provenance"
import {
  findMainTrack,
  layOut,
  remapCaptions,
  splitBySourceRanges,
} from "./timeline"
import { us, type Us } from "./time"
import {
  buildCaptionSeeds,
  detectSilences,
  DEFAULT_SILENCE,
  type SilenceOptions,
  type Word,
} from "./transcript"
import type {
  Author,
  CaptionElement,
  CaptionStyle,
  Scene,
  Track,
  VideoElement,
} from "./types"

/**
 * The edits that read the transcript.
 *
 * These are the two things the studio chat promises, written as pure functions
 * from (scene, transcript, intent) to ops — the same shape as the hand edits in
 * ./edits.ts and for the same reason. When the agent's tool route lands it calls
 * these; a button calls them today. Neither path can produce a change the other
 * cannot, and both land in one revision with one undo.
 *
 * They live apart from edits.ts because of what they need: a hand edit needs the
 * scene and a pointer position, and these need the words. That is a real seam —
 * the transcript is fetched separately and may not have arrived — so the caller
 * being forced to have it in hand is the type system saying so.
 */

const newElementId = createIdGenerator({ prefix: "ve", size: 16 })

/** A caption sits centred, at the position the default style was designed for. */
const CAPTION_TRANSFORM = {
  position: { x: 0, y: 0 },
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
}

/**
 * Build the caption lane from the transcript.
 *
 * Captions are not created at import, deliberately: burning words onto a frame
 * is a style decision, and one nobody made while dragging a file onto a page.
 * The transcript is stored on the asset from the moment it lands, so this is
 * always available and never automatic.
 *
 * The seeds come out in *source* time and `remapCaptions` places them, rather
 * than positioning them here. That is the difference between captions that
 * survive editing and captions that need rebuilding: every token keeps the asset
 * instant its word was spoken at, so after a cut the lookup finds where that
 * instant landed. Positioning them here would be correct exactly once.
 *
 * Replaces the lane rather than appending to it. Running this twice is
 * something a person will do — after changing the words-per-segment, after a
 * re-transcribe — and appending would give them every word twice.
 */
export function addCaptions(
  scene: Scene,
  words: Word[],
  options: {
    mediaId: string
    author: Author
    style?: CaptionStyle
    /** 1 is the word-by-word look. Higher reads as a phrase at a time. */
    wordsPerSegment?: number
  }
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine || words.length === 0) return []

  const anchor = spine.elements.find(
    (element): element is VideoElement =>
      element.kind === "video" && element.mediaId === options.mediaId
  )
  if (!anchor) return []

  const style = options.style ?? DEFAULT_CAPTION_STYLE
  const seeds = buildCaptionSeeds(words, {
    mediaId: options.mediaId,
    elementId: anchor.id,
    wordsPerSegment: options.wordsPerSegment ?? style.wordsPerSegment,
  })

  const built = seeds.map((seed) =>
    newElement<CaptionElement>(
      {
        kind: "caption",
        // The words themselves, so the lane and its tooltips read as the talk
        // rather than as "Caption 41".
        name: seed.tokens.map((token) => token.text).join(" "),
        // Source time, and replaced by the remap below. Kept honest rather than
        // zeroed so a seed is a valid element on its own.
        startUs: seed.startUs,
        durationUs: us(seed.endUs - seed.startUs),
        tokens: seed.tokens,
        style,
        transform: CAPTION_TRANSFORM,
      },
      options.author
    )
  )

  const captions = captionTrack(scene)
  const placed = remapCaptions(built, spine)

  return [
    ...(captions.op ? [captions.op] : []),
    {
      op: "replace_elements",
      sceneId: scene.id,
      trackId: captions.id,
      elements: placed,
    },
  ]
}

/**
 * Cut the pauses out of the spine and bring the captions with them.
 *
 * The whole edit is one batch. Splitting the spine, closing the gaps and
 * repositioning several hundred captions are three changes to one cut, and
 * applying them separately would render a timeline where the clips have moved
 * and the words have not — which for the few frames it lasts looks exactly like
 * the bug this function exists to avoid.
 *
 * Captions are remapped rather than shifted. Remove two separate silences and
 * every word after the second one has moved by a different amount than the
 * words between them, so a single delta is wrong the moment there is more than
 * one cut.
 */
export function removeSilences(
  scene: Scene,
  words: Word[],
  options: {
    mediaId: string
    author: Author
    /** The asset's full length. Without it the tail cannot be found. */
    sourceDurationUs: Us
    silence?: SilenceOptions
  }
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []

  const silences = detectSilences(
    words,
    options.sourceDurationUs,
    options.silence ?? DEFAULT_SILENCE
  )
  if (silences.length === 0) return []

  const cut = spine.elements.flatMap((element) => {
    if (element.kind !== "video" || element.mediaId !== options.mediaId) {
      return [element]
    }

    const pieces = splitBySourceRanges(element, silences, newElementId)
    // Unchanged clips come back as the same object and must not be repainted
    // as somebody's work. The rest had their window moved, and `replace_elements`
    // does not stamp the way `update_element` does, so it is stamped here — or
    // undoing a tightening run would leave every piece looking like the user's.
    if (pieces.length === 1 && pieces[0] === element) return pieces

    return pieces.map((piece) => ({
      ...piece,
      provenance: stampFields(piece.provenance, options.author, [
        "startUs",
        "durationUs",
        "trimStartUs",
        "trimEndUs",
      ]),
    }))
  })

  // Nothing survived: every word was inside a range we were told to remove.
  // An empty spine is not a tightened cut, so refuse rather than deliver one.
  if (cut.length === 0) return []

  const tightened: Track = { ...spine, elements: layOut(cut) }

  const ops: EditOp[] = [
    {
      op: "replace_elements",
      sceneId: scene.id,
      trackId: spine.id,
      elements: tightened.elements,
    },
  ]

  // Only the lanes that have something on them. A replace_elements against an
  // empty caption track is a revision that changes nothing and still counts as
  // an edit to undo.
  for (const track of scene.tracks) {
    if (track.kind !== "caption" || track.elements.length === 0) continue

    ops.push({
      op: "replace_elements",
      sceneId: scene.id,
      trackId: track.id,
      elements: remapCaptions(
        track.elements.filter(
          (element): element is CaptionElement => element.kind === "caption"
        ),
        tightened
      ),
    })
  }

  return ops
}

/**
 * The caption lane, and the op that creates it if the scene has none.
 *
 * A fresh import already has one — `documentForAsset` makes an empty caption
 * track on purpose, so the timeline does not change height the moment captions
 * arrive. This covers the scene that does not, without making the caller
 * branch on it.
 */
function captionTrack(scene: Scene): { id: string; op?: EditOp } {
  const existing = scene.tracks.find((track) => track.kind === "caption")
  if (existing) return { id: existing.id }

  const id = `vt-captions-${scene.id}`

  return {
    id,
    op: {
      op: "add_track",
      sceneId: scene.id,
      id,
      track: { kind: "caption", name: "Captions", elements: [] },
    },
  }
}
