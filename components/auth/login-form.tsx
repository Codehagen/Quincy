"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Alert02Icon, Mail01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { authClient } from "@/lib/auth-client"
import type { LoginMethod } from "@/lib/last-login-method"
import { validateEmail, validatePasswordPresent } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import { GoogleButton } from "@/components/auth/google-button"
import { LastUsed } from "@/components/auth/last-used"
import { ResendVerification } from "@/components/auth/resend-verification"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Marker, MarkerContent } from "@/components/ui/marker"

export function LoginForm({
  googleEnabled,
  next,
  lastUsed,
}: {
  googleEnabled: boolean
  next: string
  lastUsed: LoginMethod | null
}) {
  const router = useRouter()

  const email = useValidatedField(validateEmail)
  // Login only checks that something was typed. Applying the signup length rule
  // here would tell someone with an older, shorter password that it is invalid
  // before the server has even seen it.
  const password = useValidatedField(validatePasswordPresent)

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  // The address the server rejected as unverified, not the current field value:
  // the resend has to go to the account that was actually refused, and the
  // field stays editable underneath it.
  const [unverified, setUnverified] = React.useState<string | null>(null)

  const emailRef = usePointerAutofocus<HTMLInputElement>()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    const valid = [email.validateNow(), password.validateNow()].every(Boolean)

    if (!valid || isSubmitting) {
      return
    }

    setFormError(null)
    setUnverified(null)
    setIsSubmitting(true)

    try {
      const attempted = email.value.trim()

      const { error } = await authClient.signIn.email({
        email: attempted,
        password: password.value,
      })

      if (error) {
        // The three failures are distinguishable without reading the body: a
        // wrong password is 401 with code INVALID_EMAIL_OR_PASSWORD, an
        // unverified account is 403 with code EMAIL_NOT_VERIFIED, and the rate
        // limiter is 429. Reporting an unverified account as a wrong password
        // sends someone to the reset flow, which will not fix it — they end up
        // with a new password and the same locked account.
        //
        // Saying it plainly leaks nothing: a wrong password is rejected first
        // and never reaches this branch, so anyone who sees this message has
        // already proved they know the password to the account they are asking
        // about.
        if (error.code === "EMAIL_NOT_VERIFIED") {
          setUnverified(attempted)
          setIsSubmitting(false)
          return
        }

        // A 429 carries no `code`, unlike the other two failures, so this has
        // to branch on status rather than code.
        if (error.status === 429) {
          setFormError("Too many attempts. Wait a minute, then try again.")
          setIsSubmitting(false)
          return
        }

        // Deliberately not "no account with that email" — that turns the login
        // form into a way to find out who has an account here.
        setFormError("That email and password do not match an account.")
        setIsSubmitting(false)
        return
      }

      router.push(next)
    } catch {
      setFormError("Could not reach the server. Check your connection.")
      setIsSubmitting(false)
    }
  }

  // The panel names a specific address and its button resends to that address.
  // Once the field says something else, both are talking about an account the
  // user is no longer trying to reach.
  const showUnverified = unverified !== null && unverified === email.value.trim()

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-section">Welcome back</h1>
        <p className="text-body text-muted-foreground text-pretty">
          Pick up where you and Quincy left off.
        </p>
      </div>

      {googleEnabled ? (
        <div className="flex flex-col gap-4">
          {/* Absolutely positioned rather than a third item in the button's
              flex row: in the row it would push the mark and label off centre,
              and the label is what people aim at. pointer-events-none so the
              pill can never swallow the click it is advertising. */}
          <div className="relative">
            <GoogleButton
              label="Continue with Google"
              className="w-full"
              callbackURL={next}
              disabled={isSubmitting}
              onError={(message) => setFormError(message || null)}
            />
            {lastUsed === "google" ? (
              <LastUsed className="pointer-events-none absolute inset-y-0 end-2 my-auto h-fit" />
            ) : null}
          </div>
          <Marker variant="separator">
            <MarkerContent>or</MarkerContent>
          </Marker>
        </div>
      ) : null}

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
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          field={password}
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

      {/* Not styled as an error, and not boxed. Nothing here went wrong — the
          account exists, the password was right, and one step is outstanding;
          destructive red would say "you failed" to someone who has only lost an
          email. It borrows the form-level message shape above rather than
          introducing a bordered panel: this form has no other card, and a
          16px-radius button inside a 16px-radius box with 16px of padding
          breaks the nested-radius rule the whole app follows. */}
      {showUnverified ? (
        <div className="flex flex-col gap-3">
          <p role="alert" className="text-caption text-muted-foreground flex items-start gap-2 text-pretty">
            <HugeiconsIcon
              icon={Mail01Icon}
              className="mt-px size-4 shrink-0"
              aria-hidden="true"
            />
            <span>
              Confirm your email before logging in. The link we sent to{" "}
              <span className="text-foreground font-medium">{unverified}</span>{" "}
              may have expired.
            </span>
          </p>
          <ResendVerification email={unverified} callbackURL={next} />
        </div>
      ) : null}

      <div className="relative">
        <Button type="submit" className="w-full" disabled={isSubmitting}>
          {isSubmitting ? "Logging in…" : "Log in"}
        </Button>
        {/* Only when Google is also on offer. With one method there is nothing
            to choose between, and labelling the only door is noise. */}
        {lastUsed === "email" && googleEnabled ? (
          <LastUsed className="pointer-events-none absolute inset-y-0 end-2 my-auto h-fit" />
        ) : null}
      </div>

      <p className="text-caption text-muted-foreground text-center">
        No account yet?{" "}
        <Link href="/#join" className="text-foreground underline underline-offset-3">
          Join the waitlist
        </Link>
      </p>

      <p className="text-caption text-muted-foreground text-center">
        <Link
          href="/forgot-password"
          className="text-foreground underline underline-offset-3"
        >
          Forgot password?
        </Link>
      </p>
    </form>
  )
}
