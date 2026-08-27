import type { PolicyData } from "./brain"
import { hhmmIn } from "./timezone"
import { weekdayLabel } from "./slots"

/**
 * The strategy page, shaped and rendered. See plans/027, 3a.
 *
 * Split from lib/strategy.ts for the reason lib/slots.ts is split from
 * lib/scheduling.ts: that file imports `db` and the AI SDK, and importing it
 * from a client component would pull the Postgres driver and a model client
 * into the browser bundle. The editor at /brain renders the strategy from the
 * page it already holds in the query cache, so the formatting has to be
 * reachable from the client. Nothing in here reads a database, a model or an
 * environment variable.
 *
 * **The kind is `policy`, not a new `strategy`.** `PolicyData` already carries
 * every field plan 027 asks for — goal, audience, pillars with weights,
 * cadence, windows, lean-into, avoid — `assertValid` already refuses a split
 * that does not sum to 100, and `renderBrain` already renders the page into
 * the writer's prompt under "## Strategy — {title}". Adding a sixth
 * `BRAIN_KINDS` member would mean a migration, a second render branch and a
 * second invariant that says the same thing, in exchange for a different word
 * in one column. The slug carries the name instead: `strategy/x`, which is
 * what `/channels/[platform]` has read since the page existed.
 */

/** A strategy is a policy page. The alias exists so call sites read as 3a. */
export type Strategy = PolicyData

/**
 * Three to five. Two pillars is a split nobody needed to write down and six is
 * a list that stops deciding anything — the same argument `RULE_CAP` makes one
 * page over. Enforced on the way in rather than by the schema: `minItems` and
 * `maxItems` break structured output through the Gateway (see lib/adapt.ts).
 */
export const PILLAR_MIN = 3
export const PILLAR_CAP = 5

/** Labels for the two channels a strategy can exist for today. */
const CHANNEL_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
}

export function channelTitle(channel: string): string {
  return CHANNEL_LABEL[channel] ?? channel
}

/** `strategy/x`. The slug `/channels/[platform]` has always read. */
export function strategySlug(channel: string): string {
  return `strategy/${channel}`
}

/** "Strategy — X". `renderBrain` prints it as "## Strategy — {title}". */
export function strategyTitle(channel: string): string {
  return channelTitle(channel)
}

/** True for `strategy/<anything>`. Used by the /brain page router. */
export function isStrategySlug(slug: string): boolean {
  return slug.startsWith("strategy/")
}

/** `strategy/x` → `x`. */
export function channelOfSlug(slug: string): string {
  return slug.slice("strategy/".length)
}

/**
 * A posting window as the page stores it: "Tuesday 08:00–10:00".
 *
 * `PolicyData.windows` is `string[]` and stays that way. The model answers with
 * a weekday and two times, which is the shape a person means by "window", and
 * this is where that becomes the one string the page, the prompt and
 * `/channels` all already know how to print. Widening `windows` into objects
 * would have rewritten a stored shape three surfaces read, to hold the same
 * information.
 */
export function formatWindow(window: {
  weekday: number
  from: string
  to: string
}): string {
  const day = weekdayLabel(window.weekday)
  const from = normaliseTime(window.from)
  const to = normaliseTime(window.to)

  if (!from) return ""
  // An en dash, not a hyphen: this is a range, and the page is prose.
  return to && to !== from ? `${day} ${from}–${to}` : `${day} ${from}`
}

