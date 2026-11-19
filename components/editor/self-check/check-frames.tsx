"use client"

import { ToolRow } from "@/components/ai-elements/tool"
import { atLabel } from "@/lib/editor/self-check"

import type { GrabbedFrame } from "./grab"

/**
 * The self-check in the margin (plans/036, phase C; lab piece 38): the line
 * that says Quincy is looking, the frames it looked at, and what it saw in
 * each. The frames arrive as one entrance (opacity and a 4px rise, 180ms);
 * the fix itself is a press of Quincy's cursor on the lanes, not drawn here.
 */

export type CheckFrame = GrabbedFrame & { note?: string }

export type CheckState =
  | { status: "looking"; frames: CheckFrame[] }
  | { status: "done"; frames: CheckFrame[]; say: string }
  | { status: "failed"; message: string }

export function CheckFrames({
  check,
  aspect,
}: {
  check: CheckState
  /** The cut's width over its height, so a thumbnail keeps the cut's shape. */
  aspect: number
}) {
  if (check.status === "failed") {
    return <ToolRow status="error" title="Could not look at the cut" description={check.message} />
  }

  const looking = check.status === "looking"
  const count = check.frames.length

  return (
    <div className="flex flex-col gap-2">
      <ToolRow
        status={looking ? "running" : undefined}
        title={
          looking
            ? `Looking at ${count} ${count === 1 ? "frame" : "frames"} of the cut`
            : `Checked ${count} ${count === 1 ? "frame" : "frames"}`
        }
        description={looking ? undefined : check.say}
      />
      {count > 0 ? (
        <ul className="agent-frames flex gap-1.5" aria-label="Frames Quincy looked at">
          {check.frames.map((frame) => (
            <li key={frame.atUs} className="flex w-[68px] min-w-0 flex-col gap-1">
              {/* oxlint-disable-next-line nextjs/no-img-element -- a data URL drawn in this tab */}
              <img
                src={frame.dataUrl}
                alt={
                  frame.note
                    ? `The cut at ${atLabel(frame.atUs)}: ${frame.note}`
                    : `The cut at ${atLabel(frame.atUs)}, as Quincy sees it`
                }
                style={{ aspectRatio: aspect }}
                className="block w-full rounded-kit-chip bg-kit-stage object-cover outline outline-1 -outline-offset-1 outline-black/10 dark:outline-white/10"
              />
              {/* The alt text already says this; read once, not twice. */}
              <span aria-hidden className="text-kit-meta leading-tight text-pretty text-muted-foreground tabular-nums">
                {atLabel(frame.atUs)}
                {frame.note ? ` · ${frame.note}` : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
