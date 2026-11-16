"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Avatar,
  Bar,
  Cursor,
  FAINT,
  GREY,
  Lead,
  MONO,
  OBJECT_SHADOW,
  Stage,
  u,
  useSequence,
} from "./stage"

/** The one accent: Approve, the most repeated press in the product. */
const BLUE = "#1F6BFF"

// idle · travel · press · approved (hold) · clear
const DURATIONS = [900, 1000, 200, 3800, 450]
const REST = 3

const WEEK = [
  { slot: "Mon 08:10", ch: "X", filled: 132 },
  { slot: "Tue 12:30", ch: "in", filled: 104 },
  { slot: "Wed 09:00", ch: "X", filled: 0 },
  { slot: "Thu 07:45", ch: "in", filled: 120 },
  { slot: "Fri 16:00", ch: "X", filled: 88 },
]

export default function ApproveIntoTheWeek() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const approveRef = React.useRef<HTMLButtonElement>(null)
  const slotRef = React.useRef<HTMLDivElement>(null)
  const { phase, jump, reduced } = useSequence(DURATIONS, stageRef, REST)

  const pressed = phase === 2
  const approved = phase === 3
  const target =
    phase === 1 || phase === 2 ? approveRef : approved ? slotRef : { x: 470, y: 384 }
  const dur = reduced ? "0ms" : "420ms"

  return (
    <Stage stageRef={stageRef} label="Approve sends a draft into the week">
      <Lead bold="Quincy drafts, you send." rest="Nothing goes out in your name until you press Approve." />

      <div
        style={{
          position: "absolute",
          left: u(28),
          top: u(90),
          width: u(540),
          height: u(330),
          display: "grid",
          gridTemplateColumns: `${u(272)} 1fr`,
          background: "#fff",
          borderRadius: u(12),
          boxShadow: OBJECT_SHADOW,
        }}
      >
        {/* The draft */}
        <div style={{ padding: u(18), borderRight: "1px solid rgba(17,17,17,0.06)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: u(8), marginBottom: u(12) }}>
            <Avatar initials="C" />
            <span style={{ fontWeight: 560 }}>Christer</span>
            <span style={{ color: GREY }}>X · draft 2</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: u(8),
              textWrap: "pretty",
              opacity: approved ? 0.55 : 1,
              transitionProperty: "opacity",
              transitionDuration: dur,
            }}
          >
            <p style={{ margin: 0 }}>I gave our changelog its own page.</p>
            <p style={{ margin: 0 }}>412 people opened it in two days.</p>
            <p style={{ margin: 0 }}>Three wrote back. One of them found a bug before we did.</p>
          </div>

          <div style={{ position: "relative", height: u(32), marginTop: u(18) }}>
            <div
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                gap: u(8),
                opacity: approved ? 0 : 1,
                pointerEvents: approved ? "none" : "auto",
                transitionProperty: "opacity",
                transitionDuration: reduced ? "0ms" : "160ms",
              }}
            >
              <button
                ref={approveRef}
                type="button"
                onClick={() => jump(reduced ? 3 : 2)}
                style={{
                  height: u(32),
                  padding: `0 ${u(14)}`,
                  borderRadius: u(8),
                  border: 0,
                  background: BLUE,
                  color: "#fff",
                  font: "inherit",
                  fontWeight: 560,
                  cursor: "pointer",
                  touchAction: "manipulation",
                  transform: pressed ? "scale(0.96)" : "scale(1)",
                  transitionProperty: "transform",
                  transitionDuration: reduced ? "0ms" : "120ms",
                }}
              >
                Approve
              </button>
              <span
                style={{
                  height: u(32),
                  padding: `0 ${u(12)}`,
                  display: "inline-flex",
                  alignItems: "center",
                  color: GREY,
                }}
              >
                Edit
              </span>
            </div>
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                inset: 0,
                display: "flex",
                alignItems: "center",
                gap: u(6),
                opacity: approved ? 1 : 0,
                transitionProperty: "opacity",
                transitionDuration: dur,
                transitionDelay: approved && !reduced ? "120ms" : "0ms",
              }}
            >
              {approved ? (
                <>
                  <HugeiconsIcon icon={Tick02Icon} size={16} color={BLUE} strokeWidth={2} aria-hidden style={{ width: u(16), height: u(16) }} />
                  <span style={{ fontWeight: 560 }}>Approved</span>
                  <span style={{ color: GREY }}>out Wed 09:00</span>
                  <button
                    type="button"
                    onClick={() => jump(0)}
                    style={{
                      marginLeft: u(4),
                      border: 0,
                      padding: 0,
                      background: "none",
                      font: "inherit",
                      color: FAINT,
                      cursor: "pointer",
                      textDecoration: "underline",
                      textUnderlineOffset: u(3),
                    }}
                  >
                    Undo
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>

        {/* The week */}
        <div style={{ padding: u(18) }}>
          <div style={{ display: "flex", gap: u(8), marginBottom: u(10) }}>
            <span style={{ fontWeight: 560 }}>This week</span>
            <span style={{ color: GREY }}>{approved ? "5 of 5 slots" : "4 of 5 slots"}</span>
          </div>
          {WEEK.map((row) => {
            const isSlot = row.filled === 0
            return (
              <div
                key={row.slot}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: u(12),
                  height: u(42),
                  borderTop: "1px solid rgba(17,17,17,0.05)",
                }}
              >
                <span style={{ fontFamily: MONO, fontSize: u(12), color: GREY, letterSpacing: 0, width: u(70), flexShrink: 0 }}>
                  {row.slot}
                </span>
                <span style={{ color: FAINT, width: u(14), flexShrink: 0 }}>{row.ch}</span>
                {isSlot ? (
                  <div ref={slotRef} style={{ position: "relative", flex: 1, height: u(28) }}>
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        paddingLeft: u(10),
                        borderRadius: u(6),
                        outline: `1px dashed rgba(17,17,17,0.18)`,
                        color: FAINT,
                        opacity: approved ? 0 : 1,
                        transitionProperty: "opacity",
                        transitionDuration: dur,
                      }}
                    >
                      Open slot
                    </span>
                    <span
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        opacity: approved ? 1 : 0,
                        transform: approved ? "translateX(0)" : `translateX(${u(-36)})`,
                        transitionProperty: "opacity, transform",
                        transitionDuration: reduced ? "0ms" : "520ms",
                        transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
                        transitionDelay: approved && !reduced ? "160ms" : "0ms",
                      }}
                    >
                      I gave our changelog its own page.
                    </span>
                  </div>
                ) : (
                  <Bar w={row.filled} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      <Cursor stageRef={stageRef} target={target} pressed={pressed} at={approved ? [0.35, 0.6] : [0.5, 0.6]} />
    </Stage>
  )
}
