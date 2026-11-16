"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { Shell } from "../shell"
import { ControlPanel } from "./control-panel"
import { EMPTY_DATA, makeFixtures, readNumbers, type NumbersData, type Period } from "./data"
import { DEFAULT_OPTIONS, LabOptionsContext, type LabOptions } from "./lab-options"
import { GridLayout } from "./layouts/grid"
import { TableLayout } from "./layouts/table"
import type { Against, LayoutProps, Order, Show, TableState } from "./layouts/types"
import { WeeklyLayout } from "./layouts/weekly"
import type { Phase } from "./parts/chrome"
import "../picker.css"
import "./candidates.css"
import "./harness.css"

/**
 * Numbers, "more like a dashboard": three directions on one data shape and
 * one arithmetic (data.ts), at true size in the real app shell.
 * `?v=1..3` picks the direction; `?clean` hides the picker and the panel;
 * `?state=loading|empty|disconnected|thin|failed`; `?data=yours` reads the
 * signed-in account's own rows; `?period=7|30|90`. 1–3 switch directions.
 *
 * Picked (2026-11-16): Dashboard is the page and Table is what it opens.
 * On 1 · Dashboard, `?view=table&post=…&show=…&order=…&against=…` is the
 * Table a tile or a "What worked" row opened; Esc or the crumb goes back.
 * Entering pushes a history entry, so the browser's Back works too.
 */

const SHOWS: Show[] = ["all", "replies", "returning"]
const ORDERS: Order[] = ["newest", "best", "replies"]
const AGAINSTS: Against[] = ["any", "above", "below", "outlier"]

function pick<T extends string>(v: string | null, from: readonly T[], fallback: T): T {
  return v && (from as readonly string[]).includes(v) ? (v as T) : fallback
}

type Nav = { view: "dashboard" | "table"; table: TableState; returnTo: string | null }

function navFrom(sp: URLSearchParams): Nav {
  return {
    view: sp.get("view") === "table" ? "table" : "dashboard",
    table: {
      post: sp.get("post"),
      show: pick(sp.get("show"), SHOWS, "all"),
      order: pick(sp.get("order"), ORDERS, "newest"),
      against: pick(sp.get("against"), AGAINSTS, "any"),
    },
    returnTo: null,
  }
}

function urlWith(nav: Nav, period: string) {
  const url = new URL(location.href)
  for (const k of ["view", "post", "show", "order", "against"]) url.searchParams.delete(k)
  url.searchParams.set("period", period)
  if (nav.view === "table") {
    url.searchParams.set("view", "table")
    if (nav.table.post) url.searchParams.set("post", nav.table.post)
    if (nav.table.show !== "all") url.searchParams.set("show", nav.table.show)
    if (nav.table.order !== "newest") url.searchParams.set("order", nav.table.order)
    if (nav.table.against !== "any") url.searchParams.set("against", nav.table.against)
  }
  return url
}

type Variant = { name: string; bet: string; givesUp: string; View: (p: LayoutProps) => React.ReactNode }

const VARIANTS: Variant[] = [
  {
    name: "Dashboard",
    bet: "The owner's word, as form: a period switch, four tiles you scan in one glance (Depth first: replies, people who came back; then posts and views per post), and a grid of panels: the trend of the tile you picked, who keeps showing up, what worked, what I did. Every number is a sentence against your usual.",
    givesUp: "The house rule against tiles (decisions.md, Never). It is the one direction that reopens it, and the weakest place to read a single post: the best-post rows send you to Table.",
    View: GridLayout,
  },
  {
    name: "Table",
    bet: "Numbers works like Ideas and Drafts: posts as a dense table whose columns are already against your median, and the open post beside it with how it climbed, its three beats and who replied. One pattern across the app; the column heads are the dashboard.",
    givesUp: "The glance. There is no single line that says how the month went; Depth (who keeps showing up) lives inside one post at a time.",
    View: TableLayout,
  },
  {
    name: "Weekly read",
    bet: "Quincy is staff, so the numbers arrive as a note: one week, four short paragraphs in the three-beat voice, the number inline and against your usual, a small chart in the margin beside the line it proves, and a choice at the end.",
    givesUp: "Comparison across periods and any scanning: it reads one week at a time, and a number you want to check is in a sentence, not a column.",
    View: WeeklyLayout,
  },
]

function Picker({ current, select }: { current: number; select: (i: number) => void }) {
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [highlight, setHighlight] = React.useState({ left: 0, width: 0 })
  const [ready, setReady] = React.useState(false)
  const measure = React.useCallback(() => {
    const el = itemRefs.current[current]
    if (el) setHighlight({ left: el.offsetLeft, width: el.offsetWidth })
  }, [current])
  React.useLayoutEffect(() => measure(), [measure])
  React.useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])
  React.useEffect(() => {
    const id = requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)))
    return () => cancelAnimationFrame(id)
  }, [])
  return (
    <nav className="proto-picker" aria-label="Prototype variants" {...(ready ? { "data-ready": "" } : {})}>
      <span className="proto-picker-highlight" aria-hidden="true" style={{ width: highlight.width, transform: `translateX(${highlight.left}px)` }} />
      {VARIANTS.map((v, i) => (
        <button
          key={v.name}
          ref={(el) => {
            itemRefs.current[i] = el
          }}
          className="proto-picker-item"
          onClick={() => select(i)}
          {...(i === current ? { "data-active": "", "aria-current": "true" as const } : {})}
        >
          {`${i + 1} ${v.name}`}
        </button>
      ))}
    </nav>
  )
}

