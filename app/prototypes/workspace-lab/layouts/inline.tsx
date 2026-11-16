"use client"

import * as React from "react"

import { FOCUS_RING } from "@/components/kit/control-styles"

import { dayOf, type Row } from "../data"
import { Age, Channels, ShapeTag, SourceGlyph, StatusPill } from "../parts/cells"
import { MarkedUp } from "../parts/marked-up"
import { PanelBody } from "../parts/panel"
import { useWorkspaceKeys, type Workspace } from "../use-workspace"
import { Announcer, FilterBar, Foot, PageBar } from "./header"

/**
 * C · Inline. One column of dense rows, grouped by day; the open row
 * unfolds in place into Marked up, so the list never loses its place and
 * there is no second pane to keep in step. The same page on a phone.
 *
 * Rows are disclosure buttons (aria-expanded), not listbox options: the
 * unfolded part holds buttons of its own, which an option may not.
 */
export function InlineLayout({ ws, keys }: { ws: Workspace; keys: boolean }) {
  const searchRef = React.useRef<HTMLInputElement>(null)
  useWorkspaceKeys(ws, { enabled: keys, searchRef })

  const days = React.useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const day of ["Today", "Yesterday", "Earlier"]) m.set(day, [])
    for (const r of ws.shown) m.get(dayOf(r.riff))!.push(r)
    return [...m.entries()].filter(([, rs]) => rs.length > 0)
  }, [ws.shown])

  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const t = e.target as HTMLElement
    if (!t.matches("[data-ws-row]")) return
    e.preventDefault()
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-ws-row]")]
    const next = all[all.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1)]
    if (next) {
      next.focus()
      ws.select(next.dataset.wsRow ?? null)
    }
  }

  return (
    // data-letter-keys: bare letters here are the workspace's (the theme key stands down).
    <div data-letter-keys className="@container/ws flex h-full min-h-0 flex-col bg-kit-ground">
      <Announcer>
      <PageBar ws={ws} searchRef={searchRef} searchWidth="flex-1 @[40rem]/ws:w-56 @[40rem]/ws:flex-none" divided={false} />
      <FilterBar ws={ws} />
      <PanelBody>
        <div onKeyDown={onListKey} className="mx-auto flex w-full max-w-[60rem] flex-col gap-kit-related px-2 py-kit-related @[40rem]/ws:px-kit-group">
          {ws.shown.length === 0 ? (
            <div className="flex flex-col gap-kit-tight px-3 py-kit-group">
              <p className="font-kit-strong">No ideas match.</p>
              <p className="text-kit-ink-muted">Clear a filter, or search for a word you said.</p>
            </div>
          ) : null}
          {days.map(([day, rows]) => (
            <section key={day} aria-labelledby={`ws-day-${day}`} className="flex flex-col gap-px">
              <h2 id={`ws-day-${day}`} className="ws-meta px-3 pt-kit-related pb-1 font-kit-strong text-kit-ink-muted">
                {day}
              </h2>
              <ul className="flex flex-col gap-px">
                {rows.map((r) => (
                  <InlineRow key={r.id} ws={ws} r={r} />
                ))}
              </ul>
            </section>
          ))}
        </div>
      </PanelBody>
      <Foot ws={ws} />
      </Announcer>
    </div>
  )
}

