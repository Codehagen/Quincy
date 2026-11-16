import { createIdGenerator } from "ai"
import { and, asc, eq } from "drizzle-orm"

import { db } from "./db"
// The ledger's own module imports this one for its write path, which makes the
// pair a cycle. Safe by construction: nothing crosses at module evaluation
// time, and both directions cross on hoisted function declarations only.
import { isLedgerSlug, renderLedgerSection } from "./memory-ledger"
// One-way: lib/story-gaps.ts imports nothing from here at run time, precisely
// so this import cannot become a second cycle. See the note at the top of it.
import { storyGapThemes } from "./story-gaps"
import { renderHabits, type Habits } from "./voice-habits"
import {
  brainEvent,
  brainPage,
  brainPageVersion,
  type BrainKind,
  type BrainProvenance,
} from "./schema-app"

/**
 * The brain's only write path. See docs/brain.md.
 *
 * Every mutation goes through this module and nothing else touches the three
 * tables. The AI tool definitions call these functions rather than composing
 * SQL, which is what makes the invariants below unbreakable rather than merely
 * documented: a malformed edit from a model never gets the chance to write one.
 */

const newPageId = createIdGenerator({ prefix: "bp", size: 16 })
const newEventId = createIdGenerator({ prefix: "be", size: 16 })
const newVersionId = createIdGenerator({ prefix: "bv", size: 16 })

/**
 * Caps. A rule list without a ceiling stops
 * being a rule list and becomes an essay nobody obeys — the cap is what forces
 * the 16th rule to displace a weaker one instead of joining it.
 */
export const RULE_CAP = 15
export const IDENTITY_CAP = 50_000

/** Provenance that is allowed to supply a checkable claim in a published post. */
const PROOF_BEARING: readonly BrainProvenance[] = [
  "user",
  "published",
  "confirmed",
]

/**
 * `habits` is optional: pages compiled before lib/voice-habits.ts existed have
 * none, and a hand-written `voice` page has rules with no corpus behind them.
 */
export type VoiceData = { rules: string[]; habits?: Habits }
export type InstructionData = { rules: string[] }

export type PolicyData = {
  platform: string
  goal?: string
  /**
   * The date the goal is measured on, as `YYYY-MM-DD`. Plan 027 asks for "a
   * goal with a date", and the date is its own field rather than a clause
   * inside `goal` because a deadline is the half a weekly review has to read.
   * Optional: every policy page written before this has none.
   */
  goalDate?: string
  positioning?: string
  audience?: { primary?: string; secondary?: string }
  pillars: { name: string; weight: number; note?: string }[]
  cadence: { postsPerDay: number; postsPerWeek: number }
  /** "07:00", "11:00" — 24h, the user's timezone. Code reads these. */
  windows: string[]
  leanInto: string[]
  avoid: string[]
}

/**
 * The narrative is not here. It is the page `body`, like every other piece of
 * prose in the brain.
 *
 * `data` holds what code reads and `body` holds what only the model reads —
 * that is the one rule this file exists to keep. A story's narrative was only
 * ever read by the model, and nothing in the codebase touched it, so it sat on
 * the wrong side of the line from the day it was written. What stays here is
 * exactly what picks a story for a post: the point it makes, the hook it opens
 * with, what it may be used for, and the receipts.
 */
export type StoryData = {
  point: string
  hook: string
  quotes: string[]
  proof: string[]
  useFor: string[]
  theme: string
}

export type BrainPage = typeof brainPage.$inferSelect

/**
 * What an editor needs. The timestamps are excluded because no editor reads
 * one, and because both paths that carry a page to the client — the fetch and
 * the dehydrated cache — go through JSON, where a Date becomes a string. A type
 * that still claimed Date would be a lie waiting for the first .getTime().
 */
export type EditablePage = Omit<BrainPage, "createdAt" | "updatedAt">

export class BrainInvariantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "BrainInvariantError"
  }
}

/**
 * Runs before every write, on the merged result rather than the patch — a
 * partial update that leaves the page invalid is still an invalid page.
 */
