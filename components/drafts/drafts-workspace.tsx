"use client"

import * as React from "react"

import {
  Button,
  ButtonLink,
  Count,
  DataList,
  EmptyRegion,
  EmptyState,
  FilterMenu,
  FootBar,
  KeyBar,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Tag,
  Toolbar,
  ToolbarGroup,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
  focusRestoredDataList,
  revealDataListRow,
  useAnnounce,
  useLetterKeys,
  useWorkspaceFold,
  type KeyBarItem,
} from "@/components/kit"
import { FOCUS_RING } from "@/components/kit/control-styles"
import { Friend } from "@/components/mascot"
import type { Draft } from "@/lib/drafts"

import { Channels, DRAFT_COLUMNS, FromGlyph, NextCell } from "./draft-cells"
import { BUCKET_LABEL, filtersOn, fromName, optionsFor, type Bucket, type Row } from "./draft-rows"
import { FOLD_PROBE, FOLDED, PANE_PX, UNFOLDED } from "./drafts-fold"
import { OpenDraft, type FeedAccounts } from "./open-draft"
import { useDrafts, type DraftsStore, type Notice } from "./use-drafts"

/**
 * /drafts, a workspace (docs/design/workspace.md; decided on
 * /prototypes/drafts-lab: the Table, with "C · Feed" on the right and
 * Lineup as the fold). A toolbar of two rows, a dense table of drafts, and
 * the open draft drawn as its real feed in the pane beside it. Under the
 * fold (`shouldFold`) the same page is one column grouped by what happens
 * next, whose rows open in place into the same feed.
 *
 * One store (`useDrafts`), two views of it, one set of keys: j / k move,
 * A approves (never while a field is open), E edits, U undoes the last
 * approval, / searches. Discard has no key (it is a hold); Post now has
 * none (it is irreversible and keeps its dialog).
 */

export type DraftsWorkspaceProps = {
  drafts: Draft[]
  /** Who each channel's post is from: the connected accounts (page.tsx). */
  accounts: FeedAccounts
}

export const KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["A"], label: "Approve" },
  { keys: ["E"], label: "Edit" },
  { keys: ["U"], label: "Undo" },
  { keys: ["/"], label: "Search" },
]

export function DraftsWorkspace(props: DraftsWorkspaceProps) {
  // CSS picks the side (FOLDED / UNFOLDED); script reads which, after mount.
  const [probe, fold] = useWorkspaceFold()
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <span ref={probe} aria-hidden className={FOLD_PROBE} />
        <DraftsSurface {...props} fold={fold} />
      </div>
    </WorkspacePage>
  )
}

/** `fold` is null until mounted: both sides render, each in its slot, and CSS shows one. */
function DraftsSurface({ drafts, accounts, fold }: DraftsWorkspaceProps & { fold: boolean | null }) {
  const store = useDrafts(drafts)
  const searchRef = React.useRef<HTMLInputElement>(null)
  useDraftKeys(store, searchRef)
  const nothingYet = store.rows.length === 0
  const sheet = (row: Row) => <OpenDraft row={row} store={store} accounts={accounts} />

  return (
    <>
      <DraftsToolbar store={store} searchRef={searchRef} nothingYet={nothingYet} />
      {nothingYet ? (
        <NothingYet />
      ) : (
        <>
          <DraftsFilters store={store} status={fold} />
          <div className={FOLDED}>{fold !== false ? <LineupDrafts store={store} sheet={sheet} /> : null}</div>
          <div className={UNFOLDED}>{fold !== true ? <TableDrafts store={store} sheet={sheet} /> : null}</div>
        </>
      )}
      {/* No keys to show over nothing; a note after a discard still needs its foot. */}
      {nothingYet && !store.notice ? null : <DraftsFoot store={store} />}
    </>
  )
}

/* ── Keys ─────────────────────────────────────────────────────────────── */

/**
 * The page's letter keys (workspace.md, "Keys"). `useLetterKeys` listens in
 * the capture phase and ignores keys in a field, with a modifier, and inside
 * an open menu or dialog.
 */