/** "9:5" → "09:05". "" for anything that is not a time of day. */
function normaliseTime(value: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim())
  if (!match) return ""

  const hour = Number(match[1])
  const minute = Number(match[2])
  if (hour > 23 || minute > 59) return ""

  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`
}

export type Pillar = { name: string; weight: number; note?: string }

/**
 * The weights, made to sum to exactly 100.
 *
 * **Normalised, not rejected**, and the choice is about who is holding the
 * pen. `assertValid` rejects a policy whose weights do not sum to 100, which is
 * right for a person typing into the editor — they can see the running total
 * and the sentence tells them how far off they are. A model cannot see it, and
 * a proposal thrown away over three points of arithmetic costs a paid call and
 * returns nothing. So the proposal is corrected here and the invariant stays
 * exactly where it is, as the thing that catches whatever this misses.
 *
 * Largest remainder, so the parts still sum to 100 after rounding rather than
 * to 99 — the failure that would make the invariant reject a list this function
 * had just balanced. Zeroed pillars are dropped and the rest re-balanced: a 0%
 * pillar is a line in the prompt that says to write nothing about something.
 */
export function normalisePillars(pillars: Pillar[]): Pillar[] {
  const cleaned = pillars
    .map((p) => ({
      name: p.name.trim(),
      weight: Math.max(0, Math.round(p.weight || 0)),
      ...(p.note?.trim() ? { note: p.note.trim() } : {}),
    }))
    .filter((p) => p.name)
    .slice(0, PILLAR_CAP)

  if (cleaned.length === 0) return []

  let working = cleaned
  // Bounded by the pillar count: each pass either returns or drops a pillar.
  for (let pass = 0; pass < PILLAR_CAP; pass++) {
    const balanced = spread(working)
    const kept = balanced.filter((p) => p.weight > 0)
    if (kept.length === balanced.length || kept.length === 0) return balanced
    working = kept
  }

  return working
}

function spread(pillars: Pillar[]): Pillar[] {
  const total = pillars.reduce((sum, p) => sum + p.weight, 0)
  // All zero is a model with no opinion about the split, which an even one
  // states honestly. Inventing an order here would be inventing a strategy.
  const exact =
    total > 0
      ? pillars.map((p) => (p.weight * 100) / total)
      : pillars.map(() => 100 / pillars.length)

  const floors = exact.map((value) => Math.floor(value))
  let left = 100 - floors.reduce((sum, value) => sum + value, 0)

  const byRemainder = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    // Index breaks the tie, so the same input always produces the same page.
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index)

  for (let i = 0; left > 0 && byRemainder.length > 0; i++, left--) {
    floors[byRemainder[i % byRemainder.length].index] += 1
  }

  return pillars.map((pillar, index) => ({ ...pillar, weight: floors[index] }))
}

/**
 * Posts per week turned into the pair `PolicyData.cadence` stores.
 *
 * The page has always held both numbers and `/channels` prints the weekly one,
 * so this keeps the shape and derives the daily figure rather than asking a
 * model for a number a person would have to reconcile with the other one.
 */
export function cadenceFor(postsPerWeek: number): PolicyData["cadence"] {
  const weekly = Math.max(0, Math.round(postsPerWeek || 0))
  return {
    postsPerDay: Math.max(1, Math.round(weekly / 7)),
    postsPerWeek: weekly,
  }
}

/**
 * The strategy as a page somebody reads.
 *
 * `renderPolicy` in lib/brain.ts is the other rendering of the same `data`, and
 * the two are deliberately different: that one is written for a prompt, flat
 * and dense, and this one is written for a person, with headings and a table.
 * Both read `data` and neither is stored — the fields stay the single
 * authoritative representation, which is the rule
 * `components/channels/policy-editor.tsx` was built around ("the fields are the
 * only representation and the prose is generated").
 */
export function strategyMarkdown(strategy: Partial<Strategy>): string {
  const blocks: string[] = []

  const goal = strategy.goal?.trim()
  if (goal) {
    const by = strategy.goalDate?.trim()
    blocks.push(`## Goal\n\n${goal}${by ? `\n\nBy ${by}.` : ""}`)
  }

  const audience = strategy.audience?.primary?.trim()
  if (audience) blocks.push(`## Audience\n\n${audience}`)

  const pillars = strategy.pillars ?? []
  if (pillars.length) {
    const rows = pillars.map(
      (pillar) =>
        `| ${escapeCell(pillar.name)} | ${pillar.weight}% | ${escapeCell(pillar.note ?? "")} |`
    )
    blocks.push(
      [
        "## Pillars",
        "",
        "| Pillar | Weight | Note |",
        "| --- | --- | --- |",
        ...rows,
      ].join("\n")
    )
  }

  const weekly = strategy.cadence?.postsPerWeek
  const windows = (strategy.windows ?? []).filter(Boolean)
  if (weekly || windows.length) {
    const lines: string[] = ["## Cadence", ""]
    if (weekly) {
      lines.push(`${weekly} ${weekly === 1 ? "post" : "posts"} a week.`)
      if (windows.length) lines.push("")
    }
    if (windows.length) lines.push(...windows.map((w) => `- ${w}`))
    blocks.push(lines.join("\n"))
  }

  const leanInto = (strategy.leanInto ?? []).filter(Boolean)
  if (leanInto.length) {
    blocks.push(`## Lean into\n\n${leanInto.map((x) => `- ${x}`).join("\n")}`)
  }

  const avoid = (strategy.avoid ?? []).filter(Boolean)
  if (avoid.length) {
    blocks.push(`## Avoid\n\n${avoid.map((x) => `- ${x}`).join("\n")}`)
  }

  return blocks.join("\n\n")
}

/** A pipe inside a cell ends the cell. Escaped rather than dropped. */
function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\n+/g, " ").trim()
}

/**
 * What the propose button says while it may not be pressed.
 *
 * Both halves are needed and neither is enough. "Try again in 4 hours" is
 * arithmetic the reader has to do against a clock they cannot see; "proposed
 * recently" does not say when it stops. So: when it happened, in their own
 * words, and the wall-clock time it comes back, in their own zone.
 */
export function cooldownNotice(
  proposedAt: Date,
  readyAt: Date,
  zone: string,
  now = new Date()
): string {
  return `Proposed ${describeAgo(now.getTime() - proposedAt.getTime())} — try again after ${hhmmIn(readyAt, zone)}`
}

function describeAgo(elapsedMs: number): string {
  const minutes = Math.max(1, Math.round(elapsedMs / 60_000))
  if (minutes < 60) {
    return `${minutes} ${minutes === 1 ? "minute" : "minutes"} ago`
  }

  const hours = Math.round(minutes / 60)
  return `${hours} ${hours === 1 ? "hour" : "hours"} ago`
}
