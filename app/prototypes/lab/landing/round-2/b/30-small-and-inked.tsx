"use client"

/*
 * 30 — Small and inked.
 *
 * Grows from 02's ink blob beside the receipt, made the page's one character
 * (after round 1's c/blob.tsx and a reference's friendly agents). Quincy is a
 * small ink shape with two dot eyes that peeks over the edge of each product
 * picture and looks at the thing that matters on it: the highlighted line,
 * the chosen idea, the beats, and then at you, beside Approve. At the end of
 * the page it is asleep: nothing goes out without you.
 *
 * The page is the airiest of the five: big centred type, one close-up per
 * section, lots of dark ground. Pictures after Stageshow's close-up and
 * pinned bottom bleed: one object, cut by its stage's foot, the subject
 * whole.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon, Linkedin01Icon } from "@hugeicons/core-free-icons"

import { Hand, Hl, Margin, Ring } from "../../round-1/a/marks"
import { Bars, Cta, DraftActions, Footer, PRICE, Receipt, REFUSALS } from "./bits"
import { Ink, type Look } from "./ink"
import { Scroll } from "./scroll"

export function SmallAndInked() {
  return (
    <Scroll dark>
      <div className="flex h-[84px] items-center justify-between px-16 text-[15px]">
        <span className="flex items-center gap-2 font-[600] tracking-[-0.01em]">
          <Ink size={22} look="right" />
          Quincy
        </span>
        <span className="flex items-center gap-6 text-kit-ink-muted">
          <span>Pricing</span>
          <span className="text-kit-ink">Join the waitlist</span>
        </span>
      </div>

      {/* Hero */}
      <section className="flex flex-col items-center pt-20 text-center">
        <Ink size={64} look="down" />
        <h1 className="mt-8 text-[72px] leading-[1.02] font-[600] tracking-[-0.055em]">
          It reads what you ship.
          <span className="block">It waits for your yes.</span>
        </h1>
        <p className="mt-6 max-w-[50ch] text-[18px] leading-[1.5] text-kit-ink-muted text-balance">
          Quincy finds the post in what you merged, said or pasted, and writes it
          in your voice. Then it hands it to you.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month</span>
        </div>
      </section>

      {/* Hero picture: Quincy's message, close up, with Quincy peeking over it. */}
      <Picture className="mt-24" height={420} look="down-left" peekAt={560}>
        <div className="w-[660px] px-8 pt-7">
          <div className="flex items-center gap-2.5">
            <Ink size={24} look="you" />
            <span className="text-[15px] font-[600]">Quincy</span>
            <span className="font-kit-mono text-[12px] text-kit-ink-muted">Friday 16:52</span>
          </div>
          <div className="mt-6">
            <Receipt
              size={16}
              lines={[
                ["Read #212", "4 paragraphs"],
                ["Found the number", "27 tickets to 2"],
                ["Drafted", "2 posts, held for your read"],
              ]}
            />
          </div>
          <p className="mt-6 text-[16px] leading-[1.55]">
            One for X, one for LinkedIn. Nothing went out. They are on your desk
            when you want them.
          </p>
          <div className="mt-6 flex items-center justify-between rounded-kit-control bg-kit-well py-3 pr-3 pl-4">
            <div className="text-[14px] leading-[1.4]">
              <div className="font-[560]">Nobody was upset about the price.</div>
              <div className="text-kit-ink-muted">Draft for LinkedIn</div>
            </div>
            <DraftActions />
          </div>
        </div>
      </Picture>

      {/* Three close-ups, each with Quincy looking at what it found. */}
      <Section
        title="It reads what you merged."
        body="A pull request, a voice note from a walk, notes you paste in. It looks for the one line with something true in it."
      >
        <Picture height={340} look="down-left" peekAt={520}>
          <div className="w-[640px] px-8 pt-7">
            <div className="flex items-center gap-2 font-kit-mono text-[12px] text-kit-ink-muted">
              <HugeiconsIcon icon={GitMergeIcon} size={14} strokeWidth={2} aria-hidden />
              #212 · merged Friday 16:40
            </div>
            <div className="mt-2 text-[19px] font-[600] tracking-[-0.01em]">Send invoices in the customer&apos;s own currency</div>
            <p className="mt-4 w-[460px] text-[15px] leading-[1.6] text-kit-ink-muted">
              Every invoice went out in USD, wherever the customer was.{" "}
              <span className="text-kit-ink">
                <Hl>Currency tickets since Monday: 2. The week before: 27.</Hl>
              </span>
            </p>
            <div className="mt-5 w-[460px]">
              <Bars widths={[88, 66, 74]} />
            </div>
          </div>
        </Picture>
      </Section>

      <Section
        title="It brings you ideas, not a feed."
        body="Two or three from one merge, each named by where it came from. You pick the one worth saying."
      >
        <Picture height={320} look="down" peekAt={330}>
          <div className="w-[640px] px-8 pt-7">
            <div className="text-[13px] text-kit-ink-muted">3 ideas from #212</div>
            <div className="mt-4 flex flex-col gap-1 text-[15px] leading-[1.45]">
              <div className="flex items-center justify-between rounded-kit-control bg-kit-well px-4 py-3.5">
                <Ring tone="pen">Nobody was upset about the price.</Ring>
                <span className="rounded-kit-control bg-kit-control px-3 py-1.5 text-[13px] font-[560] shadow-kit-control">
                  Draft this idea
                </span>
              </div>
              <div className="rounded-kit-control px-4 py-3.5">Why old invoices stay in dollars</div>
              <div className="px-4 py-3.5">
                <Bars widths={[54]} />
              </div>
            </div>
          </div>
        </Picture>
      </Section>

      <Section
        title="It drafts in three beats."
        body="What you did, what happened, what it meant. The number sits on its own line, and it is a number you can point at."
      >
        <Picture height={340} look="down-right" peekAt={140}>
          <div className="w-[640px] px-8 pt-7">
            <div className="flex items-center gap-2 text-[13px] text-kit-ink-muted">
              <HugeiconsIcon icon={Linkedin01Icon} size={14} strokeWidth={2} aria-hidden />
              Draft for LinkedIn
            </div>
            <div className="mt-5 flex w-[340px] flex-col gap-4 text-[15px] leading-[1.5]">
              <Margin note="did" tone="pen" gap={20} width={130}>
                <p>We started sending invoices in our customers&apos; own currency.</p>
              </Margin>
              <Margin note="happened" tone="pen" gap={20} width={130}>
                <div>
                  <p>Currency tickets the next week:</p>
                  <p className="mt-1 text-[26px] leading-[1.2] font-[600] tabular-nums">27 → 2</p>
                </div>
              </Margin>
              <Margin note="meant" tone="pen" gap={20} width={130}>
                <p>Nobody was upset about the price. They could not read the bill.</p>
              </Margin>
            </div>
          </div>
        </Picture>
      </Section>

      {/* Then it waits: the one section where it looks at you. */}
      <section className="mt-36 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[56px] leading-[1.05] font-[600] tracking-[-0.05em]">Then it waits for you.</h2>
        <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-kit-ink-muted text-balance">
          Quincy drafts. You send. Approve gives the post a morning in your week.
          Until you press it, nothing goes out under your name.
        </p>
        <div className="relative mt-14 flex items-center gap-6 rounded-kit-object bg-kit-object py-5 pr-6 pl-7 shadow-kit-object">
          <div className="text-left text-[14px] leading-[1.4]">
            <div className="font-[560]">Nobody was upset about the price.</div>
            <div className="text-kit-ink-muted">LinkedIn · Monday 08:00 if you approve</div>
          </div>
          <DraftActions />
          <span className="absolute -top-[51px] right-[30px]">
            <Ink size={52} look="you" />
          </span>
          <span className="absolute top-[-40px] right-[-96px]">
            <Hand>your call</Hand>
          </span>
        </div>
      </section>

      {/* Numbers against your own median. No character: this one is plain. */}
      <section className="mx-[60px] mt-36 grid grid-cols-2 gap-16 border-t border-kit-hairline pt-16">
        <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">It counts against you, not the crowd.</h2>
        <div>
          <p className="text-[17px] leading-[1.6] text-kit-ink-muted">
            A feed judges the post, not the account. So each post is set against
            your own median, and you never see a follower count.
          </p>
          <div className="mt-8 flex items-baseline gap-3 rounded-kit-object bg-kit-object px-6 py-5 shadow-kit-object">
            <span className="text-[32px] leading-[1] font-[600] tracking-[-0.03em] tabular-nums">3.3×</span>
            <span className="text-[15px] text-kit-ink-muted">your median replies, for the invoice post</span>
          </div>
        </div>
      </section>

      {/* Depth, as an aim: it looks at who keeps coming back. */}
      <section className="mx-[60px] mt-24 grid grid-cols-2 gap-16">
        <div className="flex items-center justify-center gap-3 rounded-kit-stage bg-kit-stage px-10 py-10">
          <Ink size={40} look="right" />
          <div className="flex -space-x-2" aria-hidden>
            {[0, 1, 2, 3, 4].map((i) => (
              <span key={i} className="size-10 rounded-full border-2 border-kit-stage bg-kit-object" />
            ))}
          </div>
          <span className="ml-2 text-[14px] text-kit-ink-muted">the people who reply</span>
        </div>
        <div className="flex flex-col justify-center">
          <h3 className="text-[24px] leading-[1.25] font-[600] tracking-[-0.02em]">Next, it learns who keeps showing up.</h3>
          <p className="mt-3 text-[16px] leading-[1.6] text-kit-ink-muted">
            Views are rented. The people who reply are yours. A drafted reply for
            each of them is what we are building toward. It is not built yet.
          </p>
        </div>
      </section>

      {/* Pricing */}
      <section className="mt-36 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[64px] leading-[1] font-[600] tracking-[-0.055em] tabular-nums">
          {PRICE.figure} {PRICE.period}.
        </h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">
          One plan. {PRICE.currency}. X and LinkedIn.
        </p>
        <ul className="mt-12 flex w-[640px] flex-col text-left">
          {REFUSALS.map((r) => (
            <li key={r.never} className="grid grid-cols-[1fr_1.3fr] gap-8 border-t border-kit-hairline py-5">
              <span className="text-[16px] font-[560]">{r.never}</span>
              <span className="text-[14px] leading-[1.55] text-kit-ink-muted">{r.because}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* CTA: asleep. */}
      <section className="flex flex-col items-center px-[60px] pt-36 pb-28 text-center">
        <Ink size={56} asleep />
        <h2 className="mt-8 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Nothing goes out without you.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Cta />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

/** A section: centred two-beat title and one line, then its picture. */
function Section({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <section className="mt-36 flex flex-col items-center text-center">
      <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">{title}</h2>
      <p className="mt-4 max-w-[52ch] text-[17px] leading-[1.55] text-kit-ink-muted text-balance">{body}</p>
      <div className="mt-14 w-full">{children}</div>
    </section>
  )
}

/**
 * A close-up on a stage: one object pinned to the stage's foot, and Quincy
 * peeking over its top edge at `peekAt` px from the object's left, looking
 * at what matters. The object sits in front, so Quincy is half behind it.
 */
function Picture({
  children,
  height,
  look,
  peekAt,
  className,
}: {
  children: React.ReactNode
  height: number
  look: Look
  peekAt: number
  className?: string
}) {
  return (
    <div
      className={`relative mx-auto w-[880px] overflow-hidden rounded-kit-stage bg-kit-stage ${className ?? ""}`}
      style={{ height }}
    >
      <div className="absolute top-[64px] left-[110px] h-[calc(100%+40px)] w-[660px]">
        <span className="absolute -top-[40px]" style={{ left: peekAt }}>
          <Ink size={56} look={look} />
        </span>
        <div className="relative h-full overflow-hidden rounded-kit-object bg-kit-object text-left shadow-kit-object">
          {children}
        </div>
      </div>
    </div>
  )
}
