"use client"

import * as React from "react"

import type { Riff } from "@/lib/riffs"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

import { AngleDestinations, ChannelGaps } from "./channel-gap"
import {
  AngleActions,
  AngleCard,
  AnglesPending,
  Provenance,
  RiffFailed,
  RiffFooter,
  Scrap,
  Steer,
} from "./riff-parts"

/**
 * One exchange: what you said, and what came back.
 *
 * The Desk shape, decided at /prototypes/riffs on 2026-08-08 — see
 * `components/riffs/instrument.tsx` for the decision and the numbers behind it.
 * The card's job changed with it. It used to be an item in a list of results;
 * it is now the answer half of a back-and-forth that starts at the instrument
 * above it, which is why the reply line exists and why the scrap can fold.
 *
 * **This is not a chat transcript, and the distinction is load-bearing.** The
 * product's standing argument against Stanley is that their Ideate is an empty
 * chat box, which holds nothing: you type, it answers, the thought is gone.
 * Nothing here takes free text. The only two inputs are the ones that produce
 * durable material — say something, or paste something somebody else wrote —
 * and what comes back is a set of decisions carrying provenance, not a message.
 * The back-and-forth *shape* is borrowed; the ephemerality is not.
 *
 * Named by its provenance line via `aria-labelledby`. Without it the page is a
 * run of anonymous articles under a single h1, so neither landmark nor heading
 * navigation gives a screen reader any way to move between riffs.
 */

/**
 * Where a scrap stops being readable at a glance and starts being a wall.
 *
 * Four lines at this measure is roughly 240 characters, so the control only
 * appears with a meaningful amount hidden behind it — a disclosure that opens
 * to reveal one more line is worse than no disclosure.
 *
 * Deliberately above what today's data contains: the longest scrap in the
 * `riff` table on the day this shipped was 369 characters, and the average was
 * 141. This is insurance for the input the product just built rather than a
 * response to what is already there. A four-minute voice note transcribes to
 * something closer to 1,900 characters, and `Scrap` never truncates on purpose
 * — a scrap you cannot read in full is one you cannot judge the angles
 * against. That rule survives here. It just stops being the default.
 */
const FOLD_SCRAP_ABOVE = 420

export function RiffCard({
  riff,
  dateInGroupHeading = false,
  gaps = [],
  writes,
}: {
  riff: Riff
  /** Set when the card sits under a day heading that already says when. */
  dateInGroupHeading?: boolean
  /**
   * How many drafts each shape writes for this account, from `writesPerShape`.
   *
   * Same contract as `gaps` and passed for the same reason: it is an answer
   * about the account's live connections, so it is resolved once on the server
   * rather than per angle in the browser. Absent means the count does not
   * render at all — see `writes` on `AngleCard`.
   */
  writes?: Record<Riff["angles"][number]["shape"], number>
  /**
   * Channels this riff reaches none of, from `channelGaps` on the server.
   *
   * Passed in rather than computed here because it depends on the user's live
   * connections, which a client component has no business fetching per card.
   * Empty for an account with nothing connected, and the whole control
   * correctly disappears.
   */
  gaps?: { id: string; label: string }[]
}) {
  const [full, setFull] = React.useState(false)
  const nameId = `riff-${riff.id}-from`
  const scrapId = `riff-${riff.id}-said`

  const anyDrafted = riff.angles.some((a) => a.status === "drafted")
  const waiting = riff.angles.filter((a) => a.status !== "drafted").length
  const foldable = riff.scrap.length > FOLD_SCRAP_ABOVE

  return (
    <article
      aria-labelledby={nameId}
      className="flex flex-col gap-4 rounded-xl bg-card p-4 shadow-xs"
    >
      <Provenance
        riff={riff}
        id={nameId}
        dateInGroupHeading={dateInGroupHeading}
      />

      {/* A voice riff has no scrap until it has been transcribed, and an empty
          blockquote is a grey bar that says nothing — worse than the gap it
          fills, because it looks like text that failed to load. The skeleton
          below is already carrying "something is coming". */}
      {riff.scrap ? (
        <div className="flex flex-col items-start gap-1">
          {/* Reaching into the component's `p` rather than forking `Scrap`.
              The clamp is this card's decision about how much room a quotation
              gets here; it is not a property of what a scrap is. */}
          <div
            id={scrapId}
            className={cn("w-full", foldable && !full && "[&_p]:line-clamp-4")}
          >
            <Scrap>{riff.scrap}</Scrap>
          </div>
          {foldable ? (
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              aria-expanded={full}
              aria-controls={scrapId}
              onClick={() => setFull((v) => !v)}
            >
              {full ? "Show less" : "Show all of it"}
            </Button>
          ) : null}
        </div>
      ) : null}

      {riff.state === "working" ? (
        <AnglesPending stuck={riff.stuck} />
      ) : riff.state === "failed" ? (
        <RiffFailed message={riff.failure} />
      ) : riff.angles.length === 0 ? (
        /* A ready riff with nothing left on it. Reachable by discarding the
           last angle, and previously rendered as an empty `<ul>` — a card that
           said nothing at all. */
        <p className="text-caption text-muted-foreground">
          Nothing left on this one.
        </p>
      ) : (
        <>
          {/* The line that makes this read as an answer rather than as a card
              with a list on it. It is also the only place on the page that says
              how many angles there are before you count them. */}
          <p className="text-caption text-muted-foreground">
            {waiting === 0
              ? "Everything here is drafted."
              : `Quincy found ${waiting === 1 ? "one way" : `${waiting} ways`} to take it.`}
          </p>

          <ul className="flex flex-col gap-2">
            {riff.angles.map((angle) => (
              // `onQuiet`: inside a card, an angle tile that also carried
              // elevation would be reading as depth it does not have.
              <AngleCard
                key={angle.id}
                angle={angle}
                onQuiet
                meta={<AngleDestinations shape={angle.shape} />}
                writes={writes?.[angle.shape]}
              >
                <AngleActions angle={angle} />
              </AngleCard>
            ))}
          </ul>

          {/* The gap, then the general-purpose escape hatch. Order is the
              argument: "nothing here reaches LinkedIn" is a specific, answered
              question, and `Steer` is what you reach for when the specific one
              is not your problem. */}
          <ChannelGaps riffId={riff.id} gaps={gaps} />

          {/* Steering sits under the angles rather than above them: you ask for
              something different after reading what you got, not before. */}
          <Steer riffId={riff.id} />
        </>
      )}

      <RiffFooter anyDrafted={anyDrafted} />
    </article>
  )
}
