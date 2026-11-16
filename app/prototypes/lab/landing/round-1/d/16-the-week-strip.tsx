"use client"

import * as React from "react"

import { Button, ButtonLink, Mono, Text } from "@/components/kit"

import { Frame, TopLine } from "./frame"

/**
 * The week as a strip of days, read left to right. Each day holds one real
 * object: the note, the merged PR, the ideas, the draft. Friday is empty
 * until you press Approve on Thursday, because nothing goes out on its own.
 * The sixth column is next Monday, cut off by the frame: the week goes on,
 * and the number arrives there, against your own median.
 *
 * One accent: the blue of Approve. Nothing else on the page is blue.
 */

const DAYS = [
  { day: "Mon", date: "2 Nov" },
  { day: "Tue", date: "3 Nov" },
  { day: "Wed", date: "4 Nov" },
  { day: "Thu", date: "5 Nov" },
  { day: "Fri", date: "6 Nov" },
  { day: "Mon", date: "9 Nov" },
]

// A waveform is filler: its heights are the only thing that matters.
const WAVE = [
  4, 9, 14, 7, 18, 11, 6, 15, 20, 9, 5, 12, 17, 8, 13, 6, 10, 16, 7, 4, 11, 14,
  6, 9,
]

function Wave() {
  return (
    <div aria-hidden className="flex h-6 items-center gap-[3px]">
      {WAVE.map((h, i) => (
        <span
          key={i}
          className="w-[3px] rounded-full bg-kit-mark"
          style={{ height: h }}
        />
      ))}
    </div>
  )
}

/** Hills at dusk, in three greys: far, middle, near. Decorative. */
function Landscape() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 1088 560"
      preserveAspectRatio="xMidYMax slice"
      className="absolute inset-0 size-full"
    >
      <path
        d="M0 300 C 140 250, 260 270, 380 236 C 520 196, 640 250, 780 220 C 900 196, 1000 230, 1088 210 L1088 560 L0 560 Z"
        className="fill-kit-mark"
        opacity={0.22}
      />
      <path
        d="M0 380 C 160 330, 300 360, 460 320 C 620 282, 760 350, 920 316 C 990 302, 1050 312, 1088 304 L1088 560 L0 560 Z"
        className="fill-kit-mark"
        opacity={0.38}
      />
      <path
        d="M0 470 C 200 420, 360 452, 560 418 C 760 386, 920 444, 1088 412 L1088 560 L0 560 Z"
        className="fill-kit-mark"
        opacity={0.6}
      />
    </svg>
  )
}

function Obj({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-kit-related rounded-kit-object bg-kit-object p-4 shadow-kit-object">
      {children}
    </div>
  )
}

