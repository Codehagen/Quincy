import { and, desc, eq, gte, inArray, lte } from "drizzle-orm"

import { draftFromAngle } from "./angle-draft"
import { db } from "./db"
import { createRiffFromSaid, shapesForChannel, shippedRiffId } from "./riffs"
import { lastOkRunAt } from "./rhythm-run"
import { riff, riffAngle, sourceItem } from "./schema-app"
import { readShippedBrief, readShippedMaterial } from "./shipped-work"

/**
 * Five small merges are not five posts. They are one list. Plan 027, 2d.
 *
 * The refusal rate on Shipped Work is by design — "most merged pull requests
 * are not posts" — and it is right. What it leaves behind is a week of real
 * work with nothing written about it: on 2026-08-26 the live database held ten
 * merges, five riffs and four drafts, and the five merges that produced
 * nothing produced nothing *individually*. Together they are the post this
 * user actually writes, which is a list.
 *
 * So this rhythm collects the week's refusals and stops — never the ones that
 * already became a riff — and hands them to the capture path as one scrap. It
 * is the honest volume lever: the bar on a single merge does not move, and
 * nothing here invents a reason a merge was interesting.
 *
 * **Nothing states a percentage.** The corpus uses list markers in a fraction
 * of its posts, `measureHabits` counts it, `renderHabits` puts the count on the
 * voice page, and `renderBrainForUser` prints that page into the drafting
 * prompt — which `draftFromAngle` already calls. Writing "19%" here would be a
 * second copy of a number the arithmetic already owns, and it would be wrong
 * the first week the corpus changed.
 */

/** The window one run reads. Weekly rhythm, weekly window. */
export const SHIP_LOG_WINDOW_DAYS = 7

/**
 * Below this there is no list.
 *
 * Two merges is the smallest thing that reads as "this week I shipped" rather
 * than as one post written badly. One merge that was refused was refused for a
 * reason, and re-asking about it under a different heading is how the bar
 * moves without anybody deciding to move it.
 */
export const MIN_MERGES = 2

/** The ceiling on what one run reads. Newest first, so a busy week loses its
 *  oldest merges rather than its most recent. */
export const MAX_MERGES = 10

/**
 * The ceiling on the scrap, in bytes.
 *
 * The same number `MAX_PATCH_BYTES` uses and for the same reason: this is the
 * thing being bought. `MAX_MERGES` bounds the rows and this bounds the prompt,
 * and they are different numbers — ten merges with long titles and long briefs
 * is a bigger call than ten merges without.
 */
export const MAX_SCRAP_BYTES = 6 * 1024

/**
 * One ship log per user per six days.
 *
 * The schedule is weekly, so this is not what makes it weekly. It is what
 * stops "Run now" buying a second riff and a second draft an hour after the
 * clock already bought one — `MANUAL_RUN_COOLDOWN_MS` is ten minutes, which is
 * the right number for a rhythm that re-reads the same bookmarks and the wrong
 * one for a rhythm whose whole output is a single weekly post.
 *
 * Six rather than seven, so a run that slipped an hour late one week does not
 * push the next one a week further out.
 */
export const SHIP_LOG_COOLDOWN_MS = 6 * 24 * 60 * 60 * 1000

/** The catalogue id, so the cooldown reads the same rhythm the card runs. */
export const SHIP_LOG_RHYTHM = "ship-log"

/** Where the riff says it came from. `github` is the source; the label is what
 *  the tile reads, and "Pull request" is a lie about seven of them. */
export const SHIP_LOG_SOURCE = { id: "github", label: "Ship log" } as const

/** A merge as this rhythm reads it. Everything comes off `source_item`. */
export type ShipLogMerge = {
  sourceItemId: string
  /** The pull request's own number. Printed, unlike everywhere else — a ship
   *  log is a list of merges and the number is how the owner finds one. */
  number: number
  title: string
  /** The brief's first sentence, or "" when the ingest wrote no brief. */
  brief: string
  additions: number
  files: number
}

