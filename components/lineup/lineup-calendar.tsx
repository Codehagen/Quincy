"use client"

import * as React from "react"

import {
  Button,
  ButtonLink,
  Panel,
  PanelBody,
  PanelHeader,
  WorkspacePanes,
  WeekCalendar,
  describePlace,
  hhmm,
  useAnnounce,
} from "@/components/kit"
import { dateOfKey, isoWeekdayOfKey } from "@/components/kit/week-calendar-math"
import type { FeedAccounts } from "@/lib/feed-accounts"
import { weekdayLabel } from "@/lib/slots"

import { LineupFilters, NothingOpen, WeekSwitch } from "./lineup-chrome"
import { ChannelGlyph, ScheduleMark, TimeText } from "./lineup-marks"
import { blocksOf, isMovable, isPastAt, quoted, stripOf, type CalBlock, type Item } from "./lineup-model"
import { CHANNEL_LABELS } from "./slot-composer"
import { FeedPicture, ItemPicture } from "./post-feed"
import { ItemVerbs } from "./lineup-verbs"
import type { LineupStore } from "./use-lineup"
import { WeekNotes } from "./week-notes"

/**
 * Lineup's reading of the week on the kit's WeekCalendar (decided on
 * /prototypes/lineup-lab, "2 · Calendar"): a Mon–Sun week of continuous
 * time, posts as blocks at their exact minute, a slot's occurrence that
 * nothing fills as a dashed block, the approved posts with no time in a
 * tray over the grid, and the open block's post drawn as the feed beside it.
 *
 * What a drop means is `moveTo` (use-lineup.ts): into the open slot of the
 * post's channel at exactly that minute, else a one-off there, through
 * `movePost`. What an empty quarter hour offers is `ProposalPane`.
 *
 * **Not built here, because the server cannot do it yet** (DECISION.md,
 * "Proposed"): dragging a tray item onto the grid to place an approved post
 * at a chosen minute. `placeApprovedVersion` takes only the next free slot.
 * The seam is `WeekCalendar.TrayItem`'s `onPlace`: pass it once a placement
 * action takes a day and a time, and the tray drags.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

type Proposal = { dayId: string; minute: number }

export function LineupCalendar({ store, accounts, mode, pane, notes }: { store: LineupStore; accounts: FeedAccounts; mode: "week" | "day"; pane: number; notes: { on: boolean; set: (on: boolean) => void } }) {
  const announce = useAnnounce()
  const { clock, days } = store
  const thisWeek = store.week.week === store.week.thisWeek
  const [dayIdx, setDayIdx] = React.useState(() => Math.max(0, days.indexOf(clock.day)))
  const [proposal, setProposal] = React.useState<Proposal | null>(null)

  // A proposal belongs to the week it was made in; a new week opens on today, or on Monday.
  const [seenWeek, setSeenWeek] = React.useState(store.week.week)
  if (seenWeek !== store.week.week) {
    setSeenWeek(store.week.week)
    setProposal(null)
    setDayIdx(Math.max(0, days.indexOf(clock.day)))
  }

  const blocks = React.useMemo(() => blocksOf(store.timeline), [store.timeline])
  // A channel's mark earns its place only when the week holds more than one channel.
  const manyChannels = new Set([...store.week.slots.map((s) => s.channel), ...store.week.posts.map((p) => p.channel), ...store.week.unplaced.map((u) => u.channel)]).size > 1
  const byKey = React.useMemo(() => new Map(store.allItems.map((i) => [i.key, i])), [store.allItems])
  const shownDays = mode === "week" ? days : [days[dayIdx]!]
  const minuteNow = Number(clock.time.slice(0, 2)) * 60 + Number(clock.time.slice(3, 5))
  const showNow = shownDays.includes(clock.day)

  const label = (b: CalBlock) => {
    const item = byKey.get(b.id)
    if (item?.kind === "post") return `${quoted(item.post.opening)}, ${item.channelLabel}`
    const name = CHANNEL_LABELS[b.channel] ?? b.channel
    return b.variant === "slot" ? `an open ${name} slot` : `${/^[aeiouxAEIOUX]/.test(name) ? "an" : "a"} ${name} slot that passed empty`
  }

  // Open on the working morning, and back to it when the week changes.
  const bodyRef = React.useRef<HTMLDivElement>(null)
  React.useLayoutEffect(() => {
    const scroller = bodyRef.current?.closest<HTMLElement>('[data-slot="kit-panel-body"]')
    const grid = bodyRef.current?.querySelector<HTMLElement>(".wc-body")
    if (!scroller || !grid) return
    const top = grid.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
    // 07:00 just under the sticky day heads.
    scroller.scrollTop = top + 7 * 56 - 40
  }, [store.week.week, mode])

  const open = proposal ? null : store.selected

  return (
    <>
      <LineupFilters store={store} end={<WeekSwitch store={store} />} notes={notes} />
      <WorkspacePanes>
        <Panel label="The week">
          <WeekCalendar
            week={store.week.week}
            view={mode}
            day={days[dayIdx]}
            today={clock.day}
            value={open?.key ?? null}
            onValueChange={(key) => {
              setProposal(null)
              store.select(key ?? "")
            }}
            onMove={store.moveTo}
            onPropose={(dayId, minute) => {
              setProposal({ dayId, minute })
              store.select("")
              announce(`${describePlace(dayId, minute)}. Nothing here. The pane says what could go here.`)
            }}
            hourHeight={56}
          >
            {/* Outside the scroller: the tray and the day strip stay in view while the hours scroll. */}
            {store.waiting.length > 0 ? (
              <WeekCalendar.Tray label="Approved, no time">
                {store.waiting.map((w) => (
                  <WeekCalendar.TrayItem key={w.key} value={w.key}>
                    <span className="flex min-w-0 items-start gap-1.5">
                      {manyChannels ? <ChannelGlyph channel={w.channel} label={w.channelLabel} /> : null}
                      <span className="lineup-chip-text text-kit-ink">{w.unplaced.opening}</span>
                    </span>
                  </WeekCalendar.TrayItem>
                ))}
              </WeekCalendar.Tray>
            ) : null}
            {mode === "day" ? <DayStrip days={days} index={dayIdx} onPick={setDayIdx} store={store} /> : null}
            <PanelBody>
              {/* A week change is a read on the server: the old week stays, quieter, until the new one arrives. */}
              <div ref={bodyRef} className="lineup-week flex flex-col" data-pending={store.weekPending || undefined} aria-busy={store.weekPending || undefined}>
                <WeekCalendar.Header />
                <WeekCalendar.Grid axis={<WeekCalendar.TimeAxis now={showNow ? minuteNow : null} />}>
                  {showNow ? <WeekCalendar.NowLine day={clock.day} minute={minuteNow} /> : null}
                  {notes.on ? <WeekNotes blocks={blocks} days={shownDays} today={clock.day} posts={store.week.posts} thisWeek={thisWeek} /> : null}
                  {proposal ? <WeekCalendar.Proposal day={proposal.dayId} minute={proposal.minute} /> : null}
                  {blocks.map((b) => (
                    <WeekCalendar.Block
                      key={b.id}
                      value={b.id}
                      day={b.track}
                      start={b.start}
                      end={b.end}
                      variant={b.variant}
                      state={b.state}
                      disabled={!isMovable(byKey.get(b.id), clock) || store.inFlight}
                      label={label(b)}
                      className="lineup-block"
                    >
                      {({ start, focused }) => <PostBlockBody item={byKey.get(b.id)} block={b} start={start} focused={focused} channelMark={manyChannels} />}
                    </WeekCalendar.Block>
                  ))}
                </WeekCalendar.Grid>
              </div>
            </PanelBody>
          </WeekCalendar>
        </Panel>
        <Panel label="Open post" width={`${pane}px`} edge="start">
          <PanelBody label="The open post" scrollKey={open?.key ?? (proposal ? `${proposal.dayId}${proposal.minute}` : null)}>
            {proposal ? (
              <ProposalPane proposal={proposal} store={store} onDone={() => setProposal(null)} />
            ) : open ? (
              <OpenItemPane item={open} store={store} accounts={accounts} />
            ) : (
              <div className="flex min-h-full flex-col">
                <PanelHeader>
                  <span aria-hidden />
                </PanelHeader>
                <div className="px-kit-group pt-kit-group">
                  <NothingOpen />
                </div>
              </div>
            )}
          </PanelBody>
        </Panel>
      </WorkspacePanes>
    </>
  )
}

