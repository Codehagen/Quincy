import Link from "next/link"
import { redirect } from "next/navigation"

import {
  channelGaps,
  CHANNEL_LABELS,
  countOpen,
  getRiffs,
  type Riff,
} from "@/lib/riffs"
import { listConnections } from "@/lib/channels"
import { writesPerShape } from "@/lib/drafting"
import { getSession } from "@/lib/session"
import { Button } from "@/components/ui/button"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderTitle,
} from "@/components/page-header"
import { Instrument } from "@/components/riffs/instrument"
import { RiffCard } from "@/components/riffs/riff-card"
import { RiffsRefresh } from "@/components/riffs/riffs-refresh"
import { constructMetadata } from "@/lib/metadata"

/**
 * Work the raw material.
 *
 * The step between Sources and Drafts: a scrap comes in, Quincy finds angles in
 * it, and you decide which of them is worth writing before a word is committed
 * to a platform. Nothing here is a post.
 *
 * **Capture is the page; the queue is what came back.** Decided from the
 * four-way prototype at /prototypes/riffs on 2026-08-08 — the reasoning, the
 * numbers it turned on, and the three rejected directions are written down in
 * `components/riffs/instrument.tsx`. The short version: the product held six
 * riffs across two accounts on the day of the decision, every one from voice or
 * paste, so the live problem is input rather than the size of the queue. The
 * page used to hide the recorder behind a 28px button that appeared only once
 * you already had riffs.
 *
 * **The list is a working queue, not an archive.** It stays short because
 * acting on a riff removes it, not because it is filtered — a filter you need
 * in order to find things in your own riff list is a list that already failed.
 * Aging (a riff you have scrolled past for three weeks you have already decided
 * against) is the other half and needs a data model rather than UI. A source
 * filter is the third resort and would follow the pattern already written in
 * components/rhythm/platform-filter.tsx.
 *
 * **When the queue grows, Fold is the next change and not a rewrite.** The
 * prototype's runner-up collapses each riff to a single row with one open, and
 * it slots under the instrument without touching it. The trigger is roughly ten
 * riffs on a real account; below that it charges a click per riff for an
 * overview nobody needs yet.
 */
export const metadata = constructMetadata({
  title: "Riffs",
  noIndex: true,
})

/**
 * Group by the day string the server already rendered.
 *
 * Not by a second date computation: `capturedAt` is `formatConversationDate`'s
 * output ("Today", "Yesterday", "3 days ago", "12 Aug"), which is already
 * bucketed by calendar day in the user's own zone. Deriving a heading from the
 * timestamp separately would be a second thing that can disagree with the first
 * — a riff labelled "Yesterday" sitting under "Today" — and it would have to
 * re-answer the timezone question that helper exists to answer once.
 *
 * `getRiffs` returns newest first, so insertion order is chronological and no
 * sort is needed here.
 */
function groupByDay(riffs: Riff[]): [string, Riff[]][] {
  const groups = new Map<string, Riff[]>()
  for (const riff of riffs) {
    const list = groups.get(riff.capturedAt) ?? []
    list.push(riff)
    groups.set(riff.capturedAt, list)
  }
  return [...groups.entries()]
}

export default async function RiffsPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/riffs")
  }

  // Concurrent with the connections read below: neither needs the other, and
  // RiffsRefresh re-runs this page every four seconds while a voice riff
  // processes — a serialized round trip here was paid on every poll.
  const [riffs, allConnections] = await Promise.all([
    getRiffs(session.user),
    listConnections(session.user.id),
  ])
  const open = countOpen(riffs)
  const groups = groupByDay(riffs)

  /**
   * The channels this account actually publishes to.
   *
   * Read once for the page rather than per card, and filtered to `active`
   * rather than merely present: a connection whose token was revoked is not
   * somewhere Quincy can put a post, so it is not a gap worth nagging about.
   *
   * `CHANNEL_LABELS` maps the connection's channel id onto the same
   * `{ id, label }` shape `CHANNELS_FOR_SHAPE` uses. A channel we hold a
   * connection for but no shape can reach — there is no such case today — drops
   * out here rather than becoming a gap that can never be filled.
   */
  const connected = allConnections
    .filter((c) => c.state === "active")
    .map((c) => CHANNEL_LABELS[c.channel])
    .filter((c) => c !== undefined)

  /**
   * How many drafts "Draft this" writes, per shape, for this account.
   *
   * Four numbers, read from the same `targetsFor` the action uses, so the row
   * states what will happen rather than what `CHANNELS_FOR_SHAPE` implies.
   * Computed here beside `connected` because both are one question about the
   * account, asked once for the page.
   */
  const writes = writesPerShape(connected.map((c) => c.id))

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      {/* The title steps down from `text-display` to `text-section`. Two loud
          things at the top of a page is no primary at all, and here the
          instrument is the primary — the h1 only has to say where you are.

          The count moves up beside it for the same reason: as its own line
          under the instrument it separated capture from the queue with a
          statistic, which is the least useful thing that could sit there. */}
      <PageHeader className="items-center">
        <PageHeaderContent>
          <PageHeaderTitle className="text-section">Riffs</PageHeaderTitle>
        </PageHeaderContent>
        {open.angles > 0 ? (
          <p className="shrink-0 text-caption text-muted-foreground">
            {/* Counts what is still a question, not what exists — a number that
                keeps saying seven after you have dealt with four is wrong in
                the direction that matters. Tabular figures because it ticks
                down as you work, and proportional digits make a count jitter. */}
            <span className="font-mono tabular-nums">{open.angles}</span>{" "}
            {open.angles === 1 ? "angle" : "angles"} waiting on you
          </p>
        ) : null}
      </PageHeader>

      <Instrument />

      {/* Only mounts a timer when something is actually pending. A page of
          finished riffs holds no interval at all. */}
      <RiffsRefresh active={riffs.some((r) => r.state === "working")} />

      {riffs.length === 0 ? (
        /* A sentence rather than the old `NoRiffs` card. That card's whole
           content was a heading, an explanation and the two capture buttons —
           and the buttons are now permanently on screen directly above this.
           An empty state whose call to action is a duplicate of the control
           above it is decoration around a button. */
        <div className="flex flex-col items-start gap-2 px-3">
          <p className="max-w-[60ch] text-caption text-pretty text-muted-foreground">
            Nothing has come back yet. Say a half-thought out loud and Quincy
            reads through it for the angles worth publishing — false starts and
            all. Or paste a post you saw, and it finds what you could take from
            that instead.
          </p>
          {/* The third route, carried over from `NoRiffs`. Still a ghost link
              because most of what it promises is `available: false` in
              lib/rhythms.ts — 25 of 28 rhythms on the day this shipped. */}
          <Button
            variant="ghost"
            size="sm"
            nativeButton={false}
            render={<Link href="/sources" />}
          >
            Connect a source
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {groups.map(([day, dayRiffs]) => (
            <section key={day} aria-labelledby={`day-${day}`}>
              {/* Uppercase, so the tracking opens up — default tracking on
                  capitals clumps, and the scale has a role for exactly this. */}
              <h2
                id={`day-${day}`}
                className="px-3 pb-3 text-eyebrow text-muted-foreground uppercase"
              >
                {day}
              </h2>
              <div className="flex flex-col gap-4">
                {dayRiffs.map((riff) => (
                  // The heading above carries the date, so the card's
                  // provenance line drops it visually and keeps it for the
                  // accessible name.
                  <RiffCard
                    key={riff.id}
                    riff={riff}
                    dateInGroupHeading
                    gaps={channelGaps(riff, connected)}
                    writes={writes}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
