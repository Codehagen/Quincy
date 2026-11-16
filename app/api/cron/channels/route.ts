import { runChannelMaintenance } from "@/lib/channels-maintenance"
import { alertCronFailure } from "@/lib/cron-alert"
import { refreshPostMetrics } from "@/lib/post-metrics"
import { refreshWhatWorked } from "@/lib/what-worked"

/**
 * The daily channel sweep, the daily reading of what posts did, and the daily
 * writing of why.
 *
 * Thin on purpose, like the heartbeat route beside it: the judgment is in
 * lib/channels-maintenance.ts, lib/post-metrics.ts and lib/what-worked.ts, and
 * this is the part that decides whether the caller is allowed to ask.
 *
 * Three jobs in one route because each depends on the one before it: the sweep
 * refreshes stale X tokens and marks the dead ones, the metrics refresh then
 * spends money through those exact tokens, and the reading is derived from the
 * rows that refresh just wrote. Running them apart would mean buying a page
 * with a token the other job already knew was finished, and deriving today's
 * finding from yesterday's numbers.
 *
 * 06:00 UTC rather than the small hours: this sends mail, and a reconnect
 * notice that lands at 03:00 is one that gets buried under the morning's
 * inbox. It is early enough in a European day to be the first thing read and
 * late enough not to arrive in the middle of the night.
 */

// Two HTTP requests per connection, sequentially — the liveness probe and,
// for X, one page of numbers. No model calls, so this is headroom rather than
// a real expectation — but the default would truncate the run silently once
// there are enough rows, and a half-finished sweep reports success. All three
// jobs carry their own per-run cap for the same reason; the timeout is the
// backstop, not the bound. The third spends nothing and makes no network call
// beyond the database, so it adds queries to this budget and no dollars.
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

  /**
   * And after the metrics, never before: this reads the rows the refresh just
   * wrote. See plans/028 item 2b — the loop from "this post did well" back to
   * the next draft, closed by writing a brain page that every prompt already
   * receives through `renderBrainForUser`.
   *
   * It spends nothing. No model call, no platform call, three queries a user
   * and usually no write at all — the usual answer is that the evidence does
   * not support a page. So it needs neither a ceiling nor a cooldown, which is
   * the one time AGENTS.md's "Money" rule does not apply, and it is why this
   * runs unconditionally rather than behind the metrics half's success.
   */
  const worked = await refreshWhatWorked()

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

  // The reading is held to the same lower bar as the metrics, and for the same
  // reason: one user's finding failing is a day of staleness on a page that
  // changes weekly at most, and alerting on it would train whoever reads these
  // to ignore the alert that matters. Every user throwing is an outage.
  const workedDead = worked.users > 0 && worked.failed === worked.users

  const degraded = run.failed > 0 || run.truncated || metricsDead || workedDead

  // Reported, not just returned. A 500 reaches whoever is watching the
  // scheduler; nobody is watching the scheduler.
  if (degraded) await alertCronFailure({ job: "channels", failure: "degraded" })

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, ...run, metrics, worked },
    { status: degraded ? 500 : 200 }
  )
}
