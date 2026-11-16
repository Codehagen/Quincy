import { and, eq, inArray, sql } from "drizzle-orm"

import { db } from "./db"
import { brainPage, sourceItem } from "./schema-app"

/**
 * What the corpus keeps mentioning and the story bank has nothing about.
 * Plan 027, 3b.
 *
 * The story bank knows what it holds. This is the other half — what it is
 * missing — and it exists because a memory that only lists what it has cannot
 * ask for anything. Quincy already mines stories from published posts
 * (`compileVoice`), and each one carries a `theme`. A gap is a theme the posts
 * return to with no story page behind it, and the useful form of a gap is not
 * a label but a question: *"You mention pricing in 7 posts and have no story
 * about it. What happened the last time you changed a price?"*
 *
 * **No model call, ever.** This runs on every chat turn through
 * `renderBrainForUser`, and a paid call on that path would be a per-turn cost
 * to decorate a prompt. It is two counted queries and a table, which is also
 * what makes it testable — see `rankGaps`.
 *
 * Nothing here imports lib/brain.ts at run time, on purpose: that module
 * imports this one for the index rendering, and a value import in both
 * directions is a cycle. Story pages arrive as an argument or come out of one
 * read-only query.
 */

export type ThemeSpec = {
  /** The word used in the sentence: "pricing", "open source". */
  id: string
  /** Regex alternatives, lowercase. Matched on word boundaries. */
  terms: string[]
  /** The question Quincy would ask. Specific to the theme, never generic. */
  ask: string
}

/**
 * The themes Quincy can recognise without asking a model.
 *
 * A vocabulary rather than free term-frequency, and the question is why. Raw
 * frequency over a corpus produces "just", "really" and the user's own product
 * name, and the honest template over those is "you mention X a lot" — which is
 * an observation, not an ask. What makes a gap worth showing is the second
 * sentence, and a second sentence has to be written by somebody who knows what
 * kind of thing the theme is. So the list is finite and each entry carries its
 * own question.
 *
 * Finite is also the honest limit: a theme not in here is a gap Quincy cannot
 * see. That is a smaller failure than a list of five questions nobody can
 * answer, and the list grows by adding a row.
 */
export const THEMES: readonly ThemeSpec[] = [
  {
    id: "pricing",
    terms: ["pricing", "price", "prices", "priced", "paywall", "free tier"],
    ask: "What happened the last time you changed a price?",
  },
  {
    id: "hiring",
    terms: ["hiring", "hire", "hired", "candidate", "interviewed", "recruiter"],
    ask: "Who was the last person you hired, and what made you sure?",
  },
  {
    id: "launches",
    terms: ["launch", "launched", "launching", "went live", "release day"],
    ask: "Which launch went worst, and what did you do the morning after?",
  },
  {
    id: "churn",
    terms: ["churn", "churned", "cancelled", "canceled", "refund", "refunded"],
    ask: "Which customer left, and what did they say on the way out?",
  },
  {
    id: "fundraising",
    terms: [
      "raised",
      "raising",
      "investor",
      "investors",
      "funding",
      "term sheet",
    ],
    ask: "What did an investor say no to, and what did you change afterwards?",
  },
  {
    id: "open source",
    terms: ["open source", "open sourced", "oss", "agpl", "mit license"],
    ask: "What did working in the open cost you, and what did it buy?",
  },
  {
    id: "shipping",
    terms: ["shipped", "shipping", "merged", "deployed", "pull request"],
    ask: "What did you ship this week that nobody noticed?",
  },
  {
    id: "rewrites",
    terms: [
      "rewrite",
      "rewrote",
      "refactor",
      "refactored",
      "migration",
      "migrated",
    ],
    ask: "What did you rewrite, and would you do it again?",
  },
  {
    id: "outages",
    terms: [
      "outage",
      "downtime",
      "went down",
      "incident",
      "rollback",
      "broke prod",
    ],
    ask: "What broke in production, and who found out first?",
  },
  {
    id: "customers",
    terms: ["customer", "customers", "client", "clients", "first user"],
    ask: "Who was the first person to pay you, and what did they say?",
  },
  {
    id: "revenue",
    terms: ["revenue", "mrr", "arr", "paying users", "profitable", "margin"],
    ask: "Which number moved, and what actually moved it?",
  },
  {
    id: "burnout",
    terms: ["burnout", "burned out", "burnt out", "exhausted", "overworked"],
    ask: "When did you last work a weekend you regret?",
  },
  {
    id: "design",
    terms: ["design", "redesign", "interface", "ux", "typography"],
    ask: "What did you redesign, and what was the old one getting wrong?",
  },
  {
    id: "getting it wrong",
    terms: ["mistake", "got it wrong", "my fault", "regret", "should have"],
    ask: "What did you get wrong in public, and what happened next?",
  },
]

