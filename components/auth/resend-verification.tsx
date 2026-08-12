"use client"

import * as React from "react"
import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { authClient } from "@/lib/auth-client"
import { EMAIL_VERIFICATION_LIFETIME_LABEL } from "@/lib/auth-constants"
import { Button } from "@/components/ui/button"

/**
 * The way back in for someone whose verification link never arrived, expired,
 * or was opened on a device that no longer has the tab.
 *
 * Without this the account is simply gone: `sendOnSignIn` is deliberately unset
 * (it would let anyone with an address mail-bomb its owner by replaying the
 * login form), so nothing re-sends the link on its own.
 *
 * Better Auth's `/send-verification-email` answers `{ status: true }` for an
 * unknown address and for an already-verified one, behind a 500ms constant-time
 * floor, so confirming the send here cannot turn the page into an oracle for
 * who has an account. That is why there is no "no such account" branch below —
 * there is no such response to branch on.
 */
export function ResendVerification({
  email,
  callbackURL,
}: {
  email: string
  callbackURL: string
}) {
  const [isSending, setIsSending] = React.useState(false)
  const [hasSent, setHasSent] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  async function onResend() {
    if (isSending) {
      return
    }

    setError(null)
    setIsSending(true)

    try {
      const { error } = await authClient.sendVerificationEmail({
        email,
        callbackURL,
      })

      if (error) {
        // The limiter is the one failure worth naming. "Try again" while the
        // server is counting the tries is the advice that makes someone press
        // the button four more times and lock themselves out further.
        setError(
          error.status === 429
            ? "Too many requests. Wait a minute, then try again."
            : "Could not send the link. Try again in a moment."
        )
        return
      }

      setHasSent(true)
    } catch {
      setError("Could not reach the server. Check your connection.")
    } finally {
      setIsSending(false)
    }
  }

  return (
    <div className="flex flex-col gap-2">
      {/* The button stays after a successful send rather than being replaced by
          the confirmation. Someone pressing this a second time is someone whose
          mail did not arrive the first time, and the only alternative route —
          submitting the login form again — spends one of five sign-in attempts
          per minute to reach the same place. The server rate limit is the
          guard here, not a disabled button. */}
      <Button
        type="button"
        variant="outline"
        onClick={onResend}
        disabled={isSending}
        className="w-full"
      >
        {isSending ? (
          <>
            <HugeiconsIcon
              icon={Loading03Icon}
              className="animate-spin"
              aria-hidden="true"
            />
            Sending…
          </>
        ) : hasSent ? (
          "Send another link"
        ) : (
          "Send a new link"
        )}
      </Button>

      {hasSent && !error ? (
        <p
          role="status"
          className="text-caption text-muted-foreground flex items-start gap-2 text-pretty"
        >
          <HugeiconsIcon
            icon={Tick02Icon}
            className="mt-px size-4 shrink-0"
            aria-hidden="true"
          />
          Sent to {email}. The link is good for {EMAIL_VERIFICATION_LIFETIME_LABEL}.
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="text-destructive text-caption flex items-start gap-2 text-pretty"
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}
