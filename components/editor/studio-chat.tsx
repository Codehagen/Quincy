"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { DefaultChatTransport } from "ai"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { readableChatError } from "@/lib/chat-error"
import type { EditOp } from "@/lib/editor/ops"

import { Button } from "@/components/ui/button"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageContent } from "@/components/ui/message"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Composer } from "@/components/chat/composer"
import { MessagePart } from "@/components/chat/message-parts"

/**
 * The studio chat, ported from app/prototypes/editor/chat.tsx and wired to a
 * real run.
 *
 * The prototype played a scripted run from a local reducer so the layout could
 * be judged. That reducer was never ported, on the rule that a chat which mimes
 * work it is not doing is worse than one that admits it cannot. This is the
 * transport that replaces it.
 *
 * **Rendering is the main chat's, not its own.** `MessagePart` already handles
 * every part type a turn can carry — text, reasoning, and tool calls through
 * their four states — and `MessageScroller` already solves anchoring so a long
 * answer streams downward from a fixed point. A second implementation here
 * would be a second set of bugs, and it would drift: the editor's tool rows
 * would stop matching the ones on /studio the first time either was touched.
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
  /** Drives the read-only timeline and the "Cutting…" marker. */
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

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    transport,
    /**
     * Every data part the run sends, in order.
     *
     * Transient parts are only ever visible here — they are deliberately not in
     * `message.parts`, because a reload that replayed every past run's ops onto
     * a document that already has them would double every edit ever made.
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
    ({ text }: { text: string }) => {
      const trimmed = text.trim()
      if (!trimmed || isBusy) return

      setFailure(null)
      setInput("")
      void sendMessage({ text: trimmed })
    },
    [isBusy, sendMessage]
  )

  return (
    <MessageScrollerProvider autoScroll scrollPreviousItemPeek={64}>
      <div className="flex h-full min-h-0 flex-col">
        {/**
         * The run indicator lives in the header, not in the transcript.
         *
         * It was inline twice and was wrong both times, and the reason is
         * structural rather than a matter of wording: a liveness line placed
         * after the messages sits in the slot the answer is about to occupy. So
         * it appears underneath an already-ticked tool row — "Delete clip ✓"
         * followed by "Working", which reads as another step rather than as
         * "still going" — and is then swallowed by the text that replaces it.
         *
         * Up here it competes with nothing. It cannot be mistaken for a step,
         * it does not move as the transcript grows, and the turn below reads as
         * what it is: thought, tool, answer.
         */}
        <div className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <span className="text-sm font-medium text-foreground">
            Studio chat
          </span>

          {isBusy ? (
            <span
              role="status"
              className="shimmer text-xs text-muted-foreground"
            >
              Cutting
            </span>
          ) : null}
        </div>

        <MessageScroller className="min-h-0 flex-1">
          <MessageScrollerViewport aria-label="Cutting with Quincy">
            <MessageScrollerContent className="flex flex-col gap-4 p-4">
              {messages.length === 0 ? (
                <p className="text-caption text-pretty text-muted-foreground">
                  Ask for a cut and watch the timeline move. You can still edit
                  by hand — split with <Key>S</Key> where the pointer is, trim
                  by dragging a clip edge, undo with <Key>⌘Z</Key>.
                </p>
              ) : null}

              {messages.map((message) => {
                const isUser = message.role === "user"

                return (
                  <MessageScrollerItem
                    key={message.id}
                    messageId={message.id}
                    // Hold the user's turn in view rather than the reply, so a
                    // long answer streams downward from a fixed point instead
                    // of dragging the reader along with it.
                    scrollAnchor={isUser}
                  >
                    <Message align={isUser ? "end" : "start"}>
                      {/* A turn is a sequence of parts, not a blob of text.
                          Rendering only the text silently drops every tool the
                          run called — which in an editor is the record of what
                          touched the timeline. */}
                      <MessageContent className="gap-1">
                        {message.parts.map((part, index) => (
                          <MessagePart
                            key={`${message.id}-${index}`}
                            part={part}
                            isUser={isUser}
                          />
                        ))}
                      </MessageContent>
                    </Message>
                  </MessageScrollerItem>
                )
              })}

              {/* A run that edited the timeline and then failed to save is the
                  one failure the user cannot see for themselves: the cut on
                  screen is real and the stored one is not. */}
              {failure ? (
                <Marker
                  role="alert"
                  variant="border"
                  className="items-start text-destructive"
                >
                  <MarkerIcon>
                    <HugeiconsIcon icon={Alert02Icon} />
                  </MarkerIcon>
                  <MarkerContent className="text-pretty">
                    {failure}
                  </MarkerContent>
                </Marker>
              ) : null}

              {error ? (
                <Marker
                  role="alert"
                  variant="border"
                  className="items-start text-destructive"
                >
                  <MarkerIcon>
                    <HugeiconsIcon icon={Alert02Icon} />
                  </MarkerIcon>
                  <MarkerContent className="flex flex-col items-start gap-2 text-left">
                    <span className="text-pretty">
                      {readableChatError(error)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void regenerate()}
                    >
                      Try again
                    </Button>
                  </MarkerContent>
                </Marker>
              ) : null}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>

        <div className="shrink-0 border-t border-border/60 p-3">
          {/* Only while the transcript is empty. Once there is a conversation
              these are noise between the last answer and the next question. */}
          {messages.length === 0 ? (
            <div className="mb-2 flex flex-wrap gap-1">
              {SUGGESTIONS.map((suggestion) => (
                <Button
                  key={suggestion}
                  variant="outline"
                  size="sm"
                  disabled={isBusy}
                  onClick={() => send({ text: suggestion })}
                >
                  {suggestion}
                </Button>
              ))}
            </div>
          ) : null}

          <Composer
            value={input}
            onValueChange={setInput}
            onSubmit={send}
            isBusy={isBusy}
            onStop={stop}
            placeholder="Tighten this, add captions, make it vertical…"
          />
        </div>
      </div>
    </MessageScrollerProvider>
  )
}

function Key({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border/60 bg-secondary px-1 font-sans text-[10px]">
      {children}
    </kbd>
  )
}
