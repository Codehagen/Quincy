import { and, asc, desc, eq, inArray, ne } from "drizzle-orm"

import { db } from "./db"
import { formatConversationDate } from "./format-date"
import { formatSlotTime } from "./slots"
import { resolveTimeZone } from "./timezone"
import { draft, draftVersion, scheduledPost, slot } from "./schema-app"

/**
 * Where the writing happens, and where it gets approved.
 *
 * **One piece, native versions per channel.** A draft owns the idea; each
 * channel gets its own text, written for that channel rather than pasted into
 * it. That is not a UI preference — `lib/rhythms.ts` already promises it in
 * Atomize ("a thread for X, a carousel for LinkedIn, vertical cuts for TikTok —
 * rather than pasting the same text everywhere"), and docs/vision.md rests on
 * the claim that the same message told four ways differs by two orders of
 * magnitude in reach. A model where one draft is one post has nowhere to put
 * that.
 *
 * **Drafts approves, Lineup schedules.** Two surfaces, two questions: "is this
 * good enough" and "when does it go out". Folding them together would mean
 * picking a time for writing you have not finished reading.
 *
 * **Approval is per version**, for the same reason a riff's decision is per
 * angle: these are different texts going to different places, and approving
 * them as a bundle would mean approving writing you have not read.
 *
 * Provenance continues the chain. `from.sourceId` is a real id from
 * lib/sources.ts and `from.riffHook` is the angle the piece was drafted from,
 * so Sources → Riffs → Drafts is legible on screen rather than implied.
 */

export type Version = {
  /** The row id. Server actions address a version by this, never by channel. */
  id: string
  /**
   * Channel id, matching the keys in `CHANNEL_RULES` in lib/post-length.ts and
   * the platform marks in components/channels/platform-mark.tsx. This is what
   * decides the ceiling, the fold and the per-link cost.
   */
  channel: string
  /**
   * Display name, carried rather than derived. The same duplication `Riff`
   * makes with `sourceLabel`, for the same reason: a version renders in a
   * client component and a lookup table would have to travel with it.
   */
  label: string
  /** The text itself, written for this channel. Never a copy of another one. */
  text: string
  /**
   * `writing` — Quincy has written it and you have not decided. `approved` is
   * what "Approve" leaves behind: the version stops being editable and starts
   * being something Lineup can schedule. It stays on the card rather than
   * disappearing, because a draft whose versions vanish one by one gives you no
   * way to see what you already decided.
   */
  state: "writing" | "approved"
  /**
   * When this goes out, formatted in the reader's zone, or null when it has no
   * time yet.
   *
   * **Read from the server rather than remembered by the page**, and that is the
   * whole reason it exists. Approving used to report its outcome only through
   * client state, so the sentence "no slot for this channel yet" survived
   * exactly until the next render and then the row said "Approved" and nothing
   * else. A real account ended up with two approved drafts, neither of them
   * scheduled, and no screen in the product willing to say so.
   *
   * Formatted here for the reason `from.at` is: the card is a client component,
   * and formatting a timestamp there produces a different string than the
   * server did in the seconds either side of midnight.
   */
  goingOut: string | null
  /**
   * Whether this version's channel has any standing slot at all.
   *
   * The difference between the two ways a version can have no time: there is
   * nowhere to put it, or everywhere is taken. Only the first has an obvious
   * next step, and it is the one that catches people out — a slot made for X
   * does nothing for a LinkedIn version, and until this the product had no way
   * to say that.
   */
  hasSlot: boolean
}

export type Draft = {
  id: string
  /** What the piece is about, in your words. Not a headline. */
  idea: string
  /** Where it came from, so a draft can say what it is downstream of. */
  from: {
    /** The angle from lib/riffs.ts this was drafted from, verbatim. */
    riffHook: string
    /** Source id from lib/sources.ts, so the tile and the chain stay honest. */
    sourceId: string
    sourceLabel: string
    /**
     * Pre-rendered relative text rather than a Date, matching `Riff`. These
     * strings are read on the server and handed to a client card; formatting on
     * the client from a timestamp would render a different string than the
     * server did.
     */
    at: string
    /**
     * The post somebody else wrote that prompted this one, when there was one.
     *
     * On the card rather than only in the database, and that is the point of
     * the feature rather than a nicety: a draft adapted from a stranger's post
     * has to keep saying so, or in six months there is no way to tell your own
     * thinking from an idea you borrowed. `url` is empty for a post pasted as
     * plain text, which is a state and not a failure — the handle may be empty
     * with it.
     */
    adaptedFrom: { url: string; handle: string } | null
  }
  versions: Version[]
}

