"use client"

/*
 * 27 — Dark above, paper below.
 *
 * Grows from 07: a near-black hero, centred two-beat type, and the full app
 * window (sidebar, conversation with the checked receipt, the draft in a side
 * panel). Here the window is the seam. It starts on the dark hero and its
 * lower half lies on a light page, so everything under it reads as paper an
 * editor has marked: the run in three columns, the numbers as a table, the
 * one plan as a short contract. The page closes dark again, so the dark band
 * bookends the paper.
 *
 * Pictures after Stageshow: a wide hero window at 1:1, then pinned bottom
 * bleed per column (one object each, cut by its stage's foot).
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon } from "@hugeicons/core-free-icons"

import { Hl, Margin, Ring } from "../../round-1/a/marks"
import { Bars, Chrome, Cta, DraftActions, Footer, PRICE, Receipt, REFUSALS, TopLine } from "./bits"
import { Scroll } from "./scroll"

const RUN = [
  ["Read PR #412", "6 fields removed, 212 lines"],
  ["Found ideas", "3, named by the PR"],
  ["Checked your median", "44% finish in a usual week"],
  ["Drafted", "1 for LinkedIn, held for your read"],
] as const

export function DarkAbovePaperBelow() {
  return (
    <Scroll>
      {/* The dark band: hero, and the top half of the window. */}
      <div className="dark bg-kit-ground pb-[300px] text-kit-ink">
        <TopLine />
        <section className="flex flex-col items-center pt-14 text-center">
          <h1 className="text-[70px] leading-[1.02] font-[600] tracking-[-0.055em]">It writes the post. You send it.</h1>
          <p className="mt-6 max-w-[54ch] text-[18px] leading-[1.5] text-kit-ink-muted text-balance">
            Quincy reads what you merged, said or pasted, drafts the post in your
            voice and holds it for your read.
          </p>
          <div className="mt-9 flex items-center gap-4">
            <Cta />
            <span className="text-[15px] text-kit-ink-muted">$49 a month</span>
          </div>
        </section>
      </div>

      {/* The window, lying across the seam. It stays dark on the paper. */}
      <div className="relative z-10 -mt-[240px] px-[60px]">
        <div className="dark h-[480px] overflow-hidden rounded-[22px] bg-kit-object text-kit-ink shadow-kit-object">
          <Chrome url="hirequincy.com/studio" />
          <div className="flex h-full">
            <nav className="flex w-[190px] flex-none flex-col gap-1 border-r border-kit-hairline px-3 pt-4 text-[14px]">
              {["Studio", "Ideas", "Week", "Numbers", "Brain"].map((n) => (
                <span
                  key={n}
                  data-on={n === "Studio" || undefined}
                  className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-control-hover data-on:font-[560] data-on:text-kit-ink"
                >
                  {n}
                </span>
              ))}
            </nav>

            <div className="min-w-0 flex-1 px-9 pt-7 text-[14px] leading-[1.5]">
              <div className="text-right text-[12px] text-kit-ink-muted">You · 14:04</div>
              <div className="mt-1.5 ml-auto w-fit max-w-[360px] rounded-kit-object bg-kit-well px-4 py-2.5">
                Merged the signup form. Is there a post in it?
              </div>
              <div className="mt-7 text-[12px] text-kit-ink-muted">Quincy</div>
              <div className="mt-3">
                <Receipt lines={RUN} tone="done" />
              </div>
              <p className="mt-5 max-w-[46ch]">
                Nothing went out. The draft is parked for Thursday at 08:00 and
                waits for you.
              </p>
            </div>

            <aside className="w-[380px] flex-none border-l border-kit-hairline px-7 pt-7 text-[14px] leading-[1.5]">
              <div className="flex items-baseline justify-between">
                <span className="font-[560]">Draft for LinkedIn</span>
                <span className="font-kit-mono text-[12px] text-kit-ink-muted">Thu 08:00</span>
              </div>
              <div className="mt-5 flex w-[200px] flex-col gap-4">
                <Margin note="did" tone="pen" gap={14} width={100}>
                  <p>I cut our signup form from nine fields to three.</p>
                </Margin>
                <Margin note="happened" tone="pen" gap={14} width={100}>
                  <div>
                    <p>A week later, finished signups:</p>
                    <p className="mt-1 text-[20px] leading-[1.3] font-[600] tabular-nums">41% → 68%</p>
                    <p className="text-[12px] text-kit-ink-muted">Your median week is 44%.</p>
                  </div>
                </Margin>
                <Margin note="meant" tone="pen" gap={14} width={100}>
                  <p>People weren&apos;t lazy. The form was.</p>
                </Margin>
              </div>
              <div className="mt-6">
                <DraftActions />
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* Paper: the run, in three columns. */}
      <section className="px-[60px] pt-28">
        <div className="grid grid-cols-[1fr_1fr] items-end gap-16 border-b border-kit-hairline pb-8">
          <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">One merge, read closely.</h2>
          <p className="text-[16px] leading-[1.6] text-kit-ink-muted">
            Quincy marks up your material the way an editor would: the line that
            matters, the ideas in it, and the draft in three beats.
          </p>
        </div>

        <div className="mt-10 grid grid-cols-3 gap-5">
          <Column n="1" title="Your material" note="A merged PR, a voice note, or notes you paste.">
            <div className="flex items-center gap-2 font-kit-mono text-[11px] text-kit-ink-muted">
              <HugeiconsIcon icon={GitMergeIcon} size={13} strokeWidth={2} aria-hidden />
              #412 merged Tuesday
            </div>
            <div className="mt-2 text-[15px] leading-[1.35] font-[600]">Cut the signup form to three fields</div>
            <p className="mt-3 text-[14px] leading-[1.6]">
              Removes company, role, team size, phone, country and referral.{" "}
              <Hl>Finished signups went from 41% to 68% in the first week.</Hl>
            </p>
            <div className="mt-4">
              <Bars widths={[90, 72, 84, 50]} />
            </div>
          </Column>

          <Column n="2" title="The ideas in it" note="Named by where they came from.">
            <div className="text-[12px] text-kit-ink-muted">3 ideas from #412</div>
            <div className="mt-3 flex flex-col gap-1 text-[14px] leading-[1.45]">
              <div className="rounded-kit-control bg-kit-well px-3 py-2.5">
                <Ring tone="pen">People weren&apos;t lazy.</Ring> The form was.
              </div>
              <div className="rounded-kit-control px-3 py-2.5">The six questions nobody missed</div>
              <div className="px-3 py-2.5">
                <Bars widths={[66]} />
              </div>
            </div>
          </Column>

          <Column n="3" title="The draft" note="Did, happened, meant, in your voice.">
            <div className="text-[12px] text-kit-ink-muted">Draft for LinkedIn</div>
            <div className="mt-3 flex w-[160px] flex-col gap-3 text-[14px] leading-[1.5]">
              <Margin note="did" tone="pen" gap={12} width={80}>
                <p>I cut our signup form from nine fields to three.</p>
              </Margin>
              <Margin note="happened" tone="pen" gap={12} width={80}>
                <p className="text-[20px] leading-[1.3] font-[600] tabular-nums">41% → 68%</p>
              </Margin>
              <Margin note="meant" tone="pen" gap={12} width={80}>
                <p>People weren&apos;t lazy. The form was.</p>
              </Margin>
            </div>
          </Column>
        </div>

        {/* Approve, then the week: one long row under the three columns. */}
        <div className="mt-5 flex items-center gap-8 rounded-kit-stage bg-kit-stage px-8 py-6">
          <DraftActions approved />
          <span className="text-kit-ink-muted">→</span>
          <div className="grid flex-1 grid-cols-5 gap-2 text-[12px]">
            {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => (
              <div
                key={d}
                data-on={d === "Thu" || undefined}
                className="flex h-14 flex-col justify-center rounded-kit-control border border-dashed border-kit-ink-muted/30 px-3 data-on:border-solid data-on:border-transparent data-on:bg-kit-object data-on:shadow-kit-object"
              >
                <span className="text-kit-ink-muted">{d}</span>
                {d === "Thu" ? <span className="font-[560]">08:00 · LinkedIn</span> : null}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Paper: the numbers, as a table. */}
      <section className="px-[60px] pt-28">
        <div className="grid grid-cols-[360px_1fr] gap-16">
          <div>
            <h2 className="text-[40px] leading-[1.1] font-[600] tracking-[-0.04em]">Your median. Nobody else&apos;s.</h2>
            <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted">
              A feed judges the post, not the account. So every number Quincy
              shows you is that post against your usual one.
            </p>
            <p className="mt-4 text-[16px] leading-[1.6] text-kit-ink-muted">
              There is no follower column. It was left out on purpose.
            </p>
          </div>
          <div className="overflow-hidden rounded-kit-object bg-kit-object shadow-kit-object">
            <div className="grid grid-cols-[1fr_110px_140px] border-b border-kit-hairline px-6 py-3 text-[12px] text-kit-ink-muted">
              <span>Post</span>
              <span>Where</span>
              <span className="text-right">Against your median</span>
            </div>
            {[
              ["People weren't lazy. The form was.", "LinkedIn", "2.8×", true],
              ["The six questions nobody missed", "X", "1.1×", false],
              ["We moved the annual toggle above the plans", "LinkedIn", "0.9×", false],
              ["Why old invoices stay in dollars", "X", "1.4×", false],
            ].map(([post, where, x, hi]) => (
              <div
                key={post as string}
                className="grid grid-cols-[1fr_110px_140px] items-center border-b border-kit-hairline px-6 py-4 text-[14px] last:border-b-0"
              >
                <span className={hi ? "font-[560]" : undefined}>{hi ? <Hl>{post}</Hl> : post}</span>
                <span className="text-kit-ink-muted">{where}</span>
                <span className="text-right font-[600] tabular-nums">{x}</span>
              </div>
            ))}
            <div className="px-6 py-4">
              <Bars widths={[48]} />
            </div>
          </div>
        </div>
      </section>

      {/* Paper: depth, stated as the aim. */}
      <section className="mx-[60px] mt-28 grid grid-cols-[360px_1fr] gap-16 border-t border-kit-hairline pt-10">
        <h2 className="text-[24px] leading-[1.25] font-[600] tracking-[-0.02em]">What it is for, in the end</h2>
        <p className="max-w-[60ch] text-[17px] leading-[1.6]">
          Views are rented. The people who reply to you are yours. Next we are
          building the part that knows who keeps showing up, and drafts a reply
          for each of them. That part is not built yet, and it will wait for
          your send too.
        </p>
      </section>

      {/* Paper: the one plan, as a short contract. */}
      <section className="px-[60px] pt-28">
        <div className="grid grid-cols-[360px_1fr] gap-16 rounded-kit-stage bg-kit-stage p-12">
          <div>
            <h2 className="text-[24px] leading-[1.25] font-[600] tracking-[-0.02em]">One plan</h2>
            <p className="mt-6 text-[64px] leading-[1] font-[600] tracking-[-0.045em] tabular-nums">{PRICE.figure}</p>
            <p className="mt-2 text-[15px] text-kit-ink-muted">
              {PRICE.period}. {PRICE.currency}.
            </p>
            <p className="mt-6 text-[15px] leading-[1.6]">
              X and LinkedIn. Merged PRs, voice notes and notes you paste. Invites
              go out in small groups.
            </p>
          </div>
          <ol className="grid grid-cols-2 gap-x-10 gap-y-7">
            {REFUSALS.map((r, i) => (
              <li key={r.never} className="flex gap-3">
                <span className="font-kit-mono text-[12px] leading-[22px] text-kit-ink-muted">{i + 1}</span>
                <div>
                  <p className="text-[15px] font-[560]">{r.never}</p>
                  <p className="mt-1 text-[14px] leading-[1.55] text-kit-ink-muted">{r.because}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* The dark band again, to close. */}
      <div className="dark mt-28 bg-kit-ground text-kit-ink">
        <section className="flex flex-col items-center px-[60px] pt-28 pb-28 text-center">
          <h2 className="text-[52px] leading-[1.05] font-[600] tracking-[-0.05em]">Held for your read.</h2>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.55] text-kit-ink-muted text-balance">
            Invites go out in small groups, in the order people asked.
          </p>
          <div className="mt-9">
            <Cta />
          </div>
        </section>
        <Footer />
      </div>
    </Scroll>
  )
}

/** One column of the run: a caption over a stage with one object cut by its foot. */
function Column({
  n,
  title,
  note,
  children,
}: {
  n: string
  title: string
  note: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="flex items-baseline gap-3">
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{n}</span>
        <h3 className="text-[17px] font-[600] tracking-[-0.01em]">{title}</h3>
      </div>
      <p className="mt-1 pl-[22px] text-[14px] text-kit-ink-muted">{note}</p>
      <div className="relative mt-5 h-[330px] overflow-hidden rounded-kit-stage bg-kit-stage">
        <div className="absolute inset-x-6 top-6 h-[360px] rounded-kit-object bg-kit-object px-5 pt-5 shadow-kit-object">
          {children}
        </div>
      </div>
    </div>
  )
}