function assertValid(
  kind: BrainKind,
  provenance: BrainProvenance,
  body: string,
  data: Record<string, unknown>
) {
  if (kind === "identity" && body.length > IDENTITY_CAP) {
    throw new BrainInvariantError(
      `identity is ${body.length} characters, over the ${IDENTITY_CAP} cap`
    )
  }

  if (kind === "voice" || kind === "instruction") {
    const rules = (data as Partial<VoiceData>).rules
    if (!Array.isArray(rules)) {
      throw new BrainInvariantError(`${kind} needs a rules array in data`)
    }
    if (rules.length > RULE_CAP) {
      throw new BrainInvariantError(
        `${kind} has ${rules.length} rules, over the ${RULE_CAP} cap — drop one to add one`
      )
    }
  }

  if (kind === "policy") {
    const policy = data as Partial<PolicyData>
    if (!Array.isArray(policy.pillars) || policy.pillars.length === 0) {
      throw new BrainInvariantError("policy needs at least one pillar")
    }
    const total = policy.pillars.reduce((sum, p) => sum + (p.weight ?? 0), 0)
    // Weights drive what gets drafted. If they do not sum to 100 the split is
    // undefined and the agent silently over-weights whatever is listed first.
    if (total !== 100) {
      throw new BrainInvariantError(`pillar weights sum to ${total}, not 100`)
    }
    if (!Array.isArray(policy.windows) || policy.windows.length === 0) {
      throw new BrainInvariantError("policy needs at least one posting window")
    }
  }

  if (kind === "story") {
    const story = data as Partial<StoryData>
    if (!story.point?.trim()) {
      throw new BrainInvariantError("a story without a point is a note")
    }
    // The rule that keeps a made-up number out of a post published under the
    // user's name. Unreviewed extraction may exist; it may not carry receipts.
    if (story.proof?.length && !PROOF_BEARING.includes(provenance)) {
      throw new BrainInvariantError(
        `provenance '${provenance}' may not supply proof — confirm the story first`
      )
    }
  }
}

/** Every page for one user, ordered so the prompt is byte-stable across reads. */
export async function getBrain(userId: string): Promise<BrainPage[]> {
  return db
    .select()
    .from(brainPage)
    .where(eq(brainPage.userId, userId))
    .orderBy(asc(brainPage.kind), asc(brainPage.slug))
}

/**
 * One kind, for one user. What the `(user_id, kind)` index exists for.
 *
 * /channels was reading every page and filtering in JavaScript, which meant
 * fetching a year of notes and stories to render two platform tabs. The cost is
 * invisible today — 14 rows, and column width made no measurable difference in
 * a ~120ms round trip — but Heartbeat writes weekly and the story bank grows
 * with every published post, so this is the query that would quietly get worse
 * without anything changing at the call site.
 */
export async function getBrainByKind(
  userId: string,
  kind: BrainKind
): Promise<BrainPage[]> {
  return db
    .select()
    .from(brainPage)
    .where(and(eq(brainPage.userId, userId), eq(brainPage.kind, kind)))
    .orderBy(asc(brainPage.slug))
}

export async function getPage(userId: string, slug: string) {
  const [row] = await db
    .select()
    .from(brainPage)
    .where(and(eq(brainPage.userId, userId), eq(brainPage.slug, slug)))
    .limit(1)

  return row ?? null
}

/**
 * Create or replace a page. Snapshots the previous compiled state first, so a
 * bad compile is one query away from being undone.
 */
export async function putPage({
  userId,
  slug,
  kind,
  title,
  body = "",
  data = {},
  provenance = "user",
}: {
  userId: string
  slug: string
  kind: BrainKind
  title: string
  body?: string
  data?: Record<string, unknown>
  provenance?: BrainProvenance
}): Promise<BrainPage> {
  assertValid(kind, provenance, body, data)

  const existing = await getPage(userId, slug)

  if (existing) {
    await db.insert(brainPageVersion).values({
      id: newVersionId(),
      pageId: existing.id,
      body: existing.body,
      data: existing.data,
    })
  }

  const now = new Date()
  const [row] = await db
    .insert(brainPage)
    .values({
      id: existing?.id ?? newPageId(),
      userId,
      slug,
      kind,
      title,
      body,
      data,
      provenance,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      // The user-scoped constraint, not the id. Conflicting on the id alone is
      // what let one row belong to two accounts in 5a6e9c7.
      target: [brainPage.userId, brainPage.slug],
      set: { kind, title, body, data, provenance, updatedAt: now },
    })
    .returning()

  return row
}

/**
 * The inline write. One insert, no model call, no synthesis — cheap enough to
 * run on every turn. Compilation happens later, in Heartbeat.
 */
export async function appendEvent({
  pageId,
  kind = "observation",
  source,
  summary,
  detail = "",
  confidence = "medium",
}: {
  pageId: string
  kind?: "observation" | "correction" | "compile"
  source: string
  summary: string
  detail?: string
  confidence?: "low" | "medium" | "high"
}) {
  const [row] = await db
    .insert(brainEvent)
    .values({
      id: newEventId(),
      pageId,
      kind,
      source,
      summary,
      detail,
      confidence,
    })
    .returning()

  return row
}