function useDraftKeys(store: DraftsStore, searchRef: React.RefObject<HTMLInputElement | null>) {
  // Where the open row last stood: when it leaves the view, j / k carry on from there.
  const lastAt = React.useRef(0)
  React.useLayoutEffect(() => {
    const i = store.shown.findIndex((r) => r.id === store.selected?.id)
    if (i >= 0) lastAt.current = i
  })

  const move = (by: 1 | -1) => {
    const list = store.shown
    if (list.length === 0) return
    const i = list.findIndex((r) => r.id === store.selected?.id)
    const to = i >= 0 ? i + by : by > 0 ? lastAt.current : lastAt.current - 1
    const next = list[Math.min(list.length - 1, Math.max(0, to))]!
    store.select(next.id)
    revealDataListRow(next.id)
  }

  // An action moved the selection (an approval that finished the piece, a
  // discard): follow it with focus, since the pressed button is gone.
  React.useEffect(() => {
    if (store.moved) revealDataListRow(store.moved.id, document, { recover: true })
  }, [store.moved])

  const open = store.selected
  const firstWriting = open?.draft.versions.find((v) => v.state === "writing")

  useLetterKeys({
    j: () => move(1),
    k: () => move(-1),
    "/": () => searchRef.current?.focus(),
    // Not while a field is open: Approve would send the saved text and drop what was typed. Save first.
    a: { once: true, run: () => (open && firstWriting && !store.editingId ? store.approve(open, firstWriting.id) : undefined) },
    e: { once: true, run: () => (firstWriting ? store.setEditing(firstWriting.id) : undefined) },
    u: () => {
      const id = store.undo()
      if (id) revealDataListRow(id, document, { recover: true })
    },
  })
}

/* ── The head ─────────────────────────────────────────────────────────── */

/**
 * The one sentence of numbers, from the page's own data only: what is still
 * a decision (not what exists), the oldest of it, what did not go, and what
 * is approved with nowhere to go, the thing that quietly rots.
 */
