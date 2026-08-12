import { runHeartbeatForEveryone } from "@/lib/heartbeat"

/**
 * Heartbeat, the brain's maintenance loop. Scheduled in vercel.json.
 *
 * A cron job rather than a durable workflow, because the durability a workflow
 * would provide is already in the schema: events are append-only and the
 * watermark is written last, so an interrupted run repeats itself harmlessly.
 * See docs/brain.md.
 */

// Compaction makes one model call per user with a backlog. The default 10s is
// not enough the first time someone has a week of captures waiting.
export const maxDuration = 300

export async function GET(request: Request) {
  // Vercel Cron sends this header; nothing else does. Without the check the
  // route is a public endpoint that rewrites everyone's memory on request.
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set. Refusing to run unauthenticated." },
      { status: 503 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 404 rather than 401: an unauthenticated caller should not learn that
    // this path exists.
    return new Response("Not found", { status: 404 })
  }

  const started = Date.now()
  const { results, unentitled } = await runHeartbeatForEveryone()

  return Response.json({
    ok: true,
    ms: Date.now() - started,
    users: results.length,
    captures: results.reduce((n, r) => n + r.captures, 0),
    facts: results.reduce((n, r) => n + r.factsWritten, 0),
    skipped: results.flatMap((r) => r.skipped),
    // Reported separately from `skipped`, which counts pages. This counts
    // people, and it is the number that says how much the cron is no longer
    // spending on accounts that stopped paying.
    unentitled: unentitled.length,
  })
}
