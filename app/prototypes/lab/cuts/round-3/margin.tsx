"use client"

/*
 * The chat margin, in real shadcn: components/ui (message, bubble, trace,
 * marker, item, button, checkbox, message-scroller) and the AI Elements
 * patterns in components/ai-elements. Inside `.cuts-shadcn`, whose variables
 * point at the kit (components/editor/cuts-shadcn.css). Driven by useChat on the scripted
 * transport; each part type has one pattern:
 *
 *   read_take      → Tool, its reads under it, then what it noticed
 *   edits          → Task, every step a Trace line, folded when done
 *   plan_cut       → Confirmation while it waits; a Tool line once answered
 *   cut_variant    → Subagent, its steps streaming
 *   text           → the receipt (components/ui/markdown)
 *   data-checkpoint→ Checkpoint, the run's one Undo
 */

import type * as React from "react"

import { Button } from "@/components/ui/button"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Markdown } from "@/components/ui/markdown"
import { Message, MessageContent, MessageHeader } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Trace, TraceLine, TraceTitle, TraceDescription } from "@/components/ui/trace"
import { Checkpoint } from "@/components/ai-elements/checkpoint"
import { Confirmation } from "@/components/ai-elements/confirmation"
import { SubagentRow } from "@/components/ai-elements/subagent"
import { Suggestions } from "@/components/ai-elements/suggestion"
import { TaskFold, TaskRow } from "@/components/ai-elements/task"
import { ToolRow } from "@/components/ai-elements/tool"
import { PixelFriend } from "@/components/mascot"

import { TAKE, fmt } from "../round-1/fixture"
import { type CutsPart, type CutsUIMessage, isEdit, textOf } from "../round-2/chat"
import { cutFrom, type CutChat } from "../round-2/use-cut-chat"
import "@/components/editor/cuts-shadcn.css"

/**
 * Round 4's choreography: the cursor's presses, not the stream, say when a
 * step ticks and the length changes; the run folds once the cursor parks,
 * and the receipt and the checkpoint arrive with that fold.
 */
export type MarginMotion = {
  /** True once Quincy's cursor has pressed this tool call (or variant step target). */
  landed: (id: string) => boolean
  /** The run is over and the cursor has parked. */
  settled: boolean
  /** The length as the lanes show it now. */
  seconds: number
}

export function Margin({
  chat,
  starters,
  foot,
  empty,
  motion,
}: {
  chat: CutChat
  motion?: MarginMotion
  /** Shown when the take is open and nothing is running. */
  starters?: readonly { text: string; read?: string }[]
  foot?: React.ReactNode
  empty?: React.ReactNode
}) {
  const { messages, busy } = chat
  const lastId = messages.at(-1)?.id
  const reading = messages.some((m) =>
    m.parts.some((p) => p.type === "tool-read_take" && (p.state !== "output-available" || p.preliminary)),
  )
  const waiting = messages.some((m) => m.parts.some((p) => p.type === "tool-plan_cut" && p.state === "approval-requested"))
  const showStarters =
    starters && starters.length > 0 && messages.length > 0 && !busy && !reading && !waiting && !chat.rewinding && (motion?.settled ?? true)

  return (
    <div className="cuts-shadcn flex min-h-0 flex-1 flex-col gap-3 text-sm">
      <div className="relative flex h-7 shrink-0 items-center justify-between">
        <span className="font-medium">Cut with Quincy</span>
        {busy ? (
          <Button size="xs" variant="outline" onClick={() => void chat.stop()}>
            Stop · Esc
          </Button>
        ) : messages.length ? (
          <Button size="xs" variant="ghost" onClick={chat.replay}>
            Replay
          </Button>
        ) : null}
        {/* Where Quincy's cursor parks between runs. */}
        <span data-q="park" aria-hidden className="absolute top-9 right-2 size-px" />
      </div>

      {messages.length === 0 ? (
        <div className="flex min-h-0 flex-1 flex-col">{empty}</div>
      ) : (
        <MessageScrollerProvider autoScroll scrollPreviousItemPeek={48}>
          <MessageScroller className="min-h-0 flex-1">
            <MessageScrollerViewport aria-label="Cutting with Quincy">
              <MessageScrollerContent className="gap-5 pb-2">
                {messages.map((m) => (
                  <MessageScrollerItem key={m.id} messageId={m.id} scrollAnchor={m.role === "user"} className="[content-visibility:visible]">
                    {m.role === "user" ? (
                      <Message align="end">
                        <MessageContent>
                          <Bubble align="end" variant="muted">
                            <BubbleContent>{textOf(m)}</BubbleContent>
                          </Bubble>
                        </MessageContent>
                      </Message>
                    ) : (
                      <Message>
                        <MessageContent className="gap-3">
                          <MessageHeader className="gap-1.5 px-0">
                            <PixelFriend size={16} state={busy && m.id === lastId ? "writing" : "idle"} />
                            Quincy
                          </MessageHeader>
                          <Parts message={m} chat={chat} streaming={busy && m.id === lastId} motion={motion} />
                        </MessageContent>
                      </Message>
                    )}
                  </MessageScrollerItem>
                ))}
                {chat.undone ? (
                  <MessageScrollerItem messageId="undone" className="[content-visibility:visible]">
                    <Checkpoint label="Run undone" action="Redo" onAction={chat.redo} />
                  </MessageScrollerItem>
                ) : null}
                {/* Next steps sit right under the checkpoint, not at the foot. */}
                {showStarters ? (
                  <MessageScrollerItem messageId="next" className="[content-visibility:visible]">
                    <Suggestions items={starters} onPick={chat.send} />
                  </MessageScrollerItem>
                ) : null}
              </MessageScrollerContent>
            </MessageScrollerViewport>
          </MessageScroller>
        </MessageScrollerProvider>
      )}

      {foot}
      <div className="flex h-11 shrink-0 items-center rounded-xl border border-border bg-background px-3 text-muted-foreground">
        Say the next change
      </div>
    </div>
  )
}

