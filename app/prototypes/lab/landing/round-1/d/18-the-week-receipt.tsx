"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Avatar, Button, ButtonLink, Mono, Text } from "@/components/kit"

import { Frame, TopLine } from "./frame"

/**
 * The week as a receipt, on a dark ground. A centred two-beat headline, then
 * the product as the picture: a whole Studio window with the sidebar, the
 * conversation and the week beside it. You ask Quincy what it did with your
 * week and it answers with a checked list, one line per day's work, ending
 * on the draft it is holding for your read. Then one plain sentence: nothing
 * has gone out.
 *
 * One accent: the blue of the one action, the invite. The checks are ink.
 */

const RECEIPT = [
  { verb: "Heard", what: "your voice note from Monday's walk", meta: "4:12" },
  { verb: "Read", what: "PR #212, merged Tuesday", meta: "4 files" },
  { verb: "Found", what: "3 ideas in your PR", meta: "Wed" },
  {
    verb: "Drafted",
    what: "1 post for X and LinkedIn, held for your read",
    meta: "Thu",
  },
  {
    verb: "Checked",
    what: "last week's post: 31 replies, your median is 6",
    meta: "Fri",
  },
]

const NAV = ["Studio", "Ideas", "Lineup", "Numbers", "Sources"]

const WEEK = [
  { day: "Mon", line: "Voice note" },
  { day: "Tue", line: "PR #212 merged" },
  { day: "Wed", line: "3 ideas" },
  { day: "Thu", line: "Draft held for you" },
  { day: "Fri", line: "Nothing goes out yet" },
]

export default function TheWeekReceipt() {
  const [open, setOpen] = React.useState(false)

  return (
    <Frame dark ground="stage">
      <div className="px-14 pt-10">
        <TopLine />
      </div>

      {/* The hero: two beats, centred, and one control. */}
      <div className="flex flex-col items-center pt-16 text-center">
        <h1 className="text-7xl leading-none font-kit-strong tracking-[-0.055em] text-kit-ink">
          You ship. It drafts.
        </h1>
        <p className="mt-5 max-w-[50ch] text-base leading-6 text-kit-ink-muted">
          Quincy reads the PRs you merge and the notes you leave, and holds
          every draft for your read.
        </p>
        <div className="mt-7">
          <ButtonLink href="/" variant="action" size="lg">
            Ask for an invite
          </ButtonLink>
        </div>
      </div>

      {/* The section: Studio, whole, cut by the bottom of the frame. */}
      <div className="absolute top-[372px] left-1/2 h-[600px] w-[1040px] -translate-x-1/2 overflow-hidden rounded-t-kit-stage bg-kit-object shadow-kit-object">
        <div className="grid h-full grid-cols-[200px_1fr_260px]">
          {/* Sidebar */}
          <nav
            aria-label="Quincy"
            className="flex flex-col gap-1 border-r border-kit-hairline p-3"
          >
            <div
              className="flex items-center gap-1.5 px-2 pt-1 pb-4"
              aria-hidden
            >
              <span className="size-2.5 rounded-full bg-kit-mark" />
              <span className="size-2.5 rounded-full bg-kit-mark" />
              <span className="size-2.5 rounded-full bg-kit-mark" />
            </div>
            {NAV.map((n, i) => (
              <span
                key={n}
                className={`rounded-kit-control-inner px-2.5 py-1.5 text-kit-body ${i === 0 ? "bg-kit-well font-kit-strong text-kit-ink" : "text-kit-ink-muted"}`}
              >
                {n}
              </span>
            ))}
          </nav>

          {/* Conversation */}
          <div className="flex flex-col gap-5 px-8 pt-8">
            <div className="self-end rounded-kit-control bg-kit-well px-3.5 py-2.5 text-kit-body text-kit-ink">
              What did you do with my week?
            </div>
            <div className="flex flex-col gap-kit-related">
              <Text weight="strong" as="span">
                Quincy
              </Text>
              <ul className="flex flex-col gap-2 rounded-kit-control bg-kit-well p-3 shadow-kit-inset">
                {RECEIPT.map((r) => (
                  <li
                    key={r.verb}
                    className="flex items-baseline gap-2.5 text-kit-body"
                  >
                    <HugeiconsIcon
                      icon={Tick02Icon}
                      size={15}
                      strokeWidth={2}
                      aria-hidden
                      className="shrink-0 translate-y-0.5 text-kit-ink"
                    />
                    <span className="font-kit-strong text-kit-ink">
                      {r.verb}
                    </span>
                    <span aria-hidden className="text-kit-ink-muted">
                      ›
                    </span>
                    <span className="min-w-0 text-kit-ink">{r.what}</span>
                    <span className="ml-auto pl-3">
                      <Mono>{r.meta}</Mono>
                    </span>
                  </li>
                ))}
              </ul>
              <Text>
                That was your week. One draft is waiting for you, and nothing
                has gone out.
              </Text>
            </div>
          </div>

          {/* The week, beside the conversation. */}
          <aside className="flex flex-col gap-4 border-l border-kit-hairline p-5">
            <div className="flex items-baseline justify-between">
              <Text weight="strong" as="span">
                This week
              </Text>
              <Mono>2 to 6 Nov</Mono>
            </div>
            <ol className="flex flex-col">
              {WEEK.map((w) => (
                <li
                  key={w.day}
                  className="flex items-baseline gap-3 border-t border-kit-hairline py-2.5"
                >
                  <span className="w-8">
                    <Mono>{w.day}</Mono>
                  </span>
                  <Text
                    variant="small"
                    tone={w.day === "Thu" ? "ink" : "muted"}
                    as="span"
                  >
                    {w.line}
                  </Text>
                </li>
              ))}
            </ol>
            <div className="flex flex-col gap-kit-related rounded-kit-control bg-kit-well p-3 shadow-kit-inset">
              <div className="flex items-center gap-2">
                <Avatar initials="Q" />
                <Text variant="small" weight="strong" as="span">
                  Held for your read
                </Text>
              </div>
              <Text variant="small" tone={open ? "ink" : "muted"}>
                {open
                  ? "I cut our onboarding email down to one question. People answer a question. They skip a brochure."
                  : "I cut our onboarding email down to one question."}
              </Text>
              <div>
                <Button onClick={() => setOpen((o) => !o)}>
                  {open ? "Close" : "Read the draft"}
                </Button>
              </div>
            </div>
            <Text variant="small" tone="muted">
              Nothing goes out until you approve it.
            </Text>
          </aside>
        </div>
      </div>
    </Frame>
  )
}
