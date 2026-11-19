"use client"

/*
 * 14 — The sample opens free.
 *
 * The first visit, with nothing uploaded. One object on the grey stage: the
 * drop, and under it the sample, a real 37-second founder take whose cut is
 * already made, so opening it shows the whole editor (receipt, undo, the
 * 9:16) without a run and without spending. The sample says so in plain
 * words. No accent.
 */

import { ArrowRight01Icon, Upload04Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, TAKE, fmt } from "../fixture"
import { Frame, Picture } from "../parts"

export function TheSampleOpensFree() {
  return (
    <Frame ground="stage">
      <div className="absolute top-6 left-8 flex items-baseline gap-2.5">
        <span className="font-kit-strong">Cuts</span>
      </div>

      <div className="absolute top-[84px] left-[170px] w-[620px] rounded-kit-object bg-kit-object p-6 shadow-kit-object">
        <div className="flex flex-col items-center gap-4 rounded-kit-control border border-dashed border-kit-ink-disabled px-6 py-10 text-center">
          <Friend size={40} state="waiting" />
          <div className="flex flex-col gap-1">
            <Text weight="strong">Drop a recording</Text>
            <Text variant="small" tone="muted">
              One video or audio file, up to 5 GB. I transcribe it, then you say the cut.
            </Text>
          </div>
          <Button variant="action" icon={Upload04Icon}>
            Choose a file
          </Button>
        </div>

        <div className="mt-6 flex items-center gap-5">
          <Picture shape="9:16" width={92} punch caption="In the way." captionClass="text-kit-meta" />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <Text weight="strong">No take to hand? Open the sample.</Text>
            <Text variant="small" tone="muted">
              A founder on cutting onboarding from seven screens to two. {fmt(TAKE.seconds)} in,{" "}
              {fmt(CUT_SECONDS)} out, captions and a 9:16 already made.
            </Text>
            <Text variant="small">The cut is done, so opening it costs nothing.</Text>
          </div>
          <Button variant="quiet" iconEnd={ArrowRight01Icon}>
            Open
          </Button>
        </div>
      </div>

      <p className="absolute bottom-8 left-[170px] text-kit-small text-kit-ink-muted">
        Quincy cuts, you export. Nothing posts from here.
      </p>
    </Frame>
  )
}
