"use client"

/*
 * 20 — Drag words to the cut.
 *
 * Cutting by assembling. The take's sentences sit on the left; the cut is a
 * column on the right, and a sentence dragged across becomes a clip in it,
 * in the order you drop it, so the cut can open on the strong line. A switch
 * on the column says what a drag does: cut from the video, or copy the text
 * (for the post). Used sentences go well grey on the left. No accent.
 */

import { HugeiconsIcon } from "@hugeicons/react"
import { DragDropVerticalIcon, Download04Icon } from "@hugeicons/core-free-icons"

import { Button, Segmented, Text } from "@/components/kit"

import { SEGMENTS, TAKE, fmt } from "../fixture"
import { Frame, Pointer } from "../parts"

const IN_CUT = ["hook", "s3", "s5", "s6", "s7"] as const
const speech = SEGMENTS.filter((s) => s.kind === "speech" && s.id !== "s1")
const byId = (id: string) => SEGMENTS.find((s) => s.id === id)!
const cutSeconds = IN_CUT.reduce((sum, id) => sum + (byId(id).end - byId(id).at), 0)

export function DragWordsToTheCut() {
  return (
    <Frame>
      <div className="flex h-14 items-center justify-between border-b border-kit-hairline px-6">
        <span className="flex items-baseline gap-2.5">
          <span className="text-kit-meta text-kit-ink-muted">Cuts</span>
          <span className="font-kit-strong">{TAKE.project}</span>
        </span>
        <Button variant="action" icon={Download04Icon}>
          Export
        </Button>
      </div>

      <div className="flex gap-8 px-8 pt-6">
        <div className="w-[430px]">
          <Text as="p" weight="strong">
            The take
          </Text>
          <Text variant="small" tone="muted">
            {fmt(TAKE.seconds)} · drag a sentence across
          </Text>
          <ol className="mt-3 flex flex-col gap-1">
            {speech.map((s) => {
              const used = (IN_CUT as readonly string[]).includes(s.id)
              const lifted = s.id === "s8"
              return (
                <li
                  key={s.id}
                  data-used={used || undefined}
                  data-lifted={lifted || undefined}
                  className="flex items-start gap-2.5 rounded-kit-control px-2.5 py-2 data-lifted:opacity-35 data-used:bg-kit-selected"
                >
                  <HugeiconsIcon icon={DragDropVerticalIcon} size={14} className="mt-0.5 shrink-0 text-kit-ink-muted" aria-hidden />
                  <span className="w-9 shrink-0 pt-0.5 font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{fmt(s.at)}</span>
                  <span className="min-w-0 text-kit-small">{s.id === "s2" ? `So, ${s.text}` : s.text}</span>
                </li>
              )
            })}
          </ol>
        </div>

        <div className="relative flex w-[420px] flex-col gap-3 rounded-kit-object bg-kit-object p-5 shadow-kit-object">
          <div className="flex items-center justify-between">
            <span>
              <Text as="span" weight="strong">
                The cut
              </Text>
              <span className="ml-2 font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{fmt(cutSeconds)}</span>
            </span>
            <Segmented
              aria-label="What a drag does"
              defaultValue="video"
              options={[
                { value: "video", label: "Cut from video" },
                { value: "text", label: "Copy text" },
              ]}
            />
          </div>
          <ol className="flex flex-col gap-1.5">
            {IN_CUT.map((id, i) => {
              const s = byId(id)
              return (
                <li key={id} className="flex items-start gap-2.5 rounded-kit-control bg-kit-object px-3 py-2 shadow-kit-control">
                  <span className="w-4 shrink-0 font-kit-mono text-kit-mono-sm text-kit-ink-muted">{i + 1}</span>
                  <span className="min-w-0 flex-1 text-kit-small">{s.text}</span>
                  <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">
                    {(s.end - s.at).toFixed(1)} s
                  </span>
                </li>
              )
            })}
            <li className="h-10 rounded-kit-control border border-dashed border-kit-ink-disabled" aria-hidden />
          </ol>
          <Text variant="small" tone="muted">
            Cut from video: each sentence is a clip, in this order. The take stays whole.
          </Text>
        </div>
      </div>

      {/* The sentence in flight, between the two columns. */}
      <div
        aria-hidden
        className="absolute top-[404px] left-[440px] flex w-[330px] -rotate-1 items-start gap-2.5 rounded-kit-control bg-kit-object px-3 py-2 shadow-kit-lifted"
      >
        <span className="text-kit-small">{byId("s8").text}</span>
      </div>
      <Pointer style={{ left: 640, top: 424 }} />
    </Frame>
  )
}
