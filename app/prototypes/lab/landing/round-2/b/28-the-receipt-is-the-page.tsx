"use client"

/*
 * 28 — The receipt is the page.
 *
 * Grows from 07's checked receipt and 02's marked PR. The receipt stops being
 * a block inside a window and becomes the page's spine: one vertical rule
 * with a check on it per line, each line followed by the crop of the product
 * where that step happened. The last checked line is "Held for your read";
 * under it the rule turns dashed into the one line that is not checked yet
 * (depth, stated as the aim). The plan is printed as a bill at the end.
 *
 * Pictures after Stageshow's "satellite focus": each crop is small and hard,
 * one object, the subject whole, filler at the cut.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon, Linkedin01Icon, NewTwitterIcon } from "@hugeicons/core-free-icons"

import { Hl, Margin } from "../../round-1/a/marks"
import { Bars, Check, Cta, DraftActions, Footer, PRICE, REFUSALS, TopLine } from "./bits"
import { Scroll } from "./scroll"

export function TheReceiptIsThePage() {
  return (
    <Scroll dark>
      <TopLine />

      <section className="flex flex-col items-center pt-16 pb-24 text-center">
        <h1 className="text-[72px] leading-[1] font-[600] tracking-[-0.055em]">It shows its work. You send it.</h1>
        <p className="mt-6 max-w-[54ch] text-[18px] leading-[1.5] text-kit-ink-muted text-balance">
          Every run ends in a receipt: what Quincy read, what it found and what it
          drafted. The last line is always the same one.
        </p>
        <div className="mt-9 flex items-center gap-4">
          <Cta />
          <span className="text-[15px] text-kit-ink-muted">$49 a month, one plan</span>
        </div>
      </section>

      {/* The receipt, as the page's spine. */}
      <section className="relative mx-[60px] rounded-kit-stage bg-kit-stage pt-12 pb-16">
        <div className="mx-12 flex items-baseline justify-between border-b border-kit-hairline pb-5 text-[14px]">
          <span>
            <span className="font-[600]">Quincy</span>
            <span className="text-kit-ink-muted"> · run on a merged pull request</span>
          </span>
          <span className="font-kit-mono text-[12px] text-kit-ink-muted">Tuesday 14:04 to 14:06</span>
        </div>

        <div className="relative mt-12">
          <Line time="14:04" did="Read PR #412" result="6 fields removed, 212 lines">
            <Crop>
              <div className="absolute top-6 left-6 w-[760px] rounded-kit-object bg-kit-object px-6 pt-5 pb-10 shadow-kit-object">
                <div className="flex items-center gap-2 font-kit-mono text-[11px] text-kit-ink-muted">
                  <HugeiconsIcon icon={GitMergeIcon} size={13} strokeWidth={2} aria-hidden />
                  #412 · merged Tuesday 13:58
                </div>
                <div className="mt-2 text-[16px] font-[600]">Cut the signup form to three fields</div>
                <div className="mt-3 w-[380px] text-[14px] leading-[1.6]">
                  <Margin note="this is the post" gap={22} width={150}>
                    <p>
                      Removes company, role, team size, phone, country and
                      referral. <Hl>Finished signups went from 41% to 68% in the first week.</Hl>
                    </p>
                  </Margin>
                </div>
                <div className="mt-4 w-[380px]">
                  <Bars widths={[88, 64]} />
                </div>
              </div>
            </Crop>
          </Line>

          <Line time="14:05" did="Found ideas" result="3, named by the PR">
            <Crop>
              <div className="absolute top-6 left-6 flex gap-3">
                {[
                  ["People weren't lazy. The form was.", true],
                  ["The six questions nobody missed", false],
                  ["", false],
                ].map(([t, on], i) => (
                  <div
                    key={i}
                    className="h-[180px] w-[290px] flex-none rounded-kit-object bg-kit-object px-5 pt-4 shadow-kit-object"
                  >
                    <div className="text-[11px] text-kit-ink-muted">idea {i + 1} of 3 · from #412</div>
                    {t ? (
                      <p className={`mt-2 text-[15px] leading-[1.4] ${on ? "font-[560]" : ""}`}>{t as string}</p>
                    ) : (
                      <div className="mt-3">
                        <Bars widths={[80, 55]} />
                      </div>
                    )}
                    {on ? (
                      <span className="mt-4 inline-block rounded-kit-control bg-kit-control px-3 py-1.5 text-[12px] font-[560] shadow-kit-control">
                        Draft this idea
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            </Crop>
          </Line>

          <Line time="14:05" did="Checked your median" result="44% finish in a usual week">
            <Crop>
              <div className="absolute top-6 left-6 w-[760px] rounded-kit-object bg-kit-object px-6 pt-5 shadow-kit-object">
                <div className="flex items-baseline justify-between text-[12px]">
                  <span className="font-[560]">Finished signups, by week</span>
                  <span className="text-kit-ink-muted">the week after #412</span>
                </div>
                <div className="relative mt-4 flex h-[130px] items-end gap-2">
                  {[40, 46, 42, 45, 43, 47, 44, 41, 45, 68].map((v, i, all) => (
                    <span
                      key={i}
                      className={`flex-1 rounded-t-[4px] ${i === all.length - 1 ? "bg-kit-pen" : "bg-kit-skeleton"}`}
                      style={{ height: v * 1.8 }}
                    />
                  ))}
                  <span
                    aria-hidden
                    className="absolute inset-x-0 border-t border-dashed border-kit-ink-muted"
                    style={{ bottom: 44 * 1.8 }}
                  />
                  <span className="absolute left-0 text-[11px] text-kit-ink-muted" style={{ bottom: 44 * 1.8 + 6 }}>
                    your median, 44%
                  </span>
                  <span className="absolute right-0 text-[12px] font-[600] tabular-nums" style={{ bottom: 68 * 1.8 + 6 }}>
                    68%
                  </span>
                </div>
              </div>
            </Crop>
          </Line>

          <Line time="14:06" did="Drafted" result="1 for LinkedIn, 1 for X">
            <Crop>
              <div className="absolute top-6 left-6 flex gap-3">
                <div className="w-[380px] rounded-kit-object bg-kit-object px-5 pt-4 pb-6 shadow-kit-object">
                  <div className="flex items-center gap-2 text-[12px] text-kit-ink-muted">
                    <HugeiconsIcon icon={Linkedin01Icon} size={13} strokeWidth={2} aria-hidden />
                    LinkedIn
                  </div>
                  <div className="mt-3 flex w-[210px] flex-col gap-3 text-[14px] leading-[1.5]">
                    <Margin note="did" tone="pen" gap={14} width={90}>
                      <p>I cut our signup form from nine fields to three.</p>
                    </Margin>
                    <Margin note="happened" tone="pen" gap={14} width={90}>
                      <p className="text-[19px] leading-[1.3] font-[600] tabular-nums">41% → 68%</p>
                    </Margin>
                    <Margin note="meant" tone="pen" gap={14} width={90}>
                      <p>People weren&apos;t lazy. The form was.</p>
                    </Margin>
                  </div>
                </div>
                <div className="w-[300px] rounded-kit-object bg-kit-object px-5 pt-4 shadow-kit-object">
                  <div className="flex items-center gap-2 text-[12px] text-kit-ink-muted">
                    <HugeiconsIcon icon={NewTwitterIcon} size={13} strokeWidth={2} aria-hidden />
                    X
                  </div>
                  <p className="mt-3 text-[14px] leading-[1.5]">Six of our nine signup fields were for us, not for them.</p>
                  <div className="mt-3">
                    <Bars widths={[86, 60]} />
                  </div>
                </div>
              </div>
            </Crop>
          </Line>

          <Line did="Held for your read" result="both drafts" strong tail="dashed">
            <div className="mt-6 flex items-center gap-6">
              <DraftActions />
              <span className="text-[15px] text-kit-ink-muted">Nothing went out.</span>
            </div>
          </Line>

          {/* The one line not checked yet. */}
          <div className="relative mt-[90px] grid grid-cols-[170px_48px_1fr] items-start pr-12">
            <span />
            <span className="mx-auto mt-1 size-5 rounded-full border-[1.5px] border-dashed border-kit-ink-muted" />
            <div>
              <p className="text-[24px] leading-[1.25] font-[600] tracking-[-0.02em]">
                Know who keeps showing up <span className="font-[460] text-kit-ink-muted">→ not built yet</span>
              </p>
              <p className="mt-3 max-w-[58ch] text-[16px] leading-[1.6] text-kit-ink-muted text-balance">
                Views are rented and the people who reply are yours. The next
                line on this receipt is a drafted reply for each of them, held
                for your read like everything else.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* The plain sentence after the receipt. */}
      <section className="px-[60px] pt-28 text-center">
        <p className="mx-auto max-w-[24ch] text-[48px] leading-[1.1] font-[600] tracking-[-0.045em]">
          Nothing went out. It is parked for Thursday at 08:00.
        </p>
        <p className="mt-5 text-[17px] text-kit-ink-muted">
          And it stays parked until you approve it. There is no switch that turns that off.
        </p>
      </section>

      {/* The plan, as a bill. */}
      <section className="flex justify-center px-[60px] pt-28">
        <div className="w-[560px] rounded-kit-object bg-kit-object px-10 pt-9 pb-10 shadow-kit-object">
          <div className="flex items-baseline justify-between border-b border-dashed border-kit-ink-muted/40 pb-4">
            <span className="text-[15px] font-[600]">Quincy · one plan</span>
            <span className="font-kit-mono text-[12px] text-kit-ink-muted">{PRICE.currency}</span>
          </div>
          <dl className="flex flex-col gap-3 border-b border-dashed border-kit-ink-muted/40 py-5 text-[15px]">
            {[
              ["Posts to", "X and LinkedIn"],
              ["Works from", "Merged PRs, voice notes, pasted notes"],
              ["Measures", "Each post against your own median"],
              ["Sends", "Only what you approve"],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-6">
                <dt className="text-kit-ink-muted">{k}</dt>
                <dd className="text-right">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex items-baseline justify-between border-b border-dashed border-kit-ink-muted/40 py-5">
            <span className="text-[15px] font-[600]">Total</span>
            <span className="text-[34px] leading-[1] font-[600] tracking-[-0.03em] tabular-nums">
              {PRICE.figure}
              <span className="ml-1.5 text-[15px] font-[460] tracking-normal text-kit-ink-muted">{PRICE.period}</span>
            </span>
          </div>
          <ul className="flex flex-col gap-2.5 pt-5 text-[14px]">
            {REFUSALS.map((r) => (
              <li key={r.never} className="text-kit-ink-muted">
                {r.never}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col items-center px-[60px] pt-28 pb-28 text-center">
        <h2 className="text-[44px] leading-[1.05] font-[600] tracking-[-0.045em]">Your first receipt is an invite away.</h2>
        <p className="mt-4 text-[17px] text-kit-ink-muted">Invites go out in small groups.</p>
        <div className="mt-9">
          <Cta />
        </div>
      </section>

      <Footer />
    </Scroll>
  )
}

/** One receipt line on the spine, and the crop of the product under it. */
function Line({
  time,
  did,
  result,
  strong,
  tail = "solid",
  children,
}: {
  time?: string
  did: string
  result: string
  strong?: boolean
  /** The rule under this line: solid to the next check, or dashed to the unchecked one. */
  tail?: "solid" | "dashed"
  children: React.ReactNode
}) {
  return (
    <div className="relative mb-14 grid grid-cols-[170px_48px_1fr] items-start pr-12">
      {tail === "solid" ? (
        <span aria-hidden className="absolute top-7 -bottom-14 left-[194px] w-px bg-kit-ink-muted/40" />
      ) : (
        <span aria-hidden className="absolute top-7 -bottom-[146px] left-[194px] border-l border-dashed border-kit-ink-muted/50" />
      )}
      <span className="pt-1 pr-6 text-right font-kit-mono text-[13px] text-kit-ink-muted">{time}</span>
      <span className="relative z-10 mx-auto mt-0.5 grid place-items-center rounded-full bg-kit-stage p-0.5">
        <Check size={22} />
      </span>
      <div>
        <p className={`leading-[1.25] font-[600] tracking-[-0.02em] ${strong ? "text-[32px]" : "text-[24px]"}`}>
          {did} <span className="font-[460] text-kit-ink-muted">→ {result}</span>
        </p>
        {children}
      </div>
    </div>
  )
}

/** A hard crop of the product: one object, cut on the right and at the foot. */
function Crop({ children }: { children: React.ReactNode }) {
  return <div className="relative mt-5 h-[250px] overflow-hidden rounded-kit-object bg-kit-ground">{children}</div>
}
