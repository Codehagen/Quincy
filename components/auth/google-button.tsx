"use client"

import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { GoogleMark } from "@/components/auth/google-mark"

/**
 * Rendered only when the server says Google is configured, so this is never a
 * button that fails on click.
 *
 * There is no success branch: a social sign-in navigates away to Google, so the
 * pending state only ever ends in a redirect or an error. That is why it stays
 * disabled after a successful call rather than resetting.
 */
export function GoogleButton({
  label,
  callbackURL,
  disabled,
  onError,
  className,
}: {
  label: string
  callbackURL: string
  disabled?: boolean
  onError: (message: string) => void
  className?: string
}) {
  const [isRedirecting, setIsRedirecting] = React.useState(false)

  async function onClick() {
    setIsRedirecting(true)
    onError("")

    try {
      const { error } = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      })

      if (error) {
        onError(error.message ?? "Google sign-in failed.")
        setIsRedirecting(false)
      }
    } catch {
      onError("Could not reach Google. Check your connection.")
      setIsRedirecting(false)
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      disabled={disabled || isRedirecting}
      onClick={onClick}
    >
      <GoogleMark data-icon="inline-start" />
      {isRedirecting ? "Taking you to Google…" : label}
    </Button>
  )
}
