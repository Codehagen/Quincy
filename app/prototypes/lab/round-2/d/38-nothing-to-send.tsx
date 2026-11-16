"use client"

import * as React from "react"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"
import {
  ArrowRight01Icon,
  Call02Icon,
  ChartLineData01Icon,
  GitMergeIcon,
} from "@hugeicons/core-free-icons"

import {
  Arrive,
  Card,
  Lead,
  MarginNote,
  Mono,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion, radius } from "../tokens"

/**
 * 38 — Nothing to send.
 *
 * The empty Drafts page. It sounds like a person who has run out of work and
 * wants yours: three ways in, each one a question an editor would actually ask
 * next. Picking one is what brings the question in; nothing moves until then.
 * The accent is only the icon of the one you picked.
 * The last post is still stated against your own median, so empty does not
 * read as failing.
 */

type Starter = {
  id: string
  label: string
  icon: IconSvgElement
  ask: string
  then: string
}

const STARTERS: Starter[] = [
  {
    id: "shipped",
    label: "I shipped something",
    icon: GitMergeIcon,
    ask: "What was it, and who noticed first?",
    then: "Paste the PR if you have it. I read the diff so you don't have to explain it.",
  },
  {
    id: "call",
    label: "I had a call worth keeping",
    icon: Call02Icon,
    ask: "Drop the recording in.",
    then: "I'll read it before you do and mark the one thing worth a post.",
  },
  {
    id: "number",
    label: "A number moved",
    icon: ChartLineData01Icon,
    ask: "Which one, and from what?",
    then: "Give me the before and the after. The number gets its own line.",
  },
]

const css = `
.d38-starter {
  position: relative;
  display: flex; align-items: center; gap: ${u(10)};
  width: 100%; height: ${u(38)}; padding: 0 ${u(10)};
  border: 0; border-radius: ${u(radius.control)};
  background: transparent; color: ${color.muted};
  text-align: left; cursor: pointer;
  transition-property: background-color, color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.d38-starter[aria-pressed="true"] { background: ${color.well}; color: ${color.ink}; }
@media (hover: hover) {
  .d38-starter:hover { color: ${color.ink}; }
}
@media (pointer: coarse) {
  .d38-starter::after { content: ""; position: absolute; left: 0; right: 0; top: 50%; height: 44px; translate: 0 -50%; }
}
.d38-icon { width: ${u(16)}; height: ${u(16)}; flex: none; }
.d38-go {
  margin-left: auto; width: ${u(14)}; height: ${u(14)};
  opacity: 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
  translate: calc(-1 * ${u(3)}) 0;
}
.d38-starter[aria-pressed="true"] .d38-go { opacity: 1; translate: 0 0; }
.d38-icon { transition-property: color; transition-duration: ${motion.state}ms; }
.d38-starter[aria-pressed="true"] .d38-icon { color: var(--k2-accent); }
@media (prefers-reduced-motion: reduce) {
  .d38-starter, .d38-go, .d38-icon { transition-duration: 0ms; }
}
`

export default function NothingToSend() {
  const [picked, setPicked] = React.useState<string | null>(null)
  // Keep the last answer on screen while Arrive closes, so it folds away
  // with its words instead of emptying first.
  const [shown, setShown] = React.useState<Starter>(STARTERS[0]!)

  const pick = (s: Starter) => {
    setShown(s)
    setPicked((p) => (p === s.id ? null : s.id))
  }

  return (
    <Stage
      lead="Empty sounds like a person."
      rest="When the drafts run out, Quincy asks for your week instead of showing a blank page."
    >
      <style href="lab-r2-d38" precedence="default">
        {css}
      </style>
      <Card width={330}>
        <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
          <Text weight="strong" as="h2">
            Drafts
          </Text>
          <Mono>0</Mono>
        </div>
        <Text size="small" tone="muted">
          Your last post went out Thursday, at 1.8× your median.
        </Text>

        <div style={{ padding: `${u(16)} 0 ${u(12)}` }}>
          <Lead
            bold="Nothing to send today."
            rest="Tell me about your week. I'll find the post in it."
          />
        </div>

        <MarginNote note="pick one. you don't have to write it up">
          <div role="group" aria-label="Start with" style={{ margin: `0 ${u(-10)}` }}>
            {STARTERS.map((s) => (
              <button
                key={s.id}
                type="button"
                className="d38-starter"
                aria-pressed={picked === s.id}
                onClick={() => pick(s)}
              >
                <HugeiconsIcon icon={s.icon} strokeWidth={1.8} className="d38-icon" aria-hidden />
                {s.label}
                <HugeiconsIcon
                  icon={ArrowRight01Icon}
                  strokeWidth={2}
                  className="d38-go"
                  aria-hidden
                />
              </button>
            ))}
          </div>
        </MarginNote>

        <Arrive show={picked !== null} from="below">
          <div
            aria-live="polite"
            style={{ display: "flex", flexDirection: "column", gap: u(4), paddingTop: u(12) }}
          >
            <Text weight="strong">{shown.ask}</Text>
            <Text size="small" tone="muted">
              {shown.then}
            </Text>
          </div>
        </Arrive>
      </Card>
    </Stage>
  )
}
