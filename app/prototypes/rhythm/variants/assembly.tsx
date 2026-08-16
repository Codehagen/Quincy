"use client"

import * as React from "react"
import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { Cancel01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Card, CardAction, CardContent, CardHeader } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"

import {
  FAMILY_LABEL,
  FAMILY_NOTE,
  FAMILY_ORDER,
  NODE_LABEL,
  RHYTHMS,
  type Rhythm,
} from "../data"
import { Flow, NodeChip, NovelBadge, TriggerLabel } from "../parts"

/**
 * Platform as a filter, which is the other half of the taxonomy argument. The
 * page refuses to *organise* by platform, so it owes you a way to ask the
 * question anyway — "what feeds LinkedIn" is a reasonable thing to want, it is
 * just not a reasonable way to file twenty-five things.
 *
 * A rhythm matches if the platform is on either end. Filtering only by target
 * would hide Comment Mining from LinkedIn, which reads LinkedIn every morning.
 *
 * In the URL, so a filtered view is linkable and survives reload — the same
 * reason `lib/rhythm-search-params.ts` already puts `q` and `status` there.
 * When this ships, the parser belongs in that file beside them, not here.
 */
const FILTERABLE = [
  "x",
  "linkedin",
  "threads",
  "instagram",
  "tiktok",
  "youtube",
  "substack",
] as const

const platformParser = parseAsStringLiteral(FILTERABLE).withOptions({
  clearOnDefault: true,
})

/**
 * Assembly — grouped by what the rhythm does, never by platform.
 *
 * "GitHub to X" and "Substack to X" are one rhythm with a different source.
 * Filing them under X hides that, and it is how a competing surface ends up
 * with fourteen entries under one platform and one under another: a roadmap
 * rendered as an information architecture. Platform lives in the flow chips on
 * every card instead, so it stays scannable without becoming the taxonomy.
 *
 * Each card answers three questions in the order a person asks them: what is
 * it called, what does it do for me, and how does it actually work. The third
 * was missing — a name and four 24px glyphs asks the reader to infer a
 * mechanism, and most will not bother.
 */
