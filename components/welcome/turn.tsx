"use client"

import * as React from "react"

import { Text } from "@/components/kit"
import { Friend, type MascotState } from "@/components/mascot"
import { QuincyReply, YourTurn } from "@/components/quincy"

/**
 * The two turn shapes, and the arrival, shared by the interview and the wiring.
 *
 * They are the Studio conversation's own parts (docs/design/quincy-chat.md):
 * Quincy's turn is a `QuincyReply` with no surface of its own, the person's is
 * the one bubble (`YourTurn`). The interview and the wiring both use them, so
 * the screen reads as one conversation, which is the claim it makes.
 *
 * Quincy's lines here are plain sentences, not markdown: the newest one types
 * (TypedLine), and a typed line and a settled one have to wrap the same way or
 * the transcript re-flows the moment the typing ends.
 */

/**
 * Fade and rise, on the kit's enter duration. The `motion-reduce` half is not
 * optional; see AGENTS.md.
 */
export const ARRIVES =
  "animate-in fade-in slide-in-from-bottom-2 duration-(--kit-duration-enter) ease-kit-out motion-reduce:animate-none"

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
    <div className={animate ? ARRIVES : undefined}>
      <QuincyReply>
        <Text as="div">
          <span className="block max-w-kit-doc text-pretty whitespace-pre-wrap">
            {children}
          </span>
        </Text>
      </QuincyReply>
    </div>
  )
}

export function UserTurn({
  children,
  animate = true,
}: {
  children: string
  animate?: boolean
}) {
  return (
    <div className={animate ? ARRIVES : undefined}>
      <YourTurn>{children}</YourTurn>
    </div>
  )
}

/**
 * Quincy working: the friend in its working state and the words for what it
 * is doing (docs/design/states.md, "Working"). Three dots would be the
 * reflex; this says what. `listening` while it takes something in,
 * `reading` while it reads.
 */
export function Working({
  children,
  state = "reading",
}: {
  children: string
  state?: Extract<MascotState, "listening" | "reading" | "writing">
}) {
  return (
    <div className={ARRIVES}>
      <Text as="div" role="status" tone="muted">
        <span className="inline-flex items-center gap-2">
          <Friend size={20} state={state} className="shrink-0" />
          <span className="min-w-0">{children}</span>
        </span>
      </Text>
    </div>
  )
}

/**
 * Something did not work, said in ink where it happened (states.md: no red,
 * no icon). Announced without taking focus.
 */
export function Refusal({ children }: { children: string }) {
  return (
    <Text role="status">
      {children}
    </Text>
  )
}