/**
 * Five. The list sits under a story index and is read in one glance; a sixth
 * line turns a prompt into a backlog, and a backlog is a thing to feel guilty
 * about rather than a thing to answer.
 */
export const STORY_GAP_CAP = 5

/**
 * Three posts. Below this it is a mention rather than a theme, and asking
 * somebody for a story about a subject they raised once is how a memory starts
 * sounding like it is guessing.
 */
export const MIN_MENTIONS = 3

export type StoryGap = {
  theme: string
  /** How many posts in the corpus mention it. */
  posts: number
  question: string
}

/**
 * The question, as a template over the theme and the count.
 *
 * No model call, and the count is in the sentence for the same reason every
 * number in this product is: a claim about somebody's own writing has to carry
 * the evidence, or it is Quincy having an opinion about them.
 *
 * Exported for the test.
 */
export function gapQuestion(theme: ThemeSpec, posts: number): string {
  return `You mention ${theme.id} in ${posts} ${posts === 1 ? "post" : "posts"} and have no story about it. ${theme.ask}`
}

/**
 * A Postgres case-insensitive regex for one theme, on word boundaries.
 *
 * `\y` is Postgres's word boundary; JavaScript spells the same thing `\b`, and
 * the pair below is why the two are built by one function rather than written
 * out twice and drifting. Without a boundary, "price" matches "prices" (fine)
 * and "priceless" (not), and "ux" matches every "flux" in the corpus.
 *
 * Exported for the test.
 */
