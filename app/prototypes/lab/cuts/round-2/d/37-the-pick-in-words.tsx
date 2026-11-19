"use client"

/*
 * 37 — The pick, in words.
 *
 * The three cuts sit over the lanes as three small previews with their
 * length and where the hook lands, and Quincy recommends one with a reason
 * in a sentence ("the hook lands at 0.8 s"), never a score. The pick is
 * yours: Use A is the one action, B and C sit beside it. No accent.
 */

import { Button, Text } from "@/components/kit"

import { fmt } from "../../round-1/fixture"
import { Picture } from "../../round-1/parts"
import { PROMPTS, variantsChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { Lanes } from "../desk"
import { useCutChat } from "../use-cut-chat"
import { VariantCursors, useVariants } from "./variants"

export function ThePickInWords() {
  const chat = useCutChat(() => variantsChat({ check: false }), { prompt: PROMPTS.variants })
  const variants = useVariants(chat)
  const done = variants.length === 3 && variants.every((v) => v.done) && !chat.busy
  const a = variants[0]
  return (
    <CutDesk
      chat={chat}
      preview={
        <div className="grid w-full grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => {
            const v = variants[i]
            return (
              <div key={i} data-picked={(done && i === 0) || undefined} className="flex flex-col gap-1.5 rounded-kit-object p-2 data-picked:bg-kit-selected">
                <Picture shape="16:9" width={184} punch={v?.cut.zoom} caption={v?.cut.captions ? "In the way." : undefined} captionClass="text-kit-meta" />
                <Text as="span" variant="small" weight="strong">
                  {v?.name ?? "Waiting"}
                </Text>
                <Text as="span" variant="small" tone="muted">
                  {v?.seconds ? `${fmt(v.seconds)} · hook at ${v.hookAt}` : "building"}
                </Text>
              </div>
            )
          })}
        </div>
      }
      lanes={a ? <Lanes cut={a.cut} hot={a.hot} prefix="a:" width={600} /> : <div className="h-[132px] w-[600px]" />}
      foot={
        done ? (
          <div className="flex items-center gap-2">
            <Button variant="action">Use A</Button>
            <Button variant="quiet">B</Button>
            <Button variant="quiet">C</Button>
          </div>
        ) : null
      }
    >
      <VariantCursors chat={chat} variants={variants} only="a:" />
    </CutDesk>
  )
}
