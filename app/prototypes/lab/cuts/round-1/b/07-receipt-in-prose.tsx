"use client"

/*
 * 07 — The receipt in prose.
 *
 * A run ends in a receipt, the way a person would report back: one line per
 * change, in words, with where and how much. The length against the take
 * sits on its own line. The whole run is one revision, so there is one Undo
 * for all five lines. The accent is the kit's green check on each change.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Tick02Icon, Undo02Icon } from "@hugeicons/core-free-icons"

import { Button, Kbd, Text } from "@/components/kit"

import { CUT_SECONDS, RECEIPT, TAKE, fmt } from "../fixture"
import { ComposerStill, EditorBar, Frame, PhoneFrame, Picture, Quincy, You } from "../parts"

export function ReceiptInProse() {
  return (
    <Frame>
      <EditorBar seconds={CUT_SECONDS} right={<Button variant="action">Export</Button>} />

      <div className="flex gap-10 px-12 pt-7">
        <div className="pt-2">
          <PhoneFrame width={196}>
            <Picture shape="9:16" width={196} rounded="" punch caption="They were in the way." time={fmt(16.9)} />
          </PhoneFrame>
        </div>

        <div className="flex min-w-0 flex-1 flex-col gap-5">
          <You time="10:42">Make it tight, captions, vertical for X.</You>
          <Quincy mood="found">
            <div className="rounded-kit-object bg-kit-object p-5 shadow-kit-object">
              <div className="flex items-baseline justify-between">
                <Text as="span" weight="strong">
                  What I changed
                </Text>
                <span className="font-kit-mono text-kit-mono text-kit-ink-muted">revision 14</span>
              </div>
              <ul className="mt-4 flex flex-col gap-3">
                {RECEIPT.map((r) => (
                  <li key={r.tool} className="flex items-start gap-2.5">
                    <span className="mt-px grid size-[18px] shrink-0 place-items-center rounded-full bg-kit-success text-kit-success-on">
                      <HugeiconsIcon icon={Tick02Icon} size={12} strokeWidth={2.5} aria-hidden />
                    </span>
                    <span>
                      <span className="font-kit-strong">{r.say}</span>
                      <span className="text-kit-ink-muted"> · {r.detail}</span>
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-5 border-t border-kit-hairline pt-4">
                <Text tone="muted" variant="small">
                  Length
                </Text>
                <Text variant="figure">
                  {fmt(TAKE.seconds)} → {fmt(CUT_SECONDS)}
                </Text>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <Button variant="quiet" icon={Undo02Icon}>
                  Undo this run
                </Button>
                <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
                  all five lines at once <Kbd keys={["mod", "Z"]} size="sm" />
                </span>
              </div>
            </div>
            <p className="text-kit-ink-muted">Nothing is exported. Watch it through first.</p>
          </Quincy>
          <ComposerStill placeholder="Keep the captions, put the “um” back" />
        </div>
      </div>
    </Frame>
  )
}
