"use client"

import { Checkpoint } from "@/components/ai-elements/checkpoint"
import { TaskFold, type TaskStep } from "@/components/ai-elements/task"
import { Message, MessageContent } from "@/components/ui/message"
import type { CutsData, CutsMessage } from "@/lib/editor/stream-parts"

import type { BeatState } from "./agent-cursor/director"
import { cutBeats, recommendationOf } from "./cuts-stream"
import { stepDetail, stepTitle } from "./run-steps"
import { CheckFrames, type CheckState } from "./self-check/check-frames"
import { checkKey } from "./self-check/use-self-check"
import { formatClockTenths } from "./studio-parts"

/**
 * A three-cuts turn in the margin (plans/036, phase D): one folding task per
 * cut, in the order the cursors started, each with its brief, its steps, its
 * check and its own undo. The recommendation is words with its reason, and
 * it arrives with the recommended cut's fold, in the same frame, with no
 * stagger: the run settles once, and everything that follows it appears
 * together.
 */

export function CutsTurn({
  message,
  cuts,
  live,
  stopped,
  beats,
  checks,
  revisions,
  durationOf,
  hasScene,
  aspectOf,
  onUndoCut,
}: {
  message: CutsMessage
  cuts: CutsData
  live: boolean
  stopped: boolean
  beats: readonly BeatState[]
  checks: Record<string, CheckState>
  /** The revision each cut was saved as. */
  revisions: Record<string, number>
  durationOf: (sceneId: string) => number
  hasScene: (sceneId: string) => boolean
  aspectOf: (sceneId: string) => number
  onUndoCut: (sceneId: string) => void
}) {
  const done = new Map(
    message.parts.flatMap((p) => (p.type === "data-cut-done" ? [[p.data.sceneId, p.data] as const] : []))
  )
  const pick = recommendationOf(message)
  const settled = !live

  return (
    <Message>
      <MessageContent className="w-full gap-4">
        {cuts.cuts.map((cut) => {
          const mine = cutBeats(beats, cut.sceneId)
          const steps: TaskStep[] = mine.map((beat) => ({
            id: beat.id,
            title: stepTitle(beat),
            status: beat.landed ? undefined : live ? "running" : "pending",
            description: beat.landed ? stepDetail(beat) : live && !stopped ? undefined : "skipped",
          }))
          const landed = steps.filter((s) => s.status === undefined).length
          const finished = done.get(cut.sceneId)
          const check = checks[checkKey(message.id, cut.sceneId)]
          const present = hasScene(cut.sceneId)
          // An undone cut has no scene, so no length: a clock would read 00:00.0.
          const end = present ? ` · ${formatClockTenths(durationOf(cut.sceneId))}` : ""
          const revision = revisions[cut.sceneId]

          return (
            <section key={cut.sceneId} aria-label={cut.name} className="flex flex-col gap-2 tabular-nums">
              <TaskFold
                settled={settled}
                title={
                  settled
                    ? `${cut.name} · ${landed} ${landed === 1 ? "edit" : "edits"}${end}`
                    : `${cut.name} · ${landed} of ${Math.max(steps.length, landed)}${end}`
                }
                steps={steps.length > 0 ? steps : [{ id: `${cut.sceneId}-wait`, title: "Reading the brief", status: live ? "running" : "pending" }]}
              />
              <p className="text-muted-foreground">
                {cut.hook ? `On “${cut.hook}”, ` : ""}under {cut.lengthS} s for {cut.where}.
              </p>

              {check ? <CheckFrames check={check} aspect={aspectOf(cut.sceneId)} /> : null}

              {settled ? (
                <div className="agent-appear flex flex-col gap-2">
                  {finished?.say ? <p>{finished.say}</p> : null}
                  {pick?.sceneId === cut.sceneId ? <p className="font-medium">{pick.reason}</p> : null}
                  {finished?.landed ? (
                    <Checkpoint
                      label={present ? (revision !== undefined ? `Revision ${revision}` : cut.name) : `Cut ${cut.letter} undone`}
                      action={`Undo cut ${cut.letter}`}
                      disabled={!present}
                      onAction={() => onUndoCut(cut.sceneId)}
                    />
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        })}
      </MessageContent>
    </Message>
  )
}
