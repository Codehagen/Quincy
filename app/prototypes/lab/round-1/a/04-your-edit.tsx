"use client"

import * as React from "react"

import { Bracket, C, Lead, RING, Tile, fontHand, fontMono } from "./kit"

/**
 * Your edit against Quincy's draft, read as a diff. Struck lines are Quincy's,
 * green lines are yours, and the margin note is what Quincy took from it.
 * "Yours" folds the struck lines away — grid rows collapse rather than jump,
 * and a reversed toggle retargets mid-fold.
 */

const YOURS = "oklch(0.58 0.15 152)"

type Line = { kind: "same" | "del" | "add"; text: React.ReactNode; big?: boolean }

const LINES: Line[] = [
  { kind: "same", text: "On Tuesday I gave our build cache its own disk." },
  {
    kind: "del",
    text: "We're excited to share that deploys are now much faster!",
  },
  { kind: "add", text: "Nobody asked for it. Deploys just got faster:" },
  { kind: "same", text: "11 min → 2:40", big: true },
  { kind: "del", text: "This is a real game-changer for the whole team." },
  { kind: "add", text: "The slow part was never the code. It was the waiting." },
]

const css = `
.qa4-row { display: grid; grid-template-rows: 1fr; transition-property: grid-template-rows, opacity; transition-duration: 280ms; transition-timing-function: cubic-bezier(.2,.7,.2,1); }
.qa4[data-yours] .qa4-row[data-kind="del"] { grid-template-rows: 0fr; opacity: 0; }
.qa4-mark { transition-property: opacity; transition-duration: 200ms; }
.qa4[data-yours] .qa4-mark { opacity: 0; }
@media (prefers-reduced-motion: reduce) {
  .qa4-row, .qa4-mark { transition-duration: 0ms; }
}
`

export default function YourEdit() {
  const [yours, setYours] = React.useState(false)

  return (
    <Tile>
      <style>{css}</style>
      <Lead
        bold="Your edits are the lesson."
        grey="Every word you change goes into how Quincy writes the next draft."
      />

      <div
        className="qa4 absolute top-[22cqw] left-[5.4cqw] w-[62cqw] rounded-[2.4cqw]"
        data-yours={yours || undefined}
        style={{ background: C.white, boxShadow: RING, bottom: "-6cqw" }}
      >
        <div
          className="flex items-center gap-[2cqw] px-[2.6cqw] py-[1.8cqw]"
          style={{ borderBottom: `1px solid ${C.hair}` }}
        >
          <span aria-hidden className="flex gap-[0.9cqw]">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="size-[1.5cqw] rounded-full"
                style={{ background: "rgba(18,18,18,0.12)" }}
              />
            ))}
          </span>
          <span
            className="flex-1 truncate"
            style={{ fontFamily: fontMono, fontSize: "1.85cqw", color: C.grey }}
          >
            cache-disk.md — draft → yours
          </span>
          <div
            role="group"
            aria-label="View"
            className="flex rounded-full p-[0.4cqw]"
            style={{ background: C.tile, fontSize: "1.95cqw" }}
          >
            {(["Diff", "Yours"] as const).map((label) => {
              const pressed = (label === "Yours") === yours
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={pressed}
                  onClick={() => setYours(label === "Yours")}
                  className="relative cursor-pointer rounded-full px-[1.6cqw] py-[0.5cqw] transition-[background-color,color,box-shadow] duration-150 focus-visible:outline-2 focus-visible:outline-offset-1"
                  style={{
                    background: pressed ? C.white : "transparent",
                    color: pressed ? C.ink : C.grey,
                    boxShadow: pressed ? RING : "none",
                    fontWeight: 560,
                    touchAction: "manipulation",
                  }}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex flex-col py-[1.6cqw]">
          {LINES.map((l, i) => (
            <div key={i} className="qa4-row" data-kind={l.kind}>
              <div className="min-h-0 overflow-hidden">
                <div className="grid grid-cols-[4.4cqw_1fr] items-baseline py-[0.55cqw] pr-[3cqw]">
                  <span
                    className="qa4-mark text-center"
                    style={{
                      fontFamily: fontMono,
                      fontSize: "2cqw",
                      color: l.kind === "add" ? YOURS : C.faint,
                    }}
                  >
                    {l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}
                  </span>
                  <span
                    className={`transition-[box-shadow,padding-left] duration-200 motion-reduce:transition-none ${l.big ? "tabular-nums" : ""}`}
                    style={{
                      color: l.kind === "del" ? C.faint : C.ink,
                      textDecorationLine: l.kind === "del" ? "line-through" : "none",
                      textDecorationColor: "rgba(18,18,18,0.35)",
                      fontWeight: l.big ? 600 : 460,
                      fontSize: l.big ? "3.2cqw" : undefined,
                      letterSpacing: l.big ? "-0.02em" : undefined,
                      boxShadow:
                        l.kind === "add" && !yours ? `inset 0.5cqw 0 0 -0.1cqw ${YOURS}` : "none",
                      paddingLeft: l.kind === "add" && !yours ? "1.2cqw" : 0,
                      display: "block",
                    }}
                  >
                    {l.text}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div
        className="absolute top-[34cqw] right-[2.4cqw] left-[69cqw] flex items-stretch gap-[1.2cqw] transition-[opacity] duration-200 motion-reduce:transition-none"
        style={{ height: "8cqw", opacity: yours ? 0.25 : 1 }}
      >
        <Bracket color={C.ink} className="w-[1.4cqw] shrink-0" />
        <div className="flex flex-col justify-center gap-[1cqw]">
          <span
            className="-rotate-2 leading-[0.92]"
            style={{ fontFamily: fontHand, fontSize: "3.6cqw", color: C.ink }}
          >
            noted: you never say &ldquo;excited&rdquo;
          </span>
          <span style={{ fontFamily: fontMono, fontSize: "1.7cqw", color: C.grey }}>
            → brain/voice.md
          </span>
        </div>
      </div>
    </Tile>
  )
}
