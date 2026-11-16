/**
 * Rewrites the GitHub scraps that were stored before `flattenMarkdown` existed.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-shipped-scraps.ts           (dry run)
 *   npx tsx --env-file=.env.local scripts/backfill-shipped-scraps.ts --apply
 *
 * Two riffs and two source items were written between the first live merge and
 * the fix in b8dd64a. Their text still carries backticks, `**` and `##`,
 * because the markup is removed when a riff is written rather than when it is
 * read. Everything after that commit is already clean, so this runs once and
 * then finds nothing.
 *
 * **This edits a real person's real material, so it is built to be boring.**
 *
 * - **Dry run by default.** It prints every change and writes nothing without
 *   `--apply`. The one guard that matters on a script like this is that the
 *   default action is to look.
 * - **No `@quincy.test` guard, deliberately.** Every other `scripts/verify-*`
 *   refuses to touch a real address, because those scripts *delete* things to
 *   test a pipeline. This one exists precisely to repair the owner's own rows,
 *   so that guard would prevent the only thing it is for. What replaces it is
 *   the narrowness below.
 * - **It only removes markup.** The new text is the old text through
 *   `flattenMarkdown`, so the words and their order are untouched. A row whose
 *   flattened form is identical is skipped rather than rewritten with the same
 *   value.
 * - **It refuses to shorten by more than a third.** A flatten drops markers and
 *   should cost a few percent. Anything larger means a construct was consumed
 *   whole — a table, a code fence — and losing a third of somebody's writing
 *   silently is worse than leaving the asterisks visible. Such a row is
 *   reported and left alone.
 */
import { and, eq } from "drizzle-orm"

import { db } from "../lib/db"
import { riff, sourceItem } from "../lib/schema-app"
import { flattenBlocks } from "../lib/shipped-work"

const APPLY = process.argv.includes("--apply")

/**
 * The most a repair may remove before it stops being a repair.
 *
 * A third. Markup is a few percent of a description; a fence or a table is
 * tens of percent. This is the line between "took the asterisks off" and "threw
 * a section away", and the script would rather do nothing than cross it.
 */
const MAX_SHRINK = 1 / 3

/**
 * `flattenBlocks`, not a local split-and-map.
 *
 * The first version of this function did its own splitting and mapped
 * `flattenMarkdown` over the parts, which skipped the whole-body strip that
 * removes fenced code — and a fence has to be removed *before* a split, because
 * it can contain blank lines. The inline-code rule then matched from the second
 * backtick of ``` and wrote a mangled ``ts into two production rows.
 *
 * The lesson is in the shape rather than the fix: a script that reimplements
 * half a library function is a script that will diverge from it. There is one
 * entry point now and this calls it.
 */
function reflow(stored: string): string {
  return flattenBlocks(stored).join("\n\n")
}

type Change = {
  table: string
  id: string
  before: string
  after: string
}

function describe(change: Change): void {
  const shrink = 1 - change.after.length / change.before.length

  console.log(
    `  ${change.table} ${change.id}  ${change.before.length} → ${change.after.length} chars (−${(shrink * 100).toFixed(1)}%)`
  )

  const before = change.before.split("\n\n")[0]?.slice(0, 100) ?? ""
  const after = change.after.split("\n\n")[0]?.slice(0, 100) ?? ""

  if (before !== after) {
    console.log(`     before: ${before}`)
    console.log(`     after : ${after}`)
  }
}

async function main() {
  console.log(APPLY ? "Mode: APPLY (writes)" : "Mode: dry run (writes nothing)")

  const riffs = await db
    .select({ id: riff.id, scrap: riff.scrap })
    .from(riff)
    .where(eq(riff.sourceId, "github"))

  const items = await db
    .select({ id: sourceItem.id, body: sourceItem.body })
    .from(sourceItem)
    .where(eq(sourceItem.source, "github"))

  const changes: Change[] = []
  const refused: Change[] = []

  for (const row of riffs) {
    const after = reflow(row.scrap)
    if (!after || after === row.scrap) continue
    const change = { table: "riff.scrap  ", id: row.id, before: row.scrap, after }
    ;(1 - after.length / row.scrap.length > MAX_SHRINK ? refused : changes).push(change)
  }

  for (const row of items) {
    const after = reflow(row.body)
    if (!after || after === row.body) continue
    const change = { table: "source_item ", id: row.id, before: row.body, after }
    ;(1 - after.length / row.body.length > MAX_SHRINK ? refused : changes).push(change)
  }

  console.log(
    `\nScanned ${riffs.length} riff(s) and ${items.length} source item(s).`
  )

  if (refused.length > 0) {
    console.log(
      `\n${refused.length} row(s) REFUSED — a flatten would remove more than a third:`
    )
    for (const change of refused) describe(change)
    console.log("  Left unchanged. Inspect these by hand.")
  }

  if (changes.length === 0) {
    console.log("\nNothing to rewrite.")
    return
  }

  console.log(`\n${changes.length} row(s) to rewrite:`)
  for (const change of changes) describe(change)

  if (!APPLY) {
    console.log("\nDry run. Re-run with --apply to write these.")
    return
  }

  for (const change of changes) {
    if (change.table.startsWith("riff")) {
      await db
        .update(riff)
        .set({ scrap: change.after, updatedAt: new Date() })
        .where(and(eq(riff.id, change.id), eq(riff.sourceId, "github")))
    } else {
      await db
        .update(sourceItem)
        .set({ body: change.after })
        .where(
          and(eq(sourceItem.id, change.id), eq(sourceItem.source, "github"))
        )
    }
  }

  console.log(`\nRewrote ${changes.length} row(s).`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
