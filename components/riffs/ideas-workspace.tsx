"use client"

import * as React from "react"
import { Layers01Icon, Menu01Icon } from "@hugeicons/core-free-icons"

import type { Angle, Riff } from "@/lib/riffs"
import type { IdeasPace } from "@/lib/ideas-pace"
import {
  Button,
  ButtonLink,
  Count,
  DataList,
  EmptyRegion,
  EmptyState,
  FilterMenu,
  FootBar,
  KeyBar,
  Panel,
  PanelBody,
  PanelHeader,
  SearchField,
  Segmented,
  SourceGlyph,
  StatusMark,
  Tag,
  Text,
  Toolbar,
  ToolbarDivider,
  ToolbarGroup,
  ToolbarTitle,
  WorkspacePage,
  WorkspacePanes,
  focusRestoredDataList,
  revealDataListRow,
  useAnnounce,
  useLetterKeys,
  useWorkspaceFold,
  type DataListGroup,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { FOCUS_RING } from "@/components/kit/control-styles"
import { writesSentence } from "@/components/quincy"

import { AdaptBox } from "./adapt-box"
import { ChannelGaps } from "./channel-gap"
import { DETAIL_WIDTH } from "./ideas-fold"
import { IDEA_COLUMNS, IdeaChannels, IdeaShape } from "./idea-cells"
import { ageOf, dayOf, filtersOn, optionsFor, sourceName, type IdeaRow, type StatusFilter } from "./idea-rows"
import { MarginIdea, MarkedUp, MarkedUpColumns, MarkedUpMargin, MarkedUpProse, MarkedUpTitle } from "./marked-up"
import { RecordBox } from "./record-box"
import { RiffsRefresh } from "./riffs-refresh"
import { Steer } from "./steer"
import { asideSentence, useIdeas, type DraftRefusal, type IdeasState } from "./use-ideas"
import "./ideas.css"

/**
 * /ideas, a workspace (docs/design/workspace.md; decisions.md, "Ideas is a
 * working surface — Table", 2026-11-16): a toolbar of two rows, a dense
 * table of ideas, and the open idea Marked up in a pane beside it. Under the
 * fold (`shouldFold`) the same page is one column whose rows open in place.
 *
 * One store (`useIdeas`), two views of it, one set of keys:
 * j / k move, D drafts the open idea, N sets it aside, U undoes, / searches.
 * There is no L (Later): nothing in the data can hold it.
 *
 * The page's one ink button is the open idea's Draft (actions.md), and it
 * goes quiet while words sit unsent in "Ask for a different idea".
 */

export type IdeasWorkspaceProps = {
  riffs: Riff[]
  /** Channels each riff reaches none of, by riff id (`channelGaps`, on the server). */
  gaps: Record<string, { id: string; label: string }[]>
  /** How many posts each shape writes for this account (`writesPerShape`). */
  writes: Partial<Record<Angle["shape"], number>>
  /** Ideas drafted this week, and the person's usual week (lib/ideas-pace.ts). */
  pace: IdeasPace
}

export const KEYS = [
  { keys: ["j", "k"], label: "Move" },
  { keys: ["D"], label: "Draft" },
  { keys: ["N"], label: "Not this one" },
  { keys: ["U"], label: "Undo" },
  { keys: ["/"], label: "Search" },
] as const

export function IdeasWorkspace(props: IdeasWorkspaceProps) {
  // CSS picks the side (ideas.css); script reads which, after mount.
  const [probe, fold] = useWorkspaceFold()
  return (
    <WorkspacePage>
      <div className="flex min-h-0 flex-1 flex-col">
        <span ref={probe} aria-hidden className="ideas-fold-probe" />
        <IdeasSurface {...props} fold={fold} />
      </div>
    </WorkspacePage>
  )
}

/** `fold` is null until mounted: both sides render, each in its slot, and CSS shows one. */
function IdeasSurface({ riffs, gaps, writes, pace, fold }: IdeasWorkspaceProps & { fold: boolean | null }) {
  const ideas = useIdeas(riffs)
  const searchRef = React.useRef<HTMLInputElement>(null)
  const [steering, setSteering] = React.useState(false)
  const [view, setView] = React.useState<"flat" | "grouped">("flat")

  // Where the open row last stood in the view: when it leaves (set aside,
  // drafted, filtered out), j and k carry on from there, not from the top.
  const lastAt = React.useRef(0)
  React.useLayoutEffect(() => {
    const i = ideas.shown.findIndex((r) => r.key === ideas.selected?.key)
    if (i >= 0) lastAt.current = i
  })

  function move(by: 1 | -1) {
    const list = ideas.shown
    if (list.length === 0) return
    const i = list.findIndex((r) => r.key === ideas.selected?.key)
    const to = i >= 0 ? i + by : by > 0 ? lastAt.current : lastAt.current - 1
    const next = list[Math.min(list.length - 1, Math.max(0, to))]!
    ideas.select(next.key)
    revealDataListRow(next.key)
  }

  const setAside = (row: IdeaRow) => {
    const next = ideas.setAside(row)
    if (next) revealDataListRow(next.key, document, { focus: "recover" })
  }
  const undo = () => {
    const key = ideas.undo()
    if (key) revealDataListRow(key, document, { focus: "recover" })
  }

  React.useEffect(() => {
    if (ideas.moved) revealDataListRow(ideas.moved.key, document, { focus: "recover" })
  }, [ideas.moved])

  // A drafted or failed note gives the foot back to the keys after a while;
  // a set-aside leaves on its own timer, when it is written.
  const { notice, dismissNotice } = ideas
  React.useEffect(() => {
    if (!notice || notice.kind === "aside") return
    const t = setTimeout(dismissNotice, 7000)
    return () => clearTimeout(t)
  }, [notice, dismissNotice])

  const open = ideas.selected
  useLetterKeys({
    j: () => move(1),
    k: () => move(-1),
    "/": () => searchRef.current?.focus(),
    d: { once: true, run: () => (open?.angle ? void ideas.draft(open) : undefined) },
    n: { once: true, run: () => (open ? setAside(open) : undefined) },
    u: undo,
  })

  const { showOpen, select } = ideas
  const captured = React.useCallback(
    (riffId: string) => {
      showOpen()
      select(riffId)
    },
    [showOpen, select]
  )

  const nothingYet = riffs.length === 0
  const detail = (row: IdeaRow, { inline = false }: { inline?: boolean } = {}) => (
    <IdeaDetail
      row={row}
      ideas={ideas}
      gaps={gaps[row.riff.id] ?? []}
      writes={writes}
      steering={steering}
      onSteeringChange={setSteering}
      onSetAside={setAside}
      titleHidden={inline}
    />
  )

  return (
    <>
      {/* Mounts a timer only while something is being read. */}
      <RiffsRefresh active={riffs.some((r) => r.state === "working")} />

      <Toolbar label="Ideas" divided={false}>
        <div className="flex min-w-0 items-baseline gap-kit-related">
          <ToolbarTitle>Ideas</ToolbarTitle>
          <IdeasSummary rows={ideas.rows} pace={pace} />
        </div>
        <ToolbarGroup end grow>
          <SearchField
            ref={searchRef}
            size="sm"
            shortcut="/"
            aria-label="Search ideas"
            placeholder="Search ideas"
            value={ideas.filters.q}
            onValueChange={(q) => ideas.setFilter("q", q)}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <RecordBox size="sm" onOpen={ideas.settle} onCaptured={captured} />
          <AdaptBox size="sm" onOpen={ideas.settle} onCaptured={captured} />
        </ToolbarGroup>
      </Toolbar>

      {nothingYet ? (
        <EmptyRegion edge="rule">
          <EmptyState
            frame="none"
            bold="Nothing to work on yet."
            rest="Say a half-thought, or add a source and I'll bring you the material: your merges, your meetings, the posts you save."
          >
            <ButtonLink href="/connectors?show=sources">Add a source</ButtonLink>
          </EmptyState>
        </EmptyRegion>
      ) : (
        <>
          <IdeasFilters
            ideas={ideas}
            view={fold === true ? null : <ViewSwitch value={view} onValueChange={setView} />}
          />
          <div className="ideas-folded">
          {fold !== false ? (
            <InlineIdeas
              ideas={ideas}
              detail={(row) => (
                <div className="flex flex-col gap-kit-related">
                  {/* The pane's strip, as a line: the row above names the idea, not where it came from. */}
                  <div className="flex min-w-0 items-center gap-2 text-kit-meta text-kit-ink-muted">
                    <SourceLine riff={row.riff} />
                    <span className="ms-auto shrink-0">
                      <DismissSource row={row} ideas={ideas} />
                    </span>
                  </div>
                  {detail(row, { inline: true })}
                </div>
              )}
            />
          ) : null}
          </div>
          <div className="ideas-unfolded">
          {fold !== true ? (
            <WorkspacePanes>
              <Panel label="Ideas">
                <PanelBody>
                  <DataList
                    label="Ideas"
                    aria-keyshortcuts="j k d n u"
                    items={view === "flat" ? ideas.shown : undefined}
                    groups={view === "grouped" ? bySource(ideas.shown) : undefined}
                    getKey={(r) => r.key}
                    getLabel={(r) => r.title}
                    value={open?.key ?? null}
                    onValueChange={ideas.select}
                    columns={IDEA_COLUMNS}
                    empty={<FilteredEmpty ideas={ideas} />}
                  />
                </PanelBody>
              </Panel>
              <Panel label="Open idea" width={DETAIL_WIDTH} edge="start">
                <PanelBody label="Where the idea came from" scrollKey={open?.riff.id ?? null}>
                  {open ? (
                    <>
                      <PanelHeader end={<DismissSource row={open} ideas={ideas} />}>
                        <SourceLine riff={open.riff} />
                      </PanelHeader>
                      <div className="px-kit-group py-kit-group">{detail(open)}</div>
                    </>
                  ) : (
                    <>
                      <PanelHeader>
                        <span aria-hidden />
                      </PanelHeader>
                      <div className="flex flex-col gap-kit-tight px-kit-group pt-kit-group">
                        <p className="text-kit-dense font-kit-strong text-kit-ink">Nothing open.</p>
                        <p className="text-kit-dense text-pretty text-kit-ink-muted">
                          Pick an idea, or press j, to see the sentence it came from.
                        </p>
                      </div>
                    </>
                  )}
                </PanelBody>
              </Panel>
            </WorkspacePanes>
          ) : null}
          </div>
        </>
      )}

      {/* No keys to show over nothing; an Undo still needs its foot. */}
      {nothingYet && !ideas.notice ? null : <IdeasFoot ideas={ideas} onUndo={undo} />}
    </>
  )
}

/* ── The head ─────────────────────────────────────────────────────────── */

/**
 * The one number on the page, against the person's own week only: "17 ideas
 * waiting. None drafted this week; you usually draft 4." The usual week is
 * dropped when their history cannot say it (lib/ideas-pace.ts).
 */
function IdeasSummary({ rows, pace }: { rows: readonly IdeaRow[]; pace: IdeasPace }) {
  const waiting = rows.filter((r) => r.status === "waiting").length
  // An empty page says why in its own words; a count of nothing is noise.
  if (rows.length === 0) return null
  return (
    <p className="hidden truncate text-kit-meta text-kit-ink-muted @[40rem]/kit-workspace:block">
      {waiting === 0 ? (
        "Nothing is waiting on you."
      ) : (
        <>
          <Count value={waiting} /> {waiting === 1 ? "idea" : "ideas"} waiting.
        </>
      )}{" "}
      {pace.usual != null ? (
        <>
          {pace.thisWeek === 0 ? "None" : <Count value={pace.thisWeek} />} drafted this week; you usually draft{" "}
          <Count value={pace.usual} />.
        </>
      ) : pace.thisWeek > 0 ? (
        <>
          <Count value={pace.thisWeek} /> drafted this week.
        </>
      ) : null}
    </p>
  )
}

/** The filters, each with what it would leave, a Clear once one is on, the count, and the view. */
function IdeasFilters({ ideas, view }: { ideas: IdeasState; view: React.ReactNode }) {
  const f = ideas.filters
  const count = `${ideas.shown.length} of ${ideas.rows.length}`
  // Said when the filters or the search change, once the typing stops; not
  // when a row leaves, where it would talk over "Set aside … Press U".
  const announce = useAnnounce()
  const said = React.useRef(count)
  React.useLayoutEffect(() => {
    said.current = count
  })
  const key = JSON.stringify(f)
  const first = React.useRef(true)
  React.useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    const t = setTimeout(() => announce(`${said.current} ideas`), 500)
    return () => clearTimeout(t)
  }, [key, announce])

  return (
    <Toolbar label="Filters" size="filter">
      <ToolbarGroup>
        <FilterMenu<StatusFilter>
          label="Status"
          value={f.status}
          options={optionsFor(ideas.rows, f, "status")}
          onValueChange={(v) => ideas.setFilter("status", v)}
        />
        <FilterMenu label="Source" value={f.source} options={optionsFor(ideas.rows, f, "source")} onValueChange={(v) => ideas.setFilter("source", v)} />
        <FilterMenu label="Shape" value={f.shape} options={optionsFor(ideas.rows, f, "shape")} onValueChange={(v) => ideas.setFilter("shape", v)} />
        <FilterMenu label="For" value={f.channel} options={optionsFor(ideas.rows, f, "channel")} onValueChange={(v) => ideas.setFilter("channel", v)} />
        {filtersOn(f) ? (
          <Button size="xs" variant="ghost" onClick={ideas.clearFilters}>
            Clear
          </Button>
        ) : null}
      </ToolbarGroup>
      <ToolbarGroup end>
        <span className="font-kit-mono text-kit-mono-sm whitespace-nowrap text-kit-ink-muted tabular-nums">{count}</span>
        {view ? (
          // Off under the fold, where the one column has no view to switch.
          <span className="ideas-unfolded">
            <ToolbarDivider />
            {view}
          </span>
        ) : null}
      </ToolbarGroup>
    </Toolbar>
  )
}

