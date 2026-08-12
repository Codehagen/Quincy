"use client"

import * as React from "react"
import Link from "next/link"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { authClient } from "@/lib/auth-client"
import { validateEmail } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"

export function ForgotPasswordForm() {
  const email = useValidatedField(validateEmail)

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  // The address that was submitted, not the current field value: once this is
  // set the form is replaced by the inbox state below and there is nothing
  // left to keep editing.
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const emailRef = usePointerAutofocus<HTMLInputElement>()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    if (!email.validateNow() || isSubmitting) {
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    try {
      const attempted = email.value.trim()

      const { error } = await authClient.requestPasswordReset({
        email: attempted,
        redirectTo: "/reset-password",
      })

      if (error) {
        // The limiter is the one failure worth naming specifically. Anything
        // else falls back to a generic message rather than echoing the
        // server's text, which would risk saying something that gives away
        // whether the address exists.
        setFormError(
          error.status === 429
            ? "Too many requests. Wait a minute, then try again."
            : "Could not send the reset link. Try again in a moment."
        )
        setIsSubmitting(false)
        return
      }

      setSentTo(attempted)
      setIsSubmitting(false)
    } catch {
      setFormError("Could not reach the server. Check your connection.")
      setIsSubmitting(false)
    }
  }

  if (sentTo) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <h1 className="text-section">Check your inbox</h1>
          {/* Deliberately conditional, matching the server's own response:
              "If this email exists in our system…". The account may not exist,
              and this message must not let this screen say otherwise. */}
          <p className="text-body text-muted-foreground text-pretty">
            If an account exists for{" "}
            <span className="text-foreground font-medium">{sentTo}</span>, we
            sent a link to reset the password.
          </p>
        </div>

        <p className="text-caption text-muted-foreground text-center">
          Remember it after all?{" "}
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
        <h1 className="text-section">Reset your password</h1>
        <p className="text-body text-muted-foreground text-pretty">
          Enter your email and we will send you a link to choose a new one.
        </p>
      </div>

      <FieldGroup>
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          field={email}
          inputRef={emailRef}
          disabled={isSubmitting}
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
        {isSubmitting ? "Sending…" : "Send reset link"}
      </Button>

      <p className="text-caption text-muted-foreground text-center">
        Remember your password?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-3">
          Log in
        </Link>
      </p>
    </form>
  )
}
