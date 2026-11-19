import { and, eq, gte, inArray } from "drizzle-orm"

import { getBrainByKind, proposePage, putPage, type BrainPage } from "./brain"
import { channelLabel } from "./channels"
import { db } from "./db"
import { formatMultiple, hook, OUTLIER_GATE } from "./numbers"
import { medianOf, METRICS_WINDOW_DAYS, readPostMetrics } from "./post-metrics"
import {
  CONNECTABLE_CHANNELS,
  draft,
  draftVersion,
  postMetric,
  scheduledPost,
  sourceItem,
  type ConnectableChannel,
} from "./schema-app"

/**
 * Why a post worked, written back into the brain. See plans/028 item 2b.
 *
 * The loop nothing else in this product closes. `post_metric` has been filling
 * every morning since 2026-08-29 — 456 rows over 43 posts on the live account
 * as of 2026-09-09 — and until this file existed no generation path read a
 * single one of them. Charts looked backward and nothing carried a hook that
 * landed forward into the next draft.
 *
 * **The delivery mechanism is a brain page and nothing else.**
 * `renderBrainForUser` in lib/brain.ts renders every page by kind into the
 * prompt, and all five angle prompts plus the drafting prompt already receive
 * it. So a finding written here reaches generation with no edit to any prompt
 * file. That is the whole design; there is no second wire to add.
 *
 * **No model call, deliberately.** Everything this asks of a post — where the
 * number sits, whether the opening line has the writer in it, how many blocks
 * it runs to — is a string question, and string questions get string answers.
 * A model here would cost money daily on a path nobody is waiting for, would
 * answer differently on two identical runs, and would need a ceiling and a
 * cooldown of its own. lib/edit-classes.ts made the same call for the same
 * reason and its comment is the longer version of this one.
 *
 * **The thing this file is most careful about is not writing.** A brain page
 * is injected into every prompt in the product, so a confident sentence drawn
 * from four posts does not sit quietly in a corner being wrong — it steers
 * every angle and every draft, silently, for as long as it exists. The bars
 * below are set so that no claim on the page turns on a single post, and the
 * refusal path is the one with the tests.
 */

/* ── The bars ─────────────────────────────────────────────────────────────
   Three separate questions, argued separately, because collapsing them into
   one threshold is how a page gets written about noise.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * How far above the account's own median a post has to land to count as one
 * that worked. Imported rather than chosen here: `OUTLIER_GATE` is 3, and it
 * is already what /numbers tells the user "beat your own median" means. A
 * brain page using a second bar would make Quincy say two different things
 * about the same post — the one on the page the user reads and the one in the
 * prompt they never see.
 *
 * On the account this was tuned against, 3× the median was roughly the 97th
 * percentile of the measured window. 2× (~88th percentile) was
 * tried and rejected: it admits seven of twenty-eight posts, and a quarter of
 * everything you write is not "what worked", it is the upper half of normal.
 */
export const WORKED_GATE = OUTLIER_GATE

/**
 * Six posts above the gate before anything is claimed.
 *
 * Not a round number picked for comfort — it is the smallest count at which
 * `TRAIT_SHARE` survives losing any one post. A trait needs four carriers to
 * clear two thirds of six; drop the weakest winner and it is still 3 of 5,
 * still above the share. At five winners the same trait falls to 3 of 4 or
 * 2 of 4 depending on which post aged out of the window overnight, which
 * means the page would change its mind about the user's writing because one
 * tweet turned thirty-one days old.
 *
 * The live account is the argument. Three posts clear the gate there, and
 * those three agree on everything: 3 of 3 open with the writer in the line
 * (a 76-point lift over the other 25), 3 of 3 run three blocks or more (40),
 * 3 of 3 run longer than the median post (56). Every one of those clears both
 * bars, and all three would be untrue as claims. A sample of three agrees with
 * itself for free; that is what a sample of three is. This constant is the
 * only thing standing between that arithmetic and a page asserting it into
 * every prompt in the product.
 */
export const MIN_WINNERS = 6

/**
 * Twelve posts whose text can actually be read, before a comparison is worth
 * making. `TRAIT_LIFT` is measured against the posts that did *not* clear the
 * gate, and with six winners that leaves six others — a group that small has
 * a swing of seventeen points per post, which is most of the lift bar.
 */
