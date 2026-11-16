"use client"

import * as React from "react"

import { ButtonLink, Text } from "@/components/kit"

import { Frame, TopLine } from "./frame"

/**
 * The week as a ledger. Two columns of a bookkeeper's page: what came in
 * (what you said and shipped) and what went out (what Quincy made of it, and
 * what you approved). The last column is the only scale the product keeps,
 * each post against your own median, and it is honest: the week's last post
 * did less than usual, and the ledger says so.
 *
 * One accent: the blue pen, writing in the margin the way an editor checks
 * a page. No blue control; the invite is quiet.
 */

type Row = {
  date: string
  into?: { title: string; meta?: string }
  out?: { title: string; meta?: string }
  status: string
  against?: { x: string; line: string }
  /** The editor's note in the margin, in blue pen. */
  pen?: string
}

const ROWS: Row[] = [
  {
    date: "Mon 2",
    into: { title: "Voice note from a walk", meta: "walk-monday.m4a · 4:12" },
    status: "Heard",
  },
  {
    date: "Tue 3",
    into: {
      title: "PR #212, onboarding email asks one question",
      meta: "4 files · 61 lines",
    },
    out: { title: "3 ideas from your PR" },
    status: "Read",
    pen: "same idea as monday",
  },
  {
    date: "Thu 5",
    out: { title: "Draft for X and LinkedIn", meta: "one idea, written twice" },
    status: "Approved by you",
  },
  {
    date: "Fri 6",
    out: { title: "Post on X and LinkedIn" },
    status: "Out 08:30",
  },
  {
    date: "Mon 9",
    into: { title: "31 replies in the first week" },
    out: { title: "A reply drafted for each", meta: "you sent 22" },
    status: "Answered",
    against: { x: "5.2×", line: "Your median is 6." },
    pen: "the first line did it",
  },
  {
    date: "Wed 11",
    into: { title: "Note pasted from a support thread" },
    out: { title: "1 idea from your note" },
    status: "Kept",
  },
  {
    date: "Fri 13",
    out: { title: "Post on LinkedIn" },
    status: "Out 09:00",
    against: { x: "0.8×", line: "A little under your median." },
    pen: "not every week",
  },
]

function Cell({ v }: { v?: { title: string; meta?: string } }) {
  if (!v)
    return (
      <span
        aria-hidden
        className="block h-px w-6 translate-y-2.5 bg-kit-mark"
      />
    )
  return (
    <div className="flex flex-col">
      <span className="text-kit-ink">{v.title}</span>
      {v.meta ? (
        <span className="font-kit-mono text-kit-mono text-kit-ink-muted">
          {v.meta}
        </span>
      ) : null}
    </div>
  )
}

const COLS = "grid grid-cols-[88px_1fr_1fr_150px_150px] gap-6"

export default function TheLedger() {
  return (
    <Frame>
      <div className="px-14 pt-10">
        <TopLine />
      </div>

      {/* The hero: two lines of type, like the two columns below them. */}
      <div className="grid grid-cols-[1fr_360px] items-end gap-10 px-14 pt-12">
        <h1 className="text-8xl leading-[0.95] font-kit-strong tracking-tighter text-kit-ink">
          What came in.
          <br />
          <span className="text-kit-ink-muted">What went out.</span>
        </h1>
        <div className="flex flex-col gap-5 pb-2">
          <p className="text-base leading-6 text-kit-ink-muted">
            Quincy keeps the books on your writing. Every post traces back to
            something you did, nothing goes out without your yes, and every
            number is set against your own median.
          </p>
          <div className="flex items-center gap-4">
            <ButtonLink href="/" size="lg">
              Ask for an invite
            </ButtonLink>
            <Text tone="muted" as="span">
              $49 a month
            </Text>
          </div>
        </div>
      </div>

      {/* The section: the ledger. Ruled on the ground, no card: a page of
          the books, not a widget. The margin column holds the pen. */}
      <div className="absolute inset-x-0 top-[356px] bottom-0 pr-[200px] pl-14">
        <div
          className={`${COLS} border-b-[3px] border-double border-kit-mark pb-2 text-kit-small font-kit-strong text-kit-ink`}
        >
          <span>Date</span>
          <span>In, from you</span>
          <span>Out, from Quincy</span>
          <span>Where it is</span>
          <span>Against your median</span>
        </div>
        <ol>
          {ROWS.map((r, i) => (
            <li
              key={i}
              className={`relative ${COLS} border-b border-kit-hairline py-3 text-kit-small`}
            >
              <span className="font-kit-mono text-kit-mono text-kit-ink-muted">
                {r.date}
              </span>
              <Cell v={r.into} />
              <Cell v={r.out} />
              <span className="text-kit-ink">{r.status}</span>
              {r.against ? (
                <div className="flex flex-col">
                  <span className="text-kit-figure font-kit-strong text-kit-ink tabular-nums">
                    {r.against.x}
                  </span>
                  <span className="text-kit-ink-muted">{r.against.line}</span>
                </div>
              ) : (
                <span />
              )}
              {r.pen ? (
                <span className="absolute top-1/2 left-[calc(100%+20px)] flex w-[170px] -translate-y-1/2 items-center gap-2">
                  <svg
                    aria-hidden
                    viewBox="0 0 24 10"
                    className="w-6 shrink-0 overflow-visible"
                  >
                    <path
                      d="M23 5 C 16 4, 8 6, 1 5 M5 1.5 L1 5 L5 8.5"
                      fill="none"
                      stroke="var(--kit-pen)"
                      strokeWidth={1.3}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <span className="inline-block -rotate-2 font-kit-hand text-kit-hand text-kit-pen">
                    {r.pen}
                  </span>
                </span>
              ) : null}
            </li>
          ))}
        </ol>
      </div>
    </Frame>
  )
}
