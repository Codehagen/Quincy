import { createIdGenerator } from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "./db"
import { installationAccessToken } from "./github-app"
import { sourceItem } from "./schema-app"
import {
  descriptionBlocks,
  MAX_DESCRIPTION_CHARS,
  type ShippedPayload,
} from "./shipped-work"

/**
 * The one merge Quincy reads when you install it, so the connection proves
 * itself instead of announcing itself.
 *
 * **The empty state is what this exists for.** GitHub connects and the row says
 * "Connected today — nothing merged yet", which is accurate and useless: it
 * explains and does not act, at the exact moment somebody has just granted
 * something and has no evidence it worked. Everything else in first run earns
 * its ask by doing something — the X grant buys a read that produces a portrait
 * — and this was the one that asked for a grant and gave back a status line.
 *
 * **One pull request, never a history.** The ceiling is the design, not a
 * safety valve: each merge Quincy turns into a riff costs a model call, and a
 * month of backfill would spend a month's worth to bury /riffs under work
 * nobody asked to write about. One recent merge proves the pipe and costs one
 * angle call.
 *
 * The GitHub calls themselves are free and bounded — at most `MAX_REPO_PAGES`
 * repository listings, at most `MAX_REPOS_SCANNED` pull-request listings, one
 * detail fetch.
 */

const newSourceItemId = createIdGenerator({ prefix: "si", size: 20 })

/**
 * How many repositories to look through before giving up.
 *
 * Sorted by most recently pushed, so the first few are where a merge from this
 * week actually is. An account with forty repositories should not cost forty
 * requests to answer "nothing recent", and somebody whose last merge is in
 * their fortieth-most-active repository is better served by waiting for the
 * next one.
 */
const MAX_REPOS_SCANNED = 5

/** Closed pull requests to read per repository. Merged ones are a subset. */
const PULLS_PER_REPO = 20

const API = "https://api.github.com"

function headers(token: string) {
  return {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "quincy",
  }
}

