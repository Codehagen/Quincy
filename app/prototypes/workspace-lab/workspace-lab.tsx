"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import { KitRoot, Mono, Text, TextLink } from "@/components/kit"
import { IdeasPicture } from "@/components/showcase/demos/ideas-picture"

import { DesktopFrame, PhoneFrame } from "../ideas-lab/frames"
import { Shell } from "../shell"
import { AUDIT } from "./audit"
import { ControlPanel, DEFAULT_ATTRS } from "./control-panel"
import { InlineLayout } from "./layouts/inline"
import { TableLayout } from "./layouts/table"
import { ThreePaneLayout } from "./layouts/three-pane"
import { useWorkspace, type Workspace } from "./use-workspace"
import "../picker.css"
import "./candidates.css"
import "./harness.css"

/**
 * Owner, 2026-11-16: "I like Marked up. But the actual components on the
 * page look very cheap. I want Ideas to look more like a dashboard."
 *
 * Read as a working surface, not a metrics wall (docs/vision.md rules the
 * second out): three page setups for Ideas, each built from upgraded
 * candidate components (parts/), each with Marked up as the open idea. One
 * store for all three, so a Draft in one shows in the next.
 *
 * `?v=1..3` picks the layout; `?bare` shows it at true size in the real app
 * shell instead of in a scaled window.
 */

type Variant = {
  name: string
  axis: string
  bet: string
  givesUp: string
  View: (p: { ws: Workspace; keys: boolean }) => React.ReactNode
}

const VARIANTS: Variant[] = [
  {
    name: "Table",
    axis: "toolbar + dense table + fixed detail panel",
    bet: "Ideas is a queue you work through: columns you can read down, filters with counts, keys, and the open idea Marked up beside the row.",
    givesUp: "The source as a unit: three ideas from one merge are three rows (the Layers view groups them back). At 1280 the table drops its Source column; under about 1050px of workspace it folds into Inline.",
    View: TableLayout,
  },
  {
    name: "Three panes",
    axis: "sources rail + idea list + wide Marked-up detail",
    bet: "What Quincy read is the way in: pick a source, see its ideas, read them marked up at full measure. Reading and failed sources live in the rail with their state.",
    givesUp: "Columns: the middle list is two lines per idea. Three panes need about 1200px; under it the rail must fold away.",
    View: ThreePaneLayout,
  },
  {
    name: "Inline",
    axis: "one column of dense rows that unfold in place",
    bet: "One surface on every screen: the row you open becomes the Marked-up detail where it stands, so the list never loses its place and the phone is the same page.",
    givesUp: "Side-by-side reading: an open row pushes the rest down. At 1440 the column leaves wide margins empty.",
    View: InlineLayout,
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
          {v.name}
        </button>
      ))}
    </nav>
  )
}

const REPLACES: [string, string][] = [
  ["Toolbar · ToolbarGroup · ToolbarDivider", "new; replaces KitPage's two-control header and the Stage lead on a workspace page"],
  ["WsButton sm 28 / md 32, variant ghost", "extends Button (adds size sm and variant ghost); replaces TextButton in toolbars"],
  ["KeyHint · KeyBar", "KeyHint extends Kbd (one key, 18px, on-ink); KeyBar is new"],
  ["FilterMenu", "new, on the kit Menu's Base UI parts; replaces Segmented used as a filter, adds a count per option"],
  ["CompactSearch", "SearchField size sm (32) + flat surface (ring only) + the / hint"],
  ["ViewSwitch", "Segmented size sm, icon-only"],
  ["IdeaTable (ui-sdk Listbox)", "new DataList; replaces List + ListRow on Ideas (ListRow stays for short lists)"],
  ["SourceCell · ShapeTag · Channels · Age · StatusPill", "SourceCell = SourceMark at meta size; ShapeTag = Tag with look text/outline/fill; StatusPill is new and folds LiveDot (reading), the Checklist tick (drafted) and failed into one cell"],
  ["Panel · PanelHeader · PanelBody", "new; replaces Card + Stage + KitPage width wide for a split page"],
  ["SourceRail · SourceItem", "new; replaces the RiffCard-per-source list; GlyphTile at 28 instead of 36"],
  ["MarkedUp", "replaces RiffCard + AngleTabs as the Ideas detail (needs Angle.line)"],
]

