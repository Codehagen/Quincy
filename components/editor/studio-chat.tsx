"use client"

import * as React from "react"
import { isToolUIPart } from "ai"

import {
  AspectRatioIcon,
  Layers01Icon,
  Scissor01Icon,
  SubtitleIcon,
  TextStrikethroughIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"
import type { IconSvgElement } from "@hugeicons/react"

import { Kbd } from "@/components/kit"
import { Checkpoint } from "@/components/ai-elements/checkpoint"
import { Confirmation } from "@/components/ai-elements/confirmation"
import { PromptInput } from "@/components/ai-elements/prompt-input"
import { StatusIcon } from "@/components/ai-elements/status-icon"
import { Suggestions } from "@/components/ai-elements/suggestion"
import { TaskFold, type TaskStep } from "@/components/ai-elements/task"
import { ToolRow } from "@/components/ai-elements/tool"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import { Markdown } from "@/components/ui/markdown"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Trace, TraceIcon, TraceLine, TraceTitle } from "@/components/ui/trace"
import { readableChatError } from "@/lib/chat-error"
import {
  noticed,
  startersFor,
  type Frame,
  type Starter,
  type TakeReading,
} from "@/lib/editor/reading"

import { cleanUpReceiptOf } from "@/lib/editor/disfluency"
import { fillerReceiptOf } from "@/lib/editor/fillers"
import type { CutsMessage } from "@/lib/editor/stream-parts"

import type { BeatState, Director } from "./agent-cursor/director"
import { cutsOf, recommendationOf, type RunRecord } from "./cuts-stream"
import { CutsTurn } from "./cuts-turn"
import { StyleAndHooks } from "./style-and-hooks"
import { removedUs } from "./agent-cursor/timing"
import { sentenceFor, stepDetail, stepTitle } from "./run-steps"
import { CheckFrames, type CheckState } from "./self-check/check-frames"
import type { Arrival } from "./arrival/use-arrival"
import type { LookSource } from "./self-check/use-self-check"
import { formatClockTenths } from "./studio-parts"
import { entryState } from "./history"
import {
  useCutsStream,
  type CutsDesk,
  type RunControls,
  type StudioHarness,
} from "./use-cuts-stream"
import "./cuts-shadcn.css"

/**
 * The cutting chat, as a narrow margin beside the lanes (plans/036, phase A).
 *
 * **Real shadcn, scoped to the kit.** The owner chose shadcn itself for this
 * margin (docs/design/decisions.md, "Cuts, decided"; AGENTS.md): the
 * registry components in components/ui and the AI Elements patterns in
 * components/ai-elements, inside `.cuts-shadcn`, which points their variables
 * at the kit. The composer stays the kit's.
 *
 * **The run is drawn from the cursor, not the stream.** Every `data-ops`
 * part goes to the director, which lands it with a press of Quincy's cursor;
 * the steps tick and the length moves when the press lands, never before.
 * One run is one undo, one checkpoint.
 *
 * **The receipt.** One summary line holds the numbers ("5 edits · 00:37.0 →
 * 00:32.5", tabular figures, the transport's precision); Quincy's prose names
 * the changes in words; the steps are two-column rows, label and what it
 * removed. Next steps sit directly under the checkpoint, and never offer a
 * request whose edits are already in the cut.
 *
 * **The gate.** A run that would remove more than 30% of the take or whole
 * spoken sentences waits (lib/editor/gate.ts, decided on the server). The
 * question says why, in words, and is answered with the SDK's approval
 * response; the approved call then runs like any other.
 *
 * **Drawing only.** The stream and the run state behind it (transport, data
 * parts, Stop and its read-back, the undo group, the self-check) live in
 * use-cuts-stream.ts; this file renders what it returns.
 */

/**
 * What the person can ask for first when there is no reading of the take
 * (no transcript yet). With a reading, the starters come from it, each with
 * its reason (lib/editor/reading.ts).
 */
