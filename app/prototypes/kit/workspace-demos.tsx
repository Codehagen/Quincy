"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"
import { Edit01Icon, Layers01Icon, Mail01Icon, Menu01Icon, Mic01Icon } from "@hugeicons/core-free-icons"

import {
  Announcer,
  Button,
  DataList,
  DataListEmpty,
  DataListMeta,
  DataListMono,
  DataListTitle,
  FilterMenu,
  FootBar,
  ICON_DENSE,
  KeyBar,
  Kbd,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Segmented,
  StatusMark,
  Tag,
  Text,
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarTitle,
  revealDataListRow,
  useAnnounce,
  type DataListColumn,
  type FilterOption,
  type StatusMarkStatus,
} from "@/components/kit"

/*
 * Lab demos for the workspace components (sections/workspace.tsx), after
 * the Table picked in /prototypes/workspace-lab. Local fixtures: nothing
 * calls a server, nothing spends.
 */

type Idea = {
  id: string
  title: string
  source: "voice" | "email" | "typed"
  sourceLabel: string
  shape: string
  age: string
  status?: StatusMarkStatus
}

const IDEAS: Idea[] = [
  { id: "a", title: "We cut onboarding from nine screens to three", source: "voice", sourceLabel: "Voice note", shape: "Story", age: "today" },
  { id: "b", title: "Every screen we removed was a question we never needed to ask", source: "voice", sourceLabel: "Voice note", shape: "Short post", age: "today" },
  { id: "c", title: "The hire who asked for the worst sales call", source: "email", sourceLabel: "Email from Ada", shape: "Story", age: "1d", status: "drafted" },
  { id: "d", title: "Nobody reads the pricing page", source: "typed", sourceLabel: "Written here", shape: "Thread", age: "2d" },
  { id: "e", title: "Support tickets halved after the empty state said why", source: "email", sourceLabel: "Email from Ola", shape: "Story", age: "4d", status: "later" },
  { id: "f", title: "What the Tuesday call was about", source: "voice", sourceLabel: "Voice note", shape: "—", age: "9 Nov", status: "reading" },
]

const GLYPH = { voice: Mic01Icon, email: Mail01Icon, typed: Edit01Icon } as const

const COLUMNS: DataListColumn<Idea>[] = [
  {
    id: "glyph",
    header: "",
    width: "1rem",
    skeleton: "glyph",
    // The glyph is decorative; the Source column, or the sr-only name, says it.
    cell: (i) => (
      <span className="grid place-items-center text-kit-ink-muted">
        <HugeiconsIcon icon={GLYPH[i.source]} {...ICON_DENSE} aria-hidden />
        <span className="sr-only">{`${i.sourceLabel}: `}</span>
      </span>
    ),
  },
  {
    id: "idea",
    header: "Idea",
    width: "minmax(0,1fr)",
    skeleton: "title",
    cell: (i) => (
      <span className="flex min-w-0 items-center gap-2">
        <DataListTitle quiet={i.status === "drafted" || i.status === "reading"}>{i.title}</DataListTitle>
        {i.status === "drafted" || i.status === "later" ? <StatusMark status={i.status} /> : null}
      </span>
    ),
  },
  { id: "source", header: "Source", width: "7.5rem", wide: true, cell: (i) => <DataListMeta>{i.sourceLabel}</DataListMeta> },
  {
    id: "shape",
    header: "Shape",
    width: "5.5rem",
    cell: (i) => (i.status === "reading" ? <StatusMark status="reading" /> : <Tag look="text">{i.shape}</Tag>),
  },
  { id: "age", header: "Age", width: "3rem", align: "end", cell: (i) => <DataListMono>{i.age}</DataListMono> },
]

// ── Buttons, keys, tags at the workspace sizes ───────────────────────────

export function DenseControls() {
  return (
    <div className="flex flex-col gap-kit-group">
      <div className="flex flex-wrap items-center gap-kit-controls">
        <Button size="xs" variant="ghost">
          Clear
        </Button>
        <Button size="xs">Clear filters</Button>
        <Button size="sm" icon={Mic01Icon}>
          Record a thought
        </Button>
        <Button size="sm" variant="action" shortcut="D">
          Draft this idea
        </Button>
        <Button size="xs" variant="ghost" shortcut="U">
          Undo
        </Button>
      </div>
      <div className="flex flex-wrap items-center gap-kit-related">
        <Kbd keys={["/"]} size="sm" />
        <Kbd keys={["j"]} size="sm" />
        <span className="inline-flex rounded-full bg-kit-primary px-2 py-1">
          <Kbd keys={["D"]} size="sm" tone="on-ink" />
        </span>
        <Tag look="text">Story</Tag>
        <Tag>Story</Tag>
      </div>
      <div className="flex flex-wrap items-center gap-x-kit-group gap-y-kit-controls">
        <StatusMark status="reading" />
        <StatusMark status="drafted" />
        <StatusMark status="later" />
        <StatusMark status="failed" />
      </div>
    </div>
  )
}

