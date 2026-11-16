"use client"

import * as React from "react"

import { authClient } from "@/lib/auth-client"
import { validateEmail } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import {
  Address,
  AuthActions,
  AuthCard,
  AuthNote,
  FormNotice,
} from "@/components/auth/parts"
import { Button, TextLink } from "@/components/kit"

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
      <div className="flex flex-col gap-kit-group">
        {/* Deliberately conditional, matching the server's own response:
            "If this email exists in our system…". The account may not exist,
            and this screen must not say otherwise. */}
        <AuthCard
          title="Check your inbox"
          lead={
            <>
              If there is an account for <Address>{sentTo}</Address>, a link to
              reset the password is on its way.
            </>
          }
        />
        <AuthNote>
          Remembered it after all? <TextLink href="/login">Log in</TextLink>
        </AuthNote>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-kit-group">
      <AuthCard
        title="Reset your password"
        lead="Tell me your email and I will send a link to choose a new one."
      >
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-kit-group"
        >
          <AuthField
            id="email"
            label="Email"
            type="email"
            autoComplete="email"
            field={email}
            inputRef={emailRef}
            disabled={isSubmitting}
          />

          {formError ? <FormNotice>{formError}</FormNotice> : null}

          <AuthActions>
            <Button
              width="full"
              type="submit"
              variant="action"
              pending={isSubmitting}
              pendingLabel="Sending…"
            >
              Send reset link
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