function Summary({ store }: { store: DraftsStore }) {
  const waiting = store.rows.filter((r) => r.bucket === "waiting")
  const noTime = store.rows.filter((r) => r.bucket === "no-time").length
  const failed = store.rows.filter((r) => r.bucket === "failed").length
  if (store.rows.length === 0) return null
  const oldest = waiting.reduce<Row | null>((o, r) => (!o || r.order < o.order ? r : o), null)
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

function DraftsToolbar({
  store,
  searchRef,
  nothingYet,
}: {
  store: DraftsStore
  searchRef: React.RefObject<HTMLInputElement | null>
  nothingYet: boolean
}) {
  return (
    <Toolbar label="Drafts" divided={false}>
      <div className="flex min-w-0 items-baseline gap-kit-related">
        <ToolbarTitle>Drafts</ToolbarTitle>
        <Summary store={store} />
      </div>
      {nothingYet ? null : (
        <ToolbarGroup end grow>
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

/** The filters, each with what it would leave, a Clear once one is on, and the count. */
function DraftsFilters({
  store,
  status,
}: {
  store: DraftsStore
  /** The fold (null until mounted): Status is off under it, where Lineup's groups already are the status. */
  status: boolean | null
}) {
  const f = store.filters
  const count = `${store.shown.length} of ${store.rows.length}`
  // Said when the filters or the search change, once the typing stops.
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
        {status !== true ? (
          <span className={UNFOLDED}>
            <FilterMenu
              label="Status"
              value={f.status}
              options={optionsFor(store.rows, f, "status")}
              onValueChange={(v) => store.setFilter("status", v)}
            />
          </span>
        ) : null}
        <FilterMenu label="From" value={f.from} options={optionsFor(store.rows, f, "from")} onValueChange={(v) => store.setFilter("from", v)} />
        <FilterMenu
          label="For"
          value={f.channel}
          options={optionsFor(store.rows, f, "channel")}
          onValueChange={(v) => store.setFilter("channel", v)}
        />
        {filtersOn(f) ? (
          <Button size="xs" variant="ghost" onClick={store.clearFilters}>
            Clear
          </Button>
        ) : null}
      </ToolbarGroup>
      <ToolbarGroup end>
        <span className="font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted tabular-nums">{count}</span>
      </ToolbarGroup>
    </Toolbar>
  )
}

/* ── The foot ─────────────────────────────────────────────────────────── */

/** A quoted opening keeps its own stop; the sentence adds none after it. */
const quoted = (t: string) => `“${t.replace(/[.!?]+$/, "")}”`

function noticeSentence(n: Notice) {
  if (n.kind === "approved") return `Approved ${quoted(n.title)}. ${n.sentence}`
  if (n.kind === "discarded") return n.whole ? `Discarded ${quoted(n.title)}. It's gone for good.` : `Discarded one version of ${quoted(n.title)}.`
  if (n.kind === "failed") return n.message
  return n.ok ? `Posted ${quoted(n.title)}.` : `${quoted(n.title)} did not go out. The reason is on the draft.`
}

/** The KeyBar, or the note after an action in its place: the same 36px, so the panes never move. */
function DraftsFoot({ store }: { store: DraftsStore }) {
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
      <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">{noticeSentence(n)}</p>
      {n.kind === "approved" ? (
        <Button
          size="xs"
          variant="ghost"
          shortcut="U"
          onClick={() => {
            const id = store.undo()
            if (id) revealDataListRow(id, document, { recover: true })
          }}
        >
          Undo
        </Button>
      ) : null}
    </FootBar>
  )
}

/* ── Empty states ─────────────────────────────────────────────────────── */

/**
 * Under the heads when a filter or the search leaves nothing. Bare: the
 * region around it (DataList's, or the fold's EmptyRegion) centres it.
 * Clear filters takes its own button away, so focus follows to the rows it
 * brought back.
 */
function FilteredEmpty({ store }: { store: DraftsStore }) {
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
function NothingYet() {
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
function AllDecided() {
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

/* ── The table, with the feed beside it ───────────────────────────────── */

function TableDrafts({ store, sheet }: { store: DraftsStore; sheet: (row: Row) => React.ReactNode }) {
  const open = store.selected
  const anyWaiting = store.rows.some((r) => r.bucket === "waiting")
  return (
    <WorkspacePanes>
      <Panel label="Drafts">
        <PanelBody>
          <DataList
            label="Drafts"
            aria-keyshortcuts="j k a e u"
            items={store.shown}
            getKey={(r) => r.id}
            getLabel={(r) => r.opening || r.draft.idea}
            value={open?.id ?? null}
            onValueChange={store.select}
            columns={DRAFT_COLUMNS}
            empty={<FilteredEmpty store={store} />}
          />
        </PanelBody>
      </Panel>
      <Panel label="Open draft" width={`${PANE_PX}px`} edge="start">
        <PanelBody label="The open draft" scrollKey={open?.id ?? null}>
          {open ? (
            <>
              <PanelHeader end={open.draft.kind ? <Tag look="text">{open.draft.kind}</Tag> : undefined}>
                <SourceStrip row={open} />
              </PanelHeader>
              <div className="px-kit-group py-kit-group">{sheet(open)}</div>
            </>
          ) : !anyWaiting ? (
            // Every draft decided: the pane's one message, in the middle of the
            // space under its strip (the strip keeps one line across both panes).
            <div className="flex min-h-full flex-col">
              <PanelHeader>
                <span aria-hidden />
              </PanelHeader>
              <EmptyRegion>
                <AllDecided />
              </EmptyRegion>
            </div>
          ) : (
            <>
              <PanelHeader>
                <span aria-hidden />
              </PanelHeader>
              <div className="flex flex-col gap-kit-tight px-kit-group pt-kit-group">
                <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
                <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a draft, or press j, to read it as the feed will.</p>
              </div>
            </>
          )}
        </PanelBody>
      </Panel>
    </WorkspacePanes>
  )
}

/** The pane's strip: where it came from, and when. */
function SourceStrip({ row }: { row: Row }) {
  return (
    <>
      <FromGlyph row={row} />
      <span className="truncate">{row.draft.from.adaptedFrom ? `Adapted from ${fromName(row)}` : `From your ${row.draft.from.sourceLabel}`}</span>
      <span aria-hidden>·</span>
      <span className="font-kit-mono text-kit-mono-sm">{row.draft.from.at}</span>
    </>
  )
}

/* ── The fold: one column grouped by what happens next ────────────────── */

const ORDER: Bucket[] = ["waiting", "failed", "no-time", "out", "sent"]

type Section = { key: string; title: string; rows: Row[] }

/**
 * Lineup's groups. Going out is one group, not one per day: the day is only
 * in `goingOut`, a formatted string, and grouping by day for real wants the
 * day carried as data (the lab's proposal 8).
 */
function sections(rows: readonly Row[]): Section[] {
  return ORDER.map((b) => ({ key: b, title: BUCKET_LABEL[b], rows: rows.filter((r) => r.bucket === b) })).filter(
    (s) => s.rows.length > 0
  )
}

function LineupDrafts({ store, sheet }: { store: DraftsStore; sheet: (row: Row) => React.ReactNode }) {
  // A row closed by hand stays closed until another opens (the open draft is still the URL's).
  const [closed, setClosed] = React.useState<string | null>(null)
  const open = store.selected && store.selected.id !== closed ? store.selected : null
  const groups = React.useMemo(() => sections(store.shown), [store.shown])

  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const t = e.target as HTMLElement
    if (!t.matches("[data-kit-row]")) return
    e.preventDefault()
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-kit-row]")]
    const next = all[all.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1)]
    if (next?.dataset.kitRow) {
      next.focus()
      setClosed(null)
      store.select(next.dataset.kitRow)
    }
  }

  if (store.shown.length === 0) {
    return (
      <PanelBody>
        <EmptyRegion>
          <FilteredEmpty store={store} />
        </EmptyRegion>
      </PanelBody>
    )
  }

  return (
    <PanelBody>
      {/* On a phone the foot (keys) is hidden, so the list itself clears the home indicator and the side insets. */}
      <div
        onKeyDown={onListKey}
        className="mx-auto flex w-full max-w-[60rem] flex-col gap-kit-related ps-[max(0.5rem,env(safe-area-inset-left))] pe-[max(0.5rem,env(safe-area-inset-right))] pt-kit-related pb-[calc(var(--spacing-kit-related)+env(safe-area-inset-bottom))] @[40rem]/kit-workspace:px-kit-group"
      >
        {groups.map((g) => (
          <section key={g.key} aria-label={g.title} className="flex flex-col gap-px">
            <h2 className="flex items-baseline gap-2 px-3 pt-kit-related pb-1 text-kit-meta font-kit-strong text-kit-ink-muted">
              <span>{g.title}</span>
              <span className="font-kit-mono text-kit-mono-sm font-normal tabular-nums">{g.rows.length}</span>
            </h2>
            <ul className="flex flex-col gap-px">
              {g.rows.map((r) => (
                <InlineRow
                  key={r.id}
                  row={r}
                  open={open?.id === r.id}
                  onToggle={(was) => {
                    if (was) setClosed(r.id)
                    else {
                      setClosed(null)
                      store.select(r.id)
                    }
                  }}
                >
                  {sheet(r)}
                </InlineRow>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelBody>
  )
}

function InlineRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: Row
  open: boolean
  onToggle: (wasOpen: boolean) => void
  /** Mounted only while open: one open draft on the page. */
  children: React.ReactNode
}) {
  const panelId = React.useId()
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest" })
  }, [open])
  const title = row.opening || row.draft.idea
  return (
    <li
      data-open={open || undefined}
      className="rounded-kit-control transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out data-open:bg-kit-object data-open:shadow-kit-object motion-reduce:transition-none"
    >
      <button
        ref={ref}
        type="button"
        data-kit-row={row.id}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onToggle(open)}
        className={
          `relative grid w-full scroll-mt-9 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-kit-control px-3 py-1.5 text-start pointer-coarse:min-h-11 ${FOCUS_RING} focus-visible:outline-offset-0 ` +
          "@[40rem]/kit-workspace:grid-cols-[1rem_minmax(0,1fr)_8rem_2.75rem_6.25rem_3.25rem] " +
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
          (open ? "" : "hover:bg-kit-row-hover")
        }
      >
        <FromGlyph row={row} />
        <span className="flex min-w-0 flex-col">
          <span
            className={`min-w-0 text-kit-dense ${open ? "font-kit-strong text-pretty text-kit-ink" : `truncate ${row.bucket === "sent" ? "text-kit-ink-muted" : "text-kit-ink"}`}`}
          >
            {title}
          </span>
          {/* On a phone the columns fold into one meta line. */}
          <span className="flex min-w-0 items-center gap-1.5 text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:hidden">
            <span className="min-w-0 truncate">{fromName(row)}</span>
            {row.bucket !== "waiting" || row.draft.versions.length > 1 ? (
              <>
                <span aria-hidden>·</span>
                <NextCell row={row} />
              </>
            ) : null}
          </span>
        </span>
        <span className="hidden min-w-0 truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">{fromName(row)}</span>
        <span className="hidden @[40rem]/kit-workspace:flex">
          <Channels row={row} />
        </span>
        <span className="hidden @[40rem]/kit-workspace:flex">
          <NextCell row={row} />
        </span>
        <span className="self-start pt-0.5 text-end font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[40rem]/kit-workspace:self-center @[40rem]/kit-workspace:pt-0">
          {row.draft.from.at}
        </span>
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label={`The draft “${title}”`} className="px-3 pb-4 @[40rem]/kit-workspace:ps-10 @[40rem]/kit-workspace:pe-6">
          <div className="border-t border-kit-hairline pt-kit-group">{children}</div>
        </div>
      ) : null}
    </li>
  )
}
