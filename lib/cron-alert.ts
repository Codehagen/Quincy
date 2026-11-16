import { deliver, MAIL_REPLY_TO } from "./mail"
import { CronAlertEmail } from "@/emails/cron-alert"

/**
 * Telling the operator when scheduled work stops working.
 *
 * Everything in this product that happens without a person present happens on
 * a cron: the sweep that publishes, the dispatcher that runs rhythms, the
 * liveness check that keeps channel grants honest, and the weekly heartbeat.
 * All four already answer 500 when a run goes badly and 503 when `CRON_SECRET`
 * is unset — and until now nothing read those answers.
 *
 * The failure that motivated it is the quiet one. Without `CRON_SECRET` the
 * publish route refuses to run, the scheduler records a response, and posts sit
 * in `queued` until `CATCH_UP_MS` passes and they are marked missed. Missed is
 * terminal: those posts are not late, they are gone, and the user's first
 * signal is writing that never appeared. There is no monitoring dependency in
 * this repo and adding one for four endpoints is more machinery than the
 * problem needs, so the alert is an email — the same channel a revoked channel
 * grant already uses.
 *
 * **At most one message per job per hour.** The publish sweep runs every five
 * minutes, so an outage that alerted on every run would send 288 emails a day
 * and train its reader to filter them. `deliver`'s idempotency key does the
 * bounding, which is why the payload below carries no counts and no timestamp:
 * Resend returns the original result for a repeat of the same key *and* the
 * same payload, but answers 409 to the same key with a different one. A body
 * that said "3 posts affected" would change between runs and defeat the very
 * mechanism it was travelling through. The mail's job is "go and look"; the
 * numbers are in the response and the logs.
 */

/** The four jobs in vercel.json, named as their route path calls them. */
export type CronJob = "publish" | "rhythms" | "channels" | "heartbeat"

/**
 * Why the run is being reported, kept coarse on purpose.
 *
 * Part of the idempotency key, so each value is a separate hourly bucket — a
 * job that starts failing for a second reason still gets through rather than
 * being deduplicated against the first. Coarse because a finer split would put
 * varying detail into the key, which is the same defeat as putting it in the
 * body.
 */
export type CronFailure = "unconfigured" | "degraded"

const CONSEQUENCE: Record<CronJob, string> = {
  publish:
    "Approved posts are not going out. A post more than two hours past its slot is marked missed rather than sent late, and missed is final.",
  rhythms:
    "The work Quincy does on its own schedule is not running. Nothing is lost, but nothing is being drafted either.",
  channels:
    "Channel connections are not being checked, so a revoked X or LinkedIn grant will be found by a failed publish instead of by an email.",
  heartbeat:
    "The brain is not being maintained. Nothing breaks today; it stops learning.",
}

/**
 * Where operator mail goes.
 *
 * `MAIL_REPLY_TO` is the fallback rather than a second hardcoded address: it is
 * already defined as the mailbox a human actually reads, which is exactly the
 * property this needs.
 */
function operator(): string {
  return process.env.OPS_EMAIL ?? MAIL_REPLY_TO
}

/**
 * The hour this alert belongs to, in UTC.
 *
 * UTC rather than a local zone because there is no user here to have one, and
 * a bucket that shifted with the server's zone would silently double up across
 * a DST boundary.
 */
function hourBucket(now: Date): string {
  return now.toISOString().slice(0, 13)
}

/**
 * Report that a scheduled job could not do its work.
 *
 * Never throws and never blocks the response: a cron route's job is to run the
 * sweep and report, and an alert that failed to send must not turn a degraded
 * run into a thrown one. Returns nothing, because there is no caller who could
 * do anything useful with the outcome.
 */
export async function alertCronFailure({
  job,
  failure,
  now = new Date(),
}: {
  job: CronJob
  failure: CronFailure
  now?: Date
}): Promise<void> {
  try {
    const result = await deliver({
      to: operator(),
      subject:
        failure === "unconfigured"
          ? `Quincy: the ${job} cron cannot run`
          : `Quincy: the ${job} cron is failing`,
      react: CronAlertEmail({
        job,
        failure,
        consequence: CONSEQUENCE[job],
      }),
      text: [
        failure === "unconfigured"
          ? `The ${job} cron refused to run because CRON_SECRET is not set.`
          : `The ${job} cron finished with failures.`,
        "",
        CONSEQUENCE[job],
        "",
        failure === "unconfigured"
          ? "Set CRON_SECRET in the deployment's environment. Until it is set, this job does nothing every time it is called."
          : "The run's own response carries the counts. Check the deployment logs for this job.",
      ].join("\n"),
      idempotencyKey: `cron-alert/${job}/${failure}/${hourBucket(now)}`,
    })

    // A refusal is worth a line — `not-configured` here means no
    // RESEND_API_KEY, which is its own silent failure and the exact thing
    // instrumentation.ts reports at boot.
    if (!result.ok && result.reason !== "skipped") {
      console.error(`[cron-alert] ${job}: ${result.message}`)
    }
  } catch (cause) {
    console.error(`[cron-alert] ${job}: could not send the alert:`, cause)
  }
}
