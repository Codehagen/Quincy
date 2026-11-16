import { eq, sql } from "drizzle-orm"

import { db } from "./db"
import { installationAccessToken } from "./github-app"
import { asString, readRepoContext, type RepoContext } from "./repo-context"
import { sourceConnection } from "./schema-app"

/**
 * Reading what the repository says about itself, from GitHub or from the cache.
 * See plans/021 and the audit of 2026-08-24.
 *
 * **The half of this that a prompt uses lives in lib/repo-context.ts.**
 * `RepoContext`, `readRepoContext` and `describeRepo` are pure, and they had to
 * move out of here because lib/shipped-work.ts reads them from inside a
 * `"use workflow"` bundle, which may not contain `node:crypto` — and this file
 * reaches it through `installationAccessToken`. Everything below touches the
 * network or the database, which is why it stays.
 *
 * Why the context is worth fetching at all is written at the top of that file:
 * twelve angles from four merges produced zero drafts, because the prompt knew
 * a branch name and nothing else.
 *
 * **Cached on the connection rather than fetched per merge.** A repository's
 * description changes a few times a year and a merge arrives a few times a day,
 * so the honest cadence is weekly. It lives in `source_connection.meta.repos`
 * keyed by full name, next to `login`, because it belongs to the installation
 * and dies with it — a new install is a new row and a cold cache, which is
 * correct rather than unfortunate.
 *
 * **Nothing here throws and nothing here is required.** A merge that arrives
 * while GitHub is down still becomes a riff; it becomes a slightly worse one.
 * That is the whole reason the return type is nullable and the failure path
 * hands back a stale entry rather than clearing it.
 */

/** The cached shape: the context plus when it was read. */
type CachedRepo = RepoContext & { fetchedAt: string }

/**
 * How long a cached repository stays fresh.
 *
 * Seven days. A description is edited a handful of times in a repository's
 * life and a merge lands daily, so anything shorter buys a request per merge to
 * re-read a string that did not move. Anything longer and a rename or a
 * repositioning — the moment the context matters most — takes a month to reach
 * the prompt.
 */
const CACHE_MS = 7 * 24 * 60 * 60 * 1000

const API = "https://api.github.com"

/**
 * The same five lines as `headers()` in lib/github-backfill.ts, duplicated on
 * purpose.
 *
 * The cycle that used to be the argument is gone: sharing them would make this
 * module import that one, which imports lib/shipped-work.ts — which now reads
 * `describeRepo` from lib/repo-context.ts rather than from here, so nothing
 * points back. What is left is the smaller argument, and it still holds. Five
 * lines of constants are not worth a dependency between the file that reads a
 * repository and the file that walks a user's merges, and a shared module for
 * them would be a module with one export in it.
 */
function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "quincy",
  }
}

/**
 * `meta.repos[fullName]`, if it is there and if it is what we wrote.
 *
 * Every field is checked rather than cast. `meta` is a `jsonb` column and this
 * key has already changed shape once — reading it as a type is reading a claim
 * about a row written by an older deploy.
 */
function cachedRepo(
  meta: Record<string, unknown>,
  repository: string
): CachedRepo | null {
  const repos = meta.repos

  // Not an object: an older row, a hand-edited one, or a `repos` that somebody
  // stored as an array. All three are the same answer — there is no cache.
  if (!repos || typeof repos !== "object" || Array.isArray(repos)) return null

  const entry = (repos as Record<string, unknown>)[repository]
  const repo = readRepoContext(entry)

  if (!repo) return null

  return {
    ...repo,
    name: repo.name || repository,
    fetchedAt: asString((entry as Record<string, unknown>).fetchedAt),
  }
}

function isFresh(cached: CachedRepo, now: number): boolean {
  const at = Date.parse(cached.fetchedAt)
  if (Number.isNaN(at)) return false
  return now - at < CACHE_MS
}

function stripCacheKey(cached: CachedRepo): RepoContext {
  return {
    name: cached.name,
    description: cached.description,
    homepage: cached.homepage,
    topics: cached.topics,
  }
}

type RepoResponse = {
  full_name?: string
  description?: string | null
  homepage?: string | null
  topics?: unknown
}

/**
 * The repository behind a merge, from the cache or from GitHub.
 *
 * Cached per repository on `source_connection.meta.repos[fullName]` and
 * refetched after seven days. Never throws; null when GitHub cannot be read and
 * nothing was cached before.
 */