export const MIN_READABLE = 12

/** A trait has to be in two thirds of the winners. Half is a coin. */
export const TRAIT_SHARE = 2 / 3

/**
 * And it has to be **twenty-five points more common among the winners than
 * among everything else.** This is the bar that does the real work, and it is
 * the one an obvious implementation leaves out.
 *
 * Measured on the live account on 2026-09-09, lowering the gate to 2× so there
 * were enough winners to compare at all: five of the seven posts above 2× the
 * median run to three or more blocks — 71%, which reads like a finding until
 * you count the rest, where it is 13 of 21, 62%. A nine-point difference. The
 * three-beat shape is how this person writes, not what made those five land,
 * and a page saying "your posts that worked came in three blocks" would be
 * true, useless, and would push every future draft toward a shape the
 * below-median posts share equally.
 *
 * Six of the ten traits behave the same way there — a share that looks like a
 * claim and a lift near zero. Exactly one survives: the winners run longer
 * than the median post 5 of 7 against 9 of 21, a 29-point lift. That is the
 * shape of a real finding, and the bar is set where it separates the one from
 * the six.
 *
 * Twenty-five points is where a trait stops being a description of the account
 * and starts being a description of the difference.
 */
export const TRAIT_LIFT = 0.25

/**
 * Kinds are read off the publish lineage, and lineage exists only for posts
 * Quincy actually published. When fewer than two thirds of the readable posts
 * carry one, the kind family is dropped rather than computed over whoever
 * happens to have it — a median over the third of the corpus that went through
 * one code path is a fact about that code path.
 *
 * On the live account this is 0%: `scheduled_post` has no rows, nothing has
 * ever gone out through Quincy, and so no post has a kind. The page says so.
 */
export const KIND_COVERAGE = 2 / 3

/** How many users one nightly pass will look at. */
export const MAX_USERS_PER_RUN = 50

/**
 * The slug family. One page per channel, mirroring `voice/x` — and for the
 * reason lib/brain.ts gives about voice: an impression on one platform is not
 * an impression on another, so a median computed across both is a number about
 * neither. Flattening the channels here would do to reach what flattening the
 * voice pages did to tone.
 */
export function workedSlug(channel: ConnectableChannel): string {
  return `memory/what-worked-${channel}`
}

/* ── The kind ─────────────────────────────────────────────────────────────
   `memory`, and the choice is not a shrug. Walking the six in lib/brain.ts
   against `assertValid`:

   - `voice` and `instruction` are validated against a `rules` array under
     `RULE_CAP`, and — worse than the cap — `renderRules` prints *only* the
     rules. The body never renders. That would force a statistical reading of
     seven posts into imperative bullets, which is exactly the failure the
     comment above `renderBrain`'s voice section describes: a compiled rule is
     grammatically an order, and a model obeys all of them, every time. "Open
     with yourself as the subject" measured at 71% would become a signature on
     100% of drafts. `instruction` renders under "These are not preferences.
     Do not break them", which is a sentence no measurement of thirty days of
     tweets has earned.
   - `policy` needs pillars summing to 100 and a posting window. It is the
     strategy page, and there is one; a second would be two strategies.
   - `story` needs a `point`, and its `proof` may only come from
     `user`/`published`/`confirmed` provenance — this page is `inferred`, so
     the receipts it is entirely made of could not be carried. It would also
     join the story bank, which is the evidence a draft draws its *content*
     from. This is not material to write about.
   - `identity` is who the user is. Capped at 50,000 characters and otherwise
     unvalidated, so it would fit — and it would be a lie about what the page
     is. Identity does not change because a tweet did 4,000 views.

   `memory` is what is left, and it fits on the merits rather than by
   elimination: unvalidated prose, rendered under "## Notes" into every prompt
   `renderBrainForUser` builds, `data` free to carry the numbers code reads,
   and framed as something observed rather than something ordered. The slug
   deliberately avoids `memory/YYYY-MM-DD`, which `isLedgerSlug` claims for the
   daily ledger.

   One property of that rendering is load-bearing below: `renderBrain` filters
   memory bodies through `.filter(Boolean)`, so a memory page with an empty
   body renders nothing at all. That is this file's retraction — see
   `updateWhatWorked`.
   ───────────────────────────────────────────────────────────────────────── */
const PAGE_KIND = "memory" as const

