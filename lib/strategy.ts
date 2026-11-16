import { generateObject, jsonSchema } from "ai"
import { and, asc, eq, inArray, sql } from "drizzle-orm"

import {
  getBrainByKind,
  getPage,
  proposePage,
  putPage,
  type BrainPage,
  type StoryData,
  type VoiceData,
} from "./brain"
import { db } from "./db"
import { REASONING } from "./model-options"
import { user } from "./schema"
import { channelConnection, slot, sourceItem } from "./schema-app"
import {
  cadenceFor,
  cooldownNotice,
  formatWindow,
  normalisePillars,
  PILLAR_CAP,
  PILLAR_MIN,
  strategySlug,
  strategyTitle,
  type Strategy,
} from "./strategy-format"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
} from "./structured-output"
import { weekdayLabel } from "./slots"
import { resolveTimeZone } from "./timezone"
import { recordUsage, spendCooldown } from "./usage"
import { describeHabits, type Habits } from "./voice-habits"

/**
 * The strategy page per channel: read it, and propose the first one. Plan 027,
 * 3a.
 *
 * The page itself is not new — `/channels/[platform]` has edited
 * `strategy/{platform}` since channels existed, and `renderBrain` has rendered
 * it into every drafting prompt. What was missing is the only part a person
 * ever asked for: a first draft. On 2026-08-26 the live database held ten brain
 * pages and no strategy at all, because the only way to get one was to type
 * eight fields into a form describing a plan nobody had written down yet.
 *
 * So this is one model call that reads what Quincy already learned from the
 * corpus — the compiled voice, the mined stories, the connected channels and
 * the standing slots — and writes the plan those imply. Provenance `inferred`,
 * because it is a reading and not a decision. Editing it makes it the user's.
 *
 * lib/strategy-format.ts holds everything pure, and holds it separately so the
 * editor can import it without pulling this file's database and model client
 * into the browser.
 */

const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/** Exported so the caller can pass the same string to `recordUsage`. */
export const STRATEGY_MODEL = MODEL

/**
 * The cooldown tag. `spendCooldown` reads `usage_event.conversation_id`, and
 * the tag is per feature rather than per model — see the note there about a
 * chat turn tripping the adapt limiter because both billed the same model.
 */
export const STRATEGY_SPEND = "strategy:propose"

/**
 * Six hours between proposals, per user.
 *
 * A ceiling bounds one run and a cooldown bounds how often a person can start
 * one; AGENTS.md asks for both and this is the second. Six hours rather than
 * six minutes because of what the button does: it reads a corpus that changes
 * on the scale of weeks and writes a plan for a quarter. Pressing it again an
 * hour later buys a differently-worded version of the same reading, at full
 * price. The editor is the way to change a strategy; this is the way to get one.
 */
export const STRATEGY_COOLDOWN_MS = 6 * 60 * 60 * 1000

/**
 * The ceiling on what one proposal reads. Plan 027 asks for 8 KB and the
 * assembled context is sliced to it, so a brain that grows for a year cannot
 * quietly turn a cheap call into an expensive one. The slice is on the built
 * string rather than on each part, because the parts are what vary.
 */
export const MAX_INPUT_CHARS = 8_000

/** Newest stories first, and only this many reach the prompt. */
const STORIES_IN_PROMPT = 12

export type ProposedStrategy = {
  goal: string
  goalDate: string
  audience: string
  pillars: { name: string; weight: number; note: string }[]
  postsPerWeek: number
  windows: { weekday: number; from: string; to: string }[]
  leanInto: string[]
  avoid: string[]
}

export type StrategyUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
}

/**
 * What the model is given. Everything in it is already stored — nothing here
 * costs a second read of the corpus, and nothing here is the corpus itself.
 * The 99 posts reached this prompt once already, as the voice page and the
 * story pages the compile wrote from them.
 */
export type StrategyContext = {
  channel: string
  channelLabel: string
  connectedChannels: string[]
  posts: number
  newestPostedAt: Date | null
  portrait: string
  rules: string[]
  habits?: Habits
  stories: { title: string; point: string; theme: string }[]
  slots: { weekday: number; timeOfDay: string }[]
  timezone: string
  today: string
}

export type StrategyProposer = (
  context: StrategyContext
) => Promise<ProposedStrategy & { usage?: StrategyUsage }>

