"use client"

import * as React from "react"
import { parseAsStringLiteral, useQueryState } from "nuqs"
import { HugeiconsIcon } from "@hugeicons/react"
import { Alert02Icon } from "@hugeicons/core-free-icons"

import {
  Button,
  DataList,
  DataListMeta,
  DataListMono,
  DataListTitle,
  EmptyState,
  FilterMenu,
  ICON_DENSE,
  ICON_DENSE_CHEVRON,
  KeyBar,
  Mono,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Sheet,
  SheetPanel,
  StatusMark,
  Toolbar,
  ToolbarGroup,
  ToolbarSummary,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
  focusRestoredDataList,
  revealDataListRow,
  useAnnounce,
  useLetterKeys,
  useWorkspaceFold,
  type DataListColumn,
  type DataListGroup,
  type KeyBarItem,
} from "@/components/kit"
import { Hand } from "@/components/kit/bracket"
import { Friend } from "@/components/mascot"

import { SettingsPane } from "./settings-pane"
import {
  SECTIONS,
  SECTION_IDS,
  buildItems,
  listNotes,
  paneNotes,
  qualifier,
  summarySentence,
  type Item,
  type Mark,
  type SettingsData,
} from "./settings-rows"
import { useNow } from "./use-now"

/**
 * /settings in the house frame (decided on /prototypes/settings-lab, "Desk";
 * docs/design/decisions.md, "Settings is a working surface"): a toolbar
 * with the title and one plain sentence from the account, search at the end
 * with `/`; a filter row (Show: All · Needs you, with counts, Hide notes,
 * the tally in mono); every setting, browser and agent as a row in one
 * grouped DataList; the open row in a pane behind a hairline, in Drafts'
 * pane order (settings-pane.tsx). The KeyBar at the foot. Under 900px of
 * workspace the list stands alone and a row opens in a Sheet.
 *
 * `?section=profile|signin|plan|agents|account` picks that section's first
 * row and scrolls it into view (the account menu's Billing row, the banner,
 * Stripe's return). It never narrows the list: the person came to one
 * setting and may want the next. `?checkout=done` is read on the server and
 * opens the plan with the confirmation.
 *
 * Columns, and what folds: Setting and the fact always; Value from 26rem of
 * list, State's word from 36rem (its glyph stays, the word goes to
 * assistive tech). The widths are custom properties on the list's own
 * container, since DataList's `wide` switch (46rem) would hide them beside
 * a pane wide enough for the margin notes.
 */

export const KEYS: readonly KeyBarItem[] = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["enter"], label: "Open" },
  { keys: ["E"], label: "Edit" },
  { keys: ["/"], label: "Search" },
  { keys: ["esc"], label: "Back" },
]

/**
 * The fold, CSS first (useWorkspaceFold): under 900px of workspace the list
 * stands alone and the open row opens in a Sheet. The probe is shown only
 * under the fold, and the hook reads it.
 */
export const FOLD_PROBE = "block @[900px]/kit-workspace:hidden"
export const UNFOLDED = "hidden @[900px]/kit-workspace:contents"

/** Wide enough that the pane's margin (Drafts' 150 + 10) holds the notes beside the object at 1440. */
export const PANE_WIDTH = "clamp(440px, 46cqi, 620px)"

/**
 * The list's own tracks, by the list's own width. The container is the
 * outer element and the properties sit on the inner one: an element cannot
 * query itself. Value from 26rem; State's word from 36rem (7.5rem holds
 * "Payment needed"), else a glyph-wide track that still fits the head.
 */
export const LIST_OUTER = "@container/sl-list"
export const LIST_TRACKS =
  "[--sl-value:0px] [--sl-state:2.5rem] @[26rem]/sl-list:[--sl-value:minmax(0,1fr)] @[36rem]/sl-list:[--sl-state:7.5rem]"

/**
 * The state cell: the glyph always, the word from 36rem of list; under it
 * the word is for assistive tech only. One mark is ever displayed, so the
 * word is never read twice.
 */
function StateCell({ mark }: { mark: Mark | null }) {
  if (!mark) return null
  const tone = mark.ink ? "ink" : "muted"
  return (
    <span className="flex max-w-full min-w-0 overflow-hidden">
      <span className="inline-flex @[36rem]/sl-list:hidden">
        <StatusMark icon={mark.icon} tone={tone} hideWord>
          {mark.word}
        </StatusMark>
      </span>
      <span className="hidden min-w-0 truncate @[36rem]/sl-list:inline-flex">
        <StatusMark icon={mark.icon} tone={tone}>
          {mark.word}
        </StatusMark>
      </span>
    </span>
  )
}

