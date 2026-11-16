"use client"

/*
 * 22 — From the pocket.
 *
 * From 09: a phone rising out of the hero's bottom edge, with Quincy's blue
 * pen on the page beside it instead of inside the screen. Pushed: the whole
 * page is phones. One rises in the hero; three stand in a row for how it
 * works, cut by the same stage edge at different heights; one carries the
 * number. Every time, the pen stays outside the glass. Narrow, airy, one
 * centred column, the way you read on the phone it is about.
 */

import { Phone } from "@/components/showcase"

import { Hand, Hl, Ring } from "../../round-1/a/marks"
import { PenLabel } from "../../round-1/b/frame"

import { Sheet } from "./sheet"
import { Cta, Footer, NEVER, Pic, PRICE_LINES, PriceFigure, TopLine, Waitlist } from "./parts"
import { Checks, IDEAS, RUN, Wave, WEEK } from "./product"

const SCREEN = "var(--kit-object)"

/* ── Screens, laid out in iOS points (402 wide) ─────────────────────────── */

function Label({ children }: { children: React.ReactNode }) {
  return <div className="text-[14px] text-kit-ink-muted">{children}</div>
}

function VoiceCard({ hl = true }: { hl?: boolean }) {
  return (
    <div className="rounded-[18px] bg-kit-stage px-4 py-3.5 text-[16px] leading-[1.45]">
      <div className="flex items-center gap-3">
        <span className="size-8 flex-none rounded-full bg-kit-object shadow-kit-control" />
        <Wave bars={24} />
        <span className="font-kit-mono text-[13px] text-kit-ink-muted">0:48</span>
      </div>
      <div className="mt-3 text-kit-ink-muted">&hellip;so we cut the signup form from nine fields to three.</div>
      <div className="mt-1.5">{hl ? <Hl sweep>People weren&apos;t lazy. The form was.</Hl> : "People weren't lazy. The form was."}</div>
    </div>
  )
}

function DraftBody({ size = 17 }: { size?: number }) {
  return (
    <div style={{ fontSize: size }} className="flex flex-col gap-4 leading-[1.45]">
      <div data-beat="did">I cut our signup form from nine fields to three.</div>
      <div data-beat="happened">
        <div>A week later, finished signups:</div>
        <div className="text-[1.5em] leading-[1.3] font-[600] tracking-[-0.02em] tabular-nums">41% → 68%</div>
        <div className="text-[0.85em] text-kit-ink-muted">Your median week is 44%.</div>
      </div>
      <div data-beat="meant">People weren&apos;t lazy. The form was.</div>
    </div>
  )
}

function ApproveBar() {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex h-11 flex-1 items-center justify-center rounded-[14px] bg-kit-action text-[16px] font-[560] text-kit-action-on">
        Approve
      </span>
      <span className="inline-flex h-11 items-center rounded-[14px] bg-kit-control px-5 text-[16px] font-[560] shadow-kit-control">
        Edit
      </span>
    </div>
  )
}

function HeroScreen() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <Label>You · voice note</Label>
      <VoiceCard />
      <div className="mt-4">
        <Label>Quincy · draft for LinkedIn</Label>
      </div>
      <DraftBody />
      <div className="mt-3">
        <ApproveBar />
      </div>
    </div>
  )
}

