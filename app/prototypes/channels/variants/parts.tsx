import { cn } from "@/lib/utils"

import { PlatformMark } from "@/components/channels/platform-mark"

/**
 * Shared by the harness. Kept generic rather than folded into Roster so a
 * second variant can reuse the tile and the comparison stays about layout.
 *
 * The colour decision is the one the whole exploration hangs on: brass is
 * reserved for live, exactly as `rhythm-card.tsx` uses it. A connected channel
 * that is publishing *is* the live state — so it earns the same treatment, and
 * nothing else on the page does.
 */

export function PlatformTile({
  platform,
  live,
  size = "md",
  className,
}: {
  platform: string
  live: boolean | null
  size?: "sm" | "md" | "lg"
  className?: string
}) {
  const box = size === "lg" ? "size-11" : size === "sm" ? "size-7" : "size-9"
  // A filled brand mark reads optically larger than a 1.8-stroke outline icon
  // at the same box, so it is set a step smaller to sit at the same weight.
  const glyph = size === "lg" ? 19 : size === "sm" ? 13 : 16

  return (
    <div
      data-live={live || undefined}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-xs",
        // Named properties. The all-shorthand would drag width and height into
        // the transition and force a layout recalculation on hover.
        "transition-[background-color,color] duration-150 ease-out",
        box,
        live === true && "bg-signal text-primary-foreground",
        live === false && "bg-muted text-muted-foreground",
        live === null && "bg-muted/70 text-muted-foreground",
        className
      )}
    >
      <PlatformMark platform={platform} size={glyph} />
    </div>
  )
}

/**
 * State needs more than colour. The dot is the glance-level signal, the word
 * beside it is what a colourblind reader actually gets — never one without
 * the other.
 */
export function LiveLabel({ live }: { live: boolean }) {
  return (
    <p
      className={cn(
        "text-caption inline-flex items-center gap-1.5 font-mono tabular-nums",
        // Same 150ms ease-out as PlatformTile. The tile, the dot and this word
        // are one indicator split across three elements — give them different
        // timing and pausing a channel reads as the page glitching rather than
        // as one thing changing state.
        "transition-[color] duration-150 ease-out",
        live ? "text-signal-foreground" : "text-muted-foreground"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-1.5 rounded-full",
          "transition-[background-color] duration-150 ease-out",
          live ? "bg-signal" : "bg-muted-foreground/40"
        )}
      />
      {live ? "Live" : "Paused"}
    </p>
  )
}
