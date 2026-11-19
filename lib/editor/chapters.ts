import {
  findMainTrack,
  sourceToTimelineUs,
  timelineToSourceUs,
} from "./timeline"
import { us, type Us } from "./time"
import type { Chapter, Scene } from "./types"

/**
 * Chapters for a longer take: a title per part, each opening at a moment.
 *
 * Stored against the source instant (types.ts `Chapter`), so they survive
 * cuts the way captions do, and validated on the way in so a model cannot
 * leave the document holding a chapter list that reads wrong: titles present
 * and short, times inside the cut and strictly increasing, the first at the
 * very start, and few enough to be useful.
 */

export const MAX_CHAPTERS = 20
export const MAX_CHAPTER_TITLE = 80
/** A chapter shorter than this is a caption, not a part. */
export const MIN_CHAPTER_US = 5_000_000

export type ChapterInput = { title: string; atUs: number }

export type ChapterVerdict =
  { ok: true; chapters: Chapter[] } | { ok: false; error: string }

/** Check chapters given in timeline time and bind them to the source. */
export function chaptersFor(
  scene: Scene,
  input: ChapterInput[]
): ChapterVerdict {
  const spine = findMainTrack(scene)
  if (!spine)
    return { ok: false, error: "This cut has no footage to put chapters on." }
  if (input.length === 0) return { ok: true, chapters: [] }
  if (input.length > MAX_CHAPTERS) {
    return { ok: false, error: `Use no more than ${MAX_CHAPTERS} chapters.` }
  }

  const sorted = [...input].sort((a, b) => a.atUs - b.atUs)
  const end = spine.elements.reduce(
    (max, element) => Math.max(max, element.startUs + element.durationUs),
    0
  )
  const chapters: Chapter[] = []

  for (const [index, chapter] of sorted.entries()) {
    const label = `Chapter ${index + 1}`
    const title = chapter.title.trim()
    if (!title) return { ok: false, error: `${label} needs a title.` }
    if ([...title].length > MAX_CHAPTER_TITLE) {
      return {
        ok: false,
        error: `${label}'s title is over ${MAX_CHAPTER_TITLE} characters.`,
      }
    }
    if (!Number.isFinite(chapter.atUs) || chapter.atUs < 0) {
      return { ok: false, error: `${label} needs a time inside the cut.` }
    }
    if (index === 0 && chapter.atUs > 0) {
      return { ok: false, error: "The first chapter starts at 0:00." }
    }
    if (chapter.atUs >= end) {
      return { ok: false, error: `${label} starts after the cut ends.` }
    }
    const previous = sorted[index - 1]
    if (previous && chapter.atUs - previous.atUs < MIN_CHAPTER_US) {
      return {
        ok: false,
        error: `${label} starts less than ${MIN_CHAPTER_US / 1_000_000} s after the one before it.`,
      }
    }
    const at = timelineToSourceUs(spine, chapter.atUs, 0)
    if (!at) return { ok: false, error: `${label} does not land on footage.` }
    chapters.push({ title, mediaId: at.clip.mediaId, sourceUs: at.sourceUs })
  }

  return { ok: true, chapters }
}

export type PlacedChapter = { title: string; atUs: Us }

/**
 * Where the chapters open in the cut as it stands. A chapter whose moment
 * was cut opens where the cut resumes; two that land on one instant keep the
 * first.
 */
export function placeChapters(
  scene: Scene,
  chapters: Chapter[] | undefined
): PlacedChapter[] {
  const spine = findMainTrack(scene)
  if (!spine || !chapters?.length) return []

  const placed: PlacedChapter[] = []
  for (const chapter of chapters) {
    const at =
      sourceToTimelineUs(spine, chapter.mediaId, chapter.sourceUs) ??
      resumeAfter(scene, chapter)
    if (at === null) continue
    if (placed.some((other) => other.atUs === at)) continue
    placed.push({ title: chapter.title, atUs: at })
  }
  return placed.sort((a, b) => a.atUs - b.atUs)
}

function resumeAfter(scene: Scene, chapter: Chapter): Us | null {
  const spine = findMainTrack(scene)
  const next = spine?.elements
    .filter(
      (element) =>
        element.kind === "video" &&
        element.mediaId === chapter.mediaId &&
        element.trimStartUs > chapter.sourceUs
    )
    .sort((a, b) => a.startUs - b.startUs)[0]
  return next ? us(next.startUs) : null
}

/** "0:00 Intro" lines, the form every video page reads chapters in. */
export function chapterLines(placed: PlacedChapter[]): string {
  return placed
    .map((chapter) => `${clock(chapter.atUs)} ${chapter.title}`)
    .join("\n")
}

function clock(timeUs: number): string {
  const total = Math.max(0, Math.floor(timeUs / 1_000_000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, "0")
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `${minutes}:${seconds}`
}
