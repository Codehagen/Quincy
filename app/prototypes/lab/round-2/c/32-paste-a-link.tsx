"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Link01Icon } from "@hugeicons/core-free-icons"

import {
  ActionButton,
  Card,
  Highlight,
  MarginNote,
  Mono,
  SkeletonLines,
  Stage,
  Text,
  u,
} from "../kit"
import { color, motion, radius } from "../tokens"

/**
 * 32 — Paste a link and Quincy reads it.
 *
 * 01's move (the highlighter on the one sentence, the reason in the margin)
 * applied to something you paste instead of something you say. The field is
 * a real form: Enter or the button reads it, pasting reads it straight away,
 * an empty field says so next to itself. Until then the space below says what
 * will happen, so nothing sits empty waiting for a loop.
 */

const EXAMPLE = "notes.christer.dev/build-cache"
/** How long the pretend fetch takes. Long enough to read the label. */
const READ_MS = 650

type Phase = "idle" | "reading" | "read"

export default function PasteALink() {
  const [value, setValue] = React.useState(EXAMPLE)
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [error, setError] = React.useState<string | null>(null)
  const timer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => () => window.clearTimeout(timer.current), [])

  const read = (text: string) => {
    if (!text.trim()) {
      setError("Paste a link or a note first.")
      return
    }
    setError(null)
    setPhase("reading")
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => setPhase("read"), READ_MS)
  }

  const done = phase === "read"

  return (
    <Stage
      lead="Paste the thing you wrote and forgot."
      rest="Quincy reads it and marks the part you never posted."
    >
      <style>{css}</style>
      <Card width={330}>
        <form
          noValidate
          onSubmit={(e) => {
            e.preventDefault()
            read(value)
          }}
          style={{ display: "flex", gap: u(8) }}
        >
          <label className="c32-field" data-invalid={error ? true : undefined}>
            <span className="c32-sr">Link or note</span>
            <HugeiconsIcon icon={Link01Icon} strokeWidth={2} className="c32-icon" aria-hidden />
            <input
              value={value}
              spellCheck={false}
              autoComplete="off"
              placeholder="Paste a link or a note"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "c32-error" : undefined}
              onChange={(e) => {
                setValue(e.target.value)
                if (error && e.target.value.trim()) setError(null)
                if (phase !== "idle") setPhase("idle")
              }}
              onPaste={(e) => {
                const text = e.clipboardData.getData("text")
                if (!text.trim()) return
                e.preventDefault()
                setValue(text)
                read(text)
              }}
            />
          </label>
          <ActionButton
            type="submit"
            pending={phase === "reading"}
            pendingLabel="Reading"
          >
            Read it
          </ActionButton>
        </form>
        {error ? (
          <p id="c32-error" className="c32-error">
            {error}
          </p>
        ) : null}

        <div className="c32-swap" style={{ marginTop: u(16) }}>
          <div className="c32-layer" data-on={!done || undefined} inert={done}>
            <Text tone="muted">
              A link, a doc, a note from your phone. Quincy keeps the source and
              tells you which line is worth a post.
            </Text>
          </div>

          <div
            className="c32-layer"
            data-on={done || undefined}
            inert={!done}
            aria-live="polite"
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <Mono>build-cache.md</Mono>
              <Mono tone="faint">Mar 14 · 6 min</Mono>
            </div>
            <div style={{ marginTop: u(8) }}>
              <Text weight="strong">What moving the build cache taught me</Text>
            </div>
            <div style={{ marginTop: u(10) }}>
              <SkeletonLines widths={["92%", "78%"]} />
            </div>
            <div style={{ marginTop: u(10) }}>
              <MarginNote note={<>the riff. you wrote it in March, never posted it</>}>
                <Text>
                  The runner kept timing out, so I gave the cache its own disk.{" "}
                  <Highlight active={done}>
                    The fix took an hour. Finding it took three weeks.
                  </Highlight>
                </Text>
              </MarginNote>
            </div>
            <div style={{ marginTop: u(10) }}>
              <SkeletonLines widths={["86%", "64%", "80%"]} />
            </div>
          </div>
        </div>
      </Card>
    </Stage>
  )
}

const css = `
.c32-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip-path: inset(50%); white-space: nowrap; }
.c32-field {
  position: relative; flex: 1; min-width: 0;
  display: flex; align-items: center; gap: ${u(8)};
  height: ${u(34)}; padding: 0 ${u(10)};
  border-radius: ${u(radius.control)};
  background: ${color.well};
  box-shadow: inset 0 0 0 1px transparent;
  transition-property: box-shadow;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
.c32-field:focus-within { box-shadow: inset 0 0 0 1px ${color.ink}; }
.c32-field[data-invalid] { box-shadow: inset 0 0 0 1.5px ${color.ink}; }
.c32-icon { width: ${u(15)}; height: ${u(15)}; flex: none; color: ${color.muted}; }
.c32-field input {
  flex: 1; min-width: 0; height: 100%;
  border: 0; outline: 0; background: transparent; padding: 0;
  font: inherit; color: ${color.ink};
  font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
  font-size: ${u(12)};
}
.c32-field input::placeholder { color: ${color.faint}; }
@media (pointer: coarse) { .c32-field input { font-size: 16px; } }
.c32-error { margin-top: ${u(6)}; font-size: ${u(12.5)}; color: ${color.ink}; }
.c32-swap { display: grid; }
.c32-layer {
  grid-area: 1 / 1;
  opacity: 0; translate: 0 ${u(6)};
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.c32-layer[data-on] { opacity: 1; translate: 0 0; }
@media (prefers-reduced-motion: reduce) {
  .c32-field, .c32-layer { transition-duration: 0ms; }
}
`
