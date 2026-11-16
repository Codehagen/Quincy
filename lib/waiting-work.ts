import { and, asc, eq } from "drizzle-orm"

import { db } from "./db"
import { formatConversationDate } from "./format-date"
import { draft, riff, riffAngle } from "./schema-app"
import { readShippedBeats } from "./shipped-work"
import { storyGaps } from "./story-gaps"
import { calendarDayIn, resolveTimeZone, type CalendarDate } from "./timezone"

/**
 * What Quincy is already holding for you, and the one thing it should lead
 * with. Plan 028, item 2a — "It initiates".
 *
 * **The measured bug.** A read of the live tables on 2026-09-09 found twelve
 * riffs in state `ready` for the owner, every one of them with its three beats
 * already extracted into `riff.context`, created between 26 and 31 August and
 * untouched since. The last draft in the database is 26 August. Nothing
 * failed: the import ran, the angles were found, the beats were extracted —
 * and then it stopped, because turning a riff into a draft is a click, and
 * nobody was ever asked to make it. The product did the work and left it on a
 * page the owner has no reason to open. Every earlier diagnosis of the
 * riff-to-draft gap assumed generation was failing. It was not.
 *
 * So this module answers exactly one question — *what is waiting, and which
 * single thing is the strongest offer?* — with a database read and a sort.
 *
 * **No model call, ever.** `composeStudioGreeting` runs on every /studio load,
 * and a paid call on that path would charge the owner for the sentence that
 * asks them to work. `runWeekPlan` is the model-backed weekly version of the
 * same idea and already exists; this is the free daily one, and the split is
 * deliberate — the thing that speaks every morning must be cheap enough that
 * nobody is ever tempted to switch it off.
 *
 * **Data out, never a sentence.** The wording lives in lib/studio-greeting.ts,
 * which is pure, synchronous and testable without a database — and the mail
 * step plan 028 puts after this one will want the same facts in different
 * words. A module that returned rendered text would have to be forked to say
 * the same thing twice.
 */

/**
 * How many angle rows one greeting may read.
 *
 * The rows come back oldest riff first, and oldest is what wins the ranking
 * below, so the cap can only ever discard riffs that had already lost. Twelve
 * ready riffs carry 44 angles between them on the live account today; 200
 * leaves room for four times that before the cap is reachable at all.
 *
 * The one case it gets wrong: an account whose 200 oldest angle rows are *all*
 * drafted falls through to a story gap instead of naming a newer riff. That is
 * a smaller failure than reading an unbounded table on a page that renders
 * every morning, and it is self-correcting — those riffs stop being `ready`
 * candidates as the owner works through them.
 */
export const WAITING_SCAN_CAP = 200

/** One angle of one `ready` riff, with whether a draft already carries it. */
export type DeskAngle = {
  riffId: string
  /** `sources.ts` id — "github", "voice", "notes". Names the material. */
  sourceId: string
  /** What the riff card says: "Pull request", "Voice note", "Pasted". */
  sourceLabel: string
  /** When the riff arrived. The instant, not a rendered day — see `describeWait`. */
  createdAt: Date
  /** Whether the three beats are already extracted on the riff. */
  beats: boolean
  hook: string
  position: number
  /**
   * A draft already carries this hook.
   *
   * The schema's own rule for "this angle was written", stated at `riffAngle`
   * and derived nowhere else: `draft.riff_hook` records the angle a piece came
   * from, so an angle is drafted exactly when a draft carries its hook.
   */
  drafted: boolean
}

/** A riff that still has something to write, with the hook to lead with. */
export type WaitingRiffPick = {
  riffId: string
  /** The lowest-positioned angle nobody has drafted. Quincy's own sentence. */
  hook: string
  /** The material, named mid-sentence: "pull request", "voice note", "note". */
  source: string
  createdAt: Date
  beats: boolean
  /** How many angles on it nobody has drafted. */
  openAngles: number
  /** Nothing on this riff has ever been drafted. */
  untouched: boolean
}

export type WaitingWork =
  | {
      kind: "riff"
      id: string
      hook: string
      source: string
      /**
       * `formatConversationDate` in the owner's zone: "Today", "3 days ago",
       * "26 Aug".
       *
       * Pre-rendered here for the reason `Riff.capturedAt` gives in
       * lib/riffs.ts: this is a server-rendered string, and re-deriving the day
       * anywhere else is a second thing that can disagree with the first in the
       * minutes either side of midnight.
       */
      waitingSince: string
      /** Whole calendar days it has waited, in the owner's zone. */
      waitedDays: number
      beats: boolean
      openAngles: number
      /**
       * Where the offer opens.
       *
       * The list page, not the riff, because there is no per-riff route — and
       * a `#riff-id` hash that no card renders would be a link that lies about
       * where it lands. The riff is at the bottom of /riffs, since the page
       * sorts newest first and this one is the oldest thing waiting.
       */
      href: string
    }
  | {
      kind: "gap"
      theme: string
      /** How many posts in the corpus mention it. Evidence travels with the ask. */
      posts: number
      question: string
      /**
       * No `href`, and that is the honest shape: a gap has nothing to open.
       * Answering it *is* the action, and it happens in the chat the greeting
       * is already sitting in.
       */
    }

