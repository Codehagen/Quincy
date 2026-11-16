import { countUnresolved, runScheduledPublish } from "@/lib/publish-run"
import { alertCronFailure } from "@/lib/cron-alert"

/**
 * The sweep that sends. Scheduled in vercel.json every five minutes.
 *
 * Thin on purpose, like the two routes beside it: the judgment is in
 * lib/publish-run.ts, and this is the part that decides whether the caller is
 * allowed to ask. That separation matters more here than for the other two,
 * because an unauthenticated caller who could reach this one would be able to
 * make other people's writing go out early.
 *
 * **Five minutes, not one and not an hour.** The number is a promise about how
 * late a post can be through no fault of anyone's, and it is read against
 * CATCH_UP_MS in lib/publish-run.ts: at five minutes the sweep has twenty-four
 * chances inside a two-hour window, so a post needs an outage lasting most of
 * that window before it misses. An hourly cron would spend a third of the
 * window on a single missed run, and a per-minute cron would buy four minutes
 * of precision for five times the invocations on a queue that is empty almost
 * every time it is asked.
 */

// Sequential, and each row is an OAuth call plus a publish call, each bounded
// by PLATFORM_TIMEOUT_MS. The default would truncate the sweep mid-row, and a
// truncated run here is not deferred work — it is posts that run out of time.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    // The silent one. The scheduler gets a response, records it, and moves on;
    // nothing else in the system ever mentions that this job did nothing.
    await alertCronFailure({ job: "publish", failure: "unconfigured" })

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
  const run = await runScheduledPublish()

  /**
   * Rows nobody can resolve automatically, counted on every run.
   *
   * `sending` is a state only a human leaves — see `claim` in
   * lib/publish-run.ts — so without surfacing it here it would be visible
   * only to whoever happens to open /lineup. It is reported but does not make
   * the run degraded: a stuck row from last week is not this run failing.
   */
  const unresolved = await countUnresolved()

  /**
   * A run that threw, truncated, or let a window close is not a success, and
   * cron monitoring can only see the status code. `missed` counts because it
   * is the failure this job exists to prevent — a post nobody sent is exactly
   * the outcome that has to reach somebody, and a 200 would bury it.
   *
   * `failed` and `unsupported` are not degraded. A platform refusing a post is
   * this route working: the refusal was recorded and the user can read it.
   *
   * `deferred` counts for the same reason `truncated` does, and says something
   * `truncated` cannot: the sweep ran out of clock rather than out of cap. Work
   * it declined to start is still due, so the run did not finish its job.
   */
  const degraded =
    run.failed > 0 ||
    run.truncated ||
    run.deferred > 0 ||
    run.outcomes.missed > 0

  // Reported, not just returned. A 500 reaches whoever is watching the
  // scheduler; nobody is watching the scheduler.
  if (degraded) await alertCronFailure({ job: "publish", failure: "degraded" })

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, unresolved, ...run },
    { status: degraded ? 500 : 200 }
  )
}
