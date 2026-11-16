"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import {
  Button,
  KitRoot,
  Mono,
  Segmented,
  Slider,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Text,
} from "@/components/kit"
import { IdeasPicture } from "@/components/showcase/demos/ideas-picture"

import { DIRECTIONS, type ControlDef, type Direction } from "./directions"
import { LAB_RIFFS } from "./fixtures"
import { DesktopFrame, PhoneFrame } from "./frames"
import { DEFAULTS, type Controls } from "./parts"
import { useQueue, type Queue } from "./queue"

/**
 * The question (owner, 2026-11-16): what should Ideas be, the page where
 * what Quincy found in your material waits for you to pick one worth
 * drafting? Four directions, today's first, each in a desktop window and a
 * phone, beside the landing picture the page has to answer to.
 *
 * One queue for the whole lab (queue.ts): a Draft pressed in one direction
 * shows in the next, and the two frames are two windows onto it. Nothing
 * calls the server. The decision is written in DECISION.md.
 */

const FRAMES = ["1024", "1280", "1440", "1680"] as const

type Layout = "beside" | "alone"

function Label({ children, note }: { children: React.ReactNode; note?: string }) {
  return (
    <span className="flex flex-wrap items-baseline gap-x-2.5">
      <span className="font-kit-strong">{children}</span>
      {note ? <Mono>{note}</Mono> : null}
    </span>
  )
}

function Reference() {
  return (
    <figure className="flex min-w-0 flex-col gap-3">
      <figcaption>
        <Label note="showcase/demos/ideas-picture.tsx">Reference · the landing’s ideas</Label>
      </figcaption>
      <IdeasPicture />
    </figure>
  )
}

function Control({
  def,
  c,
  set,
}: {
  def: ControlDef
  c: Controls
  set: (patch: Partial<Controls>) => void
}) {
  const value = c[def.key]
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <span className="font-kit-strong">{def.label}</span>
        <Mono tone="ink">{`${value}${def.kind === "slider" ? def.unit : ""}`}</Mono>
      </div>
      {def.kind === "slider" ? (
        <Slider
          aria-label={def.label}
          min={def.min}
          max={def.max}
          step={def.step}
          value={value as number}
          onValueChange={(v) => set({ [def.key]: v } as Partial<Controls>)}
        />
      ) : (
        <Segmented
          aria-label={def.label}
          value={value as string}
          onValueChange={(v) => set({ [def.key]: v } as Partial<Controls>)}
          options={def.options}
        />
      )}
      <span className="text-kit-small text-kit-ink-muted">{def.why}</span>
    </div>
  )
}

/** The window and the queue are the same question for every direction. */
const GLOBAL: ControlDef[] = [
  { key: "queue", kind: "slider", label: "Sources in the queue", min: 0, max: LAB_RIFFS.length, step: 1, unit: "", why: "0 is the empty page; 11 runs past the row cap" },
]

function configLine(d: Direction, c: Controls) {
  const parts = [`direction: ${d.name}`, `window: ${c.frame}px`, `queue: ${c.queue}`]
  for (const def of d.controls) parts.push(`${def.key}: ${c[def.key]}${def.kind === "slider" ? def.unit : ""}`)
  return parts.join(" · ")
}

