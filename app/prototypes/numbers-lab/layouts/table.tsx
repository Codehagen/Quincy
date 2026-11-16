"use client"

import * as React from "react"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
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
  Toolbar,
  ToolbarGroup,
  WorkspacePage,
  WorkspacePanes,
  focusRestoredDataList,
  useLetterKeys,
  type DataListColumn,
} from "@/components/kit"

import { dayLabel, fmt, formatMultiple, type NumbersData, type Post } from "../data"
import { useLabOptions } from "../lab-options"
import { Climb, MultipleBar } from "../parts/charts"
import { EmptyNumbers, NumbersToolbar, Proposed, StateLine } from "../parts/chrome"
import type { LayoutProps } from "./types"

/**
 * B · Table and panel: the house pattern (Ideas, Drafts). Posts as a dense
 * table whose columns are already against your baseline (× your median, a
 * bar from the median line, replies against your usual), and the open post
 * beside it: its numbers, how it climbed, the three beats when the post has
 * them, and who replied. The dashboard is the column heads; there are no
 * tiles. Under ~900px of workspace the pane folds away and a row opens in
 * its place.
 */

type Against = "any" | "above" | "below" | "outlier"
type Order = "newest" | "best"
type Row = { post: Post; multiple: number | null }

const FOLD = 900

