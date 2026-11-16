"use client"

/*
 * 32 — It texts first.
 *
 * Quincy coming to you is the hero: a phone rises out of the stage with
 * Quincy's thread on it, the messages arriving one by one, the friend as the
 * sender's avatar beside the newest one. Every message ends in two choices;
 * the person's answers are the dark bubbles. Below, each message opens the
 * piece of work it was about, so "how it works" is told as the thread.
 *
 * The friend is large (64) and rare: the avatar in the hero, waiting beside
 * Approve, resting at the close. Connectors come late, just before the
 * price. Marks: one handwritten note beside the phone, one on the median.
 */

import { PixelFriend } from "@/components/mascot"

import { Hand } from "../round-1/a/marks"
import { Scroll } from "../round-2/b/scroll"
import {
  BeatLabels,
  Connectors,
  Cta,
  DraftBeats,
  DraftCard,
  Footer,
  IdeaList,
  MedianStrip,
  MESSAGES,
  Nevers,
  Notice,
  Perch,
  PhoneThread,
  PRICE,
  StageBox,
  TopBar,
  Waitlist,
  Week,
} from "./p31-parts"

export function ItTextsFirst() {
  return (
    <Scroll>
      <TopBar />

      {/* Hero */}
      <section className="flex flex-col items-center pt-16 text-center">
        <h1 className="text-[76px] leading-[1] font-[600] tracking-[-0.058em]">
          Quincy texts you first.
          <span className="block">You decide what goes out.</span>
        </h1>
        <p className="mt-6 max-w-[52ch] text-[18px] leading-[1.5] text-balance text-kit-ink-muted">
          Your Head of Content reads what you merged, said or pasted, then sends
          you a short note when there is a post in it. You answer in a tap.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month</span>
        </div>
      </section>

      {/* Hero picture: the phone rises, the thread arrives. */}
      <StageBox width={1072} height={720} className="mt-20">
        <div className="absolute top-[64px] left-[346px]">
          <PhoneThread width={380} height={820} />
        </div>
        <div className="absolute top-[300px] left-[760px] w-[200px]">
          <svg aria-hidden className="absolute -left-[46px] top-[12px] overflow-visible" width="40" height="20">
            <path d="M38 8 C 26 10, 14 12, 4 12" fill="none" stroke="var(--kit-ink-muted)" strokeWidth="1.25" strokeLinecap="round" />
            <circle cx="2" cy="12" r="2.5" fill="var(--kit-ink-muted)" />
          </svg>
          <Hand>every note ends in your choice</Hand>
        </div>
      </StageBox>

      {/* How it works, told as the thread: each note opens its work. */}
      <section className="mt-36 flex flex-col items-center text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Each note opens the work.</h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          Tap a choice and you land on the thing it is about: the ideas, the draft,
          the week.
        </p>
      </section>

      <Step m={0} caption="Ideas, from what you merged">
        <div className="h-[280px] w-[560px] rounded-kit-object bg-kit-object px-7 pt-6 shadow-kit-object">
          <div className="text-[13px] text-kit-ink-muted">3 ideas from #212</div>
          <div className="mt-3">
            <IdeaList width={506} />
          </div>
        </div>
      </Step>

      <Step m={1} caption="The draft, in three beats">
        <div className="flex h-[300px] w-[560px] gap-6 rounded-kit-object bg-kit-object px-7 pt-6 shadow-kit-object">
          <div className="pt-[34px]">
            <BeatLabels />
          </div>
          <div>
            <div className="text-[13px] text-kit-ink-muted">Draft for LinkedIn</div>
            <div className="mt-4">
              <DraftBeats width={360} />
            </div>
          </div>
        </div>
      </Step>

      <Step m={2} caption="The week, with the post on Wednesday">
        <div className="h-[280px] w-[560px] rounded-kit-object bg-kit-object px-7 pt-6 shadow-kit-object">
          <div className="text-[13px] text-kit-ink-muted">This week</div>
          <div className="mt-2">
            <Week width={506} />
          </div>
        </div>
      </Step>

      {/* Held for your read: the friend looks at the button. */}
      <section className="mt-40 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[56px] leading-[1.05] font-[600] tracking-[-0.05em]">Held for your read.</h2>
        <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          Quincy drafts. You send. A note can ask, and it can wait, but nothing goes
          out under your name until you press Approve.
        </p>
        <Perch state="waiting" size={64} at={340} className="mt-24">
          <div className="w-[600px]">
            <DraftCard />
          </div>
        </Perch>
      </section>

      {/* Numbers */}
      <section className="mx-[60px] mt-36 grid grid-cols-2 gap-16 border-t border-kit-hairline pt-16">
        <div>
          <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">1.6× is against you.</h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-kit-ink-muted">
            When Quincy says a post did well, it means well for you: the post set
            against your own median. You never see a follower count.
          </p>
        </div>
        <MedianStrip width={400} note />
      </section>

      {/* Connectors, late */}
      <section className="mt-36 flex flex-col items-center text-center">
        <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">What it reads, where it posts.</h2>
        <div className="mt-12">
          <Connectors friend={0} nextStyle="line" />
        </div>
      </section>

      {/* Pricing */}
      <section className="mt-36 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[64px] leading-[1] font-[600] tracking-[-0.055em] tabular-nums">
          {PRICE.figure} {PRICE.period}.
        </h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">One plan. {PRICE.currency}. X and LinkedIn.</p>
        <div className="mt-12">
          <Nevers />
        </div>
      </section>

      <section className="flex flex-col items-center px-[60px] pt-36 pb-28 text-center">
        <PixelFriend state="resting" size={64} />
        <h2 className="mt-8 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Quiet until there is something.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

/** A message on the left, the crop it opens on the right, on one stage. */
function Step({ m, caption, children }: { m: number; caption: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto mt-16 grid w-[1072px] grid-cols-[400px_1fr] items-center gap-10">
      <div className="flex flex-col gap-3">
        <Notice m={MESSAGES[m]} width={400} icon={false} showChoices />
        <span className="pl-4 text-[13px] text-kit-ink-muted">→ {caption}</span>
      </div>
      <StageBox width={632} height={300}>
        <div className="absolute top-[48px] left-[36px]">{children}</div>
      </StageBox>
    </div>
  )
}
