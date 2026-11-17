import { createIdGenerator } from "ai"
import { and, count, eq, gte, inArray } from "drizzle-orm"
import { start } from "workflow/api"

import { db } from "@/lib/db"
import { isEntitled, resolveEntitlement } from "@/lib/entitlement"
import {
  MAX_MEETING_CHARS,
  ownSegments,
  trimSegments,
  type MeetingPayload,
} from "@/lib/meetings"
import { failSpokenRiff, startMeetingRiff } from "@/lib/riffs"
import { user } from "@/lib/schema"
import { sourceItem } from "@/lib/schema-app"
import {
  recordArrival,
  recordSourceError,
  type SourceConnection,
} from "@/lib/source-connections"
import { runMeetingRiffWorkflow } from "@/workflows/run-meeting-riff"

/**
 * A verified, parsed meeting becomes a stored row and, at most, one riff.
 *
 * Moved out of app/api/webhooks/circleback/[token]/route.ts when Fathom and
 * Granola arrived, so three vendors share one copy of the rules that matter:
 * only the user's own words are stored, a redelivery is a no-op, an
 * unattributable call is a failed card rather than a guess, a lapsed account
 * stores and drafts nothing, and a day has a ceiling. Each route still owns
 * what differs: who it is, how it verifies, and how its body becomes a
 * `MeetingPayload`. The long arguments for every step below are where they
 * were written, in plans/019 and the Circleback route's history.
 *
 * Runs only after the route has verified the delivery. Nothing here checks a
 * signature, and nothing here may be reached without one.
 */

export type MeetingSource = "circleback" | "fathom" | "granola"

/** Every meeting source, for the ceiling. One calendar, one ceiling. */
export const MEETING_SOURCES: readonly MeetingSource[] = ["circleback", "fathom", "granola"]

const VENDOR: Record<MeetingSource, string> = {
  circleback: "Circleback",
  fathom: "Fathom",
  granola: "Granola",
}

/**
 * How many meetings one user may turn into work in 24 hours, **across every
 * note taker**.
 *
 * Six, the number plans/019 set for Circleback. Counted over all three
 * sources rather than per source: the rate is set by somebody's calendar, and
 * connecting a second note taker to the same calendar must not double what a
 * Tuesday with eight calls can spend.
 */
export const MAX_MEETINGS_PER_DAY = 6

const DAY_MS = 24 * 60 * 60 * 1000

const newSourceItemId = createIdGenerator({ prefix: "si", size: 20 })

export type MeetingIntake = {
  connection: SourceConnection
  source: MeetingSource
  payload: MeetingPayload
  /** Where the meeting lives at the vendor, for the row. */
  url: string
  /**
   * Addresses that are also this user, beside their Quincy address. Each one
   * is an exact join, never a heuristic: Fathom's recorder on a webhook made
   * for `my_recordings`, Granola's key owner as Granola reported it.
   */
  aliases?: string[]
  /** The vendor's own facts for `source_item.meta`, beside the shared ones. */
  meta?: Record<string, unknown>
}

export async function ingestMeeting({
  connection,
  source,
  payload,
  url,
  aliases = [],
  meta = {},
}: MeetingIntake): Promise<Response> {
  /**
   * `trialEndsAt` is selected because `resolveEntitlement` reads it off the
   * object it is handed. Omitting it resolves every user to `expired`,
   * silently (caught by scripts/verify-circleback.ts).
   */
  const [owner] = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      trialEndsAt: user.trialEndsAt,
    })
    .from(user)
    .where(eq(user.id, connection.userId))
    .limit(1)

  if (!owner) {
    // The cascade should make this unreachable: an orphan row, so stop.
    return new Response("Not found", { status: 404 })
  }

  // Something arrived, it verified, and it parsed. True whether or not this
  // particular call was worth publishing.
  await recordArrival(connection.id)

  const match = ownSegments(payload, [owner.email, ...aliases], owner.name, VENDOR[source])

  const { segments, dropped } = match.ok
    ? trimSegments(match.segments, MAX_MEETING_CHARS)
    : { segments: [], dropped: 0 }

  // Counted before this meeting is stored, so the row below is the (N+1)th.
  // Counts rows, not riffs: a call that produced nothing still paid for a
  // selection, and a ceiling that only counts successes is one a quiet day
  // cannot reach.
  const [{ value: recent } = { value: 0 }] = await db
    .select({ value: count() })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, owner.id),
        inArray(sourceItem.source, [...MEETING_SOURCES]),
        gte(sourceItem.createdAt, new Date(Date.now() - DAY_MS))
      )
    )

  /**
   * The material, filtered to the user's own turns. **Everyone else's words
   * are never written down.** The people on that call agreed to the note
   * taker; they did not agree to us.
   *
   * `onConflictDoNothing` on (user, source, external_id) is the replay story,
   * and it runs before the speaker match is acted on: an unmatched meeting
   * stores an empty body so its retries collide here instead of making a new
   * failed card each time.
   */
  const inserted = await db
    .insert(sourceItem)
    .values({
      id: newSourceItemId(),
      userId: owner.id,
      source,
      externalId: payload.id,
      url,
      postedAt: payload.createdAt,
      body: segments.map((s) => s.text).join("\n"),
      // The platform's own numbers, verbatim, never parsed for logic.
      meta: {
        name: payload.name,
        durationSeconds: payload.durationSeconds,
        attendeeCount: payload.attendees.length,
        tags: payload.tags,
        icalUid: payload.icalUid,
        speaker: match.ok ? match.speaker : "",
        segmentsKept: segments.length,
        segmentsDropped: dropped,
        ...meta,
      },
    })
    .onConflictDoNothing()
    .returning({ id: sourceItem.id })

  if (inserted.length === 0) {
    return Response.json({ state: "duplicate" }, { status: 200 })
  }

  // Could not tell which voice was theirs: a failed card, not a silent drop.
  if (!match.ok) {
    await recordSourceError(connection.id, match.message)

    const riffId = await startMeetingRiff(owner.id, source)
    await failSpokenRiff({ riffId, userId: owner.id, message: match.message })

    return Response.json({ riffId, state: "failed" }, { status: 202 })
  }

  // The read-only resolver: starting somebody's free day because a meeting
  // ended while they slept would spend it for them. 200, row kept.
  const entitlement = await resolveEntitlement(owner)

  if (!isEntitled(entitlement)) {
    return Response.json({ state: "stored", reason: "unentitled" })
  }

  if (recent >= MAX_MEETINGS_PER_DAY) {
    return Response.json({ state: "stored", reason: "daily-ceiling" })
  }

  const riffId = await startMeetingRiff(owner.id, source)

  try {
    await start(runMeetingRiffWorkflow, [
      {
        riffId,
        userId: owner.id,
        meetingName: payload.name,
        segments: segments.map((s) => s.text),
      },
    ])
  } catch (cause) {
    // The riff stays `working`; RIFF_STUCK_AFTER_MS turns it into a retry.
    console.error(`[${source}] could not start workflow:`, cause)
  }

  return Response.json({ riffId, state: "working" }, { status: 202 })
}
