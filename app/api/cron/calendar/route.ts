import { alertCronFailure } from "@/lib/cron-alert"
import { LIVE_CALENDAR_DEPS, readCalendars } from "@/lib/calendar"

/**
 * The hourly calendar read.
 *
 * Thin on purpose, like the three routes beside it: the judgment is in
 * lib/calendar.ts and this is the part that decides whether the caller is
 * allowed to ask.
 *
 * Hourly because the window is an hour. A meeting that ended at 14:50 is asked
 * about at 15:00, while the person can still remember what was said in it —
 * and a job that ran daily would ask about Tuesday morning on Wednesday, which
 * is a question nobody answers well.
 *
 * It costs no money. One token refresh and one page of at most fifty events
 * per connected user, both free at Google, both metered at zero so /credits can
 * still say the quota was spent.
 */

// One token refresh and one page per connection, sequentially. No model calls,
// so this is headroom rather than an expectation — but the default would
// truncate the run silently once there are enough rows, and a half-finished
// sweep reports success. The per-run cap is the bound; this is the backstop.
export const maxDuration = 300

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET

  if (!secret) {
    // The silent one. The scheduler gets a response, records it, and moves on;
    // nothing else in the system ever mentions that this job did nothing.
    await alertCronFailure({ job: "calendar", failure: "unconfigured" })

    return Response.json(
      { error: "CRON_SECRET is not set. Refusing to run unauthenticated." },
      { status: 503 }
    )
  }

  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    // 404 rather than 401, matching the other three: an unauthenticated caller
    // should not learn that this path exists.
    return new Response("Not found", { status: 404 })
  }

  const started = Date.now()
  const run = await readCalendars({ deps: LIVE_CALENDAR_DEPS })

  /**
   * A run where rows threw, or where the batch was cut short, is not a success
   * — and cron monitoring can only see the status code.
   *
   * `unavailable` is deliberately *not* degraded. A withdrawn grant is a fact
   * about one person's Google account, the row already says so on /sources, and
   * alerting on it would train whoever reads these to ignore the alert that
   * matters. `cooldown` is not degraded either: it is the guard working.
   */
  const degraded = run.failed > 0 || run.truncated

  // Reported, not just returned. A 500 reaches whoever is watching the
  // scheduler; nobody is watching the scheduler.
  if (degraded) await alertCronFailure({ job: "calendar", failure: "degraded" })

  return Response.json(
    { ok: !degraded, ms: Date.now() - started, ...run },
    { status: degraded ? 500 : 200 }
  )
}
