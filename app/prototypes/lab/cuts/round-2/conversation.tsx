"use client"

/*
 * The chat margin: AI Elements anatomy on the kit, driven by the scripted
 * transport. Each part type has one element:
 *
 *   text                 → MessageText (the receipt, after the steps)
 *   edit tools           → Tool rows inside one Task, folded to a summary when done
 *   check_frames         → a Tool whose output carries the frames it looked at
 *   read_take            → a Tool whose preliminary outputs are the three reads
 *   plan_cut (approval)  → Confirmation, answered with addToolApprovalResponse
 *   cut_variant          → Subagent rows, each streaming its own steps
 *   data-checkpoint      → Checkpoint (Undo returns to before the run)
 *
 * Pieces choose the few things that differ (flat steps or a task, undo that
 * reverts or rewinds, what the empty margin says) and keep the rest.
 */

import type * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Video01Icon } from "@hugeicons/core-free-icons"

import { MessageList, MessageListItem } from "@/components/kit"

import { TAKE, fmt } from "../round-1/fixture"
import { type CutsPart, type CutsUIMessage, isEdit, PROMPTS, textOf } from "./chat"
import { target } from "./cursor"
import { Checkpoint } from "./elements/checkpoint"
import { Confirmation } from "./elements/confirmation"
import { AssistantMessage, MessageText, UserMessage } from "./elements/message"
import { Subagent } from "./elements/subagent"
import { Task } from "./elements/task"
import { ToolRow } from "./elements/tool"
import { Trace, TraceLine } from "./elements/trace"
import type { CutChat } from "./use-cut-chat"

export type ConversationProps = {
  chat: CutChat
  /** `task` folds a run's edits into one Task; `flat` keeps every step visible. */
  steps?: "task" | "flat"
  /** `revert` jumps back; `rewind` walks the parts off so the cursor runs backwards. */
  undo?: "revert" | "rewind"
  /** Shown while there is no conversation. */
  empty?: React.ReactNode
  /** Which variant is picked, by name; set by a piece that lets you pick. */
  picked?: string
  /** Hide the receipt text; a piece that draws its own. */
  hideText?: boolean
}

export function Conversation({ chat, steps = "task", undo = "revert", empty, picked, hideText }: ConversationProps) {
  const { messages, busy } = chat
  if (messages.length === 0) return <div className="flex min-h-0 flex-1 flex-col">{empty}</div>
  const lastId = messages.at(-1)?.id

  return (
    <div className="min-h-0 flex-1">
      <MessageList label="Cutting with Quincy">
        {messages.map((m) => (
          <MessageListItem key={m.id} id={m.id} anchor={m.role === "user"}>
            {m.role === "user" ? (
              <UserTurn message={m} />
            ) : (
              <AssistantMessage mood={busy && m.id === lastId ? "writing" : "found"}>
                <Parts
                  message={m}
                  chat={chat}
                  streaming={busy && m.id === lastId}
                  steps={steps}
                  undo={undo}
                  picked={picked}
                  hideText={hideText}
                />
              </AssistantMessage>
            )}
          </MessageListItem>
        ))}
      </MessageList>
    </div>
  )
}

function UserTurn({ message }: { message: CutsUIMessage }) {
  const text = textOf(message)
  if (text === PROMPTS.upload) {
    return (
      <UserMessage>
        <span className="flex items-center gap-2">
          <HugeiconsIcon icon={Video01Icon} size={14} aria-hidden />
          {TAKE.file}
          <span className="text-kit-ink-muted">{TAKE.size}</span>
        </span>
      </UserMessage>
    )
  }
  return <UserMessage>{text}</UserMessage>
}

type Group = { kind: "edits"; parts: CutsPart[] } | { kind: "one"; part: CutsPart }

