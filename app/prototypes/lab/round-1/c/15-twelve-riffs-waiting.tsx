"use client"

import * as React from "react"

import { Frame, Lead, Skel, Tile, faint, grey, lift, mono, px, tx } from "./kit"
import { useReducedMotion } from "./use-reduced-motion"

const ACCENT = "#0E97A4"

const RIFFS = [
  { src: "walk-to-office.m4a", title: "Every screen is a question", angle: "Cutting six screens cut the tickets, because each screen was a question." },
  { src: "call · Jonas Okafor", title: "Release notes nobody read", angle: "We stopped writing them and nobody noticed for a month." },
  { src: "PR #388 merged", title: "The pricing page we almost shipped", angle: "Three tiers became one after a single customer call." },
  { src: "walk-to-office.m4a", title: "Support tickets are a roadmap", angle: "Our best feature request came in as a complaint." },
  { src: "call · Priya Raman", title: "Hiring before you are ready", angle: "The first designer changed what we measured, not how it looked." },
  { src: "PR #412 merged", title: "CSV export, finally", angle: "The most requested feature took a day. We waited a year." },
  { src: "evening-note.m4a", title: "A week of saying no", angle: "Five requests declined, and the product got clearer." },
  { src: "call · Ella Nyberg", title: "The metric we stopped tracking", angle: "Daily signups made us nervous and taught us nothing." },
  { src: "evening-note.m4a", title: "Write your own changelog", angle: "Nobody else knows why the change was worth making." },
  { src: "PR #420 merged", title: "Dark mode took three tries", angle: "The first two were the wrong question." },
  { src: "walk-home.m4a", title: "The call I almost didn’t take", angle: "A cold email became our largest customer." },
  { src: "walk-home.m4a", title: "Two posts a week is enough", angle: "Half the volume, more replies than before." },
]

/** Deterministic, so server and client draw the same waveform. */
const WAVE = Array.from({ length: 90 }, (_, i) => {
  const a = Math.abs(Math.sin(i * 0.37) * 0.6 + Math.sin(i * 1.13) * 0.3 + Math.sin(i * 0.09) * 0.4)
  return Math.round((0.18 + Math.min(1, a) * 0.82) * 100) / 100
})