/**
 * Which noun the sentence uses for the material.
 *
 * `sourceLabel` is written for a card, where it stands alone above a scrap.
 * Mid-sentence the same strings break: "the Pasted I read on 26 Aug" is not
 * English, and "the Pull request" carries a capital into the middle of a line.
 * So the id picks the noun, and the label is only the fallback for a source
 * this table has not met yet — lowercased, because that failure should read as
 * a slightly stiff sentence rather than a broken one.
 *
 * Exported for the test.
 */
export function sourceNoun(sourceId: string, sourceLabel: string): string {
  const known: Record<string, string> = {
    github: "pull request",
    voice: "voice note",
    notes: "note",
    meetings: "meeting note",
    x: "post",
  }

  return known[sourceId] ?? (sourceLabel.trim().toLowerCase() || "scrap")
}

/**
 * Angles in, the riffs that are still waiting out, strongest offer first.
 *
 * The whole of the ranking, with no database in it — the shape lib/story-gaps
 * uses for `rankGaps`, and for the same reason: the decision about what Quincy
 * leads with is the part worth testing, and it should not need a connection.
 *
 * **Untouched before oldest.** Both are "waiting", and they are not the same
 * offer. A riff the owner already drafted one angle from is a riff they opened,
 * read and made a decision about; the leftovers are what they *chose* not to
 * write. A riff with no draft behind it was never asked about at all, which is
 * the case this module exists for. Measured: one of the twelve — the oldest,
 * 26 August 08:08 — already carries a draft, so this rule changes the live
 * answer rather than being a distinction on paper.
 *
 * Considered and rejected: ranking a partially-drafted riff *higher*, on the
 * argument that a riff the owner drafted from is proven interesting. It reads
 * well and it re-offers work somebody has already turned down, which is how a
 * daily line becomes a nag — the same failure `readCandidates` in
 * lib/week-plan.ts avoids by excluding archived riffs.
 *
 * Then oldest first, because the longest wait is the strongest evidence that
 * nobody is coming for it on their own. Ties break on the riff id so the same
 * desk always produces the same offer; a greeting that proposes a different
 * riff on every reload is Quincy having no opinion, loudly.
 *
 * Exported for the test.
 */
export function rankWaitingRiffs(rows: DeskAngle[]): WaitingRiffPick[] {
  const byRiff = new Map<
    string,
    { row: DeskAngle; angles: Map<string, DeskAngle> }
  >()

  for (const row of rows) {
    const entry = byRiff.get(row.riffId) ?? { row, angles: new Map() }
    // Two drafts can carry the same hook, which makes the join return the same
    // angle twice. Fold on the hook and let `drafted` win, so a duplicated row
    // can never make a written angle look open.
    const seen = entry.angles.get(row.hook)
    entry.angles.set(row.hook, {
      ...row,
      drafted: (seen?.drafted ?? false) || row.drafted,
      position: Math.min(seen?.position ?? row.position, row.position),
    })
    byRiff.set(row.riffId, entry)
  }

  const picks: WaitingRiffPick[] = []

  for (const [riffId, entry] of byRiff) {
    const angles = [...entry.angles.values()]
    const open = angles
      .filter((angle) => !angle.drafted)
      .sort((a, b) => a.position - b.position || a.hook.localeCompare(b.hook))

    // A `ready` riff with nothing open has no offer in it. This is also the
    // only exclusion needed for a riff that never produced angles at all:
    // there is no hook to name, and "there is a scrap on the desk" is the
    // sentence the greeting already had.
    if (open.length === 0) continue

    picks.push({
      riffId,
      hook: open[0].hook,
      source: sourceNoun(entry.row.sourceId, entry.row.sourceLabel),
      createdAt: entry.row.createdAt,
      beats: entry.row.beats,
      openAngles: open.length,
      untouched: angles.every((angle) => !angle.drafted),
    })
  }

  return picks.sort(
    (a, b) =>
      Number(b.untouched) - Number(a.untouched) ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.riffId.localeCompare(b.riffId)
  )
}

/**
 * How long it has been waiting, said two ways.
 *
 * `waitingSince` is the label the rest of the product already uses for a day,
 * and `waitedDays` is the number the sentence needs to be honest about
 * staleness — "26 Aug" alone leaves the arithmetic to the reader, which is the
 * exact thing `formatConversationDate` switches to a calendar date to avoid.
 *
 * Counted in calendar days in the owner's own zone, not in elapsed hours: a
 * riff from 23:50 last night has not been waiting "one day", and a riff from
 * 00:10 this morning has not been waiting "zero" if you are reading it at
 * midnight in Oslo while the server thinks in UTC.
 *
 * Exported for the test.
 */