/** The pane for an open item: its strip, the post as the feed shows it, the verbs. */
export function OpenItemPane({ item, store, accounts }: { item: Item; store: LineupStore; accounts: FeedAccounts }) {
  return (
    <>
      {/* The strip says when and in what state; the feed column says which platform. No mark, no glyph beside it. */}
      <PanelHeader>
        <span className="truncate">{stripOf(item, store.clock.day)}</span>
      </PanelHeader>
      <div className="flex flex-col gap-kit-group px-kit-group py-kit-group">
        <FeedPicture channel={item.channel}>
          <ItemPicture item={item} accounts={accounts} clock={store.clock} />
        </FeedPicture>
        <ItemVerbs item={item} store={store} />
      </div>
    </>
  )
}

/**
 * A block's inside: the channel's mark, the time in mono (where it is drawn
 * now, so a drag or a held block says its new time), the state as a still
 * glyph, and the opening line.
 */
export function PostBlockBody({ item, block, start, focused, channelMark = true }: { item: Item | undefined; block: CalBlock; start: number; focused: boolean; /** The channel's mark: off when the week holds one channel, where it says nothing. */ channelMark?: boolean }) {
  const channelLabel = item?.channelLabel ?? CHANNEL_LABELS[block.channel] ?? block.channel
  return (
    <span className="lineup-block-inner" data-focused={focused || undefined}>
      <span className="flex min-w-0 items-center gap-1">
        {channelMark ? <ChannelGlyph channel={block.channel} label={channelLabel} /> : null}
        <TimeText ink={block.variant === "post" && block.state !== "published"}>{hhmm(start)}</TimeText>
        {item?.kind === "post" ? (
          <span className="ms-auto">
            <ScheduleMark item={item} hideWord />
          </span>
        ) : null}
      </span>
      {/* An open slot is said by its dashed edge (and its name, for assistive tech); a passed one by its words, its dash being decorative. */}
      {item?.kind === "post" ? <span className="lineup-block-text">{item.post.opening}</span> : item?.kind === "open" && item.passed ? <span className="lineup-block-text">Passed empty</span> : null}
    </span>
  )
}

