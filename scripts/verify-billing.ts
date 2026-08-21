import { eq, sql } from "drizzle-orm"

import { db } from "../lib/db"
import { subscription, user } from "../lib/schema"
import { resolveEntitlement } from "../lib/entitlement"

/**
 * Billing state for one account, and the two levers needed to test it.
 *
 * The paywall is the hardest surface in the app to reach honestly: it opens a
 * day after signup, and a gate nobody can get to is a gate nobody tests. So
 * `--expire` moves the deadline into the past rather than asking anyone to
 * wait, and `--restore` puts it back.
 *
 *   npx tsx --env-file=.env.local scripts/verify-billing.ts [email]
 *   npx tsx --env-file=.env.local scripts/verify-billing.ts [email] --expire
 *   npx tsx --env-file=.env.local scripts/verify-billing.ts [email] --restore
 *
 * Guarded to @quincy.test for the same reason scripts/dev-account.ts is: this
 * edits entitlement, and the dev database is the same Neon branch as
 * everything else. Pointing it at a real address would be revoking or granting
 * a stranger's access from a shell.
 */
const DEFAULT_EMAIL = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

const args = process.argv.slice(2)
const email = args.find((a) => !a.startsWith("--")) ?? DEFAULT_EMAIL
const expire = args.includes("--expire")
const restore = args.includes("--restore")

if (!email.endsWith("@quincy.test")) {
  console.error(
    `Refusing to touch ${email} — this script only operates on @quincy.test accounts.`
  )
  process.exit(1)
}

const rows = await db
  .select({
    id: user.id,
    email: user.email,
    trialEndsAt: user.trialEndsAt,
    stripeCustomerId: user.stripeCustomerId,
  })
  .from(user)
  .where(eq(user.email, email))

const account = rows[0]

if (!account) {
  console.error(`No such user: ${email}. Run scripts/dev-account.ts first.`)
  process.exit(1)
}

if (expire) {
  // An hour into the past, not a year. Far enough to be unambiguously over,
  // close enough that the row still looks like something that really happened.
  await db
    .update(user)
    .set({ trialEndsAt: sql`now() - interval '1 hour'` })
    .where(eq(user.id, account.id))
  console.log(`⏪ ${email}: trial pushed one hour into the past`)
}

if (restore) {
  await db
    .update(user)
    .set({ trialEndsAt: sql`now() + interval '1 day'` })
    .where(eq(user.id, account.id))
  console.log(`⏩ ${email}: trial restored to a full day from now`)
}

const [fresh] = await db
  .select({
    id: user.id,
    trialEndsAt: user.trialEndsAt,
    stripeCustomerId: user.stripeCustomerId,
  })
  .from(user)
  .where(eq(user.id, account.id))

const subs = await db
  .select({
    id: subscription.id,
    plan: subscription.plan,
    status: subscription.status,
    stripeSubscriptionId: subscription.stripeSubscriptionId,
    periodEnd: subscription.periodEnd,
  })
  .from(subscription)
  .where(eq(subscription.referenceId, account.id))

// Resolved through the same function the app uses, not a reimplementation of
// it. A verify script that computes the answer its own way tests itself.
const entitlement = await resolveEntitlement(fresh)

console.log(`\n${email}`)
console.log(`  user id          ${fresh.id}`)
console.log(`  trial ends       ${fresh.trialEndsAt?.toISOString() ?? "—"}`)
console.log(`  stripe customer  ${fresh.stripeCustomerId ?? "—"}`)
console.log(`  subscriptions    ${subs.length}`)

for (const sub of subs) {
  console.log(
    `    · ${sub.plan} ${sub.status} ${sub.stripeSubscriptionId ?? "—"} until ${
      sub.periodEnd?.toISOString() ?? "—"
    }`
  )
}

console.log(`\n  entitlement      ${entitlement.state.toUpperCase()}`)
console.log(
  `  may spend        ${
    entitlement.state === "trialing" || entitlement.state === "active"
      ? "yes"
      : "no — read-only"
  }\n`
)
