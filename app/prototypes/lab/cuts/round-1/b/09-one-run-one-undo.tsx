"use client"

/*
 * 09 — One run, one undo.
 *
 * The history is a row of revisions, and a run of Quincy's is one of them:
 * one chip that holds all five changes, beside the two edits you made by
 * hand. Undo on the chip takes the whole run back and the lanes show the
 * take as it was; Redo puts it back. Nothing to pick through line by line.
 * The motion is the person's own press. No accent.
 */

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { PencilEdit02Icon, Redo02Icon, Undo02Icon } from "@hugeicons/core-free-icons"

import { Button } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, RECEIPT, TAKE, fmt } from "../fixture"
import { EditorBar, Frame, Picture, Timeline } from "../parts"

export function OneRunOneUndo() {
  const [undone, setUndone] = React.useState(false)
  const seconds = undone ? TAKE.seconds : CUT_SECONDS

  return (
    <Frame>
      <EditorBar seconds={seconds} right={<Button variant="action">Export</Button>} />

      <div className="flex items-stretch gap-2 px-6 pt-5">
        {[
          { r: 11, what: "Trimmed the last 0.8 s" },
          { r: 12, what: "Split at 0:20" },
        ].map((h) => (
          <div key={h.r} className="flex w-[150px] flex-col gap-1 rounded-kit-control bg-kit-object px-3 py-2.5 shadow-kit-control">
            <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
              <HugeiconsIcon icon={PencilEdit02Icon} size={12} aria-hidden />
              You · r{h.r}
            </span>
            <span className="text-kit-small">{h.what}</span>
          </div>
        ))}

        <div
          data-undone={undone || undefined}
          className="flex flex-1 flex-col gap-2 rounded-kit-control bg-kit-selected px-4 py-2.5 shadow-kit-inset transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-undone:opacity-55 motion-reduce:transition-none"
        >
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
              <Friend size={16} state={undone ? "resting" : "found"} />
              Quincy · r13 · one run
            </span>
            <Button
              size="xs"
              variant="quiet"
              icon={undone ? Redo02Icon : Undo02Icon}
              reserve={["Redo the run"]}
              onClick={() => setUndone((u) => !u)}
            >
              {undone ? "Redo the run" : "Undo the run"}
            </Button>
          </div>
          <span className="text-kit-small font-kit-strong">Tighten, captions, 9:16</span>
          <span className="flex flex-wrap gap-x-3 gap-y-0.5 text-kit-meta text-kit-ink-muted">
            {RECEIPT.map((r) => (
              <span key={r.tool}>{r.say}</span>
            ))}
          </span>
        </div>
      </div>

      <div className="flex flex-col items-center gap-5 px-6 pt-6">
        <Picture
          shape="16:9"
          width={480}
          punch={!undone}
          caption={undone ? undefined : "They were in the way."}
          time={fmt(undone ? 21.4 : 16.9)}
        />
        <div className="rounded-kit-object bg-kit-object px-4 pt-3 pb-4 shadow-kit-object">
          <Timeline
            width={820}
            state={undone ? "raw" : "cut"}
            captions={!undone}
            zoom={!undone}
            playhead={undone ? 21.4 : 16.9}
          />
        </div>
      </div>
    </Frame>
  )
}
