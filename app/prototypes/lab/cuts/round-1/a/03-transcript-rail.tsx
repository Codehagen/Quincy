"use client"

/*
 * 03 — The transcript is the timeline.
 *
 * For a talking head the words are the edit. The lanes are gone; under the
 * preview there is only a scrub bar with the clip joins on it. The right
 * rail switches between Chat and Transcript, and in Transcript a dragged
 * selection of words gets the two edits that matter: Delete and Zoom.
 * Selected words take the well grey, never a tint. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { Delete02Icon, Download04Icon, PlayIcon, ZoomInAreaIcon } from "@hugeicons/core-free-icons"

import { Button, Segmented } from "@/components/kit"

import { CUT_CLIPS, CUT_SECONDS, HOOK, fmt } from "../fixture"
import { EditorBar, Frame, Picture, Transcript } from "../parts"

const JOINS = CUT_CLIPS.slice(1).map((c, i) => ({
  id: c.id,
  at: CUT_CLIPS.slice(0, i + 1).reduce((sum, x) => sum + x.to - x.from, 0),
}))

export function TranscriptRail() {
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
      <div className="flex h-[664px]">
        <div className="flex flex-1 flex-col items-center justify-center gap-5 px-8 pb-10">
          <Picture shape="16:9" width={540} time={fmt(9.4)} caption="Same questions, asked when they matter." />

          {/* Not a timeline: a scrub bar with the joins on it. */}
          <div className="flex w-[540px] items-center gap-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-kit-control shadow-kit-control">
              <HugeiconsIcon icon={PlayIcon} size={14} aria-hidden />
            </span>
            <div className="relative h-1.5 flex-1 rounded-full bg-kit-track">
              <span className="absolute inset-y-0 left-0 rounded-full bg-kit-ink" style={{ width: `${(9.4 / CUT_SECONDS) * 100}%` }} />
              {JOINS.map((j) => (
                <span
                  key={j.id}
                  className="absolute -top-1 h-3.5 w-0.5 rounded-full bg-kit-ink-muted"
                  style={{ left: `${(j.at / CUT_SECONDS) * 100}%` }}
                />
              ))}
            </div>
            <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{fmt(CUT_SECONDS)}</span>
          </div>
          <p className="text-kit-meta text-kit-ink-muted">4 clips. Each mark on the bar is a spot Quincy cut.</p>
        </div>

        <aside className="flex w-[340px] shrink-0 flex-col gap-4 border-l border-kit-hairline px-5 pt-4">
          <Segmented
            aria-label="Rail"
            defaultValue="transcript"
            options={[
              { value: "chat", label: "Chat" },
              { value: "transcript", label: "Transcript" },
            ]}
          />
          <div className="relative">
            <Transcript
              marks="cut"
              live="s4"
              hook={
                <span className="relative rounded-kit-chip bg-kit-selected px-0.5 py-0.5 shadow-kit-inset">
                  {HOOK.text}
                  <span className="absolute -top-11 left-0 flex gap-1 rounded-kit-control bg-kit-object p-1 shadow-kit-lifted">
                    <Button size="xs" variant="ghost" icon={Delete02Icon}>
                      Delete
                    </Button>
                    <Button size="xs" variant="ghost" icon={ZoomInAreaIcon}>
                      Zoom
                    </Button>
                  </span>
                </span>
              }
            />
          </div>
          <p className="mt-auto mb-5 text-kit-meta text-kit-ink-muted">
            Drag across words to pick them. Click a line to go there.
          </p>
        </aside>
      </div>
    </Frame>
  )
}