export async function getEvents(pageId: string) {
  return db
    .select()
    .from(brainEvent)
    .where(eq(brainEvent.pageId, pageId))
    .orderBy(asc(brainEvent.observedAt))
}

/**
 * A user correction. Recorded as a high-confidence event *and* applied to the
 * page in one call, because a correction that only lands in the log is one the
 * next compile is free to ignore.
 *
 * Heartbeat's rule: never overwrite a field that has a correction newer than
 * the evidence against it. This is the write side of that promise.
 */
export async function applyCorrection({
  userId,
  slug,
  patch,
  note,
}: {
  userId: string
  slug: string
  patch: { body?: string; data?: Record<string, unknown> }
  note: string
}) {
  const page = await getPage(userId, slug)
  if (!page) {
    throw new BrainInvariantError(`no page '${slug}' for this user`)
  }

  const body = patch.body ?? page.body
  const data = patch.data ? { ...page.data, ...patch.data } : page.data

  // A corrected page is user-authored from here on, whatever it used to be.
  const updated = await putPage({
    userId,
    slug,
    kind: page.kind,
    title: page.title,
    body,
    data,
    provenance: "user",
  })

  await appendEvent({
    pageId: updated.id,
    kind: "correction",
    source: "user",
    confidence: "high",
    summary: note,
  })

  return updated
}

/** What Quincy extracted but you have not seen. Cannot carry proof. */
export async function proposePage(args: {
  userId: string
  slug: string
  kind: BrainKind
  title: string
  body?: string
  data?: Record<string, unknown>
  source: string
}) {
  const page = await putPage({ ...args, provenance: "inferred" })
  await appendEvent({
    pageId: page.id,
    source: args.source,
    summary: `Proposed ${args.kind} '${args.slug}'`,
  })
  return page
}

export async function confirmPage(userId: string, slug: string) {
  const page = await getPage(userId, slug)
  if (!page) {
    throw new BrainInvariantError(`no page '${slug}' for this user`)
  }

  const confirmed = await putPage({
    userId,
    slug,
    kind: page.kind,
    title: page.title,
    body: page.body,
    data: page.data,
    provenance: "confirmed",
  })

  await appendEvent({
    pageId: confirmed.id,
    source: "user",
    confidence: "high",
    summary: "Confirmed by the user",
  })

  return confirmed
}

/* ── Read path ────────────────────────────────────────────────────────────
   No retrieval. identity, voice, instruction and policy go in whole; stories
   go in as a catalogue and are fetched in full only when the model asks.
   docs/brain.md explains why this beats embeddings at the current size.
   ──────────────────────────────────────────────────────────────────────── */

/**
 * Rules, then the arithmetic that outranks them.
 *
 * A compiled rule is a sentence a model wrote about a corpus, and on
 * 2026-08-17 two of them were imperatives for habits measured at 17% and 8%
 * ("open with 🤯", "close most posts with ✨"). Everything downstream read them
 * as orders, because that is what they are grammatically, and three drafts in
 * a row carried a frame the user uses in 7% of their posts.
 *
 * The counts are written by `measureHabits` at compile time and are not the
 * model's opinion — see lib/voice-habits.ts. Rendering them *after* the rules
 * is deliberate: the last thing read about the voice is the measurement, and
 * `renderHabits` says outright that it wins where the two disagree.
 *
 * Absent on any page compiled before this existed, and on a hand-written
 * `voice` page, which has rules and no corpus behind them. Both render exactly
 * as they did before.
 */
function renderRules(page: BrainPage) {
  const data = page.data as Partial<VoiceData>
  const rules = data.rules ?? []
  const listed = rules.map((rule) => `- ${rule}`).join("\n")
  const measured = data.habits ? renderHabits(data.habits) : ""

  return [listed, measured].filter(Boolean).join("\n\n")
}