function ViewSwitch({ value, onValueChange }: { value: "flat" | "grouped"; onValueChange: (v: "flat" | "grouped") => void }) {
  return (
    <Segmented
      size="xs"
      aria-label="View"
      value={value}
      onValueChange={onValueChange}
      options={[
        { value: "flat", label: "Every idea, newest first", icon: Menu01Icon },
        { value: "grouped", label: "Grouped by source", icon: Layers01Icon },
      ]}
    />
  )
}

/** The rows of each source together, newest source first (the order they already have). */
function bySource(rows: readonly IdeaRow[]): DataListGroup<IdeaRow>[] {
  const groups = new Map<string, IdeaRow[]>()
  for (const r of rows) groups.set(r.riff.id, [...(groups.get(r.riff.id) ?? []), r])
  return [...groups.values()].map((items) => {
    const riff = items[0]!.riff
    const ideas = items.filter((r) => r.angle).length
    const n = ideas === 1 ? "1 idea" : `${ideas} ideas`
    return {
      key: riff.id,
      name: ideas > 0 ? `${n} from ${sourceName(riff)}, ${riff.capturedAt}` : `${sourceName(riff)}, ${riff.capturedAt}`,
      label: (
        <>
          <SourceGlyph id={riff.sourceId} size="dense" />
          <span className="truncate font-kit-strong text-kit-ink">{sourceName(riff)}</span>
          <span>·</span>
          <span className="font-kit-mono text-kit-mono-sm">{ageOf(riff)}</span>
          {ideas > 0 ? (
            <>
              <span>·</span>
              <span>{n}</span>
            </>
          ) : null}
        </>
      ),
      items,
    }
  })
}

