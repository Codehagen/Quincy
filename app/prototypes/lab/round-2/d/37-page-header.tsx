"use client"

import * as React from "react"
import { QuillWrite01Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Card,
  MarginNote,
  Mono,
  QuietButton,
  Rule,
  Skeleton,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion } from "../tokens"

/**
 * 37 — The page header.
 *
 * Title, one line of what Quincy is doing on this page, one action. The line
 * is not a description of the page ("Your riffs live here"); it is the editor
 * telling you where they are and what they would do next. Pressing the action
 * changes the line, because what Quincy is doing changed.
 */

type Phase = "idle" | "drafting" | "done"

const LINE: Record<Phase, string> = {
  idle: "I found three new angles in Tuesday's call. I would start with the deploy one.",
  drafting: "Drafting the deploy one now, in your voice.",
  done: "The deploy one is in Drafts. Eleven riffs left; none of them is urgent.",
}

const RIFFS = [
  { title: "Nobody asked for the build cache.", src: "deploy-call.m4a · 2:03" },
  { title: "The changelog got its own page.", src: "pr #418 · merged" },
  { title: "Support stopped asking about exports.", src: "walk-tuesday.m4a" },
]

const css = `
.d37-line {
  min-height: ${u(40)};
  transition-property: opacity;
  transition-duration: ${motion.state}ms;
}
.d37-row {
  display: flex; flex-direction: column; gap: ${u(3)};
  padding: ${u(10)} 0;
  border-top: 1px solid ${color.hairline};
}
.d37-row:first-of-type { border-top: 0; }
.d37-tag {
  transition-property: opacity;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
@media (prefers-reduced-motion: reduce) {
  .d37-line, .d37-tag { transition-duration: 0ms; }
}
`

export default function PageHeader() {
  const [phase, setPhase] = React.useState<Phase>("idle")
  const timer = React.useRef<number>(0)

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const draft = () => {
    setPhase("drafting")
    timer.current = window.setTimeout(() => setPhase("done"), 1100)
  }
  const undo = () => {
    window.clearTimeout(timer.current)
    setPhase("idle")
  }

  return (
    <Stage
      lead="The header says what Quincy is doing."
      rest="Not what the page is for. You know what Riffs is for."
    >
      <style href="lab-r2-d37" precedence="default">
        {css}
      </style>
      <Card width={330}>
        <header style={{ display: "flex", flexDirection: "column", gap: u(4) }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: u(8) }}>
            <Text weight="strong" as="h2">
              Riffs
            </Text>
            <Mono>{phase === "done" ? 11 : 12}</Mono>
          </div>
          <div className="d37-line" aria-live="polite">
            <Text tone="muted">{LINE[phase]}</Text>
          </div>
          <div style={{ display: "flex", gap: u(4), marginTop: u(8) }}>
            {phase === "done" ? (
              <QuietButton onClick={undo}>Undo</QuietButton>
            ) : (
              <ActionButton
                icon={QuillWrite01Icon}
                onClick={draft}
                pending={phase === "drafting"}
                pendingLabel="Drafting…"
              >
                Draft the deploy one
              </ActionButton>
            )}
          </div>
        </header>

        <Rule />

        <div>
          {RIFFS.map((r, i) => {
            const row = (
              <div className="d37-row">
                <Text weight={i === 0 ? "strong" : "regular"}>{r.title}</Text>
                <span style={{ display: "flex", gap: u(8) }}>
                  <Mono tone="faint">{r.src}</Mono>
                  {i === 0 ? (
                    <span
                      className="d37-tag"
                      style={{ opacity: phase === "done" ? 1 : 0 }}
                    >
                      <Mono>· in Drafts</Mono>
                    </span>
                  ) : null}
                </span>
              </div>
            )
            return i === 0 ? (
              <MarginNote key={r.title} note="it has a number. the others don't, yet">
                {row}
              </MarginNote>
            ) : (
              <React.Fragment key={r.title}>{row}</React.Fragment>
            )
          })}
          <div className="d37-row">
            <Skeleton width="74%" />
            <Skeleton width={90} />
          </div>
          <div className="d37-row">
            <Skeleton width="62%" />
          </div>
        </div>
      </Card>
    </Stage>
  )
}