// ── Toolbar ──────────────────────────────────────────────────────────────

const SOURCES: FilterOption<string>[] = [
  { value: "all", label: "All sources", count: 6 },
  { value: "voice", label: "Voice notes", count: 3 },
  { value: "email", label: "Email", count: 2 },
  { value: "rss", label: "RSS", count: 0 },
]

const SHAPES: FilterOption<string>[] = [
  { value: "all", label: "Any shape", count: 6 },
  { value: "story", label: "Story", count: 3 },
  { value: "short", label: "Short post", count: 1 },
  { value: "thread", label: "Thread", count: 1 },
]

export function ToolbarDemo() {
  const [source, setSource] = React.useState("all")
  const [shape, setShape] = React.useState("all")
  const [q, setQ] = React.useState("")
  const [view, setView] = React.useState<"flat" | "grouped">("flat")
  const on = source !== "all" || shape !== "all" || q !== ""
  return (
    <div className="flex flex-col rounded-kit-object bg-kit-ground shadow-kit-inset">
      <Toolbar label="Ideas" divided={false}>
        <div className="flex min-w-0 items-baseline gap-kit-related">
          <ToolbarTitle as="h2">Ideas</ToolbarTitle>
          <p className="truncate text-kit-meta text-kit-ink-muted tabular-nums">4 waiting; you usually draft 4.</p>
        </div>
        <ToolbarGroup end grow>
          <SearchField size="sm" shortcut="/" value={q} onValueChange={setQ} aria-label="Search ideas" placeholder="Search ideas" />
          <Button size="sm" icon={Mic01Icon}>
            Record
          </Button>
        </ToolbarGroup>
      </Toolbar>
      <Toolbar label="Filters" size="filter">
        <ToolbarGroup>
          <FilterMenu label="Source" value={source} options={SOURCES} onValueChange={setSource} />
          <FilterMenu label="Shape" value={shape} options={SHAPES} onValueChange={setShape} />
          {on ? (
            <Button
              size="xs"
              variant="ghost"
              onClick={() => {
                setSource("all")
                setShape("all")
                setQ("")
              }}
            >
              Clear
            </Button>
          ) : null}
        </ToolbarGroup>
        <ToolbarGroup end>
          <ToolbarDivider />
          <Segmented
            size="xs"
            aria-label="View"
            value={view}
            onValueChange={setView}
            options={[
              { value: "flat", label: "Every idea, newest first", icon: Menu01Icon },
              { value: "grouped", label: "Grouped by source", icon: Layers01Icon },
            ]}
          />
        </ToolbarGroup>
      </Toolbar>
    </div>
  )
}

// ── DataList + Panel + KeyBar: a small workspace ─────────────────────────

const KEYS = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["N"], label: "Not this one" },
  { keys: ["U"], label: "Undo" },
] as const

export function WorkspaceDemo() {
  return (
    <Announcer>
      <WorkspaceDemoInner />
    </Announcer>
  )
}

