"use client"

import * as React from "react"
import {
  Image01Icon,
  Layers01Icon,
  MusicNote01Icon,
  Settings01Icon,
  Share08Icon,
  SparklesIcon,
  TextFontIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { formatClock, PlayButton } from "./studio-parts"

/**
 * The Console shell, ported from app/prototypes/editor/variants/frame.tsx.
 *
 * Settled chrome: round 1 chose this layout over Transcript and Stage, round 2
 * chose the timeline that goes in it. The only changes from the prototype are
 * the ones that make it real — the title comes from the project rather than a
 * constant, and the preview is passed in rather than drawn here, because the
 * production one is a `<video>` element with a player behind it and the
 * prototype's was a gradient.
 */

/**
 * The rail, and which of it is real.
 *
 * Everything here was decorative until now — six buttons with no `onClick`,
 * the first one painted active because the prototype's screenshot had it that
 * way. A button that does nothing when pressed reads as broken; a disabled one
 * reads as later, which is the truth. So the unbuilt tools say so, and Effects
 * is the one that opens.
 *
 * Effects sits after Sounds because the rail runs from what you bring in
 * (media, images, sounds) to what you do to it, and Text and Transitions belong
 * on the same side of that line.
 */
const RAIL: { icon: IconSvgElement; label: string; tool?: StudioTool }[] = [
  { icon: Video01Icon, label: "Media" },
  { icon: Image01Icon, label: "Images" },
  { icon: MusicNote01Icon, label: "Sounds" },
  { icon: SparklesIcon, label: "Effects", tool: "effects" },
  { icon: TextFontIcon, label: "Text" },
  { icon: Layers01Icon, label: "Transitions" },
  { icon: Settings01Icon, label: "Settings" },
]

export type StudioTool = "effects"

export function StudioFrame({
  title,
  children,
  chat,
  tool,
  onToolChange,
  panel,
  preview,
  playing,
  onTogglePlaying,
  clock,
  hoverUs,
  running,
  durationUs,
  toolbarEnd,
  headerEnd,
  exportAction,
}: {
  title: string
  children: React.ReactNode
  chat: React.ReactNode
  /** Which rail tool is open, or null for none. */
  tool: StudioTool | null
  onToolChange: (tool: StudioTool | null) => void
  /** What that tool shows. Rendered in a column beside the rail. */
  panel: React.ReactNode
  preview: React.ReactNode
  playing: boolean
  onTogglePlaying: () => void
  /** The position readout — a node, not a number, because it ticks per frame
      and this frame must not re-render per frame. See PlayheadClock. */
  clock: React.ReactNode
  /** Set while the pointer is over the lane. Drives the preview, not the head. */
  hoverUs?: number | null
  running: boolean
  /** What the timeline currently spans. Shrinks as the cut lands. */
  durationUs: number
  toolbarEnd?: React.ReactNode
  /** Save state and the like, beside Share and Export. */
  headerEnd?: React.ReactNode
  /** The Export button, which owns its own progress and refusals. */
  exportAction?: React.ReactNode
}) {
  const scrubbing = hoverUs !== null && hoverUs !== undefined

  return (
    <div className="flex h-full min-h-0 bg-background">
      <nav
        aria-label="Editor tools"
        className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-border/60 py-3"
      >
        {RAIL.map((item) => {
          const open = item.tool !== undefined && item.tool === tool

          return (
            <button
              key={item.label}
              type="button"
              disabled={item.tool === undefined}
              aria-pressed={item.tool === undefined ? undefined : open}
              title={
                item.tool === undefined
                  ? `${item.label} — not built yet`
                  : item.label
              }
              // A second press closes it. The panel takes 260px off the
              // preview, and a tool you can open and not shut is a tool that
              // makes the thing you are editing permanently smaller.
              onClick={() => item.tool && onToolChange(open ? null : item.tool)}
              className={cn(
                "flex w-full flex-col items-center gap-1 rounded-md py-2 text-muted-foreground",
                "transition-colors duration-150 ease-out",
                "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                // Not `disabled:opacity-50` like the toolbar segments: at 9px
                // the label goes from quiet to unreadable. A dimmer token holds
                // its contrast where opacity does not.
                "disabled:cursor-not-allowed disabled:text-muted-foreground/45",
                !open &&
                  item.tool !== undefined &&
                  "hover:bg-secondary/60 hover:text-foreground",
                open && "bg-secondary text-foreground"
              )}
            >
              <HugeiconsIcon aria-hidden="true" icon={item.icon} size={17} />
              <span className="text-[9px] leading-none">{item.label}</span>
            </button>
          )
        })}
      </nav>

      {tool ? (
        <aside
          aria-label={`${tool} panel`}
          className="w-[260px] shrink-0 border-r border-border/60"
        >
          {panel}
        </aside>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/60 px-4">
          <h1 className="truncate text-sm font-medium text-foreground">
            {title}
          </h1>
          <div className="ml-auto flex items-center gap-2">
            {headerEnd}
            <button
              type="button"
              className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <HugeiconsIcon aria-hidden="true" icon={Share08Icon} size={14} />
              Share
            </button>
            {exportAction}
          </div>
        </header>

        <div className="relative grid min-h-0 flex-1 place-items-center p-5">
          {preview}

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
              {clock}
              <span className="text-muted-foreground">
                {" / "}
                {formatClock(durationUs)}
              </span>
            </span>
            {running ? (
              <span className="text-xs text-muted-foreground">Cutting…</span>
            ) : null}
            {/* Wraps rather than clipping. The toolbar grew a group and the
                zoom stepper went off the right edge on a laptop — silently,
                because overflow on a flex row does not scroll, it just stops
                being there. */}
            <div className="ml-auto flex min-w-0 flex-wrap justify-end gap-y-1">
              {toolbarEnd}
            </div>
          </div>

          <div className="px-4 pb-4">{children}</div>
        </section>
      </div>

      <aside
        aria-label="Studio panel"
        className="w-[340px] shrink-0 border-l border-border/60"
      >
        {chat}
      </aside>
    </div>
  )
}
