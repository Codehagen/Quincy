"use client"

import * as React from "react"

import { color, motion } from "../tokens"
import {
  Arrive,
  Card,
  MarginNote,
  Mono,
  QuietButton,
  Rule,
  SkeletonLines,
  Stage,
  Text,
  u,
} from "../kit"

/**
 * The person edits a line of the draft in place. When they commit it (Enter,
 * or leaving the line), Quincy reads what changed and writes what it learned
 * in the margin, and the brain gets a line. No diff, no strikethrough: the
 * note names the cut in words. "Put it back" restores Quincy's line.
 *
 * Local: the editable line (a textarea set as body text) and the reading of
 * the edit into a note.
 */

const ORIGINAL = "I’m excited to share that our deploys are a lot faster now."

const css = `
.a25-line {
  display: block; box-sizing: border-box;
  width: calc(100% + ${u(12)}); margin: 0 0 0 calc(-1 * ${u(6)});
  padding: ${u(4)} ${u(6)};
  border: 0; border-radius: ${u(6)}; resize: none; overflow: hidden;
  field-sizing: content; min-height: ${u(48)};
  font: inherit; color: ${color.ink}; letter-spacing: inherit;
  background: transparent; caret-color: var(--k2-accent);
  box-shadow: inset 0 0 0 1px transparent;
  transition-property: box-shadow, background-color;
  transition-duration: ${motion.state}ms;
  transition-timing-function: ${motion.easeOut};
}
@media (hover: hover) { .a25-line:hover { background: rgba(18,18,18,.03); } }
.a25-line:focus-visible, .a25-line:focus {
  outline: none; background: ${color.surface};
  box-shadow: inset 0 0 0 1px rgba(18,18,18,.10), 0 0 0 3px color-mix(in oklch, var(--k2-accent), transparent 82%);
}
.a25-edit .k2-margin {
  opacity: 0; translate: calc(-1 * ${u(4)}) 0;
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.a25-edit[data-on] .k2-margin { opacity: 1; translate: 0 0; transition-delay: ${motion.press}ms; }
@media (prefers-reduced-motion: reduce) {
  .a25-line, .a25-edit .k2-margin, .a25-edit[data-on] .k2-margin { transition-duration: 0ms; transition-delay: 0ms; }
}
`

const words = (s: string) =>
  s
    .toLowerCase()
    .replace(/[’']/g, "'")
    .split(/[^a-z0-9']+/)
    .filter(Boolean)

/** What Quincy writes in the margin about one edit, or null if nothing changed. */
function readEdit(before: string, after: string): string | null {
  if (after.trim() === before.trim()) return null
  if (!after.trim()) return "cut the whole line. I'll open on the number"
  const kept = new Set(words(after))
  const cut = words(before).filter((w) => !kept.has(w))
  if (cut.includes("excited")) return "you cut “excited”. noted, for every draft"
  if (cut.includes("share")) return "no “excited to share”. noted"
  if (after.length < before.length * 0.75) return "shorter, plainer. noted"
  const first = cut.find((w) => w.length > 3)
  if (first) return `you cut “${first}”. I'll remember`
  const had = new Set(words(before))
  const added = words(after).find((w) => !had.has(w) && w.length > 3)
  if (added) return `you'd say “${added}”. noted`
  return "your wording. noted"
}

export default function YourLine() {
  const [value, setValue] = React.useState(ORIGINAL)
  const [committed, setCommitted] = React.useState(ORIGINAL)
  const field = React.useRef<HTMLTextAreaElement>(null)

  const note = readEdit(ORIGINAL, committed)
  // Keep the last note's words while it fades out after "Put it back".
  const [shownNote, setShownNote] = React.useState("")
  if (note && note !== shownNote) setShownNote(note)
  const commit = () => setCommitted(value)
  const putBack = () => {
    setValue(ORIGINAL)
    setCommitted(ORIGINAL)
    field.current?.focus()
  }

  return (
    <Stage
      lead="Change a line and Quincy notices."
      rest="It says what it learned, so the next draft starts closer to you."
    >
      <style>{css}</style>
      <Card width={330}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <Text weight="strong" as="span">
            Draft for LinkedIn
          </Text>
          <Mono>Fri 16:00</Mono>
        </div>

        <div className="a25-edit" data-on={note ? true : undefined} style={{ marginTop: u(10) }}>
          <MarginNote note={shownNote}>
            <textarea
              ref={field}
              className="a25-line"
              aria-label="First line of the draft"
              rows={2}
              spellCheck={false}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault()
                  commit()
                }
                if (e.key === "Escape") {
                  e.preventDefault()
                  setValue(committed)
                }
              }}
            />
          </MarginNote>
        </div>
        <Text size="small" tone="faint">
          Edit the line. Enter keeps it.
        </Text>

        <div style={{ marginTop: u(12), display: "flex", flexDirection: "column", gap: u(4) }}>
          <Text>Deploys went from</Text>
          <Text size="figure">11 min → 2:40</Text>
        </div>
        <div style={{ marginTop: u(12) }}>
          <SkeletonLines widths={["86%", "64%"]} />
        </div>

        <Rule />

        <Arrive show={note !== null} from="below">
          <div
            role="status"
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", minHeight: u(34) }}
          >
            <Mono>brain/voice.md · 1 new line</Mono>
            <QuietButton onClick={putBack}>Put it back</QuietButton>
          </div>
        </Arrive>
      </Card>
    </Stage>
  )
}
