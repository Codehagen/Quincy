import {
  ArrowRight01Icon,
  Brain02Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  ConversationIcon,
  Idea01Icon,
  Image01Icon,
  Message01Icon,
  Mic01Icon,
  NewsIcon,
  QuillWrite01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { NODE_LABEL, type Node, type Rhythm } from "@/lib/rhythms"
import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"

/**
 * A rhythm's `from → to`, drawn on every card rather than on a favoured few.
 * Drawn everywhere it stops being decoration and becomes the index: you can
 * scan a column for "what feeds X" without reading a word.
 *
 * Quincy's own surfaces have no logo, so they take an icon from the one set;
 * platforms take their real mark in `currentColor`. A brand mark is an
 * identity, not part of an icon system — see components/channels/platform-mark.
 */

const NODE_ICON: Record<string, IconSvgElement> = {
  // The same glyph components/sources/source-mark.tsx gives it, because the
  // two chips sit on different pages describing the same thing and a source
  // that changes drawing between /sources and /rhythm reads as two sources.
  circleback: ConversationIcon,
  granola: Message01Icon,
  notes: Image01Icon,
  voice: Mic01Icon,
  // Hacker News has a wordmark rather than a symbol, and a two-letter "Y" in a
  // 13px chip reads as noise. It takes an icon from the set for the same
  // reason Quincy's own surfaces do — see components/channels/platform-mark.
  hackernews: NewsIcon,
  drafts: QuillWrite01Icon,
  riffs: Idea01Icon,
  lineup: Calendar03Icon,
  chat: Message01Icon,
  brain: Brain02Icon,
  numbers: ChartLineData01Icon,
}

export function NodeChip({
  node,
  live = false,
  labelled = false,
}: {
  node: Node
  live?: boolean
  /** Set when a visible label sits beside the chip, so it drops its tooltip. */
  labelled?: boolean
}) {
  const icon = NODE_ICON[node]

  return (
    <span
      title={labelled ? undefined : (NODE_LABEL[node] ?? node)}
      className={cn(
        "flex size-6 shrink-0 items-center justify-center rounded-xs",
        "transition-[background-color,color] duration-150 ease-out",
        // `text-signal-on`, not `text-primary-foreground`. The two used to hold
        // the same value, so borrowing one for the other worked by accident.
        // --primary is now near-black in light mode and near-white in dark,
        // while --signal stays brass-400 in both — the borrowed token would put
        // white on brass at 3.73:1 in one mode and pass in the other.
        live
          ? "bg-signal text-signal-on"
          : "bg-muted text-muted-foreground"
      )}
    >
      {hasPlatformMark(node) ? (
        <PlatformMark platform={node} size={12} />
      ) : icon ? (
        <HugeiconsIcon
          aria-hidden="true"
          icon={icon}
          size={13}
          strokeWidth={1.8}
        />
      ) : (
        <span aria-hidden="true" className="text-[10px] font-medium">
          {(NODE_LABEL[node] ?? node).slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}

/** Five fits beside a source group and a switch at the narrowest column. */
const MAX_CHIPS = 5

export function Flow({ rhythm, live }: { rhythm: Rhythm; live: boolean }) {
  const label = [
    rhythm.from.length
      ? `From ${rhythm.from.map((n) => NODE_LABEL[n] ?? n).join(", ")}`
      : null,
    `into ${rhythm.to.map((n) => NODE_LABEL[n] ?? n).join(", ")}`,
  ]
    .filter(Boolean)
    .join(" ")

  return (
    <div className="flex items-center gap-1.5">
      {/* Written out rather than left to the chips, which are all `title` and
          no text. One sentence is the whole rhythm. */}
      <span className="sr-only">{label}</span>

      {rhythm.from.length > 0 ? (
        <>
          <span aria-hidden="true" className="flex items-center gap-1">
            {rhythm.from.map((n) => (
              <NodeChip key={n} node={n} />
            ))}
          </span>
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowRight01Icon}
            size={13}
            className="text-muted-foreground/60 shrink-0"
          />
        </>
      ) : null}

      {/* Capped, not wrapped. Atomize targets seven channels and a wrapping row
          made one card in the grid taller than its neighbours, which broke the
          scan across the row. The sr-only line above still reads all of them. */}
      <span aria-hidden="true" className="flex items-center gap-1">
        {rhythm.to.slice(0, MAX_CHIPS).map((n) => (
          <NodeChip key={n} node={n} live={live} />
        ))}
        {rhythm.to.length > MAX_CHIPS ? (
          <span className="text-caption text-muted-foreground shrink-0 font-mono tabular-nums">
            +{rhythm.to.length - MAX_CHIPS}
          </span>
        ) : null}
      </span>
    </div>
  )
}
