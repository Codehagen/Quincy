"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Bar, GREY, INK, MONO, OBJECT, Stage } from "./stage"

/**
 * 20 — A ritual, running.
 *
 * The one place the accent is allowed to mean "live": a dot in a pill. The
 * clock in the pill runs, the steps underneath land one by one as the ritual
 * reaches them, and when it finishes the dot goes grey — live is a state that
 * ends, not decoration.
 */

const ORANGE = "#F2690D"
const STEP_MS = 2600

const STEPS: { text: string; aside?: string; people?: string[] }[] = [
  { text: "Read 14 new replies", aside: "on Friday’s export post" },
  {
    text: "Ines, Tomas and Ada replied again",
    aside: "third week running",
    people: ["IR", "TB", "AK"],
  },
  { text: "Drafted 3 replies for you to send" },
  { text: "Found one riff in Ada’s question", aside: "“what did you cut?”" },
]

export default function Live() {
  const [open, setOpen] = React.useState(true)
  const [step, setStep] = React.useState(0)
  const [secs, setSecs] = React.useState(128)
  const done = step >= STEPS.length

  // The ritual advances; after it finishes it rests, then the next run starts.
  React.useEffect(() => {
    const id = window.setTimeout(
      () => {
        if (done) setSecs(128)
        setStep((s) => (s >= STEPS.length ? 0 : s + 1))
      },
      done ? STEP_MS * 2 : STEP_MS,
    )
    return () => window.clearTimeout(id)
  }, [step, done])

  React.useEffect(() => {
    if (done) return
    const id = window.setInterval(() => setSecs((s) => s + 1), 1000)
    return () => window.clearInterval(id)
  }, [done])

  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`

  return (
    <Stage
      lead="Morning rounds, running now."
      rest="Quincy reads the replies before you are up, and leaves the sending to you."
    >
      <style>{css}</style>

      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="lv-panel"
        className="d-press"
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "6.4em",
          height: "2.6em",
          borderRadius: 999,
          padding: "0 1em 0 0.85em",
          display: "flex",
          alignItems: "center",
          gap: "0.55em",
          cursor: "pointer",
        }}
      >
        <span
          aria-hidden
          className="lv-dot"
          data-live={!done || undefined}
          style={{
            width: "0.55em",
            height: "0.55em",
            borderRadius: 999,
            background: done ? "rgba(18,18,18,0.25)" : ORANGE,
            position: "relative",
          }}
        />
        <span style={{ fontWeight: 560 }}>Morning rounds</span>
        <span aria-live="off" style={{ color: GREY }}>
          {done ? "done" : "running"}
        </span>
        <span
          style={{
            fontFamily: MONO,
            fontSize: "0.9em",
            fontVariantNumeric: "tabular-nums",
            color: done ? GREY : INK,
          }}
        >
          {clock}
        </span>
      </button>

      <div
        id="lv-panel"
        className="lv-panel"
        data-open={open || undefined}
        style={{
          position: "absolute",
          left: "1.7em",
          top: "9.8em",
          width: "25.5em",
          display: "grid",
        }}
      >
        <div style={{ overflow: "hidden", minHeight: 0 }}>
          <ol
            style={{
              ...OBJECT,
              margin: "0.1em 0.1em 2em",
              padding: "0.5em 1.1em",
              listStyle: "none",
            }}
          >
            {STEPS.map((s, i) => {
              const state = i < step ? "done" : i === step ? "now" : "next"
              return (
                <li
                  key={i}
                  style={{
                    display: "flex",
                    gap: "0.7em",
                    padding: "0.65em 0",
                    borderTop: i ? "1px solid rgba(18,18,18,0.06)" : undefined,
                    alignItems: "flex-start",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: "1.2em",
                      height: "1.43em",
                      flexShrink: 0,
                      display: "grid",
                      placeItems: "center",
                      color: GREY,
                    }}
                  >
                    {state === "done" ? (
                      <HugeiconsIcon
                        icon={Tick02Icon}
                        size="1.05em"
                        strokeWidth={2}
                      />
                    ) : state === "now" ? (
                      <span className="lv-spin" />
                    ) : (
                      <span
                        style={{
                          width: "0.4em",
                          height: "0.4em",
                          borderRadius: 999,
                          background: "rgba(18,18,18,0.14)",
                        }}
                      />
                    )}
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    {state === "next" ? (
                      <Bar
                        w={`${55 + ((i * 17) % 30)}%`}
                        style={{ marginTop: "0.45em" }}
                      />
                    ) : (
                      <span
                        key={state}
                        className={state === "now" ? "d-rise" : undefined}
                        style={{ display: "block" }}
                      >
                        <span
                          style={{
                            fontWeight: state === "now" ? 560 : 460,
                            color: state === "done" ? GREY : INK,
                          }}
                        >
                          {s.text}
                        </span>
                        {s.aside && (
                          <span style={{ color: GREY }}> · {s.aside}</span>
                        )}
                      </span>
                    )}
                  </span>
                  {s.people && state !== "next" && (
                    <span aria-hidden style={{ display: "flex" }}>
                      {s.people.map((p, k) => (
                        <span
                          key={p}
                          style={{
                            width: "1.6em",
                            height: "1.6em",
                            marginLeft: k ? "-0.4em" : 0,
                            borderRadius: 999,
                            background: ["#E6E6E3", "#DCDCD8", "#EEEEEB"][k],
                            boxShadow: "0 0 0 0.14em #fff",
                            display: "grid",
                            placeItems: "center",
                            fontSize: "0.68em",
                            fontWeight: 600,
                            color: "rgba(18,18,18,0.6)",
                          }}
                        >
                          {p}
                        </span>
                      ))}
                    </span>
                  )}
                </li>
              )
            })}
          </ol>
        </div>
      </div>
    </Stage>
  )
}

const css = `
.lv-panel { grid-template-rows: 0fr; opacity: 0; transition: grid-template-rows 280ms cubic-bezier(.3,.9,.3,1), opacity 200ms ease; }
.lv-panel[data-open] { grid-template-rows: 1fr; opacity: 1; }
.lv-dot[data-live]::after {
  content: "";
  position: absolute; inset: 0;
  border-radius: 999px;
  background: ${ORANGE};
  animation: lv-ping 1.6s cubic-bezier(.2,.6,.3,1) infinite;
}
@keyframes lv-ping {
  from { transform: scale(1); opacity: 0.45; }
  to   { transform: scale(2.6); opacity: 0; }
}
.lv-spin {
  width: 0.85em; height: 0.85em;
  border-radius: 999px;
  border: 0.14em solid rgba(18,18,18,0.12);
  border-top-color: ${INK};
  animation: lv-turn 800ms linear infinite;
}
@keyframes lv-turn { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) {
  .lv-panel { transition: none; }
  .lv-dot[data-live]::after { animation: none; opacity: 0; }
  .lv-spin { animation: none; border-color: ${INK}; border-right-color: rgba(18,18,18,0.12); border-bottom-color: rgba(18,18,18,0.12); }
}
`
