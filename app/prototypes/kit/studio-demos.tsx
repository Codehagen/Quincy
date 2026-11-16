"use client"

import * as React from "react"
import { useChat } from "@ai-sdk/react"

import { Button, MessageList, MessageListItem } from "@/components/kit"
import { ChatDraftProvider } from "@/components/quincy"
import { StudioTurn } from "@/components/studio/studio-turn"
import { fixtureDraftActions, studioDraftChat } from "@/lib/chat-fixtures"
import type { StudioUIMessage } from "@/lib/studio-message"
import { currentToolCallIds, planTurn, turnMood } from "@/lib/studio-turn"

/**
 * The Studio conversation, played from the scripted fixture
 * (lib/chat-fixtures) through the real useChat and the real renderer: no
 * model, no route, nothing written. Approve runs in memory.
 */
export function StudioThreadDemo() {
  const [transport] = React.useState(() => studioDraftChat().transport({ delayMs: 18 }))
  const [actions] = React.useState(() => fixtureDraftActions())
  const { messages, sendMessage, status, setMessages } = useChat<StudioUIMessage>({ transport })
  const busy = status === "submitted" || status === "streaming"
  const report = React.useCallback(() => {}, [])
  const ids = React.useMemo(() => currentToolCallIds(messages), [messages])
  const last = messages.at(-1)

  return (
    <ChatDraftProvider actions={actions} initials="CH" currentToolCallId={ids} actionVersionId={null} report={report}>
      <div className="flex flex-col gap-kit-related">
        <div className="flex gap-kit-controls">
          <Button
            variant="action"
            pending={busy}
            pendingLabel="Playing…"
            onClick={() => {
              setMessages([])
              void sendMessage({ text: "Draft the second idea" })
            }}
          >
            Play the draft story
          </Button>
        </div>
        <div className="h-[36rem] rounded-kit-stage bg-kit-ground">
          <MessageList label="Scripted conversation">
            {messages.map((m) => {
              const live = busy && m.id === last?.id && m.role === "assistant"
              const mood = m.id === last?.id && m.role === "assistant" ? turnMood(planTurn(m.parts, { live }), { live }) : null
              return (
                <MessageListItem key={m.id} id={m.id} anchor={m.role === "user"}>
                  <StudioTurn message={m} live={live} mood={mood} copyable={!live && m.role === "assistant"} />
                </MessageListItem>
              )
            })}
          </MessageList>
        </div>
      </div>
    </ChatDraftProvider>
  )
}
