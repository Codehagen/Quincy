"use client"

/*
 * 08 — The week is the hero, and the headline is the empty day in it.
 *
 * The screen: the Lineup, Monday to Friday, wider than the frame so Monday
 * and Friday are cut by its edges. Wednesday, the middle column, has no post
 * yet, and the headline is written into that slot in Quincy's own words. The
 * one accent is the live dot on Thursday, where Quincy is drafting from a
 * voice note right now. Numbers on the sent posts are against the person's
 * own median, and the section below says that out loud.
 */

import type * as React from "react"

import { LiveDot } from "@/components/kit"

import { Frame, InviteButton, TopLine } from "./frame"

const COL = 300
const GAP = 14
const LEFT = (1200 - (5 * COL + 4 * GAP)) / 2

function Slot({ time, title, children }: { time: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object">
      <div className="font-kit-mono text-kit-mono text-kit-ink-muted">{time}</div>
      <div className="mt-1.5 font-kit-strong text-pretty">{title}</div>
      {children}
    </div>
  )
}

export function WednesdayIsOpen() {
  return (
    <Frame>
      <TopLine />

      <div className="absolute inset-x-16 top-[96px] flex items-baseline justify-between">
        <span className="font-kit-strong">This week</span>
        <span className="font-kit-mono text-kit-mono text-kit-ink-muted">hirequincy.com/lineup</span>
      </div>

      <div className="absolute top-[132px] h-[392px] bg-kit-stage" style={{ left: 0, right: 0 }} />
      <div className="absolute top-[132px] flex" style={{ left: LEFT, gap: GAP }}>
        {/* Monday, cut by the left edge. */}
        <div style={{ width: COL }} className="flex flex-col gap-3 pt-5">
          <div className="pl-1 font-kit-mono text-kit-mono text-kit-ink-muted">Mon</div>
          <Slot time="08:00 · X" title="Our tests run before anyone has coffee">
            <p className="mt-3 text-kit-small text-kit-ink-muted">Sent. 9 replies, your median is 6.</p>
          </Slot>
        </div>
        <div style={{ width: COL }} className="flex flex-col gap-3 pt-5">
          <div className="pl-1 font-kit-mono text-kit-mono text-kit-ink-muted">Tue</div>
          <Slot time="08:00 · LinkedIn" title="Signup form, nine fields to three">
            <p className="mt-3 text-kit-small text-kit-ink-muted">Sent. 31 replies, your median is 6.</p>
          </Slot>
          <Slot time="17:30 · X" title="The six fields, and who asked for each">
            <p className="mt-3 text-kit-small text-kit-ink-muted">Sent. 4 replies, your median is 6.</p>
          </Slot>
        </div>

        {/* Wednesday: the empty slot carries the headline. */}
        <div style={{ width: COL }} className="flex flex-col gap-3 pt-5">
          <div className="pl-1 font-kit-mono text-kit-mono text-kit-ink">Wed · today</div>
          <div className="flex h-[318px] flex-col justify-between rounded-kit-object border-[1.5px] border-dashed border-kit-mark p-6">
            <h1 className="text-[36px] leading-[40px] font-kit-strong tracking-[-0.03em] text-balance">
              Wednesday is open.
            </h1>
            <div>
              <p className="text-[16px] leading-[24px] text-kit-ink-muted text-pretty">
                Tell me about your week. I’ll find the post in it, draft it, and
                hold it here until you say yes.
              </p>
              <div className="mt-5">
                <InviteButton />
              </div>
            </div>
          </div>
        </div>

        <div style={{ width: COL }} className="flex flex-col gap-3 pt-5">
          <div className="pl-1 font-kit-mono text-kit-mono text-kit-ink-muted">Thu</div>
          <div className="rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object">
            <LiveDot pulse>
              <span className="font-kit-strong">Drafting</span>
            </LiveDot>
            <p className="mt-1.5 text-kit-ink-muted">From your voice note, 0:48</p>
            <div className="mt-4 h-2 w-[86%] rounded-full bg-kit-skeleton" />
            <div className="mt-2 h-2 w-[64%] rounded-full bg-kit-skeleton" />
            <div className="mt-2 h-2 w-[72%] rounded-full bg-kit-skeleton" />
          </div>
        </div>
        {/* Friday, cut by the right edge. */}
        <div style={{ width: COL }} className="flex flex-col gap-3 pt-5">
          <div className="pl-1 font-kit-mono text-kit-mono text-kit-ink-muted">Fri</div>
          <Slot time="12:00 · LinkedIn" title="Deleting 212 lines was the feature">
            <p className="mt-3 text-kit-small text-kit-ink-muted">Waiting for your yes.</p>
          </Slot>
        </div>
      </div>

      <p className="absolute top-[548px] left-16 w-[560px] text-kit-ink-muted text-pretty">
        Quincy plans the week from what you shipped and what you said. It drafts
        for X and LinkedIn. Nothing on this page goes out until you approve it.
      </p>

      {/* First section: numbers against your own median, as sentences. */}
      <section className="absolute inset-x-16 top-[640px] bottom-0 grid grid-cols-[340px_1fr] gap-16 border-t border-kit-hairline pt-10">
        <div>
          <h2 className="text-[20px] leading-[26px] font-kit-strong tracking-[-0.015em]">
            Every number is against your own median.
          </h2>
          <p className="mt-3 text-kit-ink-muted text-pretty">
            Not a follower count. The feed judges each post, so Quincy compares
            each post with your usual one.
          </p>
        </div>
        <ul className="flex flex-col">
          {[
            ["Signup form, nine fields to three", "31 replies", "5.2× your median"],
            ["Our tests run before anyone has coffee", "9 replies", "1.5× your median"],
            ["The six fields, and who asked for each", "4 replies", "under your median"],
          ].map(([t, n, m]) => (
            <li key={t} className="flex items-baseline gap-4 border-b border-kit-hairline py-3 last:border-b-0">
              <span className="min-w-0 flex-1 truncate">{t}</span>
              <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{n}</span>
              <span className="w-[150px] text-right font-kit-strong tabular-nums">{m}</span>
            </li>
          ))}
        </ul>
      </section>
    </Frame>
  )
}
