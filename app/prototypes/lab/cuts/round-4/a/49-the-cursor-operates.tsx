"use client"

/*
 * 49 — The cursor operates the desk.
 *
 * 41 rebuilt to the choreography in BRIEF.md. Quincy's cursor works the
 * desk the way a person would, compressed: it drag-selects each pause and
 * the "um" and deletes them (⌫ in its tag) while the gaps close; it clicks
 * the real "+ Captions" button, which takes its pressed state, and rides the
 * wave of captions; it selects the strong line and clicks Zoom. Every
 * gesture is one tool part. The steps tick and the length changes with the
 * press, the run folds when the cursor parks, and the receipt and the
 * checkpoint arrive with the fold. No accent.
 */

import { FlowDesk4 } from "../desk"

export function TheCursorOperates() {
  // 1.3: the tighten run reads in about 2.6 s (measured 2.0 s at 1).
  return <FlowDesk4 pace={1.3} />
}
