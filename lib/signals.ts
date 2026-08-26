import { generateObject, jsonSchema } from "ai"

import { REASONING } from "./model-options"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  type StructuredUsage,
} from "./structured-output"

/**
 * What the world is talking about, from the sources that do not bill per read.
 *
 * This is the reading half of Trend Alerts — "spots a live topic you have
 * standing to talk about". Deterministic aside from `selectSignals` at the
 * bottom: the readers fetch, normalise and bound, and never decide what is
 * worth anything. Same split as lib/bookmarks-x.ts and lib/corpus-x.ts, for
 * the same reason — a read with no judgment in it can be retried freely, while
 * the model call stays deliberate and metered by the caller.
 *
 * **Why these two origins and not X.** X removed its free tier in February
 * 2026 and every post read is now bought at `X_READ_COST_MICROS` — $0.005, the
 * rate lib/corpus-x.ts already meters. A trend scan is only useful if it is
 * broad, and broad on X is roughly 300 posts a day, which is $45 a month
 * against a $49 plan. So the scan runs where reading is free:
 *
 * - **Hacker News** through Algolia. No key, no account, no quota to
 *   negotiate. It is also early — a thing is discussed here before it is a
 *   thread on X, which is the whole point of a rhythm that promises the angle
 *   *early*.
 * - **GitHub** search, which is free with a token and rate-limited without
 *   one. A repository that took two hundred stars in its first month is the
 *   cheapest available proxy for something about to matter.
 *
 * Reddit was considered and refused. Its free tier is non-commercial only and
 * its terms name brand and social monitoring as commercial use, so the honest
 * options were a paid commercial agreement or a terms violation. Neither is a
 * feature. RSS is the obvious third origin and is deliberately not here yet:
 * it needs a per-user feed list, which is a settings surface and a table, and
 * these two need no configuration at all.
 *
 * **Nothing here is the user's words.** Everything this file returns is
 * somebody else's writing, and it lands under `source_item.source` values that
 * `compileVoice` does not read — its `sources` parameter defaults to the
 * user's own posts, and that default is the guard. A Hacker News comment
 * reaching the voice compile would teach Quincy to write like Hacker News.
 */

const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/** Exported so the call site can pass the same string to `recordUsage`. */
export const SIGNAL_MODEL = MODEL

/**
 * The `source_item.source` values this file produces, and the reason there are
 * two of them rather than one "signal".
 *
 * The unique index on `source_item` is (user, source, external_id), so a
 * shared value would put a Hacker News story id and a GitHub repository id in
 * one namespace and make a collision between them possible — unlikely, silent,
 * and permanent. Separate values also mean "read Hacker News again" is one
 * query rather than a `LIKE` over a meta field.
 */
export const SIGNAL_ORIGINS = ["hacker-news", "github-repo"] as const

export type SignalOrigin = (typeof SIGNAL_ORIGINS)[number]

/** What the origin is called on screen and in the prompt. */
export const ORIGIN_LABEL: Record<SignalOrigin, string> = {
  "hacker-news": "Hacker News",
  "github-repo": "GitHub",
}

/**
 * One thing the world is paying attention to.
 *
 * `heat` is a sentence rather than a number because the units do not convert:
 * 400 points on Hacker News and 400 stars on GitHub are not the same fact, and
 * a single `score` column would invite code to pretend they are. The model
 * reads the sentence; nothing branches on it.
 */
export type Signal = {
  origin: SignalOrigin
  /** Stable at the origin. Becomes `source_item.external_id`. */
  externalId: string
  title: string
  url: string
  /** Who put it there, without a leading @. Empty when the origin has no one. */
  handle: string
  postedAt: Date | null
  /** "482 points, 210 comments" — the origin's own units, named. */
  heat: string
  /** One line of what it is, when the origin gives one. Never invented here. */
  blurb: string
  /** The origin's own numbers, for `source_item.meta`. Never logic. */
  meta: Record<string, unknown>
}

export type SignalDeps = { fetch: typeof fetch }

const defaultDeps: SignalDeps = { fetch }

const FETCH_TIMEOUT_MS = 10_000

