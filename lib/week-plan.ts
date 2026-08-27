import { generateObject, jsonSchema } from "ai"
import { and, desc, eq, isNull } from "drizzle-orm"

import { draftFromAngle } from "./angle-draft"
import { db } from "./db"
import { recentKinds } from "./drafts"
import { REASONING } from "./model-options"
import { lastOkRunAt } from "./rhythm-run"
import { nextFreeSlot, type Placement } from "./scheduling"
import { draft, riff, riffAngle } from "./schema-app"
import { readStrategy } from "./strategy"
import type { Strategy } from "./strategy-format"
import { storyGaps, type StoryGap } from "./story-gaps"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  type StructuredUsage,
} from "./structured-output"
import { recordUsage } from "./usage"

/**
 * The week, planned and then argued with. Plan 027, 4c.
 *
 * Four steps, and the third is the one that makes it worth building: read the
 * strategy, propose the week's angles from what is already waiting, **critique
 * each one**, then draft the survivors. A planner with no critique step is a
 * list of everything you had, reordered — the reference product's weekly loop
 * reads strategy, plans, drafts, schedules and notifies, and the only reason
 * its output is not five variations of the same post is that a person reads it
 * afterwards.
 *
 * Three things the critique is against, and none of them is taste:
 *
 * - The `avoid` list, which the strategy calls a rule. `hitsAvoid` enforces it
 *   after the model has answered, because a model asked to respect a list and
 *   to fill a cadence will fill the cadence.
 * - The kinds of the last six drafts. Six drafts is a couple of weeks
 *   (`recentKinds`), and a week of five posts that are all the same kind is a
 *   week that reads as one post sent five times.
 * - The voice rules, which the model is shown and which only it can judge.
 *
 * **It never approves and never schedules.** `scheduled_post` is a row about an
 * approved version with a time, so a draft cannot be placed in a slot without
 * being approved first — and approving is the user's press, per docs/vision.md.
 * So the slot each draft *would* take is computed and recorded, and the drafts
 * wait on /drafts like every other draft. See `plan.placed`.
 */

/**
 * The model that chooses and critiques.
 *
 * `CHAT_MODEL` rather than `DRAFTING_MODEL`, and the split is lib/drafting.ts's
 * argument used in the other direction: that variable exists so the writing can
 * be moved to a better model without moving everything else. This call writes
 * nothing a person publishes — it picks ids and writes one line of criticism
 * per pick — so it belongs on the cheap side of that split and must not follow
 * the writer up.
 */
const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/** Exported so the caller can pass the same string to `recordUsage`. */
export const WEEK_PLAN_MODEL = MODEL

/**
 * The ceiling on what one plan reads. Plan 027 asks for 12 KB.
 *
 * Applied to the assembled string rather than to each part, the way
 * `describeContext` does in lib/strategy.ts: the parts are what vary, and four
 * sections each inside their own limit still add up to a call nobody budgeted
 * for. The candidate list is the part that grows without bound — a user who
 * has not drafted anything for a month has a month of angles waiting.
 */
export const MAX_INPUT_CHARS = 12_000

/**
 * The most angles one prompt reads, newest riff first.
 *
 * Distinct from the drafting cap below: this bounds what is *read* and that
 * bounds what is *bought*. AGENTS.md's Money section is explicit that
 * conflating the two is how `collectBookmarks` shipped with a limit on the
 * rows it kept and none on the pages it paid for.
 */
export const MAX_CANDIDATES = 30

/**
 * The most drafts one run writes, whatever the cadence says.
 *
 * A strategy asking for ten posts a week is a strategy; ten drafts arriving at
 * 07:00 on Monday is a backlog, and `DRAFTS_PER_RUN` in lib/rhythm-handlers.ts
 * already records where that ends — "a drafting surface with a backlog on it
 * stops being read at all". Each draft is a model call, so this is also the
 * per-run spend ceiling.
 */
export const MAX_DRAFTS = 5

