"use client"

import Link from "next/link"
import { parseAsStringLiteral, useQueryState } from "nuqs"

import { cn } from "@/lib/utils"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty"

import { NodeChip } from "../../rhythm/parts"
import { NODE_LABEL, type Node } from "../../rhythm/data"
import {
  PIECES,
  STATE_HREF,
  STATE_LABEL,
  type Piece,
  type PieceState,
} from "../data"
import { StateChip, Views } from "../parts"
import { RunHeader } from "./header"

/**
 * Lineage — axis: the tree, grouped by channel.
 *
 * Answers "what did this become". One source fans out into per-channel
 * branches, and each branch shows how many attempts it got — five on X, three
 * on Threads, one on YouTube. That asymmetry is a decision you can read off the
 * page and change, and no other screen in the product can show it.
 *
 * It is also the only shape that makes the adaptation argument visible: the
 * same essay reads as a thread on X and as a vertical cut on TikTok, and the
 * hooks beside each other are the proof that it was rewritten rather than
 * pasted.
 *
 * What it costs: "what still needs me" is scattered. A draft on Threads and a
 * draft on TikTok are five rows apart, so the page is a poor work queue.
 */

const CHANNEL_ORDER: Node[] = [
  "x",
  "linkedin",
  "threads",
  "instagram",
  "tiktok",
  "youtube",
  "substack",
]

/**
 * Status as a filter, which is the honest fix for Lineage's one weakness: it
 * groups by channel, so "what still needs me" is scattered — a draft on Threads
 * and a draft on TikTok sit five rows apart.
 *
 * Filtering rather than regrouping, on purpose. Regrouping by status would turn
 * this into the variant it beat; a filter keeps the tree and lets you narrow
 * it, so the channel asymmetry survives while the work queue becomes reachable.
 *
 * In the URL for the same reason the platform filter is: a filtered view should
 * be linkable and survive reload. `lib/rhythm-search-params.ts` already keeps
 * `status` there for the rhythm list; this borrows the shape, not the values —
 * a rhythm is live or paused, a piece is published, scheduled or drafted.
 */
const STATUSES = ["published", "scheduled", "draft"] as const

const statusParser = parseAsStringLiteral(STATUSES).withOptions({
  clearOnDefault: true,
})

export function Lineage() {
  const [status, setStatus] = useQueryState("status", statusParser)

  const visible = status ? PIECES.filter((p) => p.state === status) : PIECES

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-6">
      <RunHeader />

      <StatusFilter active={status} onChange={setStatus} />

      {visible.length === 0 ? (
        <Empty className="rounded-xl bg-card shadow-xs">
          <EmptyHeader>
            <EmptyTitle>
              Nothing from this run is{" "}
              {status ? STATE_LABEL[status].toLowerCase() : "here"}
            </EmptyTitle>
            <EmptyDescription>
              Every piece has moved on. Clear the filter to see the whole run.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      <div className="flex flex-col gap-6">
        {CHANNEL_ORDER.map((channel) => {
          const pieces = visible.filter((p) => p.channel === channel)
          if (pieces.length === 0) return null

          return (
            <section key={channel} className="flex flex-col gap-2">
              <div className="flex items-center gap-2 px-3">
                <NodeChip node={channel} labelled />
                <h2 className="text-card-title">{NODE_LABEL[channel]}</h2>
                <span className="font-mono text-caption text-muted-foreground tabular-nums">
                  {pieces.length}
                </span>
              </div>

              {/* The rail is the branch. A 1px line rather than an indent
                  alone: indentation without a mark reads as a spacing mistake
                  once the list is long. */}
              <ul
                role="list"
                className="ml-[1.375rem] flex flex-col border-l border-border pl-4"
              >
                {pieces.map((piece) => (
                  <Row key={piece.id} piece={piece} />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
    </div>
  )
}

function Row({ piece }: { piece: Piece }) {
  return (
    <li
      className={cn(
        "group/row relative flex items-center gap-3 py-2",
        // The ring goes on the row, because the row is what a click acts on.
        // The link carries `outline-none`, so without this there was no focus
        // indicator at all — measured as `outline: none 0px` with no ring.
        "rounded-sm has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring/50"
      )}
    >
      {/* flex-1 so Views lands on one edge down the whole list.
          Right-aligned tabular figures only read as a column if they share
          an edge — without this they drifted with the hook length. */}
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        {/* Clamped to two lines rather than truncated to one. The hook is the
            variable under comparison down this column; cutting it at the first
            ellipsis hides the thing the page exists to show. */}
        <p className="line-clamp-2 min-w-0 text-body">
          <Link
            href={STATE_HREF[piece.state]}
            className={cn(
              "after:absolute after:inset-0",
              "underline-offset-4 group-hover/row:underline",
              "outline-none"
            )}
          >
            {piece.hook}
          </Link>
        </p>
        <p className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-caption text-muted-foreground">
          {piece.form}
          <StateChip state={piece.state} />
          {piece.at ? <span className="tabular-nums">{piece.at}</span> : null}
        </p>
      </div>

      <Views views={piece.views} />
    </li>
  )
}

function StatusFilter({
  active,
  onChange,
}: {
  active: PieceState | null
  onChange: (next: PieceState | null) => void
}) {
  const options: { value: PieceState | null; label: string; count: number }[] =
    [
      { value: null, label: "All", count: PIECES.length },
      ...STATUSES.map((s) => ({
        value: s as PieceState,
        label: STATE_LABEL[s],
        count: PIECES.filter((p) => p.state === s).length,
      })),
    ]

  return (
    <div className="flex flex-wrap items-center gap-2 px-3">
      {options.map((option) => {
        const on = active === option.value

        return (
          <button
            key={option.label}
            type="button"
            onClick={() => onChange(option.value)}
            aria-pressed={on}
            className={cn(
              "flex items-center gap-1.5 rounded-full px-3 py-1",
              "text-caption transition-[background-color,box-shadow,color] duration-150 ease-out",
              "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
              // 26px chip, 44px hit area, vertical only — the chips sit 8px
              // apart, so growing the width would overlap the next one.
              "relative before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2",
              on
                ? "bg-foreground text-background"
                : "bg-card text-muted-foreground shadow-2xs hover:text-foreground"
            )}
          >
            {option.label}
            {/* The count lives here and nowhere else, so it cannot disagree
                with itself. Tabular figures so switching filters does not
                jiggle the row. */}
            <span
              className={cn(
                "font-mono tabular-nums",
                on ? "text-background/70" : "text-muted-foreground/70"
              )}
            >
              {option.count}
            </span>
          </button>
        )
      })}
    </div>
  )
}