/* ── The pure layer ───────────────────────────────────────────────────────
   Everything down to "The read" is a function of its arguments, so the tests
   pin the arithmetic and the refusals against values taken from the live
   tables without standing a database up.
   ────────────────────────────────────────────────────────────────────────── */

/** One measured post, with whatever the schema could recover about it. */
export type MeasuredPost = {
  channel: ConnectableChannel
  /** The platform's own id. Always present; it is what the reading is keyed on. */
  externalId: string
  impressions: number
  /**
   * The post's text, or "" when the corpus has not caught up with it.
   *
   * Fifteen of the live account's 43 measured posts are in that state today:
   * the refresh reads the timeline and stamps `source_item_id` at write time,
   * so a post published since the last import has numbers and no row to hang
   * them on. They count toward the median — they are real posts that did real
   * numbers — and they cannot carry a trait, because there is nothing to read.
   */
  body: string
  url: string
  /**
   * The angle kind from the publish lineage, or "" when there is none. Empty
   * for every post on the live account: `scheduled_post` has zero rows.
   */
  kind: string
}

export type WorkedTraitId =
  | "first-person-hook"
  | "number-in-hook"
  | "number-alone"
  | "three-blocks"
  | "longer-than-usual"
  | "shorter-than-usual"
  | "emoji-in-hook"
  | "question-hook"
  | "carries-a-link"
  | "no-link"

type TraitContext = { medianLength: number }

type TraitDefinition = {
  id: WorkedTraitId
  /**
   * Written as an observation about the post, never as an instruction. The
   * renderer puts counts on either side of it; anything phrased as an
   * imperative would read as an order the moment it landed in a prompt.
   */
  label: string
  test: (body: string, ctx: TraitContext) => boolean
}

/**
 * First person as whole words, case-insensitive so the lowercase "i" this
 * corpus is full of counts.
 *
 * A deliberate copy of `FIRST_PERSON` in lib/edit-classes.ts rather than an
 * import: that one is private to a module that answers a different question
 * (did the user *move* toward the first person between two versions of one
 * post), and exporting it to share it would tie a rule about editing to a rule
 * about reach. Kept in step by hand; both are three lines.
 */
const FIRST_PERSON = /\b(?:i|i'm|i've|i'd|i'll|my|me|mine|myself)\b/i

/** A line that is a number and nothing else: "51×", "$1,200", "10 %". Same
 *  shape as `NUMBER_LINE` in lib/edit-classes.ts, same reason for the copy. */
const NUMBER_LINE = /^[^\p{L}]*\p{Nd}[^\p{L}]*$/u

const EMOJI = /\p{Extended_Pictographic}/u
const LINK = /https?:\/\/\S+|(?<=^|\s)www\.\S+/i

function lines(body: string): string[] {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
}

/** Blocks, not lines. A blank line is what separates one beat from the next. */
function blocks(body: string): string[] {
  return body
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean)
}

function openingLine(body: string): string {
  return lines(body)[0] ?? ""
}

/**
 * The traits, and the reason mirrored pairs are both here.
 *
 * `longer-than-usual` and `shorter-than-usual` are near-complements, as are
 * `carries-a-link` and `no-link`, and a trait's exact complement always has a
 * lift of the same size and the opposite sign — so at most one of a pair can
 * ever clear `TRAIT_LIFT`. Listing both costs one boolean each and removes an
 * authoring decision about which direction is allowed to be the finding. If
 * this account's long posts win, the page says so; if the one-liners win, it
 * says that instead, and neither answer was baked in here.
 *
 * What is *not* here is anything requiring judgment — "it was vulnerable",
 * "it told a story". A wrong guess on one of those does not stay wrong in one
 * place; it becomes a claim about the user's writing injected into every
 * prompt. lib/edit-classes.ts drew the same line for a feature with a fraction
 * of this one's blast radius.
 */
