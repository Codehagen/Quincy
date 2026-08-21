"use client"

import * as React from "react"

import { cn } from "@/lib/utils"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Message, MessageContent } from "@/components/ui/message"

/**
 * The two turn shapes, and the arrival, shared by the interview and the wiring.
 *
 * They were private to first-run.tsx while the wiring was a settings screen
 * underneath the conversation. It is not one any more: connecting X now makes
 * Quincy read, report and keep talking, so the wiring needs the same bubble the
 * interview uses. A second copy of it there would be two components drifting
 * apart on the one thing this screen is claiming — that it is all one
 * conversation.
 */

/** Fade and rise. The `motion-reduce` half is not optional; see AGENTS.md. */
export const ARRIVES =
  "animate-in fade-in slide-in-from-bottom-2 duration-300 ease-out motion-reduce:animate-none"

/**
 * A turn.
 *
 * `animate` is false for anything that was already on the screen a frame ago —
 * the transcript on a return visit, and the turn the server has just taken
 * over from the in-flight slots. Only a turn the person has not yet seen
 * arrives.
 */
export function QuincyTurn({
  children,
  animate = true,
}: {
  children: React.ReactNode
  animate?: boolean
}) {
  return (
    <Message className={cn(animate && ARRIVES)}>
      <MessageContent>
        <Bubble variant="ghost" align="start">
          <BubbleContent className="text-body text-pretty whitespace-pre-wrap">
            {children}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}

export function UserTurn({
  children,
  animate = true,
}: {
  children: React.ReactNode
  animate?: boolean
}) {
  return (
    <Message align="end" className={cn(animate && ARRIVES)}>
      <MessageContent>
        <Bubble variant="secondary" align="end">
          <BubbleContent className="whitespace-pre-wrap">
            {children}
          </BubbleContent>
        </Bubble>
      </MessageContent>
    </Message>
  )
}