export function describeWait(
  createdAt: Date,
  now: Date,
  zone: string
): { waitingSince: string; waitedDays: number } {
  const midnightUtcOf = (date: CalendarDate) =>
    Date.UTC(date.year, date.month - 1, date.day)

  const days = Math.round(
    (midnightUtcOf(calendarDayIn(now, zone)) -
      midnightUtcOf(calendarDayIn(createdAt, zone))) /
      86_400_000
  )

  return {
    waitingSince: formatConversationDate(createdAt, zone, now),
    // A clock skew, or a row written a second into the future, must not
    // produce "waiting −1 days".
    waitedDays: Math.max(0, days),
  }
}

/**
 * Every angle of every `ready` riff, with whether it has already been written.
 *
 * One query rather than the three `getRiffs` spends, because this needs less:
 * no fallback detection, no stuck derivation, no archived riffs. The left join
 * on `draft.riff_hook` is the same anti-join `readCandidates` in
 * lib/week-plan.ts makes, and it is written here rather than imported for two
 * reasons: that one returns angles with the riff's timestamp thrown away, and
 * this one must not drag the week plan's model stack onto a page render.
 *
 * `state = 'ready'` is the whole filter. `working` is unfinished, `failed` has
 * no angles, and `archived` is the owner saying no — re-offering something
 * they filed away is how an advisor turns into a nag.
 */
async function readDesk(userId: string): Promise<DeskAngle[]> {
  const rows = await db
    .select({
      riffId: riff.id,
      sourceId: riff.sourceId,
      sourceLabel: riff.sourceLabel,
      createdAt: riff.createdAt,
      context: riff.context,
      hook: riffAngle.hook,
      position: riffAngle.position,
      draftId: draft.id,
    })
    .from(riff)
    .innerJoin(riffAngle, eq(riffAngle.riffId, riff.id))
    .leftJoin(
      draft,
      and(eq(draft.userId, riff.userId), eq(draft.riffHook, riffAngle.hook))
    )
    .where(and(eq(riff.userId, userId), eq(riff.state, "ready")))
    .orderBy(asc(riff.createdAt), asc(riffAngle.position))
    .limit(WAITING_SCAN_CAP)

  return rows.map((row) => {
    // `riff.context` is jsonb and its comment says it is never parsed for
    // logic beyond reading strings out of it. `readShippedBeats` is the
    // sanctioned reader: a riff written before 2026-08-25 has no `beats` key
    // at all, and a voice note will never have one, so this has to degrade to
    // "no beats" rather than throw on a page somebody is watching.
    const beats = readShippedBeats(row.context?.beats)

    return {
      riffId: row.riffId,
      sourceId: row.sourceId,
      sourceLabel: row.sourceLabel,
      createdAt: row.createdAt,
      beats: Boolean(beats.did || beats.happened || beats.learned),
      hook: row.hook,
      position: row.position,
      drafted: row.draftId !== null,
    }
  })
}

/**
 * The one thing Quincy should offer this account right now, or null.
 *
 * The order is plan 028's, and it is an order of how finished the thinking is:
 * a `ready` riff first, because the angles exist and the beats are already
 * extracted, so saying yes costs one model call and nothing else; a story gap
 * only after that, because a gap is a question the owner still has to answer
 * before anything can be written.
 *
 * The gap read only happens when nothing is waiting — two more queries on a
 * page render, paid only on the desk this module cannot fill.
 *
 * **Failures come back as null.** The caller is composing a greeting, and a
 * line that offers work must never be the thing that takes /studio down. The
 * greeting is correct without it — it is what the page said before this
 * existed. Same call `storyGapThemes` makes, for the same reason.
 */
export async function waitingWork(
  user: { id: string; timezone?: string | null },
  now = new Date()
): Promise<WaitingWork | null> {
  const zone = resolveTimeZone(user.timezone)

  try {
    const [lead] = rankWaitingRiffs(await readDesk(user.id))

    if (lead) {
      return {
        kind: "riff",
        id: lead.riffId,
        hook: lead.hook,
        source: lead.source,
        ...describeWait(lead.createdAt, now, zone),
        beats: lead.beats,
        openAngles: lead.openAngles,
        href: "/riffs",
      }
    }

    const [gap] = await storyGaps(user.id)
    if (!gap) return null

    return {
      kind: "gap",
      theme: gap.theme,
      posts: gap.posts,
      question: gap.question,
    }
  } catch (cause) {
    console.error("[waiting-work] could not read what is waiting:", cause)
    return null
  }
}