function renderPolicy(page: BrainPage) {
  const p = page.data as Partial<PolicyData>
  const lines: string[] = []

  // The date rides on the goal line rather than on one of its own: a deadline
  // with no goal beside it is a date, and a goal with the date two lines away
  // is a goal the model reads as open-ended.
  if (p.goal)
    lines.push(`Goal: ${p.goal}${p.goalDate ? ` (by ${p.goalDate})` : ""}`)
  if (p.positioning) lines.push(`Positioning: ${p.positioning}`)
  if (p.audience?.primary) lines.push(`Primary audience: ${p.audience.primary}`)
  if (p.audience?.secondary) {
    lines.push(`Secondary audience: ${p.audience.secondary}`)
  }

  for (const pillar of p.pillars ?? []) {
    lines.push(
      `Pillar ${pillar.weight}% ${pillar.name}${pillar.note ? ` — ${pillar.note}` : ""}`
    )
  }

  if (p.cadence) {
    // Pluralised properly: a numeric slot in a string template renders
    // "1 posts", which is the tell that nobody read the rendered page.
    const { postsPerDay: d, postsPerWeek: w } = p.cadence
    lines.push(
      `Cadence: ${d} ${d === 1 ? "post" : "posts"} per day, ${w} prepared per week`
    )
  }
  if (p.windows?.length) lines.push(`Posting windows: ${p.windows.join(", ")}`)
  if (p.leanInto?.length) {
    lines.push(`Lean into:\n${p.leanInto.map((x) => `- ${x}`).join("\n")}`)
  }
  if (p.avoid?.length) {
    lines.push(`Avoid:\n${p.avoid.map((x) => `- ${x}`).join("\n")}`)
  }

  return lines.join("\n")
}

function renderStoryIndex(stories: BrainPage[]) {
  return stories
    .map((page) => {
      const s = page.data as Partial<StoryData>
      const useFor = s.useFor?.length
        ? ` (use for: ${s.useFor.join(", ")})`
        : ""
      return `- ${page.title} — ${s.point ?? ""}${useFor}`
    })
    .join("\n")
}

/** The most quotes any one story contributes to a prompt. */
const QUOTES_PER_STORY = 3

/**
 * A story with its evidence attached, for a caller that cannot fetch it.
 *
 * The index form above is written for the chat route, which *can* go and read a
 * story when it decides it needs one. Every other consumer is a single
 * `generateObject` call with no tools at all — so for them the index is a
 * catalogue of things they are told to cite and given no way to open. See
 * `renderBrain`'s `stories` option for what that cost.
 *
 * Quotes are capped rather than dumped: they are the most token-hungry field on
 * a story and the third one adds far less than the first. Proof URLs are
 * included because `DRAFTING_RULES` lets a draft cite what is in the material,
 * and a link the user actually published is the strongest thing on the page.
 */
function renderStoryFull(page: BrainPage): string {
  const s = page.data as Partial<StoryData>
  const parts: string[] = [`### ${page.title}`]

  if (s.point?.trim()) parts.push(s.point.trim())
  if (s.hook?.trim()) parts.push(`Hook they have used: ${s.hook.trim()}`)

  const quotes = (s.quotes ?? []).filter(Boolean).slice(0, QUOTES_PER_STORY)
  if (quotes.length) {
    parts.push(
      `In their own words:\n${quotes.map((q) => `- "${q}"`).join("\n")}`
    )
  }

  const proof = (s.proof ?? []).filter(Boolean)
  if (proof.length) parts.push(`Published proof: ${proof.join(", ")}`)

  if (s.useFor?.length) parts.push(`Use for: ${s.useFor.join(", ")}`)

  return parts.join("\n\n")
}

/**
 * One story, whole, for a caller that went and asked for it.
 *
 * `renderStoryFull` is written for a prompt section that carries four of them,
 * so it leaves the narrative out: `data` is what picks a story and `body` is
 * the prose only the model reads. A caller that named one title wants the
 * prose — that is the whole reason it asked — so this is the pair.
 */
export function renderStory(page: BrainPage): string {
  const body = page.body.trim()
  return body ? `${renderStoryFull(page)}\n\n${body}` : renderStoryFull(page)
}

/**
 * The story the chat asked for, by id, slug or title.
 *
 * Three keys because three things name a story and only one of them is typed
 * by a person. `renderBrain`'s index prints **titles**, so a title is what a
 * model reading that index will send back; a slug is what the URL on /brain
 * carries; an id is what anything holding the row already has. Matching all
 * three costs one comparison each and removes an entire class of "call the
 * tool, get nothing" turn.
 *
 * Titles are matched loosely — case-folded, then by containment — because the
 * model retypes them and a capital letter is not a reason to answer no. The
 * titles are returned either way so the caller can say what does exist rather
 * than only that this one does not. An unknown title with no list beside it is
 * how a model starts guessing.
 */
