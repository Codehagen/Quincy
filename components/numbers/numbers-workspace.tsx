"use client"

import * as React from "react"
import { parseAsString, parseAsStringLiteral, useQueryStates } from "nuqs"

import {
  AGAINSTS,
  DEFAULT_PERIOD,
  MIN_WEEKS,
  ORDERS,
  PERIODS,
  SHOWS,
  freshness,
  readNumbers,
  type NumbersData,
  type Period,
  type TableState,
} from "@/lib/numbers-read"
import { Toolbar, ToolbarTitle, WorkspacePage } from "@/components/kit"

import { NumbersDashboard } from "./numbers-dashboard"
import { EmptyNumbers, NumbersToolbar, ReadingLine, StateLine } from "./numbers-parts"
import { NumbersTable } from "./numbers-table"

/**
 * /numbers (decisions.md, "Never": Numbers is the one dashboard, picked
 * 2026-11-16 from /prototypes/numbers-lab: "Dashboard is the page, and Table
 * is what it opens").
 *
 * The URL holds it: `?period=7|30|90`, and `?view=table&post=…&show=…&order=…&against=…`
 * for the Table a tile or a "What worked" row opened. Entering Table pushes
 * a history entry, so a link opens the same Table and the browser's Back and
 * Forward work. Esc, the crumb or Back return to the Dashboard with focus
 * on what opened Table.
 */

const query = {
  period: parseAsStringLiteral(PERIODS).withDefault(DEFAULT_PERIOD),
  view: parseAsStringLiteral(["table"] as const),
  post: parseAsString,
  show: parseAsStringLiteral(SHOWS).withDefault("all"),
  order: parseAsStringLiteral(ORDERS).withDefault("newest"),
  against: parseAsStringLiteral(AGAINSTS).withDefault("any"),
}

const TABLE_CLEARED = { view: null, post: null, show: null, order: null, against: null } as const

export function NumbersWorkspace({ data }: { data: NumbersData }) {
  const [q, setQ] = useQueryStates(query)
  const period = q.period
  const read = React.useMemo(() => readNumbers(data, period, MIN_WEEKS), [data, period])
  /** Table was entered by a push from here, so going back is a step back in history. */
  const pushed = React.useRef(false)
  const [returnTo, setReturnTo] = React.useState<string | null>(null)

  const setPeriod = React.useCallback((p: Period) => void setQ({ period: p }), [setQ])

  const openTable = React.useCallback(
    (next: Partial<TableState>, from: string) => {
      setReturnTo(from)
      pushed.current = true
      void setQ(
        { view: "table", post: next.post ?? null, show: next.show ?? "all", order: next.order ?? "newest", against: next.against ?? "any" },
        { history: "push" },
      )
    },
    [setQ],
  )
  const setTable = React.useCallback((next: TableState) => void setQ(next), [setQ])
  const back = React.useCallback(() => {
    // Came in by a push: step back, so Forward still returns to the Table.
    if (pushed.current) {
      pushed.current = false
      history.back()
      return
    }
    void setQ(TABLE_CLEARED)
  }, [setQ])

  const nothing = data.posts.length === 0
  const kind = nothing ? (data.connected ? "empty" : "disconnected") : null
  const inTable = q.view === "table" && !nothing

  return (
    <WorkspacePage>
      {kind ? (
        <NumbersToolbar />
      ) : (
        <NumbersToolbar period={period} onPeriodChange={setPeriod} onBack={inTable ? back : undefined}>
          {freshness(data)}
        </NumbersToolbar>
      )}
      {kind ? (
        <EmptyNumbers kind={kind} />
      ) : inTable ? (
        <NumbersTable
          data={data}
          read={read}
          value={{ post: q.post, show: q.show, order: q.order, against: q.against }}
          onValueChange={setTable}
          onPeriodChange={setPeriod}
          onBack={back}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-kit-group px-kit-group py-kit-group">
            <StateLine data={data} enoughHistory={read.enoughHistory} />
            <NumbersDashboard read={read} onOpenTable={openTable} returnTo={returnTo} />
          </div>
        </div>
      )}
    </WorkspacePage>
  )
}

/** The route's Suspense fallback: the frame and one line saying what is happening (states.md). */
export function NumbersReading() {
  return (
    <WorkspacePage>
      <Toolbar label="Numbers" divided>
        <ToolbarTitle>Numbers</ToolbarTitle>
      </Toolbar>
      <div className="mx-auto w-full max-w-7xl px-kit-group py-kit-group">
        <ReadingLine />
      </div>
    </WorkspacePage>
  )
}