type Group = { kind: "edits"; parts: CutsPart[] } | { kind: "one"; part: CutsPart }

function group(parts: readonly CutsPart[]): Group[] {
  const out: Group[] = []
  for (const p of parts) {
    const last = out.at(-1)
    if (isEdit(p)) {
      if (last?.kind === "edits") last.parts.push(p)
      else out.push({ kind: "edits", parts: [p] })
    } else out.push({ kind: "one", part: p })
  }
  return out
}

function Parts({
  message,
  chat,
  streaming,
  motion,
}: {
  message: CutsUIMessage
  chat: CutChat
  streaming: boolean
  motion?: MarginMotion
}) {
  // With motion, what follows the steps waits for the fold, and arrives with it.
  const after = (node: React.ReactNode, key: number) =>
    !motion ? node : motion.settled ? (
      <div key={key} className="qc4-appear">
        {node}
      </div>
    ) : null
  return (
    <>
      {group(message.parts).map((g, i) => {
        if (g.kind === "edits") {
          const steps = g.parts.flatMap((p) => {
            if (!isEdit(p)) return []
            const landed = p.state === "output-available" && (motion ? motion.landed(p.toolCallId) : true)
            const live = motion ? !motion.settled : streaming
            return [
              {
                id: p.toolCallId,
                title: landed && p.state === "output-available" ? p.output.say : (p.title ?? ""),
                description: landed && p.state === "output-available" ? p.output.detail : live ? undefined : "skipped",
                status: landed ? undefined : live ? ("running" as const) : ("pending" as const),
              },
            ]
          })
          const landed = steps.filter((s) => s.status === undefined).length
          const running = steps.some((s) => s.status === "running")
          if (motion) {
            // This run's own result: every edit landed up to and including it.
            const upto = chat.messages.slice(0, chat.messages.findIndex((x) => x.id === message.id) + 1)
            const through = cutFrom(
              upto.flatMap((m) =>
                m.parts.flatMap((q) =>
                  isEdit(q) && q.state === "output-available" && motion.landed(q.toolCallId) ? [{ type: q.type, input: q.input }] : [],
                ),
              ),
            ).seconds
            return (
              <TaskFold
                key={i}
                settled={motion.settled}
                title={
                  motion.settled || !running
                    ? `${landed} ${landed === 1 ? "edit" : "edits"} · ${fmt(TAKE.seconds)} → ${fmt(through)}`
                    : `Cutting · ${landed} of ${steps.length} · ${fmt(through)}`
                }
                steps={steps}
              />
            )
          }
          return (
            <TaskRow
              key={i}
              title={running ? `Cutting · ${landed} of ${steps.length}` : `${landed} edits · ${fmt(TAKE.seconds)} → ${fmt(chat.cut.seconds)}`}
              steps={steps}
            />
          )
        }
        const p = g.part
        switch (p.type) {
          case "text":
            return after(<Markdown key={i} preset="kit" streaming={streaming}>{p.text}</Markdown>, i)
          case "data-checkpoint":
            return streaming
              ? null
              : after(
                  <Checkpoint
                    key={i}
                    label={`r${p.data.revision} · ${p.data.label}`}
                    action="Undo the run"
                    disabled={chat.rewinding || message.id !== chat.messages.at(-1)?.id}
                    onAction={chat.undo}
                  />,
                  i,
                )
          case "tool-read_take": {
            const out = p.state === "output-available" ? p.output : undefined
            const done = p.state === "output-available" && !p.preliminary
            return (
              <div key={i} className="flex flex-col gap-2">
                <ToolRow status={done ? undefined : streaming ? "running" : "error"} title={p.title ?? "Reading"} defaultOpen>
                  <Trace>
                    {(out?.reads ?? []).map((r) => (
                      <TraceLine key={r.label} status={r.done ? undefined : streaming ? "running" : "pending"}>
                        <TraceTitle>{r.label}</TraceTitle>
                        {r.done ? <TraceDescription>{r.found}</TraceDescription> : null}
                      </TraceLine>
                    ))}
                  </Trace>
                </ToolRow>
                {out && out.noticed.length ? (
                  <div className="flex flex-col gap-1">
                    <p className="font-medium">What I noticed</p>
                    <ul className="flex flex-col gap-1 text-muted-foreground">
                      {out.noticed.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            )
          }
          case "tool-plan_cut":
            if (p.state === "approval-requested") {
              return (
                <Confirmation
                  key={i}
                  title={p.title ?? "Here is what I would do"}
                  description="Untick what you want left alone. Enter is Go."
                  lines={p.input.lines}
                  onRespond={(approved, skipped) =>
                    void chat.addToolApprovalResponse({ id: p.approval.id, approved, reason: skipped.join(",") })
                  }
                />
              )
            }
            return (
              <ToolRow
                key={i}
                status={"approval" in p && p.approval?.approved ? undefined : "denied"}
                title={"approval" in p && p.approval?.approved ? "Plan approved" : "Plan declined"}
                description={p.title}
              />
            )
          case "tool-cut_variant": {
            const out = p.state === "output-available" ? p.output : undefined
            const done = p.state === "output-available" && !p.preliminary
            const pressed = (t: string) => !motion || motion.landed(t)
            const steps = (out?.steps ?? []).map((s) => ({ id: s.target, title: s.say, done: s.done && pressed(s.target) }))
            const allIn = done && steps.every((s) => s.done)
            const looked = (out?.steps ?? []).find((s) => s.target.endsWith(":preview") && s.done && pressed(s.target))
            return (
              <div key={i} className="flex flex-col gap-2">
                <SubagentRow
                  title={p.input?.name ?? ""}
                  description={allIn && out ? `${fmt(out.seconds)} · hook at ${out.hookAt}` : p.input?.brief}
                  done={allIn}
                  running={!allIn && (streaming || (motion ? !motion.settled : false))}
                  steps={steps}
                />
                {motion && looked ? (
                  // The frames it looked at arrive together, as one entrance.
                  <ul className="qc4-rise ml-6 flex gap-1.5" aria-label={`Frames ${p.input?.name ?? ""} looked at`}>
                    {["0:04", "0:16", "0:31"].map((t, k) => (
                      <li key={t} className="flex w-[64px] flex-col gap-1">
                        <span className="relative block h-[36px] rounded-md bg-muted">
                          <span className="absolute bottom-1 left-1/2 h-3 w-5 -translate-x-1/2 rounded-t-full bg-muted-foreground/60" />
                          {k === 0 && looked.say.includes("chin") ? (
                            <span className="absolute inset-x-2 bottom-1 h-1.5 rounded-sm bg-foreground" />
                          ) : null}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">{t}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            )
          }
          default:
            return null
        }
      })}
    </>
  )
}
