"use client"

import { Card, Highlight, Mono, SkeletonLines, Text } from "@/components/kit"

import { Bar } from "./bar"
import { literata } from "./fonts"
import { Frame } from "./frame"

/**
 * 15 · A quiet editorial column. The argument is written as the opening of
 * an essay someone signed, in Literata, a serif drawn for reading on
 * screens: the register of a column, which a pitch never reaches for. The
 * receipt sits inside the prose where an essayist would put it, and the
 * highlighter (the one accent) marks the one sentence the essay exists
 * for. Quincy reads the page like an editor would: a graphite note in the
 * margin beside that sentence. The product comes after, in three short
 * columns and one draft that is still waiting for you.
 */
const SERIF = literata.style.fontFamily

export function Column() {
  return (
    <Frame>
      <div className={literata.variable}>
        <Bar />

        <div className="px-16 pt-10">
          <Text variant="small" tone="muted">Why Quincy exists</Text>

          <div className="mt-4 grid grid-cols-[660px_1fr] gap-x-14">
            <div style={{ fontFamily: SERIF }}>
              <h1 className="text-[52px] leading-[58px] font-[500] tracking-[-0.02em] text-balance text-kit-ink">
                The feed stopped reading followers.
              </h1>
              <p className="mt-4 text-[22px] leading-[32px] italic text-pretty text-kit-ink-muted">
                It reads the post now. That changes what the work is.
              </p>
            </div>
            <div />

            <div className="mt-8 text-[19px] leading-[31px] text-pretty text-kit-ink" style={{ fontFamily: SERIF }}>
              <p>
                Your feed used to show you the people you follow. Now it shows
                you whatever it thinks you will watch next. Gary Vaynerchuk
                tested it with one video, posted to his main account and to a
                new one with no history. The main account got 300,000 views.{" "}
                <Highlight>The new one got 9.4 million.</Highlight>
              </p>
              <p className="mt-4">
                So the scarce thing is not an audience. It is an original
                thought with a receipt attached, and most of us have two or
                three of those a week.
              </p>
            </div>

            {/* Quincy's note in the margin, level with the sentence it is
                about. Graphite, so the highlighter stays the only colour. */}
            <div className="mt-8 flex items-start gap-3 pt-[96px]">
              <svg aria-hidden viewBox="0 0 10 100" preserveAspectRatio="none" className="h-[62px] w-[10px] shrink-0 overflow-visible">
                <path
                  d="M1 1.5 C 5 1.5, 6 3, 6 8 L 6.4 44 C 6.5 48, 7.5 50, 10 50 C 7.5 50, 6.5 52, 6.4 56 L 6 92 C 6 97, 5 98.5, 1 98.5"
                  fill="none"
                  stroke="var(--kit-ink-muted)"
                  strokeWidth={1.4}
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              <span className="-rotate-2 pt-2 font-kit-hand text-[28px] leading-[0.95] font-[500] text-kit-ink-muted">
                the post, not the poster
              </span>
            </div>
          </div>
        </div>

        <div className="mx-16 mt-12 grid grid-cols-[1fr_1fr_1fr_300px] gap-10 border-t border-kit-hairline pt-7">
          {[
            {
              head: "It finds them.",
              body: "In what you merged, a voice note from a walk, a note you paste in.",
            },
            {
              head: "It drafts in your voice.",
              body: "For X and LinkedIn, each written for its channel. Every number against your own median.",
            },
            {
              head: "You send.",
              body: "Nothing goes out in your name until you approve it. $49 a month, one plan.",
            },
          ].map((c) => (
            <div key={c.head}>
              <Text weight="strong">{c.head}</Text>
              <p className="mt-1.5 text-[16px] leading-[25px] text-pretty text-kit-ink-muted" style={{ fontFamily: SERIF }}>
                {c.body}
              </p>
            </div>
          ))}

          <Card>
            <div className="flex items-baseline justify-between">
              <Text as="span" weight="strong">Draft for LinkedIn</Text>
              <Mono>Waiting for you</Mono>
            </div>
            <div className="mt-3">
              <SkeletonLines widths={["94%", "80%", "88%", "52%"]} />
            </div>
          </Card>
        </div>
      </div>
    </Frame>
  )
}
