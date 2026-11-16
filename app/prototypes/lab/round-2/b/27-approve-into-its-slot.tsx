"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Arrive,
  Avatar,
  Card,
  Mono,
  QuietButton,
  Skeleton,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion, radius, type } from "../tokens"

/**
 * 27 — Approve into its slot. Kept 07's cause and effect, without the cursor
 * and without the split window: the draft is a small object above the week.
 * Approve folds the draft down to one line that says when it goes out, the
 * week rises under it, and the post slides into Wednesday's open slot. Undo
 * runs the same transitions backwards.
 */

const WEEK = [
  { day: "Tue 17", time: "12:30", bar: 168 },
  { day: "Wed 18", time: "09:00", bar: 0 },
  { day: "Thu 19", time: "07:45", bar: 196 },
  { day: "Fri 20", time: "16:00", bar: 132 },
] as const

const TITLE = "I gave our changelog its own page."

export default function ApproveIntoItsSlot() {
  const [approved, setApproved] = React.useState(false)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const approveRef = React.useRef<HTMLButtonElement>(null)

  // Focus follows the control that replaced the one you pressed.
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    ;(approved ? undoRef : approveRef).current?.focus({ preventScroll: true })
  }, [approved])

  return (
    <Stage
      lead="Approve puts it in its slot."
      rest="Nothing goes out in your name until you press it."
    >
      <style>{css}</style>
      <Card crop="none" width={500}>
        <div style={{ display: "flex", alignItems: "center", gap: u(8) }}>
          <Avatar initials="C" />
          <Text as="span" weight="strong">
            Christer
          </Text>
          <Mono>X · draft 2</Mono>
        </div>

        <Arrive show={!approved}>
          <div style={{ display: "flex", flexDirection: "column", gap: u(6), paddingTop: u(12) }}>
            <Text>{TITLE}</Text>
            <Text>412 people opened it in two days.</Text>
            <Text>Three wrote back. One of them found a bug before we did.</Text>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: u(6), marginTop: u(16) }}>
            <ActionButton ref={approveRef} icon={Tick02Icon} onClick={() => setApproved(true)}>
              Approve
            </ActionButton>
            <QuietButton>Edit</QuietButton>
            <span style={{ marginLeft: "auto" }}>
              <Mono tone="faint">Wed 09:00 is open</Mono>
            </span>
          </div>
        </Arrive>

        <Arrive show={approved} from="below">
          <div
            aria-live="polite"
            style={{ display: "flex", alignItems: "center", gap: u(6), paddingTop: u(10) }}
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              strokeWidth={2}
              aria-hidden
              style={{ width: u(16), height: u(16), color: "var(--k2-accent)", flex: "none" }}
            />
            <Text as="span" weight="strong">
              Approved.
            </Text>
            <Text as="span" tone="muted">
              Out Wed 09:00, in your name.
            </Text>
            <span style={{ marginLeft: "auto" }}>
              <QuietButton ref={undoRef} onClick={() => setApproved(false)}>
                Undo
              </QuietButton>
            </span>
          </div>
        </Arrive>
      </Card>

      <Card width={500}>
        <div style={{ display: "flex", alignItems: "baseline", gap: u(8), marginBottom: u(8) }}>
          <Text as="span" weight="strong">
            Rest of week 47
          </Text>
          <Text as="span" tone="muted">
            {approved ? "4 of 4 slots filled" : "3 of 4 slots filled"}
          </Text>
        </div>
        {WEEK.map((row) => (
          <div
            key={row.day}
            style={{
              display: "grid",
              gridTemplateColumns: `${u(44)} ${u(48)} 1fr`,
              alignItems: "center",
              height: u(40),
              borderTop: `1px solid ${color.hairline}`,
            }}
          >
            <Text as="span" size="small" weight="strong">
              {row.day.slice(0, 3)}
            </Text>
            <Mono>{row.time}</Mono>
            {row.bar ? (
              <Skeleton width={row.bar} />
            ) : (
              <span style={{ position: "relative", height: u(28) }}>
                <span className="r2b27-open" data-gone={approved || undefined}>
                  Open
                </span>
                <span className="r2b27-filled" data-on={approved || undefined}>
                  {TITLE}
                </span>
              </span>
            )}
          </div>
        ))}
      </Card>
    </Stage>
  )
}

const css = `
.r2b27-open, .r2b27-filled {
  position: absolute; inset: 0;
  display: flex; align-items: center;
  border-radius: ${u(radius.chip)};
  white-space: nowrap; overflow: hidden;
}
.r2b27-open {
  padding-left: ${u(10)};
  outline: 1px dashed rgba(18, 18, 18, 0.18); outline-offset: -1px;
  color: ${color.faint};
  transition-property: opacity;
  transition-duration: ${motion.state}ms;
}
.r2b27-open[data-gone] { opacity: 0; }
.r2b27-filled {
  padding-left: ${u(10)};
  background: ${color.well};
  font-weight: ${type.strongWeight};
  opacity: 0; translate: ${u(-40)} 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.state}ms, ${motion.travel}ms;
  transition-timing-function: ${motion.easeOut}, ${motion.easeMove};
}
.r2b27-filled[data-on] {
  opacity: 1; translate: 0 0;
  transition-delay: ${motion.press}ms;
}
@media (prefers-reduced-motion: reduce) {
  .r2b27-open, .r2b27-filled, .r2b27-filled[data-on] {
    transition-duration: 0ms; transition-delay: 0ms;
  }
}
`
