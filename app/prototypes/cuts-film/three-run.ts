// Three cuts from the tightened take, each with its own work at its own place (the director's cutLane: starts
// 0 / 90 / 170 ms apart, paces 1 / 1.08 / 0.94, and different beats, so the cursors never move in lockstep):
// A pushes in on the strong line and keeps the captions; B goes square with captions three words at a time;
// C fades in and drops the second sentence for a 0:05 teaser. Pure functions of the film's clock (ms).
import { cutLane } from "@/components/editor/agent-cursor/director"
import { agentMove, eased } from "./ease"
import { CLOSE } from "./main-run"
import { KEPT } from "./take"
import { AT } from "./timeline"

export const SPINES_AT = AT.three + 420
export const RUN3_AT = AT.three + 1250

/** Where a beat acts: a stretch of the cut (cut seconds) or one of the spine's controls. */
export type Work =
  | { kind: "zoom"; from: number; to: number; say: string }
  | { kind: "cut"; from: number; to: number; say: string }
  | { kind: "tap"; target: "frame" | "captions" | "start"; say: string }

const A_LEN = KEPT[0]![1] - KEPT[0]![0]
const WORK: Record<"A" | "B" | "C", Work[]> = {
  A: [
    { kind: "zoom", from: A_LEN + 0.05, to: A_LEN + 5.9, say: "push-in on the strong line" },
    { kind: "tap", target: "captions", say: "captions" },
  ],
  B: [
    { kind: "tap", target: "frame", say: "square" },
    { kind: "tap", target: "captions", say: "captions three words at a time" },
  ],
  C: [
    { kind: "tap", target: "start", say: "fade in" },
    { kind: "cut", from: A_LEN, to: 13.1, say: "trimmed to a 0:05 teaser" },
  ],
}

export const CUTS = [
  { id: "cut-a", letter: "A" as const, name: "A · Reels and TikTok", where: "9:16" },
  { id: "cut-b", letter: "B" as const, name: "B · LinkedIn", where: "1:1" },
  { id: "cut-c", letter: "C" as const, name: "C · Shorts teaser", where: "9:16" },
].map((c, index) => {
  const lane = cutLane(index, c.letter)
  const pace = lane.paceFactor
  // Slower than the editor's own numbers for this beat only (owner: "so it looks real"): glides and drags at
  // 1.5×, a 300–380 ms hold after each press, and starts 200 ms apart on top of cutLane's offsets.
  let clock = RUN3_AT + lane.delayMs + index * 200
  const beats = WORK[c.letter].map((work, i) => {
    const glideAt = clock
    const glideDur = (i === 0 ? 390 : 300) * pace
    const dragAt = glideAt + glideDur + 60
    const dragDur = work.kind === "tap" ? 0 : 360 * pace
    const pressAt = dragAt + dragDur + (work.kind === "zoom" ? 450 : 90) * pace
    clock = pressAt + CLOSE + (300 + 40 * i) * pace + [140, 90, 60][i]! * pace
    return { work, glideAt, glideDur, dragAt, dragDur, pressAt }
  })
  return { ...c, lane, beats, doneAt: clock }
})

export type Cut = (typeof CUTS)[number]

/** When a cut's beat of this kind has landed (Infinity if it never does). */
export function landed(cut: Cut, test: (w: Work) => boolean) {
  return cut.beats.find((b) => test(b.work))?.pressAt ?? Infinity
}

/** The cut's clips at `t`, in cut seconds: the two kept stretches, C's second one closing once it is cut. */
export function clipsAt(cut: Cut, t: number) {
  const trim = cut.letter === "C" ? eased(t, landed(cut, (w) => w.kind === "cut"), CLOSE, agentMove) : 0
  const a = KEPT[0]!
  const b = KEPT[1]!
  return [
    { from: a[0], to: a[1], start: 0, len: a[1] - a[0] },
    { from: b[0], to: b[1], start: a[1] - a[0], len: (b[1] - b[0]) * (1 - trim) },
  ].filter((c) => c.len > 0.01)
}

export const spanAt = (cut: Cut, t: number) => clipsAt(cut, t).reduce((n, c) => n + c.len, 0)
export const RUN3_DONE = Math.max(...CUTS.map((c) => c.doneAt))
