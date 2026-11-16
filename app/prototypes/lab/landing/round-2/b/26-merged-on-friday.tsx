"use client"

/*
 * 26 — Merged on Friday. Fully dark, the classic long page.
 *
 * Grows from 02: the hero picture is a merged pull request with every editor
 * mark on it (graphite margin notes, the yellow highlighter, a ring round the
 * number) next to Quincy's checked receipt, ending on "held for your read".
 * Below it the same pull request is followed step by step, each step a
 * cropped picture on a grey stage, alternating sides. Product pictures follow
 * Stageshow: one object per stage, corner bleed, real words only on the
 * subject, filler bars at the edges.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon, Mic01Icon, Note01Icon } from "@hugeicons/core-free-icons"

import { Hl, Margin, Ring } from "../../round-1/a/marks"
import { Bars, Chrome, Cta, DraftActions, Footer, PRICE, Receipt, REFUSALS, TopLine } from "./bits"
import { Scroll } from "./scroll"

export function MergedOnFriday() {
  return (
    <Scroll dark>
      <TopLine />

      {/* Hero */}
      <section className="flex flex-col items-center pt-16 text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.055em]">You merge it. Quincy drafts it.</h1>
        <p className="mt-6 max-w-[52ch] text-[18px] leading-[1.5] text-kit-ink-muted text-balance">
          Quincy reads the pull requests you merge, finds the post in them and
          writes it in your voice. Nothing goes out until you send it.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      {/* The hero picture: one window, cut by the section rule under it. */}
      <div className="relative mx-[60px] mt-16 h-[500px] overflow-hidden border-b border-kit-hairline">
        <div className="absolute inset-x-0 top-0 flex h-[660px] flex-col overflow-hidden rounded-t-[22px] bg-kit-object shadow-kit-object">
          <Chrome url="hirequincy.com/studio" />
          <div className="flex flex-1">
            {/* The pull request, as Quincy read it. */}
            <div className="w-[700px] flex-none px-10 pt-8">
              <div className="flex items-center gap-3 font-kit-mono text-[12px] text-kit-ink-muted">
                <HugeiconsIcon icon={GitMergeIcon} size={14} strokeWidth={2} aria-hidden />
                <span>#212</span>
                <span>merged Friday 16:40</span>
                <span>+184 −61</span>
              </div>
              <div className="mt-3 text-[20px] leading-[1.3] font-[600] tracking-[-0.015em]">
                Send invoices in the customer&apos;s own currency
              </div>
              <div className="mt-5 flex w-[450px] flex-col gap-4 text-[15px] leading-[1.6]">
                <Margin note="skip this, they weren't there" gap={24} width={180}>
                  <p className="text-kit-ink-muted">
                    Every invoice went out in USD, wherever the customer was.
                    Support got a currency ticket most days, mostly from people
                    who thought they had been charged twice.
                  </p>
                </Margin>
                <Margin note="what you did" gap={24} width={180}>
                  <p>This sends the invoice in the billing country&apos;s currency. Old invoices stay as they were.</p>
                </Margin>
                <Margin note="what happened" gap={24} width={180}>
                  <p>
                    <Hl>
                      Currency tickets since Monday:{" "}
                      <span className="mr-1 ml-2">
                        <Ring>2</Ring>
                      </span>
                    </Hl>{" "}
                    The week before: 27.
                  </p>
                </Margin>
                <Margin note="what it meant" gap={24} width={180}>
                  <p>Nobody was upset about the price. They could not read the bill.</p>
                </Margin>
              </div>
              <div className="mt-8 w-[450px]">
                <Bars widths={[92, 70, 84, 48]} />
              </div>
            </div>

            {/* Quincy's receipt. */}
            <div className="flex-1 border-l border-kit-hairline px-8 pt-8">
              <div className="flex items-baseline gap-2.5">
                <span className="text-[14px] font-[600]">Quincy</span>
                <span className="font-kit-mono text-[12px] text-kit-ink-muted">Friday 16:52</span>
              </div>
              <div className="mt-5">
                <Receipt
                  lines={[
                    ["Read #212", "4 paragraphs"],
                    ["Found the number", "27 tickets to 2"],
                    ["Cut the backstory", "it reads fine without it"],
                    ["Drafted", "2 posts, held for your read"],
                  ]}
                />
              </div>
              <p className="mt-6 text-[15px] leading-[1.55]">
                One for X, one for LinkedIn. Nothing went out. Want the LinkedIn
                one on Monday morning?
              </p>
              <div className="mt-6 rounded-kit-object bg-kit-well px-4 py-3 text-[14px] text-kit-ink-muted">
                Reply to Quincy
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* How it works */}
      <section className="px-[60px] pt-28">
        <h2 className="text-center text-[44px] leading-[1.1] font-[600] tracking-[-0.04em]">
          It does the work. You keep the yes.
        </h2>
        <p className="mx-auto mt-4 max-w-[52ch] text-center text-[17px] leading-[1.55] text-kit-ink-muted text-balance">
          The same pull request, followed from the merge to the morning it goes out.
        </p>

        <div className="mt-20 flex flex-col gap-24">
          <Step
            n="1"
            title="Bring what you already have."
            body="A pull request you merged, a voice note from a walk, notes you paste in. Quincy takes them as they are. You never fill in a form about yourself."
          >
            <div className="absolute top-10 left-10 min-h-[300px] w-[620px] rounded-kit-object bg-kit-object p-2 shadow-kit-object">
              {[
                { icon: GitMergeIcon, label: "#212 merged", meta: "Send invoices in the customer's own currency", on: true },
                { icon: Mic01Icon, label: "Voice note", meta: "2 min 14 s, Tuesday on a walk" },
                { icon: Note01Icon, label: "Pasted notes", meta: "launch notes" },
              ].map((r) => (
                <div
                  key={r.label}
                  data-on={r.on || undefined}
                  className="flex items-center gap-3 rounded-kit-control px-3 py-3 text-[14px] data-on:bg-kit-well"
                >
                  <span className="grid size-8 place-items-center rounded-full bg-kit-control shadow-kit-control">
                    <HugeiconsIcon icon={r.icon} size={15} strokeWidth={2} aria-hidden />
                  </span>
                  <span className="font-[560]">{r.label}</span>
                  <span className="text-kit-ink-muted">{r.meta}</span>
                </div>
              ))}
              <div className="flex flex-col gap-5 px-3 pt-4 pb-4">
                <Bars widths={[54, 38]} />
                <Bars widths={[46, 30]} />
              </div>
            </div>
          </Step>

          <Step
            n="2"
            flip
            title="It finds the ideas in it."
            body="Usually two or three in one merge. Each idea is named by where it came from, so you can always go back to what you said."
          >
            <div className="absolute top-10 left-10 min-h-[300px] w-[620px] rounded-kit-object bg-kit-object px-6 pt-5 pb-8 shadow-kit-object">
              <div className="text-[13px] text-kit-ink-muted">3 ideas from #212</div>
              <div className="mt-4 rounded-kit-control bg-kit-well px-4 py-3.5">
                <p className="text-[15px] leading-[1.5]">
                  <Hl>Nobody was upset about the price. They could not read the bill.</Hl>
                </p>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[13px] text-kit-ink-muted">From the third paragraph</span>
                  <span className="rounded-kit-control bg-kit-control px-3 py-1.5 text-[13px] font-[560] shadow-kit-control">
                    Draft this idea
                  </span>
                </div>
              </div>
              <div className="mt-2 rounded-kit-control px-4 py-3.5 text-[15px]">Why old invoices stay in dollars</div>
              <div className="mt-1 px-4 py-3">
                <Bars widths={[62]} />
              </div>
            </div>
          </Step>

          <Step
            n="3"
            height={380}
            title="It drafts in three beats."
            body="What you did, what happened, what it meant. The number gets its own line, and only a number you can point at."
          >
            <div className="absolute top-10 left-10 min-h-[300px] w-[620px] rounded-kit-object bg-kit-object px-6 pt-5 pb-8 shadow-kit-object">
              <div className="flex items-baseline justify-between text-[13px]">
                <span className="font-[560]">Draft for LinkedIn</span>
                <span className="text-kit-ink-muted">waiting for you</span>
              </div>
              <div className="mt-5 flex w-[330px] flex-col gap-4 text-[15px] leading-[1.5]">
                <Margin note="did" tone="pen" gap={18} width={130}>
                  <p>We started sending invoices in our customers&apos; own currency.</p>
                </Margin>
                <Margin note="happened" tone="pen" gap={18} width={130}>
                  <div>
                    <p>Currency tickets the week before: 27. The week after:</p>
                    <p className="mt-1 text-[24px] leading-[1.25] font-[600] tabular-nums">2</p>
                  </div>
                </Margin>
                <Margin note="meant" tone="pen" gap={18} width={130}>
                  <p>Nobody was upset about the price. They could not read the bill.</p>
                </Margin>
              </div>
            </div>
          </Step>

          <Step
            n="4"
            flip
            height={370}
            title="You approve. It takes a morning."
            body="Approve puts the post in a slot in your week. Edit opens it. Until you press one of them, it waits."
          >
            <div className="absolute top-10 left-10 h-[400px] w-[556px] rounded-kit-object bg-kit-object px-6 pt-5 shadow-kit-object">
              <div className="flex items-center justify-between border-b border-kit-hairline pb-4">
                <div className="text-[13px] leading-[1.35]">
                  <div className="font-[560]">The X version</div>
                  <div className="text-kit-ink-muted">waiting for you</div>
                </div>
                <DraftActions />
              </div>
              <div className="mt-4 text-[13px] font-[560]">Your week</div>
              <div className="mt-3 grid grid-cols-5 gap-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
                  <div key={d} className="flex flex-col gap-2">
                    <span className="text-[12px] text-kit-ink-muted">{d}</span>
                    {d === "Mon" ? (
                      <div className="h-[220px] rounded-kit-control bg-kit-control p-3 text-[12px] leading-[1.4] shadow-kit-control">
                        <div className="flex items-center gap-1.5 text-kit-ink-muted">
                          <span className="size-1.5 rounded-full bg-kit-live" />
                          08:00
                        </div>
                        <p className="mt-1.5 font-[560]">Nobody was upset about the price.</p>
                        <div className="mt-1 text-kit-ink-muted">LinkedIn</div>
                      </div>
                    ) : d === "Wed" ? (
                      <div className="h-[220px] rounded-kit-control bg-kit-well p-3">
                        <Bars widths={[80, 56]} h={6} gap={7} />
                      </div>
                    ) : (
                      <div className="h-[220px] rounded-kit-control border border-dashed border-kit-hairline" />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </Step>
        </div>
      </section>

      {/* Numbers against your own median */}
      <section className="mt-32 border-t border-kit-hairline px-[60px] pt-24">
        <div className="grid grid-cols-[400px_1fr] gap-16">
          <div>
            <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">Measured against you.</h2>
            <p className="mt-4 text-[17px] leading-[1.55] text-kit-ink-muted">
              Feeds judge each post on its own, so Quincy does too. Every post
              is set against your own median, never against anyone else, and
              there is no follower count anywhere in it.
            </p>
          </div>
          <MedianStrip />
        </div>
      </section>

      {/* Quincy drafts, you send */}
      <section className="mt-32 flex flex-col items-center px-[60px] text-center">
        <h2 className="text-[56px] leading-[1.05] font-[600] tracking-[-0.05em]">Quincy drafts. You send.</h2>
        <p className="mt-5 max-w-[50ch] text-[17px] leading-[1.55] text-kit-ink-muted text-balance">
          It posts in your name, so every draft waits for your read. There is no
          switch anywhere that turns that off.
        </p>
        <div className="mt-12 w-fit rounded-kit-object bg-kit-object px-7 py-6 text-left shadow-kit-object">
          <Receipt
            size={15}
            lines={[
              ["Read #212", "4 paragraphs"],
              ["Drafted", "1 for X, 1 for LinkedIn"],
              ["Held for your read", "both, nothing sent"],
            ]}
          />
        </div>
      </section>

      {/* Depth, as an aim */}
      <section className="mx-[60px] mt-32 grid grid-cols-2 gap-16 rounded-kit-stage bg-kit-stage px-14 py-14">
        <h2 className="text-[32px] leading-[1.15] font-[600] tracking-[-0.03em]">
          Views are rented. The people who reply are yours.
        </h2>
        <p className="text-[17px] leading-[1.6] text-kit-ink-muted">
          What we are building toward: knowing who keeps showing up under your
          posts, with a drafted reply waiting for each of them. It is not built
          yet. When it is, it will still wait for you to send.
        </p>
      </section>

      {/* Pricing */}
      <section className="mt-32 px-[60px]">
        <h2 className="text-center text-[44px] leading-[1.1] font-[600] tracking-[-0.04em]">One plan.</h2>
        <div className="mx-auto mt-12 grid w-[960px] grid-cols-[340px_1fr] overflow-hidden rounded-kit-object bg-kit-object shadow-kit-object">
          <div className="border-r border-kit-hairline px-9 py-9">
            <p className="text-[56px] leading-[1] font-[600] tracking-[-0.04em] tabular-nums">
              {PRICE.figure}
              <span className="ml-2 text-[17px] font-[460] tracking-normal text-kit-ink-muted">{PRICE.period}</span>
            </p>
            <p className="mt-3 text-[14px] text-kit-ink-muted">{PRICE.currency}.</p>
            <ul className="mt-8 flex flex-col gap-3 text-[15px]">
              <li>Posts to X and LinkedIn</li>
              <li>Works from merged PRs, voice notes and notes you paste</li>
              <li>Every post against your own median</li>
            </ul>
            <div className="mt-9">
              <Cta size="md" />
            </div>
          </div>
          <ul className="flex flex-col px-9 py-6">
            {REFUSALS.map((r) => (
              <li key={r.never} className="border-b border-kit-hairline py-4 last:border-b-0">
                <p className="text-[15px] font-[560]">{r.never}</p>
                <p className="mt-1 text-[14px] leading-[1.5] text-kit-ink-muted">{r.because}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Final CTA */}
      <section className="flex flex-col items-center px-[60px] pt-32 pb-28 text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Invites go out in small groups.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">In the order people asked.</p>
        <div className="mt-9">
          <Cta />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

/** One step of "how it works": words on one side, a cropped picture on the other. */
function Step({
  n,
  title,
  body,
  flip,
  height = 300,
  children,
}: {
  height?: number
  n: string
  title: string
  body: string
  flip?: boolean
  children: React.ReactNode
}) {
  return (
    <div className={`flex items-center gap-16 ${flip ? "flex-row-reverse" : ""}`}>
      <div className="w-[380px] flex-none">
        <span className="font-kit-mono text-[13px] text-kit-ink-muted">{n}</span>
        <h3 className="mt-3 text-[28px] leading-[1.15] font-[600] tracking-[-0.03em]">{title}</h3>
        <p className="mt-3 text-[16px] leading-[1.6] text-kit-ink-muted">{body}</p>
      </div>
      <div className="relative flex-1 overflow-hidden rounded-kit-stage bg-kit-stage" style={{ height }}>
        {children}
      </div>
    </div>
  )
}

/** Thirty posts as dots against the median line; one clears it. */
function MedianStrip() {
  const ys = [44, 52, 38, 61, 47, 55, 40, 49, 58, 43, 50, 36, 62, 46, 53, 41, 57, 45, 48, 39, 54, 60, 42, 51, 47, 56, 44, 50, 163, 49]
  const median = 49
  const H = 300
  const scale = (v: number) => H - 30 - v * 1.4
  return (
    <div className="relative h-[360px] overflow-hidden rounded-kit-stage bg-kit-stage">
      <div className="absolute top-8 left-8 right-[-40px] h-[360px] rounded-kit-object bg-kit-object shadow-kit-object">
        <div className="flex items-baseline justify-between px-6 pt-5 pr-[64px] text-[13px]">
          <span className="font-[560]">Your last 30 posts</span>
          <span className="text-kit-ink-muted">replies · the dashed line is your median</span>
        </div>
        <div className="relative mx-6 mt-2 h-[300px]">
          <div
            className="absolute inset-x-0 border-t border-dashed border-kit-ink-muted"
            style={{ top: scale(median) }}
          />
          {ys.map((v, i) => {
            const hi = v > 100
            return (
              <span
                key={i}
                className={`absolute rounded-full ${hi ? "size-3 bg-kit-pen" : "size-2 bg-kit-ink-muted"}`}
                style={{ left: `${(i / (ys.length - 1)) * 88 + 2}%`, top: scale(v) }}
              />
            )
          })}
          <div className="absolute flex items-center gap-2 text-[13px]" style={{ right: "15%", top: scale(163) - 8 }}>
            <span className="rounded-kit-control bg-kit-control px-2.5 py-1 font-[560] shadow-kit-control">
              Nobody was upset about the price · 3.3× your median
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
