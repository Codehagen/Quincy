"use client"

/*
 * Built on ui-sdk (@ui-sdk/react/listbox), not Base UI: Base UI has a
 * listbox only inside a popup (Select, Combobox), not an always-visible one.
 * ui-sdk gives the WAI-ARIA listbox pattern: one tab stop, Up/Down,
 * Home/End, typeahead on each option's label, selection following focus.
 * Nothing in this file uses Base UI; an empty state's action is passed in
 * by the page.
 */

import * as React from "react"
import { Listbox, ListboxGroup, ListboxGroupLabel, ListboxItem } from "@ui-sdk/react/listbox"

import { FOCUS_RING, SELECTION_BAR } from "./control-styles"
import { EmptyRegion } from "./empty-state"

/**
 * DataList: a dense, keyboard-first list with columns, for a workspace
 * (docs/design/workspace.md). One row per item, 36px (44 on touch), a
 * sticky 32px band of column heads, the open row in the selected grey with
 * a 3px ink bar and its title at 560.
 *
 * A listbox, not a grid: a row is one choice (open this item), it holds no
 * control of its own, and its verbs live in the detail pane, as ListRow's
 * do. So the column heads are a visual row, hidden from assistive tech, and
 * each option's cells read in order as one sentence. A cell that is only a
 * glyph says its words in an `sr-only` span.
 *
 * Keys: the list answers ↑ ↓ Home End and typeahead itself. Letter keys
 * that act on the open row (j k, D, N…) belong to the PAGE, heard on the
 * document in the capture phase with preventDefault + stopPropagation, so
 * the typeahead does not take N as the first letter of a title and the
 * theme key does not take D; the page's root carries `data-letter-keys`.
 * DataList exposes what that handler needs: `data-kit-row="<key>"` on each
 * row (`DATA_LIST_ROW`), `revealDataListRow` to follow a j/k move with
 * focus and scroll, and `aria-keyshortcuts` on the list.
 */

export type DataListColumn<T> = {
  /** Stable id, for React keys. */
  id: string
  /** The column head ("Idea", "Age"). `""` for a glyph column. */
  header: string
  /** The grid track: `"1rem"`, `"minmax(0,1fr)"`, `"5.5rem"`. Exactly one column should be the `minmax(0,1fr)` that gives. */
  width: string
  cell: (item: T) => React.ReactNode
  /** `end` for numbers and ages, so a column of them stacks. */
  align?: "start" | "end"
  /**
   * Only once the list itself is 46rem wide (`kit-data-wide`); under that
   * the column and its head drop out. For a column the row can lose (Source
   * when the glyph column already shows it).
   */
  wide?: boolean
  /** What the loading row draws here: a glyph square, a long varied bar, or a short bar (default). */
  skeleton?: "glyph" | "title" | "short"
}

export type DataListGroup<T> = {
  key: string
  /** What the eye reads over the group: a SourceMark, a count, an age. Hidden from assistive tech. */
  label: React.ReactNode
  /** The group's name, said once as a sentence ("3 ideas from GitHub"). */
  name: string
  items: readonly T[]
}

export type DataListStatus = "ready" | "loading"

export type DataListProps<T> = {
  /** The list's name ("Ideas"). */
  label: string
  /** The rows, flat. Pass `groups` instead to section them. */
  items?: readonly T[]
  /** The rows in named sections (grouped by source, by day). */
  groups?: readonly DataListGroup<T>[]
  getKey: (item: T) => string
  /** The row's text for typeahead: its title. */
  getLabel: (item: T) => string
  /** The open row's key, or null. A key not in the list is treated as null. */
  value: string | null
  onValueChange: (key: string) => void
  /** Columns: each a head and a cell. Or `renderRow` + `template`. */
  columns?: readonly DataListColumn<T>[]
  /** The row's cells, by hand, laid into `template`. For a two-line list with no head. */
  renderRow?: (item: T) => React.ReactNode
  /** The grid track list for `renderRow` (default `"minmax(0,1fr) auto"`). */
  template?: string
  /** Show the column head band. Default: on with `columns`. */
  head?: boolean
  /** `loading`: eight static skeleton rows on the same grid and height, and the status said once. */
  status?: DataListStatus
  /** What the persistent status says while loading ("Loading ideas"). */
  loadingLabel?: string
  /**
   * What shows under the head when there are no rows: a DataListEmpty, or
   * an EmptyState with `frame="none"`. The list centres it in the space
   * under the heads, so pass it bare, with no padding of its own.
   */
  empty?: React.ReactNode
  /** The keys the page binds while the list is in view ("j k"). Announced on the list. */
  "aria-keyshortcuts"?: string
}

