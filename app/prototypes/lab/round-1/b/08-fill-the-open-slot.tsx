"use client"

import * as React from "react"

import {
  Bar,
  CANVAS,
  Chrome,
  Cursor,
  FAINT,
  GREY,
  INK,
  Lead,
  MONO,
  OBJECT_SHADOW,
  SharedStyles,
  Stage,
  u,
  useSequence,
} from "./stage"

/** The one accent: the slot that just took a riff. */
const VERMILION = "#EC4A27"

// idle · reach · grab · carry · drafting · ready (hold) · clear
const DURATIONS = [900, 900, 260, 950, 1400, 3000, 450]
const REST = 5

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"]
// [X row, LinkedIn row]; null is open, "slot" is the one being filled.
const GRID: (null | "slot" | { t: string; w: number })[][] = [
  [{ t: "08:10", w: 52 }, null, { t: "09:00", w: 60 }, { t: "12:00", w: 44 }, { t: "16:00", w: 56 }],
  [null, { t: "12:30", w: 58 }, { t: "08:30", w: 48 }, "slot", null],
]

const COL = 92
const ROW = 58

export default function FillTheOpenSlot() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const cardRef = React.useRef<HTMLButtonElement>(null)
  const slotRef = React.useRef<HTMLDivElement>(null)
  const drag = React.useRef<{ x: number; y: number; scale: number; moved: number } | null>(null)
  const [dragging, setDragging] = React.useState(false)
  const { phase, jump, reduced } = useSequence(DURATIONS, stageRef, REST, dragging)

  const grabbed = phase === 2 || phase === 3
  const placed = phase >= 4 && phase <= 5
  const drafting = phase === 4
  const ready = phase === 5

  // Where the card sits: home in the tray, or carried onto the open slot.
  // Written to the DOM so it can be measured without reading refs in render.
  // Only two phases move it: the carry flies it out, the reset brings it home.
  React.useEffect(() => {
    const card = cardRef.current
    const slot = slotRef.current
    const stage = stageRef.current
    if (!card || !slot || !stage) return
    if (phase === 0) {
      card.style.transitionDuration = "0ms"
      card.style.transform = "translate(0, 0) scale(1)"
      return
    }
    if (phase !== 3) return
    const scale = stage.getBoundingClientRect().width / CANVAS
    const c = card.getBoundingClientRect()
    const s = slot.getBoundingClientRect()
    const dx = (s.left + s.width / 2 - (c.left + c.width / 2)) / scale
    const dy = (s.top + s.height / 2 - (c.top + c.height / 2)) / scale
    card.style.transitionDuration = reduced ? "0ms" : "950ms"
    card.style.transform = `translate(${u(dx)}, ${u(dy)}) scale(0.5)`
  }, [phase, reduced])

  const onPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const stage = stageRef.current
    if (!stage || placed) return
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      scale: stage.getBoundingClientRect().width / CANVAS,
      moved: 0,
    }
    e.currentTarget.style.transitionDuration = "0ms"
    setDragging(true)
  }

  const onPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    if (!d) return
    const dx = (e.clientX - d.x) / d.scale
    const dy = (e.clientY - d.y) / d.scale
    d.moved = Math.max(d.moved, Math.abs(dx) + Math.abs(dy))
    e.currentTarget.style.transform = `translate(${u(dx)}, ${u(dy)}) scale(0.92)`
  }

  const onPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const d = drag.current
    drag.current = null
    const slot = slotRef.current
    const card = e.currentTarget
    if (!d || !slot) return setDragging(false)
    const s = slot.getBoundingClientRect()
    const over =
      e.clientX >= s.left - 12 && e.clientX <= s.right + 12 && e.clientY >= s.top - 12 && e.clientY <= s.bottom + 12
    card.style.transitionDuration = reduced ? "0ms" : "320ms"
    card.style.transform = "translate(0, 0) scale(1)"
    setDragging(false)
    if (over) jump(4)
  }

  const cursorTarget = phase === 1 || phase === 2 ? cardRef : phase === 3 ? slotRef : { x: 470, y: 392 }

  return (
    <Stage stageRef={stageRef} label="Dragging a riff into an open slot">
      <SharedStyles />
      <Lead bold="An open slot is a decision." rest="Drop a riff in and Quincy writes it for that hour." />

      <div
        style={{
          position: "absolute",
          left: u(28),
          top: u(86),
          width: u(520),
          height: u(320),
          background: "#fff",
          borderRadius: u(12),
          boxShadow: OBJECT_SHADOW,
        }}
      >
        <Chrome address="hirequincy.com/lineup" />
        <div style={{ padding: `${u(12)} ${u(14)} 0` }}>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(5, ${u(COL)})` }}>
            {DAYS.map((d) => (
              <span key={d} style={{ fontWeight: 560, paddingLeft: u(6), height: u(24) }}>
                {d}
                {d === "Thu" ? <span style={{ color: GREY, fontWeight: 460 }}> 20</span> : null}
              </span>
            ))}
          </div>

          {GRID.map((row, r) => (
            <div key={r} style={{ display: "grid", gridTemplateColumns: `repeat(5, ${u(COL)})`, marginBottom: u(6) }}>
              {row.map((cell, c) => (
                <div key={c} style={{ height: u(ROW), padding: `0 ${u(3)}` }}>
                  {cell === "slot" ? (
                    <div
                      ref={slotRef}
                      style={{
                        position: "relative",
                        height: "100%",
                        borderRadius: u(8),
                        padding: `${u(6)} ${u(8)}`,
                        background: placed ? "#fff" : "transparent",
                        outline: placed ? `1.5px solid ${drafting ? VERMILION : "rgba(17,17,17,0.10)"}` : "1px dashed rgba(17,17,17,0.2)",
                        transitionProperty: "outline-color, background-color",
                        transitionDuration: reduced ? "0ms" : "500ms",
                      }}
                    >
                      {placed ? (
                        <>
                          <span style={{ display: "flex", alignItems: "center", gap: u(5), fontFamily: MONO, fontSize: u(11.5), color: GREY, letterSpacing: 0 }}>
                            07:45
                            <span
                              className={drafting ? "b-loop" : undefined}
                              style={{
                                width: u(5),
                                height: u(5),
                                borderRadius: "50%",
                                background: drafting ? VERMILION : "transparent",
                                animation: drafting ? "b-rec 1s steps(2) infinite" : "none",
                              }}
                            />
                          </span>
                          <span style={{ display: "block", fontWeight: 560, whiteSpace: "nowrap" }}>Pricing call</span>
                          <span style={{ display: "block", color: GREY, fontSize: u(12) }}>{ready ? "Draft ready" : "Drafting…"}</span>
                        </>
                      ) : (
                        <span style={{ color: FAINT }}>Open</span>
                      )}
                    </div>
                  ) : cell ? (
                    <div style={{ height: "100%", borderRadius: u(8), background: "#F6F6F4", padding: `${u(7)} ${u(8)}`, display: "flex", flexDirection: "column", gap: u(7) }}>
                      <span style={{ fontFamily: MONO, fontSize: u(11.5), color: FAINT, letterSpacing: 0, lineHeight: 1 }}>{cell.t}</span>
                      <Bar w={cell.w} h={7} tone="#E5E5E2" />
                      <Bar w={cell.w * 0.6} h={7} tone="#E5E5E2" />
                    </div>
                  ) : r === 1 && c === 4 ? (
                    <span
                      style={{
                        display: "block",
                        fontFamily: "var(--lab-caveat), cursive",
                        fontSize: u(19),
                        lineHeight: u(17),
                        color: "rgba(17,17,17,0.62)",
                        paddingTop: u(8),
                        paddingLeft: u(14),
                        opacity: ready ? 1 : 0,
                        transitionProperty: "opacity",
                        transitionDuration: reduced ? "0ms" : "400ms",
                      }}
                    >
                      <svg aria-hidden viewBox="0 0 20 10" style={{ position: "absolute", width: u(16), height: u(8), marginLeft: u(-18), marginTop: u(6) }}>
                        <path d="M19 6 C 13 7, 7 6, 2 3 M2 3 L6 2 M2 3 L4 7" fill="none" stroke="rgba(17,17,17,0.55)" strokeWidth="1.2" strokeLinecap="round" />
                      </svg>
                      your best LinkedIn hour
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          <div style={{ display: "flex", gap: u(8), margin: `${u(10)} 0 ${u(8)}`, paddingLeft: u(6) }}>
            <span style={{ fontWeight: 560 }}>Ready riffs</span>
            <span style={{ color: GREY }}>{placed ? "2" : "3"}</span>
          </div>
          <div style={{ display: "flex", gap: u(8), paddingLeft: u(3) }}>
            <button
              ref={cardRef}
              type="button"
              aria-label="Riff: The call that changed our pricing page. Drag to Thursday, or press Enter."
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault()
                  jump(reduced ? 5 : 3)
                }
              }}
              style={{
                position: "relative",
                zIndex: 20,
                width: u(184),
                height: u(52),
                padding: `${u(7)} ${u(10)}`,
                textAlign: "left",
                font: "inherit",
                color: INK,
                border: 0,
                borderRadius: u(10),
                background: "#fff",
                boxShadow: grabbed || dragging
                  ? "0 0 0 1px rgba(17,17,17,0.08), 0 12px 28px -8px rgba(17,17,17,0.28)"
                  : "0 0 0 1px rgba(17,17,17,0.09)",
                opacity: placed ? 0 : 1,
                cursor: dragging ? "grabbing" : "grab",
                touchAction: "none",
                transformOrigin: "center",
                transitionProperty: "transform, box-shadow, opacity",
                transitionDuration: "950ms",
                transitionTimingFunction: "cubic-bezier(0.45, 0, 0.2, 1)",
              }}
            >
              <span style={{ display: "block", fontWeight: 560, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                The call that changed our pricing
              </span>
              <span style={{ display: "block", color: GREY }}>Riff · from a call, 41 min</span>
            </button>
            {[150, 120].map((w) => (
              <div key={w} style={{ width: u(184), height: u(52), borderRadius: u(10), boxShadow: "0 0 0 1px rgba(17,17,17,0.07)", padding: `${u(12)} ${u(10)}`, display: "flex", flexDirection: "column", gap: u(8), flexShrink: 0 }}>
                <Bar w={w} />
                <Bar w={w * 0.55} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Cursor stageRef={stageRef} target={cursorTarget} pressed={grabbed} hidden={dragging} duration={phase === 3 ? 950 : 900} />
    </Stage>
  )
}
