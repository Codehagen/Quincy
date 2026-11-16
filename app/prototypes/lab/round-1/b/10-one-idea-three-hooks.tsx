"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Linkedin01Icon, NewTwitterIcon, YoutubeIcon } from "@hugeicons/core-free-icons"

import {
  Bar,
  Cursor,
  GREY,
  Lead,
  OBJECT_SHADOW,
  Stage,
  u,
  useSequence,
} from "./stage"

/** The one accent: the act of adapting, and the threads it pulls. */
const TEAL = "#0E9A7B"

// idle · travel · press · fanned (hold) · clear
const DURATIONS = [900, 1000, 200, 4400, 450]
const REST = 3

const RIFF = { x: 28, y: 88, w: 200 }
/** Centre of the Adapt button, where the threads leave from. */
const BUTTON_Y = 228
const BUTTON_RIGHT = 212

const HOOKS = [
  {
    icon: NewTwitterIcon,
    channel: "X",
    note: "short, number first",
    hook: "412 people opened our changelog. 3 replied. The 3 were worth more.",
    y: 100,
  },
  {
    icon: Linkedin01Icon,
    channel: "LinkedIn",
    note: "a story, first person",
    hook: "We gave our changelog its own page. What came back wasn’t traffic.",
    y: 192,
  },
  {
    icon: YoutubeIcon,
    channel: "Shorts title",
    note: "search terms",
    hook: "How to get real feedback from a changelog",
    y: 284,
  },
]

const CARD_X = 244

export default function OneIdeaThreeHooks() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  const { phase, jump, reduced } = useSequence(DURATIONS, stageRef, REST)

  const pressed = phase === 2
  const fanned = phase === 3
  const target = phase === 1 || phase === 2 ? buttonRef : fanned ? { x: 160, y: 258 } : { x: 470, y: 392 }

  return (
    <Stage stageRef={stageRef} label="One riff adapted into a hook per channel">
      <Lead bold="One idea, a different first line each." rest="The same post pasted everywhere is the one that gets buried." width={400} />

      {/* Threads from the riff to each adaptation, drawn in canvas units. */}
      <svg
        aria-hidden
        viewBox="0 0 500 375"
        preserveAspectRatio="none"
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      >
        {HOOKS.map((h, i) => {
          const x0 = BUTTON_RIGHT
          const y0 = BUTTON_Y
          const y1 = h.y + 14
          return (
            <path
              key={h.channel}
              d={`M ${x0} ${y0} C ${x0 + 20} ${y0}, ${CARD_X - 24} ${y1}, ${CARD_X - 4} ${y1}`}
              fill="none"
              stroke={TEAL}
              strokeWidth={1.25}
              pathLength={1}
              strokeDasharray="1"
              strokeDashoffset={fanned ? 0 : 1}
              style={{
                transitionProperty: "stroke-dashoffset",
                transitionDuration: reduced ? "0ms" : "420ms",
                transitionDelay: fanned && !reduced ? `${i * 140}ms` : "0ms",
                transitionTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          )
        })}
      </svg>

      {/* The window: the riff on the left, what it became on the right. */}
      <div
        aria-hidden
        style={{
          position: "absolute",
          left: u(RIFF.x),
          top: u(RIFF.y),
          width: u(520),
          height: u(320),
          borderRadius: u(12),
          background: "#fff",
          boxShadow: OBJECT_SHADOW,
        }}
      >
        <span style={{ position: "absolute", left: u(RIFF.w), top: 0, bottom: 0, width: 1, background: "rgba(17,17,17,0.06)" }} />
        {[188, 280].map((y) => (
          <span key={y} style={{ position: "absolute", left: u(RIFF.w), right: 0, top: u(y - RIFF.y), height: 1, background: "rgba(17,17,17,0.05)" }} />
        ))}
      </div>

      {/* The idea */}
      <div
        style={{
          position: "absolute",
          left: u(RIFF.x),
          top: u(RIFF.y),
          width: u(RIFF.w),
          padding: u(16),
        }}
      >
        <div style={{ color: GREY }}>Riff 14 · voice note</div>
        <div style={{ fontWeight: 560, margin: `${u(2)} 0 ${u(10)}` }}>The replies were the product.</div>
        <div style={{ display: "flex", flexDirection: "column", gap: u(6), marginBottom: u(14) }}>
          <Bar w={150} />
          <Bar w={112} />
        </div>
        <button
          ref={buttonRef}
          type="button"
          onClick={() => jump(fanned ? 0 : reduced ? 3 : 2)}
          aria-pressed={fanned}
          style={{
            height: u(32),
            width: "100%",
            borderRadius: u(8),
            border: 0,
            background: fanned ? "#F2F2F1" : TEAL,
            color: fanned ? "#111" : "#fff",
            font: "inherit",
            fontWeight: 560,
            cursor: "pointer",
            touchAction: "manipulation",
            transform: pressed ? "scale(0.96)" : "scale(1)",
            transitionProperty: "transform, background-color, color",
            transitionDuration: reduced ? "0ms" : "160ms",
          }}
        >
          {fanned ? "Adapted · 3" : "Adapt"}
        </button>
      </div>

      {/* The adaptations */}
      {HOOKS.map((h, i) => (
        <div
          key={h.channel}
          style={{
            position: "absolute",
            left: u(CARD_X),
            top: u(h.y),
            width: u(292),
            opacity: fanned ? 1 : 0,
            transform: fanned ? "translateX(0)" : `translateX(${u(-28)})`,
            transitionProperty: "opacity, transform",
            transitionDuration: reduced ? "0ms" : "460ms",
            transitionTimingFunction: "cubic-bezier(0.2, 0.8, 0.2, 1)",
            transitionDelay: fanned && !reduced ? `${200 + i * 140}ms` : "0ms",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: u(6), color: GREY, marginBottom: u(2) }}>
            <HugeiconsIcon icon={h.icon} size={14} strokeWidth={1.8} aria-hidden style={{ width: u(14), height: u(14) }} />
            <span style={{ color: "#111", fontWeight: 560 }}>{h.channel}</span>
            <span>{h.note}</span>
          </div>
          <div style={{ width: u(236), textWrap: "pretty" }}>{h.hook}</div>
          <Bar w={140} style={{ marginTop: u(8) }} />
        </div>
      ))}

      <div
        aria-hidden
        style={{
          position: "absolute",
          left: u(44),
          top: u(272),
          width: u(170),
          fontFamily: "var(--lab-caveat), cursive",
          fontSize: u(19),
          lineHeight: u(19),
          color: "rgba(17,17,17,0.62)",
          opacity: fanned ? 1 : 0,
          transitionProperty: "opacity",
          transitionDuration: reduced ? "0ms" : "400ms",
          transitionDelay: fanned && !reduced ? "900ms" : "0ms",
        }}
      >
        same idea — only the first line changes
      </div>

      <Cursor stageRef={stageRef} target={target} pressed={pressed} at={[0.5, 0.6]} />
    </Stage>
  )
}
