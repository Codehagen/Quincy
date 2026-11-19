// Source seconds → seconds on the tightened cut (the kept stretches end to end).
import { KEPT } from "./take"

export function cutX(s: number) {
  let x = 0
  for (const [a, b] of KEPT) {
    if (s <= b) return x + Math.max(0, s - a)
    x += b - a
  }
  return x
}