const STARTERS: readonly Starter[] = [
  {
    text: "Tighten the edit",
    tool: "remove_silences",
    read: "Cuts the pauses and closes the gaps",
  },
  {
    text: "Add captions",
    tool: "add_captions",
    read: "Word by word, from the transcript",
  },
  {
    text: "Make it vertical",
    tool: "reframe",
    read: "9:16 for TikTok and Reels",
  },
  {
    text: "Push in on the first line",
    tool: "punch_in",
    read: "A slow zoom for emphasis",
  },
]

/**
 * Three cuts from one recording (phase D): offered once the cut has length,
 * and sent as its own kind of run, so the route can hold it to its cooldown
 * and the day's ceiling for all three.
 */
const THREE_CUTS: Starter = {
  text: "Make three cuts",
  tool: "three_cuts",
  read: "Reels, LinkedIn and a Shorts teaser, and which to post first",
}

/** Tools whose calls are reads, not edits: no step in the run. */
const READS = new Set(["describe_timeline"])

export type { CutsDesk, RunControls, StudioHarness } from "./use-cuts-stream"

export function StudioChat({
  projectId,
  director,
  controls,
  onSaved,
  onRunningChange,
  reading,
  arrival,
  passes,
  frame,
  look,
  desk,
  harness,
}: {
  projectId: string
  director: Director
  controls: RunControls
  /** The revision the server holds now that the run has written. */
  onSaved: (revision: number) => void
  /** Drives the read-only timeline and its reason line. */
  onRunningChange: (running: boolean) => void
  /** What Quincy noticed in the take, from its transcript; null without one. */
  reading: TakeReading | null
  /** The arrival's state: while it scans, the noticed block and starters wait (phase G). */
  arrival: Arrival
  /** The arrival's passes, drawn over the noticed block's space; null when it did not play. */
  passes: React.ReactNode
  /** The cut's frame now, for whether "vertical" is still a change. */
  frame: Frame
  /** Where the self-check reads its frames from: the scene and the proxies. */
  look: LookSource
  desk: CutsDesk
  harness?: StudioHarness
}) {
  const noticedId = React.useId()
  const [input, setInput] = React.useState("")
  const {
    messages,
    status,
    error,
    isBusy,
    failure,
    stopped,
    cutRevisions,
    runs,
    checks,
    send: sendText,
    halt,
    retry,
    respond,
  } = useCutsStream({
    projectId,
    director,
    controls,
    onSaved,
    onRunningChange,
    look,
    desk,
    harness,
  })

  const send = ({ text }: { text: string }) => {
    if (sendText(text)) setInput("")
  }

  /* ── What the margin shows ───────────────────────────────────────────── */

  const empty = messages.length === 0
  // The empty state's exit: set in render the moment the first message
  // arrives (no frame without it), cleared once its 150ms fade is done.
  const [wasEmpty, setWasEmpty] = React.useState(empty)
  const [leaving, setLeaving] = React.useState(false)
  if (wasEmpty !== empty) {
    setWasEmpty(empty)
    setLeaving(!empty)
  }
  React.useEffect(() => {
    if (!leaving) return
    const timer = window.setTimeout(() => setLeaving(false), 150)
    return () => window.clearTimeout(timer)
  }, [leaving])
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === "assistant")
  const waitingOnGate = messages.some((m) =>
    m.parts.some((p) => isToolUIPart(p) && p.state === "approval-requested")
  )

  // Next steps never offer a request whose edits are already in the cut.
  const done = new Set(
    director.beats
      .filter((b) => b.landed && b.toolName)
      .map((b) => b.toolName as string)
  )
  const starters = [
    ...(reading ? startersFor(reading, frame) : STARTERS),
    ...(controls.durationUs > 0 ? [THREE_CUTS] : []),
  ]
  if (messages.some((m) => m.role === "assistant" && cutsOf(m)))
    done.add(THREE_CUTS.tool)
  const nextSteps = starters.filter((s) => !done.has(s.tool))
  const record = lastAssistant ? runs[lastAssistant.id] : undefined

  // Said once per run, politely, when it settles: what the run changed.
  const pick = lastAssistant ? recommendationOf(lastAssistant) : null
  // Typing or sending skips the arrival: it never holds the margin up.
  const scanning = arrival.phase === "scanning"
  const skipArrival = arrival.skip
  React.useEffect(() => {
    if (!empty) skipArrival()
  }, [empty, skipArrival])

  // The arrival is said once, when it settles, never per pass.
  const announcement = empty
    ? arrival.played && arrival.phase === "settled" && reading
      ? `Read the take. ${noticed(reading).join(" ")}`
      : ""
    : record && !isBusy && pick
      ? `Three cuts made. ${pick.reason}`
      : record && !isBusy
        ? `${record.edits} ${record.edits === 1 ? "edit" : "edits"}, ${formatClockTenths(record.startUs)} to ${formatClockTenths(record.endUs)}.`
        : waitingOnGate
          ? "Quincy asks before this cut."
          : ""

  // The empty state, as the Chat pattern has it: rendered while there are no
  // messages. On the first send it leaves as the thread arrives (one
  // crossfade, cuts-shadcn.css): a copy stays for 150ms out of the layout,
  // inert, while the scroller mounts under it.
  const emptyState = (
    <Empty className="h-full justify-center-safe overflow-y-auto">
      {/* The question leads; what Quincy read and the starters answer it. */}
      <EmptyHeader>
        <EmptyTitle>What should we cut?</EmptyTitle>
        <EmptyDescription>
          You can still edit by hand: split with <Kbd keys={["S"]} />, trim by
          dragging a clip edge, undo with <Kbd keys={["mod", "Z"]} />.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent className="relative">
        {passes ? (
          <div className="absolute inset-x-0 top-0">{passes}</div>
        ) : null}
        {/* One entrance for what the reading found and what it offers:
            held back (and inert) while the passes read, then together. */}
        <div
          data-arrival={arrival.phase}
          data-played={arrival.played ? "" : undefined}
          inert={scanning}
          className="arrival-enter flex w-full flex-col items-center gap-4"
        >
          {reading ? (
            <section
              aria-labelledby={noticedId}
              className="flex flex-col gap-1"
            >
              <h3 id={noticedId} className="font-medium">
                What I noticed
              </h3>
              <ul className="flex flex-col gap-0.5 text-muted-foreground tabular-nums">
                {noticed(reading).map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </section>
          ) : null}
          {starters.length > 0 ? (
            <Suggestions
              className="justify-center"
              items={withIcons(starters)}
              onPick={(text) => send({ text })}
              disabled={isBusy}
            />
          ) : null}
          {controls.durationUs > 0 ? (
            <StyleAndHooks
              onPick={(text) => send({ text })}
              disabled={isBusy}
            />
          ) : null}
        </div>
      </EmptyContent>
    </Empty>
  )

  return (
    <div className="cuts-shadcn flex h-full min-h-0 flex-col text-sm">
      <div className="flex h-12 shrink-0 items-center border-b border-kit-hairline px-kit-row-x">
        <span className="font-medium">Cut with Quincy</span>
      </div>

      <div role="status" aria-live="polite" className="sr-only">
        {announcement}
      </div>

      <div className="relative flex min-h-0 flex-1 flex-col">
        {empty ? (
          emptyState
        ) : (
          // As the Chat demo: no autoScroll. A new request anchors near the
          // top with a peek of the turn before it, and the reply grows into
          // the room under it; what does not fit arrives out of view, with
          // the button to reach it, so the margin never moves on its own.
          <MessageScrollerProvider scrollPreviousItemPeek={48}>
            <MessageScroller className="min-h-0 flex-1">
              <MessageScrollerViewport aria-label="Cutting with Quincy">
                <MessageScrollerContent
                  aria-busy={isBusy}
                  className="gap-5 px-kit-row-x py-3"
                >
                  {messages.map((message) =>
                    message.role === "user" ? (
                      // Only the person's message animates in (the Chat demo's slide-up).
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                        scrollAnchor
                        className="cuts-msg-in"
                      >
                        <Message align="end">
                          <MessageContent>
                            <Bubble align="end" variant="muted">
                              <BubbleContent>{textOf(message)}</BubbleContent>
                            </Bubble>
                          </MessageContent>
                        </Message>
                        {/* The chatbot template's "Thinking" line until the reply's
                            row exists, drawn inside this row: a row of its own
                            swapped for the reply would leave the scroller's count
                            unchanged, and it would re-anchor to an older request. The
                            reply's row opens with the same line, a row gap below. */}
                        {status === "submitted" &&
                        message.id === messages.at(-1)?.id ? (
                          <div className="mt-5">
                            <ReadingLine />
                          </div>
                        ) : null}
                      </MessageScrollerItem>
                    ) : (
                      <MessageScrollerItem
                        key={message.id}
                        messageId={message.id}
                      >
                        {cutsOf(message) ? (
                          <CutsTurn
                            message={message}
                            cuts={cutsOf(message)!}
                            live={isBusy && message.id === lastAssistant?.id}
                            stopped={stopped.has(message.id)}
                            beats={director.beats}
                            checks={checks}
                            revisions={cutRevisions}
                            durationOf={desk.durationOf}
                            hasScene={desk.hasScene}
                            aspectOf={desk.aspectOf}
                            onUndoCut={(sceneId) => {
                              if (!isBusy) desk.undoCut(sceneId)
                            }}
                          />
                        ) : (
                          <Turn
                            message={message}
                            live={isBusy && message.id === lastAssistant?.id}
                            stopped={stopped.has(message.id)}
                            beats={director.beats}
                            record={runs[message.id]}
                            check={checks[message.id]}
                            aspect={look.canvas.width / look.canvas.height}
                            controls={controls}
                            onRespond={respond}
                          />
                        )}
                        {/* Next steps sit right under the checkpoint, inside the turn's
                            row, and arrive with the receipt. A send takes them out at
                            once; being part of the row (not a row of their own) keeps
                            the scroller's count honest, so the new request anchors. */}
                        {message.id === lastAssistant?.id &&
                        !isBusy &&
                        !waitingOnGate &&
                        record &&
                        nextSteps.length > 0 ? (
                          <div className="agent-appear mt-5">
                            <Suggestions
                              items={withIcons(nextSteps)}
                              onPick={(text) => send({ text })}
                            />
                            <div className="mt-2">
                              <StyleAndHooks
                                onPick={(text) => send({ text })}
                              />
                            </div>
                          </div>
                        ) : null}
                      </MessageScrollerItem>
                    )
                  )}

                  {failure || error ? (
                    <MessageScrollerItem messageId="failed">
                      <div
                        role="alert"
                        className="flex flex-col items-start gap-2"
                      >
                        <p>{failure ?? readableChatError(error!)}</p>
                        {error && !failure ? (
                          <Button
                            size="xs"
                            variant="outline"
                            onClick={() => {
                              const asked = [...messages]
                                .reverse()
                                .find((m) => m.role === "user")
                              retry(asked ? textOf(asked) : null)
                            }}
                          >
                            Try again
                          </Button>
                        ) : null}
                      </div>
                    </MessageScrollerItem>
                  ) : null}
                </MessageScrollerContent>
              </MessageScrollerViewport>
              <MessageScrollerButton />
            </MessageScroller>
          </MessageScrollerProvider>
        )}
        {leaving ? (
          <div
            aria-hidden="true"
            inert
            className="cuts-empty-leave pointer-events-none absolute inset-0 flex flex-col"
          >
            {emptyState}
          </div>
        ) : null}
      </div>

      <div className="shrink-0 px-kit-row-x pt-2 pb-kit-row-x">
        <PromptInput
          label="Message Quincy"
          placeholder="Tighten this, add captions, make it vertical"
          value={input}
          onValueChange={(value) => {
            setInput(value)
            if (scanning) skipArrival()
          }}
          onSubmit={(text) => send({ text })}
          busy={isBusy}
          onStop={halt}
        />
      </div>
    </div>
  )
}