/** The selector for every DataList row. Each row also carries its key: `[data-kit-row="<key>"]`. */
export const DATA_LIST_ROW = "[data-kit-row]"

/**
 * After an empty state's action brought the rows back (Clear filters): the
 * button that held focus is gone, so focus has fallen to the body. Put it
 * on the open row if one is still shown, else on the first row, so the
 * keyboard lands on the list it just restored and j/k and the arrows go on
 * from there. Runs on the next frame, after React has drawn the rows; does
 * nothing if focus already went somewhere on purpose.
 */
export function focusRestoredDataList(scope: ParentNode = document) {
  requestAnimationFrame(() => {
    const active = document.activeElement
    if (active != null && active !== document.body) return
    const el =
      scope.querySelector<HTMLElement>(`${DATA_LIST_ROW}[data-selected]`) ??
      scope.querySelector<HTMLElement>(DATA_LIST_ROW)
    if (!el) return
    el.focus({ preventScroll: true })
    el.scrollIntoView({ block: "nearest" })
  })
}

/**
 * After the page moved the selection by key (j/k), or after an action took
 * the open row away (drafted, set aside): keep the new row in view, and
 * follow it with focus when focus is already on a row, so arrow keys and
 * j/k agree about where you are. Runs on the next frame, after React has
 * drawn the new selection.
 *
 * `recover`: also focus the row when focus has fallen to the body, which
 * it does when the action removed the focused row or the button pressed.
 * Pass it after an action, never after a plain move.
 */
export function revealDataListRow(key: string, scope: ParentNode = document, { recover = false }: { recover?: boolean } = {}) {
  requestAnimationFrame(() => {
    const el = scope.querySelector<HTMLElement>(`[data-kit-row="${CSS.escape(key)}"]`)
    if (!el) return
    const active = document.activeElement
    const lost = active == null || active === document.body
    if (active?.closest(DATA_LIST_ROW) || (recover && lost)) el.focus({ preventScroll: true })
    el.scrollIntoView({ block: "nearest" })
  })
}

// The row's grid comes from two custom properties set on the list, so one
// container query swaps the narrow and the wide track lists.
const GRID =
  "grid grid-cols-(--kit-data-list-cols) @kit-data-wide/kit-data-list:grid-cols-(--kit-data-list-cols-wide) items-center gap-x-3"

const ROW =
  `relative mx-2 ${GRID} min-h-kit-row-dense cursor-default rounded-kit-control-inner px-3 py-1.5 text-kit-dense text-kit-ink select-none pointer-coarse:min-h-11 ` +
  `${FOCUS_RING} focus-visible:outline-offset-0 ` +
  "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
  // `data-[selected]`, not `data-selected:`: shadcn's tailwind.css makes the
  // latter `[data-selected="true"]`, and the listbox writes `data-selected=""`
  // (as calendar-month.tsx notes), so the selected row never painted.
  // Hover is a lighter step than selected in both themes (colour.md); a
  // press is one step past hover, with no scale: a full-width row that
  // shrinks reads as the list moving.
  "hover:not-data-[selected]:bg-kit-row-hover active:not-data-[selected]:bg-kit-selected data-[selected]:bg-kit-selected " +
  SELECTION_BAR

const WIDE = "hidden @kit-data-wide/kit-data-list:flex"

// Varied, so the bars read as text of different lengths, not as a grid.
const LOADING_TITLES = ["62%", "48%", "71%", "55%", "38%", "66%", "52%", "44%"] as const

function tracks<T>(columns: readonly DataListColumn<T>[] | undefined, template: string) {
  if (!columns) return { narrow: template, wide: template }
  return {
    narrow: columns.filter((c) => !c.wide).map((c) => c.width).join(" "),
    wide: columns.map((c) => c.width).join(" "),
  }
}