async function getJson<T>(url: string, token: string): Promise<T | null> {
  try {
    const response = await fetch(url, { headers: headers(token) })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch (cause) {
    // A network failure here costs nothing that was promised — the install is
    // already recorded and merges will arrive by webhook regardless.
    console.error(`[github-backfill] ${url} failed:`, cause)
    return null
  }
}

type RepoRow = { full_name?: string; pushed_at?: string; private?: boolean }
type PullRow = {
  number?: number
  merged_at?: string | null
  draft?: boolean
  user?: { login?: string }
}
type PullDetail = {
  node_id?: string
  number?: number
  title?: string
  body?: string | null
  html_url?: string
  merged_at?: string | null
  base?: { ref?: string; repo?: { default_branch?: string; private?: boolean } }
  user?: { login?: string }
  additions?: number
  deletions?: number
  changed_files?: number
  commits?: number
  labels?: { name?: string }[]
}

/**
 * Every repository the installation can see, across pages.
 *
 * **This used to be one request, and the sort below quietly lied because of
 * it.** `per_page=100` is GitHub's maximum, so an install with more than a
 * hundred repositories returned an arbitrary hundred of them — and "sorted by
 * most recently pushed, so the first few are where a merge from this week
 * actually is" then meant *most recently pushed out of an arbitrary hundred*.
 * Measured on a real install on 2026-08-21: 266 repositories, and the first
 * page's freshest was last pushed five weeks earlier. The button read a merge
 * from July and reported it as the last one, which it was not.
 *
 * `MAX_REPO_PAGES` is a ceiling and not a page count. Three requests cover the
 * install this was measured against with room to spare, and an install past it
 * is one where the freshest repository is overwhelmingly likely to have been
 * seen already. It is logged when hit rather than silently truncated, because a
 * cap nobody can see reads exactly like complete coverage.
 */
const MAX_REPO_PAGES = 5

async function installationRepos(token: string): Promise<RepoRow[]> {
  const all: RepoRow[] = []

  for (let page = 1; page <= MAX_REPO_PAGES; page++) {
    const body = await getJson<{ repositories?: RepoRow[] }>(
      `${API}/installation/repositories?per_page=100&page=${page}`,
      token
    )

    const rows = body?.repositories ?? []
    all.push(...rows)

    // A short page is the last page. A failed request returns null, which
    // arrives here as a short page too — the right call either way, because
    // going on would ask for page N+1 of a listing that just failed.
    if (rows.length < 100) return all
  }

  console.log(
    `[github-backfill] stopped at ${MAX_REPO_PAGES} pages of repositories; ` +
      `some were not looked at`
  )

  return all
}

/**
 * The most recent merge this person wrote, across the repositories they gave
 * the app.
 *
 * Authored by them, never merely merged by them: `shippedGate` draws the same
 * line on the webhook, and for the same reason — drafting a post about a
 * colleague's work under your name is the one outcome this feature must never
 * produce.
 */
export async function findLastMergedPull(input: {
  installationId: number
  /** The GitHub login whose work counts. Empty means we cannot attribute. */
  login: string
}): Promise<{ payload: ShippedPayload; repository: string } | null> {
  if (!input.login) return null

  const token = await installationAccessToken(input.installationId)
  if (!token) return null

  const names = (await installationRepos(token))
    .filter((r) => typeof r.full_name === "string")
    .sort((a, b) => (b.pushed_at ?? "").localeCompare(a.pushed_at ?? ""))
    .slice(0, MAX_REPOS_SCANNED)
    .map((r) => r.full_name as string)

  for (const repository of names) {
    const pulls = await getJson<PullRow[]>(
      `${API}/repos/${repository}/pulls?state=closed&sort=updated&direction=desc&per_page=${PULLS_PER_REPO}`,
      token
    )

    const mine = (pulls ?? [])
      .filter(
        (p) =>
          p.merged_at &&
          !p.draft &&
          p.user?.login?.toLowerCase() === input.login.toLowerCase()
      )
      .sort((a, b) => (b.merged_at ?? "").localeCompare(a.merged_at ?? ""))[0]

    if (!mine?.number) continue

    /**
     * The list endpoint omits `additions`, `changed_files` and `commits`, and
     * those are what `source_item.meta` is for. One extra request, only once a
     * candidate is found.
     */
    const detail = await getJson<PullDetail>(
      `${API}/repos/${repository}/pulls/${mine.number}`,
      token
    )

    if (!detail?.node_id || typeof detail.number !== "number") continue

    return {
      repository,
      payload: {
        installationId: input.installationId,
        // Shaped as the webhook's payload so everything downstream — the
        // blocks, the row, the workflow — is the code that already runs on a
        // real merge rather than a second implementation of it.
        action: "closed",
        merged: true,
        draft: false,
        nodeId: detail.node_id,
        number: detail.number,
        title: detail.title ?? "",
        body: detail.body ?? "",
        htmlUrl: detail.html_url ?? "",
        authorLogin: detail.user?.login ?? "",
        baseRef: detail.base?.ref ?? "",
        defaultBranch: detail.base?.repo?.default_branch ?? "",
        mergedAt: detail.merged_at ? new Date(detail.merged_at) : null,
        repository,
        private: detail.base?.repo?.private ?? false,
        additions: detail.additions ?? 0,
        deletions: detail.deletions ?? 0,
        changedFiles: detail.changed_files ?? 0,
        commits: detail.commits ?? 0,
        labels: (detail.labels ?? [])
          .map((l) => l.name)
          .filter((n): n is string => typeof n === "string"),
      },
    }
  }

  return null
}

export type StoredMerge =
  | { stored: true; sourceItemId: string; blocks: string[] }
  | { stored: false; sourceItemId: string }

/**
 * Stores the merge and returns what the workflow needs, or says which row it
 * collided with.
 *
 * `onConflictDoNothing` on `(user, source, external_id)` is what makes pressing
 * twice — or installing, uninstalling and installing again — free. The webhook
 * relies on exactly the same constraint for redelivery, so a merge that arrived
 * by webhook first is silently skipped here rather than drafted twice.
 *
 * **The collision returns the id rather than a null.** It used to return
 * nothing, and the caller answered "I have already read that one — it is in
 * your riffs", which is a guess dressed as a fact: the commonest reason a merge
 * is already stored is that it was read and found to carry no post, in which
 * case it is *not* in the riffs and the sentence sends somebody to look for a
 * card that was never going to exist. Handing back the id lets the caller go
 * and find out what actually became of it.
 */
export async function storeBackfilledMerge(input: {
  userId: string
  payload: ShippedPayload
}): Promise<StoredMerge> {
  const { userId, payload } = input
  const blocks = descriptionBlocks(payload)

  const inserted = await db
    .insert(sourceItem)
    .values({
      id: newSourceItemId(),
      userId,
      source: "github",
      externalId: payload.nodeId,
      url: payload.htmlUrl,
      postedAt: payload.mergedAt,
      body: blocks.join("\n\n").slice(0, MAX_DESCRIPTION_CHARS),
      meta: {
        repository: payload.repository,
        number: payload.number,
        title: payload.title,
        additions: payload.additions,
        deletions: payload.deletions,
        changedFiles: payload.changedFiles,
        commits: payload.commits,
        labels: payload.labels,
        baseRef: payload.baseRef,
        private: payload.private,
        author: payload.authorLogin,
        // The one field the webhook's rows do not carry. Worth having: a riff
        // that appeared without a merge happening is otherwise unexplainable
        // when somebody comes back to ask why.
        backfilled: true,
      },
    })
    .onConflictDoNothing()
    .returning({ id: sourceItem.id })

  if (inserted.length > 0) {
    return { stored: true, sourceItemId: inserted[0].id, blocks }
  }

  /**
   * Already stored — by an earlier press, or by the webhook that fired when it
   * landed. Paying for a second selection would be the bug, so the row is read
   * back instead: it is the one that already holds the answer.
   *
   * A second query, and only on the path where nothing was written.
   */
  const [existing] = await db
    .select({ id: sourceItem.id })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.userId, userId),
        eq(sourceItem.source, "github"),
        eq(sourceItem.externalId, payload.nodeId)
      )
    )
    .limit(1)

  return { stored: false, sourceItemId: existing?.id ?? "" }
}