function InlineRow({ ws, r }: { ws: Workspace; r: Row }) {
  const open = ws.selected?.id === r.id
  const panelId = React.useId()
  const quiet = r.status === "drafted" || r.status === "reading" || r.status === "failed"
  return (
    <li
      data-open={open || undefined}
      className="rounded-kit-control transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out data-open:bg-kit-object data-open:shadow-kit-object motion-reduce:transition-none"
    >
      <button
        type="button"
        data-ws-row={r.id}
        data-ws-fold
        aria-expanded={open}
        aria-controls={panelId}
        onClick={(e) => {
          if (!open) keepInView(e.currentTarget)
          ws.select(open ? null : r.id)
        }}
        className={
          `relative grid w-full grid-cols-[var(--ws-icon)_minmax(0,1fr)_auto] items-center gap-x-3 rounded-kit-control px-3 py-1.5 text-left ${FOCUS_RING} focus-visible:outline-offset-0 ` +
          "@[40rem]/ws:grid-cols-[var(--ws-icon)_minmax(0,1fr)_5.5rem_3.25rem_3rem] " +
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
          // Open, the row is the head of a white object: no hover grey on it.
          (open ? "" : "hover:bg-kit-row-hover")
        }
      >
        <span className="grid place-items-center text-kit-ink-muted">
          <SourceGlyph id={r.riff.sourceId} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            {/* Regular, as the table's titles; the open row alone goes to 560 and ink. */}
            <span className={`ws-row-title min-w-0 ${open ? "font-kit-strong text-pretty text-kit-ink" : `truncate ${quiet ? "text-kit-ink-muted" : ""}`}`}>
              {r.title}
            </span>
            {r.status === "drafted" || r.status === "later" ? <StatusPill status={r.status} /> : null}
          </span>
          {/* On a phone the columns fold into one meta line: the source's
              name (its glyph is already at the row's start) · the shape. */}
          <span className="flex min-w-0 items-center gap-1.5 @[40rem]/ws:hidden">
            <span className="ws-meta min-w-0 truncate text-kit-ink-muted">{r.riff.sourceLabel}</span>
            <span aria-hidden className="ws-meta text-kit-ink-muted">·</span>
            {r.angle ? <ShapeTag>{r.angle.shape}</ShapeTag> : <StatusPill status={r.status} />}
          </span>
        </span>
        <span className="hidden min-w-0 @[40rem]/ws:block">
          {r.angle ? <ShapeTag>{r.angle.shape}</ShapeTag> : <StatusPill status={r.status} />}
        </span>
        <span className="hidden @[40rem]/ws:block">
          <Channels channels={r.channels} />
        </span>
        <span className="self-start pt-0.5 text-right @[40rem]/ws:self-center @[40rem]/ws:pt-0">
          <Age riff={r.riff} />
        </span>
      </button>
      <div className="ws-expand" data-open={open || undefined}>
        <div id={panelId} role="region" aria-label={`Where “${r.title}” came from`} inert={!open}>
          <div className="px-3 pb-3 @[40rem]/ws:pl-[calc(var(--ws-icon)+1.5rem)]">
            <div className="border-t border-kit-hairline">
              {/* Mounted only while open: one detail, one Highlight on the page. */}
              {open ? <MarkedUp ws={ws} row={r} inline /> : null}
            </div>
          </div>
        </div>
      </div>
    </li>
  )
}

/**
 * Opening a row folds the open one. When that one sits above, the tapped
 * row rides up with the collapse, on a phone often out of the screen.
 * So while the fold runs, the row is held where the finger left it (the
 * scroll moves by what the row moved); after it, if the opened part runs
 * past the pane's foot, the row goes to the top (scroll-margin, in
 * candidates.css, leaves a gap). Measured, so it adds nothing where the
 * browser already anchors the scroll.
 */
function keepInView(row: HTMLElement) {
  const pane = row.closest<HTMLElement>("[data-ws-scroll]")
  if (!pane) return
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches
  const top = row.getBoundingClientRect().top
  const until = performance.now() + (reduce ? 50 : 450)
  const hold = () => {
    const moved = row.getBoundingClientRect().top - top
    if (Math.abs(moved) >= 1) pane.scrollTop += moved
    if (performance.now() < until) return requestAnimationFrame(hold)
    const region = row.parentElement?.getBoundingClientRect()
    if (region && region.bottom > pane.getBoundingClientRect().bottom) {
      row.scrollIntoView({ block: "start", behavior: reduce ? "auto" : "smooth" })
    }
  }
  requestAnimationFrame(hold)
}