export function DataList<T>({
  label,
  items,
  groups,
  getKey,
  getLabel,
  value,
  onValueChange,
  columns,
  renderRow,
  template = "minmax(0,1fr) auto",
  head = columns != null,
  status = "ready",
  loadingLabel = "Loading",
  empty,
  "aria-keyshortcuts": keyshortcuts,
}: DataListProps<T>) {
  const all = React.useMemo(() => (groups ? groups.flatMap((g) => g.items) : (items ?? [])), [groups, items])
  const selected = value != null && all.some((item) => getKey(item) === value) ? value : null
  const t = tracks(columns, template)
  const loading = status === "loading"

  const row = (item: T) => {
    const key = getKey(item)
    return (
      <ListboxItem
        key={key}
        value={key}
        label={getLabel(item)}
        data-kit-row={key}
        className={`${ROW} ${head ? "scroll-mt-kit-head-clear" : "scroll-mt-2"} scroll-mb-2`}
      >
        {columns
          ? columns.map((c) => (
              <span
                key={c.id}
                className={`min-w-0 items-center ${c.wide ? WIDE : "flex"} ${c.align === "end" ? "justify-end text-right" : ""}`}
              >
                {c.cell(item)}
              </span>
            ))
          : renderRow?.(item)}
      </ListboxItem>
    )
  }

  return (
    <div
      data-slot="kit-data-list"
      // min-h-full: the list fills its pane, so an empty state can stand in
      // the middle of the space under the heads.
      className="@container/kit-data-list flex min-h-full flex-col"
      style={{ "--kit-data-list-cols": t.narrow, "--kit-data-list-cols-wide": t.wide } as React.CSSProperties}
    >
      {head && columns ? <DataListHead columns={columns} /> : null}
      {/* One persistent status, so "Loading" is read when it starts and
          not lost to a node that mounts with its text already in it. */}
      <span role="status" className="sr-only">
        {loading ? loadingLabel : ""}
      </span>
      {loading ? (
        <DataListLoading columns={columns} />
      ) : all.length === 0 ? (
        empty != null ? <EmptyRegion>{empty}</EmptyRegion> : null
      ) : (
        <Listbox<string>
          aria-label={label}
          aria-keyshortcuts={keyshortcuts}
          value={selected}
          onValueChange={(v) => {
            if (v) onValueChange(v)
          }}
          className="flex flex-col gap-px py-1.5 outline-none"
        >
          {groups
            ? groups.map((g) => (
                <ListboxGroup key={g.key} className="flex flex-col gap-px pb-2">
                  {/* Named once, as a sentence: the source and age beside it
                      are for the eye, and read aloud would say it twice. */}
                  <ListboxGroupLabel
                    aria-label={g.name}
                    className="mx-2 flex items-center gap-2 px-3 pt-3 pb-1.5 text-kit-meta text-kit-ink-muted tabular-nums"
                  >
                    <span aria-hidden className="flex min-w-0 flex-1 items-center gap-2">
                      {g.label}
                    </span>
                  </ListboxGroupLabel>
                  {g.items.map(row)}
                </ListboxGroup>
              ))
            : all.map(row)}
        </Listbox>
      )}
    </div>
  )
}

/**
 * The column heads: a 32px band (`kit-head`) with a full-bleed hairline,
 * the same height as a PanelHeader, so one line runs across every pane.
 * Labels sit on the rows' content edge (8 inset + 12 padding = 20).
 */
function DataListHead<T>({ columns }: { columns: readonly DataListColumn<T>[] }) {
  return (
    <div
      aria-hidden
      data-slot="kit-data-list-head"
      className={`sticky top-0 z-[1] h-kit-head ${GRID} border-b border-kit-hairline bg-kit-ground px-kit-group`}
    >
      {columns.map((c) => (
        <span
          key={c.id}
          className={`min-w-0 truncate text-kit-meta font-kit-strong text-kit-ink-muted ${c.wide ? "hidden @kit-data-wide/kit-data-list:block" : "block"} ${c.align === "end" ? "text-right" : ""}`}
        >
          {c.header}
        </span>
      ))}
    </div>
  )
}

/**
 * The rows' shape while they load: same grid, same height, same inset, so
 * nothing moves when the rows arrive. Static (no shimmer), so it needs no
 * reduced-motion path.
 */