/**
 * Twenty hours between plans, per user.
 *
 * The schedule is weekly, so this is not what makes it weekly — it is what
 * stops "Run now" buying five more drafts an hour after Monday's run bought
 * five. Twenty rather than twenty-four so a run that slipped is not pushed a
 * whole day, the same shape `METRICS_COOLDOWN_MS` uses.
 */
export const WEEK_PLAN_COOLDOWN_MS = 20 * 60 * 60 * 1000

/** The catalogue id, so the cooldown reads the same rhythm the card runs. */
export const WEEK_PLAN_RHYTHM = "week-plan"

/** The channel a week plan is written for. X is the one the corpus came from
 *  and the only channel a strategy page is guaranteed to exist for. */
export const WEEK_PLAN_CHANNEL = "x"

/* ── What the model is given, and what it answers ─────────────────────────── */

export type Candidate = {
  /** The `riff_angle` row id. This is what `draftFromAngle` is handed. */
  id: string
  hook: string
  why: string
  /** `draft.kind` copies this at draft time; it is what `recentKinds` reads. */
  kind: string
  shape: string
  sourceLabel: string
}

export type Critique = {
  angle: string
  pillar: string
  /** One line. Why this belongs in the week, or why it does not. */
  verdict: string
  keep: boolean
}

export type WeekPlanContext = {
  strategy: Strategy
  candidates: Candidate[]
  /** The kinds of the last six drafts, newest first. */
  recent: string[]
  gaps: StoryGap[]
  cadence: number
  today: string
}

type Proposal = {
  picks: { id: string; pillar: string; verdict: string; keep: boolean }[]
}

export type WeekPlanner = (
  context: WeekPlanContext
) => Promise<Proposal & { usage?: StructuredUsage }>

const PLAN_PROMPT = `You are Quincy, an AI Head of Content. You are planning one week of posts for the person whose strategy is below, choosing from angles they already have waiting.

For each angle you choose, answer with:

- "id" — the angle's id, exactly as given. Never invent one.
- "pillar" — which of the strategy's pillars this post belongs to. Use a pillar name from the list; if it belongs to none of them, say so in the verdict and set keep to false.
- "verdict" — one line. What this post is for, or what is wrong with it. Name the thing you are judging it against: a pillar, a voice rule, the avoid list, or the kinds already written. Never write praise.
- "keep" — true if it should be written this week, false if it should not.

Rules:
- Choose at most the cadence below. Fewer is correct when fewer are worth writing; a week of five posts where two are filler is a worse week than one with three.
- The avoid list is a rule, not a preference. An angle that only works by breaking it is a "keep": false with the avoid line named in the verdict.
- Vary the kind. The kinds of the last six drafts are below; a week that repeats the same kind reads as one post sent several times.
- Weight the week by the pillars. A pillar at 40% deserves more of the week than one at 15%, but never invent an angle to fill one — the list below is all there is.
- Return an entry for every angle you considered and rejected as well, with keep false. The rejections are the useful half.`

