/**
 * Addresses that can never receive mail, and the one fact two subsystems need.
 *
 * `.test` is reserved by RFC 2606 and can never be registered, which is exactly
 * why `scripts/dev-account.ts` uses it and refuses anything else. Two very
 * different parts of the app care about that:
 *
 * - `lib/auth.ts` exempts them from the invite gate, so `dev-account.ts` and
 *   every `verify-*.ts` script keep working once signup closes.
 * - `lib/mail.ts` refuses to send to them at all.
 *
 * The second one was missing for nine days and cost real money in the only
 * currency a young sending domain has. `requireEmailVerification` is on, so
 * every test signup fired a genuine verification email at a domain that cannot
 * exist: measured on 2026-08-11, 48 of the 53 messages the domain had ever sent
 * were bounces, all of them this. AGENTS.md names the number that matters —
 * "bounce rate is the number the big providers judge a young sending domain
 * by" — and the test setup was spending it.
 *
 * It lives in its own file rather than in either caller because neither owns
 * it. `lib/mail.ts` importing from `lib/waitlist.ts` would be backwards, and a
 * second copy is how the rule ends up true in one place and not the other.
 */
const UNREACHABLE_SUFFIX = "@quincy.test"

export function isUnreachableTestAddress(email: string | null | undefined) {
  if (!email) {
    return false
  }

  return email.trim().toLowerCase().endsWith(UNREACHABLE_SUFFIX)
}
