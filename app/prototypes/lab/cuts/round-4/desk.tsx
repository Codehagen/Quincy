"use client"

/*
 * Round 4's desk: round 3's whole flow (sample → reading → starters → the
 * run → the receipt → one checkpoint) with the cursor choreographed by the
 * director. The lanes, the preview, the margin's ticks and the length all
 * read what the cursor has pressed, so every change lands with a press.
 * The gate is 30's: just go, with Stop and Esc always there.
 */

import type * as React from "react"

import { isEdit } from "../round-2/chat"
import { Desk, DeskPreview } from "../round-2/desk"
import { cutFrom, useCutChat } from "../round-2/use-cut-chat"
import { FLOW_STARTERS, type Gate, SAMPLE, type Starter, VARIANT_STARTERS, flowFallback, nextSteps, sampleChat } from "../round-3/flow"
import { SampleDrop } from "../round-3/flow-desk"
import { Margin } from "../round-3/margin"
import { readCut, readVariants } from "../round-3/variants"
import { Cursor4 } from "./cursor"
import { type Beat, type Director, type Tune, useDirector } from "./director"
import { Lanes4 } from "./lanes"

type Chat = ReturnType<typeof useCutChat>

/** The edits among these parts, as the lanes read them. */
const editsOf = (parts: Chat["acts"]) =>
  parts.flatMap((p) => (isEdit(p) && p.state === "output-available" ? [{ type: p.type, input: p.input }] : []))

function useFlowChat(pace: number, delayMs: number, gate: Gate = "go") {
  return useCutChat(() => sampleChat({ pace }), { autoplay: false, delayMs, fallback: flowFallback(gate, { pace }) })
}

function isReading(chat: Chat) {
  return chat.messages.some((m) =>
    m.parts.some((p) => p.type === "tool-read_take" && (p.state !== "output-available" || p.preliminary)),
  )
}

/** Under the lanes: in 120 ms when the run starts, out with the fold. */
function Held({ on }: { on: boolean }) {
  return (
    <span className="qc4-held pointer-events-none absolute right-0 -bottom-6 text-kit-meta text-kit-ink-muted" data-on={on || undefined}>
      Read-only while Quincy cuts
    </span>
  )
}

/* ------------------------------------------------------------ one cut */

export function FlowDesk4({
  tone,
  pace = 1,
  delayMs = 18,
  gate = "go",
  starters = FLOW_STARTERS,
  tune,
}: {
  tone?: "ink" | "highlight"
  pace?: number
  delayMs?: number
  /** 30's "go" by default; 52 uses 46's "smart" gate. */
  gate?: Gate
  starters?: readonly Starter[]
  /** Live timing from a tune panel (52). */
  tune?: React.RefObject<Tune>
}) {
  const chat = useFlowChat(pace, delayMs, gate)
  const beats: Beat[] = chat.acts.flatMap((p) =>
    p.input?.target
      ? [{ id: p.toolCallId, target: p.input.target, started: p.state !== "input-streaming", landed: p.state === "output-available" }]
      : [],
  )
  const director = useDirector(beats, { root: chat.root, active: chat.busy, pace, tune })
  const { v } = director
  const pressed = chat.acts.filter((p) => v.pressed.includes(p.toolCallId))
  const cut = cutFrom(editsOf(pressed))
  const opened = chat.messages.length > 0
  const reading = isReading(chat)

  return (
    <Desk
      rootRef={chat.bind}
      seconds={cut.seconds}
      preview={opened ? <DeskPreview cut={cut} hot={null} /> : <SampleDrop onOpen={() => chat.send(SAMPLE)} />}
      lanes={
        opened ? (
          <div key={v.revision} className={`relative ${v.revision ? "qc4-fade" : ""}`} style={v.running ? { pointerEvents: "none" } : undefined}>
            <Lanes4 cut={cut} d={v} tone={tone} width={600} playhead={cut.zoom ? 16.7 : undefined} />
            {reading && chat.busy ? <span aria-hidden className="qc-scan" style={{ ["--qc-scan-to" as string]: "596px" }} /> : null}
            <Held on={v.running} />
          </div>
        ) : (
          <div className="h-[132px] w-[600px] rounded-kit-control border border-dashed border-kit-hairline" />
        )
      }
      margin={
        <Margin
          chat={chat}
          starters={nextSteps(chat.messages, starters)}
          motion={{ landed: (id) => v.pressed.includes(id), settled: !chat.busy && !v.running, seconds: cut.seconds }}
        />
      }
    >
      <Cursor4 director={director} />
    </Desk>
  )
}