const PLAN_SCHEMA = jsonSchema<Proposal>({
  type: "object",
  properties: {
    picks: {
      type: "array",
      // No `minItems`/`maxItems`. See `buildSchema` in lib/drafting.ts: those
      // keywords break structured output through the Gateway, and the count is
      // bounded in code below where it can actually be enforced.
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          pillar: { type: "string" },
          verdict: { type: "string" },
          keep: { type: "boolean" },
        },
        required: ["id", "pillar", "verdict", "keep"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
})

/**
 * The context as prose, bounded.
 *
 * Exported for the test, matching how lib/drafting.ts treats
 * `describeConstraints`. The candidates go last because they are the part the
 * slice is allowed to eat into — losing the oldest waiting angle costs one
 * option, and losing the avoid list costs the rule the critique exists for.
 */
export function describePlan(context: WeekPlanContext): string {
  const { strategy } = context
  const lines: string[] = [`Today: ${context.today}.`]

  if (strategy.goal?.trim()) {
    lines.push(
      `Goal: ${strategy.goal.trim()}${strategy.goalDate ? ` by ${strategy.goalDate}` : ""}.`
    )
  }

  if (strategy.audience?.primary?.trim()) {
    lines.push(`Audience: ${strategy.audience.primary.trim()}`)
  }

  lines.push(
    `Cadence: ${context.cadence} ${context.cadence === 1 ? "post" : "posts"} this week.`
  )

  if ((strategy.windows ?? []).length > 0) {
    lines.push(`Posting windows: ${strategy.windows.join(", ")}.`)
  }

  if ((strategy.pillars ?? []).length > 0) {
    lines.push(
      `\nPillars:\n${strategy.pillars
        .map((p) => `- ${p.name} (${p.weight}%)${p.note ? ` — ${p.note}` : ""}`)
        .join("\n")}`
    )
  }

  if ((strategy.leanInto ?? []).length > 0) {
    lines.push(
      `\nLean into:\n${strategy.leanInto.map((x) => `- ${x}`).join("\n")}`
    )
  }

  if ((strategy.avoid ?? []).length > 0) {
    lines.push(
      `\nAvoid — these are rules:\n${strategy.avoid.map((x) => `- ${x}`).join("\n")}`
    )
  }

  lines.push(
    context.recent.length > 0
      ? `\nKinds of the last six drafts, newest first: ${context.recent.join(", ")}.`
      : `\nNothing has been drafted yet, so no kind has been used.`
  )

  if (context.gaps.length > 0) {
    lines.push(
      `\nThemes their posts return to with no story written down. Context only — there is no angle for these yet:\n${context.gaps
        .map((gap) => `- ${gap.theme} (${gap.posts} posts)`)
        .join("\n")}`
    )
  }

  lines.push(
    `\nAngles waiting, newest first:\n${context.candidates
      .map(
        (c) =>
          `- id: ${c.id}\n  kind: ${c.kind || "unknown"} | shape: ${c.shape} | from: ${c.sourceLabel}\n  hook: ${c.hook}\n  why: ${c.why}`
      )
      .join("\n")}`
  )

  return lines.join("\n").slice(0, MAX_INPUT_CHARS)
}

const modelPlanner: WeekPlanner = async (context) => {
  const spent = usageAccumulator()

  const { object } = await retryMalformed(
    async () => {
      const result = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: PLAN_SCHEMA,
        system: PLAN_PROMPT,
        prompt: describePlan(context),
      })

      // Counted before the answer is judged. A malformed answer costs exactly
      // what a good one costs.
      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, ["picks"], ["picks"]),
      }
    },
    // `Array.isArray` for the reason lib/drafting.ts gives: the Gateway's
    // mangling does not throw, it returns a plausible object with a string
    // where an array belongs, so only a shape check can see it.
    ({ object }) => Array.isArray(object.picks),
    { label: "week-plan/picks" }
  )

  return {
    picks: Array.isArray(object.picks) ? object.picks : [],
    usage: spent.total,
  }
}

/* ── The pure layer ───────────────────────────────────────────────────────── */

/** Words too common to make an avoid line mean anything. */
const STOPWORDS = new Set([
  "about",
  "that",
  "this",
  "with",
  "from",
  "your",
  "their",
  "them",
  "they",
  "have",
  "into",
  "when",
  "what",
  "than",
  "then",
  "were",
  "will",
  "would",
  "never",
  "always",
  "anything",
  "everything",
  "something",
])

/** The words of an avoid line that carry its meaning. */
function contentWords(line: string): string[] {
  return (line.toLowerCase().match(/[a-z]{4,}/g) ?? []).filter(
    (word) => !STOPWORDS.has(word)
  )
}

/**
 * Which avoid line this angle breaks, or null.
 *
 * **Enforced here rather than trusted to the model**, and that is the whole
 * point of the step. `DRAFTING_RULES` already tells the writer the avoid list
 * is a rule; a model asked in the same breath to fill a cadence of five from
 * four good angles will find a fifth. Arithmetic cannot be talked round.
 *
 * A line hits when every content word in it appears in the angle. Whole-line
 * substring matching never fires — nobody writes an avoid line in the same
 * words as their hook — and single-word matching fires on everything, so the
 * conjunction is what makes it precise enough to act on. An avoid line with no
 * content words at all matches nothing, which is the honest answer for "be
 * yourself".
 */