const PROPOSE_PROMPT = `You are Quincy, an AI Head of Content. You are writing the content strategy for one channel, for the person described below, and they will read it and correct it.

Return:

1. "goal" — one sentence naming what this channel is for. A number in it is better than an adjective, and it must be a number this person could actually reach from where they are. Never invent a follower count or a revenue figure they have not mentioned.
2. "goalDate" — the date the goal is measured on, as YYYY-MM-DD. Three to twelve months from today's date below.
3. "audience" — one sentence naming the actual person on the other end. Not a demographic, not a segment. Who they are and what they are trying to do.
4. "pillars" — ${PILLAR_MIN} to ${PILLAR_CAP} subjects this account posts about, each with a percentage weight and a short note saying what a post in it looks like. The weights are a split of everything published and should add to 100. Derive them from the stories and habits below, not from what a content marketer would recommend: a pillar with no evidence in their own material is a pillar they will never write.
5. "postsPerWeek" — how many posts a week this plan asks for. Match the rhythm they already keep. A number they will miss every week is worse than a smaller one they hit.
6. "windows" — when to post, as a weekday (1 = Monday through 7 = Sunday) and a "HH:MM" range in their own timezone. Start from the standing slots below where there are any.
7. "leanInto" — short lines naming what makes this person worth reading, drawn from what they actually do.
8. "avoid" — short lines naming what would make them sound like everyone else. Be specific to them.

Never invent a fact, a number or a date that is not below. If the material is thin, write a smaller plan rather than a confident one.`

const PROPOSE_SCHEMA = jsonSchema<ProposedStrategy>({
  type: "object",
  properties: {
    goal: { type: "string" },
    goalDate: { type: "string" },
    audience: { type: "string" },
    pillars: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          weight: { type: "number" },
          note: { type: "string" },
        },
        required: ["name", "weight", "note"],
        additionalProperties: false,
      },
    },
    postsPerWeek: { type: "number" },
    windows: {
      type: "array",
      items: {
        type: "object",
        properties: {
          weekday: { type: "number" },
          from: { type: "string" },
          to: { type: "string" },
        },
        required: ["weekday", "from", "to"],
        additionalProperties: false,
      },
    },
    leanInto: { type: "array", items: { type: "string" } },
    avoid: { type: "array", items: { type: "string" } },
  },
  required: [
    "goal",
    "goalDate",
    "audience",
    "pillars",
    "postsPerWeek",
    "windows",
    "leanInto",
    "avoid",
  ],
  additionalProperties: false,
})

/** The keys `PROPOSE_SCHEMA` requires, for the unwrap. */
const PROPOSE_KEYS = [
  "goal",
  "goalDate",
  "audience",
  "pillars",
  "postsPerWeek",
  "windows",
  "leanInto",
  "avoid",
] as const

/**
 * The context as prose, bounded.
 *
 * Exported for the test, matching how lib/drafting.ts treats
 * `describeConstraints`. The slice is the ceiling and it is applied last, on
 * the whole string: bounding each section separately would let eight sections
 * that are each under their own limit add up to a call nobody budgeted for.
 */
export function describeContext(context: StrategyContext): string {
  const lines: string[] = [
    `Channel: ${context.channelLabel}.`,
    `Channels they can publish to: ${context.connectedChannels.length ? context.connectedChannels.join(", ") : "none connected yet"}.`,
    `Their timezone: ${context.timezone}. Today: ${context.today}.`,
    `Corpus read: ${context.posts} of their own posts${
      context.newestPostedAt
        ? `, newest ${context.newestPostedAt.toISOString().slice(0, 10)}`
        : ""
    }.`,
  ]

  if (context.portrait.trim()) {
    lines.push(`\nHow they write:\n${context.portrait.trim()}`)
  }

  if (context.rules.length) {
    lines.push(
      `\nVoice rules compiled from those posts:\n${context.rules.map((r) => `- ${r}`).join("\n")}`
    )
  }

  if (context.habits) {
    const measured = describeHabits(context.habits)
    if (measured) lines.push(`\n${measured}`)
  }

  if (context.stories.length) {
    lines.push(
      `\nWhat they keep coming back to:\n${context.stories
        .slice(0, STORIES_IN_PROMPT)
        .map(
          (s) => `- ${s.title}${s.theme ? ` [${s.theme}]` : ""} — ${s.point}`
        )
        .join("\n")}`
    )
  }

  lines.push(
    context.slots.length
      ? `\nStanding slots they already keep on this channel:\n${context.slots
          .map((s) => `- ${weekdayLabel(s.weekday)} ${s.timeOfDay}`)
          .join("\n")}`
      : `\nThey keep no standing slots on this channel yet.`
  )

  return lines.join("\n").slice(0, MAX_INPUT_CHARS)
}

