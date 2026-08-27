import { runChannelMaintenance } from "@/lib/channels-maintenance"
import { alertCronFailure } from "@/lib/cron-alert"
import { refreshPostMetrics } from "@/lib/post-metrics"

/**
 * The daily channel sweep, and the daily reading of what posts did.
 *
 * Thin on purpose, like the heartbeat route beside it: the judgment is in
 * lib/channels-maintenance.ts and lib/post-metrics.ts, and this is the part
 * that decides whether the caller is allowed to ask.
 *
 * Two jobs in one route because the second depends on the first: the sweep
 * refreshes stale X tokens and marks the dead ones, and the metrics refresh
 * then spends money through those exact tokens. Running them apart would mean
 * buying a page with a token the other job already knew was finished.
 *
 * 06:00 UTC rather than the small hours: this sends mail, and a reconnect
 * notice that lands at 03:00 is one that gets buried under the morning's
 * inbox. It is early enough in a European day to be the first thing read and
 * late enough not to arrive in the middle of the night.
 */

// Two HTTP requests per connection, sequentially — the liveness probe and,
// for X, one page of numbers. No model calls, so this is headroom rather than
// a real expectation — but the default would truncate the run silently once
// there are enough rows, and a half-finished sweep reports success. Both jobs
// carry their own per-run cap for the same reason; the timeout is the backstop,
// not the bound.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    // The silent one. The scheduler gets a response, records it, and moves on;
    // nothing else in the system ever mentions that this job did nothing.
    await alertCronFailure({ job: "channels", failure: "unconfigured" })

    return Response.json(
      { error: "CRON_SECRET is not set. Refusing to run unauthenticated." },
      { status: 503 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 404 rather than 401, matching /api/cron/heartbeat: an unauthenticated
    // caller should not learn that this path exists.
    return new Response("Not found", { status: 404 })
  }

  const started = Date.now()
  const run = await runChannelMaintenance()

  // After the sweep, and never before it: the tokens this spends money through
  // are the ones the sweep just refreshed.
  const metrics = await refreshPostMetrics()

  // A run where rows threw, or where the batch was cut short, is not a
  // success — and cron monitoring can only see the status code. Returning 200
  // for a sweep that checked nobody is how this job dies quietly and stays
  // dead: the one thing it exists to notice is a revoked grant, and a silent
  // failure means nobody notices that nobody is noticing.
  //
  // The metrics half is held to a lower bar on purpose. One user's numbers
  // failing is a missing day in a series, not a person still being published
  // as after they withdrew consent — and alerting on it would train whoever
  // reads these to ignore the alert that matters. Only a metrics pass that
  // tried and got nothing at all counts as degraded, because that is an
  // outage rather than a bad row.
  const metricsDead =
    metrics.due > 0 && metrics.refreshed === 0 && metrics.failed > 0

  const degraded = run.failed > 0 || run.truncated || metricsDead

  // Reported, not just returned. A 500 reaches whoever is watching the
  // scheduler; nobody is watching the scheduler.
  if (degraded) await alertCronFailure({ job: "channels", failure: "degraded" })

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, ...run, metrics },
    { status: degraded ? 500 : 200 }
  )
}
