"use client"

/*
 * Group d's shared bits. Each cut_variant part is a subagent whose
 * preliminary outputs are its own steps; each gets its own cursor, which
 * reads that subagent's next step (the glide) and its newest done step
 * (the press). Targets carry the variant's prefix (`a:p1`), so three cuts
 * on one page keep apart.
 */

import { AgentCursor } from "../cursor"
import type { CutChat } from "../use-cut-chat"
import { readVariant } from "../use-cut-chat"

export type Variant = ReturnType<typeof useVariants>[number]

export function useVariants(chat: CutChat) {
  const parts = chat.messages.flatMap((m) => m.parts.flatMap((p) => (p.type === "tool-cut_variant" ? [p] : [])))
  return parts.map((p) => {
    const steps = p.state === "output-available" ? p.output.steps : []
    const read = readVariant(steps, chat.busy)
    return {
      id: p.toolCallId,
      name: p.input?.name ?? "",
      letter: (p.input?.prefix ?? "").replace(":", "").toUpperCase(),
      prefix: p.input?.prefix ?? "",
      done: p.state === "output-available" && !p.preliminary,
      seconds: p.state === "output-available" ? p.output.seconds : undefined,
      hookAt: p.state === "output-available" ? p.output.hookAt : undefined,
      ...read,
      // The self-check lifts the caption on the cut it looked at.
      cut: { ...read.cut, lift: chat.cut.lift && p.input?.prefix === "a:" },
    }
  })
}

export function VariantCursors({ chat, variants, only }: { chat: CutChat; variants: Variant[]; only?: string }) {
  return (
    <>
      {variants
        .filter((v) => !only || v.prefix === only)
        .map((v) => (
          <AgentCursor
            key={v.id}
            root={chat.root}
            aim={v.aim}
            pressKey={v.pressKey}
            look="tag"
            label={`Quincy · ${v.letter}`}
            glide={150}
          />
        ))}
      {/* The main stream's own cursor: the self-check after the three cuts. */}
      <AgentCursor root={chat.root} aim={chat.landed.length || chat.working ? chat.aim : null} pressKey={chat.pressKey} look="tag" />
    </>
  )
}