const PHASES: Phase[] = ["live", "loading", "empty", "disconnected", "thin", "failed"]

export function NumbersLab({ real }: { real: NumbersData | null }) {
  const params = useSearchParams()
  const asked = parseInt(params.get("v") ?? "", 10)
  const clean = params.has("clean")
  const [current, setCurrent] = React.useState(asked >= 1 && asked <= VARIANTS.length ? asked - 1 : 0)
  const [opts, setOpts] = React.useState<LabOptions>(DEFAULT_OPTIONS)
  const [phase, setPhase] = React.useState<Phase>(() => {
    const s = params.get("state") as Phase | null
    return s && PHASES.includes(s) ? s : "live"
  })
  const [source, setSource] = React.useState<"fixtures" | "yours">(() => (params.get("data") === "yours" && real ? "yours" : "fixtures"))
  const [period, setPeriod] = React.useState<Period>(() => {
    const p = params.get("period")
    return p === "7" || p === "90" ? p : "30"
  })
  const [nav, setNav] = React.useState<Nav>(() => navFrom(new URLSearchParams(params.toString())))

  const fixtures = React.useMemo(() => makeFixtures(), [])
  const thin = React.useMemo(() => makeFixtures({ historyWeeks: 2 }), [])

  // The real view never borrows a fixture: an account with no posts or no
  // channel shows the empty state, whatever the control says.
  let data: NumbersData = source === "yours" && real ? real : fixtures
  let shown: Phase = phase
  if (source === "yours" && real) {
    if (!real.connected) shown = "disconnected"
    else if (real.posts.length === 0) shown = "empty"
  } else if (phase === "thin") data = thin
  else if (phase === "empty" || phase === "disconnected") data = EMPTY_DATA

  const read = React.useMemo(() => readNumbers(data, period, opts.minWeeks), [data, period, opts.minWeeks])

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    setNav((n) => ({ ...n, view: "dashboard", returnTo: null }))
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    for (const k of ["view", "post", "show", "order", "against"]) url.searchParams.delete(k)
    history.replaceState(null, "", url)
  }, [])

  // The browser's Back and Forward move between Dashboard and Table.
  React.useEffect(() => {
    const onPop = () => setNav((n) => ({ ...navFrom(new URLSearchParams(location.search)), returnTo: n.returnTo }))
    window.addEventListener("popstate", onPop)
    return () => window.removeEventListener("popstate", onPop)
  }, [])

  // The period is in the URL too, so a shared link opens the same slice.
  const navRef = React.useRef(nav)
  React.useLayoutEffect(() => {
    navRef.current = nav
  })
  React.useEffect(() => {
    history.replaceState(history.state, "", urlWith(navRef.current, period))
  }, [period])

  const openTable = React.useCallback(
    (next: Partial<TableState>, returnTo: string) => {
      const to: Nav = {
        view: "table",
        table: { post: null, show: "all", order: "newest", against: "any", ...next },
        returnTo,
      }
      setNav(to)
      history.pushState({ nl: "table" }, "", urlWith(to, period))
    },
    [period],
  )
  const setTable = React.useCallback(
    (table: TableState) => {
      setNav((n) => {
        const to = { ...n, table }
        history.replaceState(history.state, "", urlWith(to, period))
        return to
      })
    },
    [period],
  )
  const back = React.useCallback(() => {
    // Came in by a push: step back, so Forward still returns to the Table.
    if (history.state?.nl === "table") {
      history.back()
      setNav((n) => ({ ...n, view: "dashboard" }))
      return
    }
    setNav((n) => {
      const to: Nav = { ...n, view: "dashboard" }
      history.replaceState(null, "", urlWith(to, period))
      return to
    })
  }, [period])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (t?.closest('[role="menu"], [role="dialog"], [role="alertdialog"], [role="slider"]')) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= VARIANTS.length) select(n - 1)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [select])

  const v = VARIANTS[current]!
  // The pick: on Dashboard (and the weekly read), `view=table` is the Table it opened.
  const handedOff = current !== 1 && nav.view === "table"
  const View = handedOff ? VARIANTS[1]!.View : v.View

  return (
    <div className="nl-lab">
      <LabOptionsContext value={opts}>
        <Shell>
          <div className="flex min-h-0 flex-1 flex-col">
            <View
              key={`${current}-${handedOff ? "table" : "page"}-${source}-${shown === "thin" ? "thin" : "full"}`}
              data={data}
              read={read}
              phase={shown}
              period={period}
              setPeriod={setPeriod}
              openTable={openTable}
              table={nav.table}
              setTable={setTable}
              back={handedOff ? back : undefined}
              returnTo={handedOff ? null : nav.returnTo}
            />
          </div>
        </Shell>
      </LabOptionsContext>
      {clean ? null : (
        <>
          <Picker current={current} select={select} />
          <ControlPanel
            variant={`${current + 1} · ${v.name}`}
            bet={v.bet}
            givesUp={v.givesUp}
            opts={opts}
            setOpts={setOpts}
            phase={phase}
            setPhase={setPhase}
            phases={PHASES}
            source={source}
            setSource={setSource}
            hasReal={real !== null}
            realNotes={real?.notes ?? []}
          />
        </>
      )}
    </div>
  )
}