export function Assembly() {
  const [platform, setPlatform] = useQueryState("platform", platformParser)

  const visible = platform
    ? RHYTHMS.filter(
        (r) => r.from.includes(platform) || r.to.includes(platform)
      )
    : RHYTHMS

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-12 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Rhythm</PageHeaderTitle>
          <PageHeaderDescription>
            What Quincy does on its own. Every rhythm says when it runs, what it
            reads, and what it leaves behind.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline">New rhythm</Button>
        </PageHeaderActions>
      </PageHeader>

      <PlatformFilter
        active={platform}
        onChange={setPlatform}
        showing={visible.length}
        total={RHYTHMS.length}
      />

      {visible.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyTitle>
              Nothing feeds {platform ? NODE_LABEL[platform] : "that"} yet
            </EmptyTitle>
            <EmptyDescription>
              No rhythm reads from or writes to it. Clear the filter to see
              everything Quincy can do.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button variant="outline" onClick={() => setPlatform(null)}>
              Clear filter
            </Button>
          </EmptyContent>
        </Empty>
      ) : null}

      {FAMILY_ORDER.map((family) => {
        const rhythms = visible.filter((r) => r.family === family)
        if (rhythms.length === 0) return null

        return (
          <section key={family} className="flex flex-col gap-5">
            <div className="flex max-w-2xl flex-col gap-1.5 px-3">
              <h2 className="text-section">{FAMILY_LABEL[family]}</h2>
              {/* The principle, not a feature list. Capped at a comfortable
                  measure rather than running the full width of a three-column
                  page — 65ch is the ceiling and this sits under it. */}
              <p className="text-body text-pretty text-muted-foreground">
                {FAMILY_NOTE[family]}
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {rhythms.map((rhythm) => (
                <RhythmCard key={rhythm.id} rhythm={rhythm} />
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}

function RhythmCard({ rhythm }: { rhythm: Rhythm }) {
  const [on, setOn] = React.useState(rhythm.enabled)

  return (
    <Card
      data-live={on || undefined}
      className={cn(
        "group/rhythm relative h-full shadow-xs ring-0",
        // Named properties, never the shorthand.
        "transition-[box-shadow,background-color] duration-150 ease-out",
        // Hover confirms an affordance that is real: the whole card opens the
        // rhythm, through the overlay on the title link below. Without that
        // link this elevation would be a lie about what a click does.
        "hover:shadow-md",
        // The ring goes on the card, not on the link inside it. The click
        // target is the whole card, so a focus indicator around a short word
        // told a keyboard user something different than it told a mouse.
        "has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50",
        "data-live:bg-signal-surface"
      )}
    >
      <CardHeader>
        <Flow rhythm={{ ...rhythm, enabled: on }} />
        {/* Raised above the title’s overlay so the switch stays clickable and a
            click on it never navigates. */}
        <CardAction className="relative z-10">
          <Switch
            checked={on}
            onCheckedChange={setOn}
            aria-label={`${rhythm.name} — ${on ? "on" : "off"}`}
          />
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {/*
           * The link carries a full-card overlay rather than the card being
           * wrapped in an anchor. Wrapping makes a screen reader announce the
           * whole card as one link; this way the accessible name is just the
           * rhythm’s name, the switch still works, and the click target is the
           * whole card. The cost is that text in the card stops being
           * selectable — acceptable for a label and two sentences.
           */}
          <p className="text-card-title">
            <Link
              href={`/prototypes/rhythm/${rhythm.id}`}
              className={cn(
                "after:absolute after:inset-0 after:rounded-xl",
                // Hover pairs the card’s elevation with an underline on the
                // thing that is actually the link, and the anchor brings the
                // cursor change with it. Elevation alone says "something here
                // is clickable" without saying what.
                "underline-offset-4 group-hover/rhythm:underline",
                // No ring of its own — the card wears it, see above.
                "outline-none"
              )}
            >
              {rhythm.name}
            </Link>
          </p>
          {rhythm.novel ? <NovelBadge /> : null}
        </div>

        {/* Promise at full foreground, mechanism muted under it. Two weights of
            the same size rather than two sizes — the card is already dense and
            a third type step would make it noisy. */}
        <p className="text-caption text-pretty text-foreground">
          {rhythm.promise}
        </p>
        <p className="text-caption text-pretty text-muted-foreground">
          {rhythm.how}
        </p>
      </CardContent>

      <CardContent className="mt-auto flex items-center justify-between gap-3">
        <TriggerLabel trigger={rhythm.trigger} />
        {rhythm.yield ? (
          <span className="font-mono text-caption text-muted-foreground tabular-nums">
            {rhythm.yield} pieces
          </span>
        ) : rhythm.lastRun && on ? (
          <span className="font-mono text-caption text-muted-foreground tabular-nums">
            {rhythm.lastRun}
          </span>
        ) : null}
      </CardContent>
    </Card>
  )
}

function PlatformFilter({
  active,
  onChange,
  showing,
  total,
}: {
  active: (typeof FILTERABLE)[number] | null
  onChange: (next: (typeof FILTERABLE)[number] | null) => void
  showing: number
  total: number
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 px-3">
      {FILTERABLE.map((node) => {
        const on = active === node

        return (
          <button
            key={node}
            type="button"
            // Single-select: clicking the active chip clears it, so the filter
            // never becomes a state you cannot get out of without hunting for
            // a reset control.
            onClick={() => onChange(on ? null : node)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-1.5 rounded-full py-1 pr-3 pl-1.5",
              "text-caption transition-[background-color,box-shadow,color] duration-150 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              // 24px chip, 44px hit area, vertical only — the chips sit in a
              // row 8px apart, so growing the width would overlap the next one.
              "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
              on
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground shadow-2xs hover:text-foreground"
            )}
          >
            <NodeChip node={node} labelled />
            {NODE_LABEL[node]}
          </button>
        )
      })}

      {active ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className={cn(
            "text-caption text-muted-foreground hover:text-foreground",
            "flex items-center gap-1 rounded-full px-2 py-1",
            "transition-colors duration-150 ease-out",
            "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
            "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2"
          )}
        >
          <HugeiconsIcon aria-hidden="true" icon={Cancel01Icon} size={13} />
          Clear
        </button>
      ) : null}

      {/* Live region: the count is the only feedback that a chip did anything
          when the filtered sections are below the fold. */}
      <p
        aria-live="polite"
        className="ml-auto font-mono text-caption text-muted-foreground tabular-nums"
      >
        {showing === total ? `${total} rhythms` : `${showing} of ${total}`}
      </p>
    </div>
  )
}
