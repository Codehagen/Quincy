"use client"

import * as React from "react"
import {
  ArrowTurnBackwardIcon,
  Copy01Icon,
  Delete02Icon,
  MagicWand01Icon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type {
  TranscriptLine,
  TranscriptWord,
} from "@/lib/editor/transcript-view"
import type { PlacedChapter } from "@/lib/editor/chapters"
import { kindLabel } from "@/lib/editor/disfluency"
import {
  reviewDefault,
  type CutAway,
  type ReviewItem,
} from "@/lib/editor/transcript-edit"
import { HIT_44 } from "@/components/kit/control-styles"
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
  cutAways = [],
  onRestore,
  review = [],
  onCleanUp,
  chapters = [],
  chapterText = null,
  transcriptMissing = false,
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
  /** The spoken stretches the cut took, shown struck through where they were. */
  cutAways?: CutAway[]
  onRestore?: (cut: CutAway) => void
  /** Stumbles that still play, for a clean-up reviewed before it cuts. */
  review?: ReviewItem[]
  onCleanUp?: (items: ReviewItem[]) => void
  chapters?: PlacedChapter[]
  /** The chapters as "0:00 Intro" lines, to paste into a description. */
  chapterText?: string | null
  /** The recording's transcript did not load, so cut words cannot be shown. */
  transcriptMissing?: boolean
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

  const [reviewing, setReviewing] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  /**
   * The rows in reading order: chapter headings, then cut stretches, then the
   * lines that play, by where each sits on the timeline. A cut sorts before
   * a line that starts at the instant it joins, since that is where it was.
   */
  const rows = React.useMemo(() => {
    type Row =
      | { kind: "chapter"; atUs: number; chapter: PlacedChapter }
      | { kind: "cut"; atUs: number; cut: CutAway }
      | { kind: "line"; atUs: number; line: TranscriptLine }
    const order = { chapter: 0, cut: 1, line: 2 }
    const all: Row[] = [
      ...chapters.map((chapter) => ({
        kind: "chapter" as const,
        atUs: chapter.atUs,
        chapter,
      })),
      ...cutAways.map((cut) => ({ kind: "cut" as const, atUs: cut.atUs, cut })),
      ...lines.map((line) => ({
        kind: "line" as const,
        atUs: line.startUs,
        line,
      })),
    ]
    return all.sort((a, b) => a.atUs - b.atUs || order[a.kind] - order[b.kind])
  }, [chapters, cutAways, lines])

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-kit-hairline px-4">
        <span className="text-kit-small font-kit-strong">Transcript</span>

        {count > 0 ? (
          <>
            <span className="text-kit-small text-kit-ink-muted tabular-nums">
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
          <div className="ml-auto flex items-center gap-1">
            {review.length > 0 && onCleanUp ? (
              <button
                type="button"
                onClick={() => setReviewing((open) => !open)}
                disabled={locked}
                aria-expanded={reviewing}
                className={cn(
                  "relative flex items-center gap-1 rounded px-1.5 py-0.5 text-kit-small",
                  "before:absolute before:-inset-1",
                  "transition-colors duration-150 ease-out hover:bg-kit-row-hover",
                  "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid",
                  "disabled:pointer-events-none disabled:opacity-50",
                  reviewing ? "text-kit-ink" : "text-kit-ink-muted"
                )}
              >
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={MagicWand01Icon}
                  size={13}
                />
                Clean up <span className="tabular-nums">{review.length}</span>
              </button>
            ) : (
              <span className="text-kit-small text-kit-ink-muted">
                Select words to cut
              </span>
            )}
            {chapterText ? (
              <PanelAction
                label={copied ? "Copied" : "Copy chapters"}
                icon={Copy01Icon}
                onClick={() => {
                  void navigator.clipboard?.writeText(chapterText).then(() => {
                    setCopied(true)
                    window.setTimeout(() => setCopied(false), 1500)
                  })
                }}
              />
            ) : null}
          </div>
        ) : null}
      </div>

      {transcriptMissing && lines.length > 0 ? (
        <p className="border-b border-kit-hairline px-4 py-1.5 text-kit-small text-kit-ink-muted">
          Cut words cannot be shown: the recording&apos;s transcript did not
          load.
        </p>
      ) : null}

      {reviewing && review.length > 0 && onCleanUp ? (
        <CleanUpReview
          items={review}
          locked={locked}
          onSeek={onSeek}
          onApply={(items) => {
            onCleanUp(items)
            setReviewing(false)
          }}
          onClose={() => setReviewing(false)}
        />
      ) : null}

      {rows.length === 0 ? (
        <Empty />
      ) : (
        <div
          className="min-h-0 flex-1 overflow-y-auto px-4 py-3"
          // Without this a drag that leaves the words and crosses the gutter
          // selects the panel's own text, and the browser's selection sits on
          // top of ours in a different colour.
          style={{ userSelect: "none" }}
        >
          {rows.map((row) =>
            row.kind === "chapter" ? (
              <h3
                key={`chapter-${row.atUs}`}
                className="pt-3 pb-1 text-kit-small font-kit-strong text-kit-ink"
              >
                {row.chapter.title}
              </h3>
            ) : row.kind === "cut" ? (
              <CutRow
                key={`cut-${row.cut.id}`}
                cut={row.cut}
                onRestore={onRestore}
                locked={locked}
              />
            ) : (
              <div key={row.line.id} className="flex gap-3 py-1">
                <button
                  type="button"
                  onClick={() => onSeek(row.line.startUs)}
                  title="Play from here"
                  className={`relative w-9 shrink-0 pt-0.5 text-left text-kit-mono text-kit-ink-muted tabular-nums hover:text-kit-ink ${HIT_44}`}
                >
                  {formatClock(row.line.startUs)}
                </button>

                <p className="min-w-0 flex-1 text-kit-body">
                  {row.line.words.map((word) => (
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
            )
          )}
        </div>
      )}
    </div>
  )
}

/**
 * A stretch the cut took, where it was: struck through, readable, and one
 * press from coming back. The words are the recording's, so a restore is
 * never a guess at what was said.
 */
function CutRow({
  cut,
  onRestore,
  locked,
}: {
  cut: CutAway
  onRestore?: (cut: CutAway) => void
  locked?: boolean
}) {
  return (
    <div className="group flex items-start gap-3 py-1">
      <span className="w-9 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-kit-body text-kit-ink-muted">
        <span className="line-through decoration-kit-ink-muted/60">
          {cut.text}
        </span>
      </p>
      {onRestore ? (
        <button
          type="button"
          onClick={() => onRestore(cut)}
          disabled={locked}
          title="Put this back"
          className={cn(
            "relative flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-kit-small text-kit-ink-muted",
            "before:absolute before:-inset-1",
            "transition-colors duration-150 ease-out hover:bg-kit-row-hover hover:text-kit-ink",
            "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid",
            "disabled:pointer-events-none disabled:opacity-50"
          )}
        >
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowTurnBackwardIcon}
            size={12}
          />
          Restore
        </button>
      ) : null}
    </div>
  )
}

/**
 * The clean-up, before it cuts. Every stumble is listed with its kind and
 * its words, a press plays it, and the box decides. Filler phrases start
 * unticked: "like", set off by commas, is sometimes what was meant.
 */
function CleanUpReview({
  items,
  locked,
  onSeek,
  onApply,
  onClose,
}: {
  items: ReviewItem[]
  locked?: boolean
  onSeek: (atUs: number) => void
  onApply: (items: ReviewItem[]) => void
  onClose: () => void
}) {
  const [ticked, setTicked] = React.useState<Set<string>>(
    () => new Set(items.filter(reviewDefault).map((item) => item.key))
  )
  const chosen = items.filter((item) => ticked.has(item.key))

  return (
    <div className="max-h-[45%] shrink-0 overflow-y-auto border-b border-kit-hairline px-4 py-2">
      <ul className="flex flex-col">
        {items.map((item) => (
          <li key={item.key} className="flex items-center gap-2 py-0.5">
            <input
              type="checkbox"
              checked={ticked.has(item.key)}
              onChange={(event) =>
                setTicked((prev) => {
                  const next = new Set(prev)
                  if (event.target.checked) next.add(item.key)
                  else next.delete(item.key)
                  return next
                })
              }
              aria-label={`Cut “${item.phrase}”`}
              className="size-3.5 accent-kit-ink"
            />
            <button
              type="button"
              onClick={() => onSeek(item.atUs)}
              title="Play from here"
              className={`relative w-9 shrink-0 text-left text-kit-mono text-kit-ink-muted tabular-nums hover:text-kit-ink ${HIT_44}`}
            >
              {formatClock(item.atUs)}
            </button>
            <span className="min-w-0 flex-1 truncate text-kit-body">
              {item.phrase}
            </span>
            <span className="shrink-0 text-kit-small text-kit-ink-muted">
              {kindLabel(item.kind, 1)}
            </span>
          </li>
        ))}
      </ul>
      <div className="flex items-center justify-end gap-2 pt-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded px-2 py-1 text-kit-small text-kit-ink-muted transition-colors duration-150 ease-out hover:bg-kit-row-hover hover:text-kit-ink"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onApply(chosen)}
          disabled={locked || chosen.length === 0}
          className="rounded bg-kit-control px-2 py-1 text-kit-small font-kit-strong text-kit-ink shadow-kit-control transition-colors duration-150 ease-out hover:bg-kit-row-hover disabled:pointer-events-none disabled:opacity-50"
        >
          Remove {chosen.length}
        </button>
      </div>
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
        selected && "bg-kit-selected",
        // The playhead's own word wins the background, so you can still see
        // where playback is inside a selection you just made.
        live && !selected && "bg-kit-selected text-kit-ink",
        !selected && !live && "hover:bg-kit-row-hover"
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
        "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid",
        "disabled:pointer-events-none disabled:opacity-50",
        destructive
          ? "text-kit-ink-muted hover:bg-kit-danger-tint hover:text-kit-danger"
          : "text-kit-ink-muted hover:bg-kit-row-hover hover:text-kit-ink"
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
      <p className="text-center text-kit-body text-kit-ink-muted">
        No captions on this cut yet.
        <br />
        Ask for them in the chat, and the words show up here.
      </p>
    </div>
  )
}