const modelProposer: StrategyProposer = async (context) => {
  const spent = usageAccumulator()

  const { object } = await retryMalformed(
    async () => {
      const result = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: PROPOSE_SCHEMA,
        system: PROPOSE_PROMPT,
        prompt: describeContext(context),
      })

      // Counted before the answer is judged. A malformed answer costs exactly
      // what a good one costs.
      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, PROPOSE_KEYS, [
          "pillars",
          "windows",
          "leanInto",
          "avoid",
        ]),
      }
    },
    // `Array.isArray` on pillars for the reason lib/drafting.ts gives: the
    // Gateway's mangling does not throw, it returns a plausible object with a
    // string where an array belongs, so only a shape check can see it.
    ({ object }) =>
      typeof object.goal === "string" && Array.isArray(object.pillars),
    { label: "strategy/propose" }
  )

  return { ...emptyProposal(), ...object, usage: spent.total }
}

function emptyProposal(): ProposedStrategy {
  return {
    goal: "",
    goalDate: "",
    audience: "",
    pillars: [],
    postsPerWeek: 0,
    windows: [],
    leanInto: [],
    avoid: [],
  }
}

/**
 * The model's answer turned into a page `data` the invariants accept.
 *
 * Every bound lives here rather than in the schema, for the reason
 * lib/drafting.ts's `buildSchema` documents at length: `minItems`/`maxItems`
 * break structured output through the Gateway, so a cap expressed there is a
 * cap that is not enforced anywhere. The weights are normalised rather than
 * rejected — see `normalisePillars`.
 *
 * Exported for the test.
 */
export function strategyFrom(
  proposal: Partial<ProposedStrategy>,
  channel: string
): Strategy | null {
  const pillars = normalisePillars(
    (Array.isArray(proposal.pillars) ? proposal.pillars : []).map((p) => ({
      name: String(p?.name ?? ""),
      weight: Number(p?.weight ?? 0),
      note: p?.note ? String(p.note) : undefined,
    }))
  )

  const windows = (Array.isArray(proposal.windows) ? proposal.windows : [])
    .map((w) =>
      formatWindow({
        weekday: Number(w?.weekday ?? 0),
        from: String(w?.from ?? ""),
        to: String(w?.to ?? ""),
      })
    )
    .filter(Boolean)

  // Both are invariants in lib/brain.ts. Answering null here turns a refusal
  // into a sentence the caller can show, rather than a thrown
  // BrainInvariantError two frames later with the spend already made.
  if (pillars.length === 0 || windows.length === 0) return null

  const goalDate = /^\d{4}-\d{2}-\d{2}$/.test((proposal.goalDate ?? "").trim())
    ? (proposal.goalDate ?? "").trim()
    : undefined

  return {
    platform: channel,
    goal: (proposal.goal ?? "").trim(),
    ...(goalDate ? { goalDate } : {}),
    audience: { primary: (proposal.audience ?? "").trim() },
    pillars,
    cadence: cadenceFor(Number(proposal.postsPerWeek ?? 0)),
    windows,
    leanInto: asLines(proposal.leanInto),
    avoid: asLines(proposal.avoid),
  }
}

/** At most this many lines each. A note list is not an essay. */
const NOTE_CAP = 8

function asLines(value: unknown): string[] {
  return (Array.isArray(value) ? value : [])
    .map((line) => String(line ?? "").trim())
    .filter(Boolean)
    .slice(0, NOTE_CAP)
}

/**
 * The strategy for one channel, or null when there is none.
 *
 * Null covers two cases on purpose: no page at all, and a page at that slug
 * that is not a policy. The second is not paranoia — slugs are a flat
 * namespace and `strategy/x` is reachable by anything that can write a page.
 */
export async function readStrategy(
  userId: string,
  channel: string
): Promise<{ page: BrainPage; strategy: Strategy } | null> {
  const page = await getPage(userId, strategySlug(channel))
  if (!page || page.kind !== "policy") return null

  return { page, strategy: page.data as Strategy }
}

/**
 * An edit. `provenance: "user"` is the whole point of the function existing:
 * the page stops being Quincy's reading the moment somebody changes a number
 * on it, and from then on nothing recompiles over the top of it.
 *
 * The weights are normalised on the way in, so a split typed as 30/30/30 is
 * saved as a split rather than refused. The invariant in lib/brain.ts still
 * runs behind this and still rejects anything that gets past it.
 */
export async function saveStrategy(
  userId: string,
  channel: string,
  strategy: Strategy,
  write = putPage
): Promise<BrainPage> {
  return write({
    userId,
    slug: strategySlug(channel),
    kind: "policy",
    title: strategyTitle(channel),
    data: {
      ...strategy,
      platform: channel,
      pillars: normalisePillars(strategy.pillars ?? []),
      windows: (strategy.windows ?? []).map((w) => w.trim()).filter(Boolean),
      leanInto: asLines(strategy.leanInto),
      avoid: asLines(strategy.avoid),
    },
    provenance: "user",
  })
}

