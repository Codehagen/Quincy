"use client"

/*
 * 33 — The sample opens free.
 *
 * 14 inside the desk. Before a take exists, the preview is the drop with
 * the sample under it, and the lanes are an empty outline. Open the sample
 * and its cut is replayed from its own history: the cursor walks the five
 * edits that made it, and the margin says plainly that no model ran and
 * nothing was spent. No accent.
 */

import * as React from "react"
import { Upload04Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, TAKE, fmt } from "../../round-1/fixture"
import { Picture } from "../../round-1/parts"
import { openChat } from "../chat"
import { CutDesk } from "../cut-desk"
import { useCutChat } from "../use-cut-chat"

export function TheSampleOpensFree() {
  const chat = useCutChat(() => openChat(), { autoplay: false })
  const [open, setOpen] = React.useState(false)

  const drop = (
    <div className="flex h-[330px] w-[520px] flex-col justify-between rounded-kit-object border border-dashed border-kit-ink-disabled p-5">
      <div className="flex flex-col items-center gap-3 pt-6 text-center">
        <Friend size={36} state="waiting" />
        <Text weight="strong">Drop a recording</Text>
        <Text variant="small" tone="muted">
          One video or audio file, up to 5 GB.
        </Text>
        <Button variant="quiet" icon={Upload04Icon}>
          Choose a file
        </Button>
      </div>
      <div className="flex items-center gap-4 rounded-kit-control bg-kit-object p-3 shadow-kit-control">
        <Picture shape="16:9" width={96} />
        <div className="min-w-0 flex-1">
          <Text weight="strong">Or open the sample</Text>
          <Text variant="small" tone="muted">
            A founder take, {fmt(TAKE.seconds)} in, {fmt(CUT_SECONDS)} out. Costs nothing.
          </Text>
        </div>
        <Button
          variant="action"
          onClick={() => {
            setOpen(true)
            chat.send("Show me how the sample was cut")
          }}
        >
          Open
        </Button>
      </div>
    </div>
  )

  return (
    <CutDesk
      chat={chat}
      cursor={{ look: "tag" }}
      preview={open ? undefined : drop}
      lanes={open ? undefined : <div className="h-[132px] w-[600px] rounded-kit-control border border-dashed border-kit-hairline" />}
      conversation={{
        empty: (
          <Text variant="small" tone="muted">
            Nothing to cut yet.
          </Text>
        ),
      }}
      foot={
        open ? (
          <Text variant="small" tone="muted">
            The sample&apos;s cut, replayed from its history. No model ran; nothing was spent.
          </Text>
        ) : null
      }
    />
  )
}
