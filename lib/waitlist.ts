import { createHash } from "node:crypto"
import { createIdGenerator } from "ai"
import {
  and,
  asc,
  count,
  eq,
  gte,
  isNotNull,
  isNull,
  lt,
  or,
  sql,
} from "drizzle-orm"

import { db } from "./db"
// Shared with lib/mail.ts, which refuses to send to these at all. Neither
// module owns the fact, so it lives on its own — see lib/test-address.ts.
export { isUnreachableTestAddress } from "./test-address"
import { waitlist } from "./schema-app"

const newWaitlistId = createIdGenerator({ prefix: "wl", size: 16 })

/**
 * Joining the waitlist. See plans/023.
 *
 * **Nothing here sends mail, and that is the design.** A public endpoint that
 * emails whatever address is posted to it is a mail-bomb primitive aimed at
 * whoever owns that address — the same reason `sendOnSignIn` stays unset in
 * `lib/auth.ts`. The page confirms on screen instead, and the only mail this
 * table ever causes is an invite, sent deliberately by a person running
 * `scripts/invite.ts`.
 *
 * That also fixes the cost: joining writes one row and spends nothing, so the
 * ceiling-and-cooldown rule in AGENTS.md has no spend to bound here. The
 * cooldown below exists to stop casual hammering, not to protect a bill.
 */

/** How far back the per-caller count looks. */
export const WAITLIST_WINDOW_MS = 60 * 60 * 1000

/**
 * Joins allowed from one caller per window.
 *
 * Three rather than one: a shared office, a phone handed round a table, and a
 * person who mistypes their address twice are all real, and all indistinguishable
 * from here.
 */
export const WAITLIST_CEILING = 3

/** How long an invite code is good for once sent. */
export const INVITE_TTL_MS = 14 * 24 * 60 * 60 * 1000

export type JoinOutcome = "joined" | "invalid" | "cooled"

/**
 * Addresses are compared trimmed and lowercased, and stored that way.
 *
 * An address that differs only in case is the same inbox. Two rows for it means
 * two invites to one person, and a "you are already on the list" that is wrong.
 */
export function normalizeEmail(value: string) {
  return value.trim().toLowerCase()
}

/**
 * The salt falls back to `BETTER_AUTH_SECRET` rather than requiring a new
 * variable, for the reason `lib/metadata.ts` gives about `BETTER_AUTH_URL`: a
 * second secret meaning the same thing is a second thing to forget on a preview
 * deployment, and the failure is silent.
 *
 * It throws when neither exists. An unsalted sha256 of an IPv4 address is not
 * anonymous — the whole space is four billion values and rainbow-tabling it is
 * an afternoon — and a hash we cannot salt is worse than no hash, because it
 * looks like protection in the column name.
 */
function ipSalt() {
  const salt = process.env.WAITLIST_IP_SALT ?? process.env.BETTER_AUTH_SECRET

  if (!salt) {
    throw new Error(
      "Neither WAITLIST_IP_SALT nor BETTER_AUTH_SECRET is set, so the waitlist cannot hash a caller."
    )
  }

  return salt
}

/**
 * The caller, as a hash and never as an address.
 *
 * The leftmost `x-forwarded-for` entry, which is spoofable — a determined
 * caller sets the header and gets a fresh bucket every request. That is
 * accepted here, unlike in `lib/auth.ts` where better-auth refuses to trust an
 * entry at all: the worst outcome of defeating this cooldown is junk rows in a
 * table nobody bills for, bounded per address by the UNIQUE constraint, and no
 * mail is sent either way. Rate limiting a sign-in is a different question with
 * a different answer.
 *
 * Measured on production 2026-08-03: Vercel sends a single-value header, so the
 * leftmost entry is the caller.
 */
export function hashCaller(forwardedFor: string | null) {
  const ip = forwardedFor?.split(",")[0]?.trim()

  if (!ip) {
    return null
  }

  return createHash("sha256").update(`${ip}${ipSalt()}`).digest("hex")
}

/**
 * Put an address on the list.
 *
 * Returns `joined` for a new address **and for one already on the list**. The
 * caller cannot tell the two apart, deliberately: sign-up answers a duplicate
 * with a synthetic success so the response cannot be used to enumerate
 * accounts, and a waitlist is the softer target of the two. It is also the
 * kinder answer to somebody who simply forgot they had signed up.
 *
 * No constant-time floor, unlike `/send-verification-email`. That endpoint
 * needed one because its two paths differ by a whole mail delivery. Both paths
 * here are the same single statement, and the timing difference between an
 * insert and a conflict is not measurable across the internet.
 */
