"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"
import { useRouter } from "next/navigation"
import { DefaultChatTransport, type ChatTransport } from "ai"

import { Composer, MessageList, MessageListItem, Text, type ComposerSubmit } from "@/components/kit"
import type { MascotState } from "@/components/mascot"
import {
  ChatDraftProvider,
  ConversationHistory,
  QuincyGreeting,
  QuincyGreetingPrelude,
  QuincyReply,
  ReplyFailed,
} from "@/components/quincy"
import { FIXTURE_GREETING, fixtureDraftActions, isStudioFixture, scriptedStudio } from "@/lib/chat-fixtures"
import { readableChatError } from "@/lib/chat-error"
import { currentDraftsFromParts, type DraftVersionRef } from "@/lib/draft-artifact"
import { toFileUIParts } from "@/lib/file-parts"
import type { StudioDraftActions } from "@/lib/studio-draft-actions"
import type { StudioGreeting } from "@/lib/studio-greeting"
import type { StudioUIMessage } from "@/lib/studio-message"
import { currentToolCallIds, planTurn, turnMood } from "@/lib/studio-turn"

import { serverDraftActions } from "./studio-draft-actions"
import { QuincyByline, StudioTurn } from "./studio-turn"

/**
 * The scripted transport is opt-in and build-time, never a fallback: if the
 * gateway is down the person gets an error they can act on. When it is on,
 * the conversation runs on @shadcn/helpers/ai-sdk fixtures in the browser
 * (lib/chat-fixtures, `?fixture=` picks one) and never reaches /api/chat, and
 * the draft card's actions run in memory, so nothing touches the database.
 */
const SCRIPTED =
  process.env.NEXT_PUBLIC_CHAT_TRANSPORT === "scripted" &&
  // Never on the production deployment, whatever the variable says: a canned
  // reply there would look like Quincy answering. NEXT_PUBLIC_VERCEL_ENV is
  // inlined at build (next.config.ts passes VERCEL_ENV through).
  process.env.NEXT_PUBLIC_VERCEL_ENV !== "production"

/**
 * What the attached files may weigh together. Not a server rule: /api/chat
 * meters text, not bytes (its 413 is for a conversation too long). The
 * ceiling is Vercel's 4.5 MB request body, and files travel inline as data
 * URLs, which grow by a third. 3 MB of files is 4 MB on the wire, with room
 * left for the conversation they ride with.
 */
const MAX_FILE_BYTES = 3 * 1024 * 1024

const GENERIC_GREETING: StudioGreeting = {
  opening: ["Hand me the raw material: a merged PR, a call, a half-thought. I'll draft it in your voice, and nothing goes out until you approve it."],
  chips: ["Turn what I shipped today into a post", "What should I be writing about this week?"],
  link: null,
  typed: false,
}

function makeTransport(): { transport: ChatTransport<StudioUIMessage>; actions: StudioDraftActions } {
  if (SCRIPTED) {
    const params = new URLSearchParams(window.location.search)
    const name = params.get("fixture")
    // `?pace=4` plays the script four times slower, to look at a state.
    const pace = Number(params.get("pace")) || 1
    return {
      transport: scriptedStudio(isStudioFixture(name) ? name : "draft", { pace, delayMs: 18 * pace }),
      actions: fixtureDraftActions(),
    }
  }
  return {
    transport: new DefaultChatTransport<StudioUIMessage>({ api: "/api/chat" }),
    actions: serverDraftActions,
  }
}

export type StudioScreenProps = {
  conversationId: string
  initialMessages?: StudioUIMessage[]
  /** Quincy's opening on an empty Studio, composed on the server from the desk. */
  greeting?: StudioGreeting
  /** The person's initials, for the draft card's avatar. */
  initials: string
}

/**
 * Studio: the conversation with Quincy. The chatbot template's `Chat`, on the
 * kit: useChat owns the turns; MessageList holds them to the live edge; the
 * Composer sends text and files, and becomes Stop while a reply arrives; an
 * error is Quincy's own sentence with Try again (regenerate).
 *
 * Quincy drafts, you send: a draft arrives as a card with Approve, which
 * takes the same Lineup slot as /drafts. Nothing publishes from here.
 */
