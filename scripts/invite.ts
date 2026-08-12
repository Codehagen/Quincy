/**
 * Sends invites to the next people on the waitlist. See plans/023.
 *
 * ```
 * npx tsx --env-file=.env.local scripts/invite.ts --count 5
 * npx tsx --env-file=.env.local scripts/invite.ts --count 5 --send
 * npx tsx --env-file=.env.local scripts/invite.ts alice@example.com --send
 * ```
 *
 * **It is a dry run unless you pass `--send`, and that default is the point.**
 * This is the one thing in the repo that mails a list of strangers, and the
 * cost of a mistake is not a failed request — it is a message in somebody's
 * inbox that cannot be recalled. So the default run prints exactly who would
 * be written to and touches nothing.
 *
 * Order per person: issue the code, then send, then roll the row back if the
 * send failed. The other order — send first, mark after — turns any crash in
 * between into a second invite for someone who already has one. This way the
 * worst case is a row that looks uninvited and gets a fresh code next run,
 * which is the failure you want.
 *
 * The mail client is checked once before anybody is touched, because a run that
 * marks fifty people invited and then discovers RESEND_API_KEY is unset has
 * quietly removed all fifty from the queue. That is the shape
 * advisor-plans/017 exists for.
 */
import { randomBytes } from "node:crypto"
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { waitlist } from "../lib/schema-app"
import { sendInviteEmail, inviteUrl } from "../lib/waitlist-email"
import {
  INVITE_TTL_MS,
  nextInLine,
  normalizeEmail,
  waitlistSummary,
} from "../lib/waitlist"

/** Days, for the sentence in the mail. Derived so the two cannot disagree. */
const EXPIRES_IN = `${Math.round(INVITE_TTL_MS / (24 * 60 * 60 * 1000))} days`

/** 22 base64url characters from 16 random bytes. Not guessable, not sequential. */
function newCode() {
  return randomBytes(16).toString("base64url")
}

async function targets(addresses: string[], count: number) {
  if (addresses.length === 0) {
    return nextInLine(count)
  }

  const rows = []

  for (const address of addresses) {
    const [row] = await db
      .select()
      .from(waitlist)
      .where(eq(waitlist.email, normalizeEmail(address)))
      .limit(1)

    if (!row) {
      console.log(`  skip  ${address} — not on the list`)
      continue
    }

    if (row.invitedAt) {
      // Named explicitly, so this is probably a deliberate re-invite. Say what
      // will happen rather than refusing: the new code replaces the old one.
      console.log(
        `  note  ${row.email} — already invited ${row.invitedAt.toISOString().slice(0, 10)}, will be re-issued`
      )
    }

    rows.push(row)
  }

  return rows
}

async function main() {
  const args = process.argv.slice(2)
  const send = args.includes("--send")
  const countFlag = args.indexOf("--count")
  const count = countFlag >= 0 ? Number(args[countFlag + 1]) : 5
  const addresses = args.filter(
    (arg, i) =>
      !arg.startsWith("--") && !(countFlag >= 0 && i === countFlag + 1)
  )

  if (!Number.isInteger(count) || count < 1 || count > 200) {
    console.error("--count must be a whole number between 1 and 200.")
    process.exit(1)
  }

  if (send && !process.env.RESEND_API_KEY) {
    console.error(
      "RESEND_API_KEY is not set. Refusing to mark anybody invited when no mail can leave."
    )
    process.exit(1)
  }

  const summary = await waitlistSummary()
  console.log(
    `\nWaitlist: ${summary.total} total · ${summary.invited} invited · ${summary.redeemed} redeemed\n`
  )

  const people = await targets(addresses, count)

  if (people.length === 0) {
    console.log("Nobody to invite.\n")
    return
  }

  if (!send) {
    console.log(`Would invite ${people.length}:\n`)
    for (const person of people) {
      console.log(
        `  ${person.email.padEnd(36)} joined ${person.createdAt.toISOString().slice(0, 10)}`
      )
    }
    console.log("\nNothing sent. Add --send to actually invite them.\n")
    return
  }

  console.log(`Inviting ${people.length}:\n`)

  let sent = 0

  for (const person of people) {
    const code = newCode()

    await db
      .update(waitlist)
      .set({
        invitedAt: new Date(),
        inviteCode: code,
        inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
        // A re-issue has to clear this or the new code is dead on arrival:
        // every read in lib/waitlist.ts requires `redeemed_at IS NULL`.
        redeemedAt: null,
      })
      .where(eq(waitlist.id, person.id))

    const result = await sendInviteEmail({
      to: person.email,
      code,
      expiresIn: EXPIRES_IN,
    })

    if (result.ok) {
      sent += 1
      console.log(`  sent  ${person.email}`)
      continue
    }

    // Put them back in the queue. They were never written to, so leaving the
    // row marked invited would drop them off the list silently — the worst
    // outcome available here, because nobody would ever look for them again.
    await db
      .update(waitlist)
      .set({ invitedAt: null, inviteCode: null, inviteExpiresAt: null })
      .where(eq(waitlist.id, person.id))

    console.log(
      `  FAIL  ${person.email} — ${result.message} (put back in line)`
    )
    process.exitCode = 1
  }

  console.log(`\n${sent} of ${people.length} invited.`)
  console.log(`Links look like ${inviteUrl("<code>")}\n`)
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
