/**
 * Exercises the corpus import and voice compile against the real database,
 * with X and the model stubbed out. See plans/011, plans/012, plans/013.
 *
 * What it proves:
 *   1. importXCorpus pages through a stubbed timeline, stores rows, and a
 *      second run reads and stores nothing new (the cursor, not just the
 *      unique key, is doing the work).
 *   2. The meter recorded `x:read` once, at the right cost — the free re-run
 *      really is free.
 *   3. compileVoice with an injected extractor writes voice/x and a story
 *      page, filters an invented proof URL, and respects a user-owned page.
 *   4. Cleans up after itself.
 *
 * Run with: npx tsx --env-file=.env.local scripts/verify-corpus-x.ts
 *
 * The live run (real X read, real compile) lives in scripts/corpus-x-live.ts,
 * staged as import → show → compile so each spend is a separate decision.
 */
import { and, desc, eq, inArray, like } from "drizzle-orm"

import { getAccessToken } from "../lib/channels"
import { importXCorpus, X_READ_COST_MICROS } from "../lib/corpus-x"
import { db } from "../lib/db"
import {
  brainEvent,
  brainPage,
  brainPageVersion,
  channelConnection,
  sourceItem,
  usageEvent,
} from "../lib/schema-app"
import { user } from "../lib/schema"
import { compileVoice, type VoiceExtraction } from "../lib/voice"

const DEV_EMAIL = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

function fail(message: string): never {
  console.error(`  FAIL ${message}`)
  process.exit(1)
}

function ok(message: string) {
  console.log(`  ok   ${message}`)
}

/**
 * Two pages of three tweets, then the end — and cursor-aware, because
 * plan 013 gives importXCorpus two cursors and the stub has to answer both
 * the way X would: nothing new ahead of the newest stored post, nothing left
 * behind the oldest one.
 */
function stubTimeline(): typeof fetch {
  const pages: Record<string, unknown>[] = [
    {
      data: [
        { id: "9003", text: "Shipped the thing. Deleted 400 lines doing it.", created_at: "2026-08-01T08:00:00Z", public_metrics: { like_count: 12 } },
        { id: "9002", text: "Hot take: your roadmap is a wishlist with dates.", created_at: "2026-07-28T08:00:00Z", public_metrics: { like_count: 40 } },
        { id: "9001", text: "Deleted 400 lines today. Best commit of the month.", created_at: "2026-07-20T08:00:00Z", public_metrics: { like_count: 7 } },
      ],
      meta: { next_token: "page2" },
    },
    {
      data: [
        { id: "9000", text: "Small tools, sharp edges.", created_at: "2026-07-01T08:00:00Z", public_metrics: { like_count: 3 } },
      ],
      meta: {},
    },
  ]
  let call = 0
  return (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (!url.includes("/tweets")) throw new Error(`unexpected fetch: ${url}`)
    // A re-run (since_id pinned to the newest stored post) or a backfill pass
    // that has reached the oldest stored post: both mean "nothing more
    // here", the way X itself would answer.
    if (url.includes("since_id=9003") || url.includes("until_id=9000")) {
      return new Response(JSON.stringify({ data: [], meta: {} }), { status: 200 })
    }
    const page = pages[Math.min(call, pages.length - 1)]
    call += 1
    return new Response(JSON.stringify(page), { status: 200 })
  }) as typeof fetch
}

const stubExtractor = async (
  posts: { url: string; postedAt: Date | null; body: string }[]
): Promise<VoiceExtraction> => ({
  portrait: "Short declaratives. Ships first, opines second.",
  rules: ["Open with the outcome.", "Never use hashtags."],
  stories: [
    {
      title: "Deleting code as progress",
      point: "Less code is the win condition.",
      hook: "Deleted 400 lines today.",
      quotes: ["Best commit of the month."],
      // One real URL and one invented — the compile must keep only the first.
      proofUrls: [posts[0]?.url ?? "", "https://x.com/nobody/status/1"],
      theme: "craft",
    },
  ],
})

