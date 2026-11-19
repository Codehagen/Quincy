/**
 * A cut_variant subagent, read for its cursor and its lanes. Its steps are
 * its edits and its own self-check; each step's target says what it does
 * (`a:p1` a pause, `a:s4` a spoken line, `a:captions`, `a:hook` the push-in,
 * `a:preview` the look at frames, `a:caption` the caption it moved).
 */

import { SEGMENTS, TAKE } from "../round-1/fixture"
import type { VariantStep } from "../round-2/chat"
import type { CutState } from "../round-2/ops"
import type { CutChat } from "../round-2/use-cut-chat"

const kind = (target: string) => target.split(":").pop() ?? ""

export function readCut(steps: readonly VariantStep[], streaming: boolean) {
  const done = steps.filter((s) => s.done)
  const next = steps.find((s) => !s.done)
  const ids = done.map((s) => kind(s.target))
  const removed = new Set(ids.filter((k) => SEGMENTS.some((s) => s.id === k)))
  const gone = SEGMENTS.filter((s) => removed.has(s.id)).reduce((t, s) => t + s.end - s.at, 0)
  const cut: CutState = {
    removed,
    captions: ids.includes("captions"),
    zoom: ids.includes("hook"),
    lift: ids.includes("caption"),
    seconds: Math.round((TAKE.seconds - gone) * 10) / 10,
  }
  const last = done.at(-1)?.target ?? null
  return {
    cut,
    aim: next && streaming ? next.target : streaming ? last : "park",
    pressKey: last,
    hot: streaming ? last : null,
  }
}

export type Variant = ReturnType<typeof readVariants>[number]

export function readVariants(chat: CutChat) {
  return chat.messages.flatMap((m) =>
    m.parts.flatMap((p) => {
      if (p.type !== "tool-cut_variant") return []
      const out = p.state === "output-available" ? p.output : undefined
      return [
        {
          id: p.toolCallId,
          name: p.input?.name ?? "",
          brief: p.input?.brief ?? "",
          prefix: p.input?.prefix ?? "",
          letter: (p.input?.prefix ?? "").replace(":", "").toUpperCase(),
          out,
          done: p.state === "output-available" && !p.preliminary,
          ...readCut(out?.steps ?? [], chat.busy),
        },
      ]
    }),
  )
}