/**
 * The pieces waiting on you.
 *
 * Reads the database. This used to hand fixtures to an allowlisted address from
 * lib/demo.ts, because there was no table behind it — that file is gone and the
 * seed in scripts/seed-drafts.ts writes real rows to a real account instead. An
 * account with nothing still gets an empty list, which was always the true
 * answer; the difference is that it is now the same code path as an account
 * with something.
 *
 * Two queries rather than a join with `with:`. The versions of four drafts is a
 * handful of rows either way, and assembling them here keeps the ordering
 * explicit: pieces newest first, versions in the order they were created so a
 * channel does not jump around the card between loads.
 */
/**
 * How many previously written versions the drafting prompt is shown.
 *
 * Enough to make a repeated opener or sign-off visible as a pattern, few
 * enough that the avoid-list cannot crowd out the voice it sits next to. At
 * roughly two versions per draft this is the last four or five pieces.
 */
const RECENT_FOR_PROMPT = 10

/**
 * The last few things Quincy wrote for this user, newest first.
 *
 * Written for `generateDraft`, and it exists because every other defence
 * against sameness is a sentence in a prompt. On 2026-08-09 the /drafts page
 * held six consecutive posts opening on a claim plus 🤯 and closing on ✨ —
 * traced to a compiled voice rule that said exactly that, but the deeper
 * reason is that each generation is blind. A prompt cannot be told to vary
 * from work it has never seen, so nothing stops two calls a day apart from
 * independently making the same reasonable choice.
 *
 * Bodies rather than a computed signature (first emoji, last line, whatever):
 * the repetition worth avoiding is not only the emoji. It is the opening
 * move, the two-word sentence in the middle, the rallying close. Handing over
 * the text lets the model see all of it, and ten short posts is a cheaper
 * prompt than the voice section already sitting above them.
 *
 * A version whose body is the bare hook is skipped — those are the fallback
 * rows `draftAngle` writes when generation fails, so they are the hook echoed
 * back rather than anything Quincy chose to write, and telling the model to
 * avoid its own fallbacks would be telling it to avoid the user's own words.
 */
export async function recentlyWritten(
  userId: string,
  limit = RECENT_FOR_PROMPT
): Promise<string[]> {
  const rows = await db
    .select({ body: draftVersion.body })
    .from(draftVersion)
    .innerJoin(draft, eq(draftVersion.draftId, draft.id))
    .where(and(eq(draft.userId, userId), ne(draftVersion.body, draft.riffHook)))
    .orderBy(desc(draftVersion.createdAt))
    .limit(limit)

  return rows
    .map((r) => r.body.trim())
    .filter(Boolean)
    .map((body) => body.slice(0, 600))
}

export async function getDrafts(user: {
  id: string
  email: string
  timezone?: string | null
}): Promise<Draft[]> {
  // The slot read keys on the account alone, so it travels with the pieces
  // read instead of waiting at the back of the chain. On an empty account this
  // now runs one extra tiny query in the same round trip — the price of not
  // serializing four round trips on every account that has work.
  const [pieces, slotRows] = await Promise.all([
    db
      .select()
      .from(draft)
      .where(eq(draft.userId, user.id))
      .orderBy(asc(draft.createdAt)),
    db
      .select({ channel: slot.channel })
      .from(slot)
      .where(eq(slot.userId, user.id)),
  ])

  if (pieces.length === 0) return []

  /**
   * Versions and their scheduled time, in one read.
   *
   * This was two round trips — versions, then scheduled posts for those
   * versions — but a scheduled post belongs to at most one version
   * (`scheduled_post_version_key` is unique on draft_version_id), so the left
   * join returns exactly one row per version with its time or null beside it.
   * The account-level question — "does this channel have a rhythm at all" —
   * stays its own read above, which is the half of the old two-reads argument
   * that was actually about shape rather than sequencing.
   */
  const versionRows = await db
    .select({
      version: draftVersion,
      scheduledFor: scheduledPost.scheduledFor,
    })
    .from(draftVersion)
    .leftJoin(scheduledPost, eq(scheduledPost.draftVersionId, draftVersion.id))
    .where(
      inArray(
        draftVersion.draftId,
        pieces.map((p) => p.id)
      )
    )
    .orderBy(asc(draftVersion.createdAt))

  const versions = versionRows.map((r) => r.version)

  const channelsWithSlots = new Set(slotRows.map((s) => s.channel))

  const now = new Date()
  const zone = resolveTimeZone(user.timezone)

  const timeByVersion = new Map(
    versionRows
      .filter((r) => r.scheduledFor !== null)
      .map((r) => [r.version.id, r.scheduledFor])
  )

  return pieces.map((piece) => ({
    id: piece.id,
    idea: piece.idea,
    from: {
      riffHook: piece.riffHook,
      sourceId: piece.sourceId,
      sourceLabel: piece.sourceLabel,
      // Rendered on the server, deliberately. The card is a client component,
      // and formatting a timestamp there would produce a different string than
      // the server did in the seconds either side of midnight.
      at: formatConversationDate(piece.createdAt, zone, now),
      // Both columns default to '', so "was this adapted" is one question
      // rather than two nullable fields the card has to reconcile.
      adaptedFrom:
        piece.adaptedFromUrl || piece.adaptedFromHandle
          ? {
              url: piece.adaptedFromUrl,
              handle: piece.adaptedFromHandle,
            }
          : null,
    },
    versions: versions
      .filter((v) => v.draftId === piece.id)
      .map((v) => {
        const at = timeByVersion.get(v.id) ?? null

        return {
          id: v.id,
          channel: v.channel,
          label: v.label,
          text: v.body,
          state: v.state,
          // Weekday and time, plus the date, because a draft card carries no
          // surrounding week to read "Monday" against.
          // Not formatConversationDate — that buckets the past and answers
          // "Today" for anything in the future. See formatSlotTime.
          goingOut: at ? formatSlotTime(at, zone, now) : null,
          hasSlot: channelsWithSlots.has(v.channel),
        }
      }),
  }))
}

