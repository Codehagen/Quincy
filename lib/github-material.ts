import { installationAccessToken } from "./github-app"
import {
  linkedIssues,
  MAX_COMMIT_MESSAGES,
  MAX_MATERIAL_FILES,
  MAX_PATCH_BYTES,
  MAX_PATCH_SAMPLES,
  NO_MATERIAL,
  readShippedMaterial,
  type ShippedCut,
  type ShippedMaterial,
} from "./shipped-work"

/**
 * What the merge is made of, read once, bounded everywhere. See plans/027 1a.
 *
 * **The diff is still not read as a whole**, and this file is where that
 * promise is kept rather than restated. `GET /pulls/{n}/files` returns a
 * `patch` per file and it would be trivial to concatenate them; nothing here
 * does. Three files, sorted by additions, cut at 6 KB across all of them, and
 * the prompt is told it is a sample. lib/shipped-work.ts's decision 1 is the
 * argument and it has not changed: a median diff 51 times its description is
 * not material, it is a bill.
 *
 * **Nothing here throws and nothing here is required.** Every request that
 * fails resolves to an empty list, and a merge whose material could not be read
 * still becomes a riff — a slightly worse one, exactly as `repoContextFor`
 * degrades. A missing material must never fail an ingest, because the ingest is
 * the fact and this is decoration on it.
 *
 * **The ceilings are counted in requests, not in rows.** AGENTS.md's "Money"
 * section names the failure this avoids: `collectBookmarks` shipped with a cap
 * on what it stored and none on what it paid for. So the worst case is written
 * down here rather than derived — one commits page, one files page, and at most
 * `MAX_LINKED_ISSUES` issue reads. Seven requests per merge, and merges are
 * capped per day by the route.
 */

const API = "https://api.github.com"

/**
 * The most requests one call may buy, stated as a number rather than left to
 * be counted from the code below.
 *
 * 1 (commits) + 1 (files) + 5 (issues) = 7. Bounded again by the caller: the
 * webhook runs this below `MAX_MERGES_PER_DAY`, so a user's GitHub reads are
 * capped at 35 a day whatever happens upstream.
 */
export const MAX_MATERIAL_REQUESTS = 7

/**
 * Per request, and the reason it is short.
 *
 * This runs on a webhook delivery inside `maxDuration = 30`, on a path that is
 * about to start a workflow. A GitHub endpoint that hangs must cost the merge a
 * commit list, never the riff. lib/corpus-x.ts uses 15s for a read a person is
 * waiting on; nobody is waiting on this one.
 */
const FETCH_TIMEOUT_MS = 8_000

/** Commits per page. GitHub's own maximum for this endpoint is 250. */
const COMMITS_PER_PAGE = 100

/** Files per page. One page only — the cap is 50 and this is the page it is in. */
const FILES_PER_PAGE = 100

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "quincy",
  }
}

/**
 * One request, and every failure is a null.
 *
 * 403 and 429 are logged with `retry-after` for the reason
 * lib/github-backfill.ts gives: from the outside a rate limit and "this pull
 * request has no commits" look identical, and only one of them is worth
 * knowing about.
 */
async function getJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: headers(token),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    })

    if (response.status === 403 || response.status === 429) {
      console.error(
        `[github-material] ${url} answered ${response.status}` +
          ` (retry-after: ${response.headers.get("retry-after") ?? "none"})`
      )
    }

    if (!response.ok) return null
    return (await response.json()) as T
  } catch (cause) {
    console.error(`[github-material] ${url} failed:`, cause)
    return null
  }
}

type CommitRow = { commit?: { message?: string } }
type FileRow = {
  filename?: string
  additions?: number
  deletions?: number
  patch?: string
}
type IssueRow = { number?: number; title?: string; pull_request?: unknown }

/**
 * Everything `ShippedMaterial` holds, for one merged pull request.
 *
 * The caller passes the description because linked issues are parsed out of it
 * — see `linkedIssues`, which is pure and tested, so the request budget is
 * spent on numbers somebody actually wrote rather than on every `#` in the
 * body.
 */
