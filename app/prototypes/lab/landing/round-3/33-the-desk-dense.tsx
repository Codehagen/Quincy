"use client"

/*
 * 33 — The desk, dense.
 *
 * The working version: tighter type, more on each screen, two columns most
 * of the way down. The hero is the desk window with Quincy's notes arriving
 * in the Studio thread on the left and the draft they point to on the right,
 * so the message and the work are one picture. The friend is small (16, as
 * the avatar) and lives only where the product would put it, plus once at
 * the close.
 *
 * Connectors sit high as a register right under the hero: reads, posts,
 * next, with what each hands over. Marks: the highlighted number in the
 * draft with its note, and the note on the median.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Linkedin01Icon } from "@hugeicons/core-free-icons"

import { PixelFriend } from "@/components/mascot"

import { Hl, Margin } from "../round-1/a/marks"
import { Scroll } from "../round-2/b/scroll"
import {
  ArrivingThread,
  Cta,
  Desk,
  DraftActions,
  Footer,
  IdeaList,
  MedianStrip,
  Nevers,
  POSTS_NOW,
  PRICE,
  PrExcerpt,
  READS_NEXT,
  READS_NOW,
  Receipt,
  RECEIPT,
  Row,
  StageBox,
  TopBar,
  Waitlist,
  Week,
} from "./p31-parts"

export function TheDeskDense() {
  return (
    <Scroll>
      <TopBar />

      {/* Hero: headline left, one line right. */}
      <section className="mx-16 grid grid-cols-[1.5fr_1fr] items-end gap-16 pt-14">
        <h1 className="text-[60px] leading-[1.02] font-[600] tracking-[-0.05em] text-balance">
          Your Head of Content writes to you first.
        </h1>
        <div>
          <p className="text-[17px] leading-[1.55] text-kit-ink-muted">
            Quincy reads what you merge, record and paste. When there is a post in
            it, it tells you, drafts it in your voice and holds it until you say yes.
          </p>
          <div className="mt-6 flex items-center gap-4">
            <Cta size="md" />
            <span className="text-[14px] text-kit-ink-muted">$49 a month, one plan</span>
          </div>
        </div>
      </section>

      {/* Hero picture: the thread and the draft, side by side on the desk. */}
      <StageBox width={1072} height={650} className="mt-14">
        <div className="absolute top-[48px] left-[40px] h-[680px]">
          <Desk width={992}>
            <div className="grid h-full grid-cols-[1fr_380px]">
              <div className="px-7 pt-6">
                <div className="text-[13px] text-kit-ink-muted">Studio · today</div>
                <div className="mt-2">
                  <ArrivingThread width={380} avatar={28} state="waiting" size={14} gapMs={1200} />
                </div>
              </div>
              <div className="border-l border-kit-hairline bg-kit-ground px-6 pt-6">
                <div className="flex items-center gap-2 text-[13px] text-kit-ink-muted">
                  <HugeiconsIcon icon={Linkedin01Icon} size={14} strokeWidth={1.8} aria-hidden />
                  Draft for LinkedIn · held for your read
                </div>
                <div className="mt-4 flex w-[230px] flex-col gap-3 text-[14px] leading-[1.5]">
                  <p>We started sending invoices in our customers&apos; own currency.</p>
                  <Margin note="you can check this" gap={16} width={96}>
                    <div>
                      <p>Currency tickets the next week:</p>
                      <p className="mt-0.5 text-[24px] leading-[1.2] font-[600] tabular-nums">
                        <Hl sweep delay={600}>27 → 2</Hl>
                      </p>
                    </div>
                  </Margin>
                  <p>Nobody was upset about the price. They could not read the bill.</p>
                </div>
                <div className="mt-5">
                  <DraftActions />
                </div>
                <div className="mt-2 font-kit-mono text-[11px] text-kit-ink-muted">Wed 08:30 if you approve</div>
              </div>
            </div>
          </Desk>
        </div>
      </StageBox>

      {/* Connectors register, high. */}
      <section className="mx-16 mt-24 grid grid-cols-[280px_1fr_1fr_1fr] gap-10 border-t border-kit-hairline pt-10">
        <div>
          <h2 className="text-[26px] leading-[1.15] font-[600] tracking-[-0.03em]">Reads four things. Posts to two.</h2>
          <p className="mt-3 text-[14px] leading-[1.55] text-kit-ink-muted">
            A source is listed when it works. The rest are marked next.
          </p>
        </div>
        <Col title="Reads today">
          {READS_NOW.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </Col>
        <Col title="Posts to">
          {POSTS_NOW.map((c) => (
            <Row key={c.id} c={c} />
          ))}
        </Col>
        <Col title="Next">
          <ul className="flex flex-col gap-1.5 pt-2 text-[14px] text-kit-ink-muted">
            {READS_NEXT.map((c) => (
              <li key={c.id}>{c.label}</li>
            ))}
          </ul>
        </Col>
      </section>

      {/* How it works: four crops in a row. */}
      <section className="mx-16 mt-28">
        <h2 className="text-[36px] leading-[1.1] font-[600] tracking-[-0.04em]">From a merge to a morning in your week.</h2>
        <div className="mt-10 grid grid-cols-2 gap-5">
          <Crop n="1" title="It reads" body="Merged pull requests, voice notes, calls and pasted notes. It shows what it did.">
            <Receipt size={14} lines={RECEIPT} />
            <p className="mt-5 border-t border-kit-hairline pt-4 text-[14px] leading-[1.55]">
              One for X, one for LinkedIn. Nothing went out. They are on your desk when
              you want them.
            </p>
          </Crop>
          <Crop n="2" title="It finds the line" body="The one sentence with something true in it.">
            <PrExcerpt marked={false} note={false} />
          </Crop>
          <Crop n="3" title="It finds ideas" body="Two or three per merge, named by where they came from.">
            <IdeaList width={440} />
          </Crop>
          <Crop n="4" title="It fills your week" body="Approved posts get a morning. Open days stay open.">
            <Week width={440} />
          </Crop>
        </div>
      </section>

      {/* Numbers and the rule, side by side. */}
      <section className="mx-16 mt-28 grid grid-cols-2 gap-5">
        <div className="rounded-kit-stage bg-kit-stage px-9 py-8">
          <h3 className="text-[22px] leading-[1.2] font-[600] tracking-[-0.02em]">Counted against your own median</h3>
          <p className="mt-2 text-[14px] leading-[1.55] text-kit-ink-muted">
            A feed judges the post, not the account, so that is what Quincy measures.
            No follower chart.
          </p>
          <div className="mt-7 rounded-kit-object bg-kit-object px-6 py-5 shadow-kit-object">
            <MedianStrip width={340} note />
          </div>
        </div>
        <div className="rounded-kit-stage bg-kit-stage px-9 py-8">
          <h3 className="text-[22px] leading-[1.2] font-[600] tracking-[-0.02em]">It drafts. You send.</h3>
          <p className="mt-2 text-[14px] leading-[1.55] text-kit-ink-muted">
            A note can ask. It can wait. It cannot post for you. Autoposting would have
            to be a choice you make on purpose.
          </p>
          <div className="mt-7 flex flex-col gap-2">
            {["Approve", "Edit", "Not today"].map((x, i) => (
              <div
                key={x}
                className="flex items-center justify-between rounded-kit-object bg-kit-object px-5 py-3.5 text-[14px] shadow-kit-object"
              >
                <span className="font-[560]">{x}</span>
                <span className="text-kit-ink-muted">
                  {i === 0 ? "Goes out Wed 08:30" : i === 1 ? "You change the words" : "It waits, nothing goes out"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing: price left, the nevers right. */}
      <section className="mx-16 mt-28 grid grid-cols-[1fr_1.6fr] gap-16 border-t border-kit-hairline pt-12">
        <div>
          <div className="text-[64px] leading-[1] font-[600] tracking-[-0.055em] tabular-nums">{PRICE.figure}</div>
          <div className="mt-2 text-[16px] text-kit-ink-muted">
            {PRICE.period}. One plan. {PRICE.currency}.
          </div>
        </div>
        <Nevers width={640} />
      </section>

      <section className="mx-16 mt-28 mb-24 flex items-center justify-between rounded-kit-stage bg-kit-stage px-12 py-10">
        <div className="flex items-center gap-5">
          <PixelFriend state="resting" size={48} />
          <div>
            <h2 className="text-[28px] leading-[1.1] font-[600] tracking-[-0.03em]">Nothing goes out without you.</h2>
            <p className="mt-1 text-[15px] text-kit-ink-muted">Invites go out in small groups.</p>
          </div>
        </div>
        <Waitlist />
      </section>

      <Footer />
    </Scroll>
  )
}

function Col({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-[560] text-kit-ink-muted">{title}</div>
      <div className="mt-1 flex flex-col">{children}</div>
    </div>
  )
}

function Crop({ n, title, body, children }: { n: string; title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="relative h-[330px] overflow-hidden rounded-kit-stage bg-kit-stage px-8 pt-7">
      <div className="flex items-baseline gap-3">
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{n}</span>
        <span className="text-[17px] font-[600] tracking-[-0.01em]">{title}</span>
      </div>
      <p className="mt-1 pl-[22px] text-[14px] text-kit-ink-muted">{body}</p>
      <div className="absolute top-[110px] left-8 h-[260px] w-[476px] rounded-kit-object bg-kit-object px-5 pt-5 shadow-kit-object">
        {children}
      </div>
    </div>
  )
}
