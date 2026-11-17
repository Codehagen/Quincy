"use client"

import * as React from "react"

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
import {
  Address,
  AuthActions,
  AuthCard,
  AuthNote,
  FormNotice,
} from "@/components/auth/parts"
import { Button, Rule, TextButton, TextLink } from "@/components/kit"

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
  const emailRef = React.useRef<HTMLInputElement>(null)

  // Each swap removes the focused control, so focus follows it: to the
  // answer's heading on the way in, back to the address on the way out.
  const titleRef = React.useRef<HTMLElement>(null)
  const backToForm = React.useRef(false)
  React.useEffect(() => {
    if (sentTo) {
      titleRef.current?.focus()
    } else if (backToForm.current) {
      backToForm.current = false
      emailRef.current?.focus()
    }
  }, [sentTo])

  // Both branches open with this region at the same position, so React keeps
  // the one node and its text change is what gets announced.
  const live = (
    <p aria-live="polite" className="sr-only">
      {sentTo ? "Check your inbox" : ""}
    </p>
  )

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
      <div className="flex flex-col gap-kit-group">
        {live}
        <AuthCard
          title="Check your inbox"
          titleRef={titleRef}
          lead={
            <>
              I sent a link to <Address>{sentTo}</Address>. Open it and you are
              in.
            </>
          }
        >
          <ResendVerification email={sentTo} callbackURL="/studio" />
        </AuthCard>

        <div className="flex flex-col gap-kit-tight">
          {/* A Link back to /signup would be a soft navigation to the route this
              component is already on, so it would not remount and `sentTo` would
              survive it — the control that appears to start over would do
              nothing. Clearing the state is the actual action, so it is the
              kit's TextButton: a real button in the TextLink look. */}
          {/* Not for an invite: the address is the one the invite went to
              and the field is read-only, so there is nothing to go back and
              fix. */}
          {invitedEmail ? null : (
            <AuthNote>
              Wrong address?{" "}
              <TextButton
                onClick={() => {
                  backToForm.current = true
                  setSentTo(null)
                }}
              >
                Go back and fix it
              </TextButton>
            </AuthNote>
          )}

          {/* Duplicate signups land here too — Better Auth answers an already
              registered, already verified address the same way it answers a new
              one, so this screen cannot tell which it is looking at. No mail goes
              out for the former, so this is the only way back for someone who
              already has a working account. */}
          <AuthNote>
            Already verified? <TextLink href="/login">Log in</TextLink>
          </AuthNote>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-kit-group">
      {live}
      <AuthCard
        title="Create your account"
        lead={
          invitedEmail
            ? "Your invite is good. I need somewhere to keep your voice and your drafts."
            : "I need somewhere to keep your voice and your drafts."
        }
      >
        <form
          onSubmit={onSubmit}
          noValidate
          className="flex flex-col gap-kit-group"
        >
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
            <div className="flex flex-col gap-kit-group">
              <GoogleButton
                label="Continue with Google"
                callbackURL="/"
                disabled={isSubmitting}
                onError={(message) => setFormError(message || null)}
              />
              <Rule label="or" />
            </div>
          ) : null}

          <div className="flex flex-col gap-kit-group">
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
                `disabled`: a disabled input is not submitted, is skipped by the
                tab order, and reads as broken rather than as decided. The invite
                is bound to this address in lib/auth.ts, so letting it be edited
                only produces a FORBIDDEN nobody can explain. */}
            <AuthField
              id="email"
              label="Email"
              type="email"
              autoComplete="email"
              field={email}
              inputRef={emailRef}
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
          </div>

          {formError ? <FormNotice>{formError}</FormNotice> : null}

          {/* Pending while in flight, which is also what stops a double submit.
              The label changes so the wait is explained rather than just
              enforced. */}
          <AuthActions>
            <Button
              width="full"
              type="submit"
              variant="action"
              pending={isSubmitting}
              pendingLabel="Creating account…"
            >
              Create account
            </Button>
          </AuthActions>
        </form>
      </AuthCard>

      <AuthNote>
        Already have an account? <TextLink href="/login">Log in</TextLink>
      </AuthNote>
    </div>
  )
}
