"use client"

import * as React from "react"

import { Button, Card, Lead, List, ListHeading, UndoBar } from "@/components/kit"
import {
  DraftCard,
  DraftCardActions,
  DraftCardBody,
  DraftCardHeader,
  DraftCardNotice,
  PostResult,
  ScheduledPost,
  SlotCell,
  type ScheduledPostMove,
} from "@/components/quincy"
import type { Version } from "@/lib/drafts"
import type { Entry, Slot } from "@/lib/lineup"
import type { ScoredPost } from "@/lib/numbers"

/*
 * Client demos for the Quincy drafts section (docs/design/quincy-drafts.md).
 * Fixtures in the real lib/ shapes; nothing is sent anywhere.
 */

const STORY = [
  "I cut our onboarding email down to one question.",
  "Replies in the first week:\n31\nYour median is 6.",
  "People answer a question. They skip a brochure.",
].join("\n\n")

// The shape of most real bodies on 2026-11-15: an opinion, no number of its own.
const OPINION = [
  "For OSS products, directory listings can help with discovery.",
  "But a backlink is not adoption.",
  "The lasting distribution comes from giving builders a foundation they actually want to use.",
].join("\n\n")

const BASE: Version = {
  id: "v-x",
  channel: "x",
  label: "X",
  text: STORY,
  state: "writing",
  goingOut: null,
  hasSlot: true,
  sent: null,
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** The whole loop: Approve → goes out Thu 07:45 → Undo; Edit → Save; hold Discard. */
export function DraftLoop() {
  const [version, setVersion] = React.useState<Version>(BASE)
  const [gone, setGone] = React.useState(false)

  if (gone) {
    return (
      <Card width="with-margin">
        <div className="flex flex-col gap-kit-related">
          <Lead bold="Discarded." rest="The X version is gone. This demo can bring it back." />
          <div>
            <Button onClick={() => (setVersion(BASE), setGone(false))}>Restore the demo</Button>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <DraftCard
      version={version}
      onApprove={async () => {
        await wait(500)
        setVersion((v) => ({ ...v, state: "approved", goingOut: "Thu 07:45" }))
      }}
      onReopen={async () => {
        await wait(300)
        setVersion((v) => ({ ...v, state: "writing", goingOut: null }))
      }}
      onSave={async (text) => {
        await wait(400)
        setVersion((v) => ({ ...v, text }))
      }}
      onDiscard={async () => {
        await wait(300)
        setGone(true)
      }}
    >
      <DraftCardHeader initials="C" source="onboarding-email.md" />
      <DraftCardBody />
      <DraftCardActions opening="Thu 07:45" />
    </DraftCard>
  )
}

type Shown = "no-slot" | "failed" | "sending" | "published" | "snapshot"

const STATES: Record<Shown, Version> = {
  "no-slot": { ...BASE, id: "v-li", channel: "linkedin", label: "LinkedIn", text: OPINION, state: "approved", hasSlot: false },
  failed: { ...BASE, state: "approved", sent: { state: "failed", error: "X refused the post: the account's token has expired. Reconnect X on Channels." } },
  sending: { ...BASE, state: "approved", sent: { state: "sending" } },
  published: { ...BASE, state: "approved", sent: { state: "published", url: "https://x.com/", at: "Today 07:45" } },
  snapshot: { ...BASE, text: OPINION },
}

/** One state per stage, so each reads alone. */
export function DraftState({ shown }: { shown: Shown }) {
  const [version, setVersion] = React.useState(STATES[shown])
  const reopen = async () => {
    await wait(300)
    setVersion((v) => ({ ...v, state: "writing", sent: null }))
  }

  if (shown === "snapshot") {
    return (
      <DraftCard version={version}>
        <DraftCardHeader initials="C" source="Studio · 2d" />
        <DraftCardBody />
        <DraftCardNotice>The same opening as yesterday&apos;s LinkedIn post.</DraftCardNotice>
      </DraftCard>
    )
  }

  return (
    <DraftCard
      version={version}
      onApprove={async () => {
        await wait(400)
        setVersion(STATES[shown])
      }}
      onReopen={reopen}
    >
      <DraftCardHeader initials="C" />
      <DraftCardBody />
      <DraftCardActions />
    </DraftCard>
  )
}

/* ── The week ─────────────────────────────────────────────────────────── */

const entry = (e: Partial<Entry> & Pick<Entry, "id" | "time" | "state" | "opening">): Entry => ({
  versionId: `v-${e.id}`,
  draftId: `d-${e.id}`,
  idea: e.opening,
  channel: "x",
  channelLabel: "X",
  sourceId: "voice",
  sourceLabel: "Voice note",
  url: null,
  error: null,
  ...e,
})

type DayRow = { id: string; label: string; entries: Entry[] }

const WEEK: DayRow[] = [
  {
    id: "today",
    label: "Today",
    entries: [
      entry({ id: "1", time: "07:45", state: "published", opening: "I gave our changelog its own page.", url: "https://x.com/" }),
      entry({ id: "2", time: "12:30", state: "sending", opening: "The call that changed our pricing page.", sourceLabel: "Call" }),
    ],
  },
  {
    id: "thu",
    label: "Thursday",
    entries: [
      entry({ id: "3", time: "07:45", state: "queued", opening: "Deploys went from 11 minutes to 2:40.", sourceLabel: "Pull request" }),
      entry({ id: "4", time: "16:00", state: "failed", opening: "Why I stopped writing job posts.", error: "X refused it: duplicate content." }),
    ],
  },
]

const SLOTS: Slot[] = [
  { id: "s-fri", dayId: "fri", weekday: 5, time: "09:00", label: "Fri 09:00", channel: "x", channelLabel: "X", filledBy: null },
  { id: "s-sat", dayId: "sat", weekday: 6, time: "10:00", label: "Sat 10:00", channel: "x", channelLabel: "X", filledBy: null },
]

/** Posts in their days, open slots after; move one with its time, or send it back. */
export function TheWeek() {
  const [week, setWeek] = React.useState(WEEK)
  const [slots, setSlots] = React.useState(SLOTS)
  const [undo, setUndo] = React.useState<{ day: string; entry: Entry } | null>(null)
  const [moved, setMoved] = React.useState<string | null>(null)

  const take = (id: string) => {
    let found: { day: string; entry: Entry } | null = null
    const next = week.map((d) => ({
      ...d,
      entries: d.entries.filter((e) => {
        if (e.id !== id) return true
        found = { day: d.id, entry: e }
        return false
      }),
    }))
    return { next, found: found as { day: string; entry: Entry } | null }
  }

  const move = (id: string, to: ScheduledPostMove) => {
    if (to.kind !== "slot") return
    const slot = slots.find((s) => s.id === to.slotId)
    const { next, found } = take(id)
    if (!slot || !found) return
    setUndo(null)
    setSlots((ss) => ss.map((s) => (s.id === slot.id ? { ...s, filledBy: id } : s)))
    const label = slot.label.split(" ")[0]!
    const day = next.find((d) => d.id === slot.dayId) ?? { id: slot.dayId, label: label === "Fri" ? "Friday" : "Saturday", entries: [] }
    const shifted = { ...found.entry, time: slot.time }
    setWeek([...next.filter((d) => d.id !== day.id), { ...day, entries: [...day.entries, shifted] }])
    setMoved(id)
  }

  const unschedule = (id: string) => {
    const { next, found } = take(id)
    if (!found) return
    setWeek(next)
    setUndo(found)
  }

  const restore = () => {
    if (!undo) return
    setWeek((w) => w.map((d) => (d.id === undo.day ? { ...d, entries: [...d.entries, undo.entry].sort((a, b) => a.time.localeCompare(b.time)) } : d)))
    setUndo(null)
  }

  const open = slots.filter((s) => s.filledBy == null)

  return (
    <>
      <List width="with-margin">
        {week.map((d) =>
          d.entries.length ? (
            <React.Fragment key={d.id}>
              <ListHeading as="h3">{d.label}</ListHeading>
              {d.entries.map((e) => (
                <ScheduledPost
                  key={e.id}
                  entry={e}
                  openSlots={open}
                  takeFocus={moved === e.id}
                  onMove={(to) => move(e.id, to)}
                  onUnschedule={() => unschedule(e.id)}
                />
              ))}
            </React.Fragment>
          ) : null,
        )}
        {open.length ? <ListHeading as="h3">Open</ListHeading> : null}
        {open.map((s, i) => (
          <SlotCell key={s.id} slot={s} timing={i === 0 ? "next" : "upcoming"} onSelect={() => {}} />
        ))}
        <ListHeading as="h3">Earlier</ListHeading>
        <SlotCell
          slot={{ ...SLOTS[0]!, id: "s-mon", label: "Mon 08:00", filledBy: null }}
          timing="past"
          onSelect={() => {}}
        />
      </List>
      <UndoBar show={undo != null} width="with-margin" onUndo={restore}>
        {undo ? `Sent "${undo.entry.opening}" back to Drafts.` : null}
      </UndoBar>
    </>
  )
}

/** With the data gap filled: what the cell says once a by-hour median exists. */
export function SlotWithMedian() {
  const [picked, setPicked] = React.useState(false)
  return (
    <List width="with-margin">
      <SlotCell
        slot={{ ...SLOTS[0]!, label: "Thu 07:45", channel: "linkedin", channelLabel: "LinkedIn" }}
        median={{ views: 1700, posts: 9, overall: 1210 }}
        selected={picked}
        onSelect={() => setPicked((p) => !p)}
      />
    </List>
  )
}

/* ── Results ──────────────────────────────────────────────────────────── */

const POST: ScoredPost = {
  id: "p1",
  url: "https://x.com/",
  hook: "I gave our changelog its own page.",
  date: "Tue 08:10",
  impressions: 3940,
  replies: 6,
  multiple: 3940 / 1210,
  live: true,
}

export function Result() {
  return <PostResult post={POST} median={1210} channelLabel="X" initials="C" />
}

export function ResultBelow() {
  return (
    <PostResult
      post={{ ...POST, id: "p2", hook: "Why seat pricing confuses the people it is meant for.", impressions: 710, replies: 1, multiple: 710 / 1210, live: false, date: "Mar 4" }}
      median={1210}
      channelLabel="X"
      initials="C"
    />
  )
}
