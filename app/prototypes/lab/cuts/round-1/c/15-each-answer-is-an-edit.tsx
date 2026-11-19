"use client"

/*
 * 15 — Each answer is an edit.
 *
 * The first minute, start to end. Each answer the person gives while the
 * take uploads is shown with the edit it turns into, and the phone beside
 * it changes as the answer lands: "X" makes it 9:16, "under 35 s" cuts the
 * pauses, "founders" turns captions on because most of them watch muted. So
 * the questions read as the cut being made, not a form before it. It rests
 * on the end; "Watch the first minute" replays it, and reduced motion jumps
 * to the end. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { ArrowRight01Icon, PlayIcon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, TAKE, fmt } from "../fixture"
import { Frame, PhoneFrame, Picture, useRun } from "../parts"

const ANSWERS = [
  { q: "Where does it go?", a: "X", edit: "Vertical 9:16, face kept in frame", at: "0:14" },
  { q: "How long?", a: "Under 35 s", edit: `Removed 2 pauses and the “um”: ${fmt(CUT_SECONDS)}`, at: "0:27" },
  { q: "Who is it for?", a: "Founders", edit: "Captions on; most of them watch muted", at: "0:39" },
] as const

export function EachAnswerIsAnEdit() {
  const { step, playing, play } = useRun(4, 1100)
  const shape = step >= 1 ? "9:16" : "16:9"

  return (
    <Frame>
      <div className="absolute top-6 right-8 left-8 flex items-center justify-between">
        <span className="flex items-baseline gap-2.5">
          <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
          <span className="font-kit-strong">{TAKE.project}</span>
        </span>
        <Button variant="quiet" size="sm" icon={PlayIcon} onClick={play} pending={playing} pendingLabel="Playing">
          Watch the first minute
        </Button>
      </div>

      <div className="absolute top-[88px] left-10 flex w-[500px] flex-col gap-3">
        <span className="flex items-center gap-2 text-kit-small text-kit-ink-muted">
          <Friend size={20} state={step === 3 ? "found" : "listening"} />
          {step === 3 ? "First cut ready at 0:41. Watch it through, then export." : "Asking while it uploads"}
        </span>
        {ANSWERS.map((x, i) => (
          <div
            key={x.q}
            data-on={step > i || undefined}
            className="flex flex-col gap-2 rounded-kit-object bg-kit-object p-4 opacity-35 shadow-kit-object transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-on:opacity-100 motion-reduce:transition-none"
          >
            <div className="flex items-baseline justify-between">
              <span className="text-kit-ink-muted">{x.q}</span>
              <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{x.at}</span>
            </div>
            <span className="w-fit rounded-kit-control bg-kit-selected px-3 py-1 font-kit-strong">{x.a}</span>
            <span className="flex items-center gap-2 text-kit-small">
              <HugeiconsIcon icon={ArrowRight01Icon} size={12} className="text-kit-ink-muted" aria-hidden />
              {x.edit}
            </span>
          </div>
        ))}
      </div>

      <div className="absolute top-[96px] right-[90px] flex flex-col items-center gap-4">
        {shape === "9:16" ? (
          <PhoneFrame width={210}>
            <Picture
              shape="9:16"
              width={210}
              rounded=""
              caption={step >= 3 ? "We cut it from seven screens to two." : undefined}
              time={fmt(step >= 2 ? 5.9 : 10.1)}
            />
          </PhoneFrame>
        ) : (
          <div className="pt-24">
            <Picture shape="16:9" width={300} time={fmt(10.1)} />
          </div>
        )}
        <Text variant="small" tone="muted">
          {step >= 2 ? `${fmt(CUT_SECONDS)} from ${fmt(TAKE.seconds)}` : `${fmt(TAKE.seconds)}, as recorded`}
        </Text>
      </div>
    </Frame>
  )
}
