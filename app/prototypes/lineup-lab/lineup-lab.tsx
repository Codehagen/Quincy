"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { Shell } from "../shell"
import { ControlPanel } from "./control-panel"
import type { Scenario } from "./data"
import { DEFAULT_OPTIONS, LabOptionsContext, type LabOptions } from "./lab-options"
import { BoardLayout } from "./layouts/board"
import { FeedLayout } from "./layouts/feed"
import { TableLayout } from "./layouts/table"
import { useLineup, type LineupStore, type Phase } from "./use-lineup"
import "../picker.css"
import "../drafts-lab/candidates.css"
import "./candidates.css"
import "./harness.css"

/**
 * Lineup as a working surface: three layouts on one local store, at true
 * size in the real app shell. `?v=1..3` picks the layout; `?clean` hides
 * the picker and the control panel (for screenshots); `?week=real|full|
 * first-run` picks the week; `?state=loading`. 1–3 switch layouts.
 * DECISION.md is the record; the owner fills in Picked.
 *
 * The feed parts and their platform styles are Drafts' (drafts-lab
 * parts/feed, candidates.css), imported, not copied: delete the two labs
 * together, or move those parts first.
 */

type Variant = {
  name: string
  bet: string
  givesUp: string
  View: (p: { store: LineupStore; opts: LabOptions }) => React.ReactNode
}

const VARIANTS: Variant[] = [
  {
    name: "Table",
    bet: "Lineup works like Ideas and Drafts: the week as a dense list in time order, grouped by day, open slots as rows where they fall, the approved posts with no time on top, and the open post drawn as the feed will show it beside the list.",
    givesUp: "The shape of the week at a glance: a gap is a row you read, not a hole you see. Under ~1000px of workspace it folds into Feed.",
    View: TableLayout,
  },
  {
    name: "Board",
    bet: "The rhythm as a grid: days across, the times you publish down, every cell a slot or nothing. Gaps and doubled days are visible before you read a word; ⇧H / ⇧L or a drag moves a post a day.",
    givesUp: "Reading: a cell holds two lines of the opening. It is the calendar vision.md warns about, kept to the rows you chose. Under ~1100px it folds into Feed.",
    View: BoardLayout,
  },
  {
    name: "Feed",
    bet: "What your followers will see: one platform's column at true size, the week's posts in order, the open slots and quiet days drawn where they fall, now between what went and what is coming. The time on a rail, Quincy's notes in the margin.",
    givesUp: "Density: a post is a post's height, so a week of five is three screens. One platform at a time. It is also the phone layout for all three.",
    View: FeedLayout,
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

const SCENARIOS: Scenario[] = ["fixtures", "real", "full", "first-run"]

export function LineupLab() {
  const params = useSearchParams()
  const asked = parseInt(params.get("v") ?? "", 10)
  const clean = params.has("clean")
  const [current, setCurrent] = React.useState(asked >= 1 && asked <= VARIANTS.length ? asked - 1 : 0)
  const [opts, setOpts] = React.useState<LabOptions>(() => ({ ...DEFAULT_OPTIONS, order: params.get("order") === "profile" ? "profile" : "forward" }))
  const [phase, setPhase] = React.useState<Phase>(() => (params.get("state") === "loading" ? "loading" : "live"))
  const [scenario, setScenario] = React.useState<Scenario>(() => {
    const w = params.get("week") as Scenario | null
    return w && SCENARIOS.includes(w) ? w : "fixtures"
  })
  const store = useLineup({ scenario, phase })

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  // The picker's keys: 1–3. The surface's own keys are in parts/keys.ts.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (t?.closest('[role="menu"], [role="dialog"], [role="alertdialog"]')) return
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
    <div className="ll-lab">
      <LabOptionsContext value={opts}>
        <Shell>
          <div className="flex min-h-0 flex-1 flex-col">
            <View key={current} store={store} opts={opts} />
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
            scenario={scenario}
            setScenario={setScenario}
            onReset={store.reset}
          />
        </>
      )}
    </div>
  )
}
