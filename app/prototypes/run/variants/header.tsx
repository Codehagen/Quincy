import Link from "next/link"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { Button } from "@/components/ui/button"

import { NodeChip } from "../../rhythm/parts"
import { NODE_LABEL } from "../../rhythm/data"
import { PIECES, RUN } from "../data"

/**
 * Shared header. Identical across the three variants on purpose — the
 * comparison is about how the seventeen pieces are organised below it, and a
 * header that moved between variants would muddy that.
 *
 * The counts are the summary. There is no chart, because three numbers do not
 * need one and a chart here would be the aggregate view this page exists to
 * not be.
 */
export function RunHeader() {
  return (
    <header className="flex flex-col gap-5">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2.5 self-start"
        nativeButton={false}
        render={<Link href="/prototypes/rhythm/atomize" />}
      >
        <HugeiconsIcon
          aria-hidden="true"
          data-icon="inline-start"
          icon={ArrowLeft01Icon}
        />
        {RUN.rhythm}
      </Button>

      <div className="flex flex-col gap-3 px-3">
        <div className="flex flex-wrap items-center gap-2">
          <NodeChip node={RUN.sourceChannel} labelled />
          <span className="text-caption text-muted-foreground font-mono tabular-nums">
            {NODE_LABEL[RUN.sourceChannel]} · {RUN.sourceWords} words ·{" "}
            {RUN.date}
          </span>
        </div>

        <h1 className="text-display text-balance">{RUN.source}</h1>

        {/* The arithmetic that makes the model legible, stated as a sentence
            rather than as three stat tiles. Tiles would be a dashboard, and a
            dashboard is what this page is deliberately not. */}
        {/* The narrative only. The per-state counts live on the filter chips
            below, because a number that appears in two places drifts in one of
            them the first time the data changes. */}
        <p className="text-body-lg text-muted-foreground text-pretty">
          One essay became{" "}
          <span className="text-foreground font-mono tabular-nums">
            {PIECES.length} pieces
          </span>
          , adapted for each channel rather than pasted across them.
        </p>

        {/* Every multiplier on this page is against this number. A ratio with
            an unstated denominator is decoration — it was rendering "+17.8×"
            with nothing on the page saying times what. */}
        <p className="text-caption text-muted-foreground">
          Multipliers below are against your usual first-day reach of{" "}
          <span className="text-foreground font-mono tabular-nums">
            {RUN.median.toLocaleString("en-US")}
          </span>{" "}
          views.
        </p>
      </div>
    </header>
  )
}
