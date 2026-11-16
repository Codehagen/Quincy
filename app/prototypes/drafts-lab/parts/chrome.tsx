"use client"

import * as React from "react"

import {
  Button,
  ButtonLink,
  Count,
  EmptyRegion,
  EmptyState,
  FilterMenu,
  FootBar,
  KeyBar,
  SearchField,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  focusRestoredDataList,
  useAnnounce,
  type KeyBarItem,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import {
  filtersOn,
  optionsFor,
  type ChannelFilter,
  type DraftsStore,
  type FromFilter,
  type Notice,
  type StatusFilter,
} from "../use-drafts"

/** The keys every layout binds (use-letter-keys). D is not one: the app's D (theme) stands down here. */
export const KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["A"], label: "Approve" },
  { keys: ["E"], label: "Edit" },
  { keys: ["P"], label: "Preview" },
  { keys: ["U"], label: "Undo" },
  { keys: ["/"], label: "Search" },
]

/**
 * The one sentence of numbers, from the page's own data only: what is still
 * a decision (not what exists), the oldest of it, and what is approved with
 * nowhere to go, the thing that quietly rots (drafts-inbox.tsx's summary).
 */
export function Summary({ store }: { store: DraftsStore }) {
  const waiting = store.rows.filter((r) => r.bucket === "waiting")
  const noTime = store.rows.filter((r) => r.bucket === "no-time").length
  const failed = store.rows.filter((r) => r.bucket === "failed").length
  if (store.rows.length === 0) return null
  const oldest = waiting.reduce<(typeof waiting)[number] | null>((o, r) => (!o || r.draft.age > o.draft.age ? r : o), null)
  return (
    <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">
      {waiting.length === 0 ? (
        "Nothing is waiting on you."
      ) : (
        <>
          <Count value={waiting.length} /> waiting on you, the oldest from {oldest?.draft.from.at}.
        </>
      )}
      {failed > 0 ? (
        <>
          {" "}
          <Count value={failed} /> didn&apos;t go.
        </>
      ) : null}
      {noTime > 0 ? (
        <>
          {" "}
          <Count value={noTime} /> approved with no time.
        </>
      ) : null}
    </p>
  )
}

export function DraftsToolbar({
  store,
  searchRef,
  children,
}: {
  store: DraftsStore
  searchRef: React.RefObject<HTMLInputElement | null>
  /** Before the search: a layout's own control (Desk's position). */
  children?: React.ReactNode
}) {
  return (
    <Toolbar label="Drafts" divided={false}>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        <ToolbarTitle>Drafts</ToolbarTitle>
        <Summary store={store} />
      </div>
      {store.phase === "empty" ? null : (
      <ToolbarGroup end grow>
        {children}
        <SearchField
          ref={searchRef}
          size="sm"
          shortcut="/"
          aria-label="Search drafts"
          placeholder="Search drafts"
          value={store.filters.q}
          onValueChange={(q) => store.setFilter("q", q)}
        />
      </ToolbarGroup>
      )}
    </Toolbar>
  )
}

export function DraftsFilters({
  store,
  status = true,
  count: showCount = true,
  end,
}: {
  store: DraftsStore
  /** Off where the layout's own groups already are the status (Lineup). */
  status?: boolean
  /** Off where the layout says its own position (Desk: "4 of 27"). */
  count?: boolean
  end?: React.ReactNode
}) {
  const f = store.filters
  const count = `${store.shown.length} of ${store.rows.length}`
  const announce = useAnnounce()
  const said = React.useRef(count)
  React.useLayoutEffect(() => {
    said.current = count
  })
  const key = JSON.stringify(f)
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => announce(`${said.current} drafts`), 500)
    return () => clearTimeout(t)
  }, [key, announce])

  return (
    <Toolbar label="Filters" size="filter">
      <ToolbarGroup>
        {status ? (
          <FilterMenu<StatusFilter>
            label="Status"
            value={f.status}
            options={optionsFor(store.rows, f, "status") as { value: StatusFilter; label: string; count: number }[]}
            onValueChange={(v) => store.setFilter("status", v)}
          />
        ) : null}
        <FilterMenu<FromFilter>
          label="From"
          value={f.from}
          options={optionsFor(store.rows, f, "from") as { value: FromFilter; label: string; count: number }[]}
          onValueChange={(v) => store.setFilter("from", v)}
        />
        <FilterMenu<ChannelFilter>
          label="For"
          value={f.channel}
          options={optionsFor(store.rows, f, "channel") as { value: ChannelFilter; label: string; count: number }[]}
          onValueChange={(v) => store.setFilter("channel", v)}
        />
        {filtersOn(f) ? (
          <Button size="xs" variant="ghost" onClick={store.clearFilters}>
            Clear
          </Button>
        ) : null}
      </ToolbarGroup>
      <ToolbarGroup end>
        {showCount ? <span className="font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted tabular-nums">{count}</span> : null}
        {end}
      </ToolbarGroup>
    </Toolbar>
  )
}

