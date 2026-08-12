"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { useRouter } from "next/navigation"
import { DefaultChatTransport, type UIMessage } from "ai"
import { Alert02Icon, Refresh01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { scriptedChat } from "@/lib/scripted-chat"
import { toFileUIParts } from "@/lib/file-parts"
import { readableChatError } from "@/lib/chat-error"

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
import { ConversationRail } from "@/components/chat/conversation-rail"
import { MessagePart } from "@/components/chat/message-parts"
import {
  StudioGreetingEmpty,
  StudioGreetingPrelude,
} from "@/components/chat/studio-greeting"
import type { StudioGreeting } from "@/lib/studio-greeting"

/**
 * Scripted transport is opt-in and build-time, never a fallback. If the gateway
 * is down the user gets an error they can act on — a canned reply dressed up as
 * a real one is the worse failure.
 */
const SCRIPTED = process.env.NEXT_PUBLIC_CHAT_TRANSPORT === "scripted"

const SUGGESTIONS = [
  "Turn what I shipped today into a post",
  "What should I be writing about this week?",
]

/**
 * The transcript, insulated from the composer.
 *
 * The input state lives in StudioChat (the welcome flow's prefill needs the
 * composer controlled), which meant every keystroke re-rendered every message
 * — and every assistant turn's markdown parse with it. Memoized on exactly
 * what the transcript shows, so typing touches the composer alone and a
 * streamed chunk touches this and nothing above it.
 */
const Transcript = React.memo(function Transcript({
  messages,
  status,
  error,
  onRegenerate,
}: {
  messages: UIMessage[]
  status: string
  error: Error | undefined
  onRegenerate: () => void
}) {
  return (
    <>
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
            {/* No avatar. There are only two speakers and they are
                already told apart by side and surface — a mark on every
                assistant turn is repetition, and it indents the prose
                away from the column edge for nothing. */}
            <Message align={isUser ? "end" : "start"}>
              {/* A turn is a sequence of parts, not a blob of text:
                  reasoning, tool calls, then the answer. Rendering
                  only the text parts silently dropped everything the
                  model did to get there. */}
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

      {status === "submitted" ? (
        <Marker role="status">
          <MarkerContent className="shimmer">Thinking</MarkerContent>
        </Marker>
      ) : null}

      {error ? (
        <Marker
          role="status"
          variant="border"
          className="items-start text-destructive"
        >
          <MarkerIcon>
            <HugeiconsIcon icon={Alert02Icon} />
          </MarkerIcon>
          <MarkerContent className="flex flex-col items-start gap-2 text-left">
            {/* The route answers with JSON, and useChat hands the raw
                body over as the message. Showing that verbatim puts
                braces in front of the user at the exact moment they
                need a sentence. */}
            <span className="text-pretty">{readableChatError(error)}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void onRegenerate()}
            >
              <HugeiconsIcon icon={Refresh01Icon} data-icon="inline-start" />
              Try again
            </Button>
          </MarkerContent>
        </Marker>
      ) : null}
    </>
  )
})

