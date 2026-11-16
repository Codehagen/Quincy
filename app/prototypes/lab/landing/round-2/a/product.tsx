"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PlayIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import { Blob, Hl, Margin } from "../../round-1/a/marks"

/*
 * Group a's product bits for round 2: the same few Quincy screens, drawn in
 * kit tokens, so five pages can frame them five ways. One story runs through
 * all of them: a voice note about a signup form cut from nine fields to
 * three, the idea Quincy found in it, the draft in three beats, Approve, and
 * Thursday 08:00 on LinkedIn.
 */

export const NAV = ["Studio", "Ideas", "Week", "Numbers"] as const

export function Side({ active = "Studio", width = 176 }: { active?: (typeof NAV)[number]; width?: number }) {
  return (
    <nav style={{ width }} className="flex-none border-r border-kit-hairline bg-kit-object px-3.5 pt-5 text-[14px]">
      <div className="flex items-center gap-2 px-2">
        <Blob size={20} />
        <span className="font-[600]">Quincy</span>
      </div>
      <div className="mt-5 flex flex-col gap-0.5">
        {NAV.map((x) => (
          <div
            key={x}
            data-on={x === active || undefined}
            className="rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink-muted data-on:bg-kit-stage data-on:font-[560] data-on:text-kit-ink"
          >
            {x}
          </div>
        ))}
      </div>
    </nav>
  )
}

/** Who said it: a small grey line above a turn. */
export function Who({ children, quincy = false }: { children: React.ReactNode; quincy?: boolean }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-kit-ink-muted">
      {quincy ? <Blob size={18} /> : null}
      {quincy ? <span className="font-[600] text-kit-ink">Quincy</span> : null}
      <span>{children}</span>
    </div>
  )
}

const WAVE = [6, 10, 14, 9, 16, 20, 13, 8, 12, 18, 22, 15, 10, 6, 9, 14, 19, 12, 7, 11, 17, 21, 16, 9, 6, 10, 15, 11]

export function Wave({ bars = WAVE.length }: { bars?: number }) {
  return (
    <span className="flex flex-1 items-center gap-[2px]" aria-hidden>
      {WAVE.slice(0, bars).map((h, i) => (
        <span key={i} className="w-[3px] rounded-full bg-kit-mark" style={{ height: h }} />
      ))}
    </span>
  )
}

/** The voice note as it arrived: the player, then what was said. */
export function VoiceNote({
  sweep = false,
  width = 340,
  length = "0:48",
}: {
  sweep?: boolean
  width?: number
  length?: string
}) {
  return (
    <div style={{ width }} className="rounded-kit-object bg-kit-stage px-4 py-3.5 text-[14px] leading-[1.55]">
      <div className="flex items-center gap-3">
        <span className="grid size-7 flex-none place-items-center rounded-full bg-kit-object shadow-kit-control">
          <HugeiconsIcon icon={PlayIcon} size={12} strokeWidth={2} aria-hidden />
        </span>
        <Wave bars={22} />
        <span className="font-kit-mono text-[12px] text-kit-ink-muted">{length}</span>
      </div>
      <div className="mt-3 text-kit-ink-muted">
        &hellip;so we cut the signup form from nine fields to three. A week
        later 68% finish it, it used to be 41.
      </div>
      <div className="mt-1.5">
        <Hl sweep={sweep}>People weren&apos;t lazy. The form was.</Hl>
      </div>
    </div>
  )
}

/** The work receipt with the kit's done checks. */
export function Checks({ lines, size = 14 }: { lines: readonly (readonly [string, string])[]; size?: number }) {
  return (
    <div style={{ fontSize: size }} className="flex flex-col gap-2.5 leading-[1.4]">
      {lines.map(([did, result]) => (
        <div key={did} className="flex items-baseline gap-2.5">
          <span className="grid size-[16px] flex-none translate-y-[2px] place-items-center rounded-full bg-kit-success text-kit-success-on">
            <HugeiconsIcon icon={Tick02Icon} size={11} strokeWidth={2.6} aria-hidden />
          </span>
          <span>
            <span className="font-[560]">{did}</span>
            <span className="text-kit-ink-muted"> → {result}</span>
          </span>
        </div>
      ))}
    </div>
  )
}

export const RUN = [
  ["Listened", "0:48, one voice note"],
  ["Found ideas", "3 in what you said"],
  ["Checked your median", "44% finish in a usual week"],
  ["Drafted", "1 for LinkedIn, held for your read"],
] as const

/**
 * The draft in three beats, each named in blue pen in the margin to its
 * right. The number sits on its own line. `show` drives the pen; leave it
 * true for a still.
 */
export function Draft({
  width = 300,
  gap = 16,
  note = 120,
  show = true,
  size = 15,
  labels = ["what I did", "what happened", "what it meant"],
}: {
  width?: number
  gap?: number
  note?: number
  show?: boolean
  size?: number
  labels?: readonly [string, string, string]
}) {
  return (
    <div style={{ width, fontSize: size }} className="flex flex-col gap-3.5 leading-[1.5]">
      <Margin note={labels[0]} tone="pen" gap={gap} width={note} show={show}>
        <div>I cut our signup form from nine fields to three.</div>
      </Margin>
      <Margin note={labels[1]} tone="pen" gap={gap} width={note} show={show} delay={140}>
        <div>
          <div>A week later, finished signups:</div>
          <div className="mt-0.5 text-[1.6em] leading-[1.25] font-[600] tracking-[-0.02em] tabular-nums">41% → 68%</div>
          <div className="text-[0.87em] text-kit-ink-muted">Your median week is 44%.</div>
        </div>
      </Margin>
      <Margin note={labels[2]} tone="pen" gap={gap} width={note} show={show} delay={280}>
        <div>People weren&apos;t lazy. The form was.</div>
      </Margin>
    </div>
  )
}

