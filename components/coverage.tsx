import { cn } from "@/lib/utils"

/**
 * The question this page exists to answer is "do I have enough queued?".
 * Stanley makes you count a grid to work that out. Stating it costs one row
 * and removes the counting entirely — the grid becomes detail, not arithmetic.
 *
 * A data component, so props are values rather than composition. There is no
 * structure here for a consumer to rearrange.
 */

type CoverageProps = {
  drafts: number
  openings: number
  coveredThrough?: string
  className?: string
}

export function Coverage({ drafts, openings, coveredThrough, className }: CoverageProps) {
  const short = drafts < openings

  return (
    <div
      className={cn(
        "flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-md px-3 py-3",
        short ? "bg-signal-surface/60" : "bg-muted/50",
        className
      )}
    >
      <Metric value={drafts} label={drafts === 1 ? "draft ready" : "drafts ready"} />
      <Metric value={openings} label="openings this week" />
      {coveredThrough ? (
        <p className="text-caption text-muted-foreground">
          Covered through <span className="font-medium text-foreground">{coveredThrough}</span>
        </p>
      ) : null}
      {short ? (
        <p className="text-caption text-signal-foreground">
          {openings - drafts} openings without a draft
        </p>
      ) : null}
    </div>
  )
}

function Metric({ value, label }: { value: number; label: string }) {
  return (
    <p className="flex items-baseline gap-1.5">
      {/* Tabular figures so the number does not shove its label sideways
          when it ticks from 9 to 10. */}
      <span className="text-section tabular-nums">{value}</span>
      <span className="text-caption text-muted-foreground">{label}</span>
    </p>
  )
}
