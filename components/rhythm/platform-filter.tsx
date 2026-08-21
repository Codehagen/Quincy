"use client"

import { parseAsStringLiteral, useQueryState } from "nuqs"

import { cn } from "@/lib/utils"
import { FILTERABLE_NODES, NODE_LABEL } from "@/lib/rhythms"

import { NodeChip } from "./node-chip"

/**
 * Platform as a filter, which is the other half of the taxonomy argument. The
 * page refuses to *organise* by platform, so it owes you a way to ask the
 * question anyway — "what feeds LinkedIn" is reasonable to want, it is just not
 * a reasonable way to file two dozen things.
 *
 * A rhythm matches if the platform is on either end. Filtering only by target
 * would hide Comment Mining from LinkedIn, which reads LinkedIn every morning.
 *
 * The URL is the state, so a filtered view is linkable and survives reload —
 * the same reason lib/rhythm-search-params.ts keeps `q` and `status` there.
 */
export const platformParser = parseAsStringLiteral(FILTERABLE_NODES).withOptions(
  { clearOnDefault: true }
)

export function PlatformFilter({
  showing,
  total,
}: {
  showing: number
  total: number
}) {
  const [platform, setPlatform] = useQueryState("platform", platformParser)

  return (
    <div className="flex flex-wrap items-center gap-2 px-3">
      {FILTERABLE_NODES.map((node) => {
        const on = platform === node

        return (
          <button
            key={node}
            type="button"
            // Single-select: clicking the active chip clears it, so the filter
            // never becomes a state you cannot leave without hunting for a
            // reset control.
            onClick={() => setPlatform(on ? null : node)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5",
              "text-caption transition-[background-color,box-shadow,color] duration-150 ease-out",
              "focus-visible:ring-ring/50 outline-none focus-visible:ring-2",
              // 26px chip, 44px hit area, vertical only — the chips sit 8px
              // apart, so growing the width would overlap the next one.
              "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
              on
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground hover:text-foreground shadow-2xs"
            )}
          >
            <NodeChip node={node} labelled />
            {NODE_LABEL[node]}
          </button>
        )
      })}

      {/* Live region: the count is the only feedback a chip gives when the
          filtered sections are below the fold. */}
      <p
        aria-live="polite"
        className="text-caption text-muted-foreground ml-auto font-mono tabular-nums"
      >
        {showing === total ? `${total} rhythms` : `${showing} of ${total}`}
      </p>
    </div>
  )
}
