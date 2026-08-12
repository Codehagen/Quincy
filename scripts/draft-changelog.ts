/**
 * Drafts changelog files from `git log`. See plans/023.
 *
 * ```
 * npx tsx scripts/draft-changelog.ts 2026-08-11            # one day, to stdout
 * npx tsx scripts/draft-changelog.ts 2026-08-09 2026-08-11 # a range
 * npx tsx scripts/draft-changelog.ts 2026-08-11 --write    # write the files
 * ```
 *
 * **This drafts, it does not publish.** `lib/changelog.ts` explains why the log
 * is files rather than `git log` read at build time, and the short version is
 * editorial control: every "fix typo" and every revert is in the history, and
 * none of them belong on the front page. So this writes a starting point and a
 * person deletes two thirds of it.
 *
 * `--write` refuses to overwrite a day that already exists, because that day
 * has probably been edited and the edit is the whole value.
 *
 * No database, no env, no network. Safe to run anywhere.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

const DIRECTORY = join(process.cwd(), "content", "changelog")

/**
 * Subjects that are never worth a public line.
 *
 * Merges and reverts describe the repository rather than the product, and a
 * "fix typo" tells a reader nothing they can use. Everything else survives and
 * is deleted by hand.
 */
const NOISE = [
  /^merge /i,
  /^revert /i,
  /^wip\b/i,
  /^chore\b/i,
  /^bump /i,
  /^fix typo/i,
  /^formatting\b/i,
]

function isNoise(subject: string) {
  return NOISE.some((pattern) => pattern.test(subject))
}

/**
 * `(#37)` at the end of a subject is a pull request number. It is useful in the
 * log and meaningless to a stranger reading the landing page.
 */
function clean(subject: string) {
  return subject.replace(/\s*\(#\d+\)\s*$/, "").trim()
}

function main() {
  const args = process.argv.slice(2)
  const write = args.includes("--write")
  const dates = args.filter((arg) => !arg.startsWith("--"))

  const since = dates[0]
  const until = dates[1] ?? dates[0]

  if (
    !since ||
    !/^\d{4}-\d{2}-\d{2}$/.test(since) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(until)
  ) {
    console.error(
      "Usage: npx tsx scripts/draft-changelog.ts <YYYY-MM-DD> [YYYY-MM-DD] [--write]"
    )
    process.exit(1)
  }

  // `--until` is exclusive of times later that day, so it is pushed to the end
  // of the day. Without this, asking for 2026-08-11 returns nothing committed
  // after midnight, which is every commit.
  const log = execFileSync(
    "git",
    [
      "log",
      `--since=${since} 00:00:00`,
      `--until=${until} 23:59:59`,
      "--no-merges",
      "--date=short",
      "--pretty=format:%ad\t%s",
    ],
    { encoding: "utf8" }
  )

  const days = new Map<string, string[]>()

  for (const line of log.split("\n")) {
    const [date, subject] = line.split("\t")

    if (!date || !subject || isNoise(subject)) {
      continue
    }

    const list = days.get(date) ?? []
    list.push(clean(subject))
    days.set(date, list)
  }

  if (days.size === 0) {
    console.log(`Nothing between ${since} and ${until}.`)
    return
  }

  if (write) {
    mkdirSync(DIRECTORY, { recursive: true })
  }

  for (const [date, subjects] of [...days].sort()) {
    const body = `${subjects.map((s) => `## ${s}`).join("\n\n")}\n`
    const path = join(DIRECTORY, `${date}.md`)

    if (!write) {
      console.log(`\n${"─".repeat(60)}\n${path}\n${"─".repeat(60)}\n${body}`)
      continue
    }

    if (existsSync(path)) {
      console.log(`  skip  ${date}.md already exists — edit it by hand`)
      continue
    }

    writeFileSync(path, body, "utf8")
    console.log(
      `  wrote ${date}.md — ${subjects.length} entries, now cut them down`
    )
  }

  if (!write) {
    console.log("Nothing written. Add --write to create the files.")
  }
}

main()