/* ── Bounds ───────────────────────────────────────────────────────────────
   Every number here bounds a prompt rather than a bill, which is the pleasant
   difference between this file and lib/bookmarks-x.ts. What they protect is
   the selection call: fifty titles is a prompt worth reading, five hundred is
   a prompt that costs real money to have a model skim.
   ──────────────────────────────────────────────────────────────────────── */

/** A day, because the rhythm runs daily and a story older than the last run
 *  has already been through one. */
export const HN_WINDOW_HOURS = 24

/**
 * Below this a story has not been noticed yet, and the front page is not the
 * bar either. Fifty points inside a day is "this got traction", which is the
 * moment the promise is about — after that it is on X and the angle is late.
 */
export const HN_MIN_POINTS = 50

export const HN_LIMIT = 30

/** A month. Long enough that a repository has had time to be starred, short
 *  enough that it is still news. */
export const GITHUB_WINDOW_DAYS = 30

export const GITHUB_MIN_STARS = 200

export const GITHUB_LIMIT = 20

/**
 * The most material one picked signal contributes to a riff.
 *
 * Well under `MAX_SCRAP_CHARS` (6,000) in lib/riffs.ts, because that ceiling
 * is for one post and this is a title plus a discussion — the point is the
 * shape of the argument, and the shape is legible in the first few comments.
 */
export const MAX_MATERIAL_CHARS = 3_000

/* ── Reading ──────────────────────────────────────────────────────────────
   Both readers are defensive about everything. This is third-party JSON over
   the network, and a TypeScript type is an assertion about a shape rather than
   a check of one — the same rule lib/shipped-work.ts states about a webhook
   body, and it holds harder here because nobody signs these.
   ──────────────────────────────────────────────────────────────────────── */

function asString(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

/** A date, or null — never an Invalid Date, which throws on insert rather
 *  than on read. The same correction lib/bookmarks-x.ts makes. */
function parseDate(value: unknown): Date | null {
  const raw = asString(value)
  if (!raw) return null
  const at = new Date(raw)
  return Number.isNaN(at.getTime()) ? null : at
}

/**
 * Fetch JSON with a timeout, or null.
 *
 * Null rather than a throw, and that is the load-bearing decision in this
 * file: one origin being down must never cost the user the other one. The
 * caller treats an absent origin as "nothing from there today", which is a
 * sentence the rhythm already knows how to say.
 */
async function getJson(
  url: string,
  deps: SignalDeps,
  headers: Record<string, string> = {}
): Promise<unknown | null> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await deps.fetch(url, {
      headers: { accept: "application/json", ...headers },
      signal: control.signal,
    })

    if (!response.ok) {
      console.warn(`[signals] ${url} answered ${response.status}`)
      return null
    }

    return await response.json()
  } catch (cause) {
    console.warn(`[signals] ${url} failed:`, cause)
    return null
  } finally {
    clearTimeout(timer)
  }
}

function hits(payload: unknown): Record<string, unknown>[] {
  if (!payload || typeof payload !== "object") return []
  const list = (payload as { hits?: unknown }).hits
  if (!Array.isArray(list)) return []
  return list.filter(
    (hit): hit is Record<string, unknown> =>
      Boolean(hit) && typeof hit === "object"
  )
}

/**
 * Hacker News, through Algolia's public index.
 *
 * `/search` rather than `/search_by_date`: the promise is "a topic going up",
 * and the popularity ranking is the closest thing to that available for free.
 * The date filter is what keeps it from returning last year's classics.
 */
