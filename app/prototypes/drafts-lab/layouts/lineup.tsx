"use client"

import * as React from "react"

import { EmptyRegion, PanelBody, SkeletonLines, WorkspacePage } from "@/components/kit"
import { FOCUS_RING } from "@/components/kit/control-styles"

import { Channels, FromGlyph, NextCell, fromName } from "../parts/cells"
import { DraftsFilters, DraftsFoot, DraftsToolbar, FilteredEmpty, KEYS_POST, NothingYet } from "../parts/chrome"
import { DraftSheet } from "../parts/draft-sheet"
import { useDraftKeys } from "../parts/keys"
import { BUCKET_LABEL, type Bucket, type DraftsStore, type Row } from "../use-drafts"
import type { LabOptions } from "../lab-options"

/**
 * 3 · Lineup: one column, grouped by what happens next, the open draft
 * unfolding in place. Waiting on you, then what did not go, what is
 * approved with no time, what is going out (by day), what went. The axis is
 * the outcome, so "approved but stranded" is a group you can see, not a
 * sentence you have to open a row to read. It is also the fold of Table:
 * the same store and keys on a phone or a narrow window.
 */

export function LineupLayout({ store, opts }: { store: DraftsStore; opts: LabOptions }) {
  return (
    <WorkspacePage>
      <LineupSurface store={store} opts={opts} />
    </WorkspacePage>
  )
}

const ORDER: Bucket[] = ["waiting", "failed", "no-time", "out", "sent"]

type Section = { key: string; title: string; rows: Row[] }

function sections(rows: readonly Row[]): Section[] {
  const out: Section[] = []
  for (const b of ORDER) {
    const rs = rows.filter((r) => r.bucket === b)
    if (rs.length === 0) continue
    if (b !== "out") {
      out.push({ key: b, title: BUCKET_LABEL[b], rows: rs })
      continue
    }
    // Going out: one section per day, in the order the times come.
    const days = new Map<string, Row[]>()
    for (const r of rs) {
      const day = r.going.kind === "scheduled" ? r.going.at.replace(/[ ,]+\d\d:\d\d$/, "").replace(/,.*$/, "") : "Sending now"
      days.set(day, [...(days.get(day) ?? []), r])
    }
    for (const [day, list] of days) out.push({ key: `out-${day}`, title: `Going out ${day}`, rows: list })
  }
  return out
}

export function LineupSurface({
  store,
  opts,
  sheet,
}: {
  store: DraftsStore
  opts: LabOptions
  /** What an open row unfolds into. Round 1: the marked-up sheet; round 2: the post. */
  sheet?: (row: Row) => React.ReactNode
}) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  useDraftKeys(store, searchRef, { preview: !sheet })
  // A row closed by hand stays closed until another opens.
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

  return (
    <>
      <DraftsToolbar store={store} searchRef={searchRef} />
      {store.phase === "empty" ? (
        <NothingYet />
      ) : (
        <>
          <DraftsFilters store={store} status={false} />
          {store.phase !== "loading" && store.shown.length === 0 ? (
            <PanelBody>
              <EmptyRegion>
                <FilteredEmpty store={store} />
              </EmptyRegion>
            </PanelBody>
          ) : (
            <PanelBody>
              <div onKeyDown={onListKey} className="mx-auto flex w-full max-w-[60rem] flex-col gap-kit-related px-2 py-kit-related @[40rem]/kit-workspace:px-kit-group">
                {store.phase === "loading" ? (
                  <div role="status" aria-label="Loading drafts" className="flex flex-col gap-3 px-3 pt-kit-related">
                    {Array.from({ length: 8 }, (_, i) => (
                      <SkeletonLines key={i} widths={[i % 2 ? "62%" : "78%"]} />
                    ))}
                  </div>
                ) : (
                  groups.map((g) => (
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
                            use={opts.title}
                            open={open?.id === r.id}
                            onToggle={(was) => {
                              if (was) setClosed(r.id)
                              else {
                                setClosed(null)
                                store.select(r.id)
                              }
                            }}
                          >
                            {sheet ? sheet(r) : <DraftSheet row={r} store={store} />}
                          </InlineRow>
                        ))}
                      </ul>
                    </section>
                  ))
                )}
              </div>
            </PanelBody>
          )}
        </>
      )}
      {store.phase === "empty" ? null : <DraftsFoot store={store} onUndo={store.undo} keys={sheet ? KEYS_POST : undefined} />}
    </>
  )
}

function InlineRow({
  row,
  use,
  open,
  onToggle,
  children,
}: {
  row: Row
  use: "opening" | "idea"
  open: boolean
  onToggle: (wasOpen: boolean) => void
  /** Mounted only while open: one sheet, one Highlight on the page. */
  children: React.ReactNode
}) {
  const panelId = React.useId()
  const ref = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest" })
  }, [open])
  const title = use === "idea" ? row.draft.idea : row.opening
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
          `relative grid w-full scroll-mt-2 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-kit-control px-3 py-1.5 text-left pointer-coarse:min-h-11 ${FOCUS_RING} focus-visible:outline-offset-0 ` +
          "@[40rem]/kit-workspace:grid-cols-[1rem_minmax(0,1fr)_8rem_2.75rem_6.25rem_3.25rem] " +
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
          (open ? "" : "hover:bg-kit-row-hover")
        }
      >
        <FromGlyph row={row} />
        <span className="flex min-w-0 flex-col">
          <span className={`min-w-0 text-kit-dense ${open ? "font-kit-strong text-pretty text-kit-ink" : `truncate ${row.bucket === "sent" ? "text-kit-ink-muted" : "text-kit-ink"}`}`}>
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
        <span className="self-start pt-0.5 text-right font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[40rem]/kit-workspace:self-center @[40rem]/kit-workspace:pt-0">
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
