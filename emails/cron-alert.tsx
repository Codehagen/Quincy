import { Heading, Text } from "@react-email/components"

import { Shell } from "./shell"

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
      <Heading
        as="h1"
        className="text-ink mt-[24px] mb-0 text-[28px] leading-[1.2]"
      >
        {unconfigured
          ? `The ${job} cron cannot run.`
          : `The ${job} cron is failing.`}
      </Heading>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        {unconfigured
          ? `It refused to run because CRON_SECRET is not set, and it will refuse every time it is called until that changes.`
          : `Its last run finished with failures.`}
      </Text>

      <Text className="text-ink mt-[12px] text-[16px] leading-[1.55]">
        {consequence}
      </Text>

      <Text className="mt-[12px] text-[14px] leading-[1.55] text-muted">
        {unconfigured
          ? "Set CRON_SECRET in the deployment's environment."
          : "The counts are in the run's own response and in the deployment logs for this job."}{" "}
        This message is sent at most once an hour per job.
      </Text>
    </Shell>
  )
}

export default CronAlertEmail