async function cleanup(userId: string) {
  await db.delete(sourceItem).where(eq(sourceItem.userId, userId))
  const pages = await db
    .select({ id: brainPage.id })
    .from(brainPage)
    .where(
      and(
        eq(brainPage.userId, userId),
        inArray(brainPage.slug, ["voice/x", "story/x-deleting-code-as-progress"])
      )
    )
  for (const page of pages) {
    await db.delete(brainEvent).where(eq(brainEvent.pageId, page.id))
    await db.delete(brainPageVersion).where(eq(brainPageVersion.pageId, page.id))
    await db.delete(brainPage).where(eq(brainPage.id, page.id))
  }
  await db
    .delete(usageEvent)
    .where(and(eq(usageEvent.userId, userId), eq(usageEvent.model, "x:read")))
}

/**
 * Plan 012's cooldown claim runs a real `UPDATE channel_connection ... WHERE
 * id = access.connection.id`, so the stub `getToken` needs a row that
 * actually exists, not just the two fields (`externalId`, `handle`) the
 * import logic reads.
 *
 * Reuses whatever "x" connection already belongs to the dev user — including
 * a live one from scripts/corpus-x-live.ts — rather than inserting a second
 * row, which the unique index on (user, channel) would refuse anyway. Only
 * `last_import_at` is ever touched here, and it is restored afterward, so a
 * live connection used for real X reads is left exactly as it was found.
 */