export default function TheWeekStrip() {
  const [approved, setApproved] = React.useState(false)

  return (
    <Frame>
      <div className="px-14 pt-10">
        <TopLine />
      </div>

      {/* The hero: two beats, centred, one quiet control (the blue is
          Approve's, below). */}
      <div className="flex flex-col items-center pt-14 text-center">
        <h1 className="text-7xl leading-none font-kit-strong tracking-[-0.05em] text-kit-ink">
          Monday you say it.
          <br />
          Friday it goes out.
        </h1>
        <p className="mt-5 max-w-[52ch] text-base leading-6 text-kit-ink-muted">
          Quincy reads what you ship and listens to what you say. It drafts in
          your voice, and nothing leaves until you approve it. $49 a month.
        </p>
        <div className="mt-6">
          <ButtonLink href="/" size="lg">
            Ask for an invite
          </ButtonLink>
        </div>
      </div>

      {/* The section: the week, as a window on a desktop at dusk. The
          landscape is drawn in the kit's greys so the one colour on the page
          stays Approve. The window runs off the right and the bottom. */}
      <div className="absolute top-[392px] right-14 -bottom-10 left-14 overflow-hidden rounded-kit-stage bg-linear-to-b from-kit-stage to-kit-ground">
        <Landscape />
        <div className="absolute top-12 -right-24 left-12 h-[520px] rounded-kit-object bg-kit-object shadow-kit-lifted">
          <div className="flex items-center gap-1.5 px-4 pt-3.5" aria-hidden>
            <span className="size-2.5 rounded-full bg-kit-mark" />
            <span className="size-2.5 rounded-full bg-kit-mark" />
            <span className="size-2.5 rounded-full bg-kit-mark" />
          </div>
          <div className="flex items-baseline gap-3 px-6 pt-5">
            <Text weight="strong" as="h2">
              Lineup
            </Text>
            <Text tone="muted" as="span">
              Two things you did. One post you approve.
            </Text>
          </div>

          <ol className="mt-5 flex pl-6">
            {DAYS.map((d, i) => (
              <li
                key={i}
                className="flex w-[200px] shrink-0 flex-col gap-3 border-l border-kit-hairline px-3"
              >
                <div className="flex items-baseline justify-between">
                  <Text weight="strong" as="span">
                    {i === 5 ? "Next Mon" : d.day}
                  </Text>
                  <Mono>{d.date}</Mono>
                </div>

                <div className="min-h-[240px]">
                  {i === 0 ? (
                    <Obj>
                      <Wave />
                      <Mono>walk-monday.m4a · 4:12</Mono>
                      <Text variant="small">
                        You, on a walk. The onboarding email asks five things
                        before it says hello.
                      </Text>
                    </Obj>
                  ) : null}

                  {i === 1 ? (
                    <Obj>
                      <Mono>Merged · #212</Mono>
                      <Text variant="small" weight="strong">
                        Onboarding email asks one question
                      </Text>
                      <Text variant="small" tone="muted">
                        4 files, 61 lines. Quincy read the diff and the
                        description.
                      </Text>
                    </Obj>
                  ) : null}

                  {i === 2 ? (
                    <Obj>
                      <Text variant="small" weight="strong">
                        3 ideas from your PR
                      </Text>
                      <ul className="flex flex-col gap-2">
                        <li className="text-kit-small text-kit-ink">
                          The email that asked one question
                        </li>
                        <li className="text-kit-small text-kit-ink-muted">
                          What we deleted, and why
                        </li>
                        <li className="text-kit-small text-kit-ink-muted">
                          A walk, then a PR
                        </li>
                      </ul>
                    </Obj>
                  ) : null}

                  {i === 3 ? (
                    <Obj>
                      <Text variant="small" tone="muted">
                        Draft for X and LinkedIn
                      </Text>
                      <Text variant="small">
                        I cut our onboarding email down to one question.
                      </Text>
                      <div className="flex gap-kit-controls">
                        {approved ? (
                          <Button onClick={() => setApproved(false)}>
                            Undo
                          </Button>
                        ) : (
                          <Button
                            variant="action"
                            onClick={() => setApproved(true)}
                          >
                            Approve
                          </Button>
                        )}
                      </div>
                    </Obj>
                  ) : null}

                  {i === 4 ? (
                    <div className="relative h-[140px]">
                      <div
                        data-on={!approved || undefined}
                        className="absolute inset-0 grid place-items-center rounded-kit-object border border-dashed border-kit-mark opacity-0 transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-on:opacity-100 motion-reduce:transition-none"
                      >
                        <Text variant="small" tone="muted">
                          Waiting for you
                        </Text>
                      </div>
                      <div
                        data-on={approved || undefined}
                        aria-hidden={!approved || undefined}
                        className="absolute inset-0 translate-y-1 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none"
                      >
                        <Obj>
                          <Mono tone="ink">Goes out Fri 08:30</Mono>
                          <Text variant="small" tone="muted">
                            On X and LinkedIn, written once for each.
                          </Text>
                        </Obj>
                      </div>
                    </div>
                  ) : null}

                  {i === 5 ? (
                    <Obj>
                      <Text variant="small">Replies in the first week</Text>
                      <Text variant="figure">31</Text>
                      <Text variant="small" tone="muted">
                        Your median is 6.
                      </Text>
                    </Obj>
                  ) : null}
                </div>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Frame>
  )
}
