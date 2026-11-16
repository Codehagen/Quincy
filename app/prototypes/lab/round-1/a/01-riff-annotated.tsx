"use client"

import * as React from "react"

import { Bar, Bracket, C, Lead, RING, Tile, fontHand, fontMono, useSeen } from "./kit"

/**
 * A voice-note transcript, read by Quincy. One sentence takes the highlighter;
 * the margin says why it is the riff. The sweep runs once when the tile is
 * seen, and tapping the page reads it again.
 */

const HIGHLIGHT = "oklch(0.91 0.165 99)"

const css = `
.qa-hl {
  background-image: linear-gradient(${HIGHLIGHT}, ${HIGHLIGHT});
  background-repeat: no-repeat;
  background-position: 0 58%;
  background-size: 0% 82%;
  -webkit-box-decoration-break: clone;
  box-decoration-break: clone;
  transition-property: background-size;
  transition-duration: 700ms;
  transition-timing-function: cubic-bezier(.3,.6,.2,1);
}
.qa-hl[data-on] { background-size: 100% 82%; }
.qa-note { opacity: 0; translate: -0.8cqw 0; transition-property: opacity, translate; transition-duration: 360ms; transition-delay: 0ms; transition-timing-function: cubic-bezier(.2,.7,.2,1); }
.qa-note[data-on] { opacity: 1; translate: 0 0; transition-delay: 620ms; }
@media (prefers-reduced-motion: reduce) {
  .qa-hl, .qa-note, .qa-note[data-on] { transition-duration: 0ms; transition-delay: 0ms; }
}
`

const SEGMENTS = [
  {
    t: "1:48",
    text: "…so, the deploy thing. On Tuesday I moved the build cache onto its own disk, mostly because the shared runner kept timing out on me.",
  },
  {
    t: "2:03",
    text: "Nobody asked me to. Deploys went from eleven minutes to under three.",
    key: true,
  },
  {
    t: "2:11",
    text: "Anyway, then I lost the afternoon to the billing page, which is a whole other—",
  },
]

export default function RiffAnnotated() {
  const [ref, seen] = useSeen<HTMLDivElement>()
  const [replay, setReplay] = React.useState(false)
  const on = seen && !replay

  const read = () => {
    setReplay(true)
    window.setTimeout(() => setReplay(false), 450)
  }

  return (
    <Tile>
      <style>{css}</style>
      <Lead
        bold="Quincy reads the note before you do."
        grey="It marks the one sentence worth a post, and says why in the margin."
      />

      <div ref={ref} className="absolute top-[24cqw] right-0 left-[5.4cqw]">
        <div
          aria-hidden
          className="absolute top-0 left-0 w-[58cqw] rounded-[2.4cqw]"
          style={{ background: C.white, boxShadow: RING, bottom: "-40cqw" }}
        />
        <button
          type="button"
          onClick={read}
          aria-label="Read the note again"
          className="relative grid w-full cursor-pointer grid-cols-[58cqw_1fr] text-left"
          style={{ touchAction: "manipulation" }}
        >
          <span
            className="col-start-1 flex items-baseline justify-between px-[3.2cqw] pt-[2.8cqw] pb-[1.6cqw]"
            style={{ fontFamily: fontMono, fontSize: "1.9cqw", color: C.grey }}
          >
            <span>walk-tuesday.m4a</span>
            <span className="tabular-nums">4:12</span>
          </span>
          <span className="col-start-2" />

          {SEGMENTS.map((s) => (
            <React.Fragment key={s.t}>
              <span className="col-start-1 grid grid-cols-[6cqw_1fr] px-[3.2cqw] py-[0.9cqw]">
                <span
                  className="pt-[0.35cqw] tabular-nums"
                  style={{ fontFamily: fontMono, fontSize: "1.75cqw", color: C.faint }}
                >
                  {s.t}
                </span>
                <span style={{ color: s.key ? C.ink : C.grey }}>
                  {s.key ? (
                    <span className="qa-hl" data-on={on || undefined}>
                      {s.text}
                    </span>
                  ) : (
                    s.text
                  )}
                </span>
              </span>
              <span className="relative col-start-2">
                {s.key ? (
                  <span
                    className="qa-note absolute inset-y-[0.6cqw] left-[1.6cqw] flex items-center gap-[1.4cqw]"
                    data-on={on || undefined}
                  >
                    <Bracket
                      color={C.ink}
                      className="h-full w-[1.6cqw] shrink-0"
                    />
                    <span
                      className="block w-[26cqw] -rotate-2 leading-[0.95]"
                      style={{ fontFamily: fontHand, fontSize: "3.9cqw", color: C.ink }}
                    >
                      the riff. nobody asked,
                      <br />
                      and it got 4× faster
                    </span>
                  </span>
                ) : null}
              </span>
            </React.Fragment>
          ))}

          <span className="col-start-1 flex flex-col gap-[1.3cqw] px-[3.2cqw] pt-[1.4cqw] pb-[6cqw] pl-[9.2cqw]">
            <Bar w="88%" />
            <Bar w="72%" />
            <Bar w="80%" />
          </span>
        </button>
      </div>
    </Tile>
  )
}
