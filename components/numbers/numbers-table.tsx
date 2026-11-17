"use client"

import * as React from "react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
import {
  MIN_WEEKS,
  dayLabel,
  fmt,
  formatMultiple,
  type Against,
  type NumbersData,
  type Period,
  type Person,
  type Post,
  type Read,
  type Show,
  type TableState,
} from "@/lib/numbers-read"
import {
  BeatBracket,
  Beats,
  Button,
  ButtonLink,
  DataList,
  DataListMono,
  DataListTitle,
  EmptyState,
  FilterMenu,
  KeyBar,
  Panel,
  PanelBody,
  PanelHeader,
  Text,
  TextLink,
  Toolbar,
  ToolbarGroup,
  WorkspacePanes,
  focusRestoredDataList,
  revealDataListRow,
  useLetterKeys,
  useWorkspaceFold,
  type DataListColumn,
} from "@/components/kit"
import { useControllable } from "@/components/kit/use-controllable"

import { Climb, MultipleBar } from "./charts"

/**
 * Table: what the Dashboard opens. The posts of the period as a dense table
 * whose columns are already against your median (a bar from the median
 * line, × median, replies), and the open post beside it: its numbers, how
 * it climbed, the three beats when the post has them. Under 900px of
 * workspace the pane folds away and a row opens in its place.
 *
 * Its filters are the URL's (`show`, `order`, `against`, `post`), so a tile
 * lands here already filtered to its measure and a "What worked" row lands
 * with that post open. Esc goes back to the Dashboard, after first closing
 * a post opened in place.
 */

type Row = { post: Post; multiple: number | null }

/**
 * Below 900px of workspace the pane folds and a row opens in place. The fold
 * is CSS (useWorkspaceFold), so a link straight to Table paints the right
 * side at once. Literal, so Tailwind sees the classes.
 */
const FOLDED = "contents @[900px]/kit-workspace:hidden"
const UNFOLDED = "hidden @[900px]/kit-workspace:contents"
const FOLD_PROBE = "block @[900px]/kit-workspace:hidden"
const PANE = "clamp(400px, 40cqi, 560px)"

const SHOW_LABEL: Record<Show, string> = {
  all: "Every post",
  replies: "Got replies",
  returning: "Someone came back",
}

function passAgainst(a: Against, r: Row) {
  if (a === "any") return true
  if (r.multiple === null) return false
  return a === "above" ? r.multiple >= 1 : a === "below" ? r.multiple < 1 : r.multiple >= 3
}

/** Every post, newest first, none open: Table with nothing asked of it. */
export const TABLE_DEFAULT: TableState = { post: null, show: "all", order: "newest", against: "any" }

export type NumbersTableProps = {
  data: NumbersData
  read: Read
  /** Controlled: the filters and the open post (`post`). */
  value?: TableState
  /** Uncontrolled starting filters and open post. */
  defaultValue?: TableState
  /** The whole next state, after a filter changed or a post opened. */
  onValueChange?: (next: TableState) => void
  /** The empty state's "Show 90 days". */
  onPeriodChange: (p: Period) => void
  /** Esc with nothing open in place: back to the Dashboard. */
  onBack: () => void
}

