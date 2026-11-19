import { formatSeconds, type TakeReading } from "@/lib/editor/reading"

/**
 * The arrival (plans/036, phase G): the first time a take is opened after it
 * was read, the margin plays the reading before it offers anything. Three
 * passes, each resolving to what it found, a thin ink line sweeping the
 * Main lane in step with them, then "What I noticed" and the starters
 * arrive as one entrance.
 *
 * Every value a pass shows is the reading's own (lib/editor/reading.ts) or
 * the asset's own size and rate: nothing here is made up for the show. The
 * picture pass says what the file says (its shape and rate), not what a
 * model would see in it, because nothing has looked at the picture yet.
 */

/** The timeline, in ms from the start. One pass leads at a time; the next starts just before it settles. */
export const ARRIVAL = {
  /** Pass i starts at i × step. */
  stepMs: 560,
  /** From a pass's start to its check. 100 ms past the next one's start: the handoff overlaps. */
  readMs: 660,
  /** After the last check: a beat, then the noticed block and the starters arrive together. */
  revealGapMs: 80,
  /** The one entrance: opacity and a 6px rise. */
  enterMs: 240,
} as const

export const PASS_COUNT = 3

export function passStartMs(index: number): number {
  return index * ARRIVAL.stepMs
}

export function passDoneMs(index: number): number {
  return passStartMs(index) + ARRIVAL.readMs
}

/** When the sweep reaches the end of the lane: the last check. */
export const SWEEP_MS = passDoneMs(PASS_COUNT - 1)

/** When the noticed block starts its entrance. */
export const REVEAL_MS = SWEEP_MS + ARRIVAL.revealGapMs

/** The whole arrival, entrance included: about 2.1 s. */
export const ARRIVAL_TOTAL_MS = REVEAL_MS + ARRIVAL.enterMs

/** Every instant something changes, for the timers that step the state. */
export const MILESTONES: readonly number[] = [
  ...new Set(
    [
      ...Array.from({ length: PASS_COUNT }, (_, i) => [passStartMs(i), passDoneMs(i)]).flat(),
      REVEAL_MS,
    ].sort((a, b) => a - b)
  ),
]

export type PassState = "waiting" | "reading" | "done"

export function passState(index: number, atMs: number): PassState {
  if (atMs >= passDoneMs(index)) return "done"
  if (atMs >= passStartMs(index)) return "reading"
  return "waiting"
}

/** The sweep's stops: one third of the lane per pass, reached as that pass resolves. */
export function sweepStops(): { offset: number; at: number }[] {
  return [
    { offset: 0, at: 0 },
    ...Array.from({ length: PASS_COUNT }, (_, i) => ({
      offset: passDoneMs(i) / SWEEP_MS,
      at: (i + 1) / PASS_COUNT,
    })),
  ]
}

/** What the file says about its picture. */
export type Picture = {
  width: number | null
  height: number | null
  rotation?: number
  fps: number | null
}

export type Pass = { label: string; found: string }

function plural(count: number, one: string, many: string): string {
  return `${count === 1 ? "one" : count} ${count === 1 ? one : many}`
}

function shapeOf(picture: Picture): string | null {
  if (!picture.width || !picture.height) return null
  const turned = picture.rotation === 90 || picture.rotation === 270
  const w = turned ? picture.height : picture.width
  const h = turned ? picture.width : picture.height
  const ratio = w / h
  const near = (r: number) => Math.abs(ratio - r) < 0.02
  if (near(16 / 9)) return "wide, 16:9"
  if (near(9 / 16)) return "vertical, 9:16"
  if (near(1)) return "square, 1:1"
  if (near(4 / 3)) return "4:3"
  if (near(4 / 5)) return "vertical, 4:5"
  return ratio > 1 ? `wide, ${w}×${h}` : `tall, ${w}×${h}`
}

/** The three passes and what each found. */
export function scanPasses(reading: TakeReading, picture: Picture): Pass[] {
  const voices = reading.speakers === 1 ? "one voice" : plural(reading.speakers, "voice", "voices")
  const transcribed =
    reading.words === 0
      ? `${formatSeconds(reading.durationUs)}, no words`
      : `${plural(reading.words, "word", "words")}, ${voices}`

  const shape = shapeOf(picture)
  const rate = picture.fps ? `${Math.round(picture.fps)} fps` : null
  const seen = [shape ? `Shot ${shape}` : null, rate].filter(Boolean).join(" at ") || "One recording"

  const delivery: string[] = [
    reading.pauses.count === 0 ? "no long pauses" : plural(reading.pauses.count, "long pause", "long pauses"),
  ]
  if (reading.fillers.count > 0) delivery.push(plural(reading.fillers.count, "filler", "fillers"))
  if (reading.strongLine) delivery.push("the strong line")
  const delivered = delivery.join(", ")

  return [
    { label: "Transcribing", found: transcribed },
    { label: "Reading the picture", found: seen },
    { label: "Reading the delivery", found: delivered.charAt(0).toUpperCase() + delivered.slice(1) },
  ]
}
