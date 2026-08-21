import Link from "next/link"

import { isGoogleEnabled } from "@/lib/auth"
import { constructMetadata } from "@/lib/metadata"
import { findRedeemableInvite } from "@/lib/waitlist"
import { Button } from "@/components/ui/button"
import { SignupForm } from "@/components/auth/signup-form"

export const metadata = constructMetadata({
  title: "Sign up",
})

/**
 * Signup, closed. See plans/023.
 *
 * **This page is not the gate.** `databaseHooks.user.create.before` in
 * lib/auth.ts is, because anyone can POST to `/api/auth/sign-up/email` without
 * ever loading this file. What this page does is stop a stranger filling in
 * three fields to be told no — which is the difference between a closed door
 * and a door that wastes your time first.
 *
 * The code is read from the query string because that is where the invite mail
 * puts it. It is not a secret in the security sense: the hook keys on the
 * address, not on this. It is what makes the link unguessable and lets the
 * address be prefilled and locked, so an invited person cannot accidentally
 * sign up with a different one and hit a FORBIDDEN they cannot explain.
 *
 * `searchParams` is a per-request read, and the Suspense boundary it needs
 * under `cacheComponents` is in `app/(auth)/layout.tsx`.
 */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string }>
}) {
  const { invite } = await searchParams
  const row = invite ? await findRedeemableInvite(invite) : null

  if (!row) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-section">Quincy is invite-only</h1>
          {/* Says which of the three it is — no code, a spent one, an expired
              one — without saying which, because that is a small oracle and the
              recovery is identical in all three: ask for an invite. */}
          <p className="text-body text-pretty text-muted-foreground">
            This link is not one we can open. Either it has been used, it has
            run out, or there was no invite on it. Join the waitlist and the
            next one comes with a fresh link.
          </p>
        </div>

        <Button nativeButton={false} render={<Link href="/#join" />}>
          Join the waitlist
        </Button>

        <p className="text-center text-caption text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/login"
            className="rounded-sm text-foreground underline underline-offset-4 ring-ring outline-hidden focus-visible:ring-2"
          >
            Log in
          </Link>
        </p>
      </div>
    )
  }

  // Read on the server so an unconfigured Google button is never rendered at
  // all, rather than rendered and failing on click.
  return <SignupForm googleEnabled={isGoogleEnabled} invitedEmail={row.email} />
}
