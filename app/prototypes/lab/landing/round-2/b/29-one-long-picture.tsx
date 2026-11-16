"use client"

/*
 * 29 — One long picture.
 *
 * Grows from 02 and 07, but instead of one window under the hero, the page
 * after the hero is ONE continuous product picture: a single grey stage,
 * two thousand pixels tall, that follows pull request #212 from the merge to
 * the morning it goes out. Six objects on one ground, joined by one blue pen
 * line that leaves each object where the story continues: the highlighted
 * line, the chosen idea, the draft, Approve, Monday, the result. The words
 * that explain each stop are short captions in the stage's left margin, so
 * the picture carries the page and the copy rides beside it.
 *
 * After Stageshow: one ground, one shadow, one radius set; the connector is
 * a 1.5px leader with a dot at its end, through empty ground only; objects
 * bleed off the right edge and the last one is cut by the stage's foot.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon, Linkedin01Icon } from "@hugeicons/core-free-icons"

import { Hl, Margin, Ring } from "../../round-1/a/marks"
import { Bars, Cta, DraftActions, Footer, PRICE, Receipt, REFUSALS, TopLine } from "./bits"
import { Scroll } from "./scroll"

/** Stage height and where each connector leaves and lands. */
const STAGE_H = 2140
const LINKS: [number, number, number, number][] = [
  [560, 396, 560, 466],
  [700, 686, 700, 796],
  [640, 1086, 640, 1206],
  [520, 1426, 470, 1556],
  [470, 1786, 470, 1856],
]

