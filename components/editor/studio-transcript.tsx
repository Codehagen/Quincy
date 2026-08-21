"use client"

import * as React from "react"
import { Delete02Icon, ZoomInAreaIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type {
  TranscriptLine,
  TranscriptWord,
} from "@/lib/editor/transcript-view"
import { cn } from "@/lib/utils"

import { formatClock } from "./studio-parts"

/**
 * The cut, read as a document.
 *
 * A second way to point at the same edit, next to the chat rather than instead
 * of it. Asking for "cut the bit where I say every day this year" is a sentence
 * the agent has to resolve back to a range; selecting those words is the range.
 * Both land as the same ops, which is the rule the whole editor is built on.
 *
 * Nothing here holds the selection. It lives in `Studio`, because Delete has to
 * mean one thing across the clip, the effect chip and the words — three
 * components each answering the Delete key for themselves is how you get a
 * keypress that deletes two things.
 */

export type TranscriptSelection = { anchorId: string; focusId: string }

export function StudioTranscript({
  lines,
  selectedIds,
  liveWordId,
  onSelect,
  onSeek,
  onDelete,
  onZoom,
  locked,
}: {
  lines: TranscriptLine[]
  /** Which words the selection currently covers. Derived by Studio, not here. */
  selectedIds: Set<string>
  /** The word under the playhead, or null. An id rather than the playhead
      itself: the playhead moves per frame, the live word a few times a
      second, and this component only needs to render at the second rate. */
  liveWordId: string | null
  onSelect: (selection: TranscriptSelection | null) => void
  onSeek: (atUs: number) => void
  onDelete: () => void
  onZoom: () => void
  /** True while an agent run holds the document. */
  locked?: boolean
}) {
  /**
   * Which word the drag started on, in a ref rather than in state.
   *
   * A pointermove handler reading its own anchor back out of React state would
   * read the value from the render that installed it — the same argument the
   * drag-to-zoom gesture on the lane makes, and the same bug if ignored.
   */
  const anchorRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    const stop = () => {
      anchorRef.current = null
    }

    window.addEventListener("pointerup", stop)
    window.addEventListener("pointercancel", stop)
    return () => {
      window.removeEventListener("pointerup", stop)
      window.removeEventListener("pointercancel", stop)
    }
  }, [])

  const count = selectedIds.size

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 px-4">
        <span className="text-xs font-medium">Transcript</span>

        {count > 0 ? (
          <>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {count} {count === 1 ? "word" : "words"}
            </span>

            {/* Zoom before Delete, and a gap between them. They sit 2px apart in
                a 12px-tall row and one of them is destructive. */}
            <div className="ml-auto flex items-center gap-1">
              <PanelAction
                label="Punch in on this"
                icon={ZoomInAreaIcon}
                onClick={onZoom}
                disabled={locked}
              />
              <PanelAction
                label="Delete these words"
                icon={Delete02Icon}
                onClick={onDelete}
                disabled={locked}
                destructive
              />
            </div>
          </>
        ) : lines.length > 0 ? (
          // Only when there is something to select. On an empty transcript this
          // sat directly above "no captions on this cut yet" and told you to do
          // the one thing the panel had just said you could not.
          <span className="ml-auto text-[11px] text-muted-foreground">
            Select words to cut
          </span>
        ) : null}
      </div>

      {lines.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          // Without this a drag that leaves the words and crosses the gutter
          // selects the panel's own text, and the browser's selection sits on
          // top of ours in a different colour.
          style={{ userSelect: "none" }}
        >
          {lines.map((line) => (
            <div key={line.id} className="flex gap-3 py-1">
              <button
                type="button"
                onClick={() => onSeek(line.startUs)}
                title="Play from here"
                className="w-9 shrink-0 pt-0.5 text-left text-[10px] text-muted-foreground tabular-nums hover:text-foreground"
              >
                {formatClock(line.startUs)}
              </button>

              <p className="min-w-0 flex-1 text-[13px] leading-6">
                {line.words.map((word) => (
                  <Word
                    key={word.id}
                    word={word}
                    selected={selectedIds.has(word.id)}
                    live={word.id === liveWordId}
                    anchorRef={anchorRef}
                    onSelect={onSelect}
                    onSeek={onSeek}
                  />
                ))}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * One word.
 *
 * A span and not a button. The row is a paragraph of running text and every
 * word in it being a button means tabbing through a minute of speech is three
 * hundred stops — so the words are reachable by pointer, and the timecode at the
 * head of each line is the keyboard's way in.
 */
function Word({
  word,
  selected,
  live,
  anchorRef,
  onSelect,
  onSeek,
}: {
  word: TranscriptWord
  selected: boolean
  live: boolean
  anchorRef: React.RefObject<string | null>
  onSelect: (selection: TranscriptSelection | null) => void
  onSeek: (atUs: number) => void
}) {
  return (
    <span
      data-word={word.id}
      onPointerDown={(event) => {
        // Left button only: a right-click on a word should open the browser's
        // menu, not silently move the playhead somewhere else first.
        if (event.button !== 0) return
        event.preventDefault()

        anchorRef.current = word.id
        onSelect({ anchorId: word.id, focusId: word.id })
        // Clicking a word is "show me this", which is why it seeks as well as
        // selects. It is the user's own gesture, so it does not run into the
        // rule that the playhead belongs to them.
        onSeek(word.startUs)
      }}
      onPointerEnter={() => {
        if (!anchorRef.current) return
        onSelect({ anchorId: anchorRef.current, focusId: word.id })
      }}
      className={cn(
        "cursor-text rounded-[3px] px-0.5 transition-colors duration-75",
        selected && "bg-foreground/15",
        // The playhead's own word wins the background, so you can still see
        // where playback is inside a selection you just made.
        live && !selected && "bg-effect-surface text-effect-foreground",
        !selected && !live && "hover:bg-foreground/8"
      )}
    >
      {word.text}{" "}
    </span>
  )
}

function PanelAction({
  label,
  icon,
  onClick,
  disabled,
  destructive,
}: {
  label: string
  icon: Parameters<typeof HugeiconsIcon>[0]["icon"]
  onClick: () => void
  disabled?: boolean
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "relative flex size-6 items-center justify-center rounded",
        // Grows the target to 32px without growing the row, the way the
        // toolbar's segments do.
        "before:absolute before:-inset-1",
        "transition-colors duration-150 ease-out",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-muted-foreground hover:bg-danger-500/10 hover:text-danger-500"
          : "text-muted-foreground hover:bg-secondary hover:text-foreground"
      )}
    >
      <HugeiconsIcon aria-hidden="true" icon={icon} size={14} />
    </button>
  )
}

/**
 * Says which of the two reasons there is nothing to read.
 *
 * A cut with no captions and a cut with no footage are different problems and
 * only one of them is fixed by asking for captions, so an empty panel that says
 * "no transcript" would send half the people who see it to the wrong place.
 */
function Empty() {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center px-8">
      <p className="text-center text-[13px] leading-6 text-muted-foreground">
        No captions on this cut yet.
        <br />
        Ask for them in the chat, and the words show up here.
      </p>
    </div>
  )
}
