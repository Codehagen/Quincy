import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * The shipped log. One markdown file per day under `content/changelog/`,
 * named `YYYY-MM-DD.md`. See plans/023.
 *
 * **Files, not `git log` at build time, and not a table.**
 *
 * `git log` was the obvious answer and it is wrong twice. Vercel clones
 * shallow, so the history a build can see is one commit deep unless somebody
 * remembers to change that — and the failure is silent, a page that renders
 * with one entry on it. It also hands editorial control of a public page to
 * commit hygiene: every "fix typo" and every revert goes straight out.
 *
 * A table was the other candidate and it makes a static page dynamic to store
 * text that only ever changes in a deploy.
 *
 * So: files, written by a person, seeded from the log by
 * `scripts/draft-changelog.ts` so writing an entry is editing rather than
 * authoring. `/` shows the titles and `/changelog` will show the bodies, from
 * this one source — two surfaces that can never disagree about what shipped.
 *
 * Read at module scope, which means at build. Every page that calls this
 * prerenders, so no request ever touches the filesystem. Do not add
 * `revalidate` to a caller without moving this read behind it.
 */

export type ChangelogEntry = {
  /** The claim. One line, and it is the whole entry on the landing page. */
  title: string
  /** Optional prose under it, for `/changelog`. Empty for most entries. */
  body: string
}

export type ChangelogDay = {
  /** `YYYY-MM-DD`, from the filename. */
  date: string
  /** `11 Aug`. Built from a fixed table, never `toLocaleDateString` — that
   *  reads the server's locale, so the same page renders "11 Aug" on one host
   *  and "Aug 11" on another. */
  label: string
  entries: ChangelogEntry[]
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
]

const DIRECTORY = join(process.cwd(), "content", "changelog")

/** `2026-08-11` → `11 Aug`. Returns the input unchanged if it is not a date. */
export function formatDay(date: string) {
  const [year, month, day] = date.split("-").map(Number)

  if (!year || !month || !day || month < 1 || month > 12) {
    return date
  }

  return `${day} ${MONTHS[month - 1]}`
}

/**
 * Split one day's file into entries.
 *
 * `## ` opens an entry; everything until the next one is its body. Anything
 * before the first heading is ignored, so a file can carry a comment at the
 * top without it becoming an entry nobody meant to publish.
 */
function parseEntries(source: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null

  for (const line of source.split("\n")) {
    if (line.startsWith("## ")) {
      if (current) entries.push(current)
      current = { title: line.slice(3).trim(), body: "" }
      continue
    }

    if (current) {
      current.body += `${line}\n`
    }
  }

  if (current) entries.push(current)

  return entries
    .map((entry) => ({ ...entry, body: entry.body.trim() }))
    .filter((entry) => entry.title)
}

/**
 * Every day that has entries, newest first.
 *
 * A file with no `## ` in it is dropped rather than rendered as an empty day —
 * a date with nothing under it reads as a bug on the page, and the honest way
 * to show a quiet day is to have no file for it.
 */
export function readChangelog(): ChangelogDay[] {
  let files: string[]

  try {
    files = readdirSync(DIRECTORY)
  } catch {
    // No directory yet. An empty log is a real state — it is what the first
    // deploy of this looked like — and it must not take the build down.
    return []
  }

  return files
    .filter((name) => name.endsWith(".md"))
    .sort()
    .reverse()
    .map((name) => {
      const date = name.replace(/\.md$/, "")

      return {
        date,
        label: formatDay(date),
        entries: parseEntries(readFileSync(join(DIRECTORY, name), "utf8")),
      }
    })
    .filter((day) => day.entries.length > 0)
}

export function countEntries(days: ChangelogDay[]) {
  return days.reduce((total, day) => total + day.entries.length, 0)
}

/**
 * When the log was read, which is build time.
 *
 * Module scope, and it has to be: under `cacheComponents` a `new Date()`
 * during a prerender is a build error, and both pages that read this log
 * prerender. Module evaluation runs before the render, so the clock is read
 * once per build instead of once per page.
 *
 * Build time rather than request time is the right reading anyway. An entry
 * only reaches this log through a deploy, so the newest entry can never be
 * newer than this constant, and "the last three days" is measured from the
 * moment the page was made — which is the moment its claim was true.
 */
const BUILT_AT = new Date()

const DAY_MS = 86_400_000

/**
 * Whole days from a `YYYY-MM-DD` entry date to `now`. Same day is 0.
 *
 * **Counted in UTC, not in the reader's zone, because there is no reader.**
 * The count is computed once at build with nobody's timezone available, and
 * the dates it compares are bare calendar dates off a filename with no zone
 * attached to them. A local boundary would also make one commit produce
 * different copy depending on whether the build ran on a laptop in Oslo or on
 * a builder in UTC — a page disagreeing with itself for a reason no reader
 * could see.
 *
 * A filename that is not a date returns Infinity rather than throwing, so it
 * is simply never inside a window. `readChangelog` still renders it; being
 * undateable is not the same as being unpublishable.
 */
export function daysSince(date: string, now: Date = BUILT_AT): number {
  const [year, month, day] = date.split("-").map(Number)

  if (!year || !month || !day || month < 1 || month > 12) {
    return Number.POSITIVE_INFINITY
  }

  const then = Date.UTC(year, month - 1, day)
  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  )

  return Math.round((today - then) / DAY_MS)
}

export type ChangelogWindow = {
  /**
   * The days to render: the ones inside the window, or the newest `within`
   * days of the log when the window is empty. A quiet fortnight makes the
   * count honest, not the page blank.
   */
  days: ChangelogDay[]
  /** Entries dated inside the window. Zero is a real answer — read `since`. */
  recent: number
  /** Whole days since the newest entry. Null only when the log is empty. */
  since: number | null
}

/**
 * The last `within` days of the log, counted by date.
 *
 * This used to be `slice(0, within)`, which takes the newest three *files*
 * whatever their dates — so a page saying "N changes in the last 3 days" went
 * on saying it about work from a fortnight ago, and the number was true of a
 * window that was not.
 *
 * A future-dated file is excluded (`age >= 0`). It has not shipped yet, so it
 * cannot be part of what shipped in the last three days.
 *
 * Separated from the filesystem read so it can be tested against dates rather
 * than against whatever is in `content/` this week.
 */
export function selectWindow(
  all: ChangelogDay[],
  within: number,
  now: Date = BUILT_AT
): ChangelogWindow {
  const inside = all.filter((day) => {
    const age = daysSince(day.date, now)
    return age >= 0 && age < within
  })

  return {
    days: inside.length > 0 ? inside : all.slice(0, within),
    recent: countEntries(inside),
    since: all[0] ? daysSince(all[0].date, now) : null,
  }
}

/** The last `within` days of the log. What the landing page shows. */
export function recentChangelog(within: number, now: Date = BUILT_AT) {
  return selectWindow(readChangelog(), within, now)
}
