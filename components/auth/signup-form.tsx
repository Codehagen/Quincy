"use client"

import * as React from "react"
import Link from "next/link"
import { Alert02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { authClient } from "@/lib/auth-client"
import {
  PASSWORD_MIN_LENGTH,
  validateEmail,
  validateName,
  validatePassword,
} from "@/lib/auth-validation"
import { browserTimeZone } from "@/lib/timezone"
import { usePointerAutofocus } from "@/hooks/use-pointer-autofocus"
import { useValidatedField } from "@/hooks/use-validated-field"
import { AuthField } from "@/components/auth/auth-field"
import { GoogleButton } from "@/components/auth/google-button"
import { ResendVerification } from "@/components/auth/resend-verification"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Marker, MarkerContent } from "@/components/ui/marker"

export function SignupForm({
  googleEnabled,
  invitedEmail,
}: {
  googleEnabled: boolean
  /**
   * The address the invite was sent to. Present whenever this form renders at
   * all — `app/(auth)/signup/page.tsx` shows a closed panel instead when there
   * is no live code — and optional here only so the component stays usable if
   * signup ever reopens. See plans/023.
   */
  invitedEmail?: string
}) {
  const name = useValidatedField(validateName)
  const email = useValidatedField(validateEmail, invitedEmail)
  const password = useValidatedField(validatePassword)

  const [isSubmitting, setIsSubmitting] = React.useState(false)
  const [formError, setFormError] = React.useState<string | null>(null)
  // Set once the account exists and the link is out. Replaces the form rather
  // than sitting under it: there is nothing left to fill in, and leaving the
  // fields live invites a second signup for the same address.
  const [sentTo, setSentTo] = React.useState<string | null>(null)

  const nameRef = usePointerAutofocus<HTMLInputElement>()

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault()

    // Every field validates, not just the touched ones — this is the "punish
    // late" half. & rather than && so all three report at once; short-circuiting
    // would fix one error only to reveal the next.
    const valid = [
      name.validateNow(),
      email.validateNow(),
      password.validateNow(),
    ].every(Boolean)

    if (!valid || isSubmitting) {
      return
    }

    setFormError(null)
    setIsSubmitting(true)

    // Better Auth returns { data, error } rather than throwing, same convention
    // as lib/mail.ts. The try/catch is for the transport underneath it.
    try {
      const attempted = email.value.trim()

      const { error } = await authClient.signUp.email({
        name: name.value.trim(),
        email: attempted,
        password: password.value,
        // The one moment the browser is in the room. Sent here rather than
        // asked for on a settings page, because a slot at 08:00 has to mean
        // 08:00 from the first one Quincy schedules — and nobody sets a
        // timezone they were never asked about. Absent is handled: everything
        // downstream reads it through resolveTimeZone in lib/timezone.ts.
        timezone: browserTimeZone(),
      })

      if (error) {
        // Password length and malformed input still land here. A taken address
        // no longer does: with `requireEmailVerification` on, Better Auth
        // answers a duplicate signup with a synthetic success instead of an
        // error, so the response cannot be used to enumerate accounts. Nothing
        // below needs to special-case that — the inbox state is already the
        // honest thing to show, and the resend button inside it is what
        // actually gets a link to a real unverified account.
        setFormError(error.message ?? "Could not create the account.")
        setIsSubmitting(false)
        return
      }

      // `requireEmailVerification` is on, so there is no session here — the
      // response carries `token: null`. Pushing to /studio would bounce off the
      // auth check and drop someone who just signed up back on the login page
      // with no idea why.
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
          <p className="text-body text-pretty text-muted-foreground">
            We sent a link to{" "}
            <span className="font-medium text-foreground">{sentTo}</span>. Open
            it and Quincy is yours — you will be signed in from there.
          </p>
        </div>

        <ResendVerification email={sentTo} callbackURL="/studio" />

        {/* A Link back to /signup would be a soft navigation to the route this
            component is already on, so it would not remount and `sentTo` would
            survive it — the button that appears to start over would do nothing.
            Clearing the state is the actual action. */}
        <p className="text-center text-caption text-muted-foreground">
          Wrong address?{" "}
          <button
            type="button"
            onClick={() => setSentTo(null)}
            className="text-foreground underline underline-offset-3"
          >
            Go back and fix it
          </button>
        </p>

        {/* Duplicate signups land here too — Better Auth answers an already
            registered, already verified address the same way it answers a new
            one, so this screen cannot tell which it is looking at. No mail goes
            out for the former, so this is the only way back for someone who
            already has a working account. */}
        <p className="text-center text-caption text-muted-foreground">
          Already verified?{" "}
          <Link
            href="/login"
            className="text-foreground underline underline-offset-3"
          >
            Log in
          </Link>
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-section">Create your account</h1>
        <p className="text-body text-pretty text-muted-foreground">
          {invitedEmail
            ? "Your invite is good. Quincy needs somewhere to keep your voice and your drafts."
            : "Quincy needs somewhere to keep your voice and your drafts."}
        </p>
      </div>

      {/* **No Google on an invited signup**, and the omission is the fix rather
          than a limitation. See plans/023.

          An invite binds one address. Google supplies whatever address the
          person happens to be signed in with, and when those differ the gate in
          `lib/auth.ts` must reject — but it rejects by throwing inside an OAuth
          callback, where `onError` below never runs, because that handler only
          sees failures the client initiates. The person lands wherever
          better-auth's error handling puts them, holding a spent-looking invite
          and no sentence explaining it.

          The cost is real: an invited tester loses one-click signup. It is
          still the right trade while the invited population is small, because
          the alternative is an untested redirect path on the one flow a beta
          tester has to get through. Reopening it means wiring an error
          destination that can say "that Google account is not the invited
          address", and testing it — not deleting this comment.

          `/login` keeps Google. An existing account has already passed the
          gate. */}
      {googleEnabled && !invitedEmail ? (
        <div className="flex flex-col gap-4">
          <GoogleButton
            label="Continue with Google"
            callbackURL="/"
            disabled={isSubmitting}
            onError={(message) => setFormError(message || null)}
          />
          <Marker variant="separator">
            <MarkerContent>or</MarkerContent>
          </Marker>
        </div>
      ) : null}

      <FieldGroup>
        <AuthField
          id="name"
          label="Name"
          type="text"
          autoComplete="name"
          field={name}
          inputRef={nameRef}
          disabled={isSubmitting}
        />
        {/* Locked to the invited address, and `readOnly` rather than
            `disabled`: a disabled input is not submitted, is skipped by the tab
            order, and reads as broken rather than as decided. The invite is
            bound to this address in lib/auth.ts, so letting it be edited only
            produces a FORBIDDEN nobody can explain. */}
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          field={email}
          disabled={isSubmitting}
          readOnly={Boolean(invitedEmail)}
          description={
            invitedEmail ? "The address your invite was sent to." : undefined
          }
        />
        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          field={password}
          disabled={isSubmitting}
          description={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        />
      </FieldGroup>

      {formError ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-caption text-pretty text-destructive"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            className="mt-px size-4 shrink-0"
            aria-hidden="true"
          />
          {formError}
        </p>
      ) : null}

      {/* Disabled while in flight, which is also what stops a double submit.
          The label changes so the wait is explained rather than just enforced. */}
      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account…" : "Create account"}
      </Button>

      <p className="text-center text-caption text-muted-foreground">
        Already have an account?{" "}
        <Link
          href="/login"
          className="text-foreground underline underline-offset-3"
        >
          Log in
        </Link>
      </p>
    </form>
  )
}
