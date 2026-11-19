"use client"

/*
 * Round 3's whole flow in piece 02's desk. At rest: the drop and the free
 * sample where the preview will be. Open the sample → the reading (a line
 * sweeps the lanes) → starters that say what Quincy read → the pick →
 * Quincy's cursor reads the tool parts, with the lanes read-only under the
 * reason → the receipt with the length against the take → one checkpoint.
 * Replay returns to the drop.
 *
 * Pieces choose the cursor, the gate, and for several cuts, the layout.
 */

import type * as React from "react"
import { Upload04Icon } from "@hugeicons/core-free-icons"

import { Button, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

import { CUT_SECONDS, TAKE, fmt } from "../round-1/fixture"
import { Picture } from "../round-1/parts"
import { AgentCursor, type CursorLook } from "../round-2/cursor"
import { Desk, DeskPreview, Lanes } from "../round-2/desk"
import { useCutChat } from "../round-2/use-cut-chat"
import { FLOW_STARTERS, type Gate, SAMPLE, flowFallback, nextSteps, sampleChat } from "./flow"
import { Margin } from "./margin"
import { readVariants, type Variant } from "./variants"

export type FlowDeskProps = {
  gate?: Gate
  look?: CursorLook
  tone?: "ink" | "highlight" | "well"
  glide?: number
  ring?: "line" | "soft"
  /** Script speed: 1 is the default; under 1 is faster. */
  pace?: number
  delayMs?: number
  starters?: readonly { text: string; read?: string }[]
  /** How three cuts sit in the desk, when the run makes three. */
  layout?: "columns" | "stack"
  /** Under the conversation: e.g. 44's "stopped" note. */
  foot?: (chat: ReturnType<typeof useCutChat>) => React.ReactNode
}

export function FlowDesk({
  gate = "go",
  look = "tag",
  tone,
  glide,
  ring,
  pace = 1,
  delayMs = 18,
  starters = FLOW_STARTERS,
  layout = "columns",
  foot,
}: FlowDeskProps) {
  const chat = useCutChat(() => sampleChat({ pace }), { autoplay: false, delayMs, fallback: flowFallback(gate, { pace }) })
  const opened = chat.messages.length > 0
  const reading = chat.messages.some((m) =>
    m.parts.some((p) => p.type === "tool-read_take" && (p.state !== "output-available" || p.preliminary)),
  )
  const editing = chat.busy && !reading
  const variants = readVariants(chat)
  const three = variants.length === 3

  const sample = <SampleDrop onOpen={() => chat.send(SAMPLE)} />

  const held = editing && !three ? "Read-only while Quincy cuts" : undefined
  const single = (
    <div className="relative" data-held={held ? "" : undefined} style={held ? { pointerEvents: "none" } : undefined}>
      <Lanes cut={chat.cut} hot={chat.hot} tone={tone} width={600} playhead={chat.cut.zoom ? 16.7 : undefined} held={held} />
      {reading && chat.busy ? <span aria-hidden className="qc-scan" style={{ ["--qc-scan-to" as string]: "596px" }} /> : null}
    </div>
  )

  let preview: React.ReactNode = opened ? <DeskPreview cut={chat.cut} hot={chat.hot} /> : sample
  let lanes: React.ReactNode = opened ? single : <div className="h-[132px] w-[600px] rounded-kit-control border border-dashed border-kit-hairline" />

  if (three && layout === "columns") {
    preview = <Columns variants={variants} />
    lanes = <Lanes cut={variants[0].cut} width={600} lanes={["captions", "effects"]} prefix="x:" />
  }
  if (three && layout === "stack") {
    preview = <DeskPreview cut={variants[0].cut} hot={variants[0].hot} prefix="a:" width={420} />
    lanes = (
      <div className="flex flex-col gap-2">
        {variants.map((v) => (
          <div key={v.id} className="flex flex-col gap-0.5">
            <span className="text-kit-meta text-kit-ink-muted">{v.name}</span>
            <Lanes cut={v.cut} hot={v.hot} prefix={v.prefix} width={600} lanes={["clips"]} />
          </div>
        ))}
      </div>
    )
  }

  return (
    <Desk
      rootRef={chat.bind}
      seconds={three ? variants[0].cut.seconds : chat.cut.seconds}
      preview={preview}
      lanes={lanes}
      margin={<Margin chat={chat} starters={nextSteps(chat.messages, starters)} foot={foot?.(chat)} />}
    >
      <AgentCursor root={chat.root} aim={three ? "park" : chat.aim} pressKey={chat.pressKey} look={look} glide={glide} ring={ring} working={chat.busy} />
      {variants.map((v) => (
        <AgentCursor
          key={v.id}
          root={chat.root}
          aim={v.aim}
          pressKey={v.pressKey}
          look={look}
          label={`Quincy · ${v.letter}`}
          glide={glide ?? 150}
          ring={ring}
          working={!v.done}
        />
      ))}
    </Desk>
  )
}

/** Three cuts as three columns: a small preview over its own spine, each with its own cursor. */
function Columns({ variants }: { variants: Variant[] }) {
  return (
    <div className="grid w-full grid-cols-3 gap-4">
      {variants.map((v, i) => (
        <div key={v.id} data-picked={(v.done && i === 0) || undefined} className="flex flex-col gap-1.5 rounded-kit-object p-1.5 data-picked:bg-kit-selected">
          <Text as="span" variant="small" weight="strong">
            {v.name}
          </Text>
          <DeskPreview cut={v.cut} hot={v.hot} prefix={v.prefix} width={184} />
          <Lanes cut={v.cut} hot={v.hot} prefix={v.prefix} width={184} lanes={["clips"]} bare />
        </div>
      ))}
    </div>
  )
}

/** At rest: the drop, and the free sample under it. */
export function SampleDrop({ onOpen }: { onOpen: () => void }) {
  return (
    // Nested radii derive: the drop (18) inset 6 holds the card at 12, and
    // the card inset 6 holds the thumbnail at 6. The dashed border stays: it
    // is a drop target.
    <div className="flex h-[330px] w-[520px] flex-col justify-between rounded-kit-object border border-dashed border-kit-ink-disabled p-1.5">
      <div className="flex flex-col items-center gap-3 px-5 pt-7 text-center">
        <Friend size={36} state="waiting" />
        <Text weight="strong">Drop a recording</Text>
        <Text variant="small" tone="muted">
          One video or audio file, up to 5 GB.
        </Text>
        <Button variant="quiet" icon={Upload04Icon}>
          Choose a file
        </Button>
      </div>
      <div className="flex items-center gap-4 rounded-kit-control bg-kit-object p-1.5 pr-3 shadow-kit-control">
        <Picture shape="16:9" width={96} rounded="rounded-kit-chip" />
        <div className="min-w-0 flex-1">
          <Text weight="strong">Or open the sample</Text>
          <Text variant="small" tone="muted">
            A founder take, {fmt(TAKE.seconds)} in, {fmt(CUT_SECONDS)} out. Opening and cutting it cost nothing.
          </Text>
        </div>
        <Button variant="action" onClick={onOpen}>
          Open
        </Button>
      </div>
    </div>
  )
}
