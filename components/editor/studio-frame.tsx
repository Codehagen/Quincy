"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft01Icon,
  Chat01Icon,
  Image01Icon,
  Layers01Icon,
  MusicNote01Icon,
  Settings01Icon,
  Share08Icon,
  SidebarRightIcon,
  SparklesIcon,
  TextAlignLeftIcon,
  TextFontIcon,
  Video01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { ButtonLink, EmptyRegion, EmptyState } from "@/components/kit"
import { FOCUS_RING, HIT_44 } from "@/components/kit/control-styles"
import { cn } from "@/lib/utils"

import { DeskIconButton } from "./desk-controls"
import { formatClock } from "./studio-parts"

/**
 * The desk (plans/036, phase E): the editor's objects float on a grey
 * recess, 8px apart, each lifted by its elevation rather than drawn with a
 * border. The top bar and the rail sit on the ground and frame the recess;
 * inside it, the library, the preview, a small rail for the side panel, the
 * timeline and the chat. One ink fill on the whole screen: Export.
 */

/**
 * The rail. Media and Effects open a panel; the rest are not built yet and
 * say so by being disabled, which reads as "later" where a dead button reads
 * as broken. The rail runs from what you bring in to what you do to it.
 */
const RAIL: { icon: IconSvgElement; label: string; tool?: StudioTool }[] = [
  { icon: Video01Icon, label: "Media", tool: "media" },
  { icon: Image01Icon, label: "Images", tool: "images" },
  { icon: MusicNote01Icon, label: "Sounds", tool: "sounds" },
  { icon: SparklesIcon, label: "Effects", tool: "effects" },
  { icon: TextFontIcon, label: "Text", tool: "text" },
  { icon: Layers01Icon, label: "Transitions", tool: "transitions" },
  { icon: Settings01Icon, label: "Settings", tool: "settings" },
]

export type StudioTool =
  | "media"
  | "images"
  | "sounds"
  | "effects"
  | "text"
  | "transitions"
  | "settings"
export type SideView = "chat" | "transcript"

/** Where the media panel opens by default: from `xl` (1280) up. Narrower, it
    takes the preview's room, so it starts closed. */
const WIDE_DESK = "(min-width: 80rem)"

