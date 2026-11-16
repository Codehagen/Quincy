"use client"

import * as React from "react"
import { QuillWrite02Icon } from "@hugeicons/core-free-icons"

import { color, motion, radius } from "../tokens"
import {
  ActionButton,
  Highlight,
  MarginNote,
  Mono,
  QuietButton,
  Stage,
  Text,
  u,
  Window,
} from "../kit"

/**
 * Quincy's reply in the chat, set like a page an editor marked up rather
 * than a bubble: your question is the only bubble; the answer is prose with
 * the quote you said, highlighted, and a note in the margin. "Draft it"
 * sends your turn and the thread scrolls up to Quincy's next reply. The next
 * turn is laid out from the start (hidden and inert), so the scroll distance
 * is measured, not guessed.
 *
 * Local: the person's chat bubble, the quote rule, and the thread scroll.
 */

const css = `
.a23-view { height: ${u(256)}; overflow-x: visible; overflow-y: clip; }
.a23-thread {
  display: flex; flex-direction: column; gap: ${u(14)};
  transition-property: translate;
  transition-duration: ${motion.travel}ms;
  transition-timing-function: ${motion.easeMove};
}
.a23-you {
  align-self: flex-end; max-width: 78%;
  padding: ${u(7)} ${u(11)};
  background: ${color.well}; border-radius: ${u(radius.object)};
}
.a23-quote { padding-left: ${u(12)}; box-shadow: inset ${u(2)} 0 0 rgba(18,18,18,.14); }
.a23-next {
  display: flex; flex-direction: column; gap: ${u(14)};
  opacity: 0; translate: 0 ${u(10)};
  transition-property: opacity, translate;
  transition-duration: ${motion.enter}ms;
  transition-timing-function: ${motion.easeOut};
}
.a23-next[data-on] { opacity: 1; translate: 0 0; transition-delay: ${motion.press}ms; }
@media (prefers-reduced-motion: reduce) {
  .a23-thread, .a23-next, .a23-next[data-on] { transition-duration: 0ms; transition-delay: 0ms; }
}
`

export default function TheReply() {
  const [sent, setSent] = React.useState(false)
  const view = React.useRef<HTMLDivElement>(null)
  const next = React.useRef<HTMLDivElement>(null)
  const [shift, setShift] = React.useState(0)

  // Bring the bottom of the next turn to the bottom of the view. Measured
  // again on resize, because the whole picture scales with the frame.
  React.useLayoutEffect(() => {
    const v = view.current
    const n = next.current
    if (!sent || !v || !n) return
    const measure = () =>
      setShift(Math.max(0, n.offsetTop + n.offsetHeight - v.clientHeight + 4))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(v)
    return () => ro.disconnect()
  }, [sent])

  return (
    <Stage
      lead="Ask in the chat. It answers like an editor."
      rest="It quotes what you said and says why that is the one."
    >
      <style>{css}</style>
      <Window address="hirequincy.com/studio" width={330}>
        <div ref={view} className="a23-view">
          <div
            className="a23-thread"
            style={{ position: "relative", translate: sent ? `0 ${-shift}px` : "0 0" }}
          >
            <div className="a23-you">
              <Text>Anything from this week’s calls worth posting?</Text>
            </div>

            <Text>One thing. On Thursday’s call you said:</Text>

            <MarginNote note="this is the post. honest, and a bit funny" timing="after-highlight">
              <div className="a23-quote">
                <Text>
                  <Highlight>
                    We stopped writing release notes and nobody noticed for a month.
                  </Highlight>
                </Text>
              </div>
            </MarginNote>

            <Text>
              It beats the other two ideas I found. Want it as a draft, in three beats?
            </Text>

            <div style={{ display: "flex", gap: u(6) }}>
              <ActionButton icon={QuillWrite02Icon} onClick={() => setSent(true)} disabled={sent}>
                Draft it
              </ActionButton>
              <QuietButton disabled={sent}>Show me the other two</QuietButton>
            </div>

            <div
              ref={next}
              className="a23-next"
              data-on={sent || undefined}
              aria-hidden={!sent || undefined}
              inert={!sent}
            >
              <div className="a23-you">
                <Text>Draft it.</Text>
              </div>
              <div role="status" style={{ display: "flex", flexDirection: "column", gap: u(6) }}>
                <Text>
                  Done. It opens on the thing you did, then the month of silence.
                </Text>
                <Mono>release-notes.md · Tue 08:10</Mono>
              </div>
            </div>
          </div>
        </div>
      </Window>
    </Stage>
  )
}