export function OneLongPicture() {
  return (
    <Scroll dark>
      <TopLine />

      <section className="flex flex-col items-center pt-16 pb-20 text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.055em]">Merge on Friday. Post on Monday.</h1>
        <p className="mt-6 max-w-[54ch] text-[18px] leading-[1.5] text-kit-ink-muted text-balance">
          One pull request, followed all the way through Quincy: from the merge to
          the morning it goes out under your name.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      {/* The one picture. */}
      <div className="relative mx-[60px] overflow-hidden rounded-kit-stage bg-kit-stage" style={{ height: STAGE_H }}>
        {/* The pen line, under the objects. */}
        <svg aria-hidden className="absolute inset-0 size-full" viewBox={`0 0 1080 ${STAGE_H}`}>
          {LINKS.map(([x1, y1, x2, y2], i) => (
            <g key={i}>
              <path
                d={`M${x1} ${y1} C ${x1} ${y1 + 40}, ${x2} ${y2 - 40}, ${x2} ${y2}`}
                fill="none"
                stroke="var(--kit-pen)"
                strokeWidth={1.5}
                strokeLinecap="round"
              />
              <circle cx={x2} cy={y2} r={3.5} fill="var(--kit-pen)" />
            </g>
          ))}
        </svg>

        <Caption top={72} n="1" when="Friday 16:40">
          You merge #212. Quincy reads it like an editor: the one line with a
          number in it, and what to leave out.
        </Caption>
        <Obj top={60} left={380} w={760} h={330}>
          <div className="flex items-center gap-2 font-kit-mono text-[11px] text-kit-ink-muted">
            <HugeiconsIcon icon={GitMergeIcon} size={13} strokeWidth={2} aria-hidden />
            #212 · merged Friday 16:40 · +184 −61
          </div>
          <div className="mt-2 text-[18px] font-[600] tracking-[-0.01em]">Send invoices in the customer&apos;s own currency</div>
          <div className="mt-4 flex w-[400px] flex-col gap-3.5 text-[14px] leading-[1.6]">
            <Margin note="leave this out" gap={22} width={160}>
              <p className="text-kit-ink-muted">Every invoice went out in USD, wherever the customer was.</p>
            </Margin>
            <Margin note="what you did" gap={22} width={160}>
              <p>This sends the invoice in the billing country&apos;s currency.</p>
            </Margin>
            <Margin note="the number" gap={22} width={160}>
              <p>
                <Hl>Currency tickets since Monday: 2.</Hl> The week before: 27.
              </p>
            </Margin>
            <Margin note="what it meant" gap={22} width={160}>
              <p>Nobody was upset about the price. They could not read the bill.</p>
            </Margin>
          </div>
          <div className="mt-5 w-[400px]">
            <Bars widths={[90, 74]} />
          </div>
        </Obj>

        <Caption top={482} n="2" when="Friday 16:52">
          It finds the ideas in it, and names each one by where it came from.
        </Caption>
        <Obj top={470} left={380} w={520} h={210}>
          <div className="text-[12px] text-kit-ink-muted">3 ideas from #212</div>
          <div className="mt-3 flex flex-col gap-1 text-[14px] leading-[1.45]">
            <div className="flex items-center justify-between rounded-kit-control bg-kit-well px-3 py-3">
              <Ring tone="pen">Nobody was upset about the price.</Ring>
              <span className="rounded-kit-control bg-kit-control px-2.5 py-1 text-[12px] font-[560] shadow-kit-control">
                Draft this idea
              </span>
            </div>
            <div className="rounded-kit-control px-3 py-3">Why old invoices stay in dollars</div>
            <div className="px-3 py-3">
              <Bars widths={[58]} />
            </div>
          </div>
        </Obj>

        <Caption top={812} n="3" when="Friday 16:53">
          It drafts it in three beats. What you did, what happened, what it
          meant, with the number on its own line.
        </Caption>
        <Obj top={800} left={460} w={560} h={280}>
          <div className="flex items-center gap-2 text-[12px] text-kit-ink-muted">
            <HugeiconsIcon icon={Linkedin01Icon} size={13} strokeWidth={2} aria-hidden />
            Draft for LinkedIn
          </div>
          <div className="mt-4 flex w-[300px] flex-col gap-4 text-[15px] leading-[1.5]">
            <Margin note="did" tone="pen" gap={18} width={120}>
              <p>We started sending invoices in our customers&apos; own currency.</p>
            </Margin>
            <Margin note="happened" tone="pen" gap={18} width={120}>
              <div>
                <p>Currency tickets the next week:</p>
                <p className="mt-1 text-[24px] leading-[1.25] font-[600] tabular-nums">27 → 2</p>
              </div>
            </Margin>
            <Margin note="meant" tone="pen" gap={18} width={120}>
              <p>Nobody was upset about the price. They could not read the bill.</p>
            </Margin>
          </div>
        </Obj>

        <Caption top={1222} n="4" when="Saturday 09:10">
          You read what it did and press Approve. Until you do, nothing goes
          out.
        </Caption>
        <Obj top={1210} left={380} w={520} h={210}>
          <div className="text-[13px] font-[600]">Quincy</div>
          <div className="mt-4">
            <Receipt
              lines={[
                ["Read #212", "4 paragraphs"],
                ["Found the number", "27 tickets to 2"],
                ["Drafted", "1 for LinkedIn, held for your read"],
              ]}
            />
          </div>
          <div className="mt-6 flex items-center gap-4">
            <DraftActions approved />
            <span className="text-[13px] text-kit-ink-muted">You pressed it.</span>
          </div>
        </Obj>

        <Caption top={1572} n="5" when="Saturday 09:10">
          Approve gives it a morning in your week. Here, Monday at 08:00.
        </Caption>
        <Obj top={1560} left={380} w={780} h={220}>
          <div className="text-[13px] font-[560]">Your week</div>
          <div className="mt-4 grid grid-cols-5 gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
              <div key={d} className="flex flex-col gap-2">
                <span className="text-[12px] text-kit-ink-muted">{d}</span>
                {d === "Mon" ? (
                  <div className="h-[110px] rounded-kit-control bg-kit-control p-3 text-[12px] leading-[1.4] shadow-kit-control">
                    <div className="font-kit-mono text-[11px] text-kit-ink-muted">08:00 · LinkedIn</div>
                    <p className="mt-1.5 font-[560]">Nobody was upset about the price.</p>
                  </div>
                ) : d === "Thu" ? (
                  <div className="h-[110px] rounded-kit-control bg-kit-well p-3">
                    <Bars widths={[78, 52]} h={6} gap={7} />
                  </div>
                ) : (
                  <div className="h-[110px] rounded-kit-control border border-dashed border-kit-hairline" />
                )}
              </div>
            ))}
          </div>
        </Obj>

        <Caption top={1872} n="6" when="Monday 08:00">
          It goes out in your name. The only number Quincy shows you is the post
          against your own median.
        </Caption>
        <Obj top={1860} left={380} w={520} h={340}>
          <div className="flex items-center gap-2.5">
            <span className="size-9 rounded-full bg-kit-well" aria-hidden />
            <div className="text-[13px] leading-[1.35]">
              <div className="font-[600]">You</div>
              <div className="text-kit-ink-muted">Monday 08:00 · LinkedIn</div>
            </div>
          </div>
          <p className="mt-4 text-[14px] leading-[1.55]">
            We started sending invoices in our customers&apos; own currency. Currency
            tickets the next week: 27 → 2.
          </p>
          <div className="mt-4 flex items-baseline gap-2 border-t border-kit-hairline pt-4">
            <span className="text-[20px] font-[600] tabular-nums">3.3×</span>
            <span className="text-[13px] text-kit-ink-muted">your median replies, after a day</span>
          </div>
          <div className="mt-4">
            <Bars widths={[70, 46]} />
          </div>
        </Obj>
      </div>

      {/* After the picture: what is true, plainly. */}
      <section className="grid grid-cols-3 gap-10 px-[60px] pt-24">
        {[
          ["Where it posts", "X and LinkedIn. Nothing else yet."],
          ["What it works from", "Pull requests you merge, voice notes, notes you paste."],
          ["Who sends", "You. There is no switch that lets it post on its own."],
        ].map(([k, v]) => (
          <div key={k} className="border-t border-kit-hairline pt-5">
            <h3 className="text-[15px] font-[600]">{k}</h3>
            <p className="mt-2 text-[16px] leading-[1.55] text-kit-ink-muted">{v}</p>
          </div>
        ))}
      </section>

      <section className="mx-[60px] mt-24 grid grid-cols-[420px_1fr] gap-16">
        <div>
          <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">
            {PRICE.figure} a month. One plan.
          </h2>
          <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted">
            {PRICE.currency}. It comes with five things it will never do:
          </p>
          <p className="mt-10 text-[16px] leading-[1.6]">
            What comes next is the part that knows who keeps replying to you, with
            a reply drafted for each. It is not built yet.
          </p>
        </div>
        <ul className="grid grid-cols-2 gap-x-10 gap-y-6">
          {REFUSALS.map((r) => (
            <li key={r.never}>
              <p className="text-[15px] font-[560]">{r.never}</p>
              <p className="mt-1 text-[14px] leading-[1.5] text-kit-ink-muted">{r.because}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="flex flex-col items-center px-[60px] pt-32 pb-28 text-center">
        <h2 className="text-[48px] leading-[1.05] font-[600] tracking-[-0.045em]">Your next merge could be Monday&apos;s post.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Cta />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

/** A stop's caption, in the stage's left margin. */
function Caption({ top, n, when, children }: { top: number; n: string; when: string; children: React.ReactNode }) {
  return (
    <div className="absolute left-12 w-[280px]" style={{ top }}>
      <div className="flex items-baseline gap-3">
        <span className="font-kit-mono text-[13px] text-kit-ink-muted">{n}</span>
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{when}</span>
      </div>
      <p className="mt-2 text-[17px] leading-[1.5] font-[500] tracking-[-0.01em]">{children}</p>
    </div>
  )
}

/** One object on the stage, at a fixed place so the pen line can find it. */
function Obj({
  top,
  left,
  w,
  h,
  children,
}: {
  top: number
  left: number
  w: number
  h: number
  children: React.ReactNode
}) {
  return (
    <div
      className="absolute overflow-hidden rounded-kit-object bg-kit-object px-6 pt-5 shadow-kit-object"
      style={{ top, left, width: w, height: h }}
    >
      {children}
    </div>
  )
}