/**
 * Under the column heads when a filter or the search leaves nothing. Bare:
 * the region around it (DataList's, or the inline list's EmptyRegion)
 * centres it. Its action takes its own button away with the empty state,
 * so focus follows to the rows it brought back.
 */
function FilteredEmpty({ ideas }: { ideas: IdeasState }) {
  const on = filtersOn(ideas.filters)
  const clear = () => {
    ideas.clearFilters()
    focusRestoredDataList()
  }
  const showOpen = () => {
    ideas.showOpen()
    focusRestoredDataList()
  }
  return (
    <EmptyState
      frame="none"
      bold={on ? "No ideas match." : ideas.filters.status === "open" ? "Nothing is waiting on you." : "No ideas here."}
      rest={
        on
          ? "Clear a filter, or search for a word you said."
          : ideas.filters.status === "open"
            ? "Every idea here is drafted or set aside. Record a thought, and the ideas in it show here."
            : "Nothing has been drafted from an idea yet."
      }
    >
      {on ? (
        <Button size="xs" onClick={clear}>
          Clear filters
        </Button>
      ) : ideas.filters.status !== "open" ? (
        <Button size="xs" onClick={showOpen}>
          Show open ideas
        </Button>
      ) : null}
    </EmptyState>
  )
}

/* ── The foot ─────────────────────────────────────────────────────────── */

