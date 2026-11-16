"use client"

import * as React from "react"
import { Listbox, ListboxGroup, ListboxGroupLabel, ListboxItem } from "@ui-sdk/react/listbox"

import type { Riff } from "@/lib/riffs"
import { FOCUS_RING } from "@/components/kit/control-styles"
import { riffTitle } from "@/components/quincy"

import { LAB_RIFFS, dayOf } from "../data"
import type { Workspace } from "../use-workspace"
import { SourceGlyph, StatusPill } from "./cells"

/**
 * CANDIDATES — SourceRail and SourceItem: what Quincy read, newest first,
 * grouped by day, each with where it stands (reading, failed, how many ideas
 * still open). Picking one narrows the ideas to it; "Everything" is the
 * whole queue. ui-sdk Listbox, as IdeaTable.
 */

const ITEM =
  `relative mx-2 flex cursor-default items-center gap-2.5 rounded-kit-control-inner px-2.5 py-1.5 text-kit-ink select-none ${FOCUS_RING} focus-visible:outline-offset-0 ` +
  "transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none hover:not-data-selected:bg-kit-row-hover"

export function SourceRail({ ws }: { ws: Workspace }) {
  const open = (riff: Riff) => ws.rows.filter((r) => r.riff.id === riff.id && r.status === "waiting").length
  const days = React.useMemo(() => {
    const m = new Map<string, Riff[]>()
    for (const day of ["Today", "Yesterday", "Earlier"]) m.set(day, [])
    for (const r of LAB_RIFFS) m.get(dayOf(r))!.push(r)
    return [...m.entries()].filter(([, rs]) => rs.length > 0)
  }, [])
  const total = ws.rows.filter((r) => r.status === "waiting").length

  return (
    <Listbox
      aria-label="What Quincy read"
      value={ws.filters.riff}
      onValueChange={(v) => {
        if (v) ws.setFilter("riff", v)
      }}
      className="flex flex-col gap-px py-1.5 outline-none"
    >
      <ListboxItem value="all" label="Everything" data-ws-row="all" className={ITEM}>
        <span className="ws-row-title min-w-0 flex-1 truncate font-kit-strong">Everything</span>
        <span className="font-kit-mono text-kit-mono text-kit-ink-muted tabular-nums">{total}</span>
      </ListboxItem>
      {days.map(([day, riffs]) => (
        <ListboxGroup key={day} className="flex flex-col gap-px">
          <ListboxGroupLabel className="ws-meta mx-2 px-2.5 pt-3 pb-1 font-kit-strong text-kit-ink-muted">{day}</ListboxGroupLabel>
          {riffs.map((riff) => (
            <SourceItem key={riff.id} riff={riff} open={open(riff)} />
          ))}
        </ListboxGroup>
      ))}
    </Listbox>
  )
}

export function SourceItem({ riff, open }: { riff: Riff; open: number }) {
  const status = riff.state === "working" ? "reading" : riff.state === "failed" ? "failed" : null
  return (
    <ListboxItem value={riff.id} label={riffTitle(riff)} data-ws-row={riff.id} className={ITEM}>
      <span className="grid size-7 shrink-0 place-items-center rounded-kit-control-inner bg-kit-well text-kit-ink-muted">
        <SourceGlyph id={riff.sourceId} />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className={`ws-meta truncate ${status ? "text-kit-ink-muted" : "font-kit-strong text-kit-ink"}`}>
          {riffTitle(riff)}
        </span>
        <span className="ws-meta truncate text-kit-ink-muted">{riff.sourceLabel}</span>
      </span>
      <span className="shrink-0">
        {status ? (
          <StatusPill status={status} withWord={false} />
        ) : open > 0 ? (
          <span className="font-kit-mono text-kit-mono text-kit-ink tabular-nums">
            {open}
            <span className="sr-only"> open</span>
          </span>
        ) : (
          <StatusPill status="drafted" withWord={false} />
        )}
      </span>
    </ListboxItem>
  )
}