export function themePattern(theme: ThemeSpec, boundary = "\\y"): string {
  const alternatives = theme.terms
    .map((term) => term.trim().toLowerCase())
    .filter(Boolean)
    .map(escapeRegex)
    .join("|")

  return `${boundary}(${alternatives})${boundary}`
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

/**
 * The themes a story page already covers.
 *
 * Matched against the story's own `theme`, its title and its `useFor` tags —
 * the three fields that say what a story is *for*. `point` is deliberately not
 * read: it is a sentence, and a sentence about shipping mentions half the
 * vocabulary in the table, which would mark every theme covered by the first
 * story written.
 *
 * Exported for the test.
 */
export function coveredThemes(
  stories: { title: string; data: unknown }[]
): Set<string> {
  const covered = new Set<string>()

  const haystacks = stories.map((story) => {
    const data = (story.data ?? {}) as { theme?: unknown; useFor?: unknown }
    const useFor = Array.isArray(data.useFor) ? data.useFor.join(" ") : ""
    return `${story.title} ${String(data.theme ?? "")} ${useFor}`.toLowerCase()
  })

  for (const theme of THEMES) {
    const pattern = new RegExp(themePattern(theme, "\\b"), "i")
    if (haystacks.some((text) => pattern.test(text))) covered.add(theme.id)
  }

  return covered
}

/**
 * Counts in, gaps out. The whole of the ranking, with no database in it.
 *
 * Ties break on the table's own order rather than on whatever the planner
 * returned, so the same corpus always produces the same five lines — a list
 * that reshuffles between page loads reads as noise even when every row is
 * true.
 *
 * Exported for the test.
 */
export function rankGaps(
  counts: Record<string, number>,
  covered: Set<string>,
  limit = STORY_GAP_CAP
): StoryGap[] {
  return THEMES.map((theme, index) => ({
    theme,
    index,
    posts: counts[theme.id] ?? 0,
  }))
    .filter(
      ({ theme, posts }) => posts >= MIN_MENTIONS && !covered.has(theme.id)
    )
    .sort((a, b) => b.posts - a.posts || a.index - b.index)
    .slice(0, Math.max(0, limit))
    .map(({ theme, posts }) => ({
      theme: theme.id,
      posts,
      question: gapQuestion(theme, posts),
    }))
}

/**
 * How many posts mention each theme, counted in Postgres.
 *
 * One round trip that returns fourteen integers, rather than pulling every
 * post body across the wire to count words in JavaScript. This runs on the
 * chat's prompt-building path, and lib/session.ts's note applies: the query
 * itself is microseconds and the cost is the network, so the only number that
 * matters is how much crosses it.
 *
 * Unbounded by design and bounded in fact: what may be counted is what the
 * corpus import stored, and that is capped upstream at `DEFAULT_MAX_POSTS` per
 * read. Counting is done in the database, so a larger archive costs the same
 * fourteen integers.
 */
async function countThemes(userId: string): Promise<Record<string, number>> {
  const columns = Object.fromEntries(
    THEMES.map((theme) => [
      theme.id,
      // Aliased, though drizzle maps this result positionally: fourteen
      // unnamed `count(*)` columns is a query nobody can read in a log, and
      // the alias costs nothing.
      sql<number>`count(*) filter (where ${sourceItem.body} ~* ${themePattern(theme)})::int`.as(
        theme.id
      ),
    ])
  )

  const [row] = await db
    .select(columns)
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        inArray(sourceItem.source, ["x", "x-archive"])
      )
    )

  return (row ?? {}) as Record<string, number>
}

/** The story pages, read directly so this module never imports the brain. */
async function readStories(userId: string) {
  return db
    .select({ title: brainPage.title, data: brainPage.data })
    .from(brainPage)
    .where(and(eq(brainPage.userId, userId), eq(brainPage.kind, "story")))
}

/**
 * The gap list for one account, ranked and capped.
 *
 * `stories` is an argument because the two callers already hold them:
 * `renderBrainForUser` has just read every brain page, and /brain has them in
 * the query cache. Passing them in is one round trip saved on the chat's hot
 * path.
 */
export async function storyGaps(
  userId: string,
  stories?: { title: string; data: unknown }[]
): Promise<StoryGap[]> {
  const [counts, storyPages] = await Promise.all([
    countThemes(userId),
    stories ? Promise.resolve(stories) : readStories(userId),
  ])

  return rankGaps(counts, coveredThemes(storyPages))
}

/**
 * The gap themes as bare labels, for the one line `renderBrain` prints.
 *
 * Failures are swallowed, and this is the one place in this module where that
 * is right: the caller is building a chat prompt, and a decorative line about
 * missing stories must not be the thing that takes the chat down. The prompt
 * is correct without it.
 */
export async function storyGapThemes(
  userId: string,
  stories?: { title: string; data: unknown }[]
): Promise<string[]> {
  try {
    return (await storyGaps(userId, stories)).map((gap) => gap.theme)
  } catch (cause) {
    console.error("[story-gaps] could not read gaps:", cause)
    return []
  }
}

/**
 * The one question to ask this week, or null when there is nothing missing.
 *
 * Exported for the rhythm that will ask it — plan 027 says one per week, and
 * this is the half of that which does not need a scheduler. The rhythm is not
 * built here.
 */
export async function nextStoryGapQuestion(
  userId: string
): Promise<string | null> {
  const [first] = await storyGaps(userId)
  return first?.question ?? null
}