/** The KeyBar, or the note after an action in its place, the same 36px, so nothing moves. */
function IdeasFoot({ ideas, onUndo }: { ideas: IdeasState; onUndo: () => void }) {
  const notice = ideas.notice
  if (!notice) return <KeyBar keys={KEYS} />
  return (
    <FootBar>
      <p className="min-w-0 flex-1 truncate text-kit-meta text-kit-ink-muted">
        {notice.kind === "aside"
          ? asideSentence(notice.aside)
          : notice.kind === "drafted"
            ? notice.fellBack
              ? `Drafted “${notice.title}”, but only the hook came out.`
              : `Drafted “${notice.title}”. It waits in Drafts.`
            : notice.message}
      </p>
      {notice.kind === "aside" ? (
        <Button size="xs" variant="ghost" shortcut="U" onClick={onUndo}>
          Undo
        </Button>
      ) : notice.kind === "drafted" ? (
        <ButtonLink size="xs" href="/drafts">
          Open Drafts
        </ButtonLink>
      ) : null}
    </FootBar>
  )
}

/* ── The open idea ────────────────────────────────────────────────────── */

/** Where it came from, on the pane's strip: glyph, name, age, and whose post it adapts. */
function SourceLine({ riff }: { riff: Riff }) {
  return (
    <>
      <span className="text-kit-ink-muted">
        <SourceGlyph id={riff.sourceId} size="dense" />
      </span>
      <span className="truncate">{sourceName(riff)}</span>
      <span aria-hidden>·</span>
      <span className="font-kit-mono text-kit-mono-sm">{ageOf(riff)}</span>
      {riff.adaptedFrom?.handle ? (
        <>
          <span aria-hidden>·</span>
          <span className="truncate">{`from @${riff.adaptedFrom.handle}`}</span>
        </>
      ) : null}
    </>
  )
}

