"use client"

import * as React from "react"

import { GREY, INK, MONO, OBJECT, Stage, Ticker } from "./stage"

/**
 * 19 — Pick a slot.
 *
 * The week as a grid of slots, the draft as the one thing on it you can move.
 * Tap a free slot and the chip slides there; the number under it re-counts to
 * what your own posts do at that hour. Never followers — your median.
 */

const GREEN = "#0F9F6E"
const DAYS = ["Mon 16", "Tue 17", "Wed 18", "Thu 19", "Fri 20"]
const HOURS = ["08:00", "12:00", "17:00"]

/** Already booked: [day, hour, channel]. */
const TAKEN: [number, number, string][] = [
  [0, 0, "X"],
  [1, 1, "in"],
  [3, 0, "X"],
  [4, 2, "in"],
  [2, 2, "X"],
]

/** Your own median views on X per slot, from your last 30 posts. */
const MEDIAN = [
  [1420, 980, 760],
  [1610, 1190, 820],
  [1530, 1840, 900],
  [1700, 1260, 710],
  [1120, 860, 540],
]

const WEEK_MEDIAN = 1210

export default function Slots() {
  const [at, setAt] = React.useState<[number, number]>([2, 1])
  const [d, h] = at
  const views = MEDIAN[d][h]
  const ratio = views / WEEK_MEDIAN

  const taken = (dd: number, hh: number) =>
    TAKEN.find(([a, b]) => a === dd && b === hh)

  return (
    <Stage
      lead="Pick a slot, not a time."
      rest="Each one is measured against your own week."
    >
      <style>{css}</style>

      <div
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "6.4em",
          width: "31em",
          padding: "1em 1.1em 1.1em",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: "0.5em" }}>
          <span style={{ fontWeight: 560 }}>Week 47</span>
          <span style={{ color: GREY }}>Nov 16 – 20</span>
          <span
            style={{
              marginLeft: "auto",
              fontFamily: MONO,
              fontSize: "0.86em",
              color: GREY,
            }}
          >
            draft · X
          </span>
        </div>

        <div
          style={{
            marginTop: "0.8em",
            display: "grid",
            gridTemplateColumns: "3.2em 1fr",
          }}
        >
          <span />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(5, 1fr)",
              color: GREY,
              paddingBottom: "0.35em",
            }}
          >
            {DAYS.map((day, i) => (
              <span
                key={day}
                style={{
                  paddingLeft: "0.4em",
                  color: i === d ? INK : undefined,
                  fontWeight: i === d ? 560 : undefined,
                  transition: "color 160ms ease",
                }}
              >
                {day}
              </span>
            ))}
          </div>

          <div style={{ display: "grid", gridTemplateRows: "repeat(3, 2.9em)" }}>
            {HOURS.map((hr) => (
              <span
                key={hr}
                style={{
                  fontFamily: MONO,
                  fontSize: "0.86em",
                  color: GREY,
                  paddingTop: "0.9em",
                }}
              >
                {hr}
              </span>
            ))}
          </div>

          <div style={{ position: "relative" }}>
            <div
              role="grid"
              aria-label="Week 47 slots"
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gridTemplateRows: "repeat(3, 2.9em)",
                borderTop: "1px solid rgba(18,18,18,0.07)",
              }}
            >
              {HOURS.map((hr, hh) =>
                DAYS.map((day, dd) => {
                  const t = taken(dd, hh)
                  return (
                    <div
                      key={`${dd}-${hh}`}
                      role="gridcell"
                      style={{
                        padding: "0.25em",
                        borderBottom: "1px solid rgba(18,18,18,0.07)",
                      }}
                    >
                      {t ? (
                        <span
                          style={{
                            display: "flex",
                            alignItems: "center",
                            height: "100%",
                            padding: "0 0.5em",
                            borderRadius: "0.45em",
                            background: "#F2F2F1",
                            color: GREY,
                            fontFamily: MONO,
                            fontSize: "0.82em",
                          }}
                        >
                          {t[2]}
                          <span
                            aria-hidden
                            style={{
                              marginLeft: "0.5em",
                              flex: 1,
                              height: "0.5em",
                              borderRadius: 999,
                              background: "rgba(18,18,18,0.07)",
                            }}
                          />
                        </span>
                      ) : (
                        <button
                          type="button"
                          className="sl-free d-press"
                          aria-label={`Move draft to ${day} ${hr}`}
                          aria-current={dd === d && hh === h ? "true" : undefined}
                          onClick={() => setAt([dd, hh])}
                          style={{
                            width: "100%",
                            height: "100%",
                            borderRadius: "0.45em",
                            cursor: "pointer",
                          }}
                        />
                      )}
                    </div>
                  )
                }),
              )}
            </div>

            {/* The draft. One chip, sliding between slots. */}
            <div
              aria-hidden
              className="sl-chip"
              style={{
                position: "absolute",
                left: 0,
                top: "1px",
                width: "20%",
                height: "2.9em",
                padding: "0.25em",
                transform: `translate(${d * 100}%, ${h * 100}%)`,
                pointerEvents: "none",
              }}
            >
              <span
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4em",
                  height: "100%",
                  padding: "0 0.5em",
                  borderRadius: "0.45em",
                  background: GREEN,
                  color: "#fff",
                  fontWeight: 560,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                }}
              >
                Export
              </span>
            </div>
          </div>
        </div>

        <p
          aria-live="polite"
          style={{ marginTop: "0.9em", textWrap: "pretty" }}
        >
          <span style={{ fontWeight: 560 }}>
            {DAYS[d].slice(0, 3)} {HOURS[h]}.
          </span>{" "}
          <span style={{ color: GREY }}>Your median here is </span>
          <span style={{ fontFamily: MONO, fontSize: "0.92em" }}>
            <Ticker value={views} />
          </span>
          <span style={{ color: GREY }}> views, </span>
          <span style={{ fontFamily: MONO, fontSize: "0.92em" }}>
            <Ticker value={ratio} format={(n) => `${n.toFixed(1)}×`} />
          </span>
          <span style={{ color: GREY }}> your week.</span>
        </p>
      </div>
    </Stage>
  )
}

const css = `
.sl-chip { transition: transform 300ms cubic-bezier(.3,.9,.3,1); }
.sl-free { background: transparent; }
.sl-free:hover { background: #F2F2F1; box-shadow: inset 0 0 0 1px rgba(18,18,18,0.08); }
@media (prefers-reduced-motion: reduce) {
  .sl-chip { transition: none; }
}
`
