import { createIdGenerator } from "ai"
import { and, asc, eq } from "drizzle-orm"

import { db } from "./db"
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
 * Caps, mirroring the ones Stanley ships. A rule list without a ceiling stops
 * being a rule list and becomes an essay nobody obeys — the cap is what forces
 * the 16th rule to displace a weaker one instead of joining it.
 */
export const RULE_CAP = 15
export const IDENTITY_CAP = 50_000

/** Provenance that is allowed to supply a checkable claim in a published post. */
const PROOF_BEARING: readonly BrainProvenance[] = ["user", "published", "confirmed"]

export type VoiceData = { rules: string[] }
export type InstructionData = { rules: string[] }

export type PolicyData = {
  platform: string
  goal?: string
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
    .values({ id: newEventId(), pageId, kind, source, summary, detail, confidence })
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

function renderRules(page: BrainPage) {
  const rules = (page.data as Partial<VoiceData>).rules ?? []
  return rules.map((rule) => `- ${rule}`).join("\n")
}

function renderPolicy(page: BrainPage) {
  const p = page.data as Partial<PolicyData>
  const lines: string[] = []

  if (p.goal) lines.push(`Goal: ${p.goal}`)
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
    // Pluralised properly, unlike the reference implementation.
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
      const useFor = s.useFor?.length ? ` (use for: ${s.useFor.join(", ")})` : ""
      return `- ${page.title} — ${s.point ?? ""}${useFor}`
    })
    .join("\n")
}

/**
 * The brain as a prompt section. Returns "" when the brain is empty, so a new
 * account gets the plain system prompt rather than a page of empty headings.
 */
export function renderBrain(pages: BrainPage[]): string {
  const of = (kind: BrainKind) => pages.filter((p) => p.kind === kind)
  const sections: string[] = []

  for (const page of of("identity")) {
    if (page.body.trim()) sections.push(`## Who you write for\n\n${page.body.trim()}`)
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
  if (stories.length) {
    sections.push(
      `## Story bank\n\n${stories.length} stories are available. Titles and when to use ` +
        `them are below; call the story tool to read one in full before citing ` +
        `anything from it. Never invent a detail that is not in the story.\n\n` +
        renderStoryIndex(stories)
    )
  }

  const memories = of("memory")
    .map((p) => p.body.trim())
    .filter(Boolean)
  if (memories.length) sections.push(`## Notes\n\n${memories.join("\n\n")}`)

  return sections.join("\n\n")
}

/** Convenience for the chat route: read and render in one call. */
export async function renderBrainForUser(userId: string) {
  return renderBrain(await getBrain(userId))
}
