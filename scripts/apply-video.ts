/**
 * Creates the video_project and video_asset tables.
 *
 * Hand-applied for the same reason scripts/apply-channels.ts is: `drizzle/` has
 * no baseline, so a generated migration carries `CREATE TABLE` for every table
 * in the app. See that file's header.
 *
 * Idempotent — every statement is IF NOT EXISTS, so a second run changes
 * nothing.
 *
 * Verifies rather than trusts: it reads the columns and indexes back and checks
 * them, because "the CREATE did not error" and "the table is what the
 * application expects" are different claims and only the second one matters.
 * Two things are asserted by name rather than eyeballed — the unique index that
 * makes a re-upload free instead of a duplicate, and size_bytes being bigint,
 * since int4 tops out at 2.1GB and would accept every test file before failing
 * on the first real 4K take.
 *
 * Run with: npx tsx --env-file=.env.local scripts/apply-video.ts
 */
import { readFileSync } from "node:fs"
import { sql } from "drizzle-orm"

import { db } from "../lib/db"

/** Every column lib/schema-app.ts declares, and nothing may be missing. */
const EXPECTED_COLUMNS: Record<string, string[]> = {
  video_project: [
    "created_at",
    "document",
    "id",
    "lock",
    "revision",
    "thumbnail_key",
    "title",
    "updated_at",
    "user_id",
  ],
  video_asset: [
    "content_hash",
    "created_at",
    "duration_us",
    "error",
    "filename",
    "fps",
    "gemini_expires_at",
    "gemini_file_uri",
    "has_audio",
    "height",
    "id",
    "mime_type",
    "proxy_key",
    "rotation",
    "seek_index_key",
    "size_bytes",
    "state",
    "storage_key",
    "thumbnail_key",
    "transcribed_at",
    "transcript",
    "transcript_provider",
    "updated_at",
    "user_id",
    "width",
  ],
}

const EXPECTED_INDEXES: Record<string, string[]> = {
  video_project: ["video_project_user_updated_idx"],
  video_asset: [
    "video_asset_user_hash_key",
    "video_asset_user_created_idx",
    "video_asset_state_idx",
  ],
}

async function main() {
  const statements = readFileSync(
    process.argv[2] ?? "scripts/video.sql",
    "utf8"
  )
    .split(";")
    .map((s) => s.trim())
    // Strip comment-only fragments; a leading `--` block would otherwise be
    // sent to the server as a statement with nothing in it.
    .filter((s) => s && !s.split("\n").every((line) => line.startsWith("--")))

  for (const statement of statements) {
    const head = statement
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join(" ")
      .replace(/\s+/g, " ")
      .slice(0, 76)

    await db.execute(sql.raw(statement))
    console.log(`  ok   ${head}`)
  }

  for (const table of Object.keys(EXPECTED_COLUMNS)) {
    const columns = await db.execute<{
      column_name: string
      data_type: string
      is_nullable: string
    }>(
      sql`
        select column_name, data_type, is_nullable
        from information_schema.columns
        where table_name = ${table}
        order by column_name
      `
    )

    console.log(`\n${table} columns:`)
    for (const row of columns.rows) {
      console.log(
        `  ${row.column_name.padEnd(22)} ${row.data_type}${
          row.is_nullable === "NO" ? " not null" : ""
        }`
      )
    }

    const found = columns.rows.map((r) => r.column_name).sort()
    const missing = EXPECTED_COLUMNS[table].filter((c) => !found.includes(c))

    if (missing.length > 0) {
      throw new Error(`${table} is missing columns: ${missing.join(", ")}`)
    }

    const indexes = await db.execute<{ indexname: string }>(
      sql`
        select indexname from pg_indexes
        where tablename = ${table}
        order by indexname
      `
    )

    const indexNames = indexes.rows.map((r) => r.indexname)
    console.log(`${table} indexes:`)
    for (const name of indexNames) console.log(`  ${name}`)

    const missingIndexes = EXPECTED_INDEXES[table].filter(
      (i) => !indexNames.includes(i)
    )

    if (missingIndexes.length > 0) {
      throw new Error(
        `${table} is missing indexes: ${missingIndexes.join(", ")}`
      )
    }

    if (table === "video_asset") {
      // int4 accepts every test file and fails on the first real 4K take, which
      // is the worst possible place to discover the column type.
      const size = columns.rows.find((r) => r.column_name === "size_bytes")

      if (size?.data_type !== "bigint") {
        throw new Error(
          `size_bytes must be bigint, got ${size?.data_type} — int4 tops out at 2.1GB.`
        )
      }

      // Without this the same file uploaded twice becomes two rows, two
      // transcodes and two Deepgram bills.
      if (!indexNames.includes("video_asset_user_hash_key")) {
        throw new Error("the content-hash unique index is missing")
      }
    }
  }

  console.log("\nDone.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
