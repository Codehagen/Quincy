/**
 * Dumps one account's content to a JSON file, so wiping it is reversible.
 * Run with: npx tsx --env-file=.env.local scripts/backup-account.ts <email>
 *
 * Written for resetting a real account to test first run (plans/022). Two of
 * the things a reset destroys cost money to rebuild — the X corpus is a paid
 * read at $0.005 a post, and every riff's angles were a model call — and two
 * more cost consent screens, because deleting `channel_connection` means
 * re-authorising X and LinkedIn by hand.
 *
 * **The output holds encrypted OAuth tokens**, so it goes to the home
 * directory rather than anywhere near the repo. Do not move it into the tree
 * and do not commit it. The encryption key is `BETTER_AUTH_SECRET`, so a dump
 * plus that secret is a working set of credentials.
 *
 * `usage_event` and `account` are deliberately absent: the first is the spend
 * ledger /credits reads and the second is the Google login row, and neither is
 * content this would ever restore.
 */
import { existsSync, writeFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Scoped by user_id. Child tables are pulled through their parents below. */
const OWNED = [
  "brain_page",
  "riff",
  "source_item",
  "channel_connection",
  "source_connection",
  "conversation",
  "draft",
  "scheduled_post",
  "slot",
  "rhythm_subscription",
  "rhythm_run",
  "video_project",
] as const

async function main() {
  const email = process.argv[2]
  if (!email) throw new Error("Pass an email.")

  const [owner] = (
    await db.execute<{ id: string }>(
      sql`select id from "user" where email = ${email}`
    )
  ).rows

  if (!owner) throw new Error(`No user with email ${email}`)

  const dump: Record<string, unknown[]> = {
    _meta: [{ email, userId: owner.id, takenAt: new Date().toISOString() }],
  }

  for (const table of OWNED) {
    const rows = (
      await db.execute(
        sql.raw(`select * from ${table} where user_id = '${owner.id}'`)
      )
    ).rows
    dump[table] = rows
    console.log(`  ${table.padEnd(22)} ${rows.length}`)
  }

  // Children, reached through the ids above rather than by a user_id they do
  // not carry. Empty parent means empty child, and `in ()` is a syntax error.
  const pageIds = (dump.brain_page as { id: string }[]).map((r) => r.id)
  const riffIds = (dump.riff as { id: string }[]).map((r) => r.id)

  for (const [table, column, ids] of [
    ["brain_page_version", "page_id", pageIds],
    ["brain_event", "page_id", pageIds],
    ["riff_angle", "riff_id", riffIds],
  ] as const) {
    if (ids.length === 0) {
      dump[table] = []
      console.log(`  ${table.padEnd(22)} 0`)
      continue
    }
    const list = ids.map((id) => `'${id}'`).join(",")
    const rows = (
      await db.execute(
        sql.raw(`select * from ${table} where ${column} in (${list})`)
      )
    ).rows
    dump[table] = rows
    console.log(`  ${table.padEnd(22)} ${rows.length}`)
  }

  const path = `${process.env.HOME}/quincy-backup-${email.split("@")[0]}-${
    new Date().toISOString().slice(0, 10)
  }.json`

  /**
   * Refuses to overwrite. The filename carries a date, so a second reset on
   * the same day resolves to the same path — and the second dump is of an
   * account that has just been wiped. Writing it would replace the only copy
   * of the real data with a snapshot of its absence, which is the exact
   * failure this script exists to prevent, arriving by the front door.
   *
   * Nearly happened on 2026-08-11: a reset, a test, and a second reset, all
   * within two hours.
   */
  if (existsSync(path)) {
    throw new Error(
      `${path} already exists. Move or rename it first — overwriting it would replace a backup of the full account with whatever is left now.`
    )
  }

  writeFileSync(path, JSON.stringify(dump, null, 2))
  console.log(`\nWrote ${path}`)
  console.log("Holds encrypted OAuth tokens. Keep it out of the repo.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