export const COLUMNS: DataListColumn<Item>[] = [
  {
    id: "glyph",
    header: "",
    width: "1rem",
    skeleton: "glyph",
    cell: (i) => (
      <span aria-hidden className="grid size-4 place-items-center text-kit-ink-muted">
        <HugeiconsIcon icon={i.icon} {...ICON_DENSE} />
      </span>
    ),
  },
  { id: "title", header: "Setting", width: "minmax(9rem,1.35fr)", skeleton: "title", cell: (i) => <DataListTitle>{i.title}</DataListTitle> },
  {
    id: "value",
    header: "Value",
    width: "var(--sl-value)",
    cell: (i) => (
      <span className="hidden min-w-0 @[26rem]/sl-list:block" title={i.value}>
        <DataListMeta>
          <span className="block truncate">{i.value}</span>
        </DataListMeta>
      </span>
    ),
  },
  {
    id: "when",
    header: "",
    width: "4.5rem",
    align: "end",
    cell: (i) =>
      i.when ? (
        <span className="block min-w-0 truncate whitespace-nowrap" title={i.whenFull ?? i.when}>
          <DataListMono>{i.when}</DataListMono>
        </span>
      ) : null,
  },
  { id: "state", header: "State", width: "var(--sl-state)", cell: (i) => <StateCell mark={i.mark} /> },
]

type Show = "all" | "you"

/** The first control in a pane, for Enter (open) and E (edit). */
function focusIn(root: HTMLElement | null, edit: boolean) {
  if (!root) return false
  const sel = edit
    ? "input:not([type=hidden]):not([hidden]), textarea, [role=combobox]"
    : "input:not([type=hidden]):not([hidden]), textarea, [role=combobox], button:not([disabled]), a[href]"
  const el = root.querySelector<HTMLElement>(sel)
  if (!el) return false
  // Nothing to take focus in the pane: it stays on the row, never on the
  // pane's root, where a ring would not show.
  el.focus()
  return true
}

export function SettingsDesk({ data }: { data: SettingsData }) {
  const [probe, fold] = useWorkspaceFold()
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <span ref={probe} aria-hidden className={FOLD_PROBE} />
        <Desk data={data} fold={fold} />
      </div>
    </WorkspacePage>
  )
}