export async function readHackerNews({
  now = new Date(),
  limit = HN_LIMIT,
  minPoints = HN_MIN_POINTS,
  deps = defaultDeps,
}: {
  now?: Date
  limit?: number
  minPoints?: number
  deps?: SignalDeps
} = {}): Promise<Signal[]> {
  const since = Math.floor(
    (now.getTime() - HN_WINDOW_HOURS * 60 * 60 * 1000) / 1000
  )

  const url =
    "https://hn.algolia.com/api/v1/search?tags=story" +
    `&numericFilters=created_at_i>${since},points>${minPoints}` +
    `&hitsPerPage=${limit}`

  return hits(await getJson(url, deps)).flatMap((hit) => {
    const externalId = asString(hit.objectID)
    const title = asString(hit.title).trim()

    // A hit with no id cannot be deduplicated and a hit with no title cannot be
    // judged. Both are dropped rather than stored as an empty row.
    if (!externalId || !title) return []

    const points = asNumber(hit.points)
    const comments = asNumber(hit.num_comments)

    return [
      {
        origin: "hacker-news" as const,
        externalId,
        title,
        /**
         * The discussion, not the article.
         *
         * `hit.url` is the link somebody submitted and is often a blog nobody
         * here has read. The Hacker News item is where the argument is, it is
         * what `readSignalMaterial` goes back to, and it is the URL a riff
         * should credit. For an Ask HN there is no `hit.url` at all.
         */
        url: `https://news.ycombinator.com/item?id=${externalId}`,
        handle: asString(hit.author),
        postedAt: parseDate(hit.created_at),
        heat: `${points} points, ${comments} comments`,
        /**
         * Stripped before it is cut, never after.
         *
         * `story_text` is an HTML fragment — an Ask HN body, or for a link
         * post the submitted URL wrapped in an anchor. Slicing first would
         * leave a half-written tag at the boundary; more importantly the raw
         * fragment is what gets stored in `source_item.body` and read into the
         * selection prompt, and `href="https:&#x2F;&#x2F;…"` is a hundred
         * characters of markup pretending to be a description.
         */
        blurb: stripHtml(asString(hit.story_text)).slice(0, 400),
        meta: {
          points,
          comments,
          link: asString(hit.url),
          author: asString(hit.author),
        },
      },
    ]
  })
}

/**
 * GitHub, as repositories that took a lot of stars quickly.
 *
 * There is no trending endpoint in the API — the trending page is HTML and
 * scraping it is a dependency on somebody's markup. "Created inside the window
 * and already above the star floor, sorted by stars" is the standard
 * reconstruction and needs nothing but search.
 *
 * `GITHUB_TOKEN` is optional and its absence is a degradation rather than a
 * failure, matching how lib/env.ts treats every other optional key. Without
 * one, search allows ten requests a minute per IP — which is fine for a single
 * self-hosted user and not fine on shared serverless egress, so a deployment
 * with more than a few users wants the token. Rate-limited returns null above
 * and the run reports Hacker News alone.
 */
export async function readGitHubRepos({
  now = new Date(),
  limit = GITHUB_LIMIT,
  minStars = GITHUB_MIN_STARS,
  token = process.env.GITHUB_TOKEN,
  deps = defaultDeps,
}: {
  now?: Date
  limit?: number
  minStars?: number
  token?: string | undefined
  deps?: SignalDeps
} = {}): Promise<Signal[]> {
  const since = new Date(
    now.getTime() - GITHUB_WINDOW_DAYS * 24 * 60 * 60 * 1000
  )
    .toISOString()
    .slice(0, 10)

  const query = encodeURIComponent(`created:>${since} stars:>${minStars}`)
  const url =
    `https://api.github.com/search/repositories?q=${query}` +
    `&sort=stars&order=desc&per_page=${limit}`

  const payload = await getJson(url, deps, {
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    ...(token ? { authorization: `Bearer ${token}` } : {}),
  })

  const items =
    payload && typeof payload === "object"
      ? (payload as { items?: unknown }).items
      : undefined

  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    if (!item || typeof item !== "object") return []
    const repo = item as Record<string, unknown>

    const fullName = asString(repo.full_name)
    if (!fullName) return []

    const stars = asNumber(repo.stargazers_count)
    const language = asString(repo.language)
    const topics = Array.isArray(repo.topics)
      ? repo.topics.filter((t): t is string => typeof t === "string")
      : []

    return [
      {
        origin: "github-repo" as const,
        // The name, not the numeric id. It is stable enough for a cursor, and
        // a row somebody reads in the database says what it is.
        externalId: fullName,
        title: fullName,
        url: asString(repo.html_url) || `https://github.com/${fullName}`,
        handle: fullName.split("/")[0] ?? "",
        postedAt: parseDate(repo.created_at),
        heat: `${stars} stars since ${since}`,
        blurb: asString(repo.description).slice(0, 400),
        meta: { stars, language, topics, createdAt: asString(repo.created_at) },
      },
    ]
  })
}

