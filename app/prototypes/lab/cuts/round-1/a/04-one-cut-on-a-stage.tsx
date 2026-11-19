"use client"

/*
 * 04 — The cut on a grey stage.
 *
 * The landing's register applied to the editor: one white object on the
 * grey recess, and the object is the cut itself. The preview, what the run
 * changed, the length against the take, Export. The composer floats under
 * it. Lanes are one click behind ("Open the timeline"). Quincy's one note
 * sits in the margin. No accent.
 */

import { Download04Icon, Layers01Icon } from "@hugeicons/core-free-icons"

import { Button, Mono, Text } from "@/components/kit"

import { CUT_SECONDS, RECEIPT, TAKE, fmt } from "../fixture"
import { ComposerStill, Frame, Note, Picture, Timeline } from "../parts"

export function OneCutOnAStage() {
  return (
    <Frame ground="stage">
      <div className="absolute top-6 left-8 flex items-baseline gap-2.5">
        <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
        <span className="font-kit-strong">{TAKE.project}</span>
      </div>

      <div className="absolute top-[72px] left-[150px] w-[600px] rounded-kit-object bg-kit-object p-6 shadow-kit-object">
        <div className="flex gap-6">
          <Picture shape="9:16" width={200} punch caption="They were in the way." time={fmt(16.9)} />
          <div className="flex min-w-0 flex-1 flex-col">
            <Text as="span" weight="strong">
              9:16 for X
            </Text>
            <span className="mt-1 flex items-baseline gap-2">
              <Text as="span" variant="figure">
                {fmt(CUT_SECONDS)}
              </Text>
              <Mono>from {fmt(TAKE.seconds)}</Mono>
            </span>
            <ul className="mt-4 flex flex-col gap-2 text-kit-small">
              {RECEIPT.map((r) => (
                <li key={r.tool}>
                  {r.say}
                  <span className="text-kit-ink-muted"> · {r.detail}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto flex items-center gap-2 pt-5">
              <Button variant="action" icon={Download04Icon}>
                Export
              </Button>
              <Button variant="ghost" icon={Layers01Icon}>
                Open the timeline
              </Button>
            </div>
          </div>
        </div>
        <div className="mt-5 border-t border-kit-hairline pt-3">
          <Timeline width={552} bare state="cut" lanes={["clips"]} zoom playhead={16.9} />
        </div>
      </div>

      <Note height={64} style={{ left: 764, top: 120 }}>
        the hook lands late
      </Note>

      <div className="absolute bottom-8 left-[150px] w-[600px]">
        <ComposerStill placeholder="Open on the strong line instead" />
      </div>
    </Frame>
  )
}