export async function repoContextFor(input: {
  connectionId: string
  installationId: number
  repository: string
  meta: Record<string, unknown>
}): Promise<RepoContext | null> {
  const { connectionId, installationId, repository, meta } = input

  if (!repository) return null

  const cached = cachedRepo(meta, repository)

  if (cached && isFresh(cached, Date.now())) return stripCacheKey(cached)

  // From here on every exit is "the fetch did not work out", and every one of
  // them answers with the stale entry rather than with null. A description from
  // last month is closer to the truth than no description at all, and the
  // alternative — dropping the cache on a rate limit — turns one 403 into a
  // week of prompts with nothing in them.
  const stale = cached ? stripCacheKey(cached) : null

  const fetched = await fetchRepo(installationId, repository)
  if (!fetched) return stale

  await cacheRepo(connectionId, repository, fetched)

  return fetched
}

async function fetchRepo(
  installationId: number,
  repository: string
): Promise<RepoContext | null> {
  const token = await installationAccessToken(installationId)

  if (!token) {
    console.error(`[github-repo] no installation token for ${installationId}`)
    return null
  }

  try {
    const response = await fetch(`${API}/repos/${repository}`, {
      headers: headers(token),
    })

    if (!response.ok) {
      console.error(
        `[github-repo] ${repository} answered ${response.status}` +
          ` (retry-after: ${response.headers.get("retry-after") ?? "none"})`
      )
      return null
    }

    const body = (await response.json()) as RepoResponse

    // The same narrowing the cache read uses, so a field is bounded once and in
    // one place rather than twice with two sets of limits.
    const repo = readRepoContext({
      name: body.full_name,
      description: body.description,
      homepage: body.homepage,
      topics: body.topics,
    })

    return repo ? { ...repo, name: repo.name || repository } : null
  } catch (cause) {
    console.error(`[github-repo] ${repository} failed:`, cause)
    return null
  }
}

/**
 * Merged into `meta` **by Postgres**, never read-modify-written by this process.
 *
 * `setGithubLogin` in lib/source-connections.ts spreads a row it read one
 * statement earlier, and gets away with it: it is a person pressing Save once.
 * This runs on a webhook delivery, from a `meta` snapshot the route read at the
 * top of the request, and there is one interleaving with a consequence bad
 * enough to be worth the SQL — a user sets their GitHub login on /sources while
 * a merge is in flight, this write lands last with a snapshot taken before the
 * login existed, and `login` disappears. Every merge after that is dropped with
 * `no-login` and nothing on screen says why, because `shippedGate` refuses
 * silently. A cache miss is the cost of losing this race; a login is not.
 *
 * So the whole update is one expression evaluated against the current row:
 * `meta || { repos: <current repos> || <this entry> }`. Only the one key under
 * `repos` is touched, every sibling of `repos` is left exactly as the row has
 * it, and two concurrent deliveries for two repositories both survive.
 *
 * The `jsonb_typeof` guard is the same tolerance `cachedRepo` reads with: `||`
 * between an array and an object concatenates rather than merges, so a `repos`
 * that is somehow not an object is replaced instead of corrupted.
 *
 * `updatedAt` is deliberately left alone. It is the connection's own clock, and
 * a background cache refresh is not the user's connection changing.
 */
async function cacheRepo(
  connectionId: string,
  repository: string,
  repo: RepoContext
): Promise<void> {
  // The backfill can hand us a repository with no connection row in hand. The
  // fetch still helped this one merge; there is simply nowhere to keep it.
  if (!connectionId) return

  const entry: CachedRepo = { ...repo, fetchedAt: new Date().toISOString() }
  const patch = JSON.stringify({ [repository]: entry })

  try {
    await db
      .update(sourceConnection)
      .set({
        meta: sql`coalesce(${sourceConnection.meta}, '{}'::jsonb) || jsonb_build_object('repos', (case when jsonb_typeof(${sourceConnection.meta} -> 'repos') = 'object' then ${sourceConnection.meta} -> 'repos' else '{}'::jsonb end) || ${patch}::jsonb)`,
      })
      .where(eq(sourceConnection.id, connectionId))
  } catch (cause) {
    // A failed cache write costs one request next time. It is not a reason to
    // fail a merge that has already been read successfully.
    console.error(`[github-repo] could not cache ${repository}:`, cause)
  }
}