/**
 * Approved writing that still has no time, which is not the same as finished.
 *
 * The count the page needs at exactly the moment it has nothing left to ask
 * you. Clearing the queue used to be reported as "approved versions are queued
 * in Lineup, which decides when each one goes out" — the same claim plans/010
 * removed from the done row, for the same reason: approving places a version
 * only if a free slot exists for its channel, so a version can be approved and
 * have nowhere to go. On 2026-08-09 the account this was measured against held
 * two approved versions and no scheduled posts at all, so the sentence was
 * false for every version it described.
 *
 * A count rather than a boolean, because the number is the whole point: "three
 * versions have no time yet" is a thing to go and fix, where "some writing may
 * not be scheduled" is a disclaimer.
 */
export function countWithoutTime(drafts: Draft[]) {
  return drafts.reduce(
    (n, d) =>
      n +
      d.versions.filter((v) => v.state === "approved" && !v.goingOut).length,
    0
  )
}

/** Approval is per version, so "done" is a count and not a boolean. */
export function counts(draft: Draft) {
  const approved = draft.versions.filter((v) => v.state === "approved").length
  return { approved, total: draft.versions.length }
}

/**
 * Is every version of this piece decided?
 *
 * The one derived fact the whole page turns on: it picks the group a piece sits
 * in on the rail, and which of the two panes it opens into. Here rather than in
 * a component because both sides have to agree, and two copies of "done" is how
 * a piece ends up filed under Done while still rendering an Approve button.
 */
export function isDone(draft: Draft) {
  return draft.versions.every((v) => v.state === "approved")
}

/**
 * Which versions of a piece are the same text as a sibling, by channel.
 *
 * **This catches a live bug rather than a hypothetical one.** On 2026-08-09 the
 * production table held `draft-rif-NuHsgNddcT6XNP4x-a2` — "building alone in
 * silence" — with byte-identical text on X and on LinkedIn. That is precisely
 * the failure docs/vision.md rests on the product preventing: the same message
 * told four ways is the whole claim, and the same message pasted twice is the
 * thing being claimed against. No surface in the product mentioned it.
 *
 * Whitespace is collapsed before comparing, so "the same post with a line break
 * moved" still counts — that is the same failure with better manners. Case is
 * kept: changing it is an edit, and calling two differently-cased posts
 * identical would be wrong in the direction that costs trust.
 *
 * Returns the label of *a* twin, not all of them. Three identical versions would
 * otherwise grow the message a list, and one makes the point.
 */
export function duplicates(draft: Draft): Record<string, string | undefined> {
  const seen = new Map<string, string>()
  const out: Record<string, string | undefined> = {}

  for (const v of draft.versions) {
    const key = v.text.trim().replace(/\s+/g, " ")
    const first = seen.get(key)
    if (first) out[v.channel] = first
    else seen.set(key, v.label)
  }

  /**
   * The first of a pair has to be marked too.
   *
   * Without this the page reports the problem on the second text and stays
   * silent on the first, which reads as "the LinkedIn one is wrong" rather than
   * "these two are the same". Neither one is the wrong one; the pair is.
   */
  for (const v of draft.versions) {
    if (!out[v.channel]) continue
    const twin = draft.versions.find(
      (o) => o.label === out[v.channel] && o.channel !== v.channel
    )
    if (twin && !out[twin.channel]) out[twin.channel] = v.label
  }

  return out
}

/**
 * What is still a decision, which is not the same as what exists.
 *
 * The same rule `countOpen` follows on /riffs: a count that keeps saying seven
 * after you have dealt with four is wrong in the direction that matters. A
 * draft whose versions are all approved is finished work sitting on the page
 * for reference, and counting it would make the number a measure of history
 * rather than of what is left.
 */
export function countWaiting(drafts: Draft[]) {
  const versions = drafts.reduce(
    (n, d) => n + d.versions.filter((v) => v.state !== "approved").length,
    0
  )
  const open = drafts.filter((d) =>
    d.versions.some((v) => v.state !== "approved")
  ).length

  return { drafts: open, versions }
}