export async function joinWaitlist({
  email,
  source = "landing",
  ipHash,
}: {
  email: string
  source?: string
  ipHash: string | null
}): Promise<JoinOutcome> {
  const address = normalizeEmail(email)

  // Deliberately loose, matching `validateEmail` in lib/auth-validation.ts: a
  // strict regex is famous for rejecting addresses that deliver fine, and the
  // real check is whether the invite arrives.
  const at = address.indexOf("@")
  const domain = address.slice(at + 1)

  if (
    at < 1 ||
    !domain.includes(".") ||
    domain.startsWith(".") ||
    domain.endsWith(".") ||
    address.length > 320
  ) {
    return "invalid"
  }

  if (ipHash) {
    const since = new Date(Date.now() - WAITLIST_WINDOW_MS)

    const [recent] = await db
      .select({ n: count() })
      .from(waitlist)
      .where(and(eq(waitlist.ipHash, ipHash), gte(waitlist.createdAt, since)))

    if ((recent?.n ?? 0) >= WAITLIST_CEILING) {
      return "cooled"
    }
  }

  await db
    .insert(waitlist)
    .values({ id: newWaitlistId(), email: address, source, ipHash })
    // The UNIQUE constraint on email is what makes a repeat submission a no-op
    // rather than an error. Doing this in the database rather than with a read
    // first also closes the race between two submissions of the same address.
    .onConflictDoNothing({ target: waitlist.email })

  return "joined"
}

/**
 * The next people in line, oldest first.
 *
 * "In line" is **not** `invited_at IS NULL`, which was the first version and is
 * a quiet way to lose people. An invite that lapses unredeemed leaves that
 * column set, so the person who was told they were in — and then did nothing
 * for a fortnight, which is most people — would never appear in this list
 * again. Nobody would go looking for them, because from every angle the row
 * reads as handled.
 *
 * So somebody is in line when they have not redeemed **and** they are not
 * currently holding a live invite. An expired one puts them back where they
 * were, and `scripts/invite.ts` issues a fresh code when it re-invites.
 *
 * The order stays `created_at`, not "when their invite lapsed": the page
 * promises invites go out in the order people asked, and a lapsed invite does
 * not cost somebody their place.
 */
export function nextInLine(limit: number) {
  return db
    .select()
    .from(waitlist)
    .where(
      and(
        isNull(waitlist.redeemedAt),
        or(isNull(waitlist.invitedAt), lt(waitlist.inviteExpiresAt, new Date()))
      )
    )
    .orderBy(asc(waitlist.createdAt))
    .limit(limit)
}

/**
 * A code that is spendable right now: issued, not expired, not already used.
 *
 * One query rather than a read plus three checks in the caller, so the signup
 * page and the signup handler cannot disagree about what "valid" means.
 */
export async function findRedeemableInvite(code: string) {
  const trimmed = code.trim()

  if (!trimmed) {
    return null
  }

  const [row] = await db
    .select()
    .from(waitlist)
    .where(
      and(
        eq(waitlist.inviteCode, trimmed),
        isNull(waitlist.redeemedAt),
        gte(waitlist.inviteExpiresAt, new Date())
      )
    )
    .limit(1)

  return row ?? null
}

/**
 * Spend a code, and refuse to spend one twice.
 *
 * The `redeemed_at IS NULL` in the WHERE is the guard, not a check done before
 * the update — two signups racing on one link would both pass a prior read and
 * both create an account. Returns whether this call was the one that spent it.
 */
export async function redeemInvite(code: string) {
  const rows = await db
    .update(waitlist)
    .set({ redeemedAt: new Date() })
    .where(
      and(
        eq(waitlist.inviteCode, code.trim()),
        isNull(waitlist.redeemedAt),
        gte(waitlist.inviteExpiresAt, new Date())
      )
    )
    .returning({ id: waitlist.id })

  return rows.length === 1
}

/**
 * Gate and spend in one statement: does this address hold a live invite, and
 * if so, mark it used.
 *
 * One `UPDATE ... WHERE` rather than a read followed by a write, because the
 * two-step version loses the race that matters — two signups on one link both
 * pass the read and both get an account. `redeemed_at IS NULL` in the WHERE is
 * the lock, and the row count is the answer.
 *
 * Keyed on the address rather than on the code. The code is what makes the
 * link unguessable and lets the page prefill the field; it is not the secret
 * holding the door, because it cannot be — nothing carries it from the browser
 * into Better Auth's signup endpoint. Knowing an invited address is not enough
 * on its own: `requireEmailVerification` means the link still has to arrive in
 * that inbox before the account can be used.
 */
export async function spendInviteFor(email: string) {
  const rows = await db
    .update(waitlist)
    .set({ redeemedAt: new Date() })
    .where(
      and(
        eq(waitlist.email, normalizeEmail(email)),
        isNotNull(waitlist.inviteCode),
        isNull(waitlist.redeemedAt),
        gte(waitlist.inviteExpiresAt, new Date())
      )
    )
    .returning({ id: waitlist.id })

  return rows.length === 1
}

/** How many are waiting, and how many have been let in. For the invite script. */
export async function waitlistSummary() {
  const [row] = await db
    .select({
      total: count(),
      invited: sql<number>`count(*) filter (where ${waitlist.invitedAt} is not null)::int`,
      redeemed: sql<number>`count(*) filter (where ${waitlist.redeemedAt} is not null)::int`,
    })
    .from(waitlist)

  return row ?? { total: 0, invited: 0, redeemed: 0 }
}
