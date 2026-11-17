"use client"

import * as React from "react"

import { ButtonLink, EmptyRegion, EmptyState, Segmented, TextLink, Toolbar, ToolbarGroup, ToolbarTitle } from "@/components/kit"
import { Friend } from "@/components/mascot"
import { MIN_WEEKS, PERIOD_OPTIONS, dayLabel, isStale, type NumbersData, type Period } from "@/lib/numbers-read"

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ")
}

/* ── NumbersToolbar ─────────────────────────────────────────────────── */

export type NumbersToolbarProps = {
  /** The line beside the name: where the numbers come from. */
  children?: React.ReactNode
  /** Controlled period. Pass `period` or `defaultPeriod` to show the switch; leave both out when there is nothing to scope. */
  period?: Period
  /** Uncontrolled starting period. */
  defaultPeriod?: Period
  onPeriodChange?: (period: Period) => void
  /** Table opened from the Dashboard: the title becomes a crumb back ("Numbers / Posts"). */
  onBack?: () => void
}

/**
 * The page row: the name, one line of where the numbers come from, and the
 * period (7 / 30 / 90 days), which scopes everything under it: one filter
 * row above the charts, never a filter per chart. In Table it carries the
 * crumb back, so it reads as a path, not a view switch.
 */
export function NumbersToolbar({
  children = "Every post against your own median. Never a follower count.",
  period,
  defaultPeriod,
  onPeriodChange,
  onBack,
}: NumbersToolbarProps) {
  return (
    <Toolbar label="Numbers" divided>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        {onBack ? (
          <nav aria-label="Breadcrumb" className="shrink-0">
            <ol className="flex items-baseline gap-1.5 text-kit-heading">
              <li>
                <button
                  type="button"
                  onClick={onBack}
                  aria-keyshortcuts="Escape"
                  // A text-sized button: its hit area grows to 44 tall on a touch screen, as the kit's TextButton does.
                  className="relative cursor-pointer rounded-kit-chip text-kit-ink-muted pointer-coarse:after:absolute pointer-coarse:after:inset-x-0 pointer-coarse:after:top-1/2 pointer-coarse:after:h-11 pointer-coarse:after:-translate-y-1/2 outline-hidden transition-[color] duration-(--kit-duration-state) ease-kit-out hover:text-kit-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus motion-reduce:transition-none"
                >
                  Numbers
                </button>
              </li>
              <li aria-hidden className="text-kit-ink-muted">
                /
              </li>
              <li>
                <ToolbarTitle as="h2">Posts</ToolbarTitle>
              </li>
            </ol>
          </nav>
        ) : (
          <ToolbarTitle>Numbers</ToolbarTitle>
        )}
        <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">{children}</p>
      </div>
      {period === undefined && defaultPeriod === undefined ? null : (
        <ToolbarGroup end>
          <Segmented aria-label="Period" options={PERIOD_OPTIONS} value={period} defaultValue={defaultPeriod} onValueChange={onPeriodChange} />
        </ToolbarGroup>
      )}
    </Toolbar>
  )
}

/** Reading, said where the numbers will land (docs/design/states.md, "Working"). Never bars. */
export function ReadingLine() {
  return (
    <div role="status" className="text-kit-dense text-kit-ink">
      <span className="inline-flex items-center gap-2">
        <Friend size={20} state="reading" className="shrink-0" />
        <span className="min-w-0">
          Reading your numbers. This usually takes a few seconds.
        </span>
      </span>
    </div>
  )
}

/**
 * Above the grid while something about the data needs saying: the channel
 * went away, the morning read is behind, too little history for a usual,
 * or facts about the rows (posts with no text yet). One line, first person.
 */