/** Dismiss every idea from this source (archived, not deleted), with an Undo. */
function DismissSource({ row, ideas }: { row: IdeaRow; ideas: IdeasState }) {
  return (
    <Button
      size="xs"
      variant="ghost"
      onClick={() => {
        const next = ideas.setAsideSource(row.riff)
        if (next) revealDataListRow(next.key, document, { focus: "recover" })
      }}
    >
      Dismiss source
    </Button>
  )
}

function IdeaDetail({
  row,
  ideas,
  gaps,
  writes,
  steering,
  onSteeringChange,
  onSetAside,
  titleHidden = false,
}: {
  row: IdeaRow
  ideas: IdeasState
  gaps: { id: string; label: string }[]
  writes: Partial<Record<Angle["shape"], number>>
  steering: boolean
  onSteeringChange: (typing: boolean) => void
  onSetAside: (row: IdeaRow) => void
  /** In a narrow row, whose own line already names the source. */
  titleHidden?: boolean
}) {
  const riff = row.riff
  const hasIdeas = riff.state === "ready" && riff.angles.length > 0
  const rowsByKey = new Map(ideas.rows.filter((r) => r.riff.id === riff.id).map((r) => [r.key, r]))
  return (
    <div className="flex flex-col gap-kit-group">
      <MarkedUp riff={riff} value={row.angle?.id ?? null} onValueChange={ideas.select}>
        <MarkedUpTitle hidden={titleHidden} />
        <MarkedUpColumns>
          <MarkedUpProse>
            <SourceState row={row} onSetAside={onSetAside} />
          </MarkedUpProse>
          {hasIdeas ? (
            <MarkedUpMargin>
              {(idea) => (
                <MarginIdea key={idea.angle.id} idea={idea}>
                  {idea.open && rowsByKey.get(idea.angle.id) ? (
                    <OpenIdea
                      row={rowsByKey.get(idea.angle.id)!}
                      writes={writes[idea.angle.shape]}
                      isAction={!steering}
                      pending={ideas.pending.has(idea.angle.id)}
                      refusal={ideas.refusals.get(idea.angle.id) ?? null}
                      onDraft={(r) => void ideas.draft(r)}
                      onSetAside={onSetAside}
                    />
                  ) : null}
                </MarginIdea>
              )}
            </MarkedUpMargin>
          ) : null}
        </MarkedUpColumns>
      </MarkedUp>
      {hasIdeas ? (
        <div className="flex flex-col gap-kit-related">
          <ChannelGaps riffId={riff.id} gaps={gaps} onAsk={ideas.settle} />
          <Steer key={riff.id} riffId={riff.id} onTypingChange={onSteeringChange} onAsk={ideas.settle} />
        </div>
      ) : null}
    </div>
  )
}

