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

/** The newest `days` days. What the landing page shows. */
export function recentChangelog(days: number) {
  return readChangelog().slice(0, days)
}

export function countEntries(days: ChangelogDay[]) {
  return days.reduce((total, day) => total + day.entries.length, 0)
}