/** A quoted opening keeps its own stop; the sentence adds none after it. */
const quoted = (t: string) => `“${t.replace(/[.!?]+$/, "")}”`

function noticeSentence(n: Notice) {
  if (n.kind === "approved") return `Approved ${quoted(n.title)}. ${n.sentence}`
  if (n.kind === "discarded") return n.whole ? `Discarded ${quoted(n.title)}. It's gone for good.` : `Discarded one version of ${quoted(n.title)}.`
  return n.ok ? `Posted ${quoted(n.title)}.` : `${quoted(n.title)} did not go out. The reason is on the draft.`
}

/** The KeyBar, or the note after an action in its place: the same 36px, so the panes never move. */
export function DraftsFoot({ store, onUndo }: { store: DraftsStore; onUndo: () => void }) {
  const n = store.notice
  const { dismissNotice } = store
  const announce = useAnnounce()

  // Said once through the surface's one Announcer (workspace.md), not a status node per note.
  React.useEffect(() => {
    if (!n) return
    announce(n.kind === "approved" ? `${noticeSentence(n)} Press U to undo.` : noticeSentence(n))
    const t = setTimeout(dismissNotice, 7000)
    return () => clearTimeout(t)
  }, [n, announce, dismissNotice])

  if (!n) return <KeyBar keys={KEYS} />
  return (
    <FootBar>
      <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">
        {noticeSentence(n)}
      </p>
      {n.kind === "approved" ? (
        <Button size="xs" variant="ghost" shortcut="U" onClick={onUndo}>
          Undo
        </Button>
      ) : null}
    </FootBar>
  )
}

/**
 * Under the heads when a filter or the search leaves nothing. Bare: the
 * region around it (DataList's, or the layout's EmptyRegion) centres it.
 * Clear filters takes its own button away, so focus follows to the rows it
 * brought back.
 */
export function FilteredEmpty({ store }: { store: DraftsStore }) {
  const clear = () => {
    store.clearFilters()
    focusRestoredDataList()
  }
  return (
    <EmptyState
      frame="none"
      media={<Friend size={40} state="reading" className="text-kit-ink" />}
      bold="No drafts match."
      rest="Clear a filter, or search for a word from the post."
    >
      <Button size="xs" onClick={clear}>
        Clear filters
      </Button>
    </EmptyState>
  )
}

/** Nothing ever arrived, or the last piece was discarded: the honest next step is Ideas. */
export function NothingYet() {
  return (
    <EmptyRegion edge="rule">
      <EmptyState
        frame="none"
        media={<Friend size={48} state="resting" className="text-kit-ink" />}
        bold="Nothing written yet."
        rest="Drafts start in Ideas. Pick one worth writing and I'll write a version for each channel you post to."
      >
        <ButtonLink href="/ideas" variant="action">
          Go to Ideas
        </ButtonLink>
      </EmptyState>
    </EmptyRegion>
  )
}

/** Every draft is decided. Said once, where the open draft would be. */
export function AllDecided() {
  return (
    <EmptyState
      frame="none"
      media={<Friend size={40} state="sent" className="text-kit-ink" />}
      bold="Nothing is waiting on you."
      rest="Everything here is decided. Each one says when it goes out, or why it has no time yet."
    >
      <ButtonLink href="/lineup" size="sm">
        Open Lineup
      </ButtonLink>
    </EmptyState>
  )
}
