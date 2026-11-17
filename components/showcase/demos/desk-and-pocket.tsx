"use client"

/*
 * The landing hero: the work on your desk, the note in your pocket.
 *
 * Story, in beats:
 * 1. The desk is already there: Quincy's Studio, with the work receipt for
 *    the pull request it read (read #212, found the number, drafted two
 *    posts, held for your read). The friend sits on the window's top edge,
 *    reading.
 * 2. In the PR, under its source line (GitHub, merged Mon 16:40), the one
 *    line with the post in it is highlighted, and a graphite note writes in
 *    beside it.
 * 3. On the phone standing over the window's edge, the first note is on the
 *    lock screen: "Morning. 3 ideas from yesterday's merged PR."
 * 4. The second lands above it: "Draft's ready. Want it out at 8:30? It's
 *    held for your read." On the desk, the two drafts wait: the LinkedIn
 *    post as Quincy wrote it, three beats with the number on its own line,
 *    and Approve under it, the clear end of the picture; the X version
 *    under that, quieter, with its own time.
 *
 * Plays once when seen and holds. The first note is in the server HTML, so
 * the poster (reduced motion, no JS, a thumbnail) is the whole story with
 * the second note on top. No cursor: Quincy acts first, which is the point.
 *
 * Under 640px of container the desk does not fit at a size anyone can read,
 * so the compact design is a redesign, not a squeeze: the phone alone, the
 * friend on its edge, waiting.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GithubIcon } from "@hugeicons/core-free-icons"

import { Highlight, MarginNote, Mono, Perched, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { LockScreen, Notification, Phone } from "../phone"
import { Stage } from "../stage"
import { Window } from "../window"
import { QUINCY_MESSAGES } from "./quincy-texts"
import { POST } from "./the-post"
import { useArrival } from "./use-arrival"

const MORNING = QUINCY_MESSAGES.slice(0, 2)

const RECEIPT = [
  ["Read #212", "6 screens removed"],
  ["Found the number", "41% to 68%"],
  ["Drafted", "2 posts, held for your read"],
] as const

/** The friend on an ink tile: Quincy's app icon. Frozen, because icons do not blink. */
function AppIcon() {
  return (
    <span className="grid size-full place-items-center rounded-[22%] bg-kit-ink text-kit-ground">
      <Friend size={16} frozenAt={0} />
    </span>
  )
}