/** The row shape `readShipLogMerges` returns and `pickMerges` decides on. */
export type MergeRow = {
  id: string
  meta: Record<string, unknown> | null
}

/* ── The pure layer ───────────────────────────────────────────────────────
   Everything that decides what the scrap says is a function of its arguments,
   matching how the rest of the repo tests internals (see lib/story-gaps.ts).
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Did this merge come back with a verdict rather than a riff?
 *
 * `meta.refusal` is written by `recordShippedRefusal` — the selection read the
 * merge and found nothing worth keeping. `meta.stopped` is written by
 * `recordShippedStop` — nothing ever read it, because the account was
 * unentitled, the ceiling was hit, or the workflow would not start. Both are
 * merges the owner made that produced no post, which is the list this rhythm
 * is for.
 *
 * A merge with an open question is deliberately included: the question is a way
 * out of a refusal and it has not been taken, so the merge is still silent.
 */
export function wasSilent(meta: Record<string, unknown> | null): boolean {
  return typeof meta?.refusal === "string" || typeof meta?.stopped === "string"
}

/**
 * The first sentence of the brief, and no more of it.
 *
 * A brief is two to four lines written for somebody outside the repository. One
 * line each is what makes the scrap a list rather than a document — and the
 * first line is the one the brief prompt puts the change in.
 */
export function firstSentence(brief: string, cap = 160): string {
  const line = readShippedBrief(brief).split("\n").find(Boolean) ?? ""
  const stop = line.search(/[.!?](\s|$)/)
  const sentence = stop === -1 ? line : line.slice(0, stop + 1)

  return sentence.trim().slice(0, cap)
}

/**
 * The merges worth listing, newest first, bounded.
 *
 * Rows arrive already narrowed to this user's window and already stripped of
 * anything that produced a riff — that exclusion is a second query and belongs
 * with the read. What is left to decide here is the verdict test and the cap,
 * which are the two things a test should be able to pin without a database.
 */
export function pickMerges(rows: MergeRow[], cap = MAX_MERGES): ShipLogMerge[] {
  const kept: ShipLogMerge[] = []

  for (const row of rows) {
    if (kept.length >= cap) break
    if (!wasSilent(row.meta)) continue

    const meta = row.meta ?? {}
    const material = readShippedMaterial(meta.material)

    kept.push({
      sourceItemId: row.id,
      number: typeof meta.number === "number" ? meta.number : 0,
      title:
        typeof meta.title === "string"
          ? meta.title.replace(/\s+/g, " ").trim().slice(0, 160)
          : "",
      brief: firstSentence(typeof meta.brief === "string" ? meta.brief : ""),
      additions: typeof meta.additions === "number" ? meta.additions : 0,
      // The changed-file count the platform reported, falling back to the
      // material's own list. Both are counts of the same thing and the
      // platform's is authoritative; the material is what a row written before
      // the webhook stored the count has.
      files:
        typeof meta.changedFiles === "number"
          ? meta.changedFiles
          : material.files.length,
    })
  }

  return kept
}

/**
 * The scrap: one line per merge, and a first line saying what it is.
 *
 * The header is the only instruction in it, and it says the form rather than
 * the content — "one list" is a fact about the material (seven merges, one
 * week) and not a rule about how the user writes. How the user writes lists is
 * on the voice page, measured, and it reaches the writer through the brain.
 *
 * Bounded on the built string rather than per line, the way
 * `describeContext` in lib/strategy.ts is: five lines that are each under
 * their own limit still add up to a call nobody budgeted for.
 */