export type ProposeResult =
  | { ok: true; slug: string; strategy: Strategy }
  | {
      ok: false
      reason: "cooldown" | "thin" | "refused"
      message: string
    }

/**
 * Everything `proposeStrategy` reaches for, injectable.
 *
 * The same trade `compileVoice` makes with `extract`: the orchestration —
 * the cooldown, the ceiling, the meter, the provenance — is the part with the
 * rules in it, and it should be testable without a database or a model. The
 * defaults are the real thing, so no call site has to know this exists.
 */
export type StrategyDeps = {
  gather: (userId: string, channel: string) => Promise<StrategyContext>
  propose: StrategyProposer
  /** Returns whatever the writer returns; the caller only needs it to have run. */
  write: (args: Parameters<typeof proposePage>[0]) => Promise<unknown>
  cooldown: (
    userId: string
  ) => Promise<{ ready: true } | { ready: false; secondsLeft: number }>
  meter: (userId: string, usage: StrategyUsage) => Promise<void>
}

/**
 * One model call, and the first strategy this account has ever had.
 *
 * Order matters and is the order AGENTS.md's Money section asks for: the
 * cooldown before the spend, the ceiling inside `describeContext`, and the
 * `usage_event` row written whether or not the answer turned out usable — a
 * refusal that cost tokens is still a refusal that was paid for, and a
 * cooldown that only counted successes would be a cooldown a malformed answer
 * could walk straight past.
 */
export async function proposeStrategy(
  userId: string,
  channel: string,
  deps: Partial<StrategyDeps> = {}
): Promise<ProposeResult> {
  const {
    gather = gatherContext,
    propose = modelProposer,
    write = proposePage,
    cooldown = (id: string) =>
      spendCooldown(id, STRATEGY_SPEND, STRATEGY_COOLDOWN_MS),
    meter = defaultMeter,
  } = deps

  const ready = await cooldown(userId)
  if (!ready.ready) {
    return {
      ok: false,
      reason: "cooldown",
      message: `I proposed one recently — ${Math.ceil(ready.secondsLeft / 60)} minutes before the next.`,
    }
  }

  const context = await gather(userId, channel)

  /**
   * The refusal that comes before the spend.
   *
   * A proposal built on nothing is a proposal built on the model's idea of a
   * founder, published under this person's name as though Quincy had read
   * them. Saying so costs nothing and points at the thing that fixes it.
   */
  if (
    context.posts === 0 &&
    context.stories.length === 0 &&
    !context.portrait.trim()
  ) {
    return {
      ok: false,
      reason: "thin",
      message:
        "I have not read your posts yet, so anything I proposed would be a guess. Connect X on /channels and let me read them first.",
    }
  }

  const proposal = await propose(context)

  if (proposal.usage) {
    await meter(userId, proposal.usage)
  }

  const strategy = strategyFrom(proposal, channel)
  if (!strategy) {
    return {
      ok: false,
      reason: "refused",
      message:
        "I could not write a plan I would stand behind from what I have. Try again later, or write the first pillar yourself and I will work from it.",
    }
  }

  const slug = strategySlug(channel)
  await write({
    userId,
    slug,
    kind: "policy",
    title: strategyTitle(channel),
    data: strategy as unknown as Record<string, unknown>,
    source: "strategy-propose",
  })

  return { ok: true, slug, strategy }
}

/**
 * Metering, and a failure that must not undo the work.
 *
 * The same posture `compileVoice` takes: the call already happened, so a
 * bookkeeping failure logs and is dropped rather than throwing away a page the
 * user is about to read. It does mean a failed insert leaves the cooldown
 * unarmed, which is the right way round — the alternative is refusing to show
 * somebody a strategy that has already been paid for.
 */
async function defaultMeter(userId: string, usage: StrategyUsage) {
  try {
    await recordUsage({
      userId,
      conversationId: STRATEGY_SPEND,
      model: MODEL,
      inputTokens: usage.inputTokens,
      cachedInputTokens: usage.cachedInputTokens,
      outputTokens: usage.outputTokens,
    })
  } catch (cause) {
    console.error("[strategy] could not record usage:", cause)
  }
}

/**
 * When the last proposal was, and when the next one may be.
 *
 * Derived from `spendCooldown` rather than from a second query: it already
 * knows how much of the window is left, and the window is a constant, so the
 * moment it started is arithmetic. The button needs both ends — see
 * `cooldownNotice`.
 */
