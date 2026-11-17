"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport, type UIMessage } from "ai"

import {
  Choice,
  Choices,
  Composer,
  Kbd,
  MessageList,
  MessageListItem,
  Text,
  type ComposerSubmit,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import type { MascotState } from "@/components/mascot"
import { QuincyReply, ReplyFailed } from "@/components/quincy"
import { QuincyByline, StudioTurn } from "@/components/studio/studio-turn"
import { readableChatError } from "@/lib/chat-error"
import type { EditOp } from "@/lib/editor/ops"
import { EDITOR_TOOL_SENTENCES } from "@/lib/editor/turn-sentences"
import type { StudioPart } from "@/lib/studio-message"
import { planTurn, turnMood } from "@/lib/studio-turn"

/**
 * The cutting chat, on Studio's conversation parts (docs/design/quincy-chat.md,
 * "Studio"): the kit MessageList holds the turns to the live edge, each turn is
 * Studio's own `StudioTurn` (YourTurn, QuincyReply, QuincyWork, ReplyText) with
 * the cutting tools said in Quincy's words (lib/editor/turn-sentences.ts), and
 * the kit Composer sends.
 *
 * **Rendering is Studio's, not its own.** A second renderer here would be a
 * second set of bugs, and it would drift: the editor's receipts would stop
 * matching Studio's the first time either was touched. The editor's tools are
 * all work steps, so `planTurn` draws them as a receipt ("Removed the
 * silences") with no card.
 *
 * **Ops arrive as transient data parts and go straight into the document.** The
 * timeline moves while the model is still talking. That is the whole reason the
 * run streams rather than returning a finished document — a tightening pass
 * that removes forty pauses should look like an edit happening, not a spinner
 * followed by a different timeline.
 */

const SUGGESTIONS = [
  "Remove the silences",
  "Add word-by-word captions",
  "Make it vertical",
] as const

/** The re-read after Stop: about ten seconds, then the conflict path takes over. */
const READ_BACK_TRIES = 10
const READ_BACK_DELAY_MS = 1000

type EditorDataParts = {
  ops: { ops: EditOp[] }
  saved: { revision: number }
  "run-failed": { message: string }
}

export function StudioChat({
  projectId,
  onOps,
  onSaved,
  onRunningChange,
}: {
  projectId: string
  /** Applied to the local document the moment they arrive. */
  onOps: (ops: EditOp[]) => void
  /** The revision the server holds now that the run has written. */
  onSaved: (revision: number) => void
  /** Drives the read-only timeline and the "Cutting" line. */
  onRunningChange: (running: boolean) => void
}) {
  const [input, setInput] = React.useState("")
  const [failure, setFailure] = React.useState<string | null>(null)

  const [transport] = React.useState(
    () =>
      new DefaultChatTransport({
        api: `/api/editor/projects/${projectId}/agent`,
      })
  )

  // The latest onSaved, for a re-read that resolves after a render.
  const savedRef = React.useRef(onSaved)
  React.useEffect(() => {
    savedRef.current = onSaved
  }, [onSaved])

  /**
   * After Stop, the server still saves what the run already cut (see the
   * agent route's onEnd), but the stream is closed, so `data-saved` never
   * reaches us. Without the new revision the next autosave 409s. So read the
   * project back until the run's lock is off, then take its revision.
   * A bounded read of our own row: at most READ_BACK_TRIES requests.
   */
  const readBack = React.useCallback(async () => {
    for (let attempt = 0; attempt < READ_BACK_TRIES; attempt++) {
      await new Promise((resolve) => setTimeout(resolve, READ_BACK_DELAY_MS))
      try {
        const response = await fetch(`/api/editor/projects/${projectId}`, { cache: "no-store" })
        if (!response.ok) return
        const project = (await response.json()) as {
          revision: number
          lock: { status: string } | null
        }
        if (!project.lock || project.lock.status === "unlocked") {
          savedRef.current(project.revision)
          return
        }
      } catch {
        // Offline for a moment: the next try may reach it.
      }
    }
  }, [projectId])

  const { messages, sendMessage, status, stop, error, regenerate, clearError } =
    useChat({
      transport,
      onFinish: ({ isAbort }) => {
        if (isAbort) void readBack()
      },
      /**
       * Every data part the run sends, in order.
       *
       * Transient parts are only ever visible here — they are deliberately not
       * in `message.parts`, because a reload that replayed every past run's ops
       * onto a document that already has them would double every edit ever
       * made.
       */
      onData: (part) => {
        if (part.type === "data-ops") {
          onOps((part.data as EditorDataParts["ops"]).ops)
        } else if (part.type === "data-saved") {
          onSaved((part.data as EditorDataParts["saved"]).revision)
        } else if (part.type === "data-run-failed") {
          setFailure((part.data as EditorDataParts["run-failed"]).message)
        }
      },
    })

  const isBusy = status === "submitted" || status === "streaming"

  // Reported up rather than derived there, so the timeline and the toolbar do
  // not each have to know how useChat spells "working".
  React.useEffect(() => {
    onRunningChange(isBusy)
  }, [isBusy, onRunningChange])

  const send = React.useCallback(
    ({ text }: Pick<ComposerSubmit, "text">) => {
      const trimmed = text.trim()
      if (!trimmed || isBusy) return

      setFailure(null)
      clearError()
      setInput("")
      void sendMessage({ text: trimmed })
    },
    [isBusy, sendMessage, clearError]
  )

  const empty = messages.length === 0

  return (
    <div className="flex h-full min-h-0 flex-col bg-kit-ground">
      {/**
       * The run indicator lives in the header, not in the transcript.
       *
       * A liveness line placed after the messages sits in the slot the answer
       * is about to occupy: it appears under an already-ticked step and reads
       * as another step rather than as "still going". Up here it competes with
       * nothing and does not move as the transcript grows. The receipt below
       * carries the running step itself, in words under the byline's friend.
       */}
      <div className="flex h-12 shrink-0 items-center gap-kit-related border-b border-kit-hairline px-kit-row-x">
        <Text as="span" weight="strong">
          Cut with Quincy
        </Text>
        {isBusy ? (
          <Text as="span" variant="small" tone="muted" role="status">
            <span className="inline-flex items-center gap-2">
              <Friend size={20} state="reading" className="shrink-0" />
              <span className="min-w-0">
                Cutting
              </span>
            </span>
          </Text>
        ) : null}
      </div>

      <div className="min-h-0 flex-1">
        {empty ? (
          <div className="flex h-full flex-col justify-end gap-kit-related px-kit-page-gutter pb-kit-group">
            <Text variant="small" tone="muted">
              Ask for a cut and watch the timeline move. You can still edit by
              hand: split with <Kbd keys={["S"]} /> where the pointer is, trim
              by dragging a clip edge, undo with <Kbd keys={["mod", "Z"]} />.
            </Text>
          </div>
        ) : (
          <MessageList label="Cutting with Quincy">
            <Transcript
              messages={messages}
              status={status}
              failed={Boolean(error) || failure !== null}
            />

            {/* A run that edited the timeline and then failed to save is the
                one failure the person cannot see for themselves: the cut on
                screen is real and the stored one is not. */}
            {failure ? (
              <MessageListItem id="run-failed">
                <QuincyReply>
                  <QuincyByline mood="stuck" />
                  <ReplyFailed>{failure}</ReplyFailed>
                </QuincyReply>
              </MessageListItem>
            ) : null}

            {error ? (
              <MessageListItem id="error">
                <QuincyReply>
                  <QuincyByline mood="stuck" />
                  <ReplyFailed
                    rest="Your words are still above."
                    onRetry={() => void regenerate()}
                  >
                    {readableChatError(error)}
                  </ReplyFailed>
                </QuincyReply>
              </MessageListItem>
            ) : null}
          </MessageList>
        )}
      </div>

      <div className="flex shrink-0 flex-col gap-kit-related px-kit-row-x pt-kit-related pb-kit-row-x">
        {/* Only while the transcript is empty. Once there is a conversation
            these are noise between the last answer and the next question. */}
        {empty ? (
          <Choices label="Suggested cuts">
            {SUGGESTIONS.map((suggestion, index) => (
              <Choice
                key={suggestion}
                arrive={index}
                disabled={isBusy}
                onClick={() => send({ text: suggestion })}
              >
                {suggestion}
              </Choice>
            ))}
          </Choices>
        ) : null}

        <Composer
          label="Message Quincy"
          placeholder="Tighten this, add captions, make it vertical"
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          busy={isBusy}
          onStop={() => void stop()}
          // Export is the editor's one action (docs/design/actions.md), so
          // Send stays the quiet control here.
          isAction={false}
        />
      </div>
    </div>
  )
}

/**
 * The turns, insulated from the composer: typing re-renders the composer
 * alone, and a streamed chunk re-renders only the turn that is arriving.
 * Studio's Transcript, minus drafts (the cutting tools write none).
 */
const Transcript = React.memo(function Transcript({
  messages,
  status,
  failed,
}: {
  messages: UIMessage[]
  status: string
  failed: boolean
}) {
  const busy = status === "submitted" || status === "streaming"
  const last = messages.at(-1)
  const waiting = status === "submitted" && last?.role === "user"
  // The friend sits beside the newest reply only, and never beside a reply
  // when the failure under it is the newest thing Quincy said.
  const newestReply =
    waiting || failed
      ? null
      : [...messages].reverse().find((m) => m.role === "assistant")

  return (
    <>
      {messages.map((message) => {
        const isLive =
          busy && message.id === last?.id && message.role === "assistant"
        let mood: MascotState | null = null
        if (message.id === newestReply?.id) {
          mood = turnMood(
            planTurn(message.parts as readonly StudioPart[], {
              live: isLive,
              sentences: EDITOR_TOOL_SENTENCES,
            }),
            { live: isLive }
          )
        }
        return (
          <MessageListItem
            key={message.id}
            id={message.id}
            // Hold the person's turn in view rather than the reply, so a long
            // answer streams downward from a fixed point.
            anchor={message.role === "user"}
          >
            <StudioTurn
              message={message}
              live={isLive}
              mood={mood}
              copyable={!isLive && message.role === "assistant"}
              sentences={EDITOR_TOOL_SENTENCES}
            />
          </MessageListItem>
        )
      })}
      {waiting ? (
        <MessageListItem id="waiting">
          <QuincyReply streaming>
            <QuincyByline mood="reading" />
            <Text as="div" role="status">
              Thinking
            </Text>
          </QuincyReply>
        </MessageListItem>
      ) : null}
    </>
  )
})