export async function materialFor(input: {
  installationId: number
  /** `owner/repo`. */
  repository: string
  number: number
  /** The description, for the issue references in it. */
  body: string
}): Promise<ShippedMaterial> {
  const { installationId, repository, number, body } = input

  if (!repository || !number) return NO_MATERIAL

  const token = await installationAccessToken(installationId).catch((cause) => {
    console.error(`[github-material] no installation token:`, cause)
    return null
  })

  if (!token) {
    console.error(`[github-material] no installation token for ${repository}`)
    return NO_MATERIAL
  }

  const base = `${API}/repos/${repository}`
  const truncated: ShippedCut[] = []

  const [commitRows, fileRows] = await Promise.all([
    getJson<CommitRow[]>(
      `${base}/pulls/${number}/commits?per_page=${COMMITS_PER_PAGE}`,
      token
    ),
    getJson<FileRow[]>(
      `${base}/pulls/${number}/files?per_page=${FILES_PER_PAGE}`,
      token
    ),
  ])

  /**
   * Subject lines only.
   *
   * A commit message is a subject, a blank line and a body, and the body is a
   * second description of work the pull request already describes. Taking the
   * subject is what makes twenty of them cheaper than one paragraph — and it is
   * the line the author wrote to be read on its own.
   */
  const commits = (commitRows ?? [])
    .map((row) => (row.commit?.message ?? "").split("\n")[0]?.trim() ?? "")
    .filter(Boolean)

  if (commits.length > MAX_COMMIT_MESSAGES) truncated.push("commits")

  const files = (fileRows ?? [])
    .filter((row) => typeof row.filename === "string" && row.filename)
    .map((row) => ({
      path: row.filename as string,
      additions: row.additions ?? 0,
      deletions: row.deletions ?? 0,
    }))

  if (files.length > MAX_MATERIAL_FILES) truncated.push("files")

  /**
   * The sample, spent as a budget rather than as a per-file limit.
   *
   * Sorted by additions because the file that grew most is the file the change
   * is about — a rename touches ten files and adds nothing to any of them. The
   * budget is drawn down in order, so one large file may take all of it and the
   * other two are then recorded as cut. That is the honest reading: what is
   * stored is what was sampled, and `truncated` says the rest exists.
   */
  const ranked = (fileRows ?? [])
    .filter(
      (row) => typeof row.filename === "string" && typeof row.patch === "string"
    )
    .sort((a, b) => (b.additions ?? 0) - (a.additions ?? 0))
    .slice(0, MAX_PATCH_SAMPLES)

  const samples: { path: string; patch: string }[] = []
  let budget = MAX_PATCH_BYTES

  for (const row of ranked) {
    if (budget <= 0) break
    const patch = (row.patch as string).slice(0, budget)
    if (!patch) continue
    budget -= patch.length
    samples.push({ path: row.filename as string, patch })
  }

  if (
    samples.length < ranked.length ||
    (ranked.length > 0 && budget <= 0) ||
    ranked.some((row) => (row.patch as string).length > MAX_PATCH_BYTES)
  ) {
    truncated.push("patch")
  }

  /**
   * Linked issues, one request each and at most five.
   *
   * `/issues/{n}` answers for a pull request too — GitHub models one as the
   * other — so a `#123` that is really a pull request comes back with a
   * `pull_request` key on it and is dropped. A previous merge's title is not a
   * linked issue, and quoting one would put last week's work in this week's
   * post.
   */
  const wanted = linkedIssues(body, number)

  /**
   * In parallel, and that is a deadline rather than a preference.
   *
   * The webhook route is `maxDuration = 30`. Five sequential reads at
   * `FETCH_TIMEOUT_MS` each is forty seconds of worst case, which would turn a
   * slow GitHub into a function that dies before it can start the workflow —
   * losing the riff to buy an issue title. Run together, the worst case is one
   * timeout, and `MAX_LINKED_ISSUES` is what keeps that a bounded fan-out
   * rather than one per `#` in the body.
   *
   * `Promise.all` over a mapped array, so the order the ranking decided
   * survives — the closing references first. See `linkedIssues`.
   */
  const fetched = await Promise.all(
    wanted.map(async (issueNumber) => {
      const row = await getJson<IssueRow>(
        `${base}/issues/${issueNumber}`,
        token
      )
      if (!row || row.pull_request) return null
      const title = (row.title ?? "").trim()
      return title ? { number: issueNumber, title } : null
    })
  )

  const issues = fetched.filter(
    (issue): issue is { number: number; title: string } => issue !== null
  )

  if (wanted.length > issues.length) truncated.push("issues")

  /**
   * Narrowed on the way out, by the same reader everything else uses.
   *
   * The caps are applied in one place — `readShippedMaterial` — rather than
   * here as well, so a ceiling cannot be raised in the reader and left low in
   * the fetcher. What this function decides is *what to ask for*; what may be
   * kept is decided there.
   */
  return readShippedMaterial({
    commits,
    files,
    issues,
    samples,
    truncated,
  })
}