export function StudioChat({
  conversationId,
  initialMessages,
  greeting,
}: {
  conversationId: string
  initialMessages?: UIMessage[]
  /** Quincy's opening for an empty Studio. See components/chat/studio-greeting.tsx. */
  greeting?: StudioGreeting
}) {
  const router = useRouter()
  const [input, setInput] = React.useState("")

  // A new conversation lives at "/" until it has something in it. Moving the
  // URL before the first reply lands would put an empty thread in history.
  const isNew = !initialMessages || initialMessages.length === 0
  const hasMovedUrl = React.useRef(false)

  const [transport] = React.useState(() =>
    SCRIPTED
      ? scriptedChat.transport({
          delayMs: 18,
          // Without this the script simply stops answering once it runs out,
          // and a turn that returns nothing reads as a hang rather than as the
          // end of a fixture.
          fallback:
            "That is the end of the scripted transcript. Set AI_GATEWAY_API_KEY and clear NEXT_PUBLIC_CHAT_TRANSPORT to talk to a real model.",
        })
      : new DefaultChatTransport({ api: "/api/chat" })
  )

  const { messages, sendMessage, status, stop, error, regenerate } = useChat({
    id: conversationId,
    messages: initialMessages,
    transport,
    // 20 updates a second, not one per token. The difference is invisible to
    // a reader and it caps how often the transcript tree renders while a
    // reply streams — without it, render frequency is the gateway's token
    // rate.
    throttle: 50,
    onFinish: () => {
      if (!isNew || hasMovedUrl.current || SCRIPTED) {
        return
      }

      hasMovedUrl.current = true
      // replace, not push: Back should leave the app, not return to an empty
      // composer for a conversation that now exists.
      router.replace(`/c/${conversationId}`)
      // The sidebar list is server-rendered, so it needs telling.
      router.refresh()
    },
  })

  const isBusy = status === "submitted" || status === "streaming"
  const isEmpty = messages.length === 0

  /**
   * The greeting stays on screen after the person answers — a greeting that
   * vanishes the moment you reply makes the conversation start over. Within
   * this mount the prop is enough; the sessionStorage copy (written on first
   * send below) is for the remount that `router.replace` to /c/[id] causes,
   * where this component returns with `initialMessages` and no greeting prop.
   * The key carries the conversation id, so no other thread ever claims it.
   */
  const greetingKey = `quincy:greeting:${conversationId}`
  const [storedPrelude, setStoredPrelude] = React.useState<string[] | null>(
    null
  )
  React.useEffect(() => {
    if (greeting || isNew) return
    try {
      const raw = sessionStorage.getItem(greetingKey)
      // Deliberate read-after-hydration: the server knows nothing about
      // sessionStorage, so the first client render must match the server
      // markup (no prelude) and pick the stored one up afterwards. A lazy
      // initializer would read the store during hydration and mismatch.
      // The set fires at most once per mount.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setStoredPrelude(JSON.parse(raw) as string[])
    } catch {
      // A prelude that cannot be read back is a prelude done without.
    }
  }, [greeting, isNew, greetingKey])

  const prelude = greeting?.opening ?? storedPrelude

  async function send({ text, files }: { text: string; files: File[] }) {
    if (isEmpty && greeting) {
      try {
        sessionStorage.setItem(greetingKey, JSON.stringify(greeting.opening))
      } catch {
        // Storage full or blocked: the greeting just won't survive the URL move.
      }
    }
    await sendMessage({
      text,
      files: files.length > 0 ? await toFileUIParts(files) : undefined,
    })
  }

  if (isEmpty) {
    if (greeting) {
      return (
        <StudioGreetingEmpty
          greeting={greeting}
          disabled={isBusy}
          onPick={(text) => void send({ text, files: [] })}
          composer={
            <Composer
              autoFocus
              value={input}
              onValueChange={setInput}
              onSubmit={send}
              isBusy={isBusy}
              onStop={stop}
            />
          }
        />
      )
    }

    // Without a greeting (no server data reached this mount) the hero still
    // stands — a fallback, not a second design.
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 px-6 pb-24">
        <div className="flex flex-col items-center gap-2 text-center">
          <h1 className="text-display text-balance">Ask Quincy.</h1>
          <p className="max-w-[45ch] text-body text-pretty text-muted-foreground">
            Hand over the raw material. Quincy drafts, schedules, publishes.
          </p>
        </div>

        <Composer
          autoFocus
          value={input}
          onValueChange={setInput}
          onSubmit={send}
          isBusy={isBusy}
          onStop={stop}
        />

        {/* An empty state should offer the action that creates the thing, not
            stage it. These send on click rather than filling the composer and
            waiting for a second press on Enter — the first turn is the whole
            point of the screen. */}
        <div className="flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((suggestion) => (
            <Button
              key={suggestion}
              variant="outline"
              size="sm"
              disabled={isBusy}
              onClick={() => void send({ text: suggestion, files: [] })}
            >
              {suggestion}
            </Button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <MessageScrollerProvider autoScroll scrollPreviousItemPeek={64}>
      {/* h-full, not flex-1: this fills the layout's scroll container exactly,
          so that one never scrolls and the transcript scrolls inside the
          viewport below — where anchoring and follow-the-live-edge live. */}
      <div className="flex h-full min-h-0 flex-col">
        <MessageScroller className="flex-1">
          <MessageScrollerViewport aria-label="Conversation with Quincy">
            <MessageScrollerContent className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-6 pb-6">
              {prelude ? <StudioGreetingPrelude opening={prelude} /> : null}
              <Transcript
                messages={messages}
                status={status}
                error={error}
                onRegenerate={regenerate}
              />
            </MessageScrollerContent>
          </MessageScrollerViewport>
          {/* Outside the viewport, not inside it: a navigator that scrolled
              away with the transcript would be gone exactly when you reached
              for it. */}
          <ConversationRail messages={messages} />
          <MessageScrollerButton />
        </MessageScroller>

        <div className="mx-auto w-full max-w-3xl shrink-0 px-6 pb-6">
          <Composer
            value={input}
            onValueChange={setInput}
            onSubmit={send}
            isBusy={isBusy}
            onStop={stop}
          />
        </div>
      </div>
    </MessageScrollerProvider>
  )
}
