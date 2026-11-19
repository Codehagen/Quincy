import { createIdGenerator } from "ai"

import { DEFAULT_CAPTION_STYLE } from "./document"
import { aimed, applyToScene, newElement, type EditOp } from "./ops"
import { stampFields } from "./provenance"
import { keepCorrections } from "./correct-words"
import {
  clipRate,
  findMainTrack,
  layOut,
  remapCaptions,
  sourceToTimelineUs,
  splitBySourceRanges,
} from "./timeline"
import { timelineSpans } from "./edits"
import { us, type Us, type UsRange } from "./time"
import {
  buildCaptionSeeds,
  detectSilences,
  DEFAULT_SILENCE,
  fillerCuts,
  type AudioPeaks,
  type SilenceOptions,
  type Word,
} from "./transcript"
import {
  cleanUpCuts,
  DEFAULT_CLEAN_UP,
  keptWordIndex,
  type Disfluency,
  type DisfluencyKind,
} from "./disfluency"
import { refineCuts } from "./refine-cuts"
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
    /** The project's caption rules (document.ts `captionRules`). */
    rules?: number
    /** Show filler sounds on the captions (rules 2 hide them). */
    showFillers?: boolean
  }
): EditOp[] {
  const spine = findMainTrack(scene)
  if (!spine || words.length === 0) return []

  const anchor = spine.elements.find(
    (element): element is VideoElement =>
      element.kind === "video" && element.mediaId === options.mediaId
  )
  if (!anchor) return []

  // The settings the captions were built with, stored on them, so a
  // rebuild (restoreSpeech) and a saved style read what was asked for and
  // not the default the style started from.
  const base = options.style ?? DEFAULT_CAPTION_STYLE
  const style: CaptionStyle = {
    ...base,
    wordsPerSegment: options.wordsPerSegment ?? base.wordsPerSegment,
    ...(options.showFillers !== undefined
      ? { showFillers: options.showFillers }
      : {}),
  }
  const seeds = buildCaptionSeeds(words, {
    mediaId: options.mediaId,
    elementId: anchor.id,
    wordsPerSegment: style.wordsPerSegment,
    rules: options.rules,
    showFillers: style.showFillers,
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

  // Rebuilding the lane keeps the words the person already corrected.
  return keepCorrections(scene, aimed(
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
  ))
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
    /** The take's audio energy: cut edges move to the quietest instant near them. */
    peaks?: AudioPeaks | null
  }
): EditOp[][] {
  const silences = detectSilences(
    words,
    options.sourceDurationUs,
    options.silence ?? DEFAULT_SILENCE
  )
  if (silences.length === 0) return []

  return cutSteps(scene, refineCuts(silences, words, options.peaks), options)
}

/**
 * Cut source ranges in steps, at most `MAX_CUT_STEPS` of them and within
 * the caption ceiling, each built against the scene the last one left.
 * Shared by the pauses and the fillers, so both stream the same way.
 */
function cutSteps(
  scene: Scene,
  ranges: UsRange[],
  options: { mediaId: string; author: Author }
): EditOp[][] {
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

  for (const group of chunk(ranges, maxSteps)) {
    const ops = cutSourceRanges(current, group, options)
    if (ops.length === 0) continue

    steps.push(ops)
    current = applyToScene(current, ops, options.author)
  }

  return steps
}

/**
 * Cut the standalone fillers out of the spine, in steps, captions with them.
 *
 * Only the fillers that still play: one inside a stretch an earlier edit
 * removed is not in the cut, and naming it as removed would be a receipt
 * for nothing. Returns the steps and the filler words they take, so the
 * tool can say which went.
 */
export function removeFillerSteps(
  scene: Scene,
  words: Word[],
  options: {
    mediaId: string
    author: Author
    sourceDurationUs: Us
    include?: readonly string[]
    peaks?: AudioPeaks | null
  }
): { steps: EditOp[][]; removed: Word[] } {
  const spine = findMainTrack(scene)
  if (!spine) return { steps: [], removed: [] }

  const plays = (word: Word) =>
    sourceToTimelineUs(
      spine,
      options.mediaId,
      us(Math.round((word.startUs + word.endUs) / 2))
    ) !== null

  const cuts = fillerCuts(words, options.sourceDurationUs, {
    include: options.include,
  }).filter((cut) => cut.fillers.some(plays))
  if (cuts.length === 0) return { steps: [], removed: [] }

  const steps = cutSteps(
    scene,
    refineCuts(
      cuts.map((cut) => cut.range),
      words,
      options.peaks
    ),
    options
  )
  return {
    steps,
    removed:
      steps.length === 0
        ? []
        : cuts.flatMap((cut) => cut.fillers.filter(plays)),
  }
}

/**
 * Clean the speech up: repeats, false starts, and (when asked) set-off filler
 * phrases, with the hesitations among them. In steps, captions with them, the
 * same way the fillers go.
 *
 * Only what still plays: a stumble inside a stretch already cut is not in
 * the cut, and the receipt names only what this run took.
 */
export function cleanUpSteps(
  scene: Scene,
  words: Word[],
  options: {
    mediaId: string
    author: Author
    sourceDurationUs: Us
    kinds?: readonly DisfluencyKind[]
    peaks?: AudioPeaks | null
  }
): { steps: EditOp[][]; removed: Disfluency[] } {
  const spine = findMainTrack(scene)
  if (!spine) return { steps: [], removed: [] }

  const wordPlays = (word: Word) =>
    sourceToTimelineUs(
      spine,
      options.mediaId,
      us(Math.round((word.startUs + word.endUs) / 2))
    ) !== null
  // Still in the cut, and so is the word it leans on (disfluency.ts
  // `keptWordIndex`): never the last copy left after a hand edit.
  const plays = (item: Disfluency) => {
    const kept = keptWordIndex(words, item)
    return (
      words.slice(item.from, item.to + 1).some(wordPlays) &&
      (kept === null || wordPlays(words[kept]))
    )
  }

  const cuts = cleanUpCuts(
    words,
    options.sourceDurationUs,
    options.kinds ?? DEFAULT_CLEAN_UP
  ).filter((cut) => cut.found.some(plays))
  if (cuts.length === 0) return { steps: [], removed: [] }

  const steps = cutSteps(
    scene,
    refineCuts(
      cuts.map((cut) => cut.range),
      words,
      options.peaks
    ),
    options
  )
  return {
    steps,
    removed:
      steps.length === 0 ? [] : cuts.flatMap((cut) => cut.found.filter(plays)),
  }
}

/**
 * Bring a cut stretch of the recording back, and the words in it.
 *
 * The other half of editing by transcript: a word that was cut stays on the
 * page, struck through, and one click restores the stretch it sits in — the
 * whole gap between the two pieces that still play either side of it, since
 * that is the one thing that was taken out. The piece before the gap grows
 * back over it (or, at the take's head, the piece after), so the stretch
 * plays where it was in the recording and no new clip appears.
 *
 * Captions, when the cut has them, are rebuilt from the transcript in the
 * style they already have: the restored words had no caption tokens left to
 * remap, because a cut drops them.
 */
export function restoreSpeech(
  scene: Scene,
  options: {
    mediaId: string
    /** Any source instant inside the stretch to bring back. */
    atUs: Us
    sourceDurationUs: Us
    words?: Word[] | null
    rules?: number
    author?: Author
  }
): EditOp[] {
  const author = options.author ?? "user"
  const spine = findMainTrack(scene)
  if (!spine) return []

  const pieces = spine.elements.filter(
    (element): element is VideoElement =>
      element.kind === "video" && element.mediaId === options.mediaId
  )
  if (pieces.length === 0) return []
  if (sourceToTimelineUs(spine, options.mediaId, options.atUs) !== null)
    return []

  const gap = cutGapAround(pieces, options.atUs, options.sourceDurationUs)
  if (!gap) return []

  // Where it goes on the spine: after the piece that ends where the gap
  // starts, or before the one that starts where it ends.
  const previous = pieces
    .filter((piece) => piece.trimEndUs <= gap.startUs)
    .sort((a, b) => b.trimEndUs - a.trimEndUs)[0]
  const following = pieces
    .filter((piece) => piece.trimStartUs >= gap.endUs)
    .sort((a, b) => a.trimStartUs - b.trimStartUs)[0]
  if (!previous && !following) return []

  // The piece before the gap grows at its end, which moves nothing on it.
  // With no piece before (the gap is the take's head), the piece after grows
  // at its head, and its curves move with it so they stay on their frames.
  const fields = ["startUs", "durationUs", "trimStartUs", "trimEndUs"]
  // The gap is source time; on a clip at another speed it plays for
  // source ÷ rate on the timeline.
  const piece = previous ?? following!
  const gapUs = Math.round((gap.endUs - gap.startUs) / clipRate(piece))
  const grown: VideoElement = previous
    ? {
        ...previous,
        trimEndUs: gap.endUs,
        durationUs: us(previous.durationUs + gapUs),
        provenance: stampFields(previous.provenance, author, fields),
      }
    : {
        ...following!,
        trimStartUs: gap.startUs,
        durationUs: us(following!.durationUs + gapUs),
        animations: shiftAnimations(following!, gapUs),
        provenance: stampFields(following!.provenance, author, fields),
      }
  const replaced = previous ?? following!
  const joined = spine.elements.map((element) =>
    element === replaced ? grown : element
  )

  const laid = layOut(joined)
  const after: Track = { ...spine, elements: laid }
  const ops: EditOp[] = [
    {
      op: "replace_elements",
      sceneId: scene.id,
      trackId: spine.id,
      elements: laid,
    },
  ]

  for (const track of scene.tracks) {
    if (track.kind !== "caption" || track.elements.length === 0) continue
    const captions = track.elements.filter(
      (element): element is CaptionElement => element.kind === "caption"
    )
    const style = captions[0]?.style ?? DEFAULT_CAPTION_STYLE
    if (options.words && options.words.length > 0) {
      const anchor = laid.find(
        (element): element is VideoElement =>
          element.kind === "video" && element.mediaId === options.mediaId
      )!
      const seeds = buildCaptionSeeds(options.words, {
        mediaId: options.mediaId,
        elementId: anchor.id,
        wordsPerSegment: style.wordsPerSegment,
        rules: options.rules,
        showFillers: style.showFillers,
      })
      const others = captions.filter(
        (caption) => caption.tokens[0]?.sourceMediaId !== options.mediaId
      )
      const rebuilt = seeds.map((seed) =>
        newElement<CaptionElement>(
          {
            kind: "caption",
            name: seed.tokens.map((token) => token.text).join(" "),
            startUs: seed.startUs,
            durationUs: us(seed.endUs - seed.startUs),
            tokens: seed.tokens,
            style,
            transform: captions[0]?.transform ?? CAPTION_TRANSFORM,
          },
          author
        )
      )
      ops.push({
        op: "replace_elements",
        sceneId: scene.id,
        trackId: track.id,
        elements: remapCaptions([...others, ...rebuilt], after),
      })
    } else {
      ops.push({
        op: "replace_elements",
        sceneId: scene.id,
        trackId: track.id,
        elements: remapCaptions(captions, after),
      })
    }
  }

  const landed =
    sourceToTimelineUs(after, options.mediaId, gap.startUs) ?? us(0)
  // A rebuild from the transcript keeps the words the person corrected.
  return keepCorrections(
    scene,
    aimed(ops, {
      action: "press",
      kind: "range",
      trackId: spine.id,
      spans: [{ startUs: landed, endUs: us(landed + gapUs) }],
    })
  )
}

/**
 * The stretch of the recording that was cut around a source instant: from
 * the end of the piece that plays before it to the start of the piece that
 * plays after it (or the recording's own ends). Null when it plays.
 */
export function cutGapAround(
  pieces: VideoElement[],
  atUs: Us,
  sourceDurationUs: Us
): UsRange | null {
  if (
    pieces.some((piece) => atUs >= piece.trimStartUs && atUs < piece.trimEndUs)
  ) {
    return null
  }
  const startUs = pieces
    .map((piece) => piece.trimEndUs)
    .filter((end) => end <= atUs)
    .reduce<number>((best, end) => Math.max(best, end), 0)
  const endUs = pieces
    .map((piece) => piece.trimStartUs)
    .filter((start) => start > atUs)
    .reduce<number>((best, start) => Math.min(best, start), sourceDurationUs)
  return endUs > startUs ? { startUs: us(startUs), endUs: us(endUs) } : null
}

/** Keyframes on a clip that grew `byUs` at its head, moved to stay on their frames. */
function shiftAnimations(
  element: VideoElement,
  byUs: number
): VideoElement["animations"] {
  const channels: VideoElement["animations"]["channels"] = {}
  for (const [path, channel] of Object.entries(element.animations.channels)) {
    channels[path] = {
      ...channel,
      keys: channel.keys.map((key) => ({
        ...key,
        timeUs: us(key.timeUs + byUs),
      })),
    }
  }
  return { channels }
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