/** Approve, Edit and where it would go. Approve is the view's one blue. */
export function ApproveRow({ approved = false, when = "Thu 08:00 · LinkedIn" }: { approved?: boolean; when?: string }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={`inline-flex h-9 items-center gap-1.5 rounded-kit-control px-4 text-[14px] font-[560] ${approved ? "bg-kit-control text-kit-ink shadow-kit-control" : "bg-kit-action text-kit-action-on"}`}
      >
        {approved ? <HugeiconsIcon icon={Tick02Icon} size={14} strokeWidth={2.4} aria-hidden /> : null}
        {approved ? "Approved" : "Approve"}
      </span>
      <span className="inline-flex h-9 items-center rounded-kit-control bg-kit-control px-4 text-[14px] font-[560] shadow-kit-control">
        Edit
      </span>
      <span className="ml-2 font-kit-mono text-[12px] text-kit-ink-muted">{when}</span>
    </div>
  )
}

export const IDEAS = [
  { title: "Nine fields to three", line: "The number: 41% to 68% in a week." },
  { title: "The field nobody could explain", line: "Company size, asked of everyone, read by no one." },
  { title: "Why it took a year to cut", line: "Every field had someone who wanted it." },
] as const

/** "3 ideas from your voice note", one picked. */
export function Ideas({ picked = 0, width = 360 }: { picked?: number; width?: number }) {
  return (
    <div style={{ width }} className="rounded-kit-object bg-kit-object p-1.5 shadow-kit-object">
      <div className="px-3 pt-2.5 pb-2 text-[13px] text-kit-ink-muted">3 ideas from your voice note</div>
      <div className="flex flex-col gap-0.5">
        {IDEAS.map((idea, i) => (
          <div
            key={idea.title}
            data-on={i === picked || undefined}
            className="rounded-kit-control px-3 py-2.5 text-[14px] leading-[1.45] data-on:bg-kit-stage"
          >
            <div className="font-[560]">{idea.title}</div>
            <div className="text-kit-ink-muted">{idea.line}</div>
          </div>
        ))}
      </div>
      <div className="flex justify-end px-1.5 pt-1.5 pb-1">
        <span className="inline-flex h-8 items-center rounded-kit-control-inner bg-kit-control px-3 text-[13px] font-[560] shadow-kit-control">
          Draft this idea
        </span>
      </div>
    </div>
  )
}

export const WEEK = [
  { day: "Mon", time: "08:00", what: "What I got wrong about onboarding emails", channel: "X" },
  { day: "Tue", time: "12:30", what: "Invoices in the customer's own currency", channel: "LinkedIn" },
  { day: "Wed", time: "08:00", what: null, channel: "X" },
  { day: "Thu", time: "08:00", what: "Nine fields to three", channel: "LinkedIn", focus: true },
  { day: "Fri", time: "09:00", what: null, channel: "LinkedIn" },
] as const

/** The week: one row per slot, Thursday is the draft you just approved. */
export function Week({ width = 420, landed = true }: { width?: number; landed?: boolean }) {
  return (
    <div style={{ width }} className="flex flex-col">
      {WEEK.map((s) => {
        const focus = "focus" in s && s.focus
        const what = focus && !landed ? null : s.what
        return (
          <div
            key={s.day}
            data-focus={(focus && landed) || undefined}
            className="flex items-center gap-4 border-b border-kit-hairline py-2.5 text-[14px] last:border-b-0 data-focus:-mx-3 data-focus:rounded-kit-control data-focus:border-transparent data-focus:bg-kit-stage data-focus:px-3"
          >
            <span className="w-9 font-[560]">{s.day}</span>
            <span className="w-12 font-kit-mono text-[12px] text-kit-ink-muted">{s.time}</span>
            <span className={`min-w-0 flex-1 truncate ${what ? "" : "text-kit-ink-muted"}`}>{what ?? "Open"}</span>
            <span className="text-[13px] text-kit-ink-muted">{s.channel}</span>
          </div>
        )
      })}
    </div>
  )
}

export const POSTS = [
  { hook: "I cut our signup form from nine fields to three.", views: "4,210", against: "3.4× your median", top: true },
  { hook: "Invoices now go out in the customer's own currency.", views: "2,050", against: "1.7× your median" },
  { hook: "We moved the annual toggle above the plans.", views: "1,310", against: "About your median" },
  { hook: "What I got wrong about onboarding emails.", views: "760", against: "0.6× your median" },
] as const

/** Posts against the person's own median. No follower count anywhere. */
export function Numbers({ width = 620, ring }: { width?: number; ring?: React.ReactNode }) {
  return (
    <div style={{ width }}>
      <div className="flex items-baseline justify-between">
        <div className="text-[15px] font-[600]">Last 30 days, LinkedIn</div>
        <div className="text-[13px] text-kit-ink-muted">Your median is 1,240 views at 48 hours.</div>
      </div>
      <div className="mt-4 flex flex-col">
        {POSTS.map((p) => (
          <div key={p.hook} className="flex items-center gap-6 border-t border-kit-hairline py-3 text-[14px]">
            <span className="min-w-0 flex-1 truncate">{p.hook}</span>
            <span className="w-14 text-right font-[600] tabular-nums">{p.views}</span>
            <span className={`w-[150px] text-right ${"top" in p && p.top ? "font-[560]" : "text-kit-ink-muted"}`}>
              {"top" in p && p.top && ring ? ring : p.against}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