function WorkspaceDemoInner() {
  const root = React.useRef<HTMLDivElement>(null)
  const [state, setState] = React.useState<"rows" | "grouped" | "loading" | "empty">("rows")
  const [dropped, setDropped] = React.useState<Idea | null>(null)
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(() => new Set())
  const [open, setOpen] = React.useState<string | null>("a")
  const announce = useAnnounce()

  const shown = state === "empty" ? [] : IDEAS.filter((i) => !hidden.has(i.id))
  const selected = shown.find((i) => i.id === open) ?? null

  // The page's keys, heard in the capture phase on the surface's root (the
  // real page binds the document), so the list's typeahead never takes N or
  // U as the first letter of a title. data-letter-keys on the root keeps
  // the app's theme key off D.
  const onKeyDownCapture = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || e.metaKey || e.ctrlKey || e.altKey) return
    const key = e.key.toLowerCase()
    if (!["j", "k", "n", "u"].includes(key)) return
    e.preventDefault()
    e.stopPropagation()
    if (key === "j" || key === "k") {
      const i = shown.findIndex((r) => r.id === open)
      const next = shown[Math.min(shown.length - 1, Math.max(0, i + (key === "j" ? 1 : -1)))]
      if (next) {
        setOpen(next.id)
        if (root.current) revealDataListRow(next.id, root.current)
      }
    } else if (key === "n" && selected) setAside(selected)
    else if (key === "u") undo()
  }

  const setAside = (idea: Idea) => {
    const i = shown.findIndex((r) => r.id === idea.id)
    const next = shown[i + 1] ?? shown[i - 1] ?? null
    setHidden((s) => new Set(s).add(idea.id))
    setDropped(idea)
    setOpen(next?.id ?? null)
    announce(`Set aside “${idea.title}”. Press U to undo.`)
    // Focus follows to the open row, so it never falls to the body.
    if (next && root.current) revealDataListRow(next.id, root.current, { focus: "recover" })
  }

  const undo = () => {
    if (!dropped) return
    setHidden((s) => {
      const n = new Set(s)
      n.delete(dropped.id)
      return n
    })
    setOpen(dropped.id)
    setDropped(null)
    announce("Back in the list.")
  }

  const groups =
    state === "grouped"
      ? (["voice", "email", "typed"] as const)
          .map((src) => ({ src, items: shown.filter((i) => i.source === src) }))
          .filter((g) => g.items.length > 0)
          .map((g) => ({
            key: g.src,
            name: `${g.items.length} ${g.items.length === 1 ? "idea" : "ideas"} from ${g.items[0]!.sourceLabel}`,
            label: (
              <>
                <HugeiconsIcon icon={GLYPH[g.src]} {...ICON_DENSE} aria-hidden />
                <span className="font-kit-strong text-kit-ink">{g.items[0]!.sourceLabel}</span>
                <span>·</span>
                <span>{`${g.items.length} ${g.items.length === 1 ? "idea" : "ideas"}`}</span>
              </>
            ),
            items: g.items,
          }))
      : undefined

  return (
    <div className="flex w-full flex-col gap-kit-related">
      <Segmented
        aria-label="List state"
        value={state}
        onValueChange={setState}
        options={[
          { value: "rows", label: "Rows" },
          { value: "grouped", label: "Grouped" },
          { value: "loading", label: "Loading" },
          { value: "empty", label: "Empty" },
        ]}
      />
      <div
        ref={root}
        data-letter-keys
        onKeyDownCapture={onKeyDownCapture}
        className="flex h-96 flex-col overflow-hidden rounded-kit-object bg-kit-ground shadow-kit-inset"
      >
        <div className="flex min-h-0 flex-1">
          <Panel label="Ideas">
            <PanelBody>
              <DataList
                label="Ideas"
                aria-keyshortcuts="j k n u"
                items={groups ? undefined : shown}
                groups={groups}
                getKey={(i) => i.id}
                getLabel={(i) => i.title}
                value={open}
                onValueChange={setOpen}
                columns={COLUMNS}
                status={state === "loading" ? "loading" : "ready"}
                loadingLabel="Loading ideas"
                empty={
                  <DataListEmpty
                    title="No ideas yet."
                    action={
                      <Button size="xs" onClick={() => setState("rows")}>
                        Show the sample
                      </Button>
                    }
                  >
                    Record a thought, and the ideas in it show here.
                  </DataListEmpty>
                }
              />
            </PanelBody>
          </Panel>
        </div>
        {dropped ? (
          <FootBar>
            <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">{`Set aside “${dropped.title}”.`}</p>
            <Button size="xs" variant="ghost" shortcut="U" onClick={undo}>
              Undo
            </Button>
          </FootBar>
        ) : (
          <KeyBar keys={KEYS} />
        )}
      </div>
    </div>
  )
}

export function PanelDemo() {
  const [open, setOpen] = React.useState(0)
  const notes = ["Voice note · today", "Email from Ada · 1d", "Written here · 2d"]
  return (
    <div className="flex h-72 w-full overflow-hidden rounded-kit-object bg-kit-ground shadow-kit-inset">
      <Panel label="Sources">
        <PanelHeader end={<span className="font-kit-mono text-kit-mono-sm">3</span>}>Sources</PanelHeader>
        <PanelBody>
          <div className="flex flex-col gap-kit-controls p-kit-related">
            {notes.map((n, i) => (
              <Button key={n} size="xs" variant={i === open ? "quiet" : "ghost"} onClick={() => setOpen(i)} aria-pressed={i === open}>
                {n}
              </Button>
            ))}
          </div>
        </PanelBody>
      </Panel>
      <Panel label="Open source" width="60%" edge="start">
        <PanelBody label="Where the idea came from" scrollKey={open}>
          <PanelHeader end={<span className="font-kit-mono text-kit-mono-sm">4:12</span>}>{notes[open]}</PanelHeader>
          <div className="flex flex-col gap-kit-related px-kit-group py-kit-related">
            {Array.from({ length: 8 }, (_, i) => (
              <Text key={i} tone={i % 3 === 0 ? "ink" : "muted"}>
                So the call on Tuesday was about the onboarding again. We took out six screens and nobody asked
                where they went.
              </Text>
            ))}
          </div>
        </PanelBody>
      </Panel>
    </div>
  )
}
