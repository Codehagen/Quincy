import { isConnected, needsYou, rank, type Connector } from "../data"
import type { LabOptions } from "../lab-options"

/**
 * Which control is the page's one ink pill right now, worked out once
 * (actions.md, "Which action wins"):
 *
 * 1. A connector that stopped, needs reconnecting or is half set up: its fix.
 *    That is an item whose next step is waiting on you.
 * 2. Nothing connected at all (first run): X's Connect, the one Quincy would
 *    start with. Posting is the point, and its read-back teaches the voice.
 * 3. Otherwise the header's "Ask for one", when the header control is ink
 *    (the reference); with it quiet, no ink pill at all, which is correct
 *    when nothing waits on you.
 */
export function actionOwner(all: Connector[], opts: LabOptions): string | null {
  const broken = all.filter(needsYou).sort((a, b) => rank(a) - rank(b))[0]
  if (broken) return broken.id
  if (!all.some(isConnected)) return "x"
  return opts.header === "ink" ? "header" : null
}