export async function getStory(
  userId: string,
  ref: string
): Promise<{ page: BrainPage | null; titles: string[] }> {
  const stories = await getBrainByKind(userId, "story")
  const titles = stories.map((page) => page.title)
  const wanted = ref.trim().toLowerCase()

  if (!wanted) return { page: null, titles }

  const page =
    stories.find((p) => p.id === ref.trim() || p.slug === ref.trim()) ??
    stories.find((p) => p.title.toLowerCase() === wanted) ??
    stories.find((p) => p.slug.toLowerCase() === wanted) ??
    stories.find(
      (p) =>
        p.title.toLowerCase().includes(wanted) ||
        wanted.includes(p.title.toLowerCase())
    ) ??
    null

  return { page, titles }
}

/**
 * The brain as a prompt section. Returns "" when the brain is empty, so a new
 * account gets the plain system prompt rather than a page of empty headings.
 *
 * **`stories` exists because the index form lied to every tool-less caller.**
 * It renders each story as a title and a one-line point, then instructs the
 * model to go and read one in full before citing anything from it. The chat
 * route can: `read_story` in lib/chat-tools.ts is that tool, and this text
 * names it exactly rather than describing it, because a model cannot call "the
 * story tool". `generateDraft` cannot — it is a single `generateObject` with no
 * tools, so for it the same prompt would name four stories as the evidence to
 * draw on, forbid inventing anything not in them, and provide no way to open
 * them. The correct behaviour under those instructions is to write something
 * short and unspecific, which is exactly what came back on 2026-08-16.
 *
 * `"index"` stays the default so the chat route and anything else built around
 * a catalogue keeps the shape it expects. Callers with no tools pass `"full"`.
 */
export function renderBrain(
  pages: BrainPage[],
  {
    stories: storyMode = "index",
    gaps = [],
    ledger,
  }: {
    stories?: "index" | "full"
    /**
     * Themes the corpus returns to with no story page — `storyGapThemes` in
     * lib/story-gaps.ts. Passed in rather than read here, because this
     * function is pure over the pages it is given and every test of it says so.
     */
    gaps?: string[]
    /**
     * Which day "the last seven days" ends on. A caller that holds the user
     * row passes their zone; without one the window is read in UTC and its
     * upper edge stays open, so a user ahead of UTC still sees today's page.
     */
    ledger?: { now?: Date; timezone?: string | null }
  } = {}
): string {
  const of = (kind: BrainKind) => pages.filter((p) => p.kind === kind)
  const sections: string[] = []

  for (const page of of("identity")) {
    if (page.body.trim())
      sections.push(`## Who you write for\n\n${page.body.trim()}`)
  }

  /**
   * Voice pages are rendered per page and framed as observation, not as a
   * checklist — and both halves of that are load-bearing.
   *
   * The title carries where the voice was heard (`voice/x` renders as
   * "Voice — X"). Flattening every voice page under one "## Voice" heading
   * lost that, so a rule compiled from 300 tweets read as a rule about the
   * user in general: on 2026-08-08 a LinkedIn draft closed with "Lets go
   * 2026 ✨" because an X habit had nothing on it saying it was an X habit.
   *
   * The framing line exists because a compiled rule is written in the
   * imperative ("Open with a bold claim followed by 🤯") and a model reading
   * a bare imperative list obeys all of it, every time. What was a habit in
   * some posts became a signature on every draft. The rules are the same
   * rules; this says what they are.
   */
  for (const page of of("voice")) {
    const rendered = renderRules(page)
    if (!rendered) continue
    sections.push(
      `## ${page.title}\n\nHow the user has written here before. This is a range to draw from, ` +
        `not a template to fill: a habit seen in some of their posts must not appear in all of ` +
        `yours, and a recurring emoji, opener or sign-off is one option among several rather than ` +
        `a signature to attach to everything. Habits observed on one channel are evidence about ` +
        `that channel — carry the character across, not the tokens. Only an explicit "never" is ` +
        `absolute.\n\n${rendered}`
    )
  }

  const rules = of("instruction").map(renderRules).filter(Boolean)
  if (rules.length) {
    sections.push(
      `## Hard rules\n\nThese are not preferences. Do not break them.\n\n${rules.join("\n")}`
    )
  }

  for (const page of of("policy")) {
    const rendered = renderPolicy(page)
    if (rendered) sections.push(`## Strategy — ${page.title}\n\n${rendered}`)
  }

  const stories = of("story")

  /**
   * What the story bank is missing, in one line. See lib/story-gaps.ts.
   *
   * Index mode only, and that is not an oversight. The index form is written
   * for the chat, which can act on a gap — it can ask the question, and the
   * answer becomes the story. `"full"` is for a single `generateObject` with
   * no tools that is about to write a post: telling it what the user has never
   * written about is telling it what it may not draw on, which is the one
   * reading of this line that would make a draft worse.
   */
  const missing =
    storyMode === "index" && gaps.length
      ? `Needs material: ${gaps.join(", ")} — subjects their posts keep returning to with no ` +
        `story page behind them. If one of these comes up, ask for the story rather than ` +
        `writing around it.`
      : ""

  if (stories.length) {
    sections.push(
      storyMode === "full"
        ? `## Story bank\n\n${stories.length} stories the user keeps returning to, in full. ` +
            `Use them for specifics — a real quote, a real link, a thing that actually ` +
            `happened — rather than writing around the subject. Never invent a detail that ` +
            `is not below.\n\n${stories.map(renderStoryFull).join("\n\n")}`
        : [
            `## Story bank\n\n${stories.length} stories are available. Titles and when to use ` +
              `them are below; call read_story with the title to read one in full before ` +
              `citing anything from it. Never invent a detail that is not in the story.\n\n` +
              renderStoryIndex(stories),
            missing,
          ]
            .filter(Boolean)
            .join("\n\n")
    )
  } else if (missing) {
    // No stories and gaps anyway is the state a new account is in for its first
    // week, and it is the state where the line is worth the most.
    sections.push(`## Story bank\n\nNo stories yet. ${missing}`)
  }

  /**
   * The compiled memory pages, then the raw ledger — in that order, and the
   * order is the point.
   *
   * A ledger page is a memory page too (`memory/YYYY-MM-DD`), so without the
   * filter this section would dump every day of the year as an undated blob of
   * `- preference: ...` lines. `renderLedgerSection` renders the last seven
   * days instead: typed, newest first, capped, and read *after* the compiled
   * pages so a correction from this morning is the last thing the model reads
   * on a subject the compile last touched on Sunday.
   */
  const memories = of("memory")
    .filter((p) => !isLedgerSlug(p.slug))
    .map((p) => p.body.trim())
    .filter(Boolean)
  if (memories.length) sections.push(`## Notes\n\n${memories.join("\n\n")}`)

  const lately = renderLedgerSection(of("memory"), ledger)
  if (lately) sections.push(lately)

  return sections.join("\n\n")
}

