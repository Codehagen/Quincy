"use client"

import * as React from "react"

import { Bar, Bracket, C, Lead, RING, Tile, fontHand, fontMono } from "./kit"

/**
 * A draft read the way an editor reads it: the margin names each beat with a
 * bracket in blue pen. Pointing at a beat quiets the other two, so you can
 * read one beat at a time — the hover only enhances; all three read at rest.
 */

const PEN = "oklch(0.53 0.2 259)"

const BEATS = [
  {
    id: "did",
    label: "what I did",
    body: <>On Tuesday I gave our build cache its own disk.</>,
  },
  {
    id: "happened",
    label: "what happened",
    body: (
      <>
        Nobody asked for it. Deploys just got faster:
        <span
          className="mt-[1.6cqw] block tabular-nums"
          style={{ fontWeight: 600, fontSize: "3.3cqw", letterSpacing: "-0.02em" }}
        >
          11 min → 2:40
        </span>
      </>
    ),
  },
  {
    id: "meant",
    label: "what it meant",
    body: (
      <>
        The slow part of shipping was never the code. It was the waiting we had
        stopped noticing.
      </>
    ),
  },
] as const

type Id = (typeof BEATS)[number]["id"]

export default function ThreeBeats() {
  const [active, setActive] = React.useState<Id | null>(null)

  return (
    <Tile>
      <Lead
        bold="Every draft is three beats."
        grey="What you did, what happened, what it meant. The number gets a line of its own."
      />

      <div
        className="absolute top-[22cqw] right-0 left-[5.4cqw]"
        onPointerLeave={() => setActive(null)}
      >
        <div
          aria-hidden
          className="absolute top-0 left-0 w-[58cqw] rounded-[2.4cqw]"
          style={{ background: C.white, boxShadow: RING, bottom: "-40cqw" }}
        />
        <div className="relative grid grid-cols-[58cqw_1fr]">
          <div className="col-start-1 flex items-center gap-[1.6cqw] px-[3.2cqw] pt-[2.8cqw] pb-[1.8cqw]">
            <span
              aria-hidden
              className="size-[4.4cqw] rounded-full"
              style={{ background: C.bar }}
            />
            <span className="flex flex-col leading-[1.25]">
              <span style={{ fontWeight: 560 }}>Draft for X</span>
              <span style={{ fontFamily: fontMono, fontSize: "1.85cqw", color: C.grey }}>
                cache-disk.md · 212 chars
              </span>
            </span>
          </div>
          <div className="col-start-2" />

          {BEATS.map((b) => {
            const dim = active !== null && active !== b.id
            return (
              <React.Fragment key={b.id}>
                <p
                  onPointerEnter={() => setActive(b.id)}
                  className="col-start-1 px-[3.2cqw] py-[1.1cqw] transition-[color] duration-200 motion-reduce:transition-none"
                  style={{ color: dim ? "rgba(18,18,18,0.24)" : C.ink }}
                >
                  {b.body}
                </p>
                <div
                  onPointerEnter={() => setActive(b.id)}
                  className="relative col-start-2 flex items-stretch gap-[1.2cqw] py-[1.1cqw] pl-[1.4cqw] transition-[opacity] duration-200 motion-reduce:transition-none"
                  style={{ opacity: dim ? 0.28 : 1 }}
                >
                  <Bracket color={PEN} className="w-[1.5cqw] shrink-0" />
                  <span
                    className="self-center leading-[0.9]"
                    style={{ fontFamily: fontHand, fontSize: "3.8cqw", color: PEN }}
                  >
                    {b.label}
                  </span>
                </div>
              </React.Fragment>
            )
          })}

          <div className="col-start-1 flex gap-[2.4cqw] px-[3.2cqw] pt-[2cqw] pb-[6cqw]">
            <Bar w="7cqw" />
            <Bar w="7cqw" />
            <Bar w="7cqw" />
          </div>
        </div>
      </div>
    </Tile>
  )
}