function Desk({ data, fold }: { data: SettingsData; fold: boolean | null }) {
  const now = useNow(data.nowIso)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const paneRef = React.useRef<HTMLDivElement>(null)
  const [section] = useQueryState("section", parseAsStringLiteral(SECTION_IDS))
  const [q, setQ] = React.useState("")
  const [show, setShow] = React.useState<Show>("all")
  // Back from Checkout, the plan is what the person came back to.
  const [selected, setSelected] = React.useState<string | null>(data.billing.checkout ? "plan" : null)
  // Folded, the confirmation after Checkout is in the Sheet, so it opens with
  // the page; wide, the pane shows it and this flag is never read.
  const [sheetOpen, setSheetOpen] = React.useState(data.billing.checkout != null)
  const sheetShown = fold === true && sheetOpen
  // Quincy's notes can be turned off (editor-marks.md: a page that uses them gives them a control).
  const [noteOn, setNoteOn] = React.useState(true)

  const only = section
  const all = buildItems(data, now)
  const needle = q.trim().toLowerCase()
  const matches = (i: Item) => !needle || `${i.title} ${i.value}`.toLowerCase().includes(needle)
  const youCount = all.filter((i) => i.needsYou && matches(i)).length
  const shown = all.filter((i) => matches(i) && (show === "all" || i.needsYou))

  // A section named in the URL (the menu's Billing, the banner, Stripe's
  // return) opens that section's first row, also when the page is already
  // open on another one. Adjusted during render, not in an effect.
  const [seenSection, setSeenSection] = React.useState(only)
  if (seenSection !== only) {
    setSeenSection(only)
    if (only && !data.billing.checkout) setSelected(all.find((i) => i.group === only)?.id ?? null)
  }

  // The picked section's row, brought into view without taking focus: the
  // list keeps every section, so a plan row near the foot would otherwise
  // open off screen.
  const sectionRow = only ? (data.billing.checkout ? "plan" : all.find((i) => i.group === only)?.id) : undefined
  React.useEffect(() => {
    if (sectionRow) revealDataListRow(sectionRow)
  }, [sectionRow])

  const groupNotes = listNotes(data)
  const groups: DataListGroup<Item>[] = SECTIONS.map((s) => {
    const rows = shown.filter((i) => i.group === s.id)
    const you = rows.some((i) => i.needsYou)
    const more = qualifier(s.id, data, now)
    const pencil = noteOn ? groupNotes[s.id] : undefined
    return {
      key: s.id,
      name: `${s.label}${more ? `, ${more}` : ""}, ${rows.length}`,
      label: (
        <>
          {you ? <HugeiconsIcon icon={Alert02Icon} {...ICON_DENSE_CHEVRON} aria-hidden className="shrink-0 text-kit-ink" /> : null}
          <span className="shrink-0 font-kit-strong text-kit-ink">{s.label}</span>
          {more ? <span className="min-w-0 truncate">{more}</span> : null}
          {pencil ? (
            // Quincy's pencil on the group's line (Lineup's "quiet day"): the
            // negative margin keeps the heading's height, and under 36rem
            // of list it goes rather than squeeze anything.
            <span className="ms-auto -my-2 hidden shrink-0 @[36rem]/sl-list:inline-flex">
              <Hand tone="graphite">{pencil}</Hand>
            </span>
          ) : null}
          {/* At the end: after the pencil when it shows, on its own under 36rem of list. */}
          <span className={`${pencil ? "ms-auto @[36rem]/sl-list:ms-0" : "ms-auto"} shrink-0 font-kit-mono text-kit-mono-sm`}>{rows.length}</span>
        </>
      ),
      items: rows,
    }
  }).filter((g) => g.items.length > 0)
  const flat = groups.flatMap((g) => g.items)

  // A section named in the URL opens its first row; otherwise the row that
  // needs you, else the first.
  const fallback =
    (only ? flat.find((i) => i.group === only)?.id : null) ?? flat.find((i) => i.needsYou)?.id ?? flat[0]?.id ?? null
  // Resolved against every row, not the filtered ones (workspace.md; as
  // use-drafts.ts): a search or a filter that hides the open setting keeps
  // it open, so nothing typed in the pane is lost. It is dropped only when
  // the row is gone (a browser signed out, an agent removed).
  const openId = selected && all.some((i) => i.id === selected) ? selected : fallback
  const open = all.find((i) => i.id === openId) ?? null

  const move = (by: 1 | -1) => {
    if (flat.length === 0) return
    const i = flat.findIndex((x) => x.id === openId)
    const next = flat[Math.min(flat.length - 1, Math.max(0, i + by))]
    if (!next) return
    setSelected(next.id)
    revealDataListRow(next.id)
  }
  const enter = (edit: boolean) => {
    if (fold) {
      setSheetOpen(true)
      return
    }
    focusIn(paneRef.current, edit)
  }
  // Esc and the Sheet's close bring focus back to the open row itself.
  const backToRow = () => {
    if (openId) revealDataListRow(openId, document, { focus: "take" })
  }

  // The count after a search or a filter, said once it settles (as Drafts' filters).
  const announce = useAnnounce()
  const count = `${flat.length} of ${all.length} settings`
  const said = React.useRef(count)
  React.useLayoutEffect(() => {
    said.current = count
  })
  const filterKey = `${needle}|${show}`
  const firstKey = React.useRef(true)
  React.useEffect(() => {
    if (firstKey.current) {
      firstKey.current = false
      return
    }
    const t = setTimeout(() => announce(said.current), 500)
    return () => clearTimeout(t)
  }, [filterKey, announce])

  useLetterKeys(
    {
      j: () => move(1),
      k: () => move(-1),
      "/": () => searchRef.current?.focus(),
      e: { once: true, run: () => enter(true) },
    },
    { enabled: !sheetShown }
  )

  const afterRemove = (id: string) => {
    const i = flat.findIndex((x) => x.id === id)
    const next = flat[i + 1] ?? flat[i - 1]
    setSelected(next?.id ?? null)
    setSheetOpen(false)
    focusRestoredDataList()
  }

  const notes = paneNotes(data)
  const openSection = open ? SECTIONS.find((s) => s.id === open.group) : undefined
  const pane = open ? (
    <SettingsPane key={open.id} item={open} note={noteOn ? notes[open.note] : undefined} data={data} now={now} onRemoved={() => afterRemove(open.id)} />
  ) : null
  const filtered = show !== "all" || needle !== ""
  const clear = () => {
    setQ("")
    setShow("all")
  }

  return (
    <>
      <Toolbar label="Settings" divided={false}>
        <div className="flex min-w-0 items-baseline gap-kit-related">
          <ToolbarTitle>Settings</ToolbarTitle>
          <ToolbarSummary className="tabular-nums">{summarySentence(data)}</ToolbarSummary>
        </div>
        <ToolbarGroup end grow>
          <SearchField
            ref={searchRef}
            size="sm"
            shortcut="/"
            aria-label="Search settings"
            placeholder="Search settings"
            value={q}
            onValueChange={setQ}
          />
        </ToolbarGroup>
      </Toolbar>
      <Toolbar label="Filters" size="filter">
        <ToolbarGroup>
          <FilterMenu<Show>
            label="Show"
            value={show}
            options={[
              { value: "all", label: "All", count: all.filter(matches).length },
              { value: "you", label: "Needs you", count: youCount },
            ]}
            onValueChange={setShow}
          />
          {filtered ? (
            <Button size="xs" variant="ghost" onClick={clear}>
              Clear
            </Button>
          ) : null}
        </ToolbarGroup>
        <ToolbarGroup end>
          {/* The label says the state; no aria-pressed beside it (buttons.md, toggle buttons). */}
          <Button size="xs" variant="ghost" onClick={() => setNoteOn((v) => !v)}>
            {noteOn ? "Hide notes" : "Show notes"}
          </Button>
          <span className="font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted tabular-nums">{`${flat.length} of ${all.length}`}</span>
        </ToolbarGroup>
      </Toolbar>
      <WorkspacePanes>
        <Panel label="Settings">
          <PanelBody>
            <div className={LIST_OUTER}>
              <div
                className={LIST_TRACKS}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.target as HTMLElement).closest("[data-kit-row]")) {
                    e.preventDefault()
                    enter(false)
                  }
                }}
                onClick={(e) => {
                  if (fold && (e.target as HTMLElement).closest("[data-kit-row]")) setSheetOpen(true)
                }}
              >
                <DataList
                  label="Settings"
                  aria-keyshortcuts="j k Enter e / Escape"
                  groups={groups}
                  columns={COLUMNS}
                  getKey={(i) => i.id}
                  getLabel={(i) => i.title}
                  value={openId}
                  onValueChange={setSelected}
                  empty={
                    <EmptyState
                      frame="none"
                      media={
                        <span className="inline-flex items-end gap-kit-related text-kit-ink">
                          <Friend size={40} state="idle" />
                          {noteOn && show === "you" ? <Hand tone="graphite">all quiet here</Hand> : null}
                        </span>
                      }
                      bold={show === "you" ? "Nothing needs you." : "Nothing matches."}
                      rest={
                        show === "you"
                          ? "The plan is fine and every key is where you left it."
                          : "Try a setting by name: password, time zone, plan."
                      }
                    >
                      <Button
                        size="xs"
                        onClick={() => {
                          clear()
                          focusRestoredDataList()
                        }}
                      >
                        Show everything
                      </Button>
                    </EmptyState>
                  }
                />
              </div>
            </div>
          </PanelBody>
        </Panel>
        {fold !== true ? (
          <div className={UNFOLDED}>
            <Panel label="The open setting" width={PANE_WIDTH} edge="start">
              <PanelBody label="The open setting" scrollKey={open?.id ?? null}>
                {open && openSection ? (
                  <>
                    <PanelHeader
                      end={
                        <>
                          {open.when ? (
                            <span title={open.whenFull ?? open.when}>
                              <Mono size="sm">{open.when}</Mono>
                            </span>
                          ) : null}
                          {open.mark ? (
                            <StatusMark icon={open.mark.icon} tone={open.mark.ink ? "ink" : "muted"}>
                              {open.mark.word}
                            </StatusMark>
                          ) : null}
                        </>
                      }
                    >
                      <HugeiconsIcon icon={openSection.icon} {...ICON_DENSE} aria-hidden className="shrink-0" />
                      <span className="shrink-0">{openSection.label}</span>
                      <span aria-hidden>·</span>
                      <span className="truncate">{open.title}</span>
                    </PanelHeader>
                    <div
                      ref={paneRef}
                      className="px-kit-group py-kit-group"
                      onKeyDown={(e) => {
                        if (e.key !== "Escape") return
                        if ((e.target as HTMLElement).closest('[role="listbox"], [role="dialog"], [role="menu"]')) return
                        e.preventDefault()
                        backToRow()
                      }}
                    >
                      {pane}
                    </div>
                  </>
                ) : (
                  <>
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                    <div className="flex flex-col gap-kit-tight px-kit-group pt-kit-group">
                      <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
                      <p className="text-kit-dense text-pretty text-kit-ink-muted">Pick a setting, or press j.</p>
                    </div>
                  </>
                )}
              </PanelBody>
            </Panel>
          </div>
        ) : null}
      </WorkspacePanes>
      <KeyBar keys={KEYS} />

      {fold === true ? (
        <Sheet
          open={sheetOpen && open !== null}
          onOpenChange={(o) => {
            if (!o) {
              setSheetOpen(false)
              backToRow()
            }
          }}
        >
          {open && openSection ? (
            <SheetPanel title={`${openSection.label} · ${open.title}`} description={open.whenFull ?? (open.when || undefined)}>
              {pane}
            </SheetPanel>
          ) : null}
        </Sheet>
      ) : null}
    </>
  )
}
