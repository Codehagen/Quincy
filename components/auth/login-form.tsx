"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { authClient } from "@/lib/auth-client"
import type { LoginMethod } from "@/lib/last-login-method"
import { validateEmail, validatePasswordPresent } from "@/lib/auth-validation"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import { GoogleButton } from "@/components/auth/google-button"
import { LastUsed } from "@/components/auth/last-used"
import { ResendVerification } from "@/components/auth/resend-verification"
import { LegalNote } from "@/components/auth/legal-note"
import {
  Address,
  AuthActions,
  AuthCard,
  AuthNote,
  FormNotice,
} from "@/components/auth/parts"
import { Button, Muted, Rule, Text, TextLink } from "@/components/kit"

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
        // form into a way to find out who has an account here. Only a 401 is
        // a wrong password; a 5xx, or a 403 that is not EMAIL_NOT_VERIFIED (a
        // banned account), would send somebody to reset a password that is
        // fine.
        setFormError(
          error.status === 401
            ? "That email and password do not match an account."
            : "Could not sign in. Try again in a moment."
        )
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
  const showUnverified =
    unverified !== null && unverified === email.value.trim()

  return (
    <div className="flex flex-col gap-kit-group">
      <AuthCard
        title="Welcome back"
        lead="Pick up where you and Quincy left off."
      >
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-kit-group"
        >
          {googleEnabled ? (
            <div className="flex flex-col gap-kit-group">
              <div className="relative">
                <GoogleButton
                  label="Continue with Google"
                  callbackURL={next}
                  disabled={isSubmitting}
                  onError={(message) => setFormError(message || null)}
                />
                {lastUsed === "google" ? <LastUsed on="quiet" /> : null}
              </div>
              <Rule label="or" />
            </div>
          ) : null}

          <div className="flex flex-col gap-kit-group">
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
          </div>

          {formError ? <FormNotice>{formError}</FormNotice> : null}

          {/* Not styled as an error. Nothing here went wrong — the account
              exists, the password was right, and one step is outstanding; red
              would say "you failed" to someone who has only lost an email. */}
          {showUnverified ? (
            <div className="flex flex-col gap-kit-related">
              <Text role="alert">
                <span className="text-pretty">
                  Confirm your email first.{" "}
                  <Muted>
                    The link we sent to <Address>{unverified}</Address> may have
                    run out. I can send a fresh one.
                  </Muted>
                </span>
              </Text>
              <ResendVerification email={unverified} callbackURL={next} />
            </div>
          ) : null}

          <AuthActions>
            <div className="relative">
              <Button
                width="full"
                type="submit"
                variant="action"
                pending={isSubmitting}
                pendingLabel="Logging in…"
              >
                Log in
              </Button>
              {/* Only when Google is also on offer. With one method there is
                  nothing to choose between, and labelling the only door is
                  noise. */}
              {lastUsed === "email" && googleEnabled ? (
                <LastUsed on="action" />
              ) : null}
            </div>
          </AuthActions>
        </form>
      </AuthCard>

      <div className="flex flex-col gap-kit-tight">
        <AuthNote>
          <TextLink href="/forgot-password">Forgot your password?</TextLink>
        </AuthNote>
        <AuthNote>
          No account yet? <TextLink href="/#join">Join the waitlist</TextLink>
        </AuthNote>
        <LegalNote />
      </div>
    </div>
  )
}
