"use client"

import * as React from "react"

import { BeatBracket, Beats, Card, Mono, Stage, Text } from "@/components/kit"

import { Bar } from "./bar"
import { Frame } from "./frame"

/**
 * 14 · The argument told as a post. The receipt from docs/vision.md is set
 * in the three beats Quincy writes every draft in (did, happened, meant),
 * with the number on its own line, and the kit's blue pen brackets drawn
 * at display size in the left margin. The labels say "he", because it is
 * his story and the beats are honest about whose. Below, the same marks on
 * a draft at product size: the shape of the argument is the shape of the
 * product. Blue pen is the one accent, doing one job twice.
 */
function BigBracket({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="relative grid grid-cols-[150px_22px_1fr] gap-x-6">
      <span className="-rotate-2 self-center text-right font-kit-hand text-[34px] leading-[0.9] font-[500] text-kit-pen">
        {label}
      </span>
      <svg aria-hidden viewBox="0 0 10 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
        <path
          d="M9 1.5 C 5 1.5, 4 3, 4 8 L 3.6 44 C 3.5 48, 2.5 50, 0 50 C 2.5 50, 3.5 52, 3.6 56 L 4 92 C 4 97, 5 98.5, 9 98.5"
          fill="none"
          stroke="var(--kit-pen)"
          strokeWidth={2}
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className="py-1">{children}</div>
    </div>
  )
}

export function ThreeBeats() {
  return (
    <Frame>
      <Bar />

      <div className="flex flex-col gap-5 pt-8 pr-24 pl-6">
        <BigBracket label="what he did">
          <h1 className="max-w-[880px] text-[46px] leading-[52px] font-[600] tracking-[-0.035em] text-balance text-kit-ink">
            He posted the same video to his main account and to a new one.
          </h1>
        </BigBracket>
        <BigBracket label="what happened">
          <p className="text-[46px] leading-[52px] font-[600] tracking-[-0.035em] text-kit-ink">
            The new account:
          </p>
          <p className="text-[104px] leading-[1] font-[640] tracking-[-0.055em] text-kit-ink tabular-nums">
            9.4 million
          </p>
          <p className="mt-1 text-[20px] leading-[28px] text-kit-ink-muted">
            views. The main account got 300,000.
          </p>
        </BigBracket>
        <BigBracket label="what it meant">
          <p className="text-[46px] leading-[52px] font-[600] tracking-[-0.035em] text-kit-ink">
            The feed judged the post, not the poster.
          </p>
        </BigBracket>
      </div>
      <p className="mt-4 pl-[206px] text-kit-small text-kit-ink-muted">
        Gary Vaynerchuk&apos;s numbers, told the way Quincy writes.
      </p>

      <div className="mt-10 grid grid-cols-[340px_1fr] gap-14 px-16">
        <div className="pt-8">
          <Text weight="strong">Every draft gets the same three beats.</Text>
          <p className="mt-2 text-pretty text-kit-ink-muted">
            Quincy reads what you merged, recorded or pasted in, and writes
            what you did, what happened and what it meant, in your voice. The
            number in the middle comes from your week, never from a guess.
          </p>
        </div>

        <Stage>
          <Card width="with-margin" crop="bottom">
            <div className="flex items-baseline justify-between">
              <Text as="span" weight="strong">Draft for X</Text>
              <Mono>An example</Mono>
            </div>
            <div className="mt-3">
              <Beats>
                <div className="flex flex-col gap-3">
                  <BeatBracket beat="did">
                    <Text>I cut our onboarding email down to one question.</Text>
                  </BeatBracket>
                  <BeatBracket beat="happened">
                    <Text>Replies in the first week:</Text>
                    <Text variant="figure">31</Text>
                    <Text variant="small" tone="muted">Your median is 6.</Text>
                  </BeatBracket>
                  <BeatBracket beat="meant">
                    <Text>People answer a question. They skip a brochure.</Text>
                  </BeatBracket>
                </div>
              </Beats>
            </div>
            <div className="h-24" />
          </Card>
        </Stage>
      </div>
    </Frame>
  )
}