/**
 * Both origins, and neither can fail the other.
 *
 * `allSettled` rather than `all`: `getJson` already returns null for a bad
 * response, so a rejection here means something unforeseen, and the correct
 * answer to "GitHub threw" is still whatever Hacker News said.
 */
export async function readSignals({
  now = new Date(),
  deps = defaultDeps,
}: { now?: Date; deps?: SignalDeps } = {}): Promise<Signal[]> {
  const results = await Promise.allSettled([
    readHackerNews({ now, deps }),
    readGitHubRepos({ now, deps }),
  ])

  return results.flatMap((result) => {
    if (result.status === "fulfilled") return result.value
    console.error("[signals] an origin failed outright:", result.reason)
    return []
  })
}

/**
 * The deep read, and it happens **only for the few that were picked**.
 *
 * This is the shape of the whole feature: the scan reads titles, which are
 * free and thin, and the material behind a title is fetched one request at a
 * time for the two or three that survived judgment. Reading every discussion
 * in the window to find three worth reading is the version of this that is
 * slow, rude to a free API, and no better.
 *
 * Takes what is already stored rather than a `Signal`, because by the time
 * anything is picked the signal has been through the database and back. The
 * row's `body` is the title and blurb the scan kept; this appends the part
 * that was too expensive to keep fifty of.
 *
 * Never returns empty when `stored` is not empty, so the caller always has a
 * scrap — and `createRiffFromPost` refuses an empty one anyway.
 */
export async function readSignalMaterial(
  signal: { origin: SignalOrigin; externalId: string; stored: string },
  deps: SignalDeps = defaultDeps
): Promise<string> {
  const detail =
    signal.origin === "hacker-news"
      ? await readDiscussion(signal.externalId, deps)
      : await readReadme(signal.externalId, deps)

  return [signal.stored.trim(), detail]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, MAX_MATERIAL_CHARS)
}

/** The top comments on a story, flattened. Ranked by Algolia rather than
 *  threaded, because the argument is in the loudest replies and a tree costs
 *  characters that buy nothing here. */
async function readDiscussion(
  storyId: string,
  deps: SignalDeps
): Promise<string> {
  const url =
    `https://hn.algolia.com/api/v1/search?tags=comment,story_${storyId}` +
    `&hitsPerPage=8`

  const comments = hits(await getJson(url, deps))
    .map((hit) => stripHtml(asString(hit.comment_text)))
    .filter((text) => text.length > 80)
    .map((text) => `- ${text.slice(0, 600)}`)

  if (comments.length === 0) return ""

  return `What people are saying:\n${comments.join("\n")}`
}

