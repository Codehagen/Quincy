"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { Shell } from "../shell"
import { ControlPanel } from "./control-panel"
import { EMPTY_DATA, makeFixtures, readNumbers, type NumbersData, type Period } from "./data"
import { DEFAULT_OPTIONS, LabOptionsContext, type LabOptions } from "./lab-options"
import { GridLayout } from "./layouts/grid"
import { TableLayout } from "./layouts/table"
import type { LayoutProps } from "./layouts/types"
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
 */

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
  const [initialPost, setInitialPost] = React.useState<string | null>(null)

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
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  const openPost = React.useCallback(
    (id: string) => {
      setInitialPost(id)
      select(1)
    },
    [select],
  )

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
  const View = v.View

  return (
    <div className="nl-lab">
      <LabOptionsContext value={opts}>
        <Shell>
          <div className="flex min-h-0 flex-1 flex-col">
            <View
              key={`${current}-${source}-${shown === "thin" ? "thin" : "full"}`}
              data={data}
              read={read}
              phase={shown}
              period={period}
              setPeriod={setPeriod}
              openPost={openPost}
              initialPost={initialPost}
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