/**
 * Read and render in one call.
 *
 * The options pass straight through, so a tool-less caller asks for
 * `{ stories: "full" }` here rather than reaching for `getBrain` and
 * `renderBrain` separately and getting the pairing wrong.
 */
export async function renderBrainForUser(
  userId: string,
  options?: {
    stories?: "index" | "full"
    ledger?: { now?: Date; timezone?: string | null }
  }
) {
  const pages = await getBrain(userId)

  /**
   * The gap line is index-mode only, so the query is too — a tool-less caller
   * would pay a round trip for a section it is never shown. The story pages go
   * in from the read that just happened, so this is one extra query rather
   * than two, and `storyGapThemes` swallows its own failures: a decorative
   * line must not be what takes a chat turn down.
   */
  const gaps =
    (options?.stories ?? "index") === "index"
      ? await storyGapThemes(
          userId,
          pages.filter((page) => page.kind === "story")
        )
      : []

  return renderBrain(pages, { ...options, gaps })
}

/**
 * The brain for a caller deciding **what this person may speak to**, rather
 * than how they write.
 *
 * Voice pages are dropped, and that is the point. They are the bulk of a
 * compiled brain — on the first live run of Trend Alerts, roughly three
 * quarters of 6,000 characters — and none of it bears on standing: an emoji
 * frequency and a median post length say nothing about what somebody has
 * built. Two things go wrong when they are included anyway. The prompt pays
 * for them, and worse, they are written in the imperative, so a model asked
 * for one line of reasoning starts obeying instructions about openers and
 * sign-offs in a field that is not a post.
 *
 * `stories: "full"` for the reason `renderBrain`'s own comment gives about
 * `generateDraft`: the index names stories as the evidence and tells the model
 * to call `read_story`, which a selector with no tools cannot reach. A selector with no tools must be
 * given the stories themselves — and standing is precisely what a story
 * records, so this is the section that decides the answer.
 */
export async function renderStandingBrain(userId: string): Promise<string> {
  const pages = await getBrain(userId)

  return renderBrain(
    pages.filter((page) => page.kind !== "voice"),
    { stories: "full" }
  )
}
