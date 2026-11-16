"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { color, motion, radius } from "../tokens"
import {
  ActionButton,
  Arrive,
  MarginNote,
  Mono,
  QuietButton,
  Stage,
  Text,
  u,
  Window,
} from "../kit"

/**
 * The brain's voice page. Quincy has seen the same cut twice and asks before
 * writing it down; Keep moves the ask out and the rule into the list, with
 * its receipt and a note naming the edit it came from. Undo on the new rule
 * reverses both. The rule's dot is the one place the accent sits at rest.
 *
 * Local: the rule row (dot, line, mono receipt) and the ask in a well.
 */

const css = `
.a24-new .k2-margin {
  opacity: 0; translate: calc(-1 * ${u(4)}) 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.a24-new[data-on] .k2-margin { opacity: 1; translate: 0 0; transition-delay: ${motion.enter}ms; }
@media (prefers-reduced-motion: reduce) {
  .a24-new .k2-margin, .a24-new[data-on] .k2-margin { transition-duration: 0ms; transition-delay: 0ms; }
}
`

const DOT = { width: u(6), height: u(6), borderRadius: "50%", flex: "none" } as const

function RuleRow({
  text,
  receipt,
  fresh = false,
  action,
}: {
  text: string
  receipt: string
  fresh?: boolean
  action?: React.ReactNode
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `${u(14)} 1fr auto`,
        alignItems: "center",
        minHeight: u(30),
      }}
    >
      <span
        aria-hidden
        style={{ ...DOT, background: fresh ? "var(--k2-accent)" : "rgba(18,18,18,.18)" }}
      />
      <Text as="span">{text}</Text>
      <span style={{ display: "inline-flex", alignItems: "center", gap: u(2) }}>
        <Mono tone={fresh ? "ink" : "muted"}>{receipt}</Mono>
        {action}
      </span>
    </div>
  )
}

export default function ARuleArrives() {
  const [kept, setKept] = React.useState(false)
  const keepRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const moved = React.useRef(false)

  React.useEffect(() => {
    if (!moved.current) return
    ;(kept ? undoRef : keepRef).current?.focus()
  }, [kept])

  const toggle = (next: boolean) => {
    moved.current = true
    setKept(next)
  }

  return (
    <Stage
      accent="green"
      lead="Quincy learns from what you cut."
      rest="When it sees the same edit twice, it asks before it writes it down."
    >
      <style>{css}</style>
      <Window address="hirequincy.com/brain/voice" width={330}>
        <Text weight="strong">Voice</Text>
        <Text tone="muted">How you write, from what you keep and what you cut.</Text>

        <div style={{ marginTop: u(12) }}>
          <RuleRow text="Says “shipped”, never “launched”." receipt="12 edits" />
          <RuleRow text="The number gets its own line." receipt="9 posts" />
          {/* Arrive clips what overflows it, so the note wraps it from outside. */}
          <div className="a24-new" data-on={kept || undefined}>
            <MarginNote note="from your edit, Tue 09:14">
              <Arrive show={kept}>
                <RuleRow
                  fresh
                  text="Never “excited”. Not once."
                  receipt="today"
                  action={
                    <QuietButton ref={undoRef} onClick={() => toggle(false)}>
                      Undo
                    </QuietButton>
                  }
                />
              </Arrive>
            </MarginNote>
          </div>
        </div>

        <Arrive show={!kept}>
          <div
            style={{
              marginTop: u(12),
              padding: u(12),
              background: color.well,
              borderRadius: u(radius.chip),
              display: "flex",
              flexDirection: "column",
              gap: u(10),
            }}
          >
            <Text>
              You cut “excited” from two drafts this week. Should I stop using it?
            </Text>
            <div style={{ display: "flex", gap: u(6) }}>
              <ActionButton ref={keepRef} icon={Tick02Icon} onClick={() => toggle(true)}>
                Keep the rule
              </ActionButton>
              <QuietButton>Not yet</QuietButton>
            </div>
          </div>
        </Arrive>
      </Window>
    </Stage>
  )
}
