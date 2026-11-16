"use client"

/*
 * 31 — On the desk.
 *
 * The nearest to 30, turned light: the same airy centred page, one close-up
 * per section, with Pixel friend sitting on the top edge of every picture in
 * the state that picture is in. Reading over the receipt in the hero, found
 * over the ideas, writing over the draft, waiting beside Approve, resting at
 * the close. The friend is medium (48) and appears on every picture.
 *
 * Connectors sit high, straight after the hero: what it reads, where it
 * posts. Quincy coming to you is one quiet section further down, three
 * notifications in a row. Marks: the highlighted PR line with its note in
 * the hero, and the note on the median. Nothing else is marked.
 */

import { PixelFriend } from "@/components/mascot"

import {
  BeatLabels,
  Connectors,
  Cta,
  Desk,
  DraftActions,
  DraftBeats,
  DraftCard,
  Footer,
  IdeaList,
  MedianStrip,
  MESSAGES,
  Nevers,
  Notice,
  Perch,
  PRICE,
  PrExcerpt,
  Receipt,
  RECEIPT,
  StageBox,
  TopBar,
  Waitlist,
} from "./p31-parts"
import { Scroll } from "../round-2/b/scroll"

export function OnTheDesk() {
  return (
    <Scroll>
      <TopBar />

      {/* Hero */}
      <section className="flex flex-col items-center pt-20 text-center">
        <h1 className="text-[72px] leading-[1.02] font-[600] tracking-[-0.055em]">
          It reads what you ship.
          <span className="block">It waits for your yes.</span>
        </h1>
        <p className="mt-6 max-w-[50ch] text-[18px] leading-[1.5] text-balance text-kit-ink-muted">
          Quincy finds the post in what you merged, said or pasted, and writes it in
          your voice. Then it hands it to you.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month</span>
        </div>
      </section>

      {/* Hero picture: the desk, cropped by the stage's foot, friend reading. */}
      <StageBox width={1072} height={540} className="mt-24">
        <div className="absolute top-[72px] left-[56px] h-[calc(100%+40px)]">
          <Perch state="reading" at={250}>
            <div className="h-[520px]">
              <Desk width={960}>
                <div className="px-10 pt-8">
                  <div className="flex items-center gap-2.5 text-[14px]">
                    <span className="font-[600]">Quincy</span>
                    <span className="font-kit-mono text-[12px] text-kit-ink-muted">Tue 07:40</span>
                  </div>
                  <div className="mt-5">
                    <Receipt size={15} lines={RECEIPT} />
                  </div>
                  <div className="mt-7 w-[520px] rounded-kit-object bg-kit-well px-5 py-4">
                    <PrExcerpt />
                  </div>
                  <div className="mt-6 w-[560px]">
                    <DraftCard />
                  </div>
                </div>
              </Desk>
            </div>
          </Perch>
        </div>
      </StageBox>

      {/* Connectors, high: both sides. */}
      <section className="mt-36 flex flex-col items-center text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">
          It reads where you work.
          <span className="block">It posts where you are.</span>
        </h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          Four ways in today, two ways out. The rest are coming, and they say so.
        </p>
        <div className="mt-14">
          <Connectors friend={0} />
        </div>
      </section>

      {/* How it works: three close-ups, the friend on each. */}
      <Section
        title="It brings you ideas, not a feed."
        body="Two or three from one merge, each named by where it came from. You pick the one worth saying."
      >
        <StageBox height={320}>
          <div className="absolute top-[72px] left-[150px] h-[calc(100%+40px)]">
            <Perch state="found" at={410}>
              <div className="h-[300px] w-[660px] rounded-kit-object bg-kit-object px-8 pt-7 shadow-kit-object">
                <div className="text-[13px] text-kit-ink-muted">3 ideas from #212</div>
                <div className="mt-3">
                  <IdeaList width={596} />
                </div>
              </div>
            </Perch>
          </div>
        </StageBox>
      </Section>

      <Section
        title="It drafts in three beats."
        body="What you did, what happened, what it meant. The number sits on its own line, and you can point at where it came from."
      >
        <StageBox height={360}>
          <div className="absolute top-[72px] left-[150px] h-[calc(100%+40px)]">
            <Perch state="writing" at={540}>
              <div className="flex h-[320px] w-[660px] gap-6 rounded-kit-object bg-kit-object px-8 pt-7 shadow-kit-object">
                <div className="pt-[34px]">
                  <BeatLabels />
                </div>
                <div>
                  <div className="text-[13px] text-kit-ink-muted">Draft for LinkedIn</div>
                  <div className="mt-4">
                    <DraftBeats />
                  </div>
                </div>
              </div>
            </Perch>
          </div>
        </StageBox>
      </Section>

      {/* Then it waits: the friend looks at the button. */}
      <section className="mt-36 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[56px] leading-[1.05] font-[600] tracking-[-0.05em]">Then it waits for you.</h2>
        <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          Quincy drafts. You send. Approve gives the post a morning in your week.
          Until you press it, nothing goes out under your name.
        </p>
        <Perch state="waiting" at={300} className="mt-20">
          <div className="flex items-center gap-6 rounded-kit-object bg-kit-object py-5 pr-6 pl-7 shadow-kit-object">
            <div className="text-left text-[14px] leading-[1.4]">
              <div className="font-[560]">Nobody was upset about the price.</div>
              <div className="text-kit-ink-muted">LinkedIn · Wed 08:30 if you approve</div>
            </div>
            <DraftActions />
          </div>
        </Perch>
      </section>

      {/* Quincy comes to you: one quiet row. */}
      <section className="mt-36 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">It comes to you first.</h2>
        <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">
          You do not open a tool to find out what to post. Quincy writes when it has
          something, and every note ends with your choice.
        </p>
        <div className="mt-14 flex items-start gap-4">
          {MESSAGES.map((m) => (
            <Notice key={m.at} m={m} width={348} showChoices />
          ))}
        </div>
      </section>

      {/* Numbers against your own median. */}
      <section className="mx-[60px] mt-36 grid grid-cols-2 gap-16 border-t border-kit-hairline pt-16">
        <div>
          <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">It counts against you.</h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-kit-ink-muted">
            A feed judges the post, not the account. So each post is set against your
            own median, and you never see a follower count.
          </p>
        </div>
        <MedianStrip width={400} note />
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

      {/* CTA: resting. */}
      <section className="flex flex-col items-center px-[60px] pt-36 pb-28 text-center">
        <PixelFriend state="resting" size={64} />
        <h2 className="mt-8 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Nothing goes out without you.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

function Section({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="mt-36 flex flex-col items-center text-center">
      <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">{title}</h2>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-balance text-kit-ink-muted">{body}</p>
      <div className="mt-14 w-full">{children}</div>
    </section>
  )
}
