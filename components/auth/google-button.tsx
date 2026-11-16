"use client"

import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/kit"
import { GoogleMark } from "@/components/auth/google-mark"

/**
 * Rendered only when the server says Google is configured, so this is never a
 * button that fails on click.
 *
 * A quiet pill: the one action on these screens is the form's own submit, and
 * Google is the other door, not a second call to action.
 *
 * There is no success branch: a social sign-in navigates away to Google, so the
 * pending state only ever ends in a redirect or an error. That is why it stays
 * pending after a successful call rather than resetting.
 *
 * The G goes in Button's `mark` slot (a leading glyph that is not a
 * hugeicon), and the button spans the auth card (`width="full"`).
 */
export function GoogleButton({
  label,
  callbackURL,
  disabled,
  onError,
}: {
  label: string
  callbackURL: string
  disabled?: boolean
  onError: (message: string) => void
}) {
  const [isRedirecting, setIsRedirecting] = React.useState(false)

  // Back from Google with the browser's back button restores this page from
  // the back/forward cache with the button still pending. Release it then.
  React.useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setIsRedirecting(false)
    }
    window.addEventListener("pageshow", onPageShow)
    return () => window.removeEventListener("pageshow", onPageShow)
  }, [])

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
      width="full"
      mark={<GoogleMark />}
      disabled={disabled}
      pending={isRedirecting}
      pendingLabel="Taking you to Google…"
      onClick={onClick}
    >
      {label}
    </Button>
  )
}