export const WORKED_TRAITS: readonly TraitDefinition[] = [
  {
    id: "first-person-hook",
    label: "the opening line has the writer in it",
    test: (body) => FIRST_PERSON.test(openingLine(body)),
  },
  {
    id: "number-in-hook",
    label: "a number appears in the opening line",
    test: (body) => /\p{Nd}/u.test(openingLine(body)),
  },
  {
    id: "number-alone",
    label: "a number stands on its own line",
    test: (body) => lines(body).some((line) => NUMBER_LINE.test(line)),
  },
  {
    id: "three-blocks",
    /**
     * The honest name for what this measures. The three beats are
     * did → happened → meant, and "meant" is a judgment no regular expression
     * reaches. What can be counted is the shape the beats are written in —
     * three short blocks, blank line between, which is what `STORY_SHAPE` in
     * lib/drafting.ts asks for. The label says structure and not beats so that
     * nothing downstream reads a block count as a claim about meaning.
     */
    label: "it runs three or more blocks, the shape the three beats take",
    test: (body) => blocks(body).length >= 3,
  },
  {
    id: "longer-than-usual",
    label: "it runs longer than half of the measured posts",
    test: (body, ctx) => body.trim().length > ctx.medianLength,
  },
  {
    id: "shorter-than-usual",
    label: "it runs shorter than half of the measured posts",
    test: (body, ctx) => body.trim().length <= ctx.medianLength,
  },
  {
    id: "emoji-in-hook",
    label: "an emoji sits in the opening line",
    test: (body) => EMOJI.test(openingLine(body)),
  },
  {
    id: "question-hook",
    label: "the opening line asks a question",
    test: (body) => openingLine(body).endsWith("?"),
  },
  {
    id: "carries-a-link",
    label: "it carries a link",
    test: (body) => LINK.test(body),
  },
  {
    id: "no-link",
    label: "it carries no link",
    test: (body) => !LINK.test(body),
  },
]

export type TraitFinding = {
  id: string
  label: string
  /** Winners carrying it, and how many winners there were. */
  winners: number
  winnerCount: number
  /** The same for everything that did not clear the gate. */
  rest: number
  restCount: number
  share: number
  /** `share` minus the share among the rest. The number that decides. */
  lift: number
}

export type WorkedWinner = {
  externalId: string
  url: string
  impressions: number
  multiple: number
  hook: string
}

export type WorkedRefusal =
  /** Nothing has been measured on this channel in the window. */
  | "no-metrics"
  /** Measured, but too few posts whose text the corpus can supply. */
  | "no-text"
  /** Readable, but too few of them cleared the gate. */
  | "thin-winners"
  /**
   * Enough winners, and nothing they share that the rest does not share too.
   * The most interesting refusal, and the one a naive version never reaches.
   */
  | "no-agreement"

export type WorkedFinding = {
  channel: ConnectableChannel
  /** Posts with a reading in the window — the median is over all of these. */
  measured: number
  /** Of those, the ones whose text could be recovered. */
  readable: number
  median: number
  gate: number
  medianLength: number
  winners: WorkedWinner[]
  restCount: number
  /** Every trait that cleared both bars, strongest lift first. */
  traits: TraitFinding[]
  /** True when kinds were counted at all. False is the live state today. */
  kindsRead: boolean
  /** Null when the evidence carries a page. */
  refusal: WorkedRefusal | null
}

function share(count: number, total: number): number {
  return total === 0 ? 0 : count / total
}

/**
 * The finding, or the refusal. One function so that the numbers a refusal
 * reports are the same numbers a page would have been built from.
 */
