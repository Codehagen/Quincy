"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { Shell } from "../shell"
import { ControlPanel } from "./control-panel"
import { SCENARIOS, type Scenario } from "./data"
import { DEFAULT_OPTIONS, type LabOptions } from "./lab-options"
import { GridLayout } from "./layouts/grid"
import { TableLayout } from "./layouts/table"
import { useConnectors, type ConnectorsStore } from "./use-connectors"
import "../picker.css"
import "./candidates.css"

/**
 * Connectors: Sources and Channels as one page, after the owner's reference
 * ("jeg ønsker den slik som denne siden"). Two directions on one local
 * store, at true size in the real app shell. `?v=1|2` picks the direction;
 * `?state=today|all|first-run|failed|reauth|loading` the account; `?clean`
 * hides the picker and the panel (for screenshots); `?cols=2|3|4`. 1–2
 * switch directions. DECISION.md is the record; the owner fills in Picked.
 */

type Variant = {
  name: string
  bet: string
  givesUp: string
  View: (p: { store: ConnectorsStore; opts: LabOptions }) => React.ReactNode
}

const VARIANTS: Variant[] = [
  {
    name: "Grid",
    bet: "The reference, translated: a card per connector in a grid, the state at the top right, what it hands over in a recess, one real number when connected, and the switch in the foot. Sources and Channels on one page, split by tabs.",
    givesUp: "Density and scanning: 24 cards is three screens at 1440, and a column of states is not a column. The sheet holds the detail, so a second look is a click.",
    View: GridLayout,
  },
  {
    name: "Table",
    bet: "The house pattern (Ideas, Drafts): a dense list grouped by what it needs from you, the open connector beside it with every verb. j k walk it.",
    givesUp: "The reference's look, and the room for two lines of description per connector. Under 900px of workspace it folds into Grid.",
    View: TableLayout,
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

export function ConnectorsLab() {
  const params = useSearchParams()
  const asked = parseInt(params.get("v") ?? "", 10)
  const clean = params.has("clean")
  const [current, setCurrent] = React.useState(asked >= 1 && asked <= VARIANTS.length ? asked - 1 : 0)
  const [opts, setOpts] = React.useState<LabOptions>(() => {
    const cols = parseInt(params.get("cols") ?? "", 10)
    return { ...DEFAULT_OPTIONS, cols: cols === 2 || cols === 4 ? cols : DEFAULT_OPTIONS.cols }
  })
  const [scenario, setScenario] = React.useState<Scenario>(() => {
    const s = params.get("state") as Scenario | null
    return s && SCENARIOS.includes(s) ? s : "today"
  })
  const store = useConnectors(scenario)

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  // The picker's keys: 1–2. The surfaces' own keys are in each layout.
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
    <div className="cl-lab">
      <Shell>
        <div className="flex min-h-0 flex-1 flex-col">
          <View key={current} store={store} opts={opts} />
        </div>
      </Shell>
      {clean ? null : (
        <>
          <Picker current={current} select={select} />
          <ControlPanel
            variant={`${current + 1} · ${v.name}`}
            bet={v.bet}
            givesUp={v.givesUp}
            opts={opts}
            setOpts={setOpts}
            scenario={scenario}
            setScenario={setScenario}
            onReset={store.reset}
          />
        </>
      )}
    </div>
  )
}