/** Consecutive edits become one group, so a run reads as one task. */
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
  steps,
  undo,
  picked,
  hideText,
}: {
  message: CutsUIMessage
  chat: CutChat
  streaming: boolean
  steps: "task" | "flat"
  undo: "revert" | "rewind"
  picked?: string
  hideText?: boolean
}) {
  return (
    <div className="flex flex-col gap-3">
      {group(message.parts).map((g, i) => {
        if (g.kind === "edits") {
          const rows = g.parts.map((p) => (isEdit(p) ? <ToolRow key={p.toolCallId} part={p} streaming={streaming} /> : null))
          const running = streaming && g.parts.some((p) => isEdit(p) && p.state !== "output-available")
          if (steps === "flat") return <Trace key={i}>{rows}</Trace>
          const landed = g.parts.filter((p) => isEdit(p) && p.state === "output-available").length
          return (
            <Task
              key={i}
              running={running}
              title={`Cutting · ${landed} of ${g.parts.length}`}
              summary={`${g.parts.length} edits · ${fmt(TAKE.seconds)} → ${fmt(chat.cut.seconds)}`}
            >
              {rows}
            </Task>
          )
        }
        const p = g.part
        switch (p.type) {
          case "text":
            return hideText ? null : <MessageText key={i} text={p.text} />
          case "reasoning":
            return null
          case "data-checkpoint":
            return streaming ? null : (
              <Checkpoint
                key={i}
                label={p.data.label}
                revision={p.data.revision}
                undone={false}
                disabled={chat.rewinding}
                onUndo={undo === "rewind" ? chat.rewind : chat.undo}
                onRedo={chat.redo}
              />
            )
          case "tool-check_frames":
            return (
              <Trace key={i}>
                <ToolRow part={p} streaming={streaming}>
                  {p.state === "output-available" ? (
                    <ul className="flex gap-1.5">
                      {p.output.frames.map((f) => (
                        <li
                          key={f.target}
                          {...target(chat.hot, f.target)}
                          className="qc-target flex w-[68px] flex-col gap-1 rounded-kit-chip"
                        >
                          <span className="relative block h-[38px] rounded-kit-chip bg-kit-stage">
                            <span className="absolute bottom-1 left-1/2 h-3 w-5 -translate-x-1/2 rounded-t-full bg-kit-ink-muted" />
                            <span className="absolute top-1.5 left-1/2 size-3 -translate-x-1/2 rounded-full bg-kit-chrome" />
                          </span>
                          <span className="text-kit-meta leading-tight text-kit-ink-muted">
                            {f.at} · {f.note}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </ToolRow>
              </Trace>
            )
          case "tool-read_take": {
            const out = p.state === "output-available" ? p.output : undefined
            return (
              <Trace key={i}>
                <ToolRow part={p} streaming={streaming}>
                  <Trace>
                    {(out?.reads ?? []).map((r) => (
                      <TraceLine key={r.label} status={r.done ? "done" : streaming ? "running" : "waiting"} title={r.label} meta={r.done ? r.found : undefined} />
                    ))}
                  </Trace>
                </ToolRow>
                {out && out.noticed.length ? (
                  <li className="mt-2 list-none">
                    <p className="font-kit-strong">What I noticed</p>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {out.noticed.map((n) => (
                        <li key={n}>{n}</li>
                      ))}
                    </ul>
                  </li>
                ) : null}
              </Trace>
            )
          }
          case "tool-plan_cut":
            if (p.state === "approval-requested") {
              return (
                <Confirmation
                  key={i}
                  title={p.title ?? "Here is what I would do"}
                  lead="Untick what you want left alone."
                  lines={p.input.lines}
                  onRespond={(approved, skipped) =>
                    void chat.addToolApprovalResponse({ id: p.approval.id, approved, reason: skipped.join(",") })
                  }
                />
              )
            }
            return (
              <Trace key={i}>
                <TraceLine
                  status={p.state === "output-denied" || (p.state === "approval-responded" && !p.approval.approved) ? "denied" : "done"}
                  title={p.state === "output-denied" ? "Plan declined" : "Plan approved"}
                  meta={p.input?.lines ? `${p.input.lines.length} lines` : undefined}
                />
              </Trace>
            )
          case "tool-cut_variant": {
            const out = p.state === "output-available" ? p.output : undefined
            return p.input ? (
              <Subagent
                key={i}
                name={p.input.name ?? ""}
                brief={p.input.brief ?? ""}
                output={out}
                streaming={streaming}
                picked={picked === p.input.name}
              />
            ) : null
          }
          default:
            return null
        }
      })}
    </div>
  )
}
