/**
 * Who sees demo data instead of the truth.
 *
 * **Everything gated on this is a lie, deliberately and narrowly.** Several
 * surfaces are built ahead of the machinery behind them — there is no
 * `sourceConnection` table and no riff pipeline — so for every real account the
 * honest answer is "nothing yet", and that is what they get. The addresses here
 * get fixtures instead, so the built half of each page can be walked through
 * before it can be produced.
 *
 * One list rather than one per feature: "who sees the demo" is a single fact,
 * and the day it stops being true it should stop being true everywhere at once.
 *
 * **Drafts and Lineup no longer read this.** They have tables now, and
 * scripts/seed-drafts.ts writes real rows to a real account — which is the
 * honest version of the same thing, because the read path is then identical for
 * a seeded account and an empty one. Riffs and Sources still branch here: there
 * is no `riff` table and no `sourceConnection` table, so for them the fixture
 * is still the only way to see the built half. Delete this file when those two
 * get their own tables; grep is enough.
 */
const DEMO_ACCOUNTS = new Set([
  "christer.hagen@gmail.com",
  // The local test account from scripts/dev-account.ts. On the list so the
  // surfaces that still run on fixtures can actually be exercised without
  // signing in as a person.
  "dev@quincy.test",
])

/**
 * Addresses are compared case-insensitively and trimmed. A sign-up that
 * capitalised the local part would otherwise miss the list and quietly get the
 * honest empty page, which is the confusing failure rather than the safe one.
 */
export function isDemoAccount(email: string | null | undefined) {
  if (!email) return false
  return DEMO_ACCOUNTS.has(email.trim().toLowerCase())
}
