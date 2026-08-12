import {
  ArrowRight01Icon,
  Brain02Icon,
  Calendar03Icon,
  ChartLineData01Icon,
  Image01Icon,
  Message01Icon,
  Mic01Icon,
  QuillWrite01Icon,
  SparklesIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"

import { NODE_LABEL, type Node, type Rhythm, type Trigger } from "./data"

/**
 * Shared by all three variants so the comparison isolates the organising
 * principle rather than the chrome. The flow chip in particular is the thing
 * under test: the competing surface draws `source → target` on four of its
 * twenty-four cards and leaves the rest as a name and a sentence. Drawn on
 * every rhythm it stops being decoration and becomes the index — you can scan
 * a column for "what feeds X" without reading a word.
 */

/** Quincy's own surfaces have no logo, so they get an icon from the one set. */
const NODE_ICON: Record<string, IconSvgElement> = {
  granola: Message01Icon,
  calendar: Calendar03Icon,
  notes: Image01Icon,
  voice: Mic01Icon,
  drafts: QuillWrite01Icon,
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
        // Named properties only.
        "transition-[background-color,color] duration-150 ease-out",
        live ? "bg-signal text-primary-foreground" : "bg-muted text-muted-foreground"
      )}
    >
      {hasPlatformMark(node) ? (
        <PlatformMark platform={node} size={12} />
      ) : icon ? (
        <HugeiconsIcon aria-hidden="true" icon={icon} size={13} strokeWidth={1.8} />
      ) : (
        <span aria-hidden="true" className="text-[10px] font-medium">
          {(NODE_LABEL[node] ?? node).slice(0, 1).toUpperCase()}
        </span>
      )}
    </span>
  )
}

/**
 * `from → to`, drawn for every rhythm. Where there is no source, the arrow is
 * dropped rather than pointed at nothing — an arrow with an empty tail reads
 * as a loading state.
 *
 * The screen-reader line is written out rather than left to the chips, which
 * are all `title` and no text: "Substack and YouTube, into X, LinkedIn,
 * Threads, Instagram and TikTok" is the whole rhythm in one sentence.
 */
/** Five fits beside a source group and a switch at the narrowest column. */
const MAX_CHIPS = 5

export function Flow({ rhythm }: { rhythm: Rhythm }) {
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

      {/* Capped, not wrapped. Atomize targets seven channels and a wrapping
          row pushed its switch onto a second line, which made one card in the
          grid taller than its neighbours and broke the scan across the row.
          The overflow count keeps the header exactly one line tall for every
          rhythm; the full list is still read out by the sr-only line above. */}
      <span aria-hidden="true" className="flex items-center gap-1">
        {rhythm.to.slice(0, MAX_CHIPS).map((n) => (
          <NodeChip key={n} node={n} live={rhythm.enabled} />
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

/**
 * The trigger, which the competing surface never shows. "Daily 08:00" and
 * "when a post doubles your median in an hour" are different promises, and a
 * card that hides which one it is asks you to trust it blind.
 */
export function TriggerLabel({ trigger }: { trigger: Trigger }) {
  return (
    <span className="text-caption text-muted-foreground font-mono whitespace-nowrap tabular-nums">
      {trigger.label}
    </span>
  )
}

/** Ours, not theirs. Worth marking while that is still true. */
export function NovelBadge() {
  return (
    <span className="text-caption text-signal-foreground bg-signal-surface ring-signal-border inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 ring-1">
      <HugeiconsIcon aria-hidden="true" icon={SparklesIcon} size={11} />
      New
    </span>
  )
}