export function analyseWhatWorked(
  channel: ConnectableChannel,
  posts: MeasuredPost[]
): WorkedFinding {
  const median = medianOf(posts.map((p) => p.impressions))
  const gate = median * WORKED_GATE
  const readable = posts.filter((p) => p.body.trim().length > 0)
  const medianLength = medianOf(readable.map((p) => p.body.trim().length))

  const empty: Omit<WorkedFinding, "refusal"> = {
    channel,
    measured: posts.length,
    readable: readable.length,
    median,
    gate,
    medianLength,
    winners: [],
    restCount: 0,
    traits: [],
    kindsRead: false,
  }

  if (posts.length === 0) return { ...empty, refusal: "no-metrics" }
  if (readable.length < MIN_READABLE) return { ...empty, refusal: "no-text" }

  // Only readable posts can win. An unreadable post above the gate is a real
  // post that did well and there is nothing to learn from it yet, so it counts
  // toward the median and toward `measured` and nowhere else.
  const above = readable
    .filter((p) => median > 0 && p.impressions >= gate)
    .sort((a, b) => b.impressions - a.impressions)
  const won = new Set(above.map((p) => p.externalId))
  const rest = readable.filter((p) => !won.has(p.externalId))

  const winners: WorkedWinner[] = above.map((p) => ({
    externalId: p.externalId,
    url: p.url,
    impressions: p.impressions,
    multiple: median > 0 ? p.impressions / median : 0,
    hook: hook(p.body, 90),
  }))

  const base = { ...empty, winners, restCount: rest.length }

  if (above.length < MIN_WINNERS) return { ...base, refusal: "thin-winners" }

  const ctx: TraitContext = { medianLength }
  const candidates: TraitFinding[] = WORKED_TRAITS.map((trait) => {
    const inWinners = above.filter((p) => trait.test(p.body, ctx)).length
    const inRest = rest.filter((p) => trait.test(p.body, ctx)).length
    return {
      id: trait.id,
      label: trait.label,
      winners: inWinners,
      winnerCount: above.length,
      rest: inRest,
      restCount: rest.length,
      share: share(inWinners, above.length),
      lift: share(inWinners, above.length) - share(inRest, rest.length),
    }
  })

  /**
   * Kinds join the same two bars rather than getting a softer one. A kind is
   * evidence of exactly the same weight as a hook shape, and it arrives
   * through a join instead of a regular expression — which makes it more
   * trustworthy, not more important.
   */
  const withKind = readable.filter((p) => p.kind.trim().length > 0).length
  const kindsRead = share(withKind, readable.length) >= KIND_COVERAGE

  if (kindsRead) {
    for (const kind of new Set(above.map((p) => p.kind).filter(Boolean))) {
      const inWinners = above.filter((p) => p.kind === kind).length
      const inRest = rest.filter((p) => p.kind === kind).length
      candidates.push({
        id: `kind:${kind}`,
        label: `Quincy wrote it as ${kind}`,
        winners: inWinners,
        winnerCount: above.length,
        rest: inRest,
        restCount: rest.length,
        share: share(inWinners, above.length),
        lift: share(inWinners, above.length) - share(inRest, rest.length),
      })
    }
  }

  const traits = candidates
    .filter((t) => t.share >= TRAIT_SHARE && t.lift >= TRAIT_LIFT)
    .sort((a, b) => b.lift - a.lift)

  const found = { ...base, traits, kindsRead }

  return traits.length === 0
    ? { ...found, refusal: "no-agreement" }
    : { ...found, refusal: null }
}

/**
 * The page body.
 *
 * Three things it always does, and each one is a guard against the way a page
 * like this goes wrong once it is being read by every prompt in the product:
 *
 * 1. **It states its own sample first**, before any claim. A reader — human or
 *    model — should know it is looking at seven posts before it knows what the
 *    seven had in common.
 * 2. **It carries the counts on both sides of every claim.** "6 of 7, against
 *    4 of 21" is checkable. "Your best posts open with a number" is not, and
 *    is what the same finding turns into after one paraphrase.
 * 3. **It ends by ranking itself below the material.** Brain pages are
 *    injected everywhere with no ordering guarantee, and a note about what
 *    worked last month must not out-argue the voice pages or the thing the
 *    user actually said this morning.
 */
export function renderFinding(finding: WorkedFinding, now: Date): string {
  const label = channelLabel(finding.channel)
  const day = now.toISOString().slice(0, 10)
  const n = finding.winners.length

  const unread = finding.measured - finding.readable
  const sample = [
    `Measured on ${day} from ${finding.measured} ${label} ${finding.measured === 1 ? "post" : "posts"} read over the last ${METRICS_WINDOW_DAYS} days.`,
    unread > 0
      ? `${finding.readable} of them have their text on file; ${unread} do not, and count only toward the median.`
      : `Every one of them has its text on file.`,
    `The median post did ${finding.median.toLocaleString("en-US")} impressions. ${n} cleared ${WORKED_GATE}× that.`,
  ].join(" ")

  const claims = finding.traits.map(
    (t) =>
      `- ${t.label} — ${t.winners} of ${t.winnerCount}, against ${t.rest} of ${t.restCount} of the posts that did not clear the bar.`
  )

  const evidence = finding.winners.map(
    (w) => `- ${w.hook} — ${formatMultiple(w.multiple)} the median`
  )

  const caveats = [
    `Drawn from ${n} ${n === 1 ? "post" : "posts"}. That is a reading, not a rule: it says what has worked on this account so far, not what will work next.`,
    finding.kindsRead
      ? ""
      : `Nothing here has been published through Quincy, so no post carries an angle kind and none of the above is about one.`,
    `Where this disagrees with the voice pages, with the strategy, or with the material in front of you, they win.`,
  ].filter(Boolean)

  return [
    `### What worked on ${label}`,
    sample,
    `What those ${n} have in common that the rest do not:`,
    claims.join("\n"),
    `The posts themselves:`,
    evidence.join("\n"),
    caveats.join(" "),
  ].join("\n\n")
}