function RecordScreen() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <Label>You · voice note</Label>
      <VoiceCard hl={false} />
      <div className="mt-5">
        <Label>Quincy</Label>
      </div>
      <div className="text-[17px] leading-[1.45]">3 ideas from your voice note</div>
      <div className="flex flex-col gap-1.5">
        {IDEAS.map((idea, i) => (
          <div
            key={idea.title}
            data-on={i === 0 || undefined}
            className="rounded-[14px] px-3.5 py-3 text-[16px] leading-[1.4] shadow-kit-inset data-on:bg-kit-stage data-on:shadow-none"
          >
            <div className="font-[560]">{idea.title}</div>
            <div className="text-[14px] text-kit-ink-muted">{idea.line}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DraftScreen() {
  return (
    <div className="flex flex-col gap-3 px-5 pt-4">
      <div className="flex items-center gap-3 rounded-[14px] bg-kit-stage px-3 py-2.5">
        <Wave bars={18} />
        <span className="font-kit-mono text-[13px] text-kit-ink-muted">0:48</span>
      </div>
      <div className="mt-2">
        <Label>Draft for LinkedIn</Label>
      </div>
      <div>
        <DraftBody size={20} />
      </div>
      <div className="mt-4">
        <ApproveBar />
      </div>
      <div className="mt-1 text-center font-kit-mono text-[13px] text-kit-ink-muted">Thu 08:00 · LinkedIn</div>
    </div>
  )
}

function WeekScreen() {
  return (
    <div className="flex flex-col px-5 pt-4">
      <div className="text-[24px] font-[600] tracking-[-0.02em]">This week</div>
      <div className="mt-3 flex flex-col">
        {WEEK.map((s) => {
          const focus = "focus" in s && s.focus
          return (
            <div
              key={s.day}
              data-focus={focus || undefined}
              className="flex flex-col gap-0.5 border-b border-kit-hairline py-3 text-[16px] data-focus:-mx-3 data-focus:rounded-[14px] data-focus:border-transparent data-focus:bg-kit-stage data-focus:px-3"
            >
              <div className="flex items-baseline justify-between">
                <span className="font-[560]">{s.day}</span>
                <span className="font-kit-mono text-[13px] text-kit-ink-muted">
                  {s.time} · {s.channel}
                </span>
              </div>
              <div className={s.what ? "" : "text-kit-ink-muted"}>{s.what ?? "Open"}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function ResultScreen() {
  return (
    <div className="flex flex-col px-5 pt-4">
      <Label>Posted Thursday 08:00 · LinkedIn</Label>
      <div className="mt-2 text-[18px] leading-[1.45]">I cut our signup form from nine fields to three.</div>
      <div className="mt-6 text-[14px] text-kit-ink-muted">Views at 48 hours</div>
      <div className="text-[44px] leading-[1.1] font-[600] tracking-[-0.03em] tabular-nums">4,210</div>
      <div className="mt-1 text-[17px] font-[560]">
        <span className="mr-2 ml-3">
          <Ring tone="pen">3.4× your median</Ring>
        </span>
      </div>
      <div className="mt-2 text-[15px] text-kit-ink-muted">Your median is 1,240.</div>
      <div className="mt-6 flex flex-col border-t border-kit-hairline">
        {[
          ["Invoices in their own currency", "1.7×"],
          ["The annual toggle", "About your median"],
          ["Onboarding emails", "0.6×"],
        ].map(([t, v]) => (
          <div key={t} className="flex justify-between border-b border-kit-hairline py-3 text-[15px]">
            <span>{t}</span>
            <span className="text-kit-ink-muted">{v}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── The page ──────────────────────────────────────────────────────────── */

function H2({ children }: { children: React.ReactNode }) {
  return <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">{children}</h2>
}

export default function FromThePocket() {
  return (
    <Sheet>
      <TopLine right={<span>$49 a month</span>} />

      {/* Hero: the phone rises */}
      <section className="flex flex-col items-center pt-[84px] text-center">
        <h1 className="text-[68px] leading-[1.02] font-[600] tracking-[-0.055em]">
          Say it on a walk.
          <br />
          Read it as a post.
        </h1>
        <p className="mt-5 max-w-[46ch] text-[18px] leading-[1.5] text-kit-ink-muted">
          Record a voice note. Quincy keeps your words, finds the idea in them
          and drafts it in three beats. Nothing goes out until you approve it.
        </p>
        <div className="mt-8">
          <Cta />
        </div>
      </section>

      <div className="relative mx-16 mt-16 h-[600px] overflow-hidden rounded-t-[26px] bg-kit-stage">
        <Pic width={380} height={800} className="absolute top-14 left-[346px]">
          <Phone width={380} time="07:52" wallpaper={SCREEN}>
            <HeroScreen />
          </Phone>
        </Pic>
        {/* The pen, on the page beside the glass. */}
        <PenLabel label="what I did" height={30} style={{ left: 746, top: 339 }} />
        <PenLabel label="what happened" height={70} style={{ left: 746, top: 379 }} />
        <PenLabel label="what it meant" height={30} style={{ left: 746, top: 459 }} />
        <div className="absolute top-[256px] left-[136px] w-[180px] text-right">
          <Hand>the line worth posting</Hand>
        </div>
        <svg aria-hidden className="absolute top-[262px] left-[322px] overflow-visible" width="60" height="20">
          <path d="M2 10 C 20 8, 40 10, 54 10" fill="none" stroke="var(--kit-ink-muted)" strokeWidth="1.25" strokeLinecap="round" />
          <circle cx="57" cy="10" r="2.5" fill="var(--kit-ink-muted)" />
        </svg>
      </div>

      {/* How it works: three phones, one morning */}
      <section className="border-t border-kit-hairline pt-[120px]">
        <div className="text-center">
          <H2>Three screens. Two of them are yours.</H2>
          <p className="mx-auto mt-4 max-w-[50ch] text-[17px] leading-[1.55] text-kit-ink-muted">
            You talk and you approve. Quincy does the middle. It finds the
            idea, writes it in your voice and puts it in your week.
          </p>
        </div>

        <div className="relative mx-16 mt-14 h-[560px] overflow-hidden rounded-t-[26px] bg-kit-stage">
          {[
            { left: 56, top: 172, pen: "you talk, it finds 3 ideas", el: <RecordScreen /> },
            { left: 366, top: 132, pen: "it drafts, you approve", el: <DraftScreen /> },
            { left: 676, top: 192, pen: "it waits for Thursday", el: <WeekScreen /> },
          ].map((p) => (
            <div key={p.pen}>
              <div className="absolute" style={{ left: p.left + 4, top: p.top - 50 }}>
                <span className="inline-block -rotate-2 font-kit-hand text-[26px] leading-none font-medium text-kit-pen">{p.pen}</span>
              </div>
              <div className="absolute" style={{ left: p.left, top: p.top }}>
                <Pic width={300} height={640}>
                  <Phone width={300} time="07:52" wallpaper={SCREEN}>
                    {p.el}
                  </Phone>
                </Pic>
              </div>
            </div>
          ))}
        </div>

        <div className="mx-16 grid grid-cols-5 gap-8 border-t border-kit-hairline pt-8 text-[15px] leading-[1.5]">
          {[
            ["You talk", "A voice note, a merged pull request, notes you paste."],
            ["It finds the ideas", "Usually two or three, named by where they came from."],
            ["It drafts", "Three beats. The number on its own line."],
            ["You approve", "Or change a word first. Nothing goes out before."],
            ["It waits in your week", "On X or LinkedIn, at the slot you keep."],
          ].map(([k, v], i) => (
            <div key={k}>
              <div className="font-kit-mono text-[13px] text-kit-ink-muted">0{i + 1}</div>
              <div className="mt-2 font-[600]">{k}</div>
              <div className="mt-1 text-kit-ink-muted text-pretty">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Numbers */}
      <section className="mt-[136px] flex items-end gap-0 px-16">
        <div className="w-[420px] flex-none pb-16">
          <H2>
            Against you.
            <br />
            Not your followers.
          </H2>
          <p className="mt-5 text-[17px] leading-[1.6] text-kit-ink-muted text-pretty">
            Reach follows the post now, not the account. So every post is set
            against your own median, and the follower count is not in Quincy at
            all.
          </p>
        </div>
        <div className="relative h-[480px] flex-1 overflow-hidden rounded-t-[26px] bg-kit-stage">
          <div className="absolute top-14 left-[96px]">
            <Pic width={340} height={720}>
              <Phone width={340} time="10:14" wallpaper={SCREEN}>
                <ResultScreen />
              </Phone>
            </Pic>
          </div>
          <div className="absolute top-[230px] left-[462px] w-[130px]">
            <Hand tone="pen">this one, again</Hand>
          </div>
          <svg aria-hidden className="absolute top-[244px] left-[242px] overflow-visible" width="212" height="16">
            <path d="M208 4 C 150 2, 60 10, 6 10" fill="none" stroke="var(--kit-pen)" strokeWidth="1.5" strokeLinecap="round" />
            <circle cx="4" cy="10" r="2.5" fill="var(--kit-pen)" />
          </svg>
        </div>
      </section>

      {/* Held for your read */}
      <section className="flex flex-col items-center border-t border-kit-hairline pt-[120px] text-center">
        <H2>
          Quincy drafts.
          <br />
          You send.
        </H2>
        <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.55] text-kit-ink-muted">
          Every run ends the same way. Here is the last one, as Quincy wrote it.
        </p>
        <div className="mt-10 w-[480px] rounded-[22px] bg-kit-stage p-7 text-left">
          <Checks lines={RUN} size={16} />
          <div className="mt-5 text-[16px] leading-[1.55]">
            Nothing went out. There is no switch that sends without you.
          </div>
        </div>
      </section>

      {/* Depth, as an aim */}
      <section className="mx-auto mt-[136px] w-[620px] text-center">
        <div className="text-[14px] text-kit-ink-muted">Next, not yet built</div>
        <h2 className="mt-2 text-[34px] leading-[1.12] font-[600] tracking-[-0.035em]">The people who keep showing up.</h2>
        <p className="mt-4 text-[17px] leading-[1.6] text-kit-ink-muted text-pretty">
          Views are rented. The people who reply are yours. Quincy will learn
          who keeps replying and draft an answer to each of them, for you to
          send. That is where this goes after drafting.
        </p>
      </section>

      {/* Price */}
      <section className="mx-auto mt-[136px] flex w-[620px] flex-col items-center border-t border-kit-hairline pt-14 text-center">
        <PriceFigure size={72} />
        <div className="mt-3 text-[16px] leading-[1.6] text-kit-ink-muted">
          {PRICE_LINES.map((l) => (
            <div key={l}>{l}</div>
          ))}
        </div>
        <div className="mt-10 flex w-full flex-col text-left">
          {NEVER.map((r) => (
            <div key={r.never} className="border-t border-kit-hairline py-4">
              <div className="text-[16px] font-[560]">{r.never}</div>
              <div className="mt-1 text-[15px] leading-[1.5] text-kit-ink-muted">{r.because}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Final */}
      <section className="mt-[120px] flex flex-col items-center pb-[120px] text-center">
        <H2>Your next walk is a draft.</H2>
        <div className="mt-8">
          <Waitlist />
        </div>
      </section>

      <Footer />
    </Sheet>
  )
}
