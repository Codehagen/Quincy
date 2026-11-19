"use client"

/*
 * 40 — Three columns.
 *
 * The three cuts get the preview's place as three columns, each a small
 * preview over its own spine with its own cursor, so the three runs read
 * side by side. Under them the full lanes belong to the cut Quincy
 * recommends, after it looked at its frames. One prompt, one run, one
 * checkpoint for all three. No accent.
 */

import { Text } from "@/components/kit"

import { PROMPTS, variantsChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { DeskPreview, Lanes } from "../desk"
import { useCutChat } from "../use-cut-chat"
import { VariantCursors, useVariants } from "./variants"

export function ThreeColumns() {
  const chat = useCutChat(() => variantsChat(), { prompt: PROMPTS.variants })
  const variants = useVariants(chat)
  const a = variants[0]
  return (
    <CutDesk
      chat={chat}
      preview={
        <div className="grid w-full grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => {
            const v = variants[i]
            return (
              <div key={i} className="flex flex-col gap-1.5">
                <Text as="span" variant="small" weight="strong">
                  {v?.name ?? "Waiting"}
                </Text>
                {v ? (
                  <>
                    <DeskPreview cut={v.cut} hot={v.hot} prefix={v.prefix} width={190} />
                    <Lanes cut={v.cut} hot={v.hot} prefix={v.prefix} width={190} lanes={["clips"]} bare />
                  </>
                ) : (
                  <div className="h-[200px] rounded-kit-control bg-kit-well" />
                )}
              </div>
            )
          })}
        </div>
      }
      lanes={
        a ? (
          <Lanes cut={a.cut} hot={null} prefix="x:" width={600} lanes={["captions", "effects"]} />
        ) : (
          <div className="h-[80px] w-[600px]" />
        )
      }
    >
      <VariantCursors chat={chat} variants={variants} />
    </CutDesk>
  )
}
