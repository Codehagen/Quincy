import { isFiller } from "./fillers"
import { secondsToUs, us, type Us } from "./time"
import { transcriptWords, type TranscriptWord } from "./transcript-view"
import type { Word } from "./transcript"
import type { Scene } from "./types"

/**
 * Subtitle files in and out: SRT and WebVTT.
 *
 * Out: the words as they play in this cut, grouped into cues a person can
 * read: at most two short lines, broken at a pause or the end of a sentence,
 * never shown for less than a second where the next cue leaves room.
 *
 * In: a subtitle file timed against the recording becomes words with times in
 * the recording, so the captions built from it are bound to the source and
 * follow every cut the way transcribed ones do. A cue's words share its time
 * evenly, which is as precise as a cue file can say.
 */

export type Cue = { startUs: Us; endUs: Us; text: string; speaker?: number }

const MAX_CUE_CHARS = 42 * 2
const MAX_LINE_CHARS = 42
const CUE_BREAK_US = 700_000
const MIN_CUE_US = 1_000_000
const MAX_CUE_US = 6_000_000

export function subtitleCues(
  scene: Scene,
  options: { fillers?: boolean } = {}
): Cue[] {
  const words = transcriptWords(scene).filter(
    (word) => options.fillers || !isFiller(word.text)
  )
  const cues: Cue[] = []
  let current: TranscriptWord[] = []

  const flush = () => {
    if (current.length === 0) return
    cues.push({
      startUs: current[0].startUs,
      endUs: current[current.length - 1].endUs,
      text: joinWords(current.map((word) => word.text)),
      ...(current[0].speaker !== undefined ? { speaker: current[0].speaker } : {}),
    })
    current = []
  }

  for (const word of words) {
    const text = joinWords([...current.map((w) => w.text), word.text])
    const first = current[0]
    const breaks =
      current.length > 0 &&
      (word.startUs - current[current.length - 1].endUs >= CUE_BREAK_US ||
        text.length > MAX_CUE_CHARS ||
        word.endUs - first.startUs > MAX_CUE_US ||
        word.speaker !== first.speaker ||
        /[.!?]$/.test(current[current.length - 1].text))
    if (breaks) flush()
    current.push(word)
  }
  flush()

  // Hold a short cue up a little longer when the next one leaves room.
  return cues.map((cue, index) => {
    const next = cues[index + 1]
    const room = next ? next.startUs : cue.endUs + MIN_CUE_US
    const endUs = us(Math.max(cue.endUs, Math.min(room, cue.startUs + MIN_CUE_US)))
    return { ...cue, endUs }
  })
}

function joinWords(words: string[]): string {
  return words.join(" ").replace(/\s+([,.!?;:])/g, "$1").trim()
}

/** Break a cue into at most two lines, as evenly as the words allow. */
export function cueLines(text: string): string[] {
  if (text.length <= MAX_LINE_CHARS) return [text]
  const words = text.split(" ")
  let best = { index: 1, score: Number.POSITIVE_INFINITY }
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ").length
    const b = words.slice(i).join(" ").length
    const score = Math.abs(a - b)
    if (score < best.score) best = { index: i, score }
  }
  return [words.slice(0, best.index).join(" "), words.slice(best.index).join(" ")]
}

function stamp(timeUs: number, separator: "," | "."): string {
  const totalMs = Math.max(0, Math.round(timeUs / 1000))
  const ms = totalMs % 1000
  const totalS = Math.floor(totalMs / 1000)
  const s = totalS % 60
  const m = Math.floor(totalS / 60) % 60
  const h = Math.floor(totalS / 3600)
  const pad = (value: number, width = 2) => String(value).padStart(width, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${pad(ms, 3)}`
}

export function toSrt(cues: Cue[], speakers?: Record<string, string>): string {
  return cues
    .map((cue, index) =>
      [
        String(index + 1),
        `${stamp(cue.startUs, ",")} --> ${stamp(cue.endUs, ",")}`,
        ...cueLines(withSpeaker(cue, speakers)),
      ].join("\n")
    )
    .join("\n\n")
    .concat(cues.length > 0 ? "\n" : "")
}

export function toVtt(cues: Cue[], speakers?: Record<string, string>): string {
  const body = cues
    .map((cue) =>
      [
        `${stamp(cue.startUs, ".")} --> ${stamp(cue.endUs, ".")}`,
        ...cueLines(
          cue.speaker !== undefined && speakers?.[String(cue.speaker)]
            ? `<v ${speakers[String(cue.speaker)]}>${cue.text}`
            : cue.text
        ),
      ].join("\n")
    )
    .join("\n\n")
  return `WEBVTT\n\n${body}${cues.length > 0 ? "\n" : ""}`
}

function withSpeaker(cue: Cue, speakers?: Record<string, string>): string {
  const name = cue.speaker !== undefined ? speakers?.[String(cue.speaker)] : undefined
  return name ? `${name}: ${cue.text}` : cue.text
}

const TIME =
  /(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})\s*-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})[.,](\d{1,3})/

function toUs(h: string | undefined, m: string, s: string, ms: string): Us {
  const seconds =
    Number(h ?? 0) * 3600 + Number(m) * 60 + Number(s) + Number(ms.padEnd(3, "0")) / 1000
  return secondsToUs(seconds)
}

/** Read an SRT or WebVTT file. Styling tags and cue settings are dropped. */
export function parseSubtitles(source: string): Cue[] {
  const blocks = source.replace(/\r\n?/g, "\n").split(/\n{2,}/)
  const cues: Cue[] = []
  for (const block of blocks) {
    const lines = block.split("\n")
    const at = lines.findIndex((line) => TIME.test(line))
    if (at < 0) continue
    const match = TIME.exec(lines[at])!
    const startUs = toUs(match[1], match[2], match[3], match[4])
    const endUs = toUs(match[5], match[6], match[7], match[8])
    const text = lines
      .slice(at + 1)
      .join(" ")
      .replace(/<[^>]*>/g, "")
      .replace(/\{[^}]*\}/g, "")
      .replace(/\s+/g, " ")
      .trim()
    if (!text || endUs <= startUs) continue
    cues.push({ startUs, endUs, text })
  }
  return cues.sort((a, b) => a.startUs - b.startUs)
}

/** Cues as words, sharing each cue's time by length, for `addCaptions`. */
export function cuesToWords(cues: Cue[]): Word[] {
  const words: Word[] = []
  for (const cue of cues) {
    const parts = cue.text.split(" ").filter(Boolean)
    const total = parts.reduce((sum, part) => sum + part.length + 1, 0)
    let cursor = cue.startUs as number
    const span = cue.endUs - cue.startUs
    for (const part of parts) {
      const length = Math.round((span * (part.length + 1)) / total)
      const endUs = Math.min(cue.endUs, cursor + Math.max(1, length))
      words.push({ text: part, startUs: us(cursor), endUs: us(endUs), confidence: 1 })
      cursor = endUs
    }
  }
  return words
}
