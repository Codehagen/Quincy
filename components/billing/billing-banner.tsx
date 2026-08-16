import Link from "next/link"

import type { Entitlement } from "@/lib/entitlement"
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"

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
 */
export function BillingBanner({ entitlement }: { entitlement: Entitlement }) {
  if (entitlement.state === "trialing" || entitlement.state === "active") {
    return null
  }

  const lapsed = entitlement.state === "lapsed"

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b bg-muted/60 px-4 py-2"
    >
      <p className="text-caption text-pretty text-muted-foreground">
        <span className="font-medium text-foreground">
          {lapsed ? "Payment needed." : "Your free day is over."}
        </span>{" "}
        {lapsed
          ? "Your subscription is no longer active, so Quincy has stopped writing."
          : "Everything you made is still here — Quincy has just stopped writing."}
      </p>

      <Link
        href="/settings/billing"
        className={cn(buttonVariants({ size: "sm" }), "shrink-0")}
      >
        {lapsed ? "Fix billing" : "Subscribe"}
      </Link>
    </div>
  )
}
