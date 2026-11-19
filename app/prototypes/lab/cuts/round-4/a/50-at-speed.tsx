"use client"

/*
 * 50 — The same, at speed.
 *
 * 43 rebuilt on 49's choreography at the faster pace (every duration × 0.95,
 * the stream at 12 ms; 49 runs at × 1.3): the tighten run reads in about two seconds, and
 * every target is hit with the highlighter's yellow. The accent is the
 * yellow.
 */

import { FlowDesk4 } from "../desk"

export function AtSpeed() {
  return <FlowDesk4 tone="highlight" pace={0.95} delayMs={12} />
}