export function WorkspaceLab() {
  const params = useSearchParams()
  const asked = parseInt(params.get("v") ?? "", 10)
  const bare = params.has("bare")
  const [current, setCurrent] = React.useState(asked >= 1 && asked <= VARIANTS.length ? asked - 1 : 0)
  const [frame, setFrame] = React.useState(1440)
  const root = React.useRef<HTMLDivElement>(null)
  const ws = useWorkspace()

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
  }, [])

  // The picker's keys: 1–3 and ←/→. The workspace's own keys (j k D N L U /) are in use-workspace.ts.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (t?.closest('[role="listbox"], [role="menu"]')) {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= VARIANTS.length) select(n - 1)
      else if (e.key === "ArrowRight") select((current + 1) % VARIANTS.length)
      else if (e.key === "ArrowLeft") select((current - 1 + VARIANTS.length) % VARIANTS.length)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [current, select])

  const v = VARIANTS[current]!
  const View = v.View

  if (bare) {
    return (
      <div ref={root} className="ws" {...DEFAULT_ATTRS}>
        <Shell>
          <div className="flex min-h-0 flex-1 flex-col">
            <View key={current} ws={ws} keys />
          </div>
        </Shell>
        <Picker current={current} select={select} />
      </div>
    )
  }

  const href = (extra: string) => `?v=${current + 1}${extra}`

  return (
    <KitRoot>
      <div ref={root} className="ws" {...DEFAULT_ATTRS}>
        <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-12 px-4 pt-8 pb-32 sm:px-8">
          <header className="flex max-w-[48rem] flex-col gap-2">
            <Text as="h1" weight="strong">
              Workspace lab
            </Text>
            <Text tone="muted">
              Ideas as a working surface, with Marked up as the open idea. Three page setups, each built from
              upgraded candidate components (this folder only; nothing in components/kit changed). Everything
              works on one shared, local queue: j k to move, D to draft, N to set aside, L for later, U to undo, /
              to search. 1–3 switch layouts.
            </Text>
          </header>

          <details open className="flex flex-col gap-4">
            <summary className="cursor-pointer font-kit-strong">Why today’s components read cheap — audit</summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-left text-kit-small">
                <thead>
                  <tr className="border-b border-kit-hairline text-kit-ink-muted">
                    <th className="w-[13%] py-2 pr-4 font-kit-strong">What</th>
                    <th className="w-[31%] py-2 pr-4 font-kit-strong">Today (kit, /ideas)</th>
                    <th className="w-[26%] py-2 pr-4 font-kit-strong">The quality bar (landing cards)</th>
                    <th className="py-2 font-kit-strong">Candidate here</th>
                  </tr>
                </thead>
                <tbody>
                  {AUDIT.map((a) => (
                    <tr key={a.what} className="border-b border-kit-hairline align-top">
                      <td className="py-2.5 pr-4 font-kit-strong">{a.what}</td>
                      <td className="py-2.5 pr-4 text-kit-ink-muted">{a.today}</td>
                      <td className="py-2.5 pr-4 text-kit-ink-muted">{a.bar}</td>
                      <td className="py-2.5">{a.candidate}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <section aria-label={`Layout ${current + 1}`} className="grid items-start gap-x-10 gap-y-6 xl:grid-cols-[minmax(0,1fr)_26rem]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-wrap items-baseline gap-x-3">
                <Text as="h2" weight="strong">{`${current + 1} · ${v.name}`}</Text>
                <Mono>{v.axis}</Mono>
              </div>
              <dl className="grid gap-x-8 gap-y-4 md:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <dt className="font-kit-strong">Bets on</dt>
                  <dd className="text-kit-ink-muted">{v.bet}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="font-kit-strong">Gives up</dt>
                  <dd className="text-kit-ink-muted">{v.givesUp}</dd>
                </div>
              </dl>
              <p className="text-kit-ink-muted">
                <TextLink href={href("&bare")}>Open at true size in the app shell</TextLink>
              </p>
            </div>
            <figure className="flex min-w-0 flex-col gap-2">
              <figcaption className="flex flex-wrap items-baseline gap-x-2.5">
                <span className="font-kit-strong">The quality bar</span>
                <Mono>showcase/demos/ideas-picture.tsx</Mono>
              </figcaption>
              <IdeasPicture />
            </figure>
          </section>

          <figure className="flex min-w-0 flex-col gap-3">
            <figcaption className="flex items-baseline gap-2.5">
              <span className="font-kit-strong">Desktop</span>
              <Mono>{`${frame} × 860, scaled to fit`}</Mono>
            </figcaption>
            <DesktopFrame width={frame}>
              <View key={current} ws={ws} keys />
            </DesktopFrame>
          </figure>

          {/* Table folds into Inline below its fold (layouts/table.tsx), so its phone is Inline's. */}
          {current !== 1 ? (
            <figure className="flex flex-col items-start gap-3">
              <figcaption className="flex items-baseline gap-2.5">
                <span className="font-kit-strong">Phone</span>
                <Mono>340 pt</Mono>
              </figcaption>
              <PhoneFrame>
                <div className="h-full">
                  <View ws={ws} keys={false} />
                </div>
              </PhoneFrame>
            </figure>
          ) : (
            <Text tone="muted">
              The phone frame is on layouts 1 and 3: on a phone, Table folds into Inline (Three panes would too).
            </Text>
          )}

          <section aria-labelledby="ws-replaces" className="flex max-w-[60rem] flex-col gap-3">
            <Text as="h2" weight="strong" id="ws-replaces">
              Candidate components, and what each would replace in components/kit
            </Text>
            <ul className="flex flex-col gap-2.5">
              {REPLACES.map(([name, what]) => (
                <li key={name} className="grid gap-x-6 gap-y-0.5 sm:grid-cols-[20rem_1fr]">
                  <Mono tone="ink">{name}</Mono>
                  <span className="text-kit-ink-muted">{what}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>
        <ControlPanel rootRef={root} frame={frame} setFrame={setFrame} variant={v.name} onResetQueue={ws.reset} />
        <Picker current={current} select={select} />
      </div>
    </KitRoot>
  )
}
