"use client"

import * as React from "react"
import { QuillWrite02Icon } from "@hugeicons/core-free-icons"

import { color, motion, radius } from "../tokens"
import {
  ActionButton,
  Arrive,
  Card,
  Highlight,
  MarginNote,
  Mono,
  QuietButton,
  Rule,
  Stage,
  Text,
  u,
} from "../kit"

/**
 * A riff card in Studio. One recording, three angles; each angle stands on a
 * different sentence of the transcript. Picking an angle moves the
 * highlighter and the margin note to its sentence. Arrow keys move between
 * angles, as a tablist should.
 *
 * Local: a segmented tab control (the kit has no tab), and a way to show one
 * MarginNote of several (the kit's MarginNote has no `show`).
 */

const ANGLES = [
  {
    id: "fix",
    tab: "The fix",
    line: "On Monday we took the retry button off the payment error screen.",
    why: "one small change. that's the whole post",
  },
  {
    id: "number",
    tab: "The number",
    line: "Tickets about failed payments went from forty a week to nine.",
    why: "40 → 9, and it's against your own weeks",
  },
  {
    id: "lesson",
    tab: "The lesson",
    line: "People pressed retry until their bank flagged the card.",
    why: "the part nobody saw coming",
  },
] as const

const css = `
.a22-tabs {
  display: inline-flex; gap: ${u(2)}; padding: ${u(2)};
  background: ${color.well}; border-radius: ${u(radius.control)};
}
.a22-tab {
  position: relative; height: ${u(26)}; padding: 0 ${u(10)};
  border: 0; border-radius: ${u(radius.chip)};
  background: transparent; color: ${color.muted};
  font-size: ${u(12.5)}; cursor: pointer;
  transition-property: background-color, color, box-shadow;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.a22-tab[aria-selected="true"] {
  background: ${color.surface}; color: ${color.ink};
  box-shadow: 0 0 0 1px rgba(18,18,18,.06), 0 1px 2px rgba(18,18,18,.06);
}
@media (hover: hover) { .a22-tab:hover { color: ${color.ink}; } }
@media (pointer: coarse) {
  .a22-tab::after { content: ""; position: absolute; inset: 50% 0 auto; height: 44px; translate: 0 -50%; }
}
.a22-line { color: ${color.muted}; transition-property: color; transition-duration: ${motion.state}ms; }
.a22-line[data-on] { color: ${color.ink}; }
.a22-line .k2-margin {
  opacity: 0; translate: calc(-1 * ${u(4)}) 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.a22-line[data-on] .k2-margin { opacity: 1; translate: 0 0; transition-delay: ${motion.noteDelay - 200}ms; }
@media (prefers-reduced-motion: reduce) {
  .a22-tab, .a22-line, .a22-line .k2-margin, .a22-line[data-on] .k2-margin {
    transition-duration: 0ms; transition-delay: 0ms;
  }
}
`

type Id = (typeof ANGLES)[number]["id"]

export default function ThreeWaysIn() {
  const [active, setActive] = React.useState<Id>("number")
  const [drafting, setDrafting] = React.useState(false)
  const tabs = React.useRef<Record<string, HTMLButtonElement | null>>({})
  const id = React.useId()
  const current = ANGLES.find((a) => a.id === active)!

  const onKey = (e: React.KeyboardEvent) => {
    const i = ANGLES.findIndex((a) => a.id === active)
    const step = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0
    if (!step) return
    e.preventDefault()
    const next = ANGLES[(i + step + ANGLES.length) % ANGLES.length]!
    setActive(next.id)
    setDrafting(false)
    tabs.current[next.id]?.focus()
  }

  return (
    <Stage
      lead="One recording, three ways in."
      rest="Each angle stands on a sentence you said. Pick the one you would say out loud."
    >
      <style>{css}</style>
      <Card width={330}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text weight="strong" as="span">
            Riff
          </Text>
          <Mono>standup-thursday.m4a · 6:48</Mono>
        </div>

        <div
          role="tablist"
          aria-label="Angles"
          className="a22-tabs"
          onKeyDown={onKey}
          style={{ marginTop: u(12), marginBottom: u(14) }}
        >
          {ANGLES.map((a) => (
            <button
              key={a.id}
              ref={(el) => {
                tabs.current[a.id] = el
              }}
              type="button"
              role="tab"
              id={`${id}-tab-${a.id}`}
              aria-selected={a.id === active}
              aria-controls={`${id}-panel`}
              tabIndex={a.id === active ? 0 : -1}
              className="a22-tab"
              onClick={() => {
                setActive(a.id)
                setDrafting(false)
              }}
            >
              {a.tab}
            </button>
          ))}
        </div>

        <div
          id={`${id}-panel`}
          role="tabpanel"
          aria-labelledby={`${id}-tab-${active}`}
          style={{ display: "flex", flexDirection: "column", gap: u(10) }}
        >
          {ANGLES.map((a) => {
            const on = a.id === active
            return (
              <div key={a.id} className="a22-line" data-on={on || undefined}>
                <MarginNote note={a.why}>
                  <Text>
                    <Highlight active={on}>{a.line}</Highlight>
                  </Text>
                </MarginNote>
              </div>
            )
          })}
        </div>

        <Rule />

        <Arrive show={!drafting}>
          <div style={{ display: "flex", gap: u(6) }}>
            <ActionButton icon={QuillWrite02Icon} onClick={() => setDrafting(true)}>
              Draft {current.tab.toLowerCase()}
            </ActionButton>
            <QuietButton>None of these</QuietButton>
          </div>
        </Arrive>
        <Arrive show={drafting} from="below">
          <div role="status" style={{ minHeight: u(34), display: "flex", alignItems: "center" }}>
            <Text tone="muted">Drafting {current.tab.toLowerCase()} in your voice.</Text>
          </div>
        </Arrive>
      </Card>
    </Stage>
  )
}
