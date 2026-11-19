"use client"

/*
 * The standard round-2 piece: piece 02's desk, a chat on the scripted
 * transport, and Quincy's cursor reading that chat's tool parts. A piece
 * passes the few things it pushes (the cursor's look, the flash's tone, the
 * margin's anatomy, what the empty margin says) and overlays.
 */

import type * as React from "react"

import { ComposerStill } from "../round-1/parts"
import { Conversation, type ConversationProps } from "./conversation"
import { AgentCursor, type AgentCursorProps } from "./cursor"
import { Desk, DeskPreview, Lanes, MarginHead } from "./desk"
import type { CutChat } from "./use-cut-chat"

export type CutDeskProps = {
  chat: CutChat
  cursor?: Pick<AgentCursorProps, "look" | "label" | "ring" | "glide"> & { say?: boolean }
  tone?: "ink" | "highlight" | "well"
  conversation?: Omit<ConversationProps, "chat">
  /** Numbered dots on landed targets, matched to numbered steps. */
  trail?: boolean
  /** Above the composer, under the conversation. */
  foot?: React.ReactNode
  /** Over the whole desk: notes, the person's pointer. */
  children?: React.ReactNode
  /** Replaces the preview. */
  preview?: React.ReactNode
  /** Replaces the lanes. */
  lanes?: React.ReactNode
  composer?: string
}

export function CutDesk({
  chat,
  cursor = {},
  tone,
  conversation,
  trail = false,
  foot,
  children,
  preview,
  lanes,
  composer = "Say the next change",
}: CutDeskProps) {
  const { say, ...look } = cursor
  return (
    <Desk
      rootRef={chat.bind}
      seconds={chat.cut.seconds}
      preview={preview ?? <DeskPreview cut={chat.cut} hot={chat.hot} />}
      lanes={
        lanes ?? (
          <Lanes
            cut={chat.cut}
            hot={chat.hot}
            tone={tone}
            width={600}
            playhead={chat.cut.zoom ? 16.7 : undefined}
            trail={trail ? chat.landed.map((p) => p.input.target) : undefined}
          />
        )
      }
      margin={
        <>
          <MarginHead chat={chat} />
          <Conversation chat={chat} {...conversation} />
          {foot}
          <ComposerStill placeholder={composer} />
        </>
      }
    >
      <AgentCursor
        root={chat.root}
        aim={chat.aim}
        pressKey={chat.pressKey}
        working={chat.busy}
        say={say ? (chat.working?.title ?? undefined) : undefined}
        {...look}
      />
      {children}
    </Desk>
  )
}
