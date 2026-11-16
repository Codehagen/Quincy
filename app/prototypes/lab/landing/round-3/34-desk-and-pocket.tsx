"use client"

/*
 * 34 — Desk and pocket.
 *
 * The hero is a pair: the desk window with the draft open, and a phone
 * standing over its left edge with Quincy's notes landing on the lock screen
 * one by one, the newest on top, the friend as the app's own icon. The note
 * is in your pocket; the work is on your desk.
 *
 * Proactive is loud in the hero and comes back once, beside the number
 * ("Posted at 08:30. 1.6× your median."). How it works is a strip of five
 * small stages. Connectors come late as the two-sided picture with the
 * friend reading between them. Marks: the highlighted number in the draft
 * with its note, and the note on the median.
 */

import { PixelFriend } from "@/components/mascot"

import { Hl, Margin } from "../round-1/a/marks"
import { Scroll } from "../round-2/b/scroll"
import {
  Arrives,
  Connectors,
  Cta,
  Desk,
  DraftActions,
  Footer,
  IDEAS,
  LockNotice,
  MedianStrip,
  MESSAGES,
  Nevers,
  Notice,
  PhoneShot,
  PRICE,
  Receipt,
  RECEIPT,
  StageBox,
  TopBar,
  useArrival,
  Waitlist,
  WEEK,
} from "./p31-parts"