export function StudioScreen({ conversationId, initialMessages, greeting: served, initials }: StudioScreenProps) {
  // Scripted, the opening is the script's too: a real opening over a fixture
  // reply is the mix that once made a canned answer look like a live one.
  const greeting = SCRIPTED && served ? FIXTURE_GREETING : served
  const router = useRouter()
  const [input, setInput] = React.useState("")
  const [files, setFiles] = React.useState<File[]>([])
  const isNew = !initialMessages || initialMessages.length === 0
  const movedUrl = React.useRef(false)

  // Built once, on the client: the scripted transport reads `?fixture=`.
  const [{ transport, actions }] = React.useState(() =>
    typeof window === "undefined"
      ? { transport: new DefaultChatTransport<StudioUIMessage>({ api: "/api/chat" }), actions: serverDraftActions }
      : makeTransport(),
  )

  const { messages, sendMessage, status, stop, error, regenerate, clearError } = useChat<StudioUIMessage>({
    id: conversationId,
    messages: initialMessages,
    transport,
    // 20 renders a second while a reply streams, not one per token.
    throttle: 50,
    onFinish: ({ isError, isAbort, isDisconnect }) => {
      // A first turn that failed or was stopped saved nothing (the route
      // saves only a finished reply), so /c/[id] would be a 404 and the
      // words would be lost. Stay here; the error and Try again are on screen.
      if (isError || isAbort || isDisconnect) return
      if (!isNew || movedUrl.current || SCRIPTED) return
      movedUrl.current = true
      // replace, not push: Back leaves the app rather than returning to an
      // empty composer for a conversation that now exists. The history menu
      // is server-rendered, so it needs telling.
      router.replace(`/c/${conversationId}`)
      router.refresh()
    },
  })

  const busy = status === "submitted" || status === "streaming"
  const empty = messages.length === 0

  /* ── The drafts on screen, for the next turn and the one action ──────── */

  const live = React.useRef(new Map<string, DraftVersionRef>())
  const [decided, setDecided] = React.useState<ReadonlySet<string>>(() => new Set())
  const report = React.useCallback((version: DraftVersionRef) => {
    live.current.set(version.versionId, version)
    setDecided((prev) => {
      const has = prev.has(version.versionId)
      if ((version.state === "approved") === has) return prev
      const next = new Set(prev)
      if (has) next.delete(version.versionId)
      else next.add(version.versionId)
      return next
    })
  }, [])

  const drafts = React.useMemo(() => currentDraftsFromParts(messages), [messages])
  const currentToolCallId = React.useMemo(() => currentToolCallIds(messages), [messages])

  // One action on the view (docs/design/actions.md): words typed and not
  // sent make Send the action; otherwise the first draft waiting for Approve.
  const typing = input.trim().length > 0 || files.length > 0
  const actionVersionId = typing
    ? null
    : (drafts.find((d) => d.state === "writing" && !decided.has(d.versionId))?.versionId ?? null)

  /* ── The greeting survives the first answer and the move to /c/[id] ──── */

  const greetingKey = `quincy:greeting:${conversationId}`
  const [storedPrelude, setStoredPrelude] = React.useState<string[] | null>(null)
  React.useEffect(() => {
    if (greeting || isNew) return
    try {
      const raw = sessionStorage.getItem(greetingKey)
      // After hydration on purpose: the server cannot see sessionStorage.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setStoredPrelude(JSON.parse(raw) as string[])
    } catch {
      // A prelude that cannot be read back is done without.
    }
  }, [greeting, isNew, greetingKey])
  const prelude = greeting?.opening ?? storedPrelude

  const composerInput = React.useRef<HTMLTextAreaElement>(null)

  /**
   * Throws only before anything is sent (a file that cannot be read), so the
   * Composer can put the words and files back. After that, useChat owns the
   * turn: a failure shows as Quincy's own error with Try again, and the
   * words are already in the transcript.
   */
  async function send({ text, files: attached }: ComposerSubmit) {
    const fileParts = attached.length > 0 ? await toFileUIParts(attached) : undefined
    if (empty && greeting) {
      try {
        sessionStorage.setItem(greetingKey, JSON.stringify(greeting.opening))
      } catch {
        // Storage blocked: the greeting just won't survive the URL move.
      }
    }
    clearError()
    // The version on screen, edits included, goes into the next turn.
    const currentDrafts = drafts.map((d) => live.current.get(d.versionId) ?? d)
    void sendMessage({
      text,
      files: fileParts,
      metadata: currentDrafts.length > 0 ? { currentDrafts } : undefined,
    })
  }

  const composer = (
    <Composer
      label="Message Quincy"
      placeholder="Hand me something to write about"
      value={input}
      onValueChange={setInput}
      onFilesChange={setFiles}
      onSubmit={send}
      inputRef={composerInput}
      maxFileBytes={MAX_FILE_BYTES}
      busy={busy}
      onStop={() => void stop()}
      attachments
      // The conversation's own history sits with the conversation (from md
      // up; a phone has it in the shell's bar).
      tools={<ConversationHistory />}
      isAction={typing}
      autoFocus={empty}
    />
  )

  return (
    <ChatDraftProvider
      actions={actions}
      initials={initials}
      currentToolCallId={currentToolCallId}
      actionVersionId={actionVersionId}
      report={report}
    >
      <div className="flex h-full min-h-0 flex-col">
        <h1 className="sr-only">Studio</h1>
        {empty ? (
          <div className="mx-auto flex w-full max-w-kit-page flex-1 flex-col justify-end gap-kit-lead-gap px-kit-page-gutter pt-kit-page-top pb-kit-group">
            <QuincyGreeting
              greeting={greeting ?? GENERIC_GREETING}
              disabled={busy}
              onPick={(text) => {
                void send({ text, files: [] })
                // The chips leave with the empty state; the next words go here.
                composerInput.current?.focus()
              }}
            />
          </div>
        ) : (
          <div className="min-h-0 flex-1">
            <MessageList label="Conversation with Quincy">
              {prelude ? (
                <MessageListItem id="prelude">
                  <QuincyGreetingPrelude opening={prelude} />
                </MessageListItem>
              ) : null}
              <Transcript messages={messages} status={status} failed={error} decided={decided} />
              {error ? (
                <MessageListItem id="error">
                  <QuincyReply>
                    <QuincyByline mood="stuck" />
                    <ReplyFailed rest="Your words are still above." onRetry={() => void regenerate()}>
                      {readableChatError(error)}
                    </ReplyFailed>
                  </QuincyReply>
                </MessageListItem>
              ) : null}
            </MessageList>
          </div>
        )}
        <div className="mx-auto w-full max-w-kit-page shrink-0 px-kit-page-gutter pb-[max(env(safe-area-inset-bottom),var(--spacing-kit-group))]">
          {SCRIPTED ? (
            // Said on screen, so a canned reply is never taken for a live one.
            <div className="mb-kit-controls px-1.5">
              <Text variant="small" tone="muted">
                Scripted chat: replies are fixtures, nothing reaches the model or the database.
              </Text>
            </div>
          ) : null}
          {composer}
        </div>
      </div>
    </ChatDraftProvider>
  )
}

