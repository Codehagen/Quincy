/**
 * Shared by the server config and the sign-in surfaces, so the number in the
 * copy cannot drift from the number better-auth enforces. It lives in its own
 * module rather than in `lib/auth.ts` because the login and signup forms are
 * client components — importing from `lib/auth.ts` would pull the server auth
 * config, the database adapter and the mail senders into the browser bundle.
 */
export const EMAIL_VERIFICATION_EXPIRES_IN_SECONDS = 60 * 60

/** Rendered into user-facing copy, e.g. "The link is good for an hour." */
export const EMAIL_VERIFICATION_LIFETIME_LABEL = "an hour"
