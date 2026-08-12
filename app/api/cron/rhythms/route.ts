import { countStuck, runDueRhythms } from "@/lib/rhythm-run"

/**
 * The sweep that runs rhythms. Scheduled in vercel.json every fifteen minutes.
 *
 * Thin on purpose, like the three routes beside it: the judgment is in
 * lib/rhythm-run.ts, and this is the part that decides whether the caller is
 * allowed to ask. That matters here for the same reason it does for
 * /api/cron/publish — an unauthenticated caller who could reach this would be
 * able to spend other people's money on model calls, repeatedly.
 *
 * **Fifteen minutes, not five and not hourly.** The number is a promise about
 * how late a rhythm can be through nobody's fault. Nothing here is
 * time-critical the way a scheduled post is — a briefing eight minutes late is
 * the same briefing — so it does not earn the publish sweep's cadence, and an
 * hourly tick would make "09:00" mean somewhere in the hour. Fifteen also
 * leaves `MAX_LATENESS_MS` (six hours) twenty-four chances to catch a
 * subscription before its window closes.
 */

// Each row is an X read plus one or more model calls, sequentially. The default
// 10s would truncate the sweep mid-handler; lib/rhythm-run.ts's own time budget
// stops 45 seconds short of this so it can report truncation and release its
// claims rather than being killed holding one.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    return Response.json(
      { error: "CRON_SECRET is not set. Refusing to run unauthenticated." },
      { status: 503 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 404 rather than 401, matching the routes beside it: an unauthenticated
    // caller should not learn that this path exists.
    return new Response("Not found", { status: 404 })
  }

  const started = Date.now()
  const run = await runDueRhythms()

  /**
   * Claims nothing will release, counted on every run.
   *
   * A subscription can only get stuck if a dispatcher died between taking the
   * claim and its `finally` — which should be impossible and is exactly why it
   * is worth counting. Reported without making the run degraded: a row stuck
   * since last week is not this run failing, and `STALE_CLAIM_MS` means it
   * frees itself within fifteen minutes anyway.
   */
  const stuck = await countStuck()

  /**
   * A run that threw, truncated, or let a window close is not a success, and
   * cron monitoring can only see the status code.
   *
   * `missed` counts because it is the failure this job exists to prevent — a
   * rhythm nobody ran is the outcome that has to reach somebody, and a 200
   * would bury it. `skipped` does not: an unentitled account being passed over
   * is this route working exactly as intended.
   */
  const degraded = run.failed > 0 || run.truncated || run.outcomes.missed > 0

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, stuck, ...run },
    { status: degraded ? 500 : 200 }
  )
}