/** A repository's README, as raw text. */
async function readReadme(
  fullName: string,
  deps: SignalDeps
): Promise<string> {
  const control = new AbortController()
  const timer = setTimeout(() => control.abort(), FETCH_TIMEOUT_MS)

  try {
    const response = await deps.fetch(
      `https://api.github.com/repos/${fullName}/readme`,
      {
        headers: {
          accept: "application/vnd.github.raw",
          "x-github-api-version": "2022-11-28",
          ...(process.env.GITHUB_TOKEN
            ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
            : {}),
        },
        signal: control.signal,
      }
    )

    if (!response.ok) return ""

    return (await response.text()).slice(0, MAX_MATERIAL_CHARS)
  } catch (cause) {
    console.warn(`[signals] readme for ${fullName} failed:`, cause)
    return ""
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Hacker News comments arrive as HTML fragments. Tags out, the handful of
 * entities the site actually emits decoded, whitespace collapsed.
 *
 * Deliberately not a parser. This text is prompt input and never rendered as
 * markup, so the requirement is legibility rather than correctness, and a
 * dependency for that would be a dependency in the workflow bundle.
 */
export function stripHtml(html: string): string {
  return html
    .replace(/<p>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    // Last, so a decoded entity cannot produce another one.
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim()
}

/* ── Selection ────────────────────────────────────────────────────────────
   Which of fifty things the world is talking about this particular person has
   any business talking about. This is the whole feature — without it the
   rhythm is a news reader, and a news reader is not a Head of Content.
   ──────────────────────────────────────────────────────────────────────── */

export type SignalCandidate = {
  /** The `source_item` row id, so a pick maps back to a signal. */
  id: string
  origin: SignalOrigin
  /** The title and, when the origin gave one, its one-line description. What
   *  the scan kept — the discussion behind it is not read until this is
   *  picked. */
  text: string
  /** "482 points, 210 comments". Read by the model, never branched on. */
  heat: string
}

export type SignalPick = {
  id: string
  /** One line to the user on what they specifically could add. Becomes the
   *  `note` the angle generator is steered by. */
  why: string
}

export type SignalSelection = {
  picks: SignalPick[]
  usage?: StructuredUsage
}

/** Injectable so the handler and its tests never need a model. */
export type SignalSelector = (input: {
  candidates: SignalCandidate[]
  brain: string
  limit: number
}) => Promise<SignalSelection>

/**
 * Standing, not interest.
 *
 * The failure mode this prompt is written against is the one that makes trend
 * tools worthless: a model asked "which of these is interesting?" says all of
 * them, and the user gets three angles on a story they have no relationship
 * with. Posting into a topic you have not lived is how an account stops
 * sounding like a person, and docs/vision.md's whole bet is that the scarce
 * thing is original thought with a receipt attached.
 *
 * So the bar is evidence in the brain, refusal is named as the expected
 * answer, and the schema can express it.
 */
const SELECT_PROMPT = `You are choosing which of today's live topics this specific person has any standing to talk about.

A topic qualifies only when BOTH are true:
1. It is genuinely moving right now — the heat line says so — and it carries an argument, a shift or a tension, rather than being an announcement, a release note, a listicle or a job ad.
2. This person has *standing*: the brain below shows they have built, shipped, run or lived through something that gives them a first-hand claim on it. Having an opinion is not standing. Working in the same broad industry is not standing.

Returning an empty list is the correct and common answer. Most days, nothing the world is loud about is something this person has earned the right to add to. Never pad the list to reach the limit, and return fewer whenever fewer qualify.

For each pick, "why" is one short line addressed to the user naming the first-hand thing they have that nobody else in this discussion has. Not a summary of the topic.`

const SELECTION_SCHEMA = jsonSchema<{ picks: SignalPick[] }>({
  type: "object",
  properties: {
    picks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          why: { type: "string" },
        },
        required: ["id", "why"],
        additionalProperties: false,
      },
    },
  },
  required: ["picks"],
  additionalProperties: false,
})

/**
 * Guarded the same way `selectAdaptable` is, and for the same reason: it runs
 * unattended from the rhythm dispatcher, where the only witness to a mangled
 * `picks` is a log line nobody is reading.
 */
export const selectSignals: SignalSelector = async ({
  candidates,
  brain,
  limit,
}) => {
  const spent = usageAccumulator()

  const { object } = await retryMalformed(
    async () => {
      const result = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: SELECTION_SCHEMA,
        system: brain ? `${SELECT_PROMPT}\n\n${brain}` : SELECT_PROMPT,
        prompt: [
          `Choose at most ${limit}.`,
          ...candidates.map(
            (c) =>
              `<topic id="${c.id}" where="${ORIGIN_LABEL[c.origin]}" heat="${c.heat}">\n${c.text}\n</topic>`
          ),
        ].join("\n\n"),
      })

      // Counted before the result is judged. A malformed answer costs exactly
      // what a good one costs.
      spent.add(result.usage)

      return {
        ...result,
        object: unwrapStringifiedObject(result.object, ["picks"], ["picks"]),
      }
    },
    ({ object }) => Array.isArray(object.picks),
    { label: "signals/select" }
  )

  // The model's claims are bounded by code, not by the prompt. An id it
  // invented refers to nothing, and `limit` is enforced here because a prompt
  // asking for "at most N" is a request.
  const known = new Set(candidates.map((c) => c.id))

  return {
    picks: Array.isArray(object.picks)
      ? object.picks.filter((p) => known.has(p.id)).slice(0, limit)
      : [],
    usage: spent.total,
  }
}