export function hitsAvoid(text: string, avoid: string[]): string | null {
  const haystack = text.toLowerCase()

  for (const line of avoid) {
    const words = contentWords(line)
    if (words.length === 0) continue
    if (words.every((word) => haystack.includes(word))) return line
  }

  return null
}

/**
 * How often a kind may repeat before the week stops varying.
 *
 * Half of `recentKinds`' six-draft window. Three of the last six being one
 * kind is a habit; a fourth is the week reading as one post sent again.
 */
export const KIND_REPEAT_CAP = 3

/**
 * The survivors, with the kinds varied.
 *
 * Two rules, in order. **One draft per kind per run**, because five drafts of
 * one kind on a Monday is the failure this step exists to catch and no amount
 * of prompt wording reliably prevents it. Then **a kind already filling half
 * the last six drafts is dropped** — unless dropping it would leave nothing,
 * in which case the plan is one post rather than none. A rhythm that answers
 * "your recent drafts were too similar, so here is nothing" has told the user
 * about its own rule instead of doing its job.
 *
 * Order is preserved, so the model's own ranking decides which of two picks
 * sharing a kind survives.
 */
export function varyKinds<T extends { kind: string }>(
  picks: T[],
  recent: string[],
  cap = KIND_REPEAT_CAP
): { kept: T[]; dropped: { pick: T; why: string }[] } {
  const used = new Map<string, number>()
  for (const kind of recent) {
    if (kind) used.set(kind, (used.get(kind) ?? 0) + 1)
  }

  const kept: T[] = []
  const dropped: { pick: T; why: string }[] = []
  const thisRun = new Set<string>()

  for (const pick of picks) {
    const kind = pick.kind || "unknown"

    if (thisRun.has(kind)) {
      dropped.push({ pick, why: `already writing one ${kind} this week` })
      continue
    }

    if ((used.get(kind) ?? 0) >= cap) {
      dropped.push({
        pick,
        why: `${used.get(kind)} of your last six drafts were already ${kind}`,
      })
      continue
    }

    thisRun.add(kind)
    kept.push(pick)
  }

  // Everything was dropped for repeating a kind. One post is better than a
  // rhythm explaining its own rule; the first pick is the model's best.
  if (kept.length === 0 && dropped.length > 0) {
    const [first, ...rest] = dropped
    return { kept: [first.pick], dropped: rest }
  }

  return { kept, dropped }
}

/* ── The reads ────────────────────────────────────────────────────────────── */

/**
 * Angles with no draft behind them, newest riff first.
 *
 * An angle is drafted exactly when a draft carries its hook — the schema's own
 * rule, stated at `riffAngle` and derived nowhere else — so the anti-join is on
 * `draft.riff_hook`. A `working` or `failed` riff is excluded because its
 * angles are not finished; an `archived` one is excluded because the user filed
 * it away, and re-proposing it every Monday is how a plan becomes a nag.
 */
export async function readCandidates(
  userId: string,
  limit = MAX_CANDIDATES
): Promise<Candidate[]> {
  const rows = await db
    .select({
      id: riffAngle.id,
      hook: riffAngle.hook,
      why: riffAngle.why,
      kind: riffAngle.kind,
      shape: riffAngle.shape,
      sourceLabel: riff.sourceLabel,
    })
    .from(riffAngle)
    .innerJoin(riff, eq(riff.id, riffAngle.riffId))
    .leftJoin(
      draft,
      and(eq(draft.userId, riff.userId), eq(draft.riffHook, riffAngle.hook))
    )
    .where(
      and(eq(riff.userId, userId), eq(riff.state, "ready"), isNull(draft.id))
    )
    .orderBy(desc(riff.createdAt), riffAngle.position)
    .limit(limit)

  return rows
}

/* ── The run ──────────────────────────────────────────────────────────────── */