function subscribeWide(onChange: () => void) {
  const mql = window.matchMedia(WIDE_DESK)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

/**
 * Whether the desk is wide enough for the media panel to start open. Null on
 * the server and during hydration: there the frame decides in CSS
 * (`libraryAuto`), so the first paint is already right and nothing flashes.
 */
export function useWideDesk(): boolean | null {
  return React.useSyncExternalStore(
    subscribeWide,
    () => window.matchMedia(WIDE_DESK).matches,
    () => null
  )
}

/** An object on the recess: white, its elevation, the object radius. */
const OBJECT = "rounded-kit-object bg-kit-object shadow-kit-object"

export function StudioFrame({
  name,
  topCenter,
  headerEnd,
  exportAction,
  tool,
  libraryAuto = false,
  onToolChange,
  panel,
  preview,
  hoverUs,
  side,
  onSideChange,
  chat,
  transcript,
  transport,
  running,
  toolbar,
  toolbarEnd,
  children,
  deskRef,
  overlay,
}: {
  /** The project's name: a node, so the frame does not own renaming. */
  name: React.ReactNode
  /** The frame menu and undo/redo, centred in the top bar. */
  topCenter?: React.ReactNode
  /** Save state and the like, before Share and Export. */
  headerEnd?: React.ReactNode
  /** The Export button, which owns its own progress and refusals. */
  exportAction?: React.ReactNode
  /** Which rail tool's panel is open, or null for none. */
  tool: StudioTool | null
  /** Nobody has chosen yet and the width is not known (server, hydration):
      the panel is open from `xl` up, closed below, in CSS. */
  libraryAuto?: boolean
  onToolChange: (tool: StudioTool | null) => void
  /** What that tool shows, in the library card beside the rail. */
  panel: React.ReactNode
  preview: React.ReactNode
  /** Set while the pointer is over the lane. Drives the preview, not the head. */
  hoverUs?: number | null
  /** The right panel, or null when hidden. */
  side: SideView | null
  onSideChange: (side: SideView | null) => void
  chat: React.ReactNode
  transcript: React.ReactNode
  /** Play and the clock, at the head of the timeline's toolbar. */
  transport: React.ReactNode
  running: boolean
  /** The timeline's tools: the cuts menu, split, delete, the zoom effect. */
  toolbar?: React.ReactNode
  /** The timeline zoom, at the toolbar's right end. */
  toolbarEnd?: React.ReactNode
  /** The lanes. */
  children: React.ReactNode
  /** The desk Quincy's cursor travels over; the positioning parent. */
  deskRef?: React.Ref<HTMLDivElement>
  overlay?: React.ReactNode
}) {
  const scrubbing = hoverUs !== null && hoverUs !== undefined
  const libraryOpen = tool !== null

  return (
    <>
      {/* Below lg there is no room for the desk: the toolbar, the preview
          and the chat cannot all fit. Said plainly instead, and switched in
          CSS so server and client markup agree. */}
      <div className="flex h-full min-h-0 flex-col lg:hidden">
        <EmptyRegion>
          <EmptyState
            bold="Cuts needs a wider screen."
            rest="Open this project on a laptop or tablet to edit it."
          >
            <ButtonLink href="/studio" icon={ArrowLeft01Icon}>
              Back to Studio
            </ButtonLink>
          </EmptyState>
        </EmptyRegion>
      </div>

      <div
        ref={deskRef}
        className="agent-desk relative hidden h-full min-h-0 flex-col lg:flex"
      >
        <header className="grid h-13 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 pr-3 pl-2">
          <div className="flex min-w-0 items-center gap-1">
            {/* Cuts is full screen with no app sidebar; this is the way out. */}
            <Link
              href="/studio"
              aria-label="Back to Studio"
              title="Back to Studio"
              className={cn(
                "relative grid size-8 shrink-0 place-items-center rounded-kit-control text-kit-ink-muted",
                "transition-colors duration-150 ease-out hover:bg-kit-row-hover hover:text-kit-ink",
                FOCUS_RING,
                HIT_44
              )}
            >
              <HugeiconsIcon aria-hidden="true" icon={ArrowLeft01Icon} size={17} />
            </Link>
            <Link
              href="/cuts?all=1"
              className={cn(
                "relative flex h-8 shrink-0 items-center rounded-kit-control px-2 text-kit-small text-kit-ink-muted",
                "transition-colors duration-150 ease-out hover:bg-kit-row-hover hover:text-kit-ink",
                FOCUS_RING,
                HIT_44
              )}
            >
              All cuts
            </Link>
            <span aria-hidden="true" className="text-kit-small text-kit-ink-disabled">/</span>
            <h1 className="min-w-0">{name}</h1>
          </div>

          <div className="flex items-center gap-2">{topCenter}</div>

          <div className="flex min-w-0 items-center justify-end gap-2">
            {headerEnd}
            {/* Sharing a cut is not built yet (plans/031): disabled, not dead. */}
            <button
              type="button"
              disabled
              title="Sharing a cut is not built yet"
              className={cn(
                "relative flex h-8 items-center gap-1.5 rounded-kit-control px-2.5 text-kit-small text-kit-ink-disabled",
                HIT_44
              )}
            >
              <HugeiconsIcon aria-hidden="true" icon={Share08Icon} size={14} />
              Share
            </button>
            {exportAction}
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <nav aria-label="Editor tools" className="flex w-18 shrink-0 flex-col items-center gap-1 px-1.5 pt-1">
            {RAIL.map((item) => {
              const open = item.tool !== undefined && item.tool === tool
              return (
                <button
                  key={item.label}
                  type="button"
                  disabled={item.tool === undefined}
                  aria-pressed={item.tool === undefined ? undefined : open}
                  aria-controls={item.tool ? "desk-library" : undefined}
                  title={item.tool === undefined ? `${item.label}, not built yet` : undefined}
                  // A second press closes it: a panel you cannot shut makes
                  // the thing you are editing permanently smaller.
                  onClick={() => item.tool && onToolChange(open ? null : item.tool)}
                  className={cn(
                    "flex w-full flex-col items-center gap-1 rounded-kit-control py-2 text-kit-ink-muted",
                    "transition-[background-color,color] duration-150 ease-out",
                    FOCUS_RING,
                    // A dimmer token, not opacity: at this size opacity takes
                    // the label from quiet to unreadable.
                    "disabled:cursor-not-allowed disabled:text-kit-ink-disabled",
                    !open && item.tool !== undefined && "hover:bg-kit-row-hover hover:text-kit-ink",
                    open && "bg-kit-selected text-kit-ink"
                  )}
                >
                  <HugeiconsIcon aria-hidden="true" icon={item.icon} size={18} />
                  <span className="text-kit-meta leading-none">{item.label}</span>
                </button>
              )
            })}
          </nav>

          {/* The recess, inset into the ground at its top-left corner. */}
          <div className="flex min-w-0 flex-1 gap-2 rounded-tl-kit-stage bg-kit-stage p-2">
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex min-h-0 flex-1">
                {/* The column snaps (the gap rides inside it, so it closes
                    with it); only the panel's content moves, in from 8px to
                    the left on translate and opacity. Animating the column
                    would re-lay out the preview and the timeline every frame. */}
                <div
                  className={cn(
                    "grid shrink-0",
                    libraryAuto
                      ? "grid-cols-[0px] xl:grid-cols-[268px]"
                      : libraryOpen
                        ? "grid-cols-[268px]"
                        : "grid-cols-[0px]"
                  )}
                >
                  <div
                    className={cn(
                      "min-w-0 overflow-hidden transition-[translate,opacity] duration-200 ease-out motion-reduce:transition-none",
                      !libraryOpen && "-translate-x-2 opacity-0"
                    )}
                    inert={!libraryOpen}
                  >
                    <aside
                      id="desk-library"
                      aria-label={tool === "effects" ? "Effects" : "Media"}
                      className={cn(OBJECT, "mr-2 h-full w-[260px] overflow-hidden")}
                    >
                      {panel}
                    </aside>
                  </div>
                </div>

                <div className="relative grid min-w-0 flex-1 place-items-center p-3">
                  {preview}
                  {/* Without it the preview changing under the pointer reads
                      as a glitch: this frame is somewhere the playhead is not. */}
                  {scrubbing ? (
                    <span className="pointer-events-none absolute top-3 right-3 rounded-full bg-kit-object px-2 py-1 text-kit-small text-kit-ink-muted tabular-nums shadow-kit-control">
                      Scrubbing {formatClock(hoverUs!)}
                    </span>
                  ) : null}
                </div>

                <div
                  role="group"
                  aria-label="Side panel"
                  className={cn(OBJECT, "ml-2 flex flex-col gap-1 self-start p-1.5")}
                >
                  <DeskIconButton icon={Chat01Icon} label="Chat" side="left" pressed={side === "chat"} onClick={() => onSideChange("chat")} />
                  <DeskIconButton
                    icon={TextAlignLeftIcon}
                    label="Transcript"
                    side="left"
                    pressed={side === "transcript"}
                    onClick={() => onSideChange("transcript")}
                  />
                  <DeskIconButton
                    icon={SidebarRightIcon}
                    label={side ? "Hide panel" : "Show panel"}
                    side="left"
                    onClick={() => onSideChange(side ? null : "chat")}
                  />
                </div>
              </div>

              {/* A size container: the zoom drops its slider when the
                  timeline is narrow (desk-controls.tsx). */}
              <section aria-label="Timeline" className={cn(OBJECT, "@container shrink-0")}>
                {/* The groups never shrink under their content (they would
                    overlap); when the row is too narrow, the tools wrap to a
                    second row, still right-aligned. */}
                <div className="flex min-h-12 flex-wrap items-center gap-x-2 gap-y-1 px-3 py-0.5">
                  {transport}
                  {/* Why the lanes do not answer: in over 120ms when a run
                      starts, out with its fold. Always mounted so it can fade. */}
                  {/* Basis 0: it fills what the row has left and truncates,
                      so a hidden line never pushes the tools to a second row. */}
                  <span
                    className="agent-held min-w-0 flex-1 basis-0 truncate text-kit-small text-kit-ink-muted"
                    data-on={running || undefined}
                    aria-hidden={!running}
                  >
                    Read-only while Quincy cuts
                  </span>
                  <div className="ml-auto flex flex-none items-center gap-2">
                    <div className="flex flex-none items-center gap-1">{toolbar}</div>
                    {toolbarEnd ? (
                      <div className="flex flex-none items-center border-l border-kit-hairline pl-2">{toolbarEnd}</div>
                    ) : null}
                  </div>
                </div>
                <div className="px-3 pb-3">{children}</div>
              </section>
            </div>

            {/* Hidden, not unmounted: the chat carries a live run, and
                unmounting it would drop the stream mid-cut. */}
            <aside
              aria-label="Side panel content"
              className={cn(OBJECT, "w-[340px] shrink-0 overflow-hidden", side === null && "hidden")}
            >
              {/* Its own key scope: Space and S belong to the thread here,
                  not the timeline (editor-keys.ts). */}
              <div data-chat-keys="" className={cn("h-full", side !== "chat" && "hidden")}>{chat}</div>
              <div className={cn("h-full", side !== "transcript" && "hidden")}>{transcript}</div>
            </aside>
          </div>
        </div>
        {overlay}
      </div>
    </>
  )
}