export function DeskAndPocket() {
  const morning = MESSAGES.slice(0, 2)
  const [ref, shown] = useArrival<HTMLDivElement>(morning.length, 1800)

  return (
    <Scroll>
      <TopBar />

      <section className="flex flex-col items-center pt-16 text-center">
        <h1 className="text-[72px] leading-[1.02] font-[600] tracking-[-0.055em]">
          It finds the post.
          <span className="block">It brings it to you.</span>
        </h1>
        <p className="mt-6 max-w-[52ch] text-[18px] leading-[1.5] text-balance text-kit-ink-muted">
          Quincy reads what you merged, said or pasted, and writes to you when there
          is something worth posting. The draft waits on your desk until you say yes.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month</span>
        </div>
      </section>

      {/* Hero: desk and pocket. The phone straddles the window's left edge. */}
      <StageBox width={1072} height={540} className="mt-20">
        <div className="absolute top-[64px] left-[320px] h-[560px]">
          <Desk width={720} active="Studio">
            <div className="px-9 pt-7">
              <div className="flex items-center gap-2 text-[13px] text-kit-ink-muted">
                Draft for LinkedIn · held for your read
              </div>
              <div className="mt-5 flex w-[300px] flex-col gap-4 text-[16px] leading-[1.5]">
                <p>We started sending invoices in our customers&apos; own currency.</p>
                <Margin note="from #212, you can check it" gap={24} width={150}>
                  <div>
                    <p>Currency tickets the next week:</p>
                    <p className="mt-0.5 text-[28px] leading-[1.2] font-[600] tabular-nums">
                      <Hl sweep delay={400}>27 → 2</Hl>
                    </p>
                  </div>
                </Margin>
                <p>Nobody was upset about the price. They could not read the bill.</p>
              </div>
              <div className="mt-7 flex items-center gap-4">
                <DraftActions />
                <span className="font-kit-mono text-[12px] text-kit-ink-muted">Wed 08:30 if you approve</span>
              </div>
            </div>
          </Desk>
        </div>
        <div className="absolute top-[96px] left-[70px]">
          <PhoneShot width={340} height={720} time="07:52">
            <div ref={ref} className="flex flex-col gap-2">
              {[...morning].reverse().map((m) => {
                const i = morning.indexOf(m)
                return (
                  <Arrives key={m.at} on={i < shown}>
                    <LockNotice m={m} />
                  </Arrives>
                )
              })}
            </div>
          </PhoneShot>
        </div>
      </StageBox>

      {/* How it works: five small stages in a row. */}
      <section className="mx-16 mt-36">
        <h2 className="text-center text-[44px] leading-[1.05] font-[600] tracking-[-0.045em]">Five steps, one of them yours.</h2>
        <div className="mt-14 grid grid-cols-5 gap-3">
          <Strip n="1" label="It reads">
            <Receipt size={12} lines={RECEIPT.slice(0, 2)} />
          </Strip>
          <Strip n="2" label="It writes to you">
            <p className="text-[12px] leading-[1.4]">{MESSAGES[0].text}</p>
          </Strip>
          <Strip n="3" label="It finds ideas">
            <div className="flex flex-col gap-1 text-[12px] leading-[1.35]">
              {IDEAS.map((idea, i) => (
                <div key={idea.title} className={`rounded-[8px] px-2 py-1.5 ${i === 1 ? "bg-kit-well font-[560]" : "text-kit-ink-muted"}`}>
                  {idea.title}
                </div>
              ))}
            </div>
          </Strip>
          <Strip n="4" label="You approve" yours>
            <p className="text-[12px] leading-[1.4] font-[560]">Nobody was upset about the price.</p>
            <div className="mt-3 flex gap-1 text-[12px] font-[560]">
              <span className="inline-flex h-7 items-center rounded-[8px] bg-kit-action px-2.5 text-kit-action-on">Approve</span>
              <span className="inline-flex h-7 items-center rounded-[8px] bg-kit-control px-2.5 shadow-kit-control">Edit</span>
            </div>
          </Strip>
          <Strip n="5" label="It fills your week">
            <div className="flex flex-col text-[12px] leading-[1.35]">
              {WEEK.map((d) => (
                <div key={d.day} className="flex gap-2 border-b border-kit-hairline py-1.5 last:border-0">
                  <span className="w-7 flex-none font-kit-mono text-[10px] text-kit-ink-muted">{d.day}</span>
                  <span className={`truncate ${d.state === "approved" ? "font-[560]" : "text-kit-ink-muted"}`}>{d.what}</span>
                </div>
              ))}
            </div>
          </Strip>
        </div>
      </section>

      {/* The note after, beside the number. */}
      <section className="mx-16 mt-36 grid grid-cols-[1fr_1fr] items-center gap-16">
        <div>
          <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">It tells you how it went. Against you.</h2>
          <p className="mt-5 text-[17px] leading-[1.6] text-kit-ink-muted">
            The day after, a short note: the post against your own median. No follower
            count, no chart of the crowd.
          </p>
          <div className="mt-8">
            <Notice m={MESSAGES[2]} width={440} showChoices />
          </div>
        </div>
        <div className="rounded-kit-stage bg-kit-stage px-10 py-10">
          <div className="rounded-kit-object bg-kit-object px-7 py-6 shadow-kit-object">
            <MedianStrip width={300} note />
          </div>
        </div>
      </section>

      {/* Connectors, late, with the friend reading between the two sides. */}
      <section className="mt-36 flex flex-col items-center text-center">
        <h2 className="text-[44px] leading-[1.05] font-[600] tracking-[-0.045em]">It reads where you work.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Four sources today. X and LinkedIn out. More are next, and labelled so.</p>
        <div className="mt-14">
          <Connectors friend={48} />
        </div>
      </section>

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
        <PixelFriend state="resting" size={48} />
        <h2 className="mt-7 text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Nothing goes out without you.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

function Strip({ n, label, yours = false, children }: { n: string; label: string; yours?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <div className="relative h-[170px] overflow-hidden rounded-kit-stage bg-kit-stage">
        <div className="absolute top-6 left-5 h-[180px] w-[170px] rounded-kit-object bg-kit-object p-4 shadow-kit-object">
          {children}
        </div>
      </div>
      <div className="mt-3 flex items-baseline gap-2 text-[14px]">
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{n}</span>
        <span className={yours ? "font-[600]" : "font-[520]"}>{label}</span>
      </div>
    </div>
  )
}