function Check() {
  return (
    <svg aria-hidden width={16} height={16} viewBox="0 0 16 16" className="flex-none">
      <circle cx="8" cy="8" r="8" className="fill-kit-ink" />
      <path
        d="M4.6 8.2 L7 10.5 L11.4 5.8"
        fill="none"
        className="stroke-kit-object"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function Receipt() {
  return (
    <div role="list" className="flex flex-col">
      {RECEIPT.map(([did, result]) => (
        <div role="listitem" key={did} className="flex items-center gap-2.5">
          <Check />
          <span>
            <span className="font-kit-strong">{did}</span>
            <span className="text-kit-ink-muted tabular-nums"> → {result}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

function PullRequest() {
  return (
    <div className="flex w-[24rem] flex-col gap-kit-tight rounded-kit-control bg-kit-well px-kit-recess py-2.5">
      <span className="flex items-center gap-1.5 text-kit-ink-muted">
        <HugeiconsIcon icon={GithubIcon} size={14} strokeWidth={1.8} aria-hidden />
        <Mono>GitHub · #212 · merged Mon 16:40</Mono>
      </span>
      <span className="font-kit-strong">Cut onboarding from nine screens to three</span>
      <span className="text-kit-ink-muted">
        Removed the team-size, role, and ‘how did you hear’ steps. Moved the rest after the first
        project.{" "}
        <span className="text-kit-ink">
          <Highlight>Finished signup since Monday: 68%. The week before: 41%.</Highlight>
        </span>
      </span>
    </div>
  )
}

/** Approve and Edit as the draft card carries them. Spans: this is a picture. */
export function DraftActions() {
  return (
    <span className="flex flex-none items-center gap-kit-controls">
      <span className="inline-flex h-kit-control-md items-center rounded-kit-control bg-kit-action px-4 font-kit-strong text-kit-action-on">
        Approve
      </span>
      <span className="inline-flex h-kit-control-md items-center rounded-kit-control bg-kit-control px-4 font-kit-strong shadow-kit-control">
        Edit
      </span>
    </span>
  )
}

/**
 * The held draft: what Quincy wrote, where and when it goes if you approve,
 * and the decision. No beat brackets here: the PR card already carries this
 * window's marks, and the brackets have their own picture further down.
 */
function HeldDraft() {
  return (
    <div className="flex flex-col rounded-kit-object bg-kit-object shadow-kit-object">
      <div className="flex flex-col gap-1.5 px-5 pt-3 pb-3">
        <span className="flex items-baseline gap-2">
          <span className="font-kit-strong">Draft for LinkedIn</span>
          <Mono>from #212 · 3 beats</Mono>
        </span>
        {/* Spans, not p: inside a Stage, p is reverted to the browser's own. */}
        <div className="flex flex-col gap-1.5">
          <Text as="span">{POST.did}</Text>
          <div className="flex flex-col">
            <Text as="span">{POST.happened}</Text>
            <Text as="span" variant="figure">
              {POST.figure}
            </Text>
          </div>
          <Text as="span">{POST.meant}</Text>
        </div>
        <div className="flex items-center justify-between gap-6 border-t border-kit-hairline pt-2.5">
          <span className="text-kit-ink-muted">LinkedIn · Wed 08:30 if you approve</span>
          <DraftActions />
        </div>
      </div>
      {/* The second post from the same idea: quieter, no button of its own on view. */}
      <div className="flex items-center justify-between gap-6 border-t border-kit-hairline px-5 py-2 text-kit-ink-muted">
        <span>Same idea, written for X</span>
        <Mono>X · Thu 09:00</Mono>
      </div>
    </div>
  )
}

const NAV = ["Studio", "Ideas", "Week", "Numbers", "Sources"]

function Desk() {
  return (
    <Window
      url="hirequincy.com/studio"
      sidebarWidth={176}
      sidebar={
        <nav className="flex flex-col gap-0.5 px-3.5 pt-3">
          {NAV.map((x) => (
            <span
              key={x}
              data-on={x === "Studio" || undefined}
              className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-stage data-on:font-kit-strong data-on:text-kit-ink"
            >
              {x}
            </span>
          ))}
        </nav>
      }
      style={{ width: 840, height: 620 }}
    >
      <div className="@container/kit-stage flex flex-col gap-2.5 px-10 pt-3.5 text-kit-body">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2.5">
            <span className="font-kit-strong">Quincy</span>
            <Mono>Tue 07:40</Mono>
          </span>
          <Receipt />
        </div>
        <div className="w-fit">
          <MarginNote note="the post is in here" timing="after-highlight">
            <PullRequest />
          </MarginNote>
        </div>
        <div className="w-[33rem]">
          <HeldDraft />
        </div>
      </div>
    </Window>
  )
}

function Lock({ width, shown }: { width: number; shown: number }) {
  return (
    <Phone width={width} time="07:52" wallpaper="linear-gradient(170deg, var(--kit-gray-450), var(--kit-gray-300))" dark>
      <LockScreen date="Tuesday 17 November" time="07:52" stack="top" controls={false}>
        <div className="flex flex-col gap-2">
          {[...MORNING].reverse().map((m) => {
            const i = MORNING.indexOf(m)
            const on = i < shown
            return (
              <div
                key={m.at}
                data-on={on || undefined}
                aria-hidden={!on || undefined}
                className="translate-y-2 opacity-0 transition-[opacity,translate] duration-(--kit-duration-enter) ease-kit-out data-on:translate-y-0 data-on:opacity-100 motion-reduce:transition-none"
              >
                <Notification icon={<AppIcon />} title="Quincy" body={m.text} time={m.at.split(" ")[1]} />
              </div>
            )
          })}
        </div>
      </LockScreen>
    </Phone>
  )
}

export function DeskAndPocket() {
  const [ref, shown] = useArrival<HTMLDivElement>(MORNING.length, 1800)

  return (
    <div
      ref={ref}
      role="img"
      aria-label={`Quincy’s Studio on a desk: it read pull request 212 from GitHub, merged Monday 16:40, found the number, finished signup 41% to 68%, and drafted two posts, held for your read. The draft for LinkedIn reads: ${POST.did} ${POST.happened} 41% to 68%. ${POST.meant} It goes Wednesday 08:30 if you approve; the X version goes Thursday 09:00. On a phone in front, two notes from Quincy: Morning. 3 ideas from yesterday’s merged PR. The second has a number. Then: Draft’s ready. Want it out at 8:30? It’s held for your read.`}
      className="pointer-events-none select-none"
    >
      <Stage<object> width={1072} height={560} compact={{ below: 640, width: 360, height: 540 }} unframed>
        {(_, __, layout) =>
          layout === "compact" ? (
            <div className="relative h-[540px] w-[360px] overflow-hidden rounded-kit-stage bg-kit-stage">
              <div className="absolute top-[72px] left-[32px]">
                <Perched state="waiting" at="196px">
                  <Lock width={296} shown={shown} />
                </Perched>
              </div>
            </div>
          ) : (
            <div className="relative h-[560px] w-[1072px] overflow-hidden rounded-kit-stage bg-kit-stage text-kit-ink">
              <div className="absolute top-[48px] left-[300px]">
                <Perched state="reading" at="560px">
                  <Desk />
                </Perched>
              </div>
              <div className="absolute top-[96px] left-[92px]">
                <Lock width={320} shown={shown} />
              </div>
            </div>
          )
        }
      </Stage>
    </div>
  )
}
