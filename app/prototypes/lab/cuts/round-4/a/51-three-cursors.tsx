"use client"

/*
 * 51 — Three cuts, three cursors.
 *
 * 48 rebuilt: one large preview of the recommended cut, three spines in
 * the lanes panel, and a cursor on each, never in lockstep (they start 0,
 * 90 and 170 ms apart, at slightly different paces). The recommended cut's
 * cursor leads (its name tag, its ring); B and C support (a smaller tag, no
 * ring, 70%). Each cut ends in its own self-check; the frames A looked at
 * arrive together, and the caption fix is one press on A. No accent.
 */

import { ThreeCutsDesk4 } from "../desk"

export function ThreeCursors() {
  return <ThreeCutsDesk4 />
}