export function shipLogScrap(
  merges: ShipLogMerge[],
  cap = MAX_SCRAP_BYTES
): string {
  const lines = merges.map((merge) => {
    const head = `#${merge.number} ${merge.title}`.trim()
    const counts =
      merge.additions || merge.files
        ? ` (${merge.additions} additions across ${merge.files} ${merge.files === 1 ? "file" : "files"})`
        : ""

    return merge.brief
      ? `${head}${counts} — ${merge.brief}`
      : `${head}${counts}`
  })

  return [
    `Everything I merged this week and never posted about, one line each:`,
    ``,
    ...lines,
  ]
    .join("\n")
    .slice(0, cap)
}

/**
 * The angle to draft, or null.
 *
 * The capture call writes several angles for one scrap; this picks the one
 * that can reach X, which is the channel the ship log is for. `shapesForChannel`
 * is the same table `targetsFor` reads, so an angle chosen here cannot arrive
 * at `draftFromAngle` and be refused for having nowhere to land.
 */
export function angleForChannel(
  angles: { id: string; shape: string }[],
  channel = "x"
): { id: string; shape: string } | null {
  const shapes = new Set<string>(shapesForChannel(channel))
  return angles.find((angle) => shapes.has(angle.shape)) ?? null
}

/* ── The reads ────────────────────────────────────────────────────────────── */

/**
 * The window's merges that left no riff.
 *
 * Two queries rather than a `NOT EXISTS`, matching `unadaptedBookmarks` in
 * lib/rhythm-handlers.ts: the exclusion set is one row per merge that produced
 * a riff, and a merge's riff id is derived from its `source_item` id, so the
 * join is arithmetic rather than SQL. That derivation is `shippedRiffId`, and
 * using it here is what keeps "already has a post" spelled one way.
 */
export async function readShipLogMerges(
  userId: string,
  since: Date,
  until: Date
): Promise<MergeRow[]> {
  const rows = await db
    .select({ id: sourceItem.id, meta: sourceItem.meta })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, "github"),
        gte(sourceItem.postedAt, since),
        lte(sourceItem.postedAt, until)
      )
    )
    .orderBy(desc(sourceItem.postedAt))

  if (rows.length === 0) return []

  const riffed = await db
    .select({ id: riff.id })
    .from(riff)
    .where(
      and(
        eq(riff.userId, userId),
        inArray(
          riff.id,
          rows.map((row) => shippedRiffId(row.id))
        )
      )
    )

  const written = new Set(riffed.map((row) => row.id))

  return rows.filter((row) => !written.has(shippedRiffId(row.id)))
}

/** The angles a riff came back with, in the order they were written. */
export async function anglesOfRiff(
  riffId: string
): Promise<{ id: string; shape: string }[]> {
  const rows = await db
    .select({ id: riffAngle.id, shape: riffAngle.shape })
    .from(riffAngle)
    .where(eq(riffAngle.riffId, riffId))
    .orderBy(riffAngle.position)

  return rows
}

/* ── The run ──────────────────────────────────────────────────────────────── */

export type ShipLogRecord = {
  merges: number
  riffId: string
  draftId: string
}

export type ShipLogResult =
  | { ok: true; summary: string; result: ShipLogRecord }
  | {
      ok: false
      reason: "cooldown" | "too-few" | "no-riff" | "no-angle" | "no-draft"
      summary: string
    }

/**
 * Everything the run reaches for, injectable.
 *
 * The same trade `StrategyDeps` makes next door: the orchestration is the part
 * with the rules in it — the cooldown, the minimum, the caps, the one draft —
 * and it should be testable without a database or a model.
 */
export type ShipLogDeps = {
  read: (userId: string, since: Date, until: Date) => Promise<MergeRow[]>
  lastRunAt: (userId: string) => Promise<Date | null>
  capture: (input: {
    userId: string
    text: string
    sourceId: string
    sourceLabel: string
  }) => Promise<{ ok: true; riffId: string } | { ok: false; message: string }>
  anglesOf: (riffId: string) => Promise<{ id: string; shape: string }[]>
  draft: (input: {
    userId: string
    angleId: string
  }) => Promise<{ ok: true; draftId: string } | { ok: false; message: string }>
}