export default function TwelveRiffsWaiting() {
  const reduced = useReducedMotion()
  const [top, setTop] = React.useState(0)
  const [leaving, setLeaving] = React.useState(false)
  const [drafting, setDrafting] = React.useState<number | null>(null)
  const left = RIFFS.length - top

  const pass = () => {
    if (leaving || left <= 1) return
    setDrafting(null)
    if (reduced) {
      setTop((t) => t + 1)
      return
    }
    setLeaving(true)
    window.setTimeout(() => {
      setTop((t) => t + 1)
      setLeaving(false)
    }, 240)
  }

  const visible = RIFFS.slice(top, top + 3)

  return (
    <Frame>
      <div
        className="grid size-full"
        style={{
          gridTemplateColumns: "1fr 1.75fr",
          gridTemplateRows: "0.78fr 1.22fr",
          gap: px(8),
        }}
      >
        {/* Top band — copy, and the voice note the riffs came from */}
        <Tile style={{ gridColumn: "span 2" }}>
          <Lead
            bold="Every voice note leaves riffs behind."
            rest="An angle, its three beats and the line it opens on, kept until you pick one."
            style={{ position: "absolute", left: px(20), top: px(18), width: px(250) }}
          />
          <div
            aria-hidden
            className="absolute flex items-center"
            style={{ left: px(300), right: px(-20), top: px(26), height: px(90), gap: px(3) }}
          >
            {WAVE.map((h, i) => (
              <span
                key={i}
                className="block shrink-0"
                style={{
                  width: px(3),
                  height: `${h * 100}%`,
                  borderRadius: px(2),
                  background: i < 34 ? "#111" : "rgba(18,18,18,0.18)",
                }}
              />
            ))}
          </div>
          <span
            className="absolute"
            style={{
              left: px(300),
              bottom: px(16),
              fontFamily: mono,
              fontSize: tx(10.5),
              color: faint,
            }}
          >
            walk-to-office.m4a · 02:41 · Tue 07:14
          </span>
        </Tile>

        {/* Dark stat — the count, which the stack drives */}
        <Tile dark>
          <div
            className="absolute flex flex-col"
            style={{ left: px(18), right: px(16), top: px(18), bottom: px(18) }}
          >
            <span style={{ fontSize: tx(12), color: "rgba(255,255,255,0.5)" }}>Waiting</span>
            <div className="mt-auto">
              <span
                aria-live="polite"
                style={{
                  display: "block",
                  fontSize: tx(56),
                  fontWeight: 600,
                  letterSpacing: "-0.04em",
                  lineHeight: 1,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {left}
              </span>
              <div style={{ fontSize: tx(14), fontWeight: 560, marginTop: px(8) }}>
                riffs ready
              </div>
              <p
                style={{
                  margin: `${px(8)} 0 0`,
                  fontSize: tx(12),
                  lineHeight: 17 / 12,
                  color: "rgba(255,255,255,0.5)",
                }}
              >
                The oldest since Tuesday. Now one is offered each morning.
              </p>
            </div>
          </div>
        </Tile>

        {/* The stack — top card is today's offer, the rest sit behind it */}
        <Tile>
          <div
            className="absolute"
            style={{ left: px(18), right: px(18), top: px(30), bottom: px(-30) }}
          >
            {visible
              .map((r, d) => {
                const depth = leaving ? d - 1 : d
                const gone = leaving && d === 0
                const isTop = d === 0
                const idx = top + d
                return (
                  <div
                    key={r.title}
                    aria-hidden={!isTop}
                    className="c15-card absolute inset-x-0 top-0 bg-white"
                    style={{
                      height: px(230),
                      borderRadius: px(12),
                      boxShadow: lift,
                      padding: px(16),
                      zIndex: 10 - d,
                      transformOrigin: "50% 0",
                      transform: gone
                        ? `translateX(${px(-60)}) rotate(-3deg)`
                        : `translateY(${px(-Math.max(0, depth) * 10)}) scale(${1 - Math.max(0, depth) * 0.05})`,
                      opacity: gone ? 0 : 1,
                      transition: "transform 240ms cubic-bezier(.2,.7,.2,1), opacity 200ms ease-out",
                    }}
                  >
                    <div className="flex items-baseline justify-between" style={{ gap: px(8) }}>
                      <span style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}>
                        {r.src}
                      </span>
                      <span style={{ fontFamily: mono, fontSize: tx(10.5), color: faint }}>
                        {String(idx + 1).padStart(2, "0")}/12
                      </span>
                    </div>
                    <div style={{ fontSize: tx(14), fontWeight: 580, marginTop: px(10) }}>
                      {r.title}
                    </div>
                    <p
                      style={{
                        margin: `${px(3)} 0 0`,
                        fontSize: tx(12.5),
                        lineHeight: 18 / 12.5,
                        color: grey,
                      }}
                    >
                      {r.angle}
                    </p>
                    <div className="flex flex-col" style={{ gap: px(7), marginTop: px(12) }}>
                      <Skel w="78%" />
                      <Skel w="62%" />
                    </div>
                    {isTop ? (
                      <div className="flex items-center" style={{ gap: px(12), marginTop: px(16) }}>
                        <button
                          type="button"
                          onClick={() => setDrafting(idx)}
                          className="relative inline-flex items-center text-white outline-none"
                          style={{
                            height: px(30),
                            padding: `0 ${px(14)}`,
                            borderRadius: px(8),
                            background: drafting === idx ? "#111" : ACCENT,
                            fontSize: tx(12.5),
                            fontWeight: 560,
                            transition: "background-color 200ms ease-out",
                            touchAction: "manipulation",
                          }}
                        >
                          {drafting === idx ? "Drafting in your voice" : "Draft this one"}
                        </button>
                        <button
                          type="button"
                          onClick={pass}
                          disabled={left <= 1}
                          className="relative outline-none disabled:opacity-40"
                          style={{ fontSize: tx(12.5), color: grey, touchAction: "manipulation" }}
                        >
                          Not today
                        </button>
                      </div>
                    ) : null}
                  </div>
                )
              })
              .reverse()}
          </div>
        </Tile>
      </div>

      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .c15-card { transition: none !important; }
        }
      `}</style>
    </Frame>
  )
}
