"use client"

import * as React from "react"
import {
  Image01Icon,
  Layers01Icon,
  MusicNote01Icon,
  Settings01Icon,
  Share08Icon,
  TextFontIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { PROJECT_NAME } from "../data"
import { PlayButton, Preview, formatClock } from "../parts"

/**
 * The Console shell. Settled chrome — round 1 chose the layout, round 2 chose
 * the timeline that goes in it, so nothing here is under discussion any more.
 */

const RAIL: { icon: IconSvgElement; label: string }[] = [
  { icon: Video01Icon, label: "Media" },
  { icon: Image01Icon, label: "Images" },
  { icon: MusicNote01Icon, label: "Sounds" },
  { icon: TextFontIcon, label: "Text" },
  { icon: Layers01Icon, label: "Transitions" },
  { icon: Settings01Icon, label: "Settings" },
]

export function EditorFrame({
  children,
  chat,
  playing,
  onTogglePlaying,
  positionUs,
  hoverUs,
  word,
  running,
  durationUs,
  toolbarEnd,
}: {
  children: React.ReactNode
  chat: React.ReactNode
  playing: boolean
  onTogglePlaying: () => void
  positionUs: number
  /** Set while the pointer is over the lane. Drives the preview, not the head. */
  hoverUs?: number | null
  word?: string
  running: boolean
  /** What the timeline currently spans. Shrinks as the cut lands. */
  durationUs: number
  toolbarEnd?: React.ReactNode
}) {
  const scrubbing = hoverUs !== null && hoverUs !== undefined

  return (
    <div className="flex h-full min-h-0 bg-background">
      <nav
        aria-label="Editor tools"
        className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-3"
      >
        {RAIL.map((item, index) => (
          <button
            key={item.label}
            type="button"
            className={cn(
              "flex w-full flex-col items-center gap-1 rounded-md py-2 text-muted-foreground",
              "transition-colors duration-150 ease-out",
              "hover:bg-secondary/60 hover:text-foreground",
              "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
              index === 0 && "bg-secondary text-foreground"
            )}
          >
            <HugeiconsIcon aria-hidden="true" icon={item.icon} size={17} />
            <span className="text-[9px] leading-none">{item.label}</span>
          </button>
        ))}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <h1 className="truncate text-sm font-medium text-foreground">
            {PROJECT_NAME}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HugeiconsIcon aria-hidden="true" icon={Share08Icon} size={14} />
              Share
            </button>
            <button
              type="button"
              className="flex h-8 items-center rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground transition-[background-color,transform] duration-150 ease-out hover:brightness-105 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none active:scale-[0.98]"
            >
              Export
            </button>
          </div>
        </header>

        <div className="relative grid min-h-0 flex-1 place-items-center p-5">
          <Preview word={word} className="max-h-full" />

          {/* Scrub badge. Without it the preview changing under the pointer
              reads as a glitch — this says the frame is a preview of somewhere
              you are not, and that the playhead has not moved. */}
          {scrubbing ? (
            <span className="pointer-events-none absolute top-7 right-7 rounded-full border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground tabular-nums">
              Scrubbing {formatClock(hoverUs!)}
            </span>
          ) : null}
        </div>

        <section
          aria-label="Timeline"
          className="shrink-0 border-t border-border/60 bg-card/40"
        >
          <div className="flex h-11 items-center gap-3 px-4">
            <PlayButton playing={playing} onToggle={onTogglePlaying} />
            <span className="text-xs text-foreground tabular-nums">
              {formatClock(positionUs)}
              <span className="text-muted-foreground">
                {" / "}
                {formatClock(durationUs)}
              </span>
            </span>
            {running ? (
              <span className="text-xs text-muted-foreground">Cutting…</span>
            ) : null}
            <div className="ml-auto">{toolbarEnd}</div>
          </div>

          <div className="px-4 pb-4">{children}</div>
        </section>
      </div>

      <aside
        aria-label="Studio chat"
        className="w-[340px] shrink-0 border-l border-border/60"
      >
        {chat}
      </aside>
    </div>
  )
}
