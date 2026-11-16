"use client"

/*
 * 06 — The draft on a grey morning.
 *
 * From a reference: centred, confident type (one line, 64px, tracking far
 * tighter than the kit's), one pill, and the product sitting on a landscape
 * like a desktop wallpaper. Pushed into Quincy's register: the landscape is
 * drawn in the kit's own greys (hills at first light, no colour), so the one
 * accent stays the blue of the pen and of Approve. The draft window is cut
 * by the frame's bottom; Approve is in its header, the cursor rests on it,
 * and pressing it is the only change on the page.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { GitMergeIcon, Mic01Icon, Note01Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import * as React from "react"

import { Frame, InviteButton, PenLabel, Pointer } from "./frame"

/** Hills in ink at rising strength, over a sky that lightens to the horizon. */
function GreyMorning() {
  return (
    <div
      aria-hidden
      className="absolute inset-0"
      style={{
        background:
          "radial-gradient(60% 50% at 70% 78%, var(--kit-object) 0%, transparent 70%), linear-gradient(to bottom, color-mix(in oklch, var(--kit-ink) 16%, var(--kit-stage)), var(--kit-stage) 72%)",
      }}
    >
      <svg viewBox="0 0 1072 456" preserveAspectRatio="none" className="absolute inset-0 size-full">
        <path d="M0 300 C160 250 300 270 430 236 S700 250 820 222 1000 238 1072 228 V456 H0Z" className="fill-[color-mix(in_oklch,var(--kit-ink)_9%,var(--kit-stage))]" />
        <path d="M0 352 C120 318 260 330 400 300 S640 330 780 296 980 318 1072 300 V456 H0Z" className="fill-[color-mix(in_oklch,var(--kit-ink)_16%,var(--kit-stage))]" />
        <path d="M0 404 C180 370 330 392 520 360 S860 392 1072 362 V456 H0Z" className="fill-[color-mix(in_oklch,var(--kit-ink)_26%,var(--kit-stage))]" />
      </svg>
    </div>
  )
}

export function ApproveOnAGreyMorning() {
  const [approved, setApproved] = React.useState(false)

  return (
    <Frame>
      <span className="absolute top-7 left-16 text-[15px] font-kit-strong">Quincy</span>

      {/* Centred, confident, one line. */}
      <div className="absolute inset-x-0 top-[104px] flex flex-col items-center text-center">
        <h1 className="text-[64px] leading-[68px] font-[580] tracking-[-0.045em]">It waits for your yes.</h1>
        <p className="mt-4 text-[17px] leading-[26px] text-kit-ink-muted">
          Quincy writes the post in your voice. Nothing goes out until you press Approve.
        </p>
        <div className="mt-7 flex items-center gap-4">
          <InviteButton />
          <span className="text-kit-ink-muted">$49 a month</span>
        </div>
      </div>

      {/* The wallpaper frame, and the window on it, cut by its bottom. */}
      <div className="absolute top-[324px] left-16 h-[456px] w-[1072px] overflow-hidden rounded-kit-stage">
        <GreyMorning />
        <div className="absolute top-[104px] left-[236px] w-[600px] rounded-kit-object bg-kit-object shadow-kit-lifted">
          <div className="flex items-center gap-3 border-b border-kit-hairline px-kit-pad py-3.5">
            <div className="min-w-0 flex-1">
              <div className="font-kit-strong">Draft for LinkedIn</div>
              <div className="font-kit-mono text-kit-mono text-kit-ink-muted">
                from PR #412 · {approved ? "goes out Thu 08:00" : "waiting for you"}
              </div>
            </div>
            <button
              type="button"
              className="h-9 rounded-kit-control bg-kit-control px-3.5 font-kit-strong shadow-kit-control transition-[background-color] duration-(--kit-duration-press) hover:bg-kit-control-hover motion-reduce:transition-none"
            >
              Edit
            </button>
            <button
              type="button"
              aria-pressed={approved}
              onClick={() => setApproved((a) => !a)}
              className="relative inline-flex h-9 items-center gap-1.5 rounded-kit-control bg-kit-action px-3.5 font-kit-strong text-kit-action-on transition-[background-color] duration-(--kit-duration-press) hover:bg-kit-action-hover motion-reduce:transition-none"
            >
              <span
                data-off={approved ? undefined : ""}
                className="grid w-4 place-items-center overflow-hidden transition-[width,opacity] duration-(--kit-duration-state) ease-kit-out data-off:w-0 data-off:opacity-0 motion-reduce:transition-none"
              >
                <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} aria-hidden />
              </span>
              {approved ? "Approved" : "Approve"}
            </button>
          </div>
          <div className="px-kit-pad pt-5 pb-12 text-[16px] leading-[25px]">
            <div className="relative">
              <p>I cut our signup form from nine fields to three.</p>
              <PenLabel label="what I did" height={25} className="top-0 left-[calc(100%+30px)]" />
            </div>
            <div className="relative mt-5">
              <p>A week later, finished signups:</p>
              <p className="mt-1 text-[22px] leading-[28px] font-[600] tracking-[-0.02em] tabular-nums">41% → 68%</p>
              <p className="mt-1 text-kit-small text-kit-ink-muted">Your median week is 44%.</p>
              <PenLabel label="what happened" height={78} className="top-0 left-[calc(100%+30px)]" />
            </div>
            <div className="relative mt-5">
              <p>People weren’t lazy. The form was.</p>
              <PenLabel label="what it meant" height={25} className="top-0 left-[calc(100%+30px)]" />
              <p className="mt-5">
                Every field we removed had someone who once asked for it. Nobody
                had asked the people filling it in.
              </p>
            </div>
          </div>
        </div>
        <Pointer
          className="transition-[opacity] duration-(--kit-duration-state) motion-reduce:transition-none"
          style={{ left: 790, top: 140, opacity: approved ? 0 : 1 }}
        />
      </div>

      {/* First section: where the material comes from, in one row. */}
      <section className="absolute inset-x-16 top-[804px] flex items-baseline justify-between gap-10">
        <h2 className="shrink-0 text-[20px] leading-[26px] font-kit-strong tracking-[-0.015em]">
          You do the work. It finds the post.
        </h2>
        <div className="flex items-center gap-8 whitespace-nowrap">
          {[
            { icon: GitMergeIcon, t: "A merged pull request" },
            { icon: Mic01Icon, t: "A voice note" },
            { icon: Note01Icon, t: "A note you paste" },
          ].map((s) => (
            <span key={s.t} className="flex items-center gap-2">
              <HugeiconsIcon icon={s.icon} size={18} aria-hidden />
              {s.t}
            </span>
          ))}
        </div>
      </section>
      <p className="absolute inset-x-16 top-[846px] text-kit-ink-muted">
        Calls are not in yet. It drafts for X and LinkedIn, and every draft waits for you.
      </p>
    </Frame>
  )
}