export type WeekPlanRecord = {
  /** Angles the model returned a verdict on. */
  proposed: number
  critiqued: { angle: string; pillar: string; verdict: string }[]
  drafted: string[]
  /** One line each, for everything that did not become a draft. */
  skipped: string[]
  /**
   * Where each draft would go, if it were approved.
   *
   * A `scheduled_post` row is an approved version with a time, so nothing here
   * can create one — see the header. This is the proposal, and /lineup will
   * show it the moment the user presses Approve, because `approveVersion`
   * computes the same placement with the same function.
   */
  placed: { draftId: string; at: string; slotId: string }[]
}

export type WeekPlanResult =
  | { ok: true; summary: string; result: WeekPlanRecord }
  | {
      ok: false
      reason: "cooldown" | "no-strategy" | "no-candidates" | "nothing-kept"
      summary: string
    }

export type WeekPlanDeps = {
  lastRunAt: (userId: string) => Promise<Date | null>
  strategy: (
    userId: string,
    channel: string
  ) => Promise<{ strategy: Strategy } | null>
  candidates: (userId: string) => Promise<Candidate[]>
  kinds: (userId: string) => Promise<string[]>
  gaps: (userId: string) => Promise<StoryGap[]>
  plan: WeekPlanner
  meter: (userId: string, usage: StructuredUsage) => Promise<void>
  draft: (input: {
    userId: string
    angleId: string
  }) => Promise<{ ok: true; draftId: string } | { ok: false; message: string }>
  slot: (input: {
    userId: string
    channel: string
    timezone: string
    now: Date
  }) => Promise<Placement>
}

const defaultDeps: WeekPlanDeps = {
  lastRunAt: (userId) => lastOkRunAt(userId, WEEK_PLAN_RHYTHM),
  strategy: readStrategy,
  candidates: (userId) => readCandidates(userId),
  kinds: (userId) => recentKinds(userId),
  /**
   * A gap list that fails is a shorter prompt, never a failed plan. Same
   * posture `storyGapThemes` takes on the chat's hot path.
   */
  gaps: (userId) =>
    storyGaps(userId).catch((cause) => {
      console.error("[week-plan] could not read the story gaps:", cause)
      return [] as StoryGap[]
    }),
  plan: modelPlanner,
  meter: async (userId, usage) => {
    try {
      await recordUsage({
        userId,
        model: MODEL,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      })
    } catch (cause) {
      // The call already happened. See lib/adapt-draft.ts.
      console.error("[week-plan] could not record usage:", cause)
    }
  },
  draft: async (input) => {
    const result = await draftFromAngle(input)
    return result.ok
      ? { ok: true, draftId: result.draftId }
      : { ok: false, message: result.message }
  },
  slot: nextFreeSlot,
}

/**
 * Read, propose, critique, draft.
 *
 * The order is AGENTS.md's: everything that can answer "there is nothing to do
 * here" answers before anything is spent — no strategy, no candidates — and
 * the one model call sits between the ceiling (`describePlan`'s slice) and the
 * meter, which is written whether or not the answer turned out usable.
 */
