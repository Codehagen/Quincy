"use client"

/*
 * After Stageshow (MIT, Copyright (c) 2026 Benji Taylor):
 * references/annotations.md and examples/annotations. See
 * components/showcase/NOTICE.md.
 *
 * Stageshow's annotations are leaders and labels in a quiet ink. Quincy's
 * are a human editor's marks (plan 029): Caveat in the margin, graphite for a
 * note, the blue pen for a beat. Same rules underneath: one relationship per
 * mark, attached to what is drawn, arriving with its cause and leaving with
 * it, never covering the result it explains.
 */

import type { CSSProperties, ReactNode } from "react"

import type { Point } from "./measure"
import { Connector } from "./motion/connector"
import "./annotation.css"

type Tone = "graphite" | "pen"

/**
 * A handwritten note at a point in stage pixels, with an optional leader to
 * the thing it is about. The leader is 1px, leaves the note's edge, and ends
 * on a 4px dot a few px short of the target. Drive `show` from the script.
 */
export function Note({
  at,
  to,
  show,
  tone = "graphite",
  align = "start",
  children,
}: {
  /** Where the note's text starts (align start) or ends (align end). */
  at: Point
  /** The point the leader runs to. Leave out for a note with no leader. */
  to?: Point
  show: boolean
  tone?: Tone
  align?: "start" | "end"
  children: ReactNode
}) {
  return (
    <>
      <span
        className="qs-note qs-note--at"
        data-tone={tone}
        data-align={align}
        data-show={show || undefined}
        style={{ left: at.x, top: at.y }}
      >
        {children}
      </span>
      {to ? (
        <Connector
          from={leaderStart(at, to, align)}
          to={to}
          route="straight"
          show={show}
          className="qs-leader"
        />
      ) : null}
    </>
  )
}

// The leader leaves from the side of the note that faces its target.
function leaderStart(at: Point, to: Point, align: "start" | "end"): Point {
  const gap = 6
  return { x: align === "start" ? at.x - gap : at.x + gap, y: at.y + (to.y > at.y ? 6 : -2) }
}

/**
 * A bracket in the margin spanning the lines it is about, with a few words
 * beside it. `pen` names a draft's beat (what I did / what happened / what it
 * meant); `graphite` is an editor's note (the angle). Wrap the lines; the
 * bracket hangs `--qs-margin` past the block's right edge. On a compact
 * stage there is no margin, so the words drop under the lines instead.
 */
export function BeatMark({
  label,
  show,
  tone = "pen",
  delay = 0,
  children,
}: {
  label: string
  show: boolean
  tone?: Tone
  /** ms after `show` turns true, for a stagger down the draft. */
  delay?: number
  children: ReactNode
}) {
  return (
    <div className="qs-beat" data-tone={tone}>
      {children}
      <span
        className="qs-beat__mark"
        data-show={show || undefined}
        style={{ "--qs-delay": `${delay}ms` } as CSSProperties}
        aria-hidden
      >
        <svg viewBox="0 0 10 100" preserveAspectRatio="none" className="qs-beat__bracket">
          <path
            d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="qs-note" data-tone={tone} data-show={show || undefined}>
          {label}
        </span>
      </span>
    </div>
  )
}