export function TableLayout({ data, read, phase, period, setPeriod, initialPost }: LayoutProps) {
  const opts = useLabOptions()
  const ref = React.useRef<HTMLDivElement>(null)
  const [fold, setFold] = React.useState<boolean | null>(null)
  const [against, setAgainst] = React.useState<Against>("any")
  const [order, setOrder] = React.useState<Order>("newest")
  const [open, setOpen] = React.useState<string | null>(initialPost)
  const [detail, setDetail] = React.useState(initialPost !== null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setFold(el.clientWidth < FOLD)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const all: Row[] = React.useMemo(
    () => read.scored.filter((s) => s.post.day !== null && s.post.day < read.days).sort((a, b) => a.post.day! - b.post.day!),
    [read.scored, read.days],
  )
  const test = (a: Against, r: Row) =>
    a === "any" || r.multiple === null ? a === "any" : a === "above" ? r.multiple >= 1 : a === "below" ? r.multiple < 1 : r.multiple >= 3
  const rows = React.useMemo(() => {
    const kept = all.filter((r) => test(against, r))
    return order === "best" ? [...kept].sort((a, b) => b.post.views - a.post.views) : kept
  }, [all, against, order])

  // Keep the open row when a filter hides it; open the first when none is open.
  const current = open && all.some((r) => r.post.id === open) ? open : (rows[0]?.post.id ?? null)
  const openRow = all.find((r) => r.post.id === current) ?? null

  const move = (d: 1 | -1) => {
    const i = rows.findIndex((r) => r.post.id === current)
    const next = rows[Math.max(0, Math.min(rows.length - 1, i + d))]
    if (next) setOpen(next.post.id)
  }
  useLetterKeys({ j: () => move(1), k: () => move(-1) })

  const repliesUsual = read.medianReplies
  const columns: DataListColumn<Row>[] = [
    {
      id: "post",
      header: "Post",
      width: "minmax(0,1fr)",
      cell: (r) => <DataListTitle>{r.post.hook}</DataListTitle>,
      skeleton: "title",
    },
    { id: "day", header: "Out", width: "3.5rem", align: "end", wide: true, cell: (r) => <DataListMono>{dayLabel(data.today, r.post.day!)}</DataListMono> },
    { id: "views", header: "Views", width: "4rem", align: "end", cell: (r) => <DataListMono>{fmt(r.post.views)}</DataListMono> },
    {
      id: "against",
      header: "Against your median",
      width: "9rem",
      wide: true,
      cell: (r) => (
        <span className="flex w-full items-center">
          <MultipleBar multiple={r.multiple} scale={opts.scale} emphasis={r.post.id === current} />
        </span>
      ),
    },
    {
      id: "multiple",
      header: "×",
      width: "3rem",
      align: "end",
      cell: (r) => (
        <>
          <DataListMono>{r.multiple === null ? "—" : formatMultiple(r.multiple)}</DataListMono>
          <span className="sr-only">{r.multiple === null ? "no median yet" : "your median"}</span>
        </>
      ),
    },
    {
      id: "replies",
      header: "Replies",
      width: "3.5rem",
      align: "end",
      cell: (r) => <DataListMono>{r.post.replies}</DataListMono>,
    },
  ]

  const count = (a: Against) => all.filter((r) => test(a, r)).length
  const pane = `clamp(${opts.paneMin}px, ${opts.paneShare}cqi, ${opts.paneMax}px)`
  const loading = phase === "loading"
  const empty = (
    <EmptyState frame="none" bold={all.length === 0 ? `Nothing went out in the last ${read.days} days.` : "No posts match."} rest={all.length === 0 ? "Pick a longer period." : "Clear the filter."}>
      {all.length === 0 ? (
        <Button size="xs" onClick={() => setPeriod("90")}>
          Show 90 days
        </Button>
      ) : (
        <Button
          size="xs"
          onClick={() => {
            setAgainst("any")
            focusRestoredDataList()
          }}
        >
          Clear filter
        </Button>
      )}
    </EmptyState>
  )

  const list = (
    <DataList
      label="Posts"
      aria-keyshortcuts="j k"
      items={rows}
      getKey={(r) => r.post.id}
      getLabel={(r) => r.post.hook}
      value={current}
      onValueChange={(k) => {
        setOpen(k)
        if (fold) setDetail(true)
      }}
      columns={columns}
      status={loading ? "loading" : "ready"}
      loadingLabel="Reading your numbers"
      empty={empty}
    />
  )

  return (
    <WorkspacePage ref={ref}>
      <NumbersToolbar data={data} phase={phase} period={period} setPeriod={setPeriod} />
      {phase === "empty" || phase === "disconnected" ? (
        <EmptyNumbers kind={phase} />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col" style={fold === null ? { visibility: "hidden" } : undefined}>
          <Toolbar label="Filters" size="filter">
            <ToolbarGroup>
              <FilterMenu
                label="Against your median"
                value={against}
                onValueChange={setAgainst}
                options={[
                  { value: "any", label: "Every post", count: count("any") },
                  { value: "above", label: "Above your median", count: count("above") },
                  { value: "below", label: "Below your median", count: count("below") },
                  { value: "outlier", label: "3× or more", count: count("outlier") },
                ]}
              />
              <FilterMenu
                label="Order"
                value={order}
                onValueChange={setOrder}
                options={[
                  { value: "newest", label: "Newest first", count: all.length },
                  { value: "best", label: "Most views first", count: all.length },
                ]}
              />
            </ToolbarGroup>
            <ToolbarGroup end>
              <span className="text-kit-meta text-kit-ink-muted tabular-nums">
                {loading ? "" : `${rows.length} posts · median ${read.medianViews === null ? "not yet" : fmt(read.medianViews)}`}
              </span>
            </ToolbarGroup>
          </Toolbar>
          {phase !== "live" ? (
            <div className="border-b border-kit-hairline px-kit-group py-2">
              <StateLine phase={phase} minWeeks={opts.minWeeks} />
            </div>
          ) : null}
          {fold ? (
            detail && openRow ? (
              <div className="min-h-0 flex-1 overflow-y-auto">
                <div className="px-kit-group pt-kit-related">
                  <Button size="xs" variant="ghost" icon={ArrowLeft01Icon} onClick={() => setDetail(false)}>
                    Posts
                  </Button>
                </div>
                <PostDetail row={openRow} data={data} medianViews={read.medianViews} repliesUsual={repliesUsual} minWeeks={opts.minWeeks} />
              </div>
            ) : (
              <div className="flex min-h-0 flex-1 flex-col">{list}</div>
            )
          ) : (
            <WorkspacePanes>
              <Panel label="Posts">
                <PanelBody>{list}</PanelBody>
              </Panel>
              <Panel label="Open post" width={pane} edge="start">
                <PanelBody label="The open post" scrollKey={current}>
                  {openRow && !loading ? (
                    <>
                      <PanelHeader end={openRow.post.fromQuincy ? "Drafted by me" : "Written by you"}>
                        <span>On X</span>
                        <span aria-hidden>·</span>
                        <span className="font-kit-mono text-kit-mono-sm">{dayLabel(data.today, openRow.post.day!)}</span>
                      </PanelHeader>
                      <PostDetail row={openRow} data={data} medianViews={read.medianViews} repliesUsual={repliesUsual} minWeeks={opts.minWeeks} />
                    </>
                  ) : (
                    <PanelHeader>
                      <span aria-hidden />
                    </PanelHeader>
                  )}
                </PanelBody>
              </Panel>
            </WorkspacePanes>
          )}
          <KeyBar keys={[{ keys: ["j", "k"], label: "Move" }, { keys: ["1", "2", "3"], label: "Layouts" }]} />
        </div>
      )}
    </WorkspacePage>
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

function PostDetail({
  row,
  data,
  medianViews,
  repliesUsual,
  minWeeks,
}: {
  row: Row
  data: NumbersData
  medianViews: number | null
  repliesUsual: number | null
  minWeeks: number
}) {
  const { post, multiple } = row
  const beats = post.body ? readBeats(post.body) : null
  const people = data.people ? post.repliers.map((id) => data.people!.find((p) => p.id === id)).filter((p) => p != null) : null

  return (
    <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
      {/* The post, with its beats when it has them. Why it worked is read off the post, never guessed. */}
      <section aria-label="The post" className="@container/kit-stage flex flex-col gap-kit-related">
        {post.body === null ? (
          <p className="text-kit-dense text-kit-ink-muted">I measured this post, but its text isn&apos;t in Quincy yet: the import hasn&apos;t caught up with it.</p>
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
          <>
            {paragraphsOf(post.body).map((p, i) => (
              <Lines key={i} p={p} />
            ))}
          </>
        )}
      </section>

      <dl className="grid grid-cols-2 gap-kit-related border-t border-kit-hairline pt-kit-group">
        <div className="flex flex-col gap-kit-tight">
          <dt className="text-kit-meta text-kit-ink-muted">Views</dt>
          <dd className="flex flex-col gap-kit-tight">
            <Text variant="figure">{fmt(post.views)}</Text>
            <span className="text-kit-meta text-kit-ink-muted tabular-nums">
              {multiple === null ? `Needs ${minWeeks} weeks for a median.` : `${formatMultiple(multiple)} your median post, ${fmt(medianViews!)}.`}
            </span>
          </dd>
        </div>
        <div className="flex flex-col gap-kit-tight">
          <dt className="text-kit-meta text-kit-ink-muted">Replies</dt>
          <dd className="flex flex-col gap-kit-tight">
            <Text variant="figure">{fmt(post.replies)}</Text>
            <span className="text-kit-meta text-kit-ink-muted tabular-nums">
              {repliesUsual === null ? `Needs ${minWeeks} weeks for a usual.` : `A post of yours usually gets ${fmt(repliesUsual)}.`}
            </span>
          </dd>
        </div>
      </dl>
      <p className="-mt-kit-related text-kit-meta text-kit-ink-muted tabular-nums">
        {post.likes} likes, {post.bookmarks} bookmarks, {post.reposts} reposts.
      </p>

      <section aria-label="How it climbed" className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
        <h3 className="text-kit-meta font-kit-strong text-kit-ink">How it climbed</h3>
        <Climb climb={post.climb} label="Views by morning since it went out" />
      </section>

      <section aria-label="Who replied" className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-group">
        <h3 className="text-kit-meta font-kit-strong text-kit-ink">Who replied</h3>
        {people === null ? (
          <Proposed why="the replies themselves are not read yet, only their count" />
        ) : people.length === 0 ? (
          <p className="text-kit-meta text-kit-ink-muted">Nobody yet.</p>
        ) : (
          <p className="text-kit-dense text-kit-ink">
            {people.map((p, i) => (
              <React.Fragment key={p.id}>
                {i > 0 ? ", " : ""}
                {p.name}
                {p.replyDays.length > 1 ? <span className="text-kit-ink-muted"> ({p.replyDays.length} times)</span> : null}
              </React.Fragment>
            ))}
          </p>
        )}
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
