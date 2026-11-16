"use client"

import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import {
  AuthActions,
  AuthCard,
  AuthNote,
  FormNotice,
} from "@/components/auth/parts"
import { Button, ButtonLink, TextLink } from "@/components/kit"

export function ResetPasswordForm({
  token,
  error,
}: {
  token: string | null
  error: string | null
}) {
  const password = useValidatedField(validatePassword)

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  // Set once the reset succeeds. Replaces the form rather than sitting under
  // it: the token is single-use, so there is nothing left to submit and the
  // password field should not still be sitting there live.
  const [hasReset, setHasReset] = React.useState(false)
  // Set when the server refuses the token itself: already used, or expired
  // since the page loaded. Retrying cannot help, so the form gives way to the
  // same "run out" state a dead link lands on.
  const [tokenDead, setTokenDead] = React.useState(false)

  const passwordRef = usePointerAutofocus<HTMLInputElement>()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!token || !password.validateNow() || isSubmitting) {
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      const { error } = await authClient.resetPassword({
        newPassword: password.value,
        token,
      })

      if (error) {
        // better-auth answers a used or expired token with 400 and code
        // INVALID_TOKEN (routes/password.mjs, resetPassword). Branch on the
        // code, not the status: a too-short or too-long password is 400 too.
        if (error.code === "INVALID_TOKEN") {
          setTokenDead(true)
          setIsSubmitting(false)
          return
        }

        setFormError(
          error.status === 429
            ? "Too many requests. Wait a minute, then try again."
            : "Could not reset the password. Try again in a moment."
        )
        setIsSubmitting(false)
        return
      }

      setHasReset(true)
      setIsSubmitting(false)
    } catch {
      setFormError("Could not reach the server. Check your connection.")
      setIsSubmitting(false)
    }
  }

  if (hasReset) {
    return (
      <AuthCard title="Password changed" lead="Log in with the new one.">
        <AuthActions>
          <ButtonLink width="full" href="/login" variant="action">
            Log in
          </ButtonLink>
        </AuthActions>
      </AuthCard>
    )
  }

  // The link is dead: no token to submit, or better-auth has already told us
  // it is invalid or expired. Explaining what happened and pointing at the
  // specific next step beats a form with nothing valid to submit it with.
  if (error || !token || tokenDead) {
    return (
      <div className="flex flex-col gap-kit-group">
        <AuthCard
          title="This link has run out"
          lead="Reset links work once and do not last long. Ask for a fresh one."
        >
          <AuthActions>
            <ButtonLink width="full" href="/forgot-password" variant="action">
              Send a new link
            </ButtonLink>
          </AuthActions>
        </AuthCard>
        <AuthNote>
          Remembered it? <TextLink href="/login">Log in</TextLink>
        </AuthNote>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-kit-group">
      <AuthCard
        title="Choose a new password"
        lead="Pick one you have not used here before."
      >
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-kit-group"
        >
          <AuthField
            id="password"
            label="New password"
            type="password"
            autoComplete="new-password"
            field={password}
            inputRef={passwordRef}
            disabled={isSubmitting}
            description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
          />

          {formError ? <FormNotice>{formError}</FormNotice> : null}

          <AuthActions>
            <Button
              width="full"
              type="submit"
              variant="action"
              pending={isSubmitting}
              pendingLabel="Saving…"
            >
              Set new password
            </Button>
          </AuthActions>
        </form>
      </AuthCard>
      <AuthNote>
        Remembered it? <TextLink href="/login">Log in</TextLink>
      </AuthNote>
    </div>
  )
}
