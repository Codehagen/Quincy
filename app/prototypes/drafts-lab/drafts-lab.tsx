"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { Shell } from "../shell"
import { ControlPanel } from "./control-panel"
import { DEFAULT_OPTIONS, LabOptionsContext, type LabOptions } from "./lab-options"
import { DeskLayout } from "./layouts/desk"
import { LineupLayout } from "./layouts/lineup"
import { PostEditorLayout, PostFeedLayout, PostStageLayout } from "./layouts/post-layouts"
import { TableLayout } from "./layouts/table"
import { useDrafts, type DraftsStore, type Phase } from "./use-drafts"
import "../picker.css"
import "./candidates.css"
import "./harness.css"

/**
 * Drafts as a working surface: three layouts on one local store, at true
 * size in the real app shell. `?v=1..3` picks the layout; `?clean` hides the
 * picker and the control panel (for screenshots); `?marks=plain` starts with
 * the missing-beat note off. 1–3 switch layouts.
 * DECISION.md is the record; the owner fills in Picked.
 */

type Variant = {
  name: string
  bet: string
  givesUp: string
  View: (p: { store: DraftsStore; opts: LabOptions }) => React.ReactNode
}

const VARIANTS: Variant[] = [
  {
    name: "Table",
    bet: "Drafts works like Ideas: a dense table you scan by where it came from, what happens next and age, with the open draft marked up beside its row. One pattern across the two queues.",
    givesUp: "Reading room. The pane is a share of the screen, so at 1280 the beat brackets fall under the lines; under ~1050px of workspace it folds into Lineup.",
    View: TableLayout,
  },
  {
    name: "Desk",
    bet: "A draft is read, not scanned: one at a time, large, the beats in a wide margin, A to approve and the next is there. 109 waiting is worked through like a proof pile.",
    givesUp: "The overview. No columns; you see where you are (4 of 27) and the next four openings, not the whole queue. Filtering by column is a menu, not a glance.",
    View: DeskLayout,
  },
  {
    name: "Lineup",
    bet: "What happens next is the axis: waiting, didn't go, approved with no time, going out by day, sent. Stranded posts are a group you can see, and the draft opens where it stands.",
    givesUp: "Side-by-side reading: an open draft pushes the rest down. With today's data (109 waiting, 0 scheduled) it is one long group and four small ones.",
    View: LineupLayout,
  },
  // Round 2 (owner, 2026-11-16: "Men posten står jo ikke på høyre side"): Table's left, the post on the right.
  {
    name: "A · Post",
    bet: "The post is the editor, as a composer works: what you edit looks like the post, the fold is drawn inside it, and Quincy's marks stand outside it in the margin. One object per channel; a thread is stacked posts.",
    givesUp: "True feed width at 1440: the list keeps 580, so the post is about 450 wide with the marks beside it. At 1280 the marks fall under the lines.",
    View: PostEditorLayout,
  },
  {
    name: "B · Stage",
    bet: "The post as a picture of itself: centred on a grey recess, like the showcase, with the marks in the stage margin. The idea and the saved sentence sit above as a strip.",
    givesUp: "Room: the recess eats 64px of a pane that is already narrower than the feed. True width (598 + marks) needs a ~840px pane, which leaves the list a 100px title column at 1440.",
    View: PostStageLayout,
  },
  {
    name: "C · Feed",
    bet: "Picked. The post as it reads in the real feed: X's 598 column or LinkedIn's card, their type, colours and action rows (no counts), between two skeleton posts, edited in place. Quincy's marks and the verbs stay outside, in the kit.",
    givesUp: "List width: the pane is the whole 598 column plus the margin (798), so the list keeps Opening line, a marks cell and Age at 1440, and 1280 folds into Lineup.",
    View: PostFeedLayout,
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

export function DraftsLab() {
  const params = useSearchParams()
  const asked = parseInt(params.get("v") ?? "", 10)
  const clean = params.has("clean")
  const [current, setCurrent] = React.useState(asked >= 1 && asked <= VARIANTS.length ? asked - 1 : 0)
  const [opts, setOpts] = React.useState<LabOptions>(() => ({ ...DEFAULT_OPTIONS, marks: params.get("marks") === "plain" ? "plain" : "note" }))
  const [phase, setPhase] = React.useState<Phase>(() => (params.get("state") as Phase | null) ?? "live")
  const [depth, setDepth] = React.useState<"fixtures" | "real">(() => (params.get("queue") === "real" ? "real" : "fixtures"))
  const store = useDrafts({ phase, depth })

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  // The picker's keys: 1–3. The surface's own keys (j k A E U /) are in parts/keys.ts.
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
    <div className="dl-lab">
      <LabOptionsContext value={opts}>
        <Shell>
          <div className="flex min-h-0 flex-1 flex-col" data-desk-type={opts.deskType}>
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
            depth={depth}
            setDepth={setDepth}
            onReset={store.reset}
          />
        </>
      )}
    </div>
  )
}
