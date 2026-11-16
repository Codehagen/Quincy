"use client"

/*
 * 35 — A few lines.
 *
 * The quietest of the five. The hero picture is the thread itself, large,
 * with no device around it: Quincy's notes arrive one by one at reading
 * size, the friend (48) as the avatar beside the newest, the person's
 * answers in ink. Connectors sit highest of all, as one line under the
 * button: what it reads, where it posts, what is next.
 *
 * The friend appears twice: the avatar, and resting at the close. Few
 * sections, wide gaps, one picture each. Marks: one handwritten note beside
 * the thread, one on the median.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight02Icon } from "@hugeicons/core-free-icons"

import { PixelFriend } from "@/components/mascot"

import { Hand } from "../round-1/a/marks"
import { Scroll } from "../round-2/b/scroll"
import {
  ArrivingThread,
  BeatLabels,
  Cta,
  DraftBeats,
  DraftCard,
  Footer,
  IdeaList,
  MedianStrip,
  Nevers,
  POSTS_NOW,
  PRICE,
  READS_NEXT,
  READS_NOW,
  StageBox,
  Tile,
  TopBar,
  Waitlist,
} from "./p31-parts"

export function AFewLines() {
  return (
    <Scroll>
      <TopBar right={<span className="text-kit-ink">Join the waitlist</span>} />

      <section className="flex flex-col items-center pt-24 text-center">
        <h1 className="text-[80px] leading-[0.98] font-[600] tracking-[-0.06em]">
          It writes first.
          <span className="block">You send.</span>
        </h1>
        <p className="mt-7 max-w-[46ch] text-[18px] leading-[1.5] text-balance text-kit-ink-muted">
          Quincy is a Head of Content that reads your work and sends you a few lines
          when there is a post in it. Every line ends with your choice.
        </p>
        <div className="mt-9">
          <Cta />
        </div>

        {/* Connectors, as high as they go: one line. */}
        <div className="mt-16 flex items-center gap-3 text-[13px] text-kit-ink-muted">
          <span className="font-[560]">Reads</span>
          {READS_NOW.map((c) => (
            <Tile key={c.id} c={c} size="sm" />
          ))}
          <HugeiconsIcon icon={ArrowRight02Icon} size={16} strokeWidth={1.6} aria-hidden className="mx-1" />
          <span className="font-[560]">Posts to</span>
          {POSTS_NOW.map((c) => (
            <Tile key={c.id} c={c} size="sm" />
          ))}
        </div>
        <p className="mt-3 text-[13px] text-kit-ink-muted">
          Next: {READS_NEXT.map((c) => c.label).join(", ")}.
        </p>
      </section>

      {/* Hero picture: the thread, at reading size, nothing around it. */}
      <section className="relative mx-auto mt-24 w-[1072px] rounded-kit-stage bg-kit-stage px-[236px] pt-16 pb-20">
        <ArrivingThread width={600} avatar={48} state="waiting" size={19} gapMs={1500} onStage />
        <div className="absolute top-[150px] right-[60px] w-[150px]">
          <Hand>it asks. you answer.</Hand>
        </div>
      </section>

      {/* How it works: three plain rows. */}
      <section className="mx-auto mt-40 flex w-[1072px] flex-col gap-28">
        <Plain n="1" title="It finds the ideas." body="From a merged pull request, a voice note, a call or notes you paste in. Two or three each time, named by where they came from.">
          <IdeaList width={500} />
        </Plain>
        <Plain n="2" title="It drafts in three beats." body="What you did, what happened, what it meant. The number on its own line, traced to where it came from.">
          <div className="flex gap-6">
            <div className="pt-1">
              <BeatLabels />
            </div>
            <DraftBeats width={380} />
          </div>
        </Plain>
        <Plain bare n="3" title="It waits for you." body="Approve gives the post a morning in your week. Until you press it, nothing goes out under your name.">
          <div className="w-[500px]">
            <DraftCard />
          </div>
        </Plain>
      </section>

      {/* Numbers */}
      <section className="mt-40 flex flex-col items-center text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Measured against you.</h2>
        <p className="mt-4 max-w-[48ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          Each post is set against your own median. You never see a follower count.
        </p>
        <div className="mt-14 rounded-kit-object bg-kit-object px-10 py-8 text-left shadow-kit-object">
          <MedianStrip width={440} note />
        </div>
      </section>

      <section className="mt-40 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[64px] leading-[1] font-[600] tracking-[-0.055em] tabular-nums">
          {PRICE.figure} {PRICE.period}.
        </h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">One plan. {PRICE.currency}. X and LinkedIn.</p>
        <div className="mt-12">
          <Nevers />
        </div>
      </section>

      <section className="flex flex-col items-center px-[60px] pt-40 pb-32 text-center">
        <PixelFriend state="resting" size={64} />
        <h2 className="mt-8 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Quiet until there is a post.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

function Plain({
  n,
  title,
  body,
  bare = false,
  children,
}: {
  n: string
  title: string
  body: string
  /** The child is its own object (a card); do not wrap it in another. */
  bare?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="grid grid-cols-[380px_1fr] items-center gap-12">
      <div>
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{n}</span>
        <h3 className="mt-2 text-[32px] leading-[1.1] font-[600] tracking-[-0.035em]">{title}</h3>
        <p className="mt-3 text-[16px] leading-[1.6] text-kit-ink-muted">{body}</p>
      </div>
      <StageBox width={640} height={300}>
        {bare ? (
          <div className="absolute inset-0 grid place-items-center">{children}</div>
        ) : (
          <div className="absolute top-[48px] left-[48px] h-[300px] w-[600px] rounded-kit-object bg-kit-object px-7 pt-7 shadow-kit-object">
            {children}
          </div>
        )}
      </StageBox>
    </div>
  )
}
