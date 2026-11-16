"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * The right-hand panel, which now holds two things.
 *
 * Tabs rather than a second column. Both of these are ways of saying what edit
 * you want — one in a sentence, one by pointing at the words — and you are only
 * ever doing one of them at a time. Side by side they would each get 170px on a
 * laptop, which is too narrow to read a transcript in and too narrow to hold a
 * conversation in.
 *
 * The chat stays mounted while the transcript is showing. It carries a live run:
 * unmounting it to look at the words would drop the stream, and the edit you
 * were watching would finish somewhere you could not see.
 */

const TABS = [
  { id: "chat", label: "Chat" },
  { id: "transcript", label: "Transcript" },
] as const

export type SideTab = (typeof TABS)[number]["id"]

export function StudioSide({
  tab,
  onTabChange,
  chat,
  transcript,
}: {
  tab: SideTab
  onTabChange: (tab: SideTab) => void
  chat: React.ReactNode
  transcript: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col">
      <div
        role="tablist"
        aria-label="Studio panel"
        className="flex h-9 shrink-0 items-center gap-1 border-b border-kit-hairline px-3"
      >
        {TABS.map((candidate) => (
          <button
            key={candidate.id}
            type="button"
            role="tab"
            aria-selected={tab === candidate.id}
            onClick={() => onTabChange(candidate.id)}
            className={cn(
              "relative h-6 rounded px-2 text-kit-small",
              "before:absolute before:-inset-y-1.5 before:inset-x-0",
              "transition-colors duration-150 ease-out",
              "outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus",
              tab === candidate.id
                ? "bg-kit-selected text-kit-ink"
                : "text-kit-ink-muted hover:text-kit-ink"
            )}
          >
            {candidate.label}
          </button>
        ))}
      </div>

      {/* Hidden, not unmounted, for the chat's sake. `hidden` rather than a
          zero-height wrapper so the inactive panel is out of the accessibility
          tree as well as out of sight. */}
      <div className={cn("min-h-0 flex-1", tab !== "chat" && "hidden")}>
        {chat}
      </div>
      <div className={cn("min-h-0 flex-1", tab !== "transcript" && "hidden")}>
        {transcript}
      </div>
    </div>
  )
}