/** What code reads. The prose above is what only the model reads. */
export function findingData(
  finding: WorkedFinding,
  now: Date
): Record<string, unknown> {
  return {
    measuredAt: now.toISOString(),
    channel: finding.channel,
    windowDays: METRICS_WINDOW_DAYS,
    measured: finding.measured,
    readable: finding.readable,
    median: finding.median,
    gateMultiple: WORKED_GATE,
    gate: finding.gate,
    medianLength: finding.medianLength,
    kindsRead: finding.kindsRead,
    refusal: finding.refusal,
    winners: finding.winners,
    traits: finding.traits,
  }
}

/* ── The write ────────────────────────────────────────────────────────────── */

export type WhatWorkedDeps = {
  listUsers: (limit: number) => Promise<string[]>
  readPosts: (userId: string, now: Date) => Promise<MeasuredPost[]>
  listPages: (userId: string) => Promise<BrainPage[]>
  writePage: (args: {
    userId: string
    slug: string
    title: string
    body: string
    data: Record<string, unknown>
  }) => Promise<void>
}

export type WhatWorkedOutcome = {
  channel: ConnectableChannel
  /** "wrote" | "unchanged" | "retracted" | "held" | a refusal. */
  action:
    "wrote" | "unchanged" | "retracted" | "held" | "refused" | "refused-quietly"
  refusal: WorkedRefusal | null
}

/**
 * One user, every channel they have numbers on.
 *
 * Three behaviours worth naming, all of them about *not* leaving a wrong page
 * standing:
 *
 * - **Retraction.** Evidence expires. `readPostMetrics` looks back thirty
 *   days, so the seven posts that carried a page in September are six in
 *   October and four in November without anything happening. A page written
 *   from evidence that no longer exists is the worst state this feature has,
 *   because it is invisible — it keeps steering prompts and nothing on screen
 *   says its sample is gone. So a refusal against an existing page **blanks
 *   the body**: `renderBrain` filters memory bodies through `.filter(Boolean)`,
 *   so an empty body renders nothing into any prompt, while the row stays on
 *   /brain with its title and its numbers in `data` for anyone who wants to
 *   know why it went quiet. lib/brain.ts exports no delete, and this is better
 *   than one — a deleted page cannot explain itself.
 * - **Silence for the never-written.** A refusal with no page behind it writes
 *   nothing at all. Creating an empty row for an account that has never had
 *   this page would put a permanent blank entry on /brain to record that
 *   Quincy has nothing to say.
 * - **The user wins.** A page whose provenance is no longer `inferred` has
 *   been confirmed or corrected by hand, and this pass leaves it alone. That
 *   is Heartbeat's standing rule — never overwrite a field that has a
 *   correction newer than the evidence against it — applied to a job that runs
 *   at 06:00 with nobody watching.
 */
