// The main lane's run: the take as one clip, three pauses selected and pressed out, the gaps closing, then the
// lane refitting to the shorter cut. Pure functions of the film's clock (ms) and the lane's width (px).
import type { Beat, Rect } from "./cursor-run"
import { agentMove, eased } from "./ease"
import { easeInOut, lerp, progress } from "./motion"
import { CUT_S, KEPT, PAUSES, TAKE_S } from "./take"
import { RUN_AT } from "./timeline"

/** Each cut's timing, ms after the run starts: the first slow enough to read, the rest at the editor's speed. */
const RUN = [
  { glideAt: 420, glideDur: 420, dragAt: 960, dragDur: 380, pressAt: 1440 },
  { glideAt: 1800, glideDur: 170, dragAt: 2000, dragDur: 170, pressAt: 2230 },
  { glideAt: 2460, glideDur: 220, dragAt: 2720, dragDur: 130, pressAt: 2900 },
].map((b) => ({ glideAt: b.glideAt + RUN_AT, glideDur: b.glideDur, dragAt: b.dragAt + RUN_AT, dragDur: b.dragDur, pressAt: b.pressAt + RUN_AT }))

export const CLOSE = 220
export const RUN_DONE = RUN[2]!.pressAt + CLOSE
/** The lane refits to the shorter cut (ease-in-out, no sound). */
export const FIT_AT = RUN_DONE + 200
const FIT = 640

/** px per source second on a lane `w` wide. */
export function scaleAt(t: number, w: number) {
  return lerp(w / TAKE_S, w / CUT_S, easeInOut(progress(t, FIT_AT, FIT)))
}

export type Piece = { from: number; to: number; x: number; w: number; pause: boolean; opacity: number }

/** The take's stretches in source order, where each sits on the lane at `t`. */
export function piecesAt(t: number, laneW: number): Piece[] {
  const k = scaleAt(t, laneW)
  const parts = [PAUSES[0]!, KEPT[0]!, PAUSES[1]!, KEPT[1]!, PAUSES[2]!]
  let x = 0
  return parts.map(([from, to], i) => {
    const pause = i % 2 === 0
    const press = pause ? RUN[i / 2]!.pressAt : Infinity
    const close = pause ? eased(t, press, CLOSE, agentMove) : 0
    const w = (to - from) * k * (1 - close)
    const piece = { from, to, x, w, pause, opacity: pause ? 1 - progress(t, press, 90) : 1 }
    // A closed pause between two kept clips leaves them 2 px apart, as separate clips on the lane.
    x += w + (pause && i > 0 && i < 4 ? 2 * close : 0)
    return piece
  })
}

/** The run's beats on a lane at `lane` (desk px), each pause measured where it sits when the glide starts. */
export function mainBeats(lane: Rect): Beat[] {
  const w = lane.x1 - lane.x0
  return RUN.map((b, i) => {
    const p = piecesAt(b.glideAt, w).filter((x) => x.pause)[i]!
    return { ...b, rect: { x0: lane.x0 + p.x, x1: lane.x0 + p.x + p.w, top: lane.top, height: lane.height } }
  })
}

export const PRESSES = RUN.map((b) => b.pressAt)
export const MAIN_APPEAR = RUN_AT + 240
export const MAIN_PARK = RUN_DONE + 420
export const pausesOut = (t: number) => PRESSES.filter((at) => t >= at).length