export async function runWeekPlan({
  userId,
  timezone = "UTC",
  now = new Date(),
  deps = {},
}: {
  userId: string
  timezone?: string
  now?: Date
  deps?: Partial<WeekPlanDeps>
}): Promise<WeekPlanResult> {
  const {
    lastRunAt,
    strategy,
    candidates,
    kinds,
    gaps,
    plan,
    meter,
    draft,
    slot,
  } = { ...defaultDeps, ...deps }

  /**
   * The cooldown, before anything is read. AGENTS.md asks for a ceiling and a
   * cooldown, not either: the caps below bound what one run buys, and this
   * bounds how often a person can start one. `MANUAL_RUN_COOLDOWN_MS` is ten
   * minutes, which is the right number for a rhythm that re-reads the same
   * bookmarks and far too short for one that writes five posts.
   */
  const last = await lastRunAt(userId)

  if (last && now.getTime() - last.getTime() < WEEK_PLAN_COOLDOWN_MS) {
    const hours = Math.ceil(
      (WEEK_PLAN_COOLDOWN_MS - (now.getTime() - last.getTime())) / 3_600_000
    )

    return {
      ok: false,
      reason: "cooldown",
      summary: `This week is already planned — ${hours} ${hours === 1 ? "hour" : "hours"} until the next one.`,
    }
  }

  const found = await strategy(userId, WEEK_PLAN_CHANNEL)

  if (!found) {
    return {
      ok: false,
      reason: "no-strategy",
      summary: "No strategy yet — propose one on /brain.",
    }
  }

  const waiting = await candidates(userId)

  if (waiting.length === 0) {
    return {
      ok: false,
      reason: "no-candidates",
      summary: "No angles are waiting — nothing to plan the week from.",
    }
  }

  const [recent, missing] = await Promise.all([kinds(userId), gaps(userId)])

  const cadence = Math.max(
    1,
    Math.min(found.strategy.cadence?.postsPerWeek ?? 0, MAX_DRAFTS)
  )

  const proposal = await plan({
    strategy: found.strategy,
    candidates: waiting,
    recent,
    gaps: missing,
    cadence,
    today: now.toISOString().slice(0, 10),
  })

  if (proposal.usage) await meter(userId, proposal.usage)

  const byId = new Map(waiting.map((c) => [c.id, c]))
  const avoid = found.strategy.avoid ?? []

  const critiqued: WeekPlanRecord["critiqued"] = []
  const skipped: string[] = []
  const survivors: (Candidate & { pillar: string; verdict: string })[] = []

  for (const pick of proposal.picks) {
    const candidate = byId.get(pick.id)
    // An id the model invented. Dropped silently rather than reported: it is a
    // fact about the model, not about the week.
    if (!candidate) continue

    critiqued.push({
      angle: candidate.hook,
      pillar: pick.pillar,
      verdict: pick.verdict,
    })

    if (!pick.keep) {
      skipped.push(`${candidate.hook} — ${pick.verdict}`)
      continue
    }

    const broken = hitsAvoid(`${candidate.hook} ${candidate.why}`, avoid)

    if (broken) {
      skipped.push(`${candidate.hook} — breaks "${broken}"`)
      continue
    }

    survivors.push({ ...candidate, pillar: pick.pillar, verdict: pick.verdict })
  }

  const { kept, dropped } = varyKinds(survivors, recent)
  for (const { pick, why } of dropped) {
    skipped.push(`${pick.hook} — ${why}`)
  }

  const writing = kept.slice(0, cadence)
  for (const over of kept.slice(cadence)) {
    skipped.push(`${over.hook} — over the week's cadence of ${cadence}`)
  }

  if (writing.length === 0) {
    return {
      ok: false,
      reason: "nothing-kept",
      summary: `Read ${waiting.length} waiting ${waiting.length === 1 ? "angle" : "angles"}, none worth the week.`,
    }
  }

  const drafted: string[] = []
  const placed: WeekPlanRecord["placed"] = []
  // The clock the placement search walks forward from. Each draft takes the
  // next free slot *after* the one before it, so five drafts propose five
  // different times rather than five copies of Monday 08:00.
  let after = now

  for (const angle of writing) {
    // Sequential for the reason `bookmarksToPosts` is: each iteration is a
    // model call, and the dispatcher's time budget bounds the whole.
    const written = await draft({ userId, angleId: angle.id })

    if (!written.ok) {
      skipped.push(`${angle.hook} — ${written.message}`)
      continue
    }

    drafted.push(written.draftId)

    const placement = await slot({
      userId,
      channel: WEEK_PLAN_CHANNEL,
      timezone,
      now: after,
    })

    if (placement.ok) {
      placed.push({
        draftId: written.draftId,
        at: placement.at.toISOString(),
        slotId: placement.slotId,
      })
      after = placement.at
    }
  }

  if (drafted.length === 0) {
    return {
      ok: false,
      reason: "nothing-kept",
      summary: "Quincy could not write any of this week's posts.",
    }
  }

  return {
    ok: true,
    summary: `Drafted ${drafted.length} ${drafted.length === 1 ? "post" : "posts"} for this week, from ${critiqued.length} angles read.`,
    result: {
      proposed: critiqued.length,
      critiqued,
      drafted,
      skipped,
      placed,
    },
  }
}
