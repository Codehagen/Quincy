// The scene documents the spines draw, rebuilt from the film's clock: CutSpines reads only these.
import type { Scene } from "@/lib/editor/types"
import { cutX } from "./cut-time"
import { CAPTIONS, TAKE_US } from "./take"
import { clipsAt, landed, type Cut } from "./three-run"

export const MEDIA = "take"

/** Captions on the cut's own timeline; `words` splits each line into chunks of that many words. */
function captions(words?: number) {
  return CAPTIONS.flatMap((c) => {
    const from = cutX(c.from)
    const to = cutX(c.to)
    if (!words) return [{ from, to }]
    const parts = c.text.split(" ")
    const n = Math.ceil(parts.length / words)
    return Array.from({ length: n }, (_, i) => ({ from: from + ((to - from) * i) / n, to: from + ((to - from) * (i + 1)) / n }))
  })
}

export function sceneOf(cut: Cut, t: number): Scene {
  const video = clipsAt(cut, t).map((c) => ({
    id: `${cut.id}-${c.from}`,
    kind: "video",
    mediaId: MEDIA,
    startUs: Math.round(c.start * 1e6),
    durationUs: Math.round(c.len * 1e6),
    trimStartUs: Math.round(c.from * 1e6),
    trimEndUs: Math.round((c.from + c.len) * 1e6),
    sourceDurationUs: TAKE_US,
    transform: {},
  }))
  const capAt = landed(cut, (w) => w.kind === "tap" && w.target === "captions")
  const tracks: unknown[] = [{ id: `${cut.id}-v`, kind: "video", name: "Video", isMain: true, elements: video }]
  if (t >= capAt) {
    const elements = captions(cut.letter === "B" ? 3 : undefined).map((c, i) => ({
      id: `${cut.id}-c${i}`,
      kind: "caption",
      startUs: Math.round(c.from * 1e6),
      durationUs: Math.round((c.to - c.from) * 1e6),
    }))
    tracks.push({ id: `${cut.id}-c`, kind: "caption", name: "Captions", elements })
  }
  const square = cut.letter === "B" && t >= landed(cut, (w) => w.kind === "tap" && w.target === "frame")
  const canvas = square ? { width: 1080, height: 1080 } : { width: 1080, height: 1920 }
  return { id: cut.id, name: cut.name, isMain: cut.letter === "A", canvas, tracks } as unknown as Scene
}