/**
 * The turns, insulated from the composer: typing re-renders the composer
 * alone, and a streamed chunk re-renders only the turn that is arriving.
 */
const Transcript = React.memo(function Transcript({
  messages,
  status,
  failed,
  decided,
}: {
  messages: StudioUIMessage[]
  status: string
  failed: Error | undefined
  decided: ReadonlySet<string>
}) {
  const busy = status === "submitted" || status === "streaming"
  const last = messages.at(-1)
  const waiting = status === "submitted" && last?.role === "user"
  // The friend sits beside the newest Quincy reply only, and never beside a
  // reply when the error under it is the newest thing Quincy said.
  const newestReply = waiting || failed ? null : [...messages].reverse().find((m) => m.role === "assistant")

  return (
    <>
      {messages.map((message) => {
        const isLive = busy && message.id === last?.id && message.role === "assistant"
        let mood: MascotState | null = null
        if (message.id === newestReply?.id) {
          mood = turnMood(planTurn(message.parts, { live: isLive }), {
            live: isLive,
            decided: (id) => decided.has(id),
          })
        }
        return (
          <MessageListItem key={message.id} id={message.id} anchor={message.role === "user"}>
            <StudioTurn
              message={message}
              live={isLive}
              mood={mood}
              copyable={!isLive && message.role === "assistant"}
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
