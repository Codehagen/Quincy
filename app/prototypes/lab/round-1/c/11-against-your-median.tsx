"use client"

import * as React from "react"

import { Frame, Lead, Tile, faint, grey, lift, mono, px, tx } from "./kit"
import { useReducedMotion } from "./use-reduced-motion"

const ACCENT = "#FF5B1F"
const MEDIAN = 1780

const POSTS = [
  { v: 1420, day: "Mon 2 Nov", title: "What a week of sales calls taught me" },
  { v: 2210, day: "Tue 3 Nov", title: "We stopped writing release notes" },
  { v: 1650, day: "Thu 5 Nov", title: "The pricing page we almost shipped" },
  { v: 980, day: "Fri 6 Nov", title: "Friday ship log" },
  { v: 1840, day: "Mon 9 Nov", title: "Why I record every customer call" },
  { v: 2050, day: "Mon 9 Nov", title: "Export to CSV, finally" },
  { v: 1310, day: "Mon 9 Nov", title: "Hiring our first designer" },
  { v: 5800, day: "Tue 10 Nov", title: "Nine screens to three" },
  { v: 1990, day: "Wed 11 Nov", title: "Support tickets are a roadmap" },
  { v: 1560, day: "Thu 12 Nov", title: "The call I almost didn't take" },
  { v: 2400, day: "Fri 13 Nov", title: "One metric we dropped" },
  { v: 1720, day: "Sat 14 Nov", title: "Friday ship log" },
]

const MAX = 5800
const BAR_H = 196
const fmt = (n: number) => n.toLocaleString("en-US")

/** Eases the shown ratio toward the target, so a new pick reads as a change. */
function useTicking(target: number, reduced: boolean) {
  const [shown, setShown] = React.useState(target)
  const from = React.useRef(target)

  React.useEffect(() => {
    // Reduced motion lands on the target in one frame instead of easing.
    const duration = reduced ? 0 : 420
    const start = performance.now()
    const a = from.current
    let raf = 0
    const step = (now: number) => {
      const p = duration ? Math.min(1, (now - start) / duration) : 1
      const e = 1 - Math.pow(1 - p, 3)
      const v = a + (target - a) * e
      from.current = v
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [target, reduced])

  return shown
}

export default function AgainstYourMedian() {
  const reduced = useReducedMotion()
  const [pick, setPick] = React.useState(7)
  const post = POSTS[pick]
  const ratio = useTicking(post.v / MEDIAN, reduced)
  const above = post.v >= MEDIAN

  return (
    <Frame>
      <div
        className="grid size-full"
        style={{ gridTemplateColumns: "1.9fr 1fr", gap: px(8) }}
      >
        <Tile>
          <Lead
            bold="Measured against you."
            rest="Each post is set beside your own median, never a follower count."
            style={{ position: "absolute", left: px(22), top: px(20), right: px(30) }}
          />

          {/* The chart runs off the right and bottom edge: it is a crop of a
              longer history, not a widget shrunk to fit. */}
          <div
            className="absolute bg-white"
            style={{
              left: px(22),
              top: px(108),
              width: px(440),
              height: px(330),
              borderRadius: px(12),
              boxShadow: lift,
            }}
          >
            <div
              className="flex items-baseline justify-between"
              style={{ padding: `${px(14)} ${px(16)} 0` }}
            >
              <span style={{ fontSize: tx(12), fontWeight: 560 }}>
                Views, last 12 posts
              </span>
              <span style={{ fontSize: tx(11), color: faint, fontFamily: mono }}>
                X · 90 days
              </span>
            </div>

            <div
              className="absolute"
              style={{ left: px(16), top: px(48), height: px(BAR_H), right: 0 }}
            >
              {/* Median rule */}
              <div
                aria-hidden
                className="absolute left-0 right-0"
                style={{
                  bottom: px((MEDIAN / MAX) * BAR_H),
                  borderTop: `${px(1.25)} dashed rgba(17,17,17,0.35)`,
                }}
              >
                <span
                  className="absolute"
                  style={{
                    left: px(300),
                    bottom: px(4),
                    fontSize: tx(10.5),
                    fontFamily: mono,
                    color: grey,
                    whiteSpace: "nowrap",
                  }}
                >
                  your median {fmt(MEDIAN)}
                </span>
              </div>

              <div className="absolute inset-0 flex items-end" style={{ gap: px(10) }}>
                {POSTS.map((p, i) => {
                  const on = i === pick
                  return (
                    <button
                      key={i}
                      type="button"
                      aria-label={`${p.title}, ${p.day}, ${fmt(p.v)} views`}
                      aria-pressed={on}
                      onPointerEnter={() => setPick(i)}
                      onFocus={() => setPick(i)}
                      onClick={() => setPick(i)}
                      className="relative flex h-full shrink-0 cursor-pointer items-end outline-none"
                      style={{ width: px(24), touchAction: "manipulation" }}
                    >
                      <span
                        className="block w-full"
                        style={{
                          height: px((p.v / MAX) * BAR_H),
                          borderRadius: px(5),
                          background: on ? ACCENT : "#DDDDDA",
                          transition: "background-color 180ms ease-out",
                        }}
                      />
                    </button>
                  )
                })}
              </div>
            </div>

            <div
              className="absolute flex"
              style={{
                left: px(16),
                top: px(48 + BAR_H + 10),
                gap: px(10),
                fontFamily: mono,
                fontSize: tx(9.5),
                color: faint,
              }}
            >
              {POSTS.map((p, i) => (
                <span
                  key={i}
                  className="shrink-0 text-center"
                  style={{
                    width: px(24),
                    color: i === pick ? "#111" : undefined,
                    transition: "color 180ms ease-out",
                  }}
                >
                  {p.day.split(" ")[1]}
                </span>
              ))}
            </div>
          </div>
        </Tile>

        <Tile dark>
          <div
            className="absolute flex flex-col"
            style={{ left: px(20), right: px(18), top: px(20), bottom: px(20) }}
          >
            <span style={{ fontSize: tx(12), color: "rgba(255,255,255,0.5)" }}>
              {post.day}
            </span>
            <div className="mt-auto">
              <div
                className="flex items-baseline"
                style={{ gap: px(6), fontVariantNumeric: "tabular-nums" }}
              >
                <span
                  style={{
                    fontSize: tx(58),
                    fontWeight: 600,
                    letterSpacing: "-0.04em",
                    lineHeight: 1,
                  }}
                >
                  {ratio.toFixed(1)}×
                </span>
              </div>
              <div style={{ fontSize: tx(14), fontWeight: 560, marginTop: px(8) }}>
                your median
              </div>
              <p
                aria-live="polite"
                style={{
                  margin: `${px(10)} 0 0`,
                  fontSize: tx(12.5),
                  lineHeight: 18 / 12.5,
                  color: "rgba(255,255,255,0.5)",
                  textWrap: "pretty",
                }}
              >
                <span style={{ color: "#fff" }}>{post.title}.</span>{" "}
                {fmt(post.v)} views, against the {fmt(MEDIAN)} your posts
                usually do.{" "}
                {above ? "" : "Below your own line, which is information too."}
              </p>
            </div>
          </div>
        </Tile>
      </div>
    </Frame>
  )
}
