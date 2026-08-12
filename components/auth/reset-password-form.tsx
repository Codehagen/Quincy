"use client"

import * as React from "react"
import Link from "next/link"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { authClient } from "@/lib/auth-client"
import { PASSWORD_MIN_LENGTH, validatePassword } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

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
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-section">Password changed</h1>
          <p className="text-body text-muted-foreground text-pretty">
            You can sign in with it now.
          </p>
        </div>

        <p className="text-caption text-muted-foreground text-center">
          <Link href="/login" className="text-foreground underline underline-offset-3">
            Log in
          </Link>
        </p>
      </div>
    )
  }

  // The link is dead: no token to submit, or better-auth has already told us
  // it is invalid or expired. Explaining what happened and pointing at the
  // specific next step beats a form with nothing valid to submit it with.
  if (error || !token) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-section">This link has expired</h1>
          <p className="text-body text-muted-foreground text-pretty">
            Reset links only work once and do not last long.{" "}
            <Link
              href="/forgot-password"
              className="text-foreground underline underline-offset-3"
            >
              Request a new one
            </Link>
            .
          </p>
        </div>

        <p className="text-caption text-muted-foreground text-center">
          Remembered it?{" "}
          <Link href="/login" className="text-foreground underline underline-offset-3">
            Log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-section">Choose a new password</h1>
        <p className="text-body text-muted-foreground text-pretty">
          Pick something you have not used here before.
        </p>
      </div>

      <FieldGroup>
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
      </FieldGroup>

      {formError ? (
        <p
          role="alert"
          className="text-destructive text-caption flex items-start gap-2 text-pretty"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            className="mt-px size-4 shrink-0"
            aria-hidden="true"
          />
          {formError}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? "Setting password…" : "Set new password"}
      </Button>

      <p className="text-caption text-muted-foreground text-center">
        Remembered it?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-3">
          Log in
        </Link>
      </p>
    </form>
  )
}
