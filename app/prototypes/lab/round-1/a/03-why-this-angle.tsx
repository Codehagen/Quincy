"use client"

import * as React from "react"

import { Bracket, Lead, Tile, fontHand, fontMono, useSeen } from "./kit"

/**
 * The one dark tile: a single stat, stated against the person's own median.
 * The figure counts up once when the tile is seen — the cause is arrival —
 * and the margin note says out loud what the number is measured against.
 */

const PEN = "oklch(0.76 0.14 48)"
const SOFT = "rgba(253,253,252,0.5)"
const TARGET = 2.1

export default function WhyThisAngle() {
  const [ref, seen] = useSeen<HTMLDivElement>()
  const [value, setValue] = React.useState(1)

  React.useEffect(() => {
    if (!seen) return
    // Reduced motion: zero duration, so the first frame lands on the target.
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const start = performance.now()
    const dur = reduce ? 0 : 900
    let raf = 0
    const tick = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(1 + (TARGET - 1) * eased)
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [seen])

  return (
    <Tile dark>
      <Lead
        dark
        bold="Why this angle."
        grey="Before it asks you for anything, Quincy shows its working."
      />

      <div
        className="absolute top-[18cqw] left-[5.4cqw]"
        style={{ fontFamily: fontMono, fontSize: "1.85cqw", color: SOFT }}
      >
        angle.md ← walk-tuesday.m4a, 2:03
      </div>

      <div ref={ref} className="absolute right-[5.4cqw] bottom-[5.4cqw] left-[5.4cqw]">
        <div className="flex items-end gap-[3cqw]">
          <div className="flex items-baseline gap-[1.6cqw]">
            <span
              className="tabular-nums"
              style={{
                fontSize: "19cqw",
                lineHeight: 0.8,
                fontWeight: 560,
                letterSpacing: "-0.045em",
              }}
              aria-label={`${TARGET}×`}
            >
              {value.toFixed(1)}
              <span style={{ fontWeight: 400 }}>×</span>
            </span>
            <span style={{ fontWeight: 560 }}>your median</span>
          </div>

          <div className="mb-[0.6cqw] flex items-center gap-[1.2cqw] self-stretch">
            <Bracket color={PEN} className="h-full w-[1.5cqw] shrink-0" />
            <span
              className="-rotate-3 leading-[0.9]"
              style={{ fontFamily: fontHand, fontSize: "3.9cqw", color: PEN }}
            >
              yours, not
              <br />
              followers
            </span>
          </div>
        </div>

        <p className="mt-[3.4cqw] max-w-[66cqw]" style={{ color: SOFT }}>
          Your last three posts about the waiting inside work did{" "}
          <span style={{ color: "#FDFDFC" }}>2.1×</span> your own median of 1,840
          views. Launch posts did 0.6×. So this one leads with the waiting, not the
          fix.
        </p>
      </div>
    </Tile>
  )
}