export function NumbersTable({ data, read, value, defaultValue = TABLE_DEFAULT, onValueChange, onPeriodChange, onBack }: NumbersTableProps) {
  const [table, setState] = useControllable(value, defaultValue, onValueChange)
  const setTable = (next: Partial<TableState>) => setState({ ...table, ...next })
  // CSS picks the side; script reads which, after mount (null until then: both render, CSS shows one).
  const [probe, fold] = useWorkspaceFold()
  const [detail, setDetail] = React.useState(table.post !== null)
  const { against, order, show } = table

  const all: Row[] = read.scored
  const people = data.people
  // A post someone came back to: one of its repliers had replied to an earlier post.
  const returning = React.useMemo(() => {
    if (!people) return new Set<string>()
    const byId = new Map(people.map((p) => [p.id, p]))
    return new Set(all.filter((r) => r.post.repliers.some((id) => byId.get(id)?.replyDays.some((d) => d > r.post.day!))).map((r) => r.post.id))
  }, [all, people])

  const passShow = (v: Show, r: Row) => (v === "all" ? true : v === "replies" ? r.post.replies > 0 : returning.has(r.post.id))

  // A few dozen rows: filtered on every render, no memo to keep in step.
  const kept = all.filter((r) => passAgainst(against, r) && passShow(show, r))
  const rows =
    order === "best"
      ? [...kept].sort((a, b) => b.post.views - a.post.views)
      : order === "replies"
        ? [...kept].sort((a, b) => b.post.replies - a.post.replies || b.post.views - a.post.views)
        : kept

  // Keep the open row when a filter hides it; open the first when none is open.
  const current = table.post && all.some((r) => r.post.id === table.post) ? table.post : (rows[0]?.post.id ?? null)
  const openRow = all.find((r) => r.post.id === current) ?? null
  const open = (id: string) => setTable({ post: id })

  // Arriving with a post: bring its row into view, once the fold has settled.
  const arrival = React.useRef(table.post)
  React.useEffect(() => {
    const key = arrival.current
    if (!key || fold !== false) return
    arrival.current = null
    requestAnimationFrame(() => document.querySelector(`[data-kit-row="${CSS.escape(key)}"]`)?.scrollIntoView({ block: "nearest" }))
  }, [fold])

  const move = (d: 1 | -1) => {
    const i = rows.findIndex((r) => r.post.id === current)
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + d))]
    if (next) {
      open(next.post.id)
      revealDataListRow(next.post.id)
    }
  }
  useLetterKeys({ j: () => move(1), k: () => move(-1) })

  // Esc: a post opened in place closes first, then Table goes back to the Dashboard.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape" || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return
      const t = e.target instanceof HTMLElement ? e.target : null
      if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return
      if (document.querySelector('[role="menu"], [role="listbox"][data-open], [role="dialog"], [role="alertdialog"]')) return
      e.preventDefault()
      if (fold && detail) setDetail(false)
      else onBack()
    }
    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [onBack, fold, detail])

  const columns: DataListColumn<Row>[] = [
    { id: "post", header: "Post", width: "minmax(0,1fr)", cell: (r) => <DataListTitle>{r.post.hook}</DataListTitle>, skeleton: "title" },
    { id: "day", header: "Out", width: "3.5rem", align: "end", wide: true, cell: (r) => <DataListMono>{dayLabel(data.today, r.post.day!)}</DataListMono> },
    {
      id: "views",
      header: "Views",
      width: "4rem",
      align: "end",
      cell: (r) => (
        <>
          <DataListMono>{fmt(r.post.views)}</DataListMono>
          <span className="sr-only"> views</span>
        </>
      ),
    },
    {
      id: "against",
      header: "Against your median",
      width: "9rem",
      wide: true,
      cell: (r) => (
        <span className="flex w-full items-center">
          <MultipleBar multiple={r.multiple} tone={r.post.id === current ? "ink" : "muted"} />
        </span>
      ),
    },
    {
      id: "multiple",
      header: "× median",
      width: "4rem",
      align: "end",
      cell: (r) => (
        <>
          <DataListMono>{r.multiple === null ? "—" : formatMultiple(r.multiple)}</DataListMono>
          <span className="sr-only">{r.multiple === null ? "no median yet" : " your median"}</span>
        </>
      ),
    },
    {
      id: "replies",
      header: "Replies",
      width: "3.5rem",
      align: "end",
      cell: (r) => (
        <>
          <DataListMono>{r.post.replies}</DataListMono>
          <span className="sr-only"> {r.post.replies === 1 ? "reply" : "replies"}</span>
        </>
      ),
    },
  ]

  const filtered = against !== "any" || show !== "all"
  const notRead = show === "returning" && people === null
  const empty = (
    <EmptyState
      frame="none"
      bold={notRead ? "I can't tell who came back yet." : all.length === 0 ? `Nothing went out in the last ${read.days} days.` : "No posts match."}
      rest={notRead ? "I count replies; who wrote them isn't read yet. Show every post instead." : all.length === 0 ? "Pick a longer period." : "Clear the filters."}
    >
      {all.length === 0 && read.days < 90 ? (
        <Button size="xs" onClick={() => onPeriodChange("90")}>
          Show 90 days
        </Button>
      ) : all.length === 0 ? null : (
        <Button
          size="xs"
          onClick={() => {
            setTable({ against: "any", show: "all" })
            focusRestoredDataList()
          }}
        >
          {notRead ? "Show every post" : "Clear filters"}
        </Button>
      )}
    </EmptyState>
  )

  const list = (
    <DataList
      label={`Posts, ${SHOW_LABEL[show].toLowerCase()}`}
      aria-keyshortcuts="j k Escape"
      items={rows}
      getKey={(r) => r.post.id}
      getLabel={(r) => r.post.hook}
      value={current}
      onValueChange={(k) => {
        open(k)
        if (fold) setDetail(true)
      }}
      columns={columns}
      status="ready"
      empty={empty}
    />
  )

  // "Someone came back" is offered only once who replied can be read.
  const shows = (people === null ? (["all", "replies"] as const) : (["all", "replies", "returning"] as const)) satisfies readonly Show[]

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <span ref={probe} aria-hidden className={FOLD_PROBE} />
      <Toolbar label="Filters" size="filter">
        <ToolbarGroup>
          <FilterMenu
            label="Show"
            value={show}
            onValueChange={(v) => setTable({ show: v })}
            options={shows.map((v) => ({ value: v, label: SHOW_LABEL[v], count: all.filter((r) => passAgainst(against, r) && passShow(v, r)).length }))}
          />
          <FilterMenu
            label="Against your median"
            value={against}
            onValueChange={(v) => setTable({ against: v })}
            options={(
              [
                ["any", "Any"],
                ["above", "Above your median"],
                ["below", "Below your median"],
                ["outlier", "3× or more"],
              ] as const
            ).map(([v, label]) => ({ value: v, label, count: all.filter((r) => passAgainst(v, r) && passShow(show, r)).length }))}
          />
        </ToolbarGroup>
        <ToolbarGroup>
          <FilterMenu
            label="Order"
            value={order}
            onValueChange={(v) => setTable({ order: v })}
            options={[
              { value: "newest", label: "Newest first", count: rows.length },
              { value: "best", label: "Most views first", count: rows.length },
              { value: "replies", label: "Most replies first", count: rows.length },
            ]}
          />
          {filtered ? (
            <Button size="xs" variant="ghost" onClick={() => setTable({ against: "any", show: "all" })}>
              Clear
            </Button>
          ) : null}
        </ToolbarGroup>
        <ToolbarGroup end>
          <span className="text-kit-meta text-kit-ink-muted tabular-nums">
            {`${rows.length} of ${all.length} posts · median ${read.medianViews === null ? "not yet" : fmt(read.medianViews)}`}
          </span>
        </ToolbarGroup>
      </Toolbar>
      <div className={FOLDED}>
      {fold !== false ? (
        detail && openRow ? (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="px-kit-group pt-kit-related">
              <Button size="xs" variant="ghost" icon={ArrowLeft01Icon} onClick={() => setDetail(false)}>
                Posts
              </Button>
            </div>
            <PostDetail row={openRow} read={read} people={people} />
          </div>
        ) : (
          // A tap on the row that is already open still opens it: the list
          // only reports a change of value.
          <div
            className="flex min-h-0 flex-1 flex-col"
            onClick={(e) => {
              if ((e.target as Element).closest("[data-kit-row]")) setDetail(true)
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.target as Element).closest("[data-kit-row]")) setDetail(true)
            }}
          >
            {list}
          </div>
        )
      ) : null}
      </div>
      <div className={UNFOLDED}>
      {fold !== true ? (
        <WorkspacePanes>
          <Panel label="Posts">
            <PanelBody>{list}</PanelBody>
          </Panel>
          <Panel label="Open post" width={PANE} edge="start">
            <PanelBody label="The open post" scrollKey={current}>
              {openRow ? (
                <>
                  <PanelHeader>
                    <span>On X</span>
                    <span aria-hidden>·</span>
                    <span className="font-kit-mono text-kit-mono-sm">{dayLabel(data.today, openRow.post.day!)}</span>
                  </PanelHeader>
                  <PostDetail row={openRow} read={read} people={people} />
                </>
              ) : (
                <PanelHeader>
                  <span aria-hidden />
                </PanelHeader>
              )}
            </PanelBody>
          </Panel>
        </WorkspacePanes>
      ) : null}
      </div>
      <KeyBar
        keys={[
          { keys: ["j", "k"], label: "Move" },
          { keys: ["Esc"], label: "Dashboard" },
        ]}
      />
    </div>
  )
}