export async function strategyCooldown(
  userId: string
): Promise<
  { ready: true } | { ready: false; proposedAt: Date; readyAt: Date }
> {
  const state = await spendCooldown(
    userId,
    STRATEGY_SPEND,
    STRATEGY_COOLDOWN_MS
  )
  if (state.ready) return { ready: true }

  const readyAt = new Date(Date.now() + state.secondsLeft * 1000)
  return {
    ready: false,
    proposedAt: new Date(readyAt.getTime() - STRATEGY_COOLDOWN_MS),
    readyAt,
  }
}

/**
 * The cooldown as a sentence, or null when the button is ready.
 *
 * Here rather than in `app/(app)/brain/actions.ts`, and the reason is the file
 * header there: everything exported from a `"use server"` module is a POST
 * endpoint anyone can reach, and this one takes a user id. As an action it
 * would answer "when did user X last propose a strategy" to whoever asked.
 * The page and the action both import it from here instead, so the two can
 * never print a different sentence for the same state.
 */
export async function strategyNotice(
  userId: string,
  timezone: string | null | undefined
): Promise<string | null> {
  const state = await strategyCooldown(userId)
  if (state.ready) return null

  return cooldownNotice(
    state.proposedAt,
    state.readyAt,
    resolveTimeZone(timezone)
  )
}

/**
 * The channels a strategy page can exist for: X always, and anything else the
 * account has actually connected.
 *
 * X is unconditional because it is the channel the corpus came from and the
 * one first run wires. A page for a channel nobody can publish to is a plan
 * with nowhere to land — the same argument `targetsFor` makes in
 * lib/drafting.ts about drafting for Substack.
 */
export async function strategyChannels(userId: string): Promise<string[]> {
  const rows = await db
    .select({ channel: channelConnection.channel })
    .from(channelConnection)
    .where(
      and(
        eq(channelConnection.userId, userId),
        eq(channelConnection.state, "active")
      )
    )

  const connected = new Set(rows.map((row) => row.channel))
  return ["x", ...[...connected].filter((c) => c !== "x").sort()]
}

/**
 * Everything the proposal reads, in four queries that run together.
 *
 * None of it is the corpus. The posts were read once, by the corpus import,
 * and compiled once, by `compileVoice`; this reads that compile back. Paying
 * to re-read 99 posts to decide a cadence would be buying the same information
 * twice.
 */
async function gatherContext(
  userId: string,
  channel: string
): Promise<StrategyContext> {
  const [voice, stories, slots, corpus, connected, zone] = await Promise.all([
    getPage(userId, "voice/x"),
    getBrainByKind(userId, "story"),
    db
      .select({ weekday: slot.weekday, timeOfDay: slot.timeOfDay })
      .from(slot)
      .where(and(eq(slot.userId, userId), eq(slot.channel, channel)))
      .orderBy(asc(slot.weekday), asc(slot.timeOfDay)),
    db
      .select({
        posts: sql<number>`count(*)::int`,
        newest: sql<Date | null>`max(${sourceItem.postedAt})`,
      })
      .from(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, userId),
          inArray(sourceItem.source, ["x", "x-archive"])
        )
      ),
    strategyChannels(userId),
    userTimeZone(userId),
  ])

  const voiceData = (voice?.data ?? {}) as Partial<VoiceData>

  return {
    channel,
    channelLabel: strategyTitle(channel),
    connectedChannels: connected,
    posts: corpus[0]?.posts ?? 0,
    newestPostedAt: corpus[0]?.newest ? new Date(corpus[0].newest) : null,
    portrait: voice?.body ?? "",
    rules: Array.isArray(voiceData.rules) ? voiceData.rules : [],
    habits: voiceData.habits,
    stories: stories.map((page) => {
      const data = page.data as Partial<StoryData>
      return {
        title: page.title,
        point: data.point ?? "",
        theme: data.theme ?? "",
      }
    }),
    slots,
    timezone: zone,
    today: new Date().toISOString().slice(0, 10),
  }
}

/**
 * The zone read from the user row rather than from the session.
 *
 * `session.user` is cookie-cached, so a zone set five minutes ago is not
 * necessarily the one the cookie carries — and this value ends up in a prompt
 * that proposes the times somebody posts at. `resolveTimeZone` answers UTC for
 * an account that has never reported one, which is the honest default and the
 * one lib/timezone.ts already picked.
 */
async function userTimeZone(userId: string): Promise<string> {
  const [row] = await db
    .select({ timezone: user.timezone })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)

  return resolveTimeZone(row?.timezone)
}
