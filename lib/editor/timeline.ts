import { us, type Us, type UsRange } from "./time"
import type {
  CaptionElement,
  CaptionToken,
  Scene,
  TimelineElement,
  Track,
  VideoElement,
} from "./types"

/**
 * Pure reads and rearrangements over a scene. No document, no revisions, no
 * provenance — the ops layer owns those. Keeping this half pure is what makes
 * the interesting logic (ripple, caption remapping) testable without building
 * a project first.
 */

export function trackEndUs(track: Track): Us {
  return track.elements.reduce<Us>(
    (end, element) => us(Math.max(end, element.startUs + element.durationUs)),
    us(0)
  )
}

export function sceneDurationUs(scene: Scene): Us {
  return scene.tracks.reduce<Us>(
    (end, track) => us(Math.max(end, trackEndUs(track))),
    us(0)
  )
}

export function elementRange(element: TimelineElement): UsRange {
  return {
    startUs: element.startUs,
    endUs: us(element.startUs + element.durationUs),
  }
}

export function elementAt(
  track: Track,
  instant: Us
): TimelineElement | undefined {
  return track.elements.find(
    (element) =>
      instant >= element.startUs &&
      instant < element.startUs + element.durationUs
  )
}

export function findMainTrack(scene: Scene): Track | undefined {
  return (
    scene.tracks.find((track) => track.isMain) ??
    scene.tracks.find((track) => track.kind === "video")
  )
}

/**
 * Close every gap on a track, preserving order and durations.
 *
 * Returns only the elements whose start actually moved, because the caller
 * turns each one into an op and a no-op update would stamp provenance on a clip
 * nobody edited.
 *
 * Only ever call this on a gapless track — the main spine, where a hole is
 * always an artefact of a cut. B-roll and music sit at deliberate offsets, and
 * rippling those would march every overlay to the front of the timeline.
 */
export function rippleTrack(track: Track): TimelineElement[] {
  const moved: TimelineElement[] = []
  let cursor = us(0)

  for (const element of track.elements) {
    if (element.startUs !== cursor) {
      moved.push({ ...element, startUs: cursor })
    }
    cursor = us(cursor + element.durationUs)
  }

  return moved
}

/**
 * Lay a track's elements end to end from zero.
 *
 * Not `rippleTrack`, which returns only the elements whose start moved —
 * exactly right when the caller is emitting one update op per move, and
 * exactly wrong when the whole track is being replaced, or when what is wanted
 * is the track *as it will be* so captions can be remapped against it.
 */
export function layOut<T extends { startUs: Us; durationUs: Us }>(
  elements: T[]
): T[] {
  let cursor = us(0)

  return elements.map((element) => {
    const placed =
      element.startUs === cursor ? element : { ...element, startUs: cursor }
    cursor = us(cursor + element.durationUs)
    return placed
  })
}

/**
 * Cut ranges out of a source-backed element, returning what survives.
 *
 * The primitive under silence removal. Ranges are given in *source* time, not
 * timeline time, because that is what a transcript knows: Deepgram says the gap
 * runs from 12.4s to 13.1s of the recording, and where that currently sits on
 * the timeline depends on cuts already made.
 *
 * Splitting mid-element yields two elements sharing a mediaId with adjacent
 * trims. Timeline positions are left provisional — every caller ripples after,
 * and computing them twice would mean two chances to disagree.
 */
export function splitBySourceRanges(
  element: VideoElement,
  removeRanges: UsRange[],
  makeId: () => string
): VideoElement[] {
  const window: UsRange = {
    startUs: element.trimStartUs,
    endUs: element.trimEndUs,
  }

  const keeps = keepRangesWithin(removeRanges, window)
  if (keeps.length === 0) return []

  // Untouched: one keep spanning the whole window. Returning the original keeps
  // its identity, so provenance and any keyframes on it survive intact.
  if (
    keeps.length === 1 &&
    keeps[0].startUs === window.startUs &&
    keeps[0].endUs === window.endUs
  ) {
    return [element]
  }

  let cursor = element.startUs

  return keeps.map((keep, index) => {
    const duration = us(keep.endUs - keep.startUs)
    const piece: VideoElement = {
      ...element,
      // The first piece keeps the id so the clip the user selected is still
      // there after a cut. Later pieces are genuinely new clips.
      id: index === 0 ? element.id : makeId(),
      startUs: cursor,
      durationUs: duration,
      trimStartUs: keep.startUs,
      trimEndUs: keep.endUs,
    }
    cursor = us(cursor + duration)
    return piece
  })
}

