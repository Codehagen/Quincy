import type { Entitlement } from "@/lib/entitlement"
import { Text } from "@/components/kit"
import { BillingBannerAction } from "@/components/billing/billing-banner-action"

/**
 * The read-only notice.
 *
 * It is a bar above the app rather than a redirect to the paywall, and that is
 * the whole posture: a locked door hides the thing that makes someone pay.
 * They keep their brain, their conversations and their drafts on screen —
 * what they have lost is Quincy writing, and this says so.
 *
 * Not dismissible. A dismissible banner is a banner that gets dismissed once
 * and never seen again, which would leave someone wondering why the agent has
 * gone quiet with nothing on screen to explain it.
 *
 * Kit since 2026-11-16: the well grey under a hairline, ink words, and the
 * ink pill for the one way out. It renders inside the AppShell's KitRoot, so
 * it is the same on a page that has moved to the kit and one that has not.
 *
 * It is the first thing in the content column. While the desktop sidebar is
 * hidden, the shell's Show control sits in that corner and publishes
 * `--kit-shell-inset`, so the words start past it (docs/design/app-shell.md).
 */
export function BillingBanner({ entitlement }: { entitlement: Entitlement }) {
  if (entitlement.state === "trialing" || entitlement.state === "active") {
    return null
  }

  const lapsed = entitlement.state === "lapsed"
  // past_due / unpaid: the subscription is still open, and the way back is the
  // portal (fix the card), never a second Checkout.
  const recoverable = entitlement.state === "lapsed" && entitlement.recoverable === true

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-kit-group gap-y-kit-related border-b border-kit-hairline bg-kit-well py-kit-related pr-kit-page-gutter pl-[max(var(--spacing-kit-page-gutter),var(--kit-shell-inset,0px))]"
    >
      <Text variant="small" tone="muted">
        <span className="font-kit-strong text-kit-ink">
          {lapsed ? "Payment needed." : "Your free day is over."}
        </span>{" "}
        {recoverable
          ? "A payment did not go through, so Quincy has stopped writing. Update your card to switch it back on."
          : lapsed
          ? "Your subscription is no longer active, so Quincy has stopped writing."
          : "Everything you made is still here. Quincy has just stopped writing."}
      </Text>

      {/* Not on /settings/billing itself, which has its own (see there). */}
      <BillingBannerAction recoverable={recoverable} />
    </div>
  )
}