/** Under the prose, for a source with no idea open: being read, failed, emptied. */
function SourceState({ row, onSetAside }: { row: IdeaRow; onSetAside: (row: IdeaRow) => void }) {
  const riff = row.riff
  if (riff.state === "working") {
    return (
      <p className="text-kit-dense text-kit-ink-muted">
        <span className="inline-flex items-center gap-2">
          <Friend size={20} state="reading" className="shrink-0" />
          <span className="min-w-0">
            {riff.stuck ? "This is taking longer than usual." : "Reading it. Ideas usually land within a minute."}
          </span>
        </span>
      </p>
    )
  }
  if (row.angle) return null
  const words =
    riff.state === "failed"
      ? `I couldn't find a post in it.${riff.failure ? ` ${riff.failure}` : ""}`
      : "No ideas left on this one. Every one was set aside."
  return (
    <div className="flex flex-col items-start gap-kit-related">
      <p className="text-kit-dense text-pretty text-kit-ink-muted">{words}</p>
      <Button size="sm" variant="ghost" shortcut="N" onClick={() => onSetAside(row)}>
        Dismiss
      </Button>
    </div>
  )
}

/**
 * The open idea's body in the margin: what it is, why, what Draft writes,
 * and its two verbs. Draft is the page's ink (unless an ask is being
 * typed); Not this one is ghost, after it.
 */
