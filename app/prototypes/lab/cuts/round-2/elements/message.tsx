"use client"

/*
 * Message, on the kit: the person's turn as a grey bubble at the end of the
 * line; Quincy's as a byline (the friend, in the state that fits) over its
 * parts, with no bubble, so the receipt reads as prose on the page.
 */

import type * as React from "react"

import type { MascotState } from "@/components/mascot"
import { Friend } from "@/components/mascot"

export function UserMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[90%] rounded-kit-object bg-kit-well px-3 py-1.5">{children}</div>
    </div>
  )
}

export function AssistantMessage({
  mood = "idle",
  byline = "Quincy",
  children,
}: {
  mood?: MascotState
  byline?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
        <Friend size={16} state={mood} />
        {byline}
      </span>
      {children}
    </div>
  )
}

/** A text part. Bold in the script (`**A**`) becomes strong; paragraphs on blank lines. */
export function MessageText({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {text.split(/\n{2,}/).map((para, i) => (
        <p key={i}>
          {para.split(/(\*\*[^*]+\*\*)/).map((bit, j) =>
            bit.startsWith("**") ? (
              <strong key={j} className="font-kit-strong">
                {bit.slice(2, -2)}
              </strong>
            ) : (
              bit
            ),
          )}
        </p>
      ))}
    </div>
  )
}