function DataListLoading<T>({ columns }: { columns?: readonly DataListColumn<T>[] }) {
  return (
    <div aria-hidden data-slot="kit-data-list-loading" className="flex flex-col gap-px py-1.5">
      {LOADING_TITLES.map((w, i) => (
        <div key={i} className={`mx-2 ${GRID} min-h-kit-row-dense px-3 pointer-coarse:min-h-11`}>
          {columns ? (
            columns.map((c) => (
              <span key={c.id} className={`min-w-0 items-center ${c.wide ? WIDE : "flex"} ${c.align === "end" ? "justify-end" : ""}`}>
                {c.skeleton === "glyph" ? (
                  <span className="size-4 rounded-kit-chip bg-kit-skeleton" />
                ) : (
                  <span
                    className={`h-kit-skeleton rounded-full bg-kit-skeleton ${c.skeleton === "title" ? "" : "w-8"}`}
                    style={c.skeleton === "title" ? { width: w } : undefined}
                  />
                )}
              </span>
            ))
          ) : (
            <>
              <span className="h-kit-skeleton rounded-full bg-kit-skeleton" style={{ width: w }} />
              <span className="ms-auto h-kit-skeleton w-7 rounded-full bg-kit-skeleton" />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

export type DataListTitleProps = {
  children: string
  /** `1` (default) truncates; `2` wraps and clamps, for a two-line list. */
  lines?: 1 | 2
  /** Muted, for a row that is done or not actionable (drafted, failed). The open row is always ink. */
  quiet?: boolean
}

/**
 * The row's title: 13/19 at 460, and at 560 in ink on the open row only.
 * Twenty titles at 560 is a wall, and weight is the one cue a selected row
 * has that does not depend on a 1.1:1 grey.
 *
 * When the title is cut and the row is not the open one, the full title
 * shows as the native hint, measured on the way in, so a title that fits
 * never carries a hint that repeats it. The option's label stays its
 * accessible name; the hint is a pointer convenience.
 */
export function DataListTitle({ children, lines = 1, quiet = false }: DataListTitleProps) {
  return (
    <span
      data-slot="kit-data-list-title"
      onPointerEnter={fullTitleIfCut}
      className={
        `min-w-0 text-kit-dense ${lines === 1 ? "truncate" : "line-clamp-2 text-pretty"} ${quiet ? "text-kit-ink-muted" : "text-kit-ink"} ` +
        "in-data-[selected]:font-kit-strong in-data-[selected]:text-kit-ink"
      }
    >
      {children}
    </span>
  )
}

function fullTitleIfCut(e: React.PointerEvent<HTMLSpanElement>) {
  const el = e.currentTarget
  const open = el.closest("[data-selected]") !== null
  const cut = el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1
  if (cut && !open) el.title = el.textContent ?? ""
  else el.removeAttribute("title")
}

/** Muted meta text in a cell (a source name, a shape): 12/16, one line. */
export function DataListMeta({ children }: { children: React.ReactNode }) {
  return <span className="min-w-0 truncate text-kit-meta text-kit-ink-muted tabular-nums">{children}</span>
}

/** An age or a count in a cell: mono 11, tabular, so a column of them stacks. */
export function DataListMono({ children }: { children: React.ReactNode }) {
  return <span className="font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums">{children}</span>
}

export type DataListEmptyProps = {
  /** One sentence, ending in a stop: "No ideas match." */
  title: string
  /** What to do about it, one or two sentences. */
  children?: React.ReactNode
  /** A quiet `Button size="xs"`: "Clear filters". */
  action?: React.ReactNode
}

/**
 * The empty list: under the column heads (they stay), centred in the space
 * below them (DataList stands it in an EmptyRegion), 13/560 then 13 muted,
 * and one quiet 28px action. Say why it is empty and the way out; when a
 * filter emptied it, the action clears the filters and then calls
 * `focusRestoredDataList`, so focus lands on the rows it brought back.
 */
export function DataListEmpty({ title, children, action }: DataListEmptyProps) {
  return (
    <div data-slot="kit-data-list-empty" className="flex flex-col items-center gap-kit-related text-center">
      <div className="flex max-w-kit-empty flex-col gap-kit-tight text-balance">
        <p className="text-kit-dense font-kit-strong text-kit-ink">{title}</p>
        {children != null ? <p className="text-kit-dense text-kit-ink-muted">{children}</p> : null}
      </div>
      {action}
    </div>
  )
}