function OpenIdea({
  row,
  writes,
  isAction,
  pending,
  refusal,
  onDraft,
  onSetAside,
}: {
  row: IdeaRow
  writes: number | undefined
  isAction: boolean
  pending: boolean
  refusal: DraftRefusal | null
  onDraft: (row: IdeaRow) => void
  onSetAside: (row: IdeaRow) => void
}) {
  const angle = row.angle!
  const hookId = React.useId()
  const drafted = row.status === "drafted"
  const openDrafts = React.useRef<HTMLAnchorElement>(null)
  const pressed = React.useRef(false)

  // Draft → Open Drafts: the pressed button leaves, so focus moves to its
  // counterpart instead of falling to the page.
  React.useEffect(() => {
    if (drafted && pressed.current) {
      pressed.current = false
      openDrafts.current?.focus()
    }
  }, [drafted])

  return (
    <>
      <span id={hookId} hidden>
        {angle.hook}
      </span>
      {/* One muted line, the facts separated by a dot. */}
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {angle.kind ? (
          <>
            <Tag look="text">{angle.kind}</Tag>
            <span aria-hidden className="text-kit-meta text-kit-ink-muted">·</span>
          </>
        ) : null}
        <Tag look="text">{angle.shape}</Tag>
        {row.channels.length > 0 ? <span aria-hidden className="text-kit-meta text-kit-ink-muted">·</span> : null}
        {row.channels.length > 0 ? <IdeaChannels channels={row.channels} /> : null}
      </div>
      {angle.why ? <p className="text-kit-meta text-pretty text-kit-ink-muted">{angle.why}</p> : null}

      {drafted ? (
        <div className="flex flex-wrap items-center gap-kit-related">
          <p className="text-kit-meta text-kit-ink-muted">
            {angle.fellBack
              ? "Drafted, but only the hook came out. Write the rest in Drafts."
              : "Drafted. It waits in Drafts until you approve it."}
          </p>
          <ButtonLink ref={openDrafts} size="xs" href="/drafts">
            Open Drafts
          </ButtonLink>
        </div>
      ) : refusal ? (
        <div role="status" className="flex flex-col items-start gap-kit-related">
          <Text variant="small">{refusal.message}</Text>
          <div className="flex flex-wrap gap-kit-controls">
            {refusal.reason === "entitlement" ? (
              <ButtonLink size="xs" href="/settings?section=plan">
                See plans
              </ButtonLink>
            ) : refusal.reason === "no-channel" ? (
              <ButtonLink size="xs" href="/connectors?show=channels">
                Connect a channel
              </ButtonLink>
            ) : null}
            <Button size="xs" aria-describedby={hookId} onClick={() => onDraft(row)}>
              Try again
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-kit-tight">
          <div className="flex flex-wrap items-center gap-kit-controls">
            <Button
              variant={isAction ? "action" : "quiet"}
              size="sm"
              shortcut="D"
              aria-describedby={hookId}
              pending={pending}
              pendingLabel="Drafting…"
              onClick={() => {
                pressed.current = true
                onDraft(row)
              }}
            >
              Draft this idea
            </Button>
            <Button size="sm" variant="ghost" shortcut="N" aria-describedby={hookId} onClick={() => onSetAside(row)}>
              Not this one
            </Button>
          </div>
          {writesSentence(angle, writes) ? (
            <p className="text-kit-meta text-kit-ink-muted">{writesSentence(angle, writes)}</p>
          ) : null}
        </div>
      )}
    </>
  )
}

/* ── The fold: one column, rows that open in place ────────────────────── */

/**
 * Under the fold: the same rows, grouped by day, as disclosure buttons (an
 * open row holds buttons of its own, which a listbox option may not). The
 * open row unfolds into the same detail the pane shows. Each row carries
 * `data-kit-row`, so j / k and focus-after-an-action work as in the table.
 */