/** In one-day mode: the week as seven buttons over the column. Whether a day holds a post is a dot, never a count. */
function DayStrip({ days, index, onPick, store }: { days: string[]; index: number; onPick: (i: number) => void; store: LineupStore }) {
  return (
    <div className="lineup-daystrip" role="group" aria-label="Day">
      {days.map((id, i) => {
        const has = store.week.posts.some((p) => p.dayId === id)
        return (
          <button key={id} type="button" aria-pressed={i === index} aria-label={`${weekdayLabel(isoWeekdayOfKey(id))} ${dateOfKey(id).getUTCDate()}${has ? ", has a post" : ""}`} data-today={id === store.clock.day || undefined} onClick={() => onPick(i)}>
            <span aria-hidden>{WEEKDAY_SHORT[isoWeekdayOfKey(id) - 1]}</span>
            <span aria-hidden className="font-kit-mono tabular-nums">
              {dateOfKey(id).getUTCDate()}
            </span>
            <span className="lineup-daystrip-dot" data-on={has || undefined} aria-hidden />
          </button>
        )
      })}
    </div>
  )
}

/**
 * What an empty quarter hour offers: make its weekday and time a slot
 * (`createSlot`), or approve a draft. Putting a named approved post at this
 * minute is not offered: the server places only into the next free slot
 * (DECISION.md, proposed 2).
 */
export function ProposalPane({ proposal, store, onDone }: { proposal: Proposal; store: LineupStore; onDone: () => void }) {
  const time = hhmm(proposal.minute)
  const wd = isoWeekdayOfKey(proposal.dayId)
  const d = dateOfKey(proposal.dayId)
  const past = isPastAt(store.clock, proposal.dayId, time)
  const hasSlot = (channel: string) => store.week.slots.some((s) => s.channel === channel && s.weekday === wd && s.time === time)
  const [adding, setAdding] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const add = async (channel: string) => {
    setAdding(channel)
    setError(null)
    try {
      await store.addSlot(channel, wd, time)
      onDone()
    } catch (cause) {
      console.error(cause)
      setError("Could not add the slot. Nothing changed. Try again.")
    } finally {
      setAdding(null)
    }
  }
  return (
    <>
      <PanelHeader>
        <span className="truncate">{`${WEEKDAY_SHORT[wd - 1]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${time} · nothing here`}</span>
      </PanelHeader>
      <div className="flex flex-col gap-kit-related px-kit-group py-kit-group">
        {past ? (
          <p className="text-kit-dense text-pretty text-kit-ink">
            That time has passed. <span className="text-kit-ink-muted">A post put there would go out straight away. Pick a later one.</span>
          </p>
        ) : (
          <>
            <p className="text-kit-dense text-pretty text-kit-ink">
              Nothing goes out here. <span className="text-kit-ink-muted">{`Make it a slot and every ${weekdayLabel(wd)} at ${time} takes the next approved post.`}</span>
            </p>
            <div className="flex flex-wrap gap-kit-controls">
              {store.connected.map((c, i) => (
                <Button
                  key={c}
                  size="sm"
                  variant={i === 0 ? "action" : "quiet"}
                  disabled={hasSlot(c)}
                  pending={adding === c}
                  pendingLabel="Adding…"
                  onClick={() => void add(c)}
                >
                  {`Make it ${c === "x" ? "an" : "a"} ${CHANNEL_LABELS[c] ?? c} slot`}
                </Button>
              ))}
              <ButtonLink href="/drafts" size="sm" variant={store.connected.length === 0 ? "action" : "quiet"}>
                Approve a draft
              </ButtonLink>
            </div>
            {store.connected.some(hasSlot) ? (
              <p className="text-kit-meta text-kit-ink-muted">{`You already publish ${store.connected.filter(hasSlot).map((c) => `on ${CHANNEL_LABELS[c] ?? c}`).join(" and ")} at this time every ${weekdayLabel(wd)}.`}</p>
            ) : null}
            {error ? (
              <p role="alert" className="text-kit-meta text-kit-ink">
                {error}
              </p>
            ) : null}
          </>
        )}
      </div>
    </>
  )
}