export function StateLine({ data, enoughHistory, minWeeks = MIN_WEEKS }: { data: NumbersData; enoughHistory: boolean; minWeeks?: number }) {
  const last = data.lastRead ? dayLabel(data.today, Math.round((Date.parse(`${data.today}T00:00:00Z`) - Date.parse(`${data.lastRead}T00:00:00Z`)) / 86_400_000)) : null
  if (!data.connected) {
    return (
      <div role="status" className="flex flex-wrap items-baseline gap-x-kit-related gap-y-kit-tight text-kit-dense">
        <p className="text-kit-ink">
          X isn&apos;t connected.{" "}
          <span className="text-kit-ink-muted">These are the numbers as they stood{last ? ` on ${last}` : ""}; I&apos;ll read again once it is.</span>
        </p>
        <TextLink href="/connectors?open=x">Connect X</TextLink>
      </div>
    )
  }
  if (isStale(data)) {
    return (
      <div role="status" className="flex flex-wrap items-baseline gap-x-kit-related gap-y-kit-tight text-kit-dense">
        <p className="text-kit-ink">
          The last reading is from {last}. <span className="text-kit-ink-muted">I read X every morning at 06:00 UTC.</span>
        </p>
        <TextLink href="/connectors?open=x">Check the connection</TextLink>
      </div>
    )
  }
  if (!enoughHistory) {
    return (
      <p role="status" className="text-kit-dense text-kit-ink">
        {data.historyWeeks === 0 ? "Less than a week of readings so far." : `${data.historyWeeks} ${data.historyWeeks === 1 ? "week" : "weeks"} of readings so far.`}{" "}
        <span className="text-kit-ink-muted">I&apos;ll say what&apos;s usual for you once there are {minWeeks} weeks behind the period. Until then each number stands alone.</span>
      </p>
    )
  }
  if (data.notes.length) return <p className="text-kit-meta text-pretty text-kit-ink-muted">{data.notes.join(" ")}</p>
  return null
}

/** Nothing to measure, said where the numbers would be, with the friend, centred. */
export function EmptyNumbers({ kind }: { kind: "empty" | "disconnected" }) {
  return (
    <EmptyRegion>
      {kind === "disconnected" ? (
        <EmptyState
          frame="none"
          media={<Friend size={48} state="waiting" className="text-kit-ink" />}
          bold="No channel connected."
          rest="Connect X and I'll read back every post each morning, and set it against your own median. Never a follower count."
        >
          <ButtonLink href="/connectors?open=x" variant="action">
            Connect X
          </ButtonLink>
        </EmptyState>
      ) : (
        <EmptyState
          frame="none"
          media={<Friend size={48} state="resting" className="text-kit-ink" />}
          bold="Nothing published yet."
          rest="Once a post goes out, I'll measure it every morning. After three weeks I can tell you what's usual for you."
        >
          <ButtonLink href="/drafts">Go to Drafts</ButtonLink>
        </EmptyState>
      )}
    </EmptyRegion>
  )
}

/* ── NumbersPanel ───────────────────────────────────────────────────── */

const PanelTitleId = React.createContext<string | null>(null)

/**
 * A panel on the grid: a white object on the ground, lifted by elevation,
 * named by its title (the root and the title share the id through context).
 *
 * ```tsx
 * <NumbersPanel className="@[60rem]/kit-workspace:col-span-2">
 *   <NumbersPanel.Header>
 *     <NumbersPanel.Title>What worked</NumbersPanel.Title>
 *     <NumbersPanel.Meta>Your median post: 662 views</NumbersPanel.Meta>
 *   </NumbersPanel.Header>
 *   …
 * </NumbersPanel>
 * ```
 */
function NumbersPanelRoot({ className, children, ...rest }: React.ComponentPropsWithRef<"section">) {
  const id = React.useId()
  return (
    <PanelTitleId value={id}>
      <section aria-labelledby={id} className={cx("flex min-w-0 flex-col gap-kit-related rounded-kit-control bg-kit-object p-kit-group shadow-kit-object", className)} {...rest}>
        {children}
      </section>
    </PanelTitleId>
  )
}

/** The panel's top row: the title, then the meta at the end. */
function NumbersPanelHeader({ className, ...rest }: React.ComponentPropsWithRef<"header">) {
  return <header className={cx("flex min-h-7 flex-wrap items-center justify-between gap-x-kit-related gap-y-kit-tight", className)} {...rest} />
}

/** The panel's name; it labels the panel. */
function NumbersPanelTitle({ className, ...rest }: Omit<React.ComponentPropsWithRef<"h2">, "id">) {
  const id = React.useContext(PanelTitleId) ?? undefined
  return <h2 id={id} className={cx("text-kit-dense font-kit-strong text-kit-ink", className)} {...rest} />
}

/** A fact about the panel at the row's end ("2 replied"), or one quiet control. */
function NumbersPanelMeta({ className, ...rest }: React.ComponentPropsWithRef<"div">) {
  return <div className={cx("text-kit-meta text-kit-ink-muted tabular-nums", className)} {...rest} />
}

export const NumbersPanel = Object.assign(NumbersPanelRoot, {
  Header: NumbersPanelHeader,
  Title: NumbersPanelTitle,
  Meta: NumbersPanelMeta,
})