/* --------------------------------------------------------- three cuts */

/** One variant's steps as beats: present is started, done is landed. */
function variantBeats(chat: Chat, prefix: string): Beat[] {
  const v = readVariants(chat).find((x) => x.prefix === prefix)
  return (v?.out?.steps ?? []).map((s) => ({ id: s.target, target: s.target, started: true, landed: s.done }))
}

function pressedCut(chat: Chat, prefix: string, d: Director) {
  const v = readVariants(chat).find((x) => x.prefix === prefix)
  return readCut(
    (v?.out?.steps ?? []).map((s) => ({ ...s, done: s.done && d.v.pressed.includes(s.target) })),
    false,
  ).cut
}

export function ThreeCutsDesk4({ pace = 1 }: { pace?: number }) {
  const chat = useFlowChat(pace, 18)
  // Never in lockstep: starts 0 / 90 / 170 ms apart, slightly different paces.
  const a = useDirector(variantBeats(chat, "a:"), { root: chat.root, active: chat.busy, pace, delay: 0 })
  const b = useDirector(variantBeats(chat, "b:"), { root: chat.root, active: chat.busy, pace: pace * 1.08, delay: 90 })
  const c = useDirector(variantBeats(chat, "c:"), { root: chat.root, active: chat.busy, pace: pace * 0.94, delay: 170 })
  const directors = [a, b, c] as const

  // The single-run path (a starter other than three cuts) uses the lead's cursor.
  const beats: Beat[] = chat.acts.flatMap((p) =>
    p.input?.target
      ? [{ id: p.toolCallId, target: p.input.target, started: p.state !== "input-streaming", landed: p.state === "output-available" }]
      : [],
  )
  const solo = useDirector(beats, { root: chat.root, active: chat.busy, pace })
  const variants = readVariants(chat)
  const three = variants.length === 3
  const running = directors.some((d) => d.v.running) || solo.v.running
  const soloCut = cutFrom(editsOf(chat.acts.filter((p) => solo.v.pressed.includes(p.toolCallId))))
  const cuts = (["a:", "b:", "c:"] as const).map((p, i) => pressedCut(chat, p, directors[i]))
  const opened = chat.messages.length > 0
  const reading = isReading(chat)
  const landed = (id: string) => [a, b, c, solo].some((d) => d.v.pressed.includes(id))

  return (
    <Desk
      rootRef={chat.bind}
      seconds={three ? cuts[0].seconds : soloCut.seconds}
      preview={
        !opened ? (
          <SampleDrop onOpen={() => chat.send(SAMPLE)} />
        ) : three ? (
          <DeskPreview cut={cuts[0]} hot={null} prefix="a:" width={360} />
        ) : (
          <DeskPreview cut={soloCut} hot={null} width={420} />
        )
      }
      lanes={
        !opened ? (
          <div className="h-[132px] w-[600px] rounded-kit-control border border-dashed border-kit-hairline" />
        ) : three ? (
          <div key={a.v.revision} className={`relative flex flex-col gap-2.5 ${a.v.revision ? "qc4-fade" : ""}`}>
            {variants.map((vv, i) => (
              <div key={vv.id} className="relative">
                <Lanes4 cut={cuts[i]} d={directors[i].v} prefix={vv.prefix} width={600} lanes={["clips", "captions"]} name={vv.name.split(" · ")[0]} />
                {/* B and C look at their own frames here; A's look is the preview. */}
                {i > 0 ? (
                  <span
                    data-q={`${vv.prefix}preview`}
                    aria-hidden
                    className="absolute top-0 right-12 h-4 w-7 rounded-sm bg-kit-stage"
                  />
                ) : null}
              </div>
            ))}
            <Held on={running} />
          </div>
        ) : (
          <div key={solo.v.revision} className={`relative ${solo.v.revision ? "qc4-fade" : ""}`}>
            <Lanes4 cut={soloCut} d={solo.v} width={600} />
            {reading && chat.busy ? <span aria-hidden className="qc-scan" style={{ ["--qc-scan-to" as string]: "596px" }} /> : null}
            <Held on={running} />
          </div>
        )
      }
      margin={
        <Margin
          chat={chat}
          starters={nextSteps(chat.messages, VARIANT_STARTERS)}
          motion={{ landed, settled: !chat.busy && !running, seconds: three ? cuts[0].seconds : soloCut.seconds }}
        />
      }
    >
      <Cursor4 director={solo} />
      <Cursor4 director={a} label="Quincy · A" />
      <Cursor4 director={b} label="B" support />
      <Cursor4 director={c} label="C" support />
    </Desk>
  )
}
