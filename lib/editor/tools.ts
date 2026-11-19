import { createIdGenerator } from "ai"

import { DEFAULT_CAPTION_STYLE } from "./document"
import { aimed, applyToScene, newElement, type EditOp } from "./ops"
import { stampFields } from "./provenance"
import {
  findMainTrack,
  layOut,
  remapCaptions,
  splitBySourceRanges,
} from "./timeline"
import { timelineSpans } from "./edits"
import { us, type Us, type UsRange } from "./time"
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

  return aimed(
    [
      ...(captions.op ? [captions.op] : []),
      {
        op: "replace_elements",
        sceneId: scene.id,
        trackId: captions.id,
        elements: placed,
      },
    ],
    // The desk's "+ Captions from the transcript" control, which is what a
    // person would press for the same edit.
    { action: "press", kind: "control", control: "captions" }
  )
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
  const silences = detectSilences(
    words,
    options.sourceDurationUs,
    options.silence ?? DEFAULT_SILENCE
  )
  if (silences.length === 0) return []

  return cutSourceRanges(scene, silences, options)
}

/**
 * The most presses one tightening is drawn as.
 *
 * A ceiling on what one run streams, not on what it removes: every step
 * re-sends the spine (and the caption lane, when it has captions), so a take
 * with two hundred pauses as two hundred steps would stream the spine two
 * hundred times and keep the cursor busy for a minute. Past this, neighbouring
 * pauses share a step.
 */
export const MAX_CUT_STEPS = 12

/**
 * Caption elements one tightening may re-send, summed over its steps.
 *
 * The caption lane rides with every step so the words never drift from the
 * picture mid-run, and on a long take with word-by-word captions that is the
 * heavy part of the stream. A lane of 300 captions gets four steps, not twelve.
 */
export const MAX_CAPTION_ELEMENTS_STREAMED = 1200

/**
 * The same tightening as `removeSilences`, as a sequence of steps: one pause
 * (or a few neighbouring ones, past `MAX_CUT_STEPS`) per step, in the order
 * they sit on the timeline.
 *
 * What the agent streams, so Quincy's cursor can drag across each pause and
 * press ⌫ on it, and the press is that step's op landing. Each step is built
 * against the scene the previous steps left, so every intermediate timeline is
 * a whole, consistent cut: the spine and the captions move together in every
 * step, which is the reason removeSilences batches in the first place.
 * Applied in order, the steps arrive at the same cut as `removeSilences`.
 */
export function removeSilenceSteps(
  scene: Scene,
  words: Word[],
  options: {
    mediaId: string
    author: Author
    sourceDurationUs: Us
    silence?: SilenceOptions
  }
): EditOp[][] {
  const silences = detectSilences(
    words,
    options.sourceDurationUs,
    options.silence ?? DEFAULT_SILENCE
  )
  if (silences.length === 0) return []

  const captionCount = scene.tracks
    .filter((track) => track.kind === "caption")
    .reduce((sum, track) => sum + track.elements.length, 0)
  const maxSteps =
    captionCount === 0
      ? MAX_CUT_STEPS
      : Math.max(
          1,
          Math.min(
            MAX_CUT_STEPS,
            Math.floor(MAX_CAPTION_ELEMENTS_STREAMED / captionCount)
          )
        )

  const steps: EditOp[][] = []
  let current = scene

  for (const group of chunk(silences, maxSteps)) {
    const ops = cutSourceRanges(current, group, options)
    if (ops.length === 0) continue

    steps.push(ops)
    current = applyToScene(current, ops, options.author)
  }

  return steps
}

/** Split a list into at most `count` runs of neighbours, as even as it goes. */
function chunk<T>(items: T[], count: number): T[][] {
  const size = Math.ceil(items.length / Math.max(1, count))
  const out: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    out.push(items.slice(index, index + size))
  }
  return out
}

/**
 * Cut source ranges out of the spine and bring the captions with them.
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
function cutSourceRanges(
  scene: Scene,
  ranges: UsRange[],
  options: { mediaId: string; author: Author }
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine) return []

  const cut = spine.elements.flatMap((element) => {
    if (element.kind !== "video" || element.mediaId !== options.mediaId) {
      return [element]
    }

    const pieces = splitBySourceRanges(element, ranges, newElementId)
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
  // Nothing changed: every range fell outside what the spine still plays.
  const unchanged =
    cut.length === spine.elements.length &&
    cut.every((element, index) => element === spine.elements[index])
  if (unchanged) return []

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

  // The pauses as the lanes draw them now: what the cursor drags across.
  return aimed(ops, {
    action: "cut",
    kind: "range",
    trackId: spine.id,
    spans: timelineSpans(spine, [{ mediaId: options.mediaId, ranges }]),
  })
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
