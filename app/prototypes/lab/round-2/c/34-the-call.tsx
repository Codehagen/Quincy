"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { CallIcon } from "@hugeicons/core-free-icons"

import { Card, MarginNote, Mono, Stage, Text, u } from "../kit"
import { color, motion, radius } from "../tokens"

/**
 * 34 — A recorded call, and the one line worth posting.
 *
 * Forty-six minutes become a strip with three marks on it. Quincy picked one
 * (the line you said, so it is yours to post) and kept the other two beside
 * it, because the best line is sometimes the other person's, and that one
 * needs asking first. Click a mark or use the arrow keys; the transcript and
 * the margin follow.
 */

const LENGTH_S = 46 * 60 + 10

type Moment = {
  at: number
  who: "You" | "Ops lead"
  before: string
  line: string
  note: string
}

const MOMENTS: Moment[] = [
  {
    at: 7 * 60 + 12,
    who: "Ops lead",
    before: "So walk me through a normal Friday.",
    line: "We exported everything every Friday, just to check nothing was missing.",
    note: "the before. three hours a week",
  },
  {
    at: 23 * 60 + 48,
    who: "You",
    before: "Why did you build it, honestly?",
    line: "We built the export so we would stop getting that email.",
    note: "the line. you said it, so it’s yours to post",
  },
  {
    at: 38 * 60 + 5,
    who: "Ops lead",
    before: "And now?",
    line: "I haven’t opened the spreadsheet since March.",
    note: "the proof. her words, ask before quoting",
  },
]

/** Quincy's pick: the line the person said themselves. */
const PICK = 1

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`

export default function TheCall() {
  const [active, setActive] = React.useState(PICK)
  const marks = React.useRef<(HTMLButtonElement | null)[]>([])
  const m = MOMENTS[active]!

  const move = (to: number) => {
    const next = (to + MOMENTS.length) % MOMENTS.length
    setActive(next)
    marks.current[next]?.focus()
  }

  return (
    <Stage
      lead="Forty-six minutes, one line."
      rest="Import the call. Quincy finds the sentence worth posting, and says whose it is."
    >
      <style>{css}</style>
      <Card width={330}>
        <div style={{ display: "flex", alignItems: "center", gap: u(8) }}>
          <HugeiconsIcon
            icon={CallIcon}
            strokeWidth={2}
            aria-hidden
            style={{ width: u(15), height: u(15), color: color.muted, flex: "none" }}
          />
          <Mono tone="ink">onboarding-call-1104.m4a</Mono>
          <span style={{ marginLeft: "auto" }}>
            <Mono tone="faint">{clock(LENGTH_S)}</Mono>
          </span>
        </div>

        <div
          role="radiogroup"
          aria-label="Moments Quincy found in the call"
          className="c34-strip"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowDown") {
              e.preventDefault()
              move(active + 1)
            } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
              e.preventDefault()
              move(active - 1)
            }
          }}
        >
          <span aria-hidden className="c34-track" />
          {MOMENTS.map((mo, i) => (
            <button
              key={mo.at}
              ref={(el) => {
                marks.current[i] = el
              }}
              type="button"
              role="radio"
              aria-checked={i === active}
              aria-label={`${clock(mo.at)}, ${mo.who}${i === PICK ? ", Quincy's pick" : ""}`}
              tabIndex={i === active ? 0 : -1}
              onClick={() => setActive(i)}
              className="c34-mark"
              data-on={i === active || undefined}
              style={{ left: `${(mo.at / LENGTH_S) * 100}%` }}
            >
              <span aria-hidden className="c34-tick" />
              <span aria-hidden className="c34-time">
                {clock(mo.at)}
              </span>
            </button>
          ))}
        </div>

        <div className="c34-quote" aria-live="polite">
          <div className="c34-turn">
            <Mono tone="faint">{clock(Math.max(0, m.at - 9))}</Mono>
            <Text tone="muted">{m.before}</Text>
          </div>
          <div className="c34-turn" style={{ marginTop: u(10) }}>
            <Mono>{clock(m.at)}</Mono>
            <div>
              <Text size="small" tone="muted">
                {m.who}
              </Text>
              <MarginNote note={m.note}>
                <Text weight="strong">
                  &ldquo;{m.line}&rdquo;
                </Text>
              </MarginNote>
            </div>
          </div>
        </div>

        <div style={{ marginTop: u(16) }}>
          <Text size="small" tone="muted">
            {active === PICK
              ? "Quincy’s pick. Two more marked on the strip."
              : "Kept beside the pick. Arrow keys move between them."}
          </Text>
        </div>
      </Card>
    </Stage>
  )
}

const css = `
.c34-strip { position: relative; height: ${u(52)}; margin-top: ${u(14)}; }
.c34-track {
  position: absolute; left: 0; right: 0; top: ${u(14)};
  height: ${u(4)}; border-radius: 999px; background: ${color.skeleton};
}
.c34-mark {
  position: absolute; top: 0; translate: -50% 0;
  width: ${u(44)}; height: ${u(48)};
  display: flex; flex-direction: column; align-items: center; gap: ${u(6)};
  padding: ${u(6)} 0 0; border: 0; background: transparent; cursor: pointer;
  border-radius: ${u(radius.control)};
}
.c34-tick {
  width: ${u(4)}; height: ${u(20)}; border-radius: 999px;
  background: ${color.muted};
  transition-property: background-color, scale;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.c34-time {
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  font-size: ${u(11)}; font-variant-numeric: tabular-nums; color: ${color.faint};
  transition-property: color; transition-duration: ${motion.state}ms;
}
.c34-mark[data-on] .c34-tick { background: var(--k2-accent); scale: 1 1.15; }
.c34-mark[data-on] .c34-time { color: var(--k2-accent); }
@media (hover: hover) { .c34-mark:not([data-on]):hover .c34-tick { background: ${color.ink}; } }
.c34-mark:focus-visible { outline-color: var(--k2-accent); }
.c34-quote { margin-top: ${u(10)}; }
.c34-turn { display: grid; grid-template-columns: ${u(42)} 1fr; align-items: baseline; }
@media (prefers-reduced-motion: reduce) {
  .c34-tick, .c34-time { transition-duration: 0ms; }
}
`
