import {
  Calendar03Icon,
  CheckmarkCircle02Icon,
  QuillWrite01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"

import { RUN, STATE_LABEL, type PieceState } from "./data"

/**
 * Shared across the three variants so the comparison is about how the run is
 * organised, not about how a row is drawn.
 */

const STATE_ICON: Record<PieceState, IconSvgElement> = {
  published: CheckmarkCircle02Icon,
  scheduled: Calendar03Icon,
  draft: QuillWrite01Icon,
}

/**
 * Icon and word, never colour alone — three states told apart by tint is
 * invisible to a colourblind reader and nearly invisible to everyone on a
 * sand-on-sand palette.
 */
export function StateChip({
  state,
  className,
}: {
  state: PieceState
  className?: string
}) {
  return (
    <span
      className={cn(
        "text-caption inline-flex items-center gap-1.5 whitespace-nowrap",
        state === "published" ? "text-signal-foreground" : "text-muted-foreground",
        className
      )}
    >
      <HugeiconsIcon
        aria-hidden="true"
        icon={STATE_ICON[state]}
        size={13}
        strokeWidth={1.8}
      />
      {STATE_LABEL[state]}
    </span>
  )
}

function format(n: number) {
  return n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n)
}

/**
 * A number on its own says nothing. Every view count is shown against your own
 * median, because that is the comparison that decides whether a hook worked —
 * and in an interest-based feed it is the only comparison that survives, since
 * follower count no longer predicts reach.
 *
 * Right-aligned tabular figures: the alignment is what a data column needs,
 * and it is the thing zebra striping is usually compensating for.
 */
export function Views({ views }: { views?: number }) {
  if (views === undefined) {
    // Reserved, not collapsed — a missing number must not pull the column in.
    return (
      <span className="text-caption text-muted-foreground/60 w-20 shrink-0 text-right font-mono tabular-nums">
        —
      </span>
    )
  }

  const ratio = views / RUN.median

  return (
    <span className="flex w-20 shrink-0 flex-col items-end gap-0.5">
      <span className="text-caption font-mono tabular-nums">
        {format(views)}
      </span>
      <span
        className={cn(
          "text-caption font-mono tabular-nums",
          ratio >= 1 ? "text-signal-foreground" : "text-muted-foreground"
        )}
      >
        {ratio >= 1 ? "+" : ""}
        {ratio.toFixed(1)}×
      </span>
    </span>
  )
}