export async function updateWhatWorked({
  userId,
  deps,
  now = new Date(),
}: {
  userId: string
  deps: WhatWorkedDeps
  now?: Date
}): Promise<WhatWorkedOutcome[]> {
  const posts = await deps.readPosts(userId, now)
  const pages = await deps.listPages(userId)

  const byChannel = new Map<ConnectableChannel, MeasuredPost[]>()
  for (const post of posts) {
    const group = byChannel.get(post.channel)
    if (group) group.push(post)
    else byChannel.set(post.channel, [post])
  }

  // Channels with a page but no readings are included so a stale page still
  // gets its retraction. Without this, the one case where the numbers stop
  // arriving entirely — a revoked grant — is the case that leaves the page up.
  for (const channel of CONNECTABLE_CHANNELS) {
    if (byChannel.has(channel)) continue
    if (pages.some((page) => page.slug === workedSlug(channel))) {
      byChannel.set(channel, [])
    }
  }

  const outcomes: WhatWorkedOutcome[] = []

  for (const [channel, group] of byChannel) {
    const slug = workedSlug(channel)
    const existing = pages.find((page) => page.slug === slug) ?? null

    if (existing && existing.provenance !== "inferred") {
      outcomes.push({ channel, action: "held", refusal: null })
      continue
    }

    const finding = analyseWhatWorked(channel, group)
    const data = findingData(finding, now)

    if (finding.refusal) {
      if (!existing || existing.body.trim().length === 0) {
        outcomes.push({
          channel,
          action: existing ? "unchanged" : "refused-quietly",
          refusal: finding.refusal,
        })
        continue
      }

      await deps.writePage({
        userId,
        slug,
        title: `What worked — ${channelLabel(channel)}`,
        body: "",
        data,
      })
      outcomes.push({ channel, action: "retracted", refusal: finding.refusal })
      continue
    }

    const body = renderFinding(finding, now)

    /**
     * Unchanged means untouched. `putPage` snapshots the previous state into
     * `brain_page_version` on every write, so a page rewritten identically
     * every morning is a version row a day, forever, and a `brain_event` a day
     * beside it. The body is compared rather than the data because `data`
     * carries `measuredAt`, which differs every run by construction.
     */
    if (existing && existing.body.trim() === body.trim()) {
      outcomes.push({ channel, action: "unchanged", refusal: null })
      continue
    }

    await deps.writePage({
      userId,
      slug,
      title: `What worked — ${channelLabel(channel)}`,
      body,
      data,
    })
    outcomes.push({ channel, action: "wrote", refusal: null })
  }

  return outcomes
}

export type WhatWorkedRun = {
  /** Users with at least one reading in the window. */
  users: number
  /** Pages written or rewritten. */
  wrote: number
  /** Pages emptied because the evidence behind them expired. */
  retracted: number
  /** Users whose evidence did not support a page. */
  refused: number
  /** Users whose page was left alone because a human had touched it. */
  held: number
  /** Threw. Per user, never fatal to the run. */
  failed: number
  truncated: boolean
}

/**
 * The nightly pass, called by /api/cron/channels after the metrics land.
 *
 * Fails soft per user, like the refresh it follows: one user's bad row must
 * not stop everyone behind them, and nothing was written for that user, so
 * tomorrow picks it up unchanged.
 *
 * `MAX_USERS_PER_RUN` is a bound on the run, not on money — this spends
 * nothing, which is the point of doing it in code. It is here because the
 * route it hangs off has a 300-second ceiling and a job that silently
 * truncates reports success either way. The log is loud for the same reason
 * the refresh's is.
 */
export async function refreshWhatWorked({
  deps = LIVE_DEPS,
  now = new Date(),
  maxUsers = MAX_USERS_PER_RUN,
}: {
  deps?: WhatWorkedDeps
  now?: Date
  maxUsers?: number
} = {}): Promise<WhatWorkedRun> {
  const offered = await deps.listUsers(maxUsers + 1)
  const truncated = offered.length > maxUsers
  const batch = truncated ? offered.slice(0, maxUsers) : offered

  if (truncated) {
    console.error(
      `[what-worked] run capped at ${maxUsers} users — more were waiting. ` +
        "Raise the cap or move to a cursor."
    )
  }

  const run: WhatWorkedRun = {
    users: batch.length,
    wrote: 0,
    retracted: 0,
    refused: 0,
    held: 0,
    failed: 0,
    truncated,
  }

  for (const userId of batch) {
    try {
      const outcomes = await updateWhatWorked({ userId, deps, now })
      for (const outcome of outcomes) {
        if (outcome.action === "wrote") run.wrote += 1
        if (outcome.action === "retracted") run.retracted += 1
        if (outcome.action === "held") run.held += 1
        if (outcome.refusal) run.refused += 1
      }
    } catch (cause) {
      run.failed += 1
      console.error(`[what-worked] ${userId} failed:`, cause)
    }
  }

  return run
}

/* ── The live store ───────────────────────────────────────────────────────── */

/**
 * Every user with a reading inside the window.
 *
 * Read off `post_metric` rather than taken from `refreshPostMetrics`'s return,
 * and that is deliberate: a user whose X grant broke this morning still has
 * twenty-nine days of readings and still deserves the page that is already
 * derivable from them. Tying this to "who did X answer for today" would make
 * the finding disappear on the first bad token.
 */
