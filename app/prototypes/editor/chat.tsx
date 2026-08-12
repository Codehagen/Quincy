"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Composer } from "@/components/chat/composer"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import { Message, MessageContent } from "@/components/ui/message"

import { CHIPS, ENHANCED_PROMPT, RUN_STEPS } from "./data"
import { TOOLS, type ToolId } from "./run"

/**
 * The studio chat, mocked against the real components.
 *
 * `Composer`, `Message` and `Marker` are the production ones — the point of
 * mocking it this way is to find out whether the editor can reuse the chat
 * surface as-is, and the answer so far is yes. Only the transport is fake:
 * there is no agent behind this, so a local reducer plays the run instead of
 * `useChat`.
 *
 * What the real version changes is small and known: swap the reducer for
 * `useChat` with a transport pointed at the editor's tool route, and let the
 * steps come from tool-call parts through `MessagePart` rather than a constant.
 * Everything visible here stays.
 */

/**
 * A turn is what was said, never how far the work got.
 *
 * Storing progress here meant copying `run.applied` into state with an effect,
 * which is the "derive it instead" smell the lint rule exists to catch: two
 * sources for one fact, and a render where they disagree. The run's progress is
 * passed in and read at render.
 */
export type ChatTurn =
  { kind: "user"; id: string; text: string } | { kind: "run"; id: string }

export function StudioChatMock({
  turns,
  done,
  active,
  onSend,
  onChip,
  value,
  onValueChange,
}: {
  turns: ChatTurn[]
  /** Tools that have returned. One entry per tool, never per clip. */
  done: ReadonlySet<ToolId>
  /** The tool executing right now, or null. */
  active: ToolId | null
  onSend: (text: string) => void
  onChip: (chip: string) => void
  value: string
  onValueChange: (value: string) => void
}) {
  const running = active !== null
  const lastRunId = [...turns].reverse().find((t) => t.kind === "run")?.id
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const element = scrollRef.current
    if (!element) return
    element.scrollTop = element.scrollHeight
  }, [turns])

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center border-b border-border/60 px-4">
        <span className="text-sm font-medium text-foreground">Studio chat</span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4"
      >
        {turns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Drop a recording in, then tell Quincy what to cut. Or start from one
            of the suggestions below.
          </p>
        ) : null}

        {turns.map((turn) => {
          if (turn.kind === "user") {
            return (
              <Message key={turn.id} align="end">
                <MessageContent className="max-w-[85%] rounded-lg rounded-br-sm bg-secondary px-3 py-2 text-xs text-foreground">
                  {turn.text}
                </MessageContent>
              </Message>
            )
          }

          const isNewest = turn.id === lastRunId

          return (
            <div key={turn.id} className="space-y-1.5">
              {TOOLS.map((tool, index) => {
                // Earlier runs are finished by definition; only the newest one
                // is still reporting.
                const isDone = !isNewest || done.has(tool.id)
                const isActive = isNewest && active === tool.id
                const step = RUN_STEPS[index]

                return (
                  <Marker
                    key={tool.id}
                    variant="border"
                    className={cn(
                      "items-start",
                      // Steps arrive with the work. A list that completes
                      // before the timeline moves is the chat claiming credit
                      // for something that has not happened yet.
                      isDone || isActive ? "opacity-100" : "opacity-40",
                      "transition-opacity duration-150 ease-out"
                    )}
                  >
                    <MarkerIcon>
                      {isDone ? (
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={Tick02Icon}
                          size={13}
                        />
                      ) : (
                        <span
                          aria-hidden="true"
                          className="block size-1.5 rounded-full bg-muted-foreground/40"
                        />
                      )}
                    </MarkerIcon>
                    <MarkerContent className="flex w-full items-baseline justify-between gap-3">
                      <span
                        className={cn(
                          "text-xs",
                          isActive && "shimmer",
                          isDone ? "text-foreground" : "text-muted-foreground"
                        )}
                      >
                        {tool.label}
                      </span>
                      {isDone ? (
                        <span className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
                          {step.detail}
                        </span>
                      ) : null}
                    </MarkerContent>
                  </Marker>
                )
              })}

              {isNewest && !running ? (
                <Message className="pt-1">
                  <MessageContent className="text-xs leading-relaxed text-foreground">
                    That is the cut. Two clips still have long pauses inside
                    them &mdash; say the word and I will tighten those too.
                  </MessageContent>
                </Message>
              ) : null}
            </div>
          )
        })}
      </div>

      <div className="shrink-0 space-y-2 border-t border-border/60 p-3">
        <div className="flex flex-wrap gap-1.5">
          {CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => onChip(chip)}

              className={cn(
                "rounded-full border border-border/60 px-2.5 py-1 text-[11px]",
                "transition-colors duration-150 ease-out",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                running
                  ? "pointer-events-none text-muted-foreground/50"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              {chip}
            </button>
          ))}
        </div>

        <Composer
          value={value}
          onValueChange={onValueChange}
          onSubmit={({ text }) => onSend(text)}
          isBusy={running}
          placeholder="Describe the edit you want…"
        />
      </div>
    </div>
  )
}

/** The enhancer, as it behaves: chips and fragments become one instruction. */
export function enhancePrompt(draft: string): string {
  return draft.trim().length > 0 ? ENHANCED_PROMPT : draft
}
