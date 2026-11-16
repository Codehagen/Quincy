"use client"

import * as React from "react"

import { Bar, Bracket, C, Lead, RING, Tile, fontHand, fontMono, useSeen } from "./kit"

/**
 * The brain as a page you read, not a settings screen. Each line carries its
 * receipt. Once the tile is seen, the line Quincy just learned from your edit
 * slides into the list; tapping the page plays the learning again.
 */

const NEW = "oklch(0.6 0.13 205)"

const css = `
.qa5-new { display: grid; grid-template-rows: 0fr; opacity: 0; translate: 0 -0.8cqw;
  transition-property: grid-template-rows, opacity, translate; transition-duration: 420ms; transition-timing-function: cubic-bezier(.2,.7,.2,1); }
.qa5-new[data-on] { grid-template-rows: 1fr; opacity: 1; translate: 0 0; }
.qa5-note { opacity: 0; transition-property: opacity; transition-duration: 300ms; }
.qa5-note[data-on] { opacity: 1; transition-delay: 380ms; }
@media (prefers-reduced-motion: reduce) {
  .qa5-new, .qa5-note, .qa5-note[data-on] { transition-duration: 0ms; transition-delay: 0ms; }
}
`

const RULES = [
  { text: "Says “shipped”, never “launched”.", receipt: "12 edits" },
  { text: "The number goes on a line of its own.", receipt: "9 posts" },
]

function Row({
  text,
  receipt,
  fresh = false,
}: {
  text: string
  receipt: string
  fresh?: boolean
}) {
  return (
    <div className="grid grid-cols-[3cqw_1fr_auto] items-baseline gap-x-[0.4cqw] py-[0.9cqw]">
      <span
        aria-hidden
        className="size-[1.2cqw] translate-y-[-0.2cqw] rounded-full"
        style={{ background: fresh ? NEW : "rgba(18,18,18,0.18)" }}
      />
      <span>{text}</span>
      <span
        className="tabular-nums"
        style={{ fontFamily: fontMono, fontSize: "1.8cqw", color: fresh ? NEW : C.grey }}
      >
        {receipt}
      </span>
    </div>
  )
}

export default function BrainPage() {
  const [ref, seen] = useSeen<HTMLDivElement>()
  const [armed, setArmed] = React.useState(false)
  const [replay, setReplay] = React.useState(false)

  React.useEffect(() => {
    if (!seen) return
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const t = window.setTimeout(() => setArmed(true), reduce ? 0 : 700)
    return () => window.clearTimeout(t)
  }, [seen])

  const on = armed && !replay
  const learn = () => {
    setReplay(true)
    window.setTimeout(() => setReplay(false), 500)
  }

  return (
    <Tile>
      <style>{css}</style>
      <Lead
        bold="The brain is a page you can read."
        grey="What Quincy knows about your voice, in plain lines, each with its receipt."
      />

      <div ref={ref} className="absolute top-[23cqw] right-0 left-[5.4cqw]">
        <div
          aria-hidden
          className="absolute top-0 left-0 w-[62cqw] rounded-[2.4cqw]"
          style={{ background: C.white, boxShadow: RING, bottom: "-40cqw" }}
        />
        <button
          type="button"
          onClick={learn}
          aria-label="Play the learning again"
          className="relative grid w-full cursor-pointer grid-cols-[62cqw_1fr] text-left"
          style={{ touchAction: "manipulation" }}
        >
          <span className="col-start-1 block px-[3.4cqw] pt-[2.8cqw]">
            <span
              className="block"
              style={{ fontFamily: fontMono, fontSize: "1.85cqw", color: C.grey }}
            >
              brain/voice.md
            </span>
            <span className="mt-[1.8cqw] block" style={{ fontWeight: 560 }}>
              Voice
            </span>
            <span className="block" style={{ color: C.grey }}>
              Written by Heartbeat from what you keep and what you cut.
            </span>
          </span>
          <span className="col-start-2" />

          <span className="col-start-1 block px-[3.4cqw] pt-[1.4cqw]">
            {RULES.map((r) => (
              <Row key={r.text} {...r} />
            ))}
          </span>
          <span className="col-start-2" />

          <span className="qa5-new col-start-1" data-on={on || undefined}>
            <span className="block min-h-0 overflow-hidden px-[3.4cqw]">
              <Row fresh text="Never “excited”. Not once." receipt="today" />
            </span>
          </span>
          <span className="relative col-start-2">
            <span
              className="qa5-note absolute inset-y-[0.2cqw] left-[1.4cqw] flex items-center gap-[1.2cqw]"
              data-on={on || undefined}
            >
              <Bracket color={C.ink} className="h-full w-[1.3cqw] shrink-0" />
              <span
                className="w-[26cqw] -rotate-2 leading-[0.92]"
                style={{ fontFamily: fontHand, fontSize: "3.6cqw", color: C.ink }}
              >
                from your edit, 09:14
              </span>
            </span>
          </span>

          <span className="col-start-1 flex flex-col gap-[1.4cqw] px-[3.4cqw] pt-[1.8cqw] pb-[6cqw] pl-[6.4cqw]">
            <Bar w="70%" />
            <Bar w="56%" />
            <Bar w="64%" />
          </span>
        </button>
      </div>
    </Tile>
  )
}
