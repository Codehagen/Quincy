"use client"

import * as React from "react"

import {
  Arrive,
  Count,
  Mono,
  Rule,
  Stage,
  Text,
  u,
  useReducedMotion,
  Window,
} from "../kit"
import { color, motion } from "../tokens"

/**
 * 31 — The Riffs page, with the recorder at the top of it.
 *
 * 17's record pill, moved into the page it belongs to. The recorder is the
 * first thing on /ideas (capture is the page; the queue is what came back),
 * and stopping a take is what puts a new riff at the head of the queue and
 * moves the waiting count. No microphone opens: the voice is simulated so
 * the frame never asks for permission.
 */

const BARS = 30
/** Ceiling on one take, so a forgotten tap does not run forever. */
const MAX_SECONDS = 45
/** A take shorter than this is a mis-tap, not a thought. */
const MIN_TENTHS = 12

type Riff = { id: number; line: string; quote: string; source: string; when: string }

/** What the next takes "find". Cycled, so pressing again keeps working. */
const FOUND: Omit<Riff, "id" | "source" | "when">[] = [
  {
    line: "The export rewrite was a support project, not a feature.",
    quote: "At 0:06 you said “they just stopped asking.”",
  },
  {
    line: "We deleted the settings page and nobody noticed for a week.",
    quote: "At 0:11 you said “that’s the review I wanted.”",
  },
]

const QUEUE: Riff[] = [
  {
    id: -1,
    line: "The changelog page got three replies. One found a bug first.",
    quote: "",
    source: "paste",
    when: "Yesterday",
  },
  {
    id: -2,
    line: "Why we stopped estimating in days.",
    quote: "",
    source: "PR #418",
    when: "Wed",
  },
]

type Phase = "idle" | "rec" | "short" | "kept"

