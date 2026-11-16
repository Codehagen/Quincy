"use client"

import * as React from "react"

import { Bar, GREY, INK, MONO, OBJECT, Stage, useReducedMotion } from "./stage"

/**
 * 17 — Record a thought.
 *
 * A record button that is only a record button. Press it and the bars move
 * because you are (pretend) talking, the clock runs because time is passing,
 * and stopping it is what makes the riff slide in underneath. No microphone
 * is opened; the voice is simulated so the frame never asks for permission.
 */

const RED = "#E5383B"
const BARS = 34
/** Ceiling on one take, so a forgotten tap does not run forever. */
const MAX_SECONDS = 45

type Phase = "idle" | "rec" | "done"

export default function Record() {
  const reduced = useReducedMotion()
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [levels, setLevels] = React.useState<number[]>(() =>
    Array(BARS).fill(0),
  )
  const [tenths, setTenths] = React.useState(0)
  const t0 = React.useRef(0)

  React.useEffect(() => {
    if (phase !== "rec") return
    t0.current = performance.now()
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      const elapsed = (performance.now() - t0.current) / 1000
      setTenths(Math.floor(elapsed * 10))
      if (elapsed >= MAX_SECONDS) setPhase("done")
      // Speech-shaped noise: syllables, with short pauses between phrases.
      const phrase = Math.sin(n / 9) * 0.5 + 0.5
      const syllable = Math.abs(Math.sin(n * 1.7)) * 0.6 + Math.random() * 0.4
      const pause = n % 23 < 3 ? 0.08 : 1
      const v = Math.max(0.06, Math.min(1, phrase * syllable * pause + 0.05))
      setLevels((prev) => [...prev.slice(1), v])
    }, 70)
    return () => window.clearInterval(id)
  }, [phase])

  const press = () => {
    if (phase === "rec") {
      setPhase("done")
    } else {
      setLevels(Array(BARS).fill(0))
      setTenths(0)
      setPhase("rec")
    }
  }

  const secs = Math.floor(tenths / 10)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
  const recording = phase === "rec"

  return (
    <Stage
      lead="Say it on the walk."
      rest="Quincy keeps the thought and finds the angle in it."
    >
      <style>{css}</style>

      <div
        style={{
          ...OBJECT,
          position: "absolute",
          left: "1.7em",
          top: "6.4em",
          width: "25.5em",
          height: "4.2em",
          borderRadius: "2.1em",
          padding: "0 1.3em 0 0.6em",
          display: "flex",
          alignItems: "center",
          gap: "0.9em",
        }}
      >
        <button
          type="button"
          onClick={press}
          aria-pressed={recording}
          aria-label={recording ? "Stop recording" : "Record a thought"}
          className="d-press rc-btn"
          style={{
            width: "3em",
            height: "3em",
            borderRadius: 999,
            flexShrink: 0,
            display: "grid",
            placeItems: "center",
            cursor: "pointer",
          }}
        >
          <span
            aria-hidden
            className="rc-glyph"
            data-rec={recording || undefined}
          />
        </button>

        {/* The waveform. Bars only move when a voice is arriving. */}
        <div
          aria-hidden
          style={{
            flex: 1,
            height: "2.2em",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {levels.map((v, i) => (
            <span
              key={i}
              className="rc-bar"
              style={{
                width: "0.2em",
                height: `${Math.max(0.2, v * 2.2)}em`,
                borderRadius: 999,
                background: v > 0 ? INK : "rgba(18,18,18,0.16)",
                opacity: v > 0 && !recording ? 0.35 : 1,
                transition: reduced
                  ? "none"
                  : "height 70ms linear, opacity 200ms ease",
              }}
            />
          ))}
        </div>

        <span
          style={{
            fontFamily: MONO,
            fontSize: "0.92em",
            fontVariantNumeric: "tabular-nums",
            color: recording ? INK : GREY,
            minWidth: "2.6em",
            textAlign: "right",
          }}
        >
          {clock}
        </span>
      </div>

      <p
        aria-live="polite"
        style={{
          position: "absolute",
          left: "3em",
          top: "11.5em",
          color: GREY,
        }}
      >
        {phase === "idle" && "Tap to record. Stop whenever."}
        {phase === "rec" && (
          <span>
            <span className="rc-live" aria-hidden />
            Listening
          </span>
        )}
        {phase === "done" && "Kept. Found one angle."}
      </p>

      {/* The riff, which only exists because the take ended. */}
      {phase === "done" && (
        <div
          key={tenths}
          className="rc-riff"
          style={{
            ...OBJECT,
            position: "absolute",
            left: "1.7em",
            top: "14.2em",
            width: "25.5em",
            padding: "1.1em 1.25em 3em",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              color: GREY,
            }}
          >
            <span>Riff</span>
            <span style={{ fontFamily: MONO, fontSize: "0.9em" }}>
              voice-note-1117.m4a · {clock}
            </span>
          </div>
          <p style={{ marginTop: "0.55em", fontWeight: 560 }}>
            The export rewrite was a support project, not a feature.
          </p>
          <p style={{ marginTop: "0.2em", color: GREY }}>
            At 0:06 you said “nobody asked for it, they just stopped asking.”
          </p>
          <Bar w="72%" style={{ marginTop: "1em" }} />
          <Bar w="48%" style={{ marginTop: "0.6em" }} />
        </div>
      )}
    </Stage>
  )
}

const css = `
.rc-btn { background: #F2F2F1; }
.rc-btn:hover { background: #EAEAE8; }
.rc-btn[aria-pressed="true"] { background: #FDECEC; }
.rc-glyph {
  display: block;
  width: 1.1em;
  height: 1.1em;
  border-radius: 999px;
  background: ${RED};
  transition: border-radius 180ms cubic-bezier(.2,.8,.3,1), width 180ms cubic-bezier(.2,.8,.3,1), height 180ms cubic-bezier(.2,.8,.3,1);
}
.rc-glyph[data-rec] { width: 0.95em; height: 0.95em; border-radius: 0.2em; }
.rc-live {
  display: inline-block;
  width: 0.5em; height: 0.5em; border-radius: 999px;
  background: ${RED};
  margin-right: 0.5em;
  vertical-align: 0.08em;
  animation: rc-blink 1.2s ease-in-out infinite;
}
@keyframes rc-blink { 50% { opacity: 0.25; } }
.rc-riff { animation: rc-slide 320ms cubic-bezier(.2,.8,.3,1) both; }
@keyframes rc-slide {
  from { opacity: 0; transform: translateY(1.2em); }
  to   { opacity: 1; transform: none; }
}
@media (prefers-reduced-motion: reduce) {
  .rc-glyph { transition: none; }
  .rc-live, .rc-riff { animation: none; }
}
`