async function ensureStubConnection(
  userId: string
): Promise<{ id: string; createdHere: boolean; previousLastImportAt: Date | null }> {
  const [existing] = await db
    .select({ id: channelConnection.id, lastImportAt: channelConnection.lastImportAt })
    .from(channelConnection)
    .where(and(eq(channelConnection.userId, userId), eq(channelConnection.channel, "x")))
    .limit(1)

  if (existing) {
    return { id: existing.id, createdHere: false, previousLastImportAt: existing.lastImportAt }
  }

  const [row] = await db
    .insert(channelConnection)
    .values({
      id: `cc_verify${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
      userId,
      channel: "x",
      externalId: "42",
      // Production stores the handle with its leading @ (lib/channels.ts
      // stores `@${data.username}`) — matching that shape here is what
      // exercises importXCorpus's @-stripping path the way real data does.
      handle: "@devhagen",
      // Never decrypted — the stub getToken below supplies its own
      // accessToken directly. This column exists only to satisfy NOT NULL.
      accessToken: "verify-script-placeholder",
    })
    .returning({ id: channelConnection.id })
  return { id: row.id, createdHere: true, previousLastImportAt: null }
}

async function main() {
  const [dev] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, DEV_EMAIL))
    .limit(1)
  if (!dev) fail(`no user ${DEV_EMAIL} — run scripts/dev-account.ts first`)
  const userId = dev.id

  await cleanup(userId)

  const stub = await ensureStubConnection(userId)

  // A stub token result so the run needs no live X connection. `id` is what
  // the cooldown claim updates; `externalId`/`handle` are what importXCorpus
  // itself reads.
  const stubGetToken = (async () => ({
    ok: true,
    accessToken: "stub",
    connection: { id: stub.id, externalId: "42", handle: "@devhagen" },
  })) as unknown as typeof getAccessToken

  try {
    const first = await importXCorpus({
      userId,
      maxPosts: 10,
      deps: { fetch: stubTimeline(), getToken: stubGetToken },
    })
    if (!first.ok) fail(`first import refused: ${JSON.stringify(first)}`)
    if (first.imported !== 4) fail(`imported ${first.imported}, wanted 4`)
    if (first.postsRead !== 4) fail(`read ${first.postsRead}, wanted 4`)
    ok(`imported ${first.imported} posts across two pages`)

    // Release the cooldown claim before the second run: plan 012's guard is
    // right to refuse two imports inside the window for a real user pressing
    // twice, but this script is testing a different thing — that a re-run's
    // cursor makes the read itself free, not just deduplicated at insert.
    await db
      .update(channelConnection)
      .set({ lastImportAt: null })
      .where(eq(channelConnection.id, stub.id))

    const second = await importXCorpus({
      userId,
      maxPosts: 10,
      deps: { fetch: stubTimeline(), getToken: stubGetToken },
    })
    if (!second.ok) fail(`second import refused: ${JSON.stringify(second)}`)
    if (second.imported !== 0) {
      fail(`re-run imported ${second.imported} rows — the unique key is not holding`)
    }
    if (second.postsRead !== 0) {
      fail(`re-run read ${second.postsRead} posts — the cursor is not resuming for free`)
    }
    ok("re-run read nothing and stored nothing new")

    const meter = await db
      .select()
      .from(usageEvent)
      .where(and(eq(usageEvent.userId, userId), eq(usageEvent.model, "x:read")))
      .orderBy(desc(usageEvent.createdAt))
    if (meter.length !== 1) {
      fail(`${meter.length} x:read usage_event row(s), wanted 1 — the free re-run still charged`)
    }
    if (meter[0].costMicros !== 4 * X_READ_COST_MICROS) {
      fail(`first run cost ${meter[0].costMicros}µ$, wanted ${4 * X_READ_COST_MICROS}`)
    }
    ok(`metered exactly one run, at ${meter[0].costMicros}µ$`)

    const compiled = await compileVoice({ userId, extract: stubExtractor })
    if (compiled.rulesWritten !== 2) fail(`wrote ${compiled.rulesWritten} rules, wanted 2`)
    if (compiled.storiesWritten !== 1) fail(`wrote ${compiled.storiesWritten} stories, wanted 1`)

    const [voicePage] = await db
      .select()
      .from(brainPage)
      .where(and(eq(brainPage.userId, userId), eq(brainPage.slug, "voice/x")))
    if (!voicePage) fail("voice/x page missing")
    if (voicePage.provenance !== "published") {
      fail(`voice/x provenance is ${voicePage.provenance}, wanted published`)
    }
    ok("voice/x written with provenance published")

    const [storyPage] = await db
      .select()
      .from(brainPage)
      .where(
        and(
          eq(brainPage.userId, userId),
          like(brainPage.slug, "story/x-deleting%")
        )
      )
    if (!storyPage) fail("story page missing")
    const proof = (storyPage.data as { proof?: string[] }).proof ?? []
    if (proof.some((url) => url.includes("nobody"))) {
      fail("an invented proof URL survived the filter")
    }
    if (proof.length !== 1) fail(`proof has ${proof.length} URLs, wanted 1`)
    ok("story written; invented proof URL filtered")

    // The ownership rule: a user-owned voice page is never overwritten.
    await db
      .update(brainPage)
      .set({ provenance: "user" })
      .where(eq(brainPage.id, voicePage.id))
    const again = await compileVoice({ userId, extract: stubExtractor })
    if (!again.skipped.includes("voice/x")) {
      fail("user-owned voice/x was not skipped")
    }
    const [afterPage] = await db
      .select()
      .from(brainPage)
      .where(eq(brainPage.id, voicePage.id))
    if (afterPage.provenance !== "user") fail("user-owned page was overwritten")
    ok("user-owned page left alone, finding parked as an event")
  } finally {
    // Undo the connection-level side effect regardless of how the run above
    // went: delete the throwaway row, or put a pre-existing (possibly live)
    // connection's cooldown state back exactly as found.
    if (stub.createdHere) {
      await db.delete(channelConnection).where(eq(channelConnection.id, stub.id))
    } else {
      await db
        .update(channelConnection)
        .set({ lastImportAt: stub.previousLastImportAt })
        .where(eq(channelConnection.id, stub.id))
    }
  }

  await cleanup(userId)
  ok("cleaned up")

  // The live run (real X read, real model call) is deliberately not here —
  // it is staged in scripts/corpus-x-live.ts as import → show → compile, so
  // the spend and the judgment happen one step at a time.

  console.log("\nDone.")
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