function keepRangesWithin(remove: UsRange[], within: UsRange): UsRange[] {
  const sorted = [...remove].sort((a, b) => a.startUs - b.startUs)
  const keeps: UsRange[] = []
  let cursor = within.startUs

  for (const range of sorted) {
    if (range.endUs <= cursor) continue
    if (range.startUs >= within.endUs) break

    const start = us(Math.max(range.startUs, within.startUs))
    if (start > cursor) keeps.push({ startUs: cursor, endUs: start })
    cursor = us(Math.max(cursor, Math.min(range.endUs, within.endUs)))
  }

  if (cursor < within.endUs)
    keeps.push({ startUs: cursor, endUs: within.endUs })

  return keeps
}

/**
 * Where a source instant currently sits on the timeline, or null if it was cut.
 *
 * The lookup that makes captions survive editing. A word knows the asset instant
 * it was spoken at; after the spine has been cut and rippled, this walks the
 * surviving windows to find where that instant landed. If it fell inside a
 * removed range, the word is gone and its caption goes with it.
 */
export function sourceToTimelineUs(
  track: Track,
  mediaId: string,
  sourceUs: Us
): Us | null {
  for (const element of track.elements) {
    if (element.kind !== "video") continue
    if (element.mediaId !== mediaId) continue
    if (sourceUs < element.trimStartUs || sourceUs >= element.trimEndUs)
      continue

    return us(element.startUs + (sourceUs - element.trimStartUs))
  }

  return null
}

/**
 * Rebuild caption elements against the current spine.
 *
 * Run after any cut. Words whose source instant no longer exists are dropped;
 * the rest are repositioned. Recomputing from the source binding rather than
 * shifting captions by the same delta as the clips is what keeps them correct
 * through cuts that are not uniform — remove two separate silences and every
 * word after the second one has moved by a different amount than the words
 * between them.
 *
 * Tokens are re-timed relative to their element, and the element takes the
 * span of the tokens that survived.
 */
export function remapCaptions(
  captions: CaptionElement[],
  spine: Track
): CaptionElement[] {
  const remapped: CaptionElement[] = []

  for (const caption of captions) {
    const tokens: CaptionToken[] = []
    let earliest: Us | null = null
    let latest: Us | null = null

    for (const token of caption.tokens) {
      const start = sourceToTimelineUs(
        spine,
        token.sourceMediaId,
        token.sourceStartUs
      )
      if (start === null) continue

      // Clamp the tail to the clip it started in, so a word straddling a cut
      // ends at the cut instead of reaching into whatever now follows.
      const end = clampTokenEnd(spine, token, start)

      if (earliest === null || start < earliest) earliest = start
      if (latest === null || end > latest) latest = end

      tokens.push({ ...token, startUs: start, endUs: end })
    }

    if (tokens.length === 0 || earliest === null || latest === null) continue

    remapped.push({
      ...caption,
      startUs: earliest,
      durationUs: us(latest - earliest),
      // Token times are element-relative, so rebase once the span is known.
      tokens: tokens.map((token) => ({
        ...token,
        startUs: us(token.startUs - earliest),
        endUs: us(token.endUs - earliest),
      })),
    })
  }

  return remapped.sort(
    (a, b) => a.startUs - b.startUs || a.id.localeCompare(b.id)
  )
}

function clampTokenEnd(spine: Track, token: CaptionToken, start: Us): Us {
  const spoken = us(token.sourceEndUs - token.sourceStartUs)
  const element = spine.elements.find(
    (candidate) =>
      candidate.kind === "video" &&
      start >= candidate.startUs &&
      start < candidate.startUs + candidate.durationUs
  )

  if (!element) return us(start + spoken)

  const elementEnd = us(element.startUs + element.durationUs)
  return us(Math.min(start + spoken, elementEnd))
}

/**
 * Speech regions on the timeline, merged across gaps shorter than `bridgeUs`.
 *
 * Feeds music ducking. Every pause between words is not a place to bring the
 * music back up — the bed would pump on every breath. Bridging short gaps gives
 * one envelope per sentence, which is what the ear expects.
 */
export function speechRegions(
  captions: CaptionElement[],
  bridgeUs: Us
): UsRange[] {
  const spans = captions
    .flatMap((caption) =>
      caption.tokens.map((token) => ({
        startUs: us(caption.startUs + token.startUs),
        endUs: us(caption.startUs + token.endUs),
      }))
    )
    .sort((a, b) => a.startUs - b.startUs)

  if (spans.length === 0) return []

  const regions: UsRange[] = [{ ...spans[0] }]

  for (const span of spans.slice(1)) {
    const last = regions[regions.length - 1]
    if (span.startUs - last.endUs <= bridgeUs) {
      last.endUs = us(Math.max(last.endUs, span.endUs))
    } else {
      regions.push({ ...span })
    }
  }

  return regions
}
