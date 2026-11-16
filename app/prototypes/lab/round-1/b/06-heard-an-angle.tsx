"use client"

import * as React from "react"

import {
  Chrome,
  Cursor,
  GREY,
  INK,
  Lead,
  MONO,
  OBJECT_SHADOW,
  Stage,
  u,
  useSequence,
} from "./stage"

/** The one accent: a highlighter pen, on the line Quincy kept. */
const MARKER = "#FFE45C"

// idle · travel · press · listen · transcript · mark · angle (hold) · clear
const DURATIONS = [900, 1000, 180, 1500, 1100, 900, 3600, 450]
const REST = 6

const BARS = Array.from({ length: 46 }, (_, i) => {
  const v = Math.abs(Math.sin(i * 1.7) * 0.6 + Math.sin(i * 0.43) * 0.4)
  return 4 + Math.round(v * 16)
})

export default function HeardAnAngle() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const { phase, jump, reduced } = useSequence(DURATIONS, stageRef, REST)

  const clearing = phase === 7
  const pressed = phase === 2
  const listening = phase >= 3 && !clearing
  const transcript = phase >= 4 && !clearing
  const marked = phase >= 5 && !clearing
  const angle = phase >= 6 && !clearing

  const target =
    phase >= 1 && phase <= 5 ? buttonRef : phase === 6 ? { x: 452, y: 300 } : { x: 470, y: 380 }

  const ease = reduced ? "0ms" : undefined
  const reveal = (on: boolean, delay = 0): React.CSSProperties => ({
    opacity: on ? 1 : 0,
    transform: on ? "translateY(0)" : `translateY(${u(5)})`,
    transitionProperty: "opacity, transform",
    transitionDuration: ease ?? "380ms",
    transitionTimingFunction: "cubic-bezier(0.2, 0.7, 0.2, 1)",
    transitionDelay: on && !reduced ? `${delay}ms` : "0ms",
  })

  return (
    <Stage stageRef={stageRef} label="A voice note becomes an angle">
      <Lead
        bold="Talk on a walk."
        rest="Quincy listens to all six minutes and keeps the one line worth posting."
      />

      <div
        style={{
          position: "absolute",
          left: u(28),
          top: u(88),
          width: u(520),
          height: u(320),
          background: "#fff",
          borderRadius: u(12),
          boxShadow: OBJECT_SHADOW,
        }}
      >
        <Chrome address="hirequincy.com/studio" />

        <div style={{ padding: u(16), display: "flex", flexDirection: "column", gap: u(12) }}>
          {/* The raw material */}
          <div style={{ display: "flex", alignItems: "center", gap: u(10) }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: u(10),
                height: u(36),
                padding: `0 ${u(12)} 0 ${u(6)}`,
                borderRadius: u(18),
                background: "#F4F4F2",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: u(24),
                  height: u(24),
                  borderRadius: "50%",
                  background: INK,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg viewBox="0 0 10 10" style={{ width: u(8), height: u(8), marginLeft: u(1.5) }}>
                  <path d="M2 1 L9 5 L2 9 Z" fill="#fff" />
                </svg>
              </span>
              <span aria-hidden style={{ display: "flex", alignItems: "center", gap: u(2) }}>
                {BARS.map((h, i) => (
                  <span
                    key={i}
                    style={{
                      width: u(2),
                      height: u(h),
                      borderRadius: u(1),
                      background: listening ? INK : "#CFCFCB",
                      transitionProperty: "background-color",
                      transitionDuration: ease ?? "120ms",
                      transitionDelay: listening && !reduced ? `${i * 26}ms` : "0ms",
                    }}
                  />
                ))}
              </span>
              <span style={{ fontFamily: MONO, fontSize: u(12), color: GREY, letterSpacing: 0 }}>
                6:12
              </span>
            </div>

            <button
              ref={buttonRef}
              type="button"
              onClick={() => (reduced ? undefined : jump(2))}
              style={{
                height: u(32),
                padding: `0 ${u(12)}`,
                borderRadius: u(8),
                border: 0,
                background: INK,
                color: "#fff",
                font: "inherit",
                fontWeight: 560,
                cursor: "pointer",
                touchAction: "manipulation",
                transform: pressed ? "scale(0.96)" : "scale(1)",
                transitionProperty: "transform, background-color",
                transitionDuration: ease ?? "120ms",
                whiteSpace: "nowrap",
              }}
            >
              {listening && !angle ? "Listening…" : angle ? "Found one" : "Find the angle"}
            </button>
          </div>

          {/* What it heard */}
          <div style={{ width: u(440) }}>
            <div style={{ ...reveal(transcript), display: "flex", gap: u(8), marginBottom: u(4) }}>
              <span style={{ fontWeight: 560 }}>Transcript</span>
              <span style={{ fontFamily: MONO, fontSize: u(12), color: GREY, letterSpacing: 0 }}>
                01:52 – 02:10
              </span>
            </div>
            <p style={{ ...reveal(transcript, 120), margin: 0, color: GREY, textWrap: "pretty" }}>
              …four hundred and twelve people opened it. Three replied. And honestly{" "}
              <mark
                style={{
                  color: INK,
                  backgroundColor: "transparent",
                  backgroundImage: `linear-gradient(${MARKER}, ${MARKER})`,
                  backgroundRepeat: "no-repeat",
                  backgroundPosition: "0 60%",
                  backgroundSize: marked ? "100% 78%" : "0% 78%",
                  transitionProperty: "background-size",
                  transitionDuration: ease ?? "700ms",
                  transitionTimingFunction: "cubic-bezier(0.6, 0, 0.3, 1)",
                  boxDecorationBreak: "clone",
                  WebkitBoxDecorationBreak: "clone",
                  padding: `0 ${u(2)}`,
                }}
              >
                the three replies were better than the release itself
              </mark>
              .
            </p>
          </div>

          {/* The angle */}
          <div
            style={{
              ...reveal(angle),
              width: u(380),
              padding: u(10),
              borderRadius: u(10),
              background: "#FAFAF9",
              boxShadow: "0 0 0 1px rgba(17,17,17,0.07)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", color: GREY }}>
              <span>Angle</span>
              <span style={{ fontFamily: MONO, fontSize: u(12), letterSpacing: 0 }}>from 02:04</span>
            </div>
            <div style={{ fontWeight: 560 }}>The replies were the product.</div>
            <div style={{ color: GREY }}>412 read it. Three wrote back. One found the bug first.</div>
          </div>
        </div>
      </div>

      <Cursor stageRef={stageRef} target={target} pressed={pressed} at={[0.42, 0.6]} />
    </Stage>
  )
}
