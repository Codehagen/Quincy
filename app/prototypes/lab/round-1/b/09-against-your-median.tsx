"use client"

import * as React from "react"

import {
  Cursor,
  FAINT,
  GREY,
  Lead,
  MONO,
  OBJECT_SHADOW,
  Stage,
  u,
  useReducedMotion,
  useSequence,
} from "./stage"

/** The one accent: the part of a number that beat your own median. */
const VIOLET = "#6B45F5"

const MEDIAN = 1240
const SCALE_MAX = 4000

const POSTS = [
  { title: "Shipped the importer in three days", views: 2610 },
  { title: "I stopped writing release notes", views: 990 },
  { title: "412 people opened our changelog", views: 3410 },
  { title: "The call that changed our pricing page", views: 1180 },
  { title: "Forty minutes of voice note, six posts", views: 620 },
]

// idle · travel · open (hold) · clear
const DURATIONS = [900, 1000, 4200, 450]
const REST = 2
const DEMO_ROW = 2

const fmt = (n: number) => n.toLocaleString("en-US")
const ratio = (v: number) => (v / MEDIAN).toFixed(1)

function Ticker({ value, run }: { value: number; run: boolean }) {
  const reduced = useReducedMotion()
  const [n, setN] = React.useState(0)
  React.useEffect(() => {
    if (!run) return
    let raf = 0
    const start = performance.now()
    const tick = (t: number) => {
      const p = reduced ? 1 : Math.min(1, (t - start) / 800)
      setN(Math.round(value * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [run, value, reduced])
  return <>{fmt(run ? n : 0)}</>
}

export default function AgainstYourMedian() {
  const stageRef = React.useRef<HTMLDivElement>(null)
  const demoRef = React.useRef<HTMLDivElement | null>(null)
  const [hovered, setHovered] = React.useState<number | null>(null)
  const { phase, reduced } = useSequence(DURATIONS, stageRef, REST, hovered !== null)

  const open = hovered ?? (phase === 2 ? DEMO_ROW : null)
  const target = phase === 1 || phase === 2 ? demoRef : { x: 470, y: 392 }
  const dur = reduced ? "0ms" : "420ms"
  const medianX = (MEDIAN / SCALE_MAX) * 100

  return (
    <Stage stageRef={stageRef} label="A post's views against your own median">
      <Lead
        bold="Every number is against your own median."
        rest="A good post is one that beat you, not one that beat somebody else."
      />

      <div
        onPointerLeave={() => setHovered(null)}
        style={{
          position: "absolute",
          left: u(28),
          top: u(92),
          width: u(520),
          height: u(330),
          padding: `${u(16)} ${u(18)}`,
          background: "#fff",
          borderRadius: u(12),
          boxShadow: OBJECT_SHADOW,
        }}
      >
        <div style={{ display: "flex", gap: u(8), marginBottom: u(8) }}>
          <span style={{ fontWeight: 560 }}>Posts</span>
          <span style={{ color: GREY }}>last 30 days · your median {fmt(MEDIAN)} views</span>
        </div>

        {POSTS.map((p, i) => {
          const isOpen = open === i
          const r = p.views / MEDIAN
          return (
            <div
              key={p.title}
              ref={i === DEMO_ROW ? demoRef : undefined}
              tabIndex={0}
              onPointerEnter={(e) => e.pointerType === "mouse" && setHovered(i)}
              onClick={() => setHovered((h) => (h === i ? null : i))}
              onFocus={() => setHovered(i)}
              onBlur={() => setHovered(null)}
              style={{
                borderTop: "1px solid rgba(17,17,17,0.05)",
                outline: "none",
                cursor: "default",
                opacity: open === null || isOpen ? 1 : 0.45,
                transitionProperty: "opacity",
                transitionDuration: dur,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", height: u(38) }}>
                <span style={{ width: u(300), whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", fontWeight: isOpen ? 560 : 460 }}>
                  {p.title}
                </span>
                <span style={{ width: u(60), textAlign: "right", fontFamily: MONO, fontSize: u(12.5), letterSpacing: 0, color: GREY }}>
                  {fmt(p.views)}
                </span>
                <span style={{ width: u(64), textAlign: "right", fontFamily: MONO, fontSize: u(12.5), letterSpacing: 0, color: r >= 1 ? "#111" : FAINT }}>
                  {ratio(p.views)}×
                </span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateRows: isOpen ? "1fr" : "0fr",
                  transitionProperty: "grid-template-rows",
                  transitionDuration: dur,
                  transitionTimingFunction: "cubic-bezier(0.2, 0.7, 0.2, 1)",
                }}
              >
                <div style={{ overflow: "hidden" }}>
                  <div style={{ padding: `${u(2)} 0 ${u(16)}`, width: u(424) }}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: u(8), marginBottom: u(10) }}>
                      <span style={{ fontWeight: 560, fontSize: u(20), lineHeight: u(24), fontVariantNumeric: "tabular-nums" }}>
                        <Ticker value={p.views} run={isOpen} />
                      </span>
                      <span style={{ color: GREY }}>views</span>
                      <span style={{ marginLeft: "auto", fontWeight: 560, color: r >= 1 ? VIOLET : "#111" }}>
                        {ratio(p.views)}× your median
                      </span>
                    </div>
                    <div style={{ position: "relative", height: u(10), borderRadius: u(5), background: "#F0F0EE" }}>
                      {/* Up to the median: yours already. */}
                      <span
                        style={{
                          position: "absolute",
                          left: 0,
                          top: 0,
                          bottom: 0,
                          borderRadius: u(5),
                          background: "rgba(17,17,17,0.18)",
                          width: isOpen ? `${Math.min(p.views / SCALE_MAX, MEDIAN / SCALE_MAX) * 100}%` : "0%",
                          transitionProperty: "width",
                          transitionDuration: reduced ? "0ms" : "500ms",
                        }}
                      />
                      {/* Past it: what this post earned. */}
                      {r > 1 ? (
                        <span
                          style={{
                            position: "absolute",
                            left: `${medianX}%`,
                            top: 0,
                            bottom: 0,
                            borderRadius: `0 ${u(5)} ${u(5)} 0`,
                            background: VIOLET,
                            width: isOpen ? `${((p.views - MEDIAN) / SCALE_MAX) * 100}%` : "0%",
                            transitionProperty: "width",
                            transitionDuration: reduced ? "0ms" : "600ms",
                            transitionDelay: isOpen && !reduced ? "380ms" : "0ms",
                          }}
                        />
                      ) : null}
                      <span
                        aria-hidden
                        style={{ position: "absolute", left: `${medianX}%`, top: u(-5), bottom: u(-5), width: 1.5, background: "#111" }}
                      />
                    </div>
                    <div
                      style={{
                        position: "relative",
                        height: u(22),
                        marginLeft: `calc(${medianX}% - ${u(6)})`,
                        fontFamily: "var(--lab-caveat), cursive",
                        fontSize: u(18),
                        lineHeight: u(22),
                        color: "rgba(17,17,17,0.62)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      ↑ your median, not your follower count
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <Cursor stageRef={stageRef} target={target} hidden={hovered !== null} at={[0.3, 0.5]} />
    </Stage>
  )
}
