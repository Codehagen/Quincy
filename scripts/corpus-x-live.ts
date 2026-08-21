/**
 * The staged live run for plan 011 — three steps, run one at a time, so the
 * spend and the judgment stay separate:
 *
 *   import   Read your real posts from X into source_item. Spends money
 *            (~$0.005/post; default 50 posts ≈ $0.25). Stores raw rows,
 *            interprets nothing.
 *   show     Print what was stored. Free. This is the "is the data right?"
 *            gate before any model call.
 *   compile  One real model call over the stored corpus, then prints the
 *            voice page and stories it wrote so they can be judged on the
 *            spot. The plan's STOP condition lives here: if it reads as
 *            generic slop, stop and iterate on the prompt.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/corpus-x-live.ts import [--posts=50] [--email=...] [--live]
 *   npx tsx --env-file=.env.local scripts/corpus-x-live.ts show [--email=...]
 *   npx tsx --env-file=.env.local scripts/corpus-x-live.ts compile [--email=...] [--live]
 *
 * Without --email it targets the one account holding an active X connection,
 * and refuses to guess when there is more than one.
 *
 * `import` and `compile` spend money and write to whichever account they
 * resolve. Against a real address they refuse unless `--live` is passed —
 * see the comment in main().
 */
import { and, asc, desc, eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import { importXCorpus } from "../lib/corpus-x"
import { brainPage, channelConnection, sourceItem } from "../lib/schema-app"
import { user } from "../lib/schema"
import { isUnreachableTestAddress } from "../lib/test-address"
import { compileVoice } from "../lib/voice"

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

async function resolveUser(): Promise<{ id: string; email: string }> {
  const email = arg("email")

  if (email) {
    const [row] = await db
      .select({ id: user.id, email: user.email })
      .from(user)
      .where(eq(user.email, email))
      .limit(1)
    if (!row) throw new Error(`no user ${email}`)
    return row
  }

  const rows = await db
    .select({ id: user.id, email: user.email })
    .from(channelConnection)
    .innerJoin(user, eq(user.id, channelConnection.userId))
    .where(
      and(
        eq(channelConnection.channel, "x"),
        eq(channelConnection.state, "active")
      )
    )

  if (rows.length === 0) {
    throw new Error("no account has an active X connection — connect on /channels first")
  }
  if (rows.length > 1) {
    throw new Error(
      `${rows.length} accounts have an active X connection — pass --email=... to pick one:\n` +
        rows.map((r) => `  ${r.email}`).join("\n")
    )
  }
  return rows[0]
}

async function main() {
  const command = process.argv[2]
  const who = await resolveUser()

  /**
   * The one mutating script that is *supposed* to reach a real account.
   *
   * Its whole purpose is a live X connection, and only a person has one — a
   * hard `@quincy.test` guard like the seed scripts carry would make it
   * unrunnable. So the guard is an explicit act instead of a suffix: naming a
   * real account is allowed, but you have to say `--live` while doing it, and
   * the account is echoed back before a cent is spent.
   *
   * `show` is exempt because it only reads.
   */
  const live = process.argv.includes("--live")
  const spends = command !== "show"

  if (spends && !isUnreachableTestAddress(who.email) && !live) {
    console.error(
      `Resolved ${who.email} (${who.id}), which is a real account — and ` +
        `\`${command}\` spends money and writes to it. Pass --live to say so ` +
        `on purpose, or --email=…@quincy.test to work against a test account.`
    )
    process.exit(1)
  }

  console.log(
    live && !isUnreachableTestAddress(who.email)
      ? `Running LIVE against ${who.email} (${who.id})\n`
      : `Account: ${who.email}\n`
  )

  if (command === "import") {
    const maxPosts = Number(arg("posts") ?? 50)
    if (!Number.isFinite(maxPosts) || maxPosts < 1) {
      throw new Error(`--posts=${arg("posts")} is not a count`)
    }

    console.log(
      `Reading up to ${maxPosts} posts (~$${((maxPosts * 5_000) / 1_000_000).toFixed(2)})…`
    )
    const result = await importXCorpus({ userId: who.id, maxPosts })

    if (!result.ok) {
      console.error(`\nRefused: ${result.reason}\n${result.message}`)
      process.exit(1)
    }

    console.log(
      `\nStored ${result.imported} new post(s), read ${result.postsRead}, ` +
        `spent $${(result.spentMicros / 1_000_000).toFixed(2)}.` +
        (result.truncated ? " More remain — run import again for older posts." : "")
    )
    console.log("\nNext: `show` to inspect what landed, before any model call.")
    return
  }

  if (command === "show") {
    const rows = await db
      .select()
      .from(sourceItem)
      .where(
        and(
          eq(sourceItem.userId, who.id),
          inArray(sourceItem.source, ["x", "x-archive"])
        )
      )
      .orderBy(desc(sourceItem.postedAt))

    if (rows.length === 0) {
      console.log("Corpus is empty. Run `import` first.")
      return
    }

    const newest = rows[0].postedAt?.toISOString().slice(0, 10)
    const oldest = rows.at(-1)?.postedAt?.toISOString().slice(0, 10)
    console.log(`${rows.length} post(s) stored, ${oldest} → ${newest}\n`)

    for (const row of rows.slice(0, 15)) {
      const date = row.postedAt?.toISOString().slice(0, 10) ?? "undated"
      const text = row.body.replace(/\s+/g, " ").slice(0, 90)
      console.log(`  [${date}] ${text}${row.body.length > 90 ? "…" : ""}`)
      console.log(`           ${row.url}`)
    }
    if (rows.length > 15) console.log(`  … and ${rows.length - 15} more`)

    console.log("\nIf this looks like your posts: `compile`.")
    return
  }

  if (command === "compile") {
    console.log("Compiling (one real model call)…")
    const result = await compileVoice({ userId: who.id })

    console.log(
      `\nRead ${result.items} post(s) → ${result.rulesWritten} rule(s), ` +
        `${result.storiesWritten} story page(s)` +
        (result.skipped.length
          ? `; left alone (user-owned): ${result.skipped.join(", ")}`
          : "")
    )

    const pages = await db
      .select()
      .from(brainPage)
      .where(
        and(
          eq(brainPage.userId, who.id),
          inArray(brainPage.kind, ["voice", "story"])
        )
      )
      .orderBy(asc(brainPage.kind), asc(brainPage.slug))

    for (const page of pages) {
      if (page.kind === "voice" && page.slug === "voice/x") {
        console.log(`\n── ${page.title} (${page.provenance}) ──`)
        if (page.body) console.log(`${page.body}\n`)
        const rules = (page.data as { rules?: string[] }).rules ?? []
        for (const rule of rules) console.log(`  - ${rule}`)
      }
      if (page.kind === "story" && page.slug.startsWith("story/x-")) {
        const data = page.data as {
          point?: string
          hook?: string
          proof?: string[]
        }
        console.log(`\n── Story: ${page.title} ──`)
        console.log(`  Point: ${data.point}`)
        console.log(`  Hook:  ${data.hook}`)
        for (const url of data.proof ?? []) console.log(`  Proof: ${url}`)
      }
    }

    console.log(
      "\nJudge it: does this sound like you? Correct anything on /brain — " +
        "your edits stick, recompiles will not overwrite them."
    )
    return
  }

  throw new Error(`unknown command '${command ?? ""}' — use import | show | compile`)
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
)
