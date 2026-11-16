"use client"

/*
 * 09 — A phone rising out of the bottom of the hero, with the pen outside it.
 *
 * The screen: Quincy on a phone, the morning after a walk. A voice note at
 * the top, and under it the draft Quincy made from it. The phone is cut by
 * the hero's bottom edge. Quincy's pen does not stay inside the screen: the
 * three beat labels are written on the page beside the phone, the way an
 * editor writes in the margin of a printout. The pen is the one accent.
 * The words sit left and are smaller than the phone.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon } from "@hugeicons/core-free-icons"

import { Frame, InviteButton, PenLabel, TopLine } from "./frame"

const WAVE = [6, 10, 14, 9, 16, 20, 13, 8, 12, 18, 22, 15, 10, 6, 9, 14, 19, 12, 7, 11, 17, 21, 16, 9, 6, 10]

export function ThePenOutsideThePhone() {
  return (
    <Frame>
      <TopLine />

      <div className="absolute top-[170px] left-16 w-[400px]">
        <h1 className="text-[44px] leading-[48px] font-kit-strong tracking-[-0.03em] text-balance">
          Say it on a walk. Read it as a post.
        </h1>
        <p className="mt-5 text-[16px] leading-[25px] text-kit-ink-muted text-pretty">
          Record a voice note. Quincy keeps your words, finds the idea in them,
          and drafts it in three beats. Nothing goes out until you approve it.
        </p>
        <div className="mt-8">
          <InviteButton />
        </div>
      </div>

      {/* The stage the phone stands in, ending on the hero's edge. */}
      <div className="absolute top-[96px] right-16 left-[520px] h-[520px] overflow-hidden rounded-t-kit-stage bg-kit-stage">
        {/* The phone. Its bottom is cut by the stage's edge. */}
        <div className="absolute top-[52px] left-[86px] w-[330px] rounded-[52px] bg-kit-ink p-[10px] shadow-kit-lifted">
          <div className="h-[560px] overflow-hidden rounded-[42px] bg-kit-object px-5 pt-4">
            <div className="flex items-center justify-between px-2 font-kit-mono text-kit-mono">
              <span className="text-kit-ink">07:52</span>
              <span className="h-[22px] w-[92px] rounded-full bg-kit-ink" aria-hidden />
              <span className="w-[34px]" aria-hidden />
            </div>

            <div className="mt-6 text-kit-small text-kit-ink-muted">You · voice note</div>
            <div className="mt-1.5 flex items-center gap-3 rounded-kit-control bg-kit-well px-3 py-2.5">
              <span className="grid size-7 place-items-center rounded-full bg-kit-object shadow-kit-control">
                <HugeiconsIcon icon={PlayIcon} size={13} strokeWidth={2} aria-hidden />
              </span>
              <span className="flex flex-1 items-center gap-[2px]" aria-hidden>
                {WAVE.map((h, i) => (
                  <span key={i} className="w-[3px] rounded-full bg-kit-mark" style={{ height: h }} />
                ))}
              </span>
              <span className="font-kit-mono text-kit-mono text-kit-ink-muted">0:48</span>
            </div>

            <div className="mt-6 text-kit-small text-kit-ink-muted">Quincy · draft for LinkedIn</div>
            <div className="mt-2 flex flex-col gap-4 text-[15px] leading-[22px]">
              <p data-beat="did">I cut our signup form from nine fields to three.</p>
              <div data-beat="happened">
                <p>A week later, finished signups:</p>
                <p className="mt-1 text-kit-figure tabular-nums">41% → 68%</p>
                <p className="text-kit-small text-kit-ink-muted">Your median week is 44%.</p>
              </div>
              <p data-beat="meant">People weren’t lazy. The form was.</p>
            </div>
          </div>
        </div>

        {/* The pen, on the page beside the phone. Heights match the lines. */}
        <PenLabel label="what I did" height={44} style={{ left: 436, top: 242 }} />
        <PenLabel label="what happened" height={66} style={{ left: 436, top: 302 }} />
        <PenLabel label="what it meant" height={22} style={{ left: 436, top: 384 }} />
      </div>

      {/* First section: the one plan, as plain facts. */}
      <section className="absolute inset-x-16 top-[616px] bottom-0 border-t border-kit-hairline pt-11">
        <div className="grid grid-cols-[1fr_2fr] gap-16">
          <div>
            <h2 className="text-[20px] leading-[26px] font-kit-strong tracking-[-0.015em]">One plan.</h2>
            <p className="mt-2 text-[28px] leading-[34px] font-kit-strong tracking-[-0.02em] tabular-nums">
              $49 <span className="text-[16px] font-kit-regular tracking-normal text-kit-ink-muted">a month</span>
            </p>
            <p className="mt-2 text-kit-small text-kit-ink-muted">US dollars, billed monthly. Invites go out in small groups.</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-12 gap-y-5">
            {[
              ["Where it posts", "X and LinkedIn. Nothing else yet."],
              ["What it works from", "Pull requests you merged, voice notes, notes you paste."],
              ["Who sends", "You. Every draft waits for your yes."],
              ["What it measures", "Each post against your own median, never followers."],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="font-kit-strong">{k}</dt>
                <dd className="mt-1 text-kit-ink-muted text-pretty">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </Frame>
  )
}