async function listMeasuredUsers(limit: number): Promise<string[]> {
  const since = new Date(Date.now() - METRICS_WINDOW_DAYS * 24 * 60 * 60 * 1000)

  const rows = await db
    .selectDistinct({ userId: postMetric.userId })
    .from(postMetric)
    .where(gte(postMetric.capturedAt, since))
    .limit(limit)

  return rows.map((row) => row.userId)
}

/**
 * The three reads one user's finding needs, and the order they depend on.
 *
 * The text is joined on `external_id` rather than on `post_metric.source_item_id`
 * — the schema's own advice at that column ("`external_id` beside it is what a
 * backfill joins on"). `source_item_id` is stamped at write time, so a post
 * measured before the import caught up keeps an empty id forever even after
 * the corpus row appears. On the live account today the two agree on all 28
 * linked rows and the other 15 have no corpus row at all under either key, so
 * this changes nothing now and stops being wrong later.
 */
async function readMeasuredPosts(
  userId: string,
  now: Date
): Promise<MeasuredPost[]> {
  const readings = await readPostMetrics(userId, {
    days: METRICS_WINDOW_DAYS,
    now,
  })

  if (readings.length === 0) return []

  const ids = [...new Set(readings.map((r) => r.externalId))]

  const [texts, lineage] = await Promise.all([
    db
      .select({
        externalId: sourceItem.externalId,
        url: sourceItem.url,
        body: sourceItem.body,
      })
      .from(sourceItem)
      .where(
        and(eq(sourceItem.userId, userId), inArray(sourceItem.externalId, ids))
      ),
    // Published through Quincy: the only edge that can say what kind an angle
    // was. Zero rows on the live account, and the analysis says so rather than
    // guessing a kind from the text.
    db
      .select({
        externalId: scheduledPost.externalId,
        kind: draft.kind,
        body: draftVersion.body,
        url: scheduledPost.postUrl,
      })
      .from(scheduledPost)
      .innerJoin(
        draftVersion,
        eq(draftVersion.id, scheduledPost.draftVersionId)
      )
      .innerJoin(draft, eq(draft.id, draftVersion.draftId))
      .where(
        and(
          eq(scheduledPost.userId, userId),
          eq(scheduledPost.state, "published"),
          inArray(scheduledPost.externalId, ids)
        )
      ),
  ])

  const bodyOf = new Map(texts.map((row) => [row.externalId, row]))
  const publishedOf = new Map(
    lineage
      .filter((row): row is typeof row & { externalId: string } =>
        Boolean(row.externalId)
      )
      .map((row) => [row.externalId, row])
  )

  return readings.map((reading) => {
    const text = bodyOf.get(reading.externalId)
    const published = publishedOf.get(reading.externalId)
    return {
      channel: reading.channel,
      externalId: reading.externalId,
      impressions: reading.impressions,
      // The corpus wins when it has the post. A publish that has not been
      // imported — every Instagram post, today — still has the approved text
      // on the scheduled row, and the median can read it.
      body: text?.body || published?.body || "",
      url: text?.url || published?.url || "",
      kind: published?.kind ?? "",
    }
  })
}

/**
 * `proposePage` for a new or changed page — `inferred` provenance, which is
 * exactly what this is: something Quincy derived and the user has not seen. It
 * also appends the `brain_event` that makes the derivation legible on /brain.
 *
 * A retraction goes through `putPage` instead. An event saying "Proposed
 * memory 'what-worked-x'" against an empty body would be a log entry that
 * contradicts the page it points at.
 */
const LIVE_DEPS: WhatWorkedDeps = {
  listUsers: listMeasuredUsers,
  readPosts: readMeasuredPosts,
  listPages: (userId) => getBrainByKind(userId, PAGE_KIND),
  writePage: async ({ userId, slug, title, body, data }) => {
    if (!body.trim()) {
      await putPage({
        userId,
        slug,
        kind: PAGE_KIND,
        title,
        body,
        data,
        provenance: "inferred",
      })
      return
    }

    await proposePage({
      userId,
      slug,
      kind: PAGE_KIND,
      title,
      body,
      data,
      source: "post-metrics",
    })
  },
}
