"use client"

/*
 * 36 — Three cursors, three lanes.
 *
 * One prompt, three cuts built at once. The lanes panel holds three spines,
 * one per cut, and each has its own cursor (tagged A, B, C) reading its own
 * subagent's steps, so all three tighten side by side in about two
 * seconds. The margin shows the three subagents streaming, then Quincy's
 * pick with its reason in words. No accent.
 */

import { PROMPTS, variantsChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { DeskPreview, Lanes } from "../desk"
import { useCutChat } from "../use-cut-chat"
import { VariantCursors, useVariants } from "./variants"

export function ThreeCursorsThreeLanes() {
  const chat = useCutChat(() => variantsChat({ check: false }), { prompt: PROMPTS.variants })
  const variants = useVariants(chat)
  const a = variants[0]
  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      preview={a ? <DeskPreview cut={a.cut} hot={a.hot} prefix="a:" width={420} /> : <DeskPreview cut={chat.cut} width={420} />}
      lanes={
        <div className="flex flex-col gap-3">
          {(variants.length ? variants : []).map((v) => (
            <div key={v.id} className="flex flex-col gap-1">
              <span className="text-kit-meta text-kit-ink-muted">{v.name}</span>
              <Lanes cut={v.cut} hot={v.hot} prefix={v.prefix} width={600} lanes={["clips"]} />
            </div>
          ))}
          {variants.length === 0 ? <div className="h-[250px] w-[600px]" /> : null}
        </div>
      }
    >
      <VariantCursors chat={chat} variants={variants} />
    </CutDesk>
  )
}
