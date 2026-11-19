"use client"

/*
 * Subagent, on the kit: one of several runs Quincy starts at once, as one
 * Trace line with its own steps streaming under it (preliminary outputs).
 * Done when the final output lands; then it folds to its name and length.
 */

import { fmt } from "../../round-1/fixture"
import type { VariantOutput } from "../chat"
import { Trace, TraceGroup, TraceLine } from "./trace"

export function Subagent({
  name,
  brief,
  output,
  streaming,
  picked,
}: {
  name: string
  brief: string
  output?: VariantOutput
  streaming: boolean
  picked?: boolean
}) {
  const done = output?.done ?? false
  const running = !done && streaming
  return (
    <div data-picked={picked || undefined} className="rounded-kit-control px-2 data-picked:bg-kit-selected">
      <TraceGroup
        running={running}
        line={
          <Trace>
            <TraceLine
              status={done ? "done" : running ? "running" : "error"}
              title={name}
              meta={done && output ? `${fmt(output.seconds)} · hook at ${output.hookAt}` : brief}
            />
          </Trace>
        }
      >
        <Trace>
          {(output?.steps ?? []).map((s) => (
            <TraceLine key={s.target} status={s.done ? "done" : running ? "running" : "waiting"} title={s.say} />
          ))}
        </Trace>
      </TraceGroup>
    </div>
  )
}