function InlineIdeas({ ideas, detail }: { ideas: IdeasState; detail: (row: IdeaRow) => React.ReactNode }) {
  // A row closed by hand stays closed until another opens (the open idea is
  // still the URL's; this only folds it away).
  const [closed, setClosed] = React.useState<string | null>(null)
  const open = ideas.selected && ideas.selected.key !== closed ? ideas.selected : null

  const days = React.useMemo(() => {
    const m = new Map<string, IdeaRow[]>()
    for (const day of ["Today", "Yesterday", "Earlier"]) m.set(day, [])
    for (const r of ideas.shown) m.get(dayOf(r.riff))!.push(r)
    return [...m.entries()].filter(([, rs]) => rs.length > 0)
  }, [ideas.shown])

  function onListKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return
    const t = e.target as HTMLElement
    if (!t.matches("[data-kit-row]")) return
    e.preventDefault()
    const all = [...e.currentTarget.querySelectorAll<HTMLElement>("[data-kit-row]")]
    const next = all[all.indexOf(t) + (e.key === "ArrowDown" ? 1 : -1)]
    if (next?.dataset.kitRow) {
      next.focus()
      setClosed(null)
      ideas.select(next.dataset.kitRow)
    }
  }

  if (ideas.shown.length === 0) {
    return (
      <PanelBody>
        <EmptyRegion>
          <FilteredEmpty ideas={ideas} />
        </EmptyRegion>
      </PanelBody>
    )
  }

  return (
    <PanelBody>
      <div onKeyDown={onListKey} className="mx-auto flex w-full max-w-[60rem] flex-col gap-kit-related px-2 py-kit-related @[40rem]/kit-workspace:px-kit-group">
        {days.map(([day, rows]) => (
          <section key={day} aria-label={day} className="flex flex-col gap-px">
            <h2 aria-hidden className="px-3 pt-kit-related pb-1 text-kit-meta font-kit-strong text-kit-ink-muted">
              {day}
            </h2>
            <ul className="flex flex-col gap-px">
              {rows.map((r) => (
                <InlineRow
                  key={r.key}
                  row={r}
                  open={open?.key === r.key}
                  onToggle={(was) => {
                    if (was) setClosed(r.key)
                    else {
                      setClosed(null)
                      ideas.select(r.key)
                    }
                  }}
                >
                  {detail(r)}
                </InlineRow>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </PanelBody>
  )
}

function InlineRow({
  row,
  open,
  onToggle,
  children,
}: {
  row: IdeaRow
  open: boolean
  onToggle: (wasOpen: boolean) => void
  /** The detail, mounted only while open: one detail, one Highlight on the page. */
  children: React.ReactNode
}) {
  const panelId = React.useId()
  const buttonRef = React.useRef<HTMLButtonElement>(null)
  React.useEffect(() => {
    if (open) buttonRef.current?.scrollIntoView({ block: "nearest" })
  }, [open])
  return (
    <li
      data-open={open || undefined}
      className="rounded-kit-control transition-[background-color,box-shadow] duration-(--kit-duration-state) ease-kit-out data-open:bg-kit-object data-open:shadow-kit-object motion-reduce:transition-none"
    >
      <button
        ref={buttonRef}
        type="button"
        data-kit-row={row.key}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => onToggle(open)}
        className={
          `relative grid w-full scroll-mt-2 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-x-3 rounded-kit-control px-3 py-1.5 text-left pointer-coarse:min-h-11 ${FOCUS_RING} focus-visible:outline-offset-0 ` +
          "@[40rem]/kit-workspace:grid-cols-[1rem_minmax(0,1fr)_5.5rem_3.25rem_3rem] " +
          "transition-[background-color] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-none " +
          (open ? "" : "hover:bg-kit-row-hover")
        }
      >
        <span className="grid place-items-center text-kit-ink-muted">
          <SourceGlyph id={row.riff.sourceId} size="dense" />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className={`min-w-0 text-kit-dense ${open ? "font-kit-strong text-pretty text-kit-ink" : `truncate ${row.status === "waiting" ? "text-kit-ink" : "text-kit-ink-muted"}`}`}
            >
              {row.title}
            </span>
            {row.status === "drafted" ? <StatusMark status="drafted" /> : null}
          </span>
          {/* On a phone the columns fold into one meta line. */}
          <span className="flex min-w-0 items-center gap-1.5 @[40rem]/kit-workspace:hidden">
            <span className="min-w-0 truncate text-kit-meta text-kit-ink-muted">{sourceName(row.riff)}</span>
            <span aria-hidden className="text-kit-meta text-kit-ink-muted">·</span>
            <IdeaShape row={row} />
          </span>
        </span>
        <span className="hidden min-w-0 @[40rem]/kit-workspace:flex">
          <IdeaShape row={row} />
        </span>
        <span className="hidden @[40rem]/kit-workspace:flex">
          <IdeaChannels channels={row.channels} />
        </span>
        <span className="self-start pt-0.5 text-right font-kit-mono text-kit-mono-sm text-kit-ink-muted tabular-nums @[40rem]/kit-workspace:self-center @[40rem]/kit-workspace:pt-0">
          {ageOf(row.riff)}
        </span>
      </button>
      {open ? (
        <div id={panelId} role="region" aria-label={`Where “${row.title}” came from`} className="px-3 pb-3 @[40rem]/kit-workspace:ps-10">
          <div className="border-t border-kit-hairline pt-kit-related">{children}</div>
        </div>
      ) : null}
    </li>
  )
}