export default function RiffsRecorder() {
  const reduced = useReducedMotion()
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [levels, setLevels] = React.useState<number[]>(() => Array(BARS).fill(0))
  const [tenths, setTenths] = React.useState(0)
  const [riffs, setRiffs] = React.useState<Riff[]>([])
  const tenthsRef = React.useRef(0)

  const stop = React.useCallback(() => {
    const took = tenthsRef.current
    if (took < MIN_TENTHS) {
      setPhase("short")
      return
    }
    const s = Math.floor(took / 10)
    setRiffs((prev) => {
      const pick = FOUND[prev.length % FOUND.length]!
      return [
        {
          id: prev.length,
          ...pick,
          source: `voice · ${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`,
          when: "Now",
        },
        ...prev,
      ]
    })
    setPhase("kept")
  }, [])

  React.useEffect(() => {
    if (phase !== "rec") return
    const t0 = performance.now()
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      const elapsed = (performance.now() - t0) / 1000
      tenthsRef.current = Math.floor(elapsed * 10)
      setTenths(tenthsRef.current)
      if (elapsed >= MAX_SECONDS) {
        window.clearInterval(id)
        stop()
        return
      }
      // Speech-shaped: syllables, with short pauses between phrases.
      const phrase = Math.sin(n / 9) * 0.5 + 0.5
      const syllable = Math.abs(Math.sin(n * 1.7)) * 0.6 + Math.random() * 0.4
      const pause = n % 23 < 3 ? 0.08 : 1
      const v = Math.max(0.08, Math.min(1, phrase * syllable * pause + 0.05))
      setLevels((prev) => [...prev.slice(1), v])
    }, 70)
    return () => window.clearInterval(id)
  }, [phase, stop])

  const press = () => {
    if (phase === "rec") {
      stop()
      return
    }
    tenthsRef.current = 0
    setTenths(0)
    setLevels(Array(BARS).fill(0))
    setPhase("rec")
  }

  const recording = phase === "rec"
  const secs = Math.floor(tenths / 10)
  const clock = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`
  const waiting = QUEUE.length + 1 + riffs.length

  return (
    <Stage
      accent="red"
      lead="Say it on the walk."
      rest="Stop, and the thought is at the top of your riffs before you are home."
    >
      <style>{css}</style>
      <Window address="hirequincy.com/ideas" width={420}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
          <Text weight="strong">Riffs</Text>
          <Mono>
            <Count value={waiting} /> waiting
          </Mono>
        </div>

        <div className="c31-pill" style={{ marginTop: u(12) }}>
          <button
            type="button"
            onClick={press}
            aria-pressed={recording}
            aria-label={recording ? "Stop recording" : "Record a thought"}
            className="c31-btn"
          >
            <span aria-hidden className="c31-glyph" data-rec={recording || undefined} />
          </button>
          <div aria-hidden className="c31-wave">
            {levels.map((v, i) => (
              <span
                key={i}
                className="c31-bar"
                data-heard={v > 0 || undefined}
                data-rest={(v > 0 && !recording) || undefined}
                style={{
                  height: u(Math.max(3, v * 24)),
                  transitionDuration: reduced ? "0ms" : undefined,
                }}
              />
            ))}
          </div>
          <Mono tone={recording ? "ink" : "muted"}>{clock}</Mono>
        </div>

        <p aria-live="polite" className="c31-status">
          {phase === "idle" && "Tap to record. Stop whenever."}
          {phase === "rec" && "Listening. Tap again when you are done."}
          {phase === "short" && "Too short to keep. Say a bit more."}
          {phase === "kept" && "Kept. Quincy found the angle in it."}
        </p>

        <Rule />

        {riffs.map((r) => (
          <Fresh key={r.id}>
            <Row riff={r} fresh />
          </Fresh>
        ))}
        <Row
          riff={{
            id: 0,
            line: "Onboarding emails nobody reads are still the ones that get replies.",
            quote: "",
            source: "voice · 1:52",
            when: "Today",
          }}
        />
        {QUEUE.map((r) => (
          <Row key={r.id} riff={r} />
        ))}
      </Window>
    </Stage>
  )
}

/** Mounts hidden, then arrives on the next frame, so a new riff slides in. */
function Fresh({ children }: { children: React.ReactNode }) {
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return <Arrive show={show}>{children}</Arrive>
}

function Row({ riff, fresh = false }: { riff: Riff; fresh?: boolean }) {
  return (
    <div className="c31-row" data-fresh={fresh || undefined}>
      <div style={{ minWidth: 0 }}>
        <Text weight={fresh ? "strong" : "regular"}>{riff.line}</Text>
        {riff.quote ? (
          <Text size="small" tone="muted">
            {riff.quote}
          </Text>
        ) : null}
      </div>
      <div className="c31-meta">
        <Mono tone="faint">{riff.when}</Mono>
        <Mono tone="faint">{riff.source}</Mono>
      </div>
    </div>
  )
}

const css = `
.c31-pill {
  display: flex; align-items: center; gap: ${u(12)};
  height: ${u(48)}; padding: 0 ${u(16)} 0 ${u(6)};
  border-radius: 999px; background: ${color.well};
}
.c31-btn {
  position: relative; flex: none;
  width: ${u(36)}; height: ${u(36)}; border-radius: 50%;
  display: grid; place-items: center;
  border: 0; cursor: pointer; background: ${color.surface};
  box-shadow: 0 0 0 1px ${color.hairline};
  transition-property: transform, background-color;
  transition-duration: ${motion.press}ms, ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.c31-btn:active { transform: scale(0.94); }
.c31-btn[aria-pressed="true"] { background: color-mix(in oklch, var(--k2-accent), ${color.surface} 90%); }
.c31-btn:focus-visible { outline-color: var(--k2-accent); }
@media (pointer: coarse) {
  .c31-btn::after { content: ""; position: absolute; inset: 50% auto auto 50%; width: 44px; height: 44px; translate: -50% -50%; }
}
.c31-glyph {
  display: block; width: ${u(14)}; height: ${u(14)}; border-radius: 999px;
  background: var(--k2-accent);
  transition-property: border-radius, width, height;
  transition-duration: 180ms;
  transition-timing-function: ${motion.easeOut};
}
.c31-glyph[data-rec] { width: ${u(12)}; height: ${u(12)}; border-radius: ${u(3)}; }
.c31-wave {
  flex: 1; height: ${u(26)};
  display: flex; align-items: center; justify-content: space-between;
}
.c31-bar {
  width: ${u(2.5)}; border-radius: 999px; background: ${color.skeleton};
  transition-property: height, opacity;
  transition-duration: 70ms, ${motion.state}ms;
  transition-timing-function: linear, ${motion.easeOut};
}
.c31-bar[data-heard] { background: ${color.ink}; }
.c31-bar[data-rest] { opacity: 0.3; }
.c31-status { margin-top: ${u(8)}; padding-left: ${u(6)}; font-size: ${u(12.5)}; line-height: 1.44; color: ${color.muted}; }
.c31-row {
  display: grid; grid-template-columns: 1fr auto; gap: ${u(16)};
  padding: ${u(9)} 0;
  border-bottom: 1px solid ${color.hairline};
}
.c31-meta { display: flex; flex-direction: column; align-items: flex-end; gap: ${u(2)}; padding-top: ${u(2)}; }
@media (prefers-reduced-motion: reduce) {
  .c31-btn, .c31-glyph, .c31-bar { transition-duration: 0ms; }
  .c31-btn:active { transform: none; }
}
`
