"use client"

/*
 * The comparison: "On your own" against "With Quincy". Two stills, no
 * script, no cursor: nothing happens in either, the difference is the story.
 *
 * ComparePile started from Stageshow's examples/tilted-stack (MIT; see
 * ../NOTICE.md): a loose pile of paper at small alternating angles.
 *
 *   1. Five things a person is holding in their head: a Slack thread, a
 *      voice memo, a merged PR, a half-written note.
 *   2. On top, the calendar reminder that says what all of it was for:
 *      "Write a LinkedIn post", repeating weekly. It is the only card with
 *      a full line of words; the rest carry a kind and a short title.
 *
 * CompareCalm started from ./hero.tsx's draft object (the same draft, at
 * rest): one white object, pinned to the bottom edge and cut by it.
 *
 *   1. The draft, in three beats, the number on its own line.
 *   2. Its slot and Approve. Quincy drafts; the person sends.
 *   3. Under the rule, the week runs off the bottom: filler.
 *
 * Both are stills, so the poster is the scene itself.
 */

import type { ReactNode } from "react"

import { usePictureWidth } from "../bento"
import { Button } from "../button"
import { Icon, type IconName } from "../icon"
import { Stage } from "../stage"
import { Bar } from "../window"
import "./compare.css"

type Scrap = {
  icon: IconName
  kind: string
  title: string
  x: number
  y: number
  turn: number
  bars: number[]
}

// Positions are fractions of the stage width (x) and px from the top (y).
// The pile reads left to right, top to bottom; the reminder lands last, on top.
const SCRAPS: Scrap[] = [
  { icon: "comment", kind: "Slack · #product", title: "we should post about this", x: 0.04, y: 30, turn: -5, bars: [150, 96] },
  { icon: "mic", kind: "Voice memo · 0:48", title: "New recording 14", x: 0.45, y: 22, turn: 4, bars: [120] },
  { icon: "merge", kind: "Merged · #412", title: "Signup asks for 3 fields, not 9", x: 0.06, y: 146, turn: 3, bars: [140, 80] },
  { icon: "edit", kind: "Notes", title: "So we cut the form and…", x: 0.47, y: 136, turn: -3.5, bars: [130, 150, 60] },
]

function Paper({ children, x, y, turn, top }: { children: ReactNode; x: number; y: number; turn: number; top?: boolean }) {
  return (
    <div
      className="qx-paper"
      data-top={top || undefined}
      style={{ left: `${x * 100}%`, top: y, rotate: `${turn}deg` }}
    >
      {children}
    </div>
  )
}

export function ComparePile() {
  const [ref, width] = usePictureWidth(440)
  return (
    <div ref={ref}>
      <Stage width={width} height={360} className="qx">
        {() => (
          <>
            {SCRAPS.map((s) => (
              <Paper key={s.kind} x={s.x} y={s.y} turn={s.turn}>
                <span className="qx-kind">
                  <Icon name={s.icon} size={13} />
                  {s.kind}
                </span>
                <span className="qx-title">{s.title}</span>
                <span className="qx-bars">
                  {s.bars.map((w, i) => (
                    <Bar key={i} w={w} h={6} tone={i === 0 ? 3 : 2} />
                  ))}
                </span>
              </Paper>
            ))}
            <Paper x={0.22} y={252} turn={-1.5} top>
              <span className="qx-kind">
                <Icon name="calendar" size={13} />
                Fri 16:00 · repeats weekly
              </span>
              <span className="qx-title qx-title--top">Write a LinkedIn post</span>
            </Paper>
          </>
        )}
      </Stage>
    </div>
  )
}

export function CompareCalm() {
  const [ref, width] = usePictureWidth(440)
  // Under 400 the row cannot hold the slot, Edit and Approve: the compact
  // design keeps Approve alone, the one thing the picture is about.
  const narrow = width < 400
  return (
    <div ref={ref}>
      <Stage width={width} height={360} className="qx">
        {() => (
          <div className="qx-draft" data-narrow={narrow || undefined}>
            <span className="qx-who">Quincy · draft for LinkedIn</span>
            <div className="qx-lines">
              <span className="qx-line">I cut our signup form from nine fields to three.</span>
              <span className="qx-line">A week later, finished signups:</span>
              <span className="qx-figure">41% → 68%</span>
              <span className="qx-line">People weren’t lazy. The form was.</span>
            </div>
            <div className="qx-actions">
              <span className="qx-chip">
                <Icon name="calendar" size={14} />
                Thu 08:00
              </span>
              <span className="qx-spacer" />
              {narrow ? null : <Button size="large">Edit</Button>}
              <Button size="large" variant="primary">
                Approve
              </Button>
            </div>
            <div className="qx-week">
              <Bar w={56} h={6} tone={3} />
              <Bar w="60%" h={6} tone={2} />
            </div>
          </div>
        )}
      </Stage>
    </div>
  )
}
