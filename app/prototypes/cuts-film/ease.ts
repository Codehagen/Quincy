// The editor's own curves (agent-cursor.css), on the film's clock.
import { easeOut, progress } from "./motion"

function bezier(x1: number, y1: number, x2: number, y2: number) {
  const f = (a: number, b: number, s: number) => 3 * a * s * (1 - s) ** 2 + 3 * b * s * s * (1 - s) + s ** 3
  return (x: number) => {
    if (x <= 0) return 0
    if (x >= 1) return 1
    let lo = 0
    let hi = 1
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2
      if (f(x1, x2, mid) < x) lo = mid
      else hi = mid
    }
    return f(y1, y2, (lo + hi) / 2)
  }
}

/** --agent-ease: the glide and the drag. */
export const agentEase = bezier(0.23, 1, 0.32, 1)
/** --agent-move: a closing gap. */
export const agentMove = bezier(0.45, 0, 0.2, 1)

/** 0 → 1 over a window on a curve. */
export function eased(t: number, at: number, dur: number, curve: (p: number) => number = easeOut) {
  return curve(progress(t, at, dur))
}
