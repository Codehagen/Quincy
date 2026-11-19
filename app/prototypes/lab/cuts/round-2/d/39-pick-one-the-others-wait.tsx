"use client"

/*
 * 39 — Pick one, the others wait.
 *
 * The three cuts live in the desk as one switch over the preview: A, B, C.
 * The preview and the lanes show the picked cut, its cursor working on it;
 * the other two keep building out of sight and their subagents keep
 * streaming in the margin. Switching is instant and changes nothing. The
 * picked cut is the well grey in the margin too. No accent.
 */

import * as React from "react"

import { Segmented } from "@/components/kit"

import { PROMPTS, variantsChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { DeskPreview, Lanes } from "../desk"
import { useCutChat } from "../use-cut-chat"
import { VariantCursors, useVariants } from "./variants"

export function PickOneTheOthersWait() {
  const chat = useCutChat(() => variantsChat({ check: false }), { prompt: PROMPTS.variants })
  const variants = useVariants(chat)
  const [pick, setPick] = React.useState<"a:" | "b:" | "c:">("a:")
  const v = variants.find((x) => x.prefix === pick)
  return (
    <CutDesk
      chat={chat}
      conversation={{ picked: v?.name }}
      preview={
        <>
          <Segmented
            aria-label="Cut"
            value={pick}
            onValueChange={setPick}
            options={[
              { value: "a:", label: "A · X" },
              { value: "b:", label: "B · LinkedIn" },
              { value: "c:", label: "C · Changelog" },
            ]}
          />
          <DeskPreview cut={v?.cut ?? chat.cut} hot={v?.hot} prefix={pick} width={460} />
        </>
      }
      lanes={<Lanes key={pick} cut={v?.cut ?? chat.cut} hot={v?.hot} prefix={pick} width={600} />}
    >
      <VariantCursors chat={chat} variants={variants} only={pick} />
    </CutDesk>
  )
}
