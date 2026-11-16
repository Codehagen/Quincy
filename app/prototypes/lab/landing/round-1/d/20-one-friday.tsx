"use client"

import * as React from "react"

import {
  Avatar,
  Button,
  ButtonLink,
  Highlight,
  Mono,
  Text,
} from "@/components/kit"

import { Frame, TopLine } from "./frame"

/**
 * The week, zoomed to one day. Friday, hour by hour, in a day column that
 * runs off the top and the bottom of the frame: the post goes out at 08:30,
 * and the rest of the day is the people who answer it. This is Depth from
 * docs/vision.md made into a page: views are rented, the person who replies
 * three weeks running is the one you keep. Quincy drafts the answer; the
 * Send button is yours.
 *
 * One accent: the highlighter, on the one line of the day that matters.
 */

const HOUR = 64
// 06:30 sits at the top edge of the frame, so 06:00 is just cut off.
const y = (h: number, m = 0) => (h + m / 60 - 6.5) * HOUR

const HOURS = Array.from({ length: 15 }, (_, i) => 6 + i)

const PEOPLE = [
  { initials: "AD", handle: "@ada", line: "Answered your last 3 posts" },
  { initials: "JN", handle: "@jonas", line: "Answered 2 of your last 3" },
  { initials: "LI", handle: "@lin", line: "First reply, today" },
]

function Block({ at, children }: { at: number; children: React.ReactNode }) {
  return (
    <div
      className="absolute right-5 left-[72px] flex flex-col gap-kit-tight"
      style={{ top: at }}
    >
      {children}
    </div>
  )
}

export default function OneFriday() {
  const [sent, setSent] = React.useState(false)

  return (
    <Frame ground="stage">
      {/* The day column, full height, cut at both ends. */}
      <div className="absolute top-0 right-14 bottom-0 w-[460px] bg-kit-object shadow-kit-object">
        {HOURS.map((h) => (
          <div
            key={h}
            className="absolute inset-x-0 flex items-start border-t border-kit-hairline"
            style={{ top: y(h) }}
          >
            <span className="w-[72px] -translate-y-2.5 bg-kit-object pl-5">
              <Mono>{String(h).padStart(2, "0")}:00</Mono>
            </span>
          </div>
        ))}

        <Block at={y(7, 40) + 6}>
          <Text variant="small" tone="muted">
            You approved the draft, on your phone.
          </Text>
        </Block>

        <Block at={y(8, 30) + 4}>
          <div className="rounded-kit-control bg-kit-well px-3 py-2.5 shadow-kit-inset">
            <Mono tone="ink">08:30 · out on X and LinkedIn</Mono>
            <Text variant="small">
              I cut our onboarding email down to one question.
            </Text>
          </div>
        </Block>

        <Block at={y(9, 20)}>
          <Text variant="small" tone="muted">
            First replies. Quincy drafts an answer to each one, in your voice.
          </Text>
        </Block>

        <Block at={y(11, 0) + 4}>
          <div className="flex flex-col gap-kit-related rounded-kit-control bg-kit-object p-3.5 shadow-kit-control">
            <div className="flex items-center gap-2">
              <Avatar initials="AD" />
              <Text variant="small" weight="strong" as="span">
                @ada replied
              </Text>
              <Mono>11:02</Mono>
            </div>
            <Text variant="small">
              <Highlight>Third post in a row she has answered.</Highlight>{" "}
              <span className="text-kit-ink-muted">Worth a real reply.</span>
            </Text>
            <div className="rounded-kit-control-inner bg-kit-well px-3 py-2 text-kit-small text-kit-ink">
              We asked five things because we were scared to ask one. You were
              right about the welcome line too.
            </div>
            <div className="flex items-center gap-3">
              {sent ? (
                <>
                  <Mono tone="ink">Sent by you · 11:06</Mono>
                  <Button onClick={() => setSent(false)}>Undo</Button>
                </>
              ) : (
                <>
                  <Button onClick={() => setSent(true)}>Send</Button>
                  <Text variant="small" tone="muted" as="span">
                    Quincy drafted it. You send it.
                  </Text>
                </>
              )}
            </div>
          </div>
        </Block>

        <Block at={y(14, 30)}>
          <Text variant="small" tone="muted">
            12 more replies. Drafts are waiting, none sent.
          </Text>
        </Block>

        <Block at={y(16, 0) + 6}>
          <Text variant="small" weight="strong">
            Quincy writes you the week.
          </Text>
          <Text variant="small" tone="muted">
            What came in, what went out, who answered.
          </Text>
        </Block>

        <Block at={y(19, 30)}>
          <Text variant="small" tone="muted">
            Nothing until Monday.
          </Text>
        </Block>
      </div>

      {/* The hero, on the left. */}
      <div className="absolute top-0 left-14 w-[560px] pt-10">
        <TopLine
          right={
            <Text tone="muted" as="span">
              $49 a month
            </Text>
          }
        />
        <h1 className="mt-20 text-6xl leading-none font-kit-strong tracking-tight text-balance text-kit-ink">
          Friday is one post and the people who answer it.
        </h1>
        <p className="mt-6 max-w-[44ch] text-base leading-6 text-kit-ink-muted">
          Views come and go. The people who reply are the ones you keep. Quincy
          drafts an answer to every reply and tells you who keeps coming back.
          You send.
        </p>
        <div className="mt-7">
          <ButtonLink href="/" size="lg">
            Ask for an invite
          </ButtonLink>
        </div>
      </div>

      {/* The section under the hero: who keeps showing up. */}
      <div className="absolute bottom-14 left-14 w-[460px]">
        <Text weight="strong" as="h2">
          Who keeps showing up
        </Text>
        <Text tone="muted">Counted by replies to you, never by follows.</Text>
        <ul className="mt-5 flex flex-col">
          {PEOPLE.map((p) => (
            <li
              key={p.handle}
              className="flex items-center gap-3 border-t border-kit-hairline py-3 last:border-b"
            >
              <Avatar initials={p.initials} />
              <Text weight="strong" as="span">
                {p.handle}
              </Text>
              <span className="ml-auto">
                <Text tone="muted" as="span">
                  {p.line}
                </Text>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </Frame>
  )
}
