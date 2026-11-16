"use client"

import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { Card, Highlight, Mono, Stage, Text } from "@/components/kit"

import { Bar } from "./bar"
import { Frame } from "./frame"

/**
 * 13 · The number is the hero. 6.3 million at display size, and beside it
 * the three versions that got 70,000, drawn to the same scale as hairline
 * bars so the gap is seen before it is read. The point of the number is
 * its cause, so the highlighter (the piece's one accent) goes on the cause:
 * "Same idea, different first line." Then the product as the proof: one
 * idea, its first line written three ways, and you pick.
 */
const VERSIONS = [
  { label: "Version 1", views: 70_000 },
  { label: "Version 2", views: 70_000 },
  { label: "Version 3", views: 70_000 },
  { label: "Version 4", views: 6_300_000 },
] as const
const TALL = 300

export function FirstLine() {
  return (
    <Frame>
      <Bar />

      <div className="grid grid-cols-[1fr_340px] items-end gap-16 px-16 pt-10">
        <div>
          <p className="text-[17px] leading-[26px] text-kit-ink-muted">
            The same message, posted four times with small changes.
          </p>
          <p
            className="mt-2 text-[212px] leading-[0.86] font-[640] tracking-[-0.06em] text-kit-ink tabular-nums"
            aria-label="6.3 million views"
          >
            6.3M
          </p>
          <p className="mt-6 max-w-[620px] text-[30px] leading-[38px] font-[560] tracking-[-0.025em] text-pretty text-kit-ink">
            Three averaged 70,000 views. The fourth did 6.3 million.{" "}
            <Highlight>Same idea, different first line.</Highlight>
          </p>
          <p className="mt-3 text-kit-small text-kit-ink-muted">
            Gary Vaynerchuk&apos;s numbers, from his own posts.
          </p>
        </div>

        {/* To scale: 70,000 is 1.1% of 6.3 million, so the three short bars
            are hairlines. That is the argument, so it is not exaggerated. */}
        <div aria-hidden className="flex h-[360px] items-end gap-5 pb-[78px]">
          {VERSIONS.map((v) => (
            <div key={v.label} className="flex flex-1 flex-col items-center gap-2">
              <div
                className={`w-full rounded-t-[3px] ${v.views > 1_000_000 ? "bg-kit-ink" : "bg-kit-ink-muted"}`}
                style={{ height: Math.max(2, (v.views / 6_300_000) * TALL) }}
              />
              <Mono>{v.views > 1_000_000 ? "6.3M" : "70K"}</Mono>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 grid grid-cols-[340px_1fr] gap-16 px-16">
        <div className="pt-8">
          <Text weight="strong">Quincy writes the first line three ways.</Text>
          <p className="mt-2 text-pretty text-kit-ink-muted">
            Each idea it finds in your week comes with three openings. You pick
            one, change it if you like, and send it. Afterwards you see how it
            did against your own median, never against a follower count.
          </p>
        </div>

        <Stage>
          <Card crop="bottom">
            <div className="flex items-baseline justify-between">
              <Text as="span" weight="strong">An idea from your voice note</Text>
              <Mono>walk-tuesday.m4a · 4:12</Mono>
            </div>
            <Text tone="muted">Nobody reads the onboarding email. They answer a question.</Text>
            <ul className="mt-4 flex flex-col gap-1.5" aria-label="Three first lines">
              {[
                { line: "I deleted our onboarding email and sent one question instead.", picked: true },
                { line: "Our welcome email had nine links. Nobody clicked any of them.", picked: false },
                { line: "What is the one thing you hoped this tool would do?", picked: false },
              ].map((o, i) => (
                <li
                  key={i}
                  className={`flex items-center gap-3 rounded-kit-control px-3 py-2.5 ${o.picked ? "bg-kit-well" : ""}`}
                >
                  <span className="w-4 shrink-0 text-kit-ink">
                    {o.picked ? <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} aria-label="Picked" /> : null}
                  </span>
                  <Text as="span" weight={o.picked ? "strong" : "regular"}>
                    {o.line}
                  </Text>
                </li>
              ))}
            </ul>
            <div className="h-24" />
          </Card>
        </Stage>
      </div>
    </Frame>
  )
}
