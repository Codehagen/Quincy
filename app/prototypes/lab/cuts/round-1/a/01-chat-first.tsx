"use client"

/*
 * 01 — Chat first, timeline in a drawer.
 *
 * The chat is the editor. The run's receipt and the preview of the cut sit
 * in the conversation, and the timeline is a drawer pinned to the bottom
 * edge: a strip of the spine you pull up only when you want to fix a frame
 * by hand. No accent: ink, greys and the friend.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import {
  ArrowUp02Icon,
  Download04Icon,
  Scissor01Icon,
  SmartPhone01Icon,
  SubtitleIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"

import { Button, Kbd } from "@/components/kit"

import { CUT_SECONDS, TAKE, fmt } from "../fixture"
import { ComposerStill, EditorBar, Frame, Note, Op, Picture, Quincy, Timeline, You } from "../parts"

export function ChatFirst() {
  return (
    <Frame>
      <EditorBar
        seconds={CUT_SECONDS}
        right={
          <Button variant="action" icon={Download04Icon}>
            Export
          </Button>
        }
      />

      <div className="mx-auto flex w-[600px] flex-col gap-5 pt-6">
        <You time="10:42">Tighten it, add captions, and give me a 9:16 for X.</You>

        <Quincy mood="found">
          <div className="flex gap-5 rounded-kit-object bg-kit-object p-4 shadow-kit-object">
            <Picture shape="9:16" width={132} punch caption="They were in the way." time={fmt(16.7)} />
            <div className="flex min-w-0 flex-col gap-2.5 pt-1">
              <Op icon={Scissor01Icon} say="Removed 2 pauses and the “um”" detail="4.5 s" />
              <Op icon={ZoomInAreaIcon} say="Pushed in on the strong line" detail="0:16" />
              <Op icon={SubtitleIcon} say="Captions, a phrase at a time" detail={`${TAKE.words} words`} />
              <Op icon={SmartPhone01Icon} say="Vertical, 9:16" detail="face kept in frame" />
              <p className="mt-1 text-kit-ink-muted">
                {fmt(TAKE.seconds)} is now {fmt(CUT_SECONDS)}. Watch it through, then export.
              </p>
            </div>
          </div>
        </Quincy>

        <ComposerStill placeholder="Say the next change" />
      </div>

      {/* The drawer: a strip of the spine, pulled up by hand. */}
      <div className="absolute inset-x-0 bottom-0 h-[112px] rounded-t-kit-object bg-kit-object px-6 pt-2 shadow-kit-lifted">
        <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-kit-chrome" />
        <div className="flex items-center justify-between pb-2">
          <span className="flex items-center gap-2 text-kit-small font-kit-strong">
            Timeline
            <span className="font-normal text-kit-ink-muted">4 clips · captions · 1 zoom</span>
          </span>
          <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
            <HugeiconsIcon icon={ArrowUp02Icon} size={12} aria-hidden />
            Open <Kbd keys={["T"]} size="sm" />
          </span>
        </div>
        <Timeline width={912} bare state="cut" lanes={["clips"]} playhead={16.7} />
      </div>

      <Note height={40} style={{ left: 796, top: 560 }}>
        pull up to fix by hand
      </Note>
    </Frame>
  )
}
