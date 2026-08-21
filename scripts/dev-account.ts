/**
 * A local account that can actually sign in, repaired on demand.
 *
 * Run with: npx tsx --env-file=.env.local scripts/dev-account.ts
 *
 * Signing in requires a verified email, and verification is a real Resend
 * delivery. That is correct for a person — you get the mail — and unusable for
 * automated testing, because a test account lives at @quincy.test, which is not
 * a domain, so the mail lands nowhere and the account can never be used.
 *
 * The fix is not to relax verification in development. That flow is the newest
 * and least exercised thing in the app, and switching it off locally means the
 * first person to run it for real is a stranger. This gives the test account a
 * way in instead, and leaves auth behaving identically everywhere.
 *
 * Idempotent, and repairing rather than merely creating is the point: the
 * verify-*.ts scripts tear down what they touch, including the credential row,
 * which leaves a user that exists and cannot log in. Re-running this fixes that
 * without anyone having to work out what happened.
 *
 * Credentials come from the environment. .env.local is already gitignored and
 * already holds secrets, so nothing lands in the repo or in an agent's notes.
 */
import { eq } from "drizzle-orm"

import { auth } from "../lib/auth"
import { db } from "../lib/db"
import { account, user } from "../lib/schema"

/**
 * The guard, and it is the whole reason this script is safe to keep around.
 *
 * It sets emailVerified and knows a password, which against a real address is
 * an account-takeover primitive. The dev database is the same Neon branch as
 * everything else, so there is no "is this local" to check — the constraint has
 * to be on the target instead. @quincy.test cannot receive mail and cannot
 * belong to anyone, so the blast radius is bounded by construction rather than
 * by remembering to be careful.
 */
const ALLOWED_DOMAIN = "@quincy.test"

async function main() {
  const email = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"
  const password = process.env.DEV_ACCOUNT_PASSWORD

  if (!password) {
    throw new Error(
      "DEV_ACCOUNT_PASSWORD is not set. Add it to .env.local — it is deliberately not defaulted, so this cannot run by accident."
    )
  }

  if (!email.endsWith(ALLOWED_DOMAIN)) {
    throw new Error(
      `Refusing to touch ${email}. This script only operates on ${ALLOWED_DOMAIN} addresses.`
    )
  }

  const [existing] = await db
    .select()
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (existing) {
    const credentials = await db
      .select({ id: account.id })
      .from(account)
      .where(eq(account.userId, existing.id))

    const hasCredential = credentials.length > 0

    if (hasCredential) {
      await db
        .update(user)
        .set({ emailVerified: true })
        .where(eq(user.id, existing.id))
      console.log(`${email} already exists — marked verified, password unchanged`)
      return
    }

    // A user with no credential row is the teardown case. There is no supported
    // way to reattach one, so the account is rebuilt. Cascade takes the brain
    // pages with it, which is why this prints loudly enough to notice.
    await db.delete(user).where(eq(user.id, existing.id))
    console.log(`${email} had no credentials — rebuilt (brain pages were dropped)`)
  }

  await auth.api.signUpEmail({
    body: { email, password, name: "Dev" },
  })

  await db.update(user).set({ emailVerified: true }).where(eq(user.email, email))

  console.log(`${email} ready — verified, can sign in`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
