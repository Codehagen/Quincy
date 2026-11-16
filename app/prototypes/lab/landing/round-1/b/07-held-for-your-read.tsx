"use client"

/*
 * 07 — Held for your read.
 *
 * From a reference: a near-black page, centred two-beat type, one pill, and
 * a full app window (sidebar, conversation, side panel) directly under it,
 * where the agent shows its work as a checked receipt. Pushed into Quincy's:
 * the receipt is a run on a merged PR, and its last line is the product's
 * promise ("held for your read"). The side panel is the draft itself, in
 * three beats, with nothing sent. The one accent is the green of the checks
 * (the kit's done colour). Dark mode is the kit's own remap, not new colours.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Frame, InviteButton } from "./frame"

const RECEIPT = [
  ["Read PR #412", "6 fields removed, 212 lines"],
  ["Found ideas", "3, named by the PR"],
  ["Checked your median", "44% finish in a usual week"],
  ["Drafted", "1 for LinkedIn, held for your read"],
] as const

export function HeldForYourRead() {
  return (
    <Frame dark>
      <span className="absolute top-7 left-16 text-[15px] font-kit-strong">Quincy</span>

      <div className="absolute inset-x-0 top-[92px] flex flex-col items-center text-center">
        <h1 className="text-[68px] leading-[72px] font-[580] tracking-[-0.05em]">Held for your read.</h1>
        <p className="mt-4 max-w-[560px] text-[17px] leading-[26px] text-kit-ink-muted">
          Quincy reads what you merged, said or pasted, drafts the post in your
          voice, and stops there. You send it.
        </p>
        <div className="mt-7 flex items-center gap-4">
          <InviteButton />
          <span className="text-kit-ink-muted">$49 a month</span>
        </div>
      </div>

      {/* The app window, cut by the section line under it. */}
      <div className="absolute top-[340px] left-[72px] h-[410px] w-[1056px] overflow-hidden rounded-t-kit-object bg-kit-object shadow-kit-object">
        <div className="flex h-9 items-center gap-1.5 border-b border-kit-hairline px-4">
          {[0, 1, 2].map((i) => (
            <span key={i} className="size-2.5 rounded-full bg-kit-chrome" />
          ))}
          <span className="mx-auto font-kit-mono text-kit-mono text-kit-ink-muted">hirequincy.com/studio</span>
        </div>
        <div className="flex h-full">
          <nav className="flex w-[180px] shrink-0 flex-col gap-1 border-r border-kit-hairline px-3 pt-4">
            {["Studio", "Ideas", "Lineup", "Numbers", "Brain"].map((n) => (
              <span
                key={n}
                data-on={n === "Studio" || undefined}
                className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-control-hover data-on:font-kit-strong data-on:text-kit-ink"
              >
                {n}
              </span>
            ))}
          </nav>

          <div className="min-w-0 flex-1 px-8 pt-6">
            <div className="text-right text-kit-small text-kit-ink-muted">You · 14:04</div>
            <div className="mt-1.5 ml-auto w-fit max-w-[360px] rounded-kit-object bg-kit-well px-4 py-2.5">
              Merged the signup form. Is there a post in it?
            </div>

            <div className="mt-6 text-kit-small text-kit-ink-muted">Quincy</div>
            <ul className="mt-2.5 flex flex-col gap-2.5">
              {RECEIPT.map(([what, result]) => (
                <li key={what} className="flex items-center gap-2.5">
                  <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-kit-success text-kit-success-on">
                    <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} aria-hidden />
                  </span>
                  <span className="font-kit-strong">{what}</span>
                  <span className="text-kit-ink-muted">→ {result}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5">
              Nothing went out. The draft is parked for Thursday at 08:00 and
              waits for you.
            </p>
          </div>

          {/* The side panel: the draft itself. */}
          <aside className="w-[320px] shrink-0 border-l border-kit-hairline px-6 pt-6">
            <div className="flex items-baseline justify-between">
              <span className="font-kit-strong">Draft for LinkedIn</span>
              <span className="font-kit-mono text-kit-mono text-kit-ink-muted">Thu 08:00</span>
            </div>
            <div className="mt-4 flex flex-col gap-3.5">
              <p>I cut our signup form from nine fields to three.</p>
              <div>
                <p>A week later, finished signups:</p>
                <p className="mt-1 text-kit-figure tabular-nums">41% → 68%</p>
                <p className="text-kit-small text-kit-ink-muted">Your median week is 44%.</p>
              </div>
              <p>People weren’t lazy. The form was.</p>
            </div>
            <div className="mt-5 flex gap-1.5">
              <span className="rounded-kit-control bg-kit-control px-3 py-1.5 font-kit-strong shadow-kit-control">Approve</span>
              <span className="rounded-kit-control px-3 py-1.5 text-kit-ink-muted">Edit</span>
            </div>
          </aside>
        </div>
      </div>

      {/* First section: two beats, then the facts. */}
      <section className="absolute inset-x-[72px] top-[750px] bottom-0 grid grid-cols-[1fr_1.25fr] gap-14 border-t border-kit-hairline pt-9">
        <div>
          <h2 className="text-[22px] leading-[28px] font-kit-strong tracking-[-0.02em]">It shows its work. You decide.</h2>
          <p className="mt-2 text-kit-ink-muted text-pretty">
            Every run ends in a receipt: what it read, what it made, and what it
            is holding for you.
          </p>
        </div>
        <dl className="grid grid-cols-2 gap-x-8 gap-y-3 pt-1 whitespace-nowrap">
          {[
            ["Posts to", "X and LinkedIn"],
            ["Works from", "PRs, voice, notes"],
            ["Measures", "Your own median"],
            ["Sends", "Only when you approve"],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <dt className="w-[84px] shrink-0 text-kit-ink-muted">{k}</dt>
              <dd className="font-kit-strong">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Frame>
  )
}
