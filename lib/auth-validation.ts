/**
 * Field rules, kept as plain functions returning the message to show or null.
 *
 * They are separate from the timing logic on purpose: when to run a rule is a
 * UX decision that belongs to the form, what makes a value wrong is a rule that
 * belongs here. Both forms share these, so login and signup cannot drift on
 * what counts as a valid email.
 *
 * Every message says how to fix it. "Invalid email" tells someone they failed;
 * "Your email needs an @ symbol" tells them what to do next.
 */

export function validateName(value: string): string | null {
  if (!value.trim()) {
    return "Tell Quincy what to call you."
  }

  return null
}

export function validateEmail(value: string): string | null {
  const email = value.trim()

  if (!email) {
    return "Enter your email address."
  }

  // Deliberately loose. The server is the real check, and a strict client-side
  // regex is famous for rejecting addresses that are perfectly deliverable.
  const at = email.indexOf("@")

  if (at < 1) {
    return "Your email needs an @ symbol."
  }

  const domain = email.slice(at + 1)

  if (!domain.includes(".") || domain.startsWith(".") || domain.endsWith(".")) {
    return "Your email needs a domain, like quincy.com."
  }

  return null
}

export const PASSWORD_MIN_LENGTH = 8

export function validatePassword(value: string): string | null {
  if (!value) {
    return "Choose a password."
  }

  if (value.length < PASSWORD_MIN_LENGTH) {
    return `Use at least ${PASSWORD_MIN_LENGTH} characters — you have ${value.length}.`
  }

  return null
}

/** Login only checks that something was typed; the server decides if it is right. */
export function validatePasswordPresent(value: string): string | null {
  if (!value) {
    return "Enter your password."
  }

  return null
}

/**
 * Middleware puts the attempted path in `?next=`, and that value is
 * attacker-controllable — anyone can send a link with it set. Only same-origin
 * paths get through, so it cannot be used to bounce someone off to another
 * site wearing our login page as the referrer.
 *
 * `//evil.com` is the case worth naming: it is a protocol-relative URL, so a
 * bare "starts with a slash" check would wave it past.
 */
export function safeNextPath(value: string | undefined): string {
  // "/" is the marketing page. Landing there after signing in would mean
  // logging in and arriving back on the pitch, so the fallback is the app.
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/studio"
  }

  return value
}