function Lines({ p }: { p: Paragraph }) {
  return (
    <p className="text-kit-body leading-6 text-kit-ink">
      {p.map((l, i) => (
        <React.Fragment key={i}>
          {i > 0 ? <br /> : null}
          {l.figure ? <span className="font-kit-strong tabular-nums">{l.text}</span> : l.text}
        </React.Fragment>
      ))}
    </p>
  )
}

function PostDetail({ row, read, people }: { row: Row; read: Read; people: Person[] | null }) {
  const { post, multiple } = row
  const beats = post.body ? readBeats(post.body) : null

  return (
    <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
      {/* The post, with its beats when it has them. Why it worked is read off the post, never guessed. */}
      <section aria-label="The post" className="@container/kit-stage flex flex-col gap-kit-related">
        {post.body === null ? (
          <p className="text-kit-dense text-kit-ink-muted">
            I measured this post, but its text isn&apos;t in Quincy yet: the import hasn&apos;t caught up with it.{" "}
            <TextLink href={`https://x.com/i/status/${encodeURIComponent(post.id)}`}>Open it on X</TextLink>
          </p>
        ) : beats ? (
          <Beats>
            <div className="flex flex-col gap-kit-related">
              <BeatBracket beat="did">
                <Lines p={beats.did} />
              </BeatBracket>
              <BeatBracket beat="happened">
                <Lines p={beats.happened} />
              </BeatBracket>
              <BeatBracket beat="meant">
                <Lines p={beats.meant} />
              </BeatBracket>
            </div>
          </Beats>
        ) : (
          paragraphsOf(post.body).map((p, i) => <Lines key={i} p={p} />)
        )}
      </section>

      <dl className="grid grid-cols-2 gap-kit-related border-t border-kit-hairline pt-kit-group">
        <div className="flex flex-col gap-kit-tight">
          <dt className="text-kit-meta text-kit-ink-muted">Views</dt>
          <dd className="flex flex-col gap-kit-tight">
            <Text variant="figure">{fmt(post.views)}</Text>
            <span className="text-kit-meta text-kit-ink-muted tabular-nums">
              {multiple === null || read.medianViews === null
                ? `Needs ${MIN_WEEKS} weeks for a median.`
                : `${formatMultiple(multiple)} your median post, ${fmt(read.medianViews)}.`}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-kit-tight">
          <dt className="text-kit-meta text-kit-ink-muted">Replies</dt>
          <dd className="flex flex-col gap-kit-tight">
            <Text variant="figure">{fmt(post.replies)}</Text>
            <span className="text-kit-meta text-kit-ink-muted tabular-nums">
              {read.medianReplies === null ? `Needs ${MIN_WEEKS} weeks for a usual.` : `A post of yours usually gets ${fmt(read.medianReplies)}.`}
            </span>
          </dd>
        </div>
      </dl>
      <p className="-mt-kit-related text-kit-meta text-kit-ink-muted tabular-nums">
        {post.likes} likes, {post.bookmarks} bookmarks, {post.reposts} reposts.
      </p>

      <section aria-label="How it climbed" className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
        <h3 className="text-kit-meta font-kit-strong text-kit-ink">How it climbed</h3>
        <Climb values={post.climb} aria-label="Views by morning since it went out" />
      </section>

      <section aria-label="Who replied" className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
        <h3 className="text-kit-meta font-kit-strong text-kit-ink">Who replied</h3>
        <WhoReplied post={post} people={people} />
      </section>

      <div className="flex flex-wrap items-center gap-kit-controls border-t border-kit-hairline pt-kit-group">
        <ButtonLink href="/ideas" variant="action" size="sm">
          Draft another like it
        </ButtonLink>
        {!beats && post.body ? <span className="text-kit-meta text-kit-ink-muted">No number on its own line, so I can&apos;t name its beats.</span> : null}
      </div>
    </div>
  )
}

/** Names the people and counts first-timers, so it never contradicts the replies figure. */
function WhoReplied({ post, people }: { post: Post; people: Person[] | null }) {
  if (people === null) {
    return <p className="text-kit-meta text-pretty text-kit-ink-muted">Not read yet. I count the replies; who wrote them isn&apos;t read.</p>
  }
  if (post.replies === 0) return <p className="text-kit-meta text-kit-ink-muted">Nobody yet.</p>
  const byId = new Map(people.map((p) => [p.id, p]))
  const named = post.repliers.map((id) => byId.get(id)).filter((p) => p != null)
  const rest = post.replies - named.length
  return (
    <p className="text-kit-dense text-pretty text-kit-ink">
      {named.map((p, i) => (
        <React.Fragment key={p.id}>
          {i > 0 ? ", " : ""}
          {p.name}
          {p.replyDays.length > 1 ? <span className="text-kit-ink-muted"> ({p.replyDays.length} times)</span> : null}
        </React.Fragment>
      ))}
      {rest > 0 ? (
        <span className={named.length ? "text-kit-ink-muted" : ""}>
          {named.length ? ", and " : ""}
          {rest} {rest === 1 ? "person" : "people"} replying for the first time.
        </span>
      ) : null}
    </p>
  )
}