const defaultDeps: ShipLogDeps = {
  read: readShipLogMerges,
  lastRunAt: (userId) => lastOkRunAt(userId, SHIP_LOG_RHYTHM),
  capture: async (input) => {
    const result = await createRiffFromSaid(input)
    return result.ok
      ? { ok: true, riffId: result.riffId }
      : { ok: false, message: result.message }
  },
  anglesOf: anglesOfRiff,
  draft: async (input) => {
    const result = await draftFromAngle(input)
    return result.ok
      ? { ok: true, draftId: result.draftId }
      : { ok: false, message: result.message }
  },
}

/**
 * One week of silent merges, one riff, one draft.
 *
 * The order is the order AGENTS.md's Money section asks for: the cooldown
 * before anything is read, the caps before anything is spent, and exactly two
 * model calls after that — the capture that finds the angles in the list, and
 * the writer that turns one of them into a post. Never more than one draft: a
 * ship log is a post, not a week of them.
 *
 * **Nothing here approves or publishes.** The draft lands on /drafts like every
 * other draft and waits for the same press.
 */
export async function runShipLog({
  userId,
  now = new Date(),
  deps = {},
}: {
  userId: string
  now?: Date
  deps?: Partial<ShipLogDeps>
}): Promise<ShipLogResult> {
  const { read, lastRunAt, capture, anglesOf, draft } = {
    ...defaultDeps,
    ...deps,
  }

  const last = await lastRunAt(userId)

  if (last && now.getTime() - last.getTime() < SHIP_LOG_COOLDOWN_MS) {
    const days = Math.ceil(
      (SHIP_LOG_COOLDOWN_MS - (now.getTime() - last.getTime())) /
        (24 * 60 * 60 * 1000)
    )

    return {
      ok: false,
      reason: "cooldown",
      summary: `Your last ship log went out this week — ${days} ${days === 1 ? "day" : "days"} until the next.`,
    }
  }

  /**
   * The window starts at the last ship log, never earlier than seven days ago.
   *
   * Without the first half a merge listed on Sunday is listed again the
   * following Saturday, because both runs can see it. Without the second half
   * a rhythm switched on after a month away opens with a month of merges under
   * a heading that says "this week".
   */
  const weekAgo = new Date(now.getTime() - SHIP_LOG_WINDOW_DAYS * 86_400_000)
  const since = last && last > weekAgo ? last : weekAgo

  const merges = pickMerges(await read(userId, since, now))

  if (merges.length < MIN_MERGES) {
    return {
      ok: false,
      reason: "too-few",
      summary:
        merges.length === 0
          ? "No merges went unwritten this week."
          : "One merge went unwritten this week — not enough for a list.",
    }
  }

  const captured = await capture({
    userId,
    text: shipLogScrap(merges),
    sourceId: SHIP_LOG_SOURCE.id,
    sourceLabel: SHIP_LOG_SOURCE.label,
  })

  if (!captured.ok) {
    return { ok: false, reason: "no-riff", summary: captured.message }
  }

  const angle = angleForChannel(await anglesOf(captured.riffId))

  if (!angle) {
    /**
     * A riff with angles that cannot reach X.
     *
     * Reported as an outcome rather than thrown: the riff exists and is on
     * /riffs, so the run produced something the owner can act on. Only the
     * draft is missing.
     */
    return {
      ok: false,
      reason: "no-angle",
      summary: `${merges.length} merges are waiting on /riffs — none of the angles fits X.`,
    }
  }

  const written = await draft({ userId, angleId: angle.id })

  if (!written.ok) {
    return { ok: false, reason: "no-draft", summary: written.message }
  }

  return {
    ok: true,
    summary: `Drafted one ship log from ${merges.length} merges nobody posted about.`,
    result: {
      merges: merges.length,
      riffId: captured.riffId,
      draftId: written.draftId,
    },
  }
}