/**
 * One of Quincy's turns: the run's steps as one Task that folds when the
 * cursor parks, the question when the run waits, then the prose, the
 * checkpoint. What follows the steps arrives with the fold.
 */
function Turn({
  message,
  live,
  stopped,
  beats,
  record,
  check,
  aspect,
  controls,
  onRespond,
}: {
  message: CutsMessage
  live: boolean
  stopped: boolean
  beats: readonly BeatState[]
  record: RunRecord | undefined
  /** The self-check of this run's cut, once it has frames. */
  check: CheckState | undefined
  aspect: number
  controls: RunControls
  onRespond: (approvalId: string, approved: boolean) => void
}) {
  const tools = message.parts
    .filter(isToolUIPart)
    .filter((p) => !READS.has(toolNameOf(p.type)))
  const gates = new Map(
    message.parts.flatMap((p) =>
      p.type === "data-gate" ? [[p.data.toolCallId, p.data] as const] : []
    )
  )

  const steps: TaskStep[] = []
  for (const part of tools) {
    if (part.state === "approval-requested" || part.state === "output-denied")
      continue
    const mine = beats.filter((b) => b.toolCallId === part.toolCallId)
    if (mine.length === 0) {
      // A call that produced no batch: it changed nothing, is still running,
      // or never answered before Stop.
      const finished =
        part.state === "output-available" || part.state === "output-error"
      if (finished && part.state === "output-available") continue
      steps.push({
        id: part.toolCallId,
        title: sentenceFor(
          toolNameOf(part.type),
          finished ? "done" : "running"
        ),
        status: stopped
          ? "pending"
          : live
            ? "running"
            : part.state === "output-error"
              ? "error"
              : "pending",
        description: stopped || (!live && !finished) ? "skipped" : undefined,
      })
      continue
    }
    for (const beat of mine) {
      steps.push({
        id: beat.id,
        title: stepTitle(beat),
        status: beat.landed ? undefined : live ? "running" : "pending",
        description: beat.landed
          ? stepDetail(beat)
          : live
            ? undefined
            : "skipped",
      })
    }
  }

  const landed = steps.filter((s) => s.status === undefined).length
  // Until the run is recorded, its start is the cut now plus what it removed.
  const removed = beats
    .filter((b) => b.landed && tools.some((p) => p.toolCallId === b.toolCallId))
    .reduce((sum, b) => sum + removedUs(b.target), 0)
  const startUs = record?.startUs ?? controls.durationUs + removed
  const settled = !live

  const text = message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n\n")
  const pending = message.parts
    .filter(isToolUIPart)
    .filter((p) => p.state === "approval-requested")
  // A filler cut names what it took ("Removed 7 fillers: 4 × øh, 3 × um ·
  // 2.1 s"), from the tool's own first line: the owner wanted the words by
  // name, so the person sees sounds went and no speech.
  // A clean-up names its kinds the same way ("Cleaned up 5: 3 repeated
  // words, 2 false starts · 1.8 s").
  const fillerLines = tools.flatMap((p) => {
    if (p.state !== "output-available") return []
    const name = toolNameOf(p.type)
    const line =
      name === "remove_fillers"
        ? fillerReceiptOf(p.output)
        : name === "clean_up_speech"
          ? cleanUpReceiptOf(p.output)
          : null
    return line ? [line] : []
  })
  const answered = message.parts
    .filter(isToolUIPart)
    .filter((p) => p.state === "output-denied")

  // Undo and Redo act on the top of a stack, so the checkpoint acts only
  // while its own entry is there; otherwise it would take back another run.
  const where = entryState(controls.historyIds, record?.entry ?? null)
  const undone = where === "redo" || where === "undone"

  // Settled, the count includes the self-check's fix: the same number the
  // screen reader hears, and the same undo.
  const settledEdits = record?.edits ?? landed

  return (
    <Message>
      <MessageContent className="w-full gap-3">
        {/* Until the first step or word: the same line the waiting row
            showed, so the hand-over from it to the turn moves nothing. */}
        {live && steps.length === 0 && !text && pending.length === 0 ? (
          <ReadingLine />
        ) : null}

        {steps.length > 0 ? (
          <TaskFold
            settled={settled}
            title={
              settled
                ? `Cut · ${settledEdits} ${settledEdits === 1 ? "edit" : "edits"} · ${formatClockTenths(startUs)} → ${formatClockTenths(record?.endUs ?? controls.durationUs)}`
                : `Cutting · ${landed} of ${steps.length} · ${formatClockTenths(controls.durationUs)}`
            }
            steps={steps}
          />
        ) : null}

        {pending.map((part) =>
          "approval" in part && part.approval ? (
            <Confirmation
              key={part.toolCallId}
              title="This is a big cut. Go ahead?"
              description={
                gates.get(part.toolCallId)?.reason ??
                "This removes a lot of the take, so I ask first."
              }
              approveLabel="Cut it"
              denyLabel="Leave it"
              onRespond={(approved) => onRespond(part.approval!.id, approved)}
            />
          ) : null
        )}

        {answered.map((part) => (
          <ToolRow
            key={part.toolCallId}
            status="denied"
            title="Left the cut as it was"
            description={gates.get(part.toolCallId)?.reason}
          />
        ))}

        {check ? <CheckFrames check={check} aspect={aspect} /> : null}

        {/* A reply with no run streams in place, never animated (the Chat
            pattern). After a run, the receipt's words and the checkpoint
            wait for the record, then arrive with the fold as one entrance. */}
        {steps.length === 0 && text ? (
          <Markdown preset="kit" streaming={live}>
            {text}
          </Markdown>
        ) : settled && record ? (
          <div className="agent-appear flex flex-col gap-3">
            {text ? <Markdown preset="kit">{text}</Markdown> : null}
            {fillerLines.map((line, index) => (
              <p key={index} className="text-muted-foreground tabular-nums">
                {line}
              </p>
            ))}
            {record.edits > 0 ? (
              <Checkpoint
                label={
                  where === "gone"
                    ? "Undone"
                    : undone
                      ? "Run undone"
                      : record.revision !== null
                        ? `Revision ${record.revision}`
                        : "This run"
                }
                action={undone ? "Redo" : "Undo the run"}
                disabled={where !== "undo" && where !== "redo"}
                onAction={undone ? controls.redo : controls.undo}
              />
            ) : null}
          </div>
        ) : null}
      </MessageContent>
    </Message>
  )
}

/** The chatbot template's "Thinking" line: a running Trace line, shimmering. */
function ReadingLine() {
  return (
    <Trace>
      <TraceLine status="running">
        <TraceIcon>
          <StatusIcon status="running" />
        </TraceIcon>
        <TraceTitle>Reading the cut</TraceTitle>
      </TraceLine>
    </Trace>
  )
}

/** What kind of edit a starter is, as the icon that leads its chip. */
const STARTER_ICON: Record<string, IconSvgElement> = {
  remove_silences: Scissor01Icon,
  remove_fillers: TextStrikethroughIcon,
  clean_up_speech: TextStrikethroughIcon,
  add_captions: SubtitleIcon,
  reframe: AspectRatioIcon,
  punch_in: ZoomInAreaIcon,
  three_cuts: Layers01Icon,
}

function withIcons<T extends { tool: string }>(items: readonly T[]) {
  return items.map((s) => ({ ...s, icon: STARTER_ICON[s.tool] }))
}

function toolNameOf(type: string): string {
  return type.startsWith("tool-") ? type.slice(5) : type
}

function textOf(message: CutsMessage): string {
  return message.parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join(" ")
}
