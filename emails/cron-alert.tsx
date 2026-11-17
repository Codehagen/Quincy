import { Footer, Note, Para, Shell, Title } from "./shell"

interface CronAlertProps {
  /** The job as its route path names it: publish, rhythms, channels, heartbeat. */
  job: string
  failure: "unconfigured" | "degraded"
  /** What stops happening while this job is down, in one sentence. */
  consequence: string
}

/**
 * The one email in this product whose reader is the operator.
 *
 * Every other template is written to a customer and works hard not to sound
 * like an incident report — `reconnect-channel.tsx` says so in as many words.
 * This one is the opposite and should read like an alert: somebody is being
 * interrupted, and the only thing they need is what broke, what it costs, and
 * what to do next. No greeting, no reassurance, no button to a marketing page.
 *
 * It deliberately carries no counts and no timestamp. The alert is bounded to
 * one message per job per hour by an idempotency key, and Resend only dedupes
 * a repeat whose payload is also identical — so a number that changed between
 * runs would turn the hourly bound back into one email every five minutes.
 * See lib/cron-alert.ts.
 */
export function CronAlertEmail({ job, failure, consequence }: CronAlertProps) {
  const unconfigured = failure === "unconfigured"

  return (
    <Shell
      title={`The ${job} cron ${unconfigured ? "cannot run" : "is failing"}`}
      preview={consequence}
    >
      <Title>
        {unconfigured
          ? `The ${job} cron cannot run.`
          : `The ${job} cron is failing.`}
      </Title>

      <Para>
        {unconfigured
          ? "It refused to run because CRON_SECRET is not set, and it will refuse every time it is called until that changes."
          : "Its last run finished with failures."}
      </Para>

      <Para>{consequence}</Para>

      <Note>
        {unconfigured
          ? "Set CRON_SECRET in the deployment’s environment."
          : "The counts are in the run’s own response and in the deployment logs for this job."}
      </Note>

      <Footer>This message is sent at most once an hour per job.</Footer>
    </Shell>
  )
}

export default CronAlertEmail