function Panel({ d, c, set, q }: { d: Direction; c: Controls; set: (p: Partial<Controls>) => void; q: Queue }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <section aria-label="Controls" className="flex flex-col gap-5 rounded-kit-object bg-kit-object p-kit-pad shadow-kit-object">
      <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-kit-strong">Desktop window</span>
            <Mono tone="ink">{`${c.frame}px`}</Mono>
          </div>
          <Segmented
            aria-label="Desktop window"
            value={String(c.frame) as (typeof FRAMES)[number]}
            onValueChange={(v) => set({ frame: Number(v) })}
            options={FRAMES.map((f) => ({ value: f, label: f }))}
          />
          <span className="text-kit-small text-kit-ink-muted">the sidebar takes 208 of it</span>
        </div>
        {[...GLOBAL, ...d.controls].map((def) => (
          <Control key={def.key} def={def} c={c} set={set} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          onClick={() => {
            void navigator.clipboard?.writeText(configLine(d, c)).then(
              () => setCopied(true),
              () => window.prompt("Copy the config", configLine(d, c))
            )
          }}
        >
          {copied ? "Copied" : "Copy config"}
        </Button>
        <Button
          onClick={() => {
            set({ ...DEFAULTS })
            setCopied(false)
          }}
        >
          Reset controls
        </Button>
        <Button onClick={q.reset}>Reset the queue</Button>
        <Mono>{configLine(d, c)}</Mono>
      </div>
    </section>
  )
}

function DirectionView({ d, c, set, q, layout }: { d: Direction; c: Controls; set: (p: Partial<Controls>) => void; q: Queue; layout: Layout }) {
  const beside = layout === "beside"
  return (
    <div className="flex flex-col gap-12 pt-4">
      <dl className="grid gap-x-8 gap-y-5 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Axis</dt>
          <dd className="text-kit-ink-muted">{d.axis}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Bets on</dt>
          <dd className="text-kit-ink-muted">{d.bet}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="font-kit-strong">Gives up</dt>
          <dd className="text-kit-ink-muted">{d.givesUp}</dd>
        </div>
      </dl>

      <Panel d={d} c={c} set={set} q={q} />

      <section aria-label="Desktop" className={`grid items-start gap-x-8 gap-y-6 ${beside ? "xl:grid-cols-[minmax(0,1fr)_28rem]" : ""}`}>
        <figure className="flex min-w-0 flex-col gap-3">
          <figcaption>
            <Label note={`${c.frame} × 860`}>Desktop</Label>
          </figcaption>
          <DesktopFrame width={c.frame}>
            <d.View q={q} frame="desktop" c={c} />
          </DesktopFrame>
        </figure>
        {beside ? <Reference /> : null}
      </section>

      <section aria-label="Phone" className={`grid items-start gap-x-12 gap-y-6 ${beside ? "md:grid-cols-[auto_minmax(0,28rem)]" : ""}`}>
        <figure className="flex flex-col items-start gap-3">
          <figcaption>
            <Label note="340 pt">Phone</Label>
          </figcaption>
          <PhoneFrame>
            <d.View q={q} frame="phone" c={c} />
          </PhoneFrame>
        </figure>
        {beside ? <Reference /> : null}
      </section>

      <section aria-labelledby={`${d.id}-changes`} className="flex max-w-[50rem] flex-col gap-3">
        <h2 id={`${d.id}-changes`} className="font-kit-strong">
          What it changes
        </h2>
        <ul className="flex flex-col gap-2.5">
          {d.changes.map(([file, change]) => (
            <li key={file} className="grid gap-x-6 gap-y-0.5 sm:grid-cols-[17rem_1fr]">
              <Mono tone="ink">{file}</Mono>
              <span className="text-kit-ink-muted">{change}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export function IdeasLab() {
  const params = useSearchParams()
  const asked = params.get("d")
  const [id, setId] = React.useState(DIRECTIONS.some((d) => d.id === asked) ? asked! : DIRECTIONS[0]!.id)
  const [layout, setLayout] = React.useState<Layout>("beside")
  const [c, setC] = React.useState<Controls>(DEFAULTS)
  const set = React.useCallback((patch: Partial<Controls>) => setC((prev) => ({ ...prev, ...patch })), [])
  const q = useQueue(c.queue)

  const select = React.useCallback((next: string) => {
    setId(next)
    const url = new URL(location.href)
    url.searchParams.set("d", next)
    history.replaceState(null, "", url)
  }, [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      const n = parseInt(e.key, 10)
      if (n >= 1 && n <= DIRECTIONS.length) select(DIRECTIONS[n - 1]!.id)
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [select])

  return (
    <KitRoot>
      <div className="mx-auto flex w-full max-w-[100rem] flex-col gap-8 px-4 pt-8 pb-24 sm:px-8">
        <header className="flex max-w-[45rem] flex-col gap-1">
          <Text as="h1" weight="strong">
            Ideas lab
          </Text>
          <Text tone="muted">
            Four directions for the page where what Quincy found waits for you to pick one worth
            drafting. Today’s page is 1. The frames work: Draft, Not this one, Dismiss and Undo act on
            one shared queue, and nothing reaches the server. Press 1–4 to switch.
          </Text>
        </header>

        <Tabs value={id} onValueChange={select}>
          <div className="flex w-full flex-wrap items-center justify-between gap-4">
            <div className="max-w-full overflow-x-auto">
              <TabList aria-label="Direction">
                {DIRECTIONS.map((d, i) => (
                  <Tab key={d.id} value={d.id}>
                    {`${i + 1} ${d.name}`}
                  </Tab>
                ))}
              </TabList>
            </div>
            <div className="hidden xl:block">
              <Segmented
                aria-label="Layout"
                value={layout}
                onValueChange={setLayout}
                options={[
                  { value: "beside", label: "Beside the picture" },
                  { value: "alone", label: "Direction alone" },
                ]}
              />
            </div>
          </div>
          {DIRECTIONS.map((d) => (
            <TabPanel key={d.id} value={d.id}>
              {d.id === id ? <DirectionView d={d} c={c} set={set} q={q} layout={layout} /> : null}
            </TabPanel>
          ))}
        </Tabs>
      </div>
    </KitRoot>
  )
}
