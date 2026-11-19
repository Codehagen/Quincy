import {
  cleanUpCuts,
  DEFAULT_CLEAN_UP,
  detectDisfluencies,
  type Disfluency,
  type DisfluencyKind,
} from "./disfluency"
import { findMainTrack, sourceToTimelineUs } from "./timeline"
import { us, type Us, type UsRange } from "./time"
import { cutGapAround } from "./tools"
import type { Word } from "./transcript"
import type { Scene, VideoElement } from "./types"

/**
 * The transcript as an edit you can take back.
 *
 * The transcript panel reads the words that play from the captions
 * (transcript-view.ts). What it could not show is what was cut: a cut drops
 * its caption tokens, so the words are gone from the document — but not from
 * the recording's transcript. Read against the spine, those words are the
 * cuts, in the language the person spoke them in, and each one is a restore
 * away.
 *
 * Both functions here are pure reads of (scene, transcript). Nothing is
 * stored: the spine is the record of what was cut, and a second list of the
 * same thing is a second thing that can disagree with it.
 */

export type CutAway = {
  /** The gap's source start, which is unique per media. */
  id: string
  mediaId: string
  /** Where the gap sits on the timeline now: the instant the cut joins. */
  atUs: Us
  /** An instant inside the gap, for `restoreSpeech`. */
  sourceUs: Us
  /** The stretch of the recording that was cut. */
  gap: UsRange
  /** The words spoken in it, as transcribed. */
  text: string
}

/** Whether a word plays: its middle falls inside a piece of its media. */
function plays(pieces: VideoElement[], word: Word) {
  const mid = (word.startUs + word.endUs) / 2
  return pieces.some(
    (piece) => mid >= piece.trimStartUs && mid < piece.trimEndUs
  )
}

function piecesOf(scene: Scene, mediaId: string): VideoElement[] {
  return (findMainTrack(scene)?.elements ?? []).filter(
    (element): element is VideoElement =>
      element.kind === "video" && element.mediaId === mediaId
  )
}

/**
 * The spoken stretches that were cut from the take, one per gap, in timeline
 * order. A gap with no words in it (a silence) is left out: there is nothing
 * to read, and silences are restored by undo or by trimming the clip.
 */
export function cutAways(
  scene: Scene,
  mediaId: string,
  words: Word[],
  sourceDurationUs: Us
): CutAway[] {
  const spine = findMainTrack(scene)
  const pieces = piecesOf(scene, mediaId)
  if (!spine || pieces.length === 0) return []

  const groups = new Map<number, { gap: UsRange; words: Word[] }>()
  for (const word of words) {
    if (plays(pieces, word)) continue
    const mid = us(Math.round((word.startUs + word.endUs) / 2))
    const gap = cutGapAround(pieces, mid, sourceDurationUs)
    if (!gap) continue
    const group = groups.get(gap.startUs) ?? { gap, words: [] }
    group.words.push(word)
    groups.set(gap.startUs, group)
  }

  return [...groups.values()]
    .map(({ gap, words: cut }) => {
      // The cut joins at the end of the piece before the gap, or at the
      // start of the piece after it when the gap is the take's head.
      const before =
        gap.startUs > 0
          ? sourceToTimelineUs(spine, mediaId, us(gap.startUs - 1))
          : null
      const after = sourceToTimelineUs(spine, mediaId, gap.endUs)
      const atUs = before !== null ? us(before + 1) : (after ?? us(0))
      const first = cut[0]
      return {
        id: `${mediaId}:${gap.startUs}`,
        mediaId,
        atUs,
        sourceUs: us(Math.round((first.startUs + first.endUs) / 2)),
        gap,
        text: cut.map((word) => word.text).join(" "),
      }
    })
    .sort((a, b) => a.atUs - b.atUs)
}

export type ReviewItem = {
  /** Stable while the words are: the first word's source instant. */
  key: string
  kind: DisfluencyKind
  phrase: string
  /** Where it plays now, to listen before deciding. */
  atUs: Us
  found: Disfluency
}

/**
 * What a clean-up would take, as a list to review before anything is cut.
 *
 * Only stumbles whose words all still play: one already cut is in the cut
 * list above, not here. Discourse fillers are listed too but start unticked,
 * since "like" set off by commas is sometimes the point.
 */
export function cleanUpReview(
  scene: Scene,
  mediaId: string,
  words: Word[]
): ReviewItem[] {
  const spine = findMainTrack(scene)
  const pieces = piecesOf(scene, mediaId)
  if (!spine || pieces.length === 0) return []

  return detectDisfluencies(words).flatMap((found) => {
    const span = words.slice(found.from, found.to + 1)
    if (!span.every((word) => plays(pieces, word))) return []
    const atUs = sourceToTimelineUs(spine, mediaId, span[0].startUs)
    if (atUs === null) return []
    return [
      {
        key: `${mediaId}:${span[0].startUs}`,
        kind: found.kind,
        phrase: found.phrase,
        atUs,
        found,
      },
    ]
  })
}

/** Whether an item starts ticked in the review: the kinds a clean-up takes. */
export function reviewDefault(item: ReviewItem): boolean {
  return DEFAULT_CLEAN_UP.includes(item.kind)
}

/** The ticked items as source ranges for `deleteSpeech`, padded and merged. */
export function reviewCuts(
  items: ReviewItem[],
  words: Word[],
  sourceDurationUs: Us
): UsRange[] {
  if (items.length === 0) return []
  const kinds = [...new Set(items.map((item) => item.kind))]
  return cleanUpCuts(
    words,
    sourceDurationUs,
    kinds,
    items.map((item) => item.found)
  ).map((cut) => cut.range)
}
