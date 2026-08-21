/**
 * Exercises the waitlist against Neon. See plans/023.
 * Run with: npx tsx --env-file=.env.local scripts/verify-waitlist.ts
 *
 * Library level, so it is deterministic and needs no server. The one thing it
 * cannot reach from here is the HTTP surface — the 400 for a malformed body,
 * the 429 shape, and the `proxy.ts` PUBLIC entry that stops a POST becoming a
 * 307. Those are checked with curl against a dev server, and the commands are
 * at the bottom of this file.
 *
 * **Guarded on the address, not on NODE_ENV.** There is one Neon branch, so the
 * environment cannot tell you anything about which rows you are about to
 * delete. Only the target can. This script writes and then deletes waitlist
 * rows, and it refuses to touch anything outside @quincy.test.
 */
import { eq, like } from "drizzle-orm"

import { db } from "../lib/db"
import { waitlist } from "../lib/schema-app"
import {
  findRedeemableInvite,
  hashCaller,
  INVITE_TTL_MS,
  joinWaitlist,
  nextInLine,
  normalizeEmail,
  redeemInvite,
  WAITLIST_CEILING,
} from "../lib/waitlist"

function check(label: string, ok: boolean, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) process.exitCode = 1
}

const DOMAIN = "@quincy.test"

/**
 * The whole safety story, copied in spirit from verify-onboarding.ts. The
 * teardown at the end deletes by a LIKE on this domain, so a run pointed at a
 * real address would delete real people off the list.
 */
function assertTestDomain(...addresses: string[]) {
  for (const address of addresses) {
    if (!address.endsWith(DOMAIN)) {
      throw new Error(
        `Refusing to run against ${address}. This script deletes waitlist rows, and there is only one database. Use an ${DOMAIN} address.`
      )
    }
  }
}

async function teardown() {
  await db.delete(waitlist).where(like(waitlist.email, `%${DOMAIN}`))
}

async function main() {
  const mixedCase = `Verify.Waitlist@Quincy.Test`
  const normalized = normalizeEmail(mixedCase)
  const second = `verify.waitlist.two${DOMAIN}`
  const third = `verify.waitlist.three${DOMAIN}`
  const fourth = `verify.waitlist.four${DOMAIN}`

  assertTestDomain(normalized, second, third, fourth)

  // Anything a previous run left behind, so the counts below start from zero.
  await teardown()

  const caller = hashCaller("203.0.113.7")
  const otherCaller = hashCaller("198.51.100.4")

  console.log("\nJoining")

  check("a caller resolves to a hash", Boolean(caller))
  check(
    "the hash is not the address",
    caller !== "203.0.113.7" && (caller?.length ?? 0) === 64
  )
  check(
    "two callers get different hashes",
    Boolean(caller && otherCaller && caller !== otherCaller)
  )

  check(
    "a valid address joins",
    (await joinWaitlist({ email: mixedCase, ipHash: caller })) === "joined"
  )

  const [stored] = await db
    .select()
    .from(waitlist)
    .where(eq(waitlist.email, normalized))

  check("it is stored lowercased and trimmed", Boolean(stored), normalized)

  check(
    "a repeat answers the same as a first join",
    (await joinWaitlist({ email: normalized, ipHash: caller })) === "joined"
  )

  const afterRepeat = await db
    .select()
    .from(waitlist)
    .where(eq(waitlist.email, normalized))

  check("and it did not write a second row", afterRepeat.length === 1)

  check(
    "an address with no @ is refused",
    (await joinWaitlist({ email: "nope", ipHash: caller })) === "invalid"
  )
  check(
    "an address with no domain dot is refused",
    (await joinWaitlist({ email: "nope@localhost", ipHash: caller })) ===
      "invalid"
  )

  console.log("\nCooldown")

  await joinWaitlist({ email: second, ipHash: caller })
  await joinWaitlist({ email: third, ipHash: caller })

  check(
    `the ${WAITLIST_CEILING + 1}th join from one caller is cooled`,
    (await joinWaitlist({ email: fourth, ipHash: caller })) === "cooled"
  )
  check(
    "and it wrote nothing",
    (await db.select().from(waitlist).where(eq(waitlist.email, fourth)))
      .length === 0
  )
  check(
    "another caller is unaffected",
    (await joinWaitlist({ email: fourth, ipHash: otherCaller })) === "joined"
  )
  check(
    "a caller with no resolvable address is not cooled",
    (await joinWaitlist({
      email: `verify.waitlist.five${DOMAIN}`,
      ipHash: hashCaller(null),
    })) === "joined"
  )

  console.log("\nInvites")

  /**
   * **Every assertion below is scoped to test rows, and every write picks one.**
   *
   * `nextInLine` returns the real queue. The first version of this file read it
   * raw, counted the rows, and issued a code to `queue[0]` — which is fine
   * against an empty table and catastrophic the moment a real person joins.
   * It did exactly that on 2026-08-11: it marked the first real signup invited
   * and redeemed, which takes them out of `nextInLine` permanently. Nobody
   * would have gone looking, because from every angle the row read as handled.
   *
   * The raw queue is still fetched, because the ordering guarantee is only
   * meaningful across the whole table. Nothing is ever written to it.
   */
  const fullQueue = await nextInLine(50)
  const queue = fullQueue.filter((row) => row.email.endsWith(DOMAIN))

  // Five, not four: the address, two more from the same caller, the one the
  // other caller got in, and the one with no resolvable caller at all. The
  // cooled join and the two malformed ones wrote nothing.
  check(
    "everyone joined is waiting",
    queue.length === 5,
    `${queue.length} test rows of ${fullQueue.length} waiting`
  )
  check(
    "oldest first",
    fullQueue.every(
      (row, i) =>
        i === 0 ||
        row.createdAt.getTime() >= (fullQueue[i - 1]?.createdAt.getTime() ?? 0)
    )
  )

  const target = queue[0]!
  assertTestDomain(target.email)

  /**
   * Run-scoped, not fixed. Two `verify-code-0001` constants collided with a row
   * left behind by a run that died halfway, and the unique index on
   * `invite_code` turned the next run into a crash instead of a failure. A
   * script whose second run cannot start is a script nobody runs twice.
   */
  const stamp = Date.now()
  const code = `verify-${stamp}-a`

  await db
    .update(waitlist)
    .set({
      invitedAt: new Date(),
      inviteCode: code,
      inviteExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .where(eq(waitlist.id, target.id))

  check(
    "an issued code is redeemable",
    Boolean(await findRedeemableInvite(code))
  )
  check("an unknown code is not", (await findRedeemableInvite("nope")) === null)
  check("an empty code is not", (await findRedeemableInvite("   ")) === null)

  check("redeeming it succeeds", (await redeemInvite(code)) === true)
  check("redeeming it twice does not", (await redeemInvite(code)) === false)
  check(
    "and it is no longer redeemable",
    (await findRedeemableInvite(code)) === null
  )

  const expiredCode = `verify-${stamp}-b`
  const other = queue[1]!
  assertTestDomain(other.email)

  await db
    .update(waitlist)
    .set({
      invitedAt: new Date(),
      inviteCode: expiredCode,
      inviteExpiresAt: new Date(Date.now() - 1000),
    })
    .where(eq(waitlist.id, other.id))

  check(
    "an expired code is not redeemable",
    (await findRedeemableInvite(expiredCode)) === null
  )
  check("and cannot be redeemed", (await redeemInvite(expiredCode)) === false)

  check(
    "an invited row leaves the queue",
    (await nextInLine(50)).every((row) => row.id !== target.id)
  )

  // The one that would lose people silently. `invited_at` stays set on a lapsed
  // invite, so a queue defined as "never invited" drops anybody who was told
  // they were in and then did nothing — which is most people.
  check(
    "an expired invite puts that person back in line",
    (await nextInLine(50)).some((row) => row.id === other.id)
  )
  // Their place *among the test rows*, not in the table. Absolute position is
  // whatever the real signups make it, and asserting on that is what broke this
  // file the first time a stranger joined.
  check(
    "and they keep their original place",
    (await nextInLine(50))
      .filter((row) => row.email.endsWith(DOMAIN))
      .findIndex((row) => row.id === other.id) === 0
  )

  console.log("\nTearing down")
  await teardown()

  const left = await db
    .select()
    .from(waitlist)
    .where(like(waitlist.email, `%${DOMAIN}`))

  check("every test row is gone", left.length === 0)

  console.log(
    process.exitCode ? "\nFAILED\n" : "\nAll waitlist checks passed.\n"
  )
}

main().then(
  () => process.exit(process.exitCode ?? 0),
  (error) => {
    console.error(error)
    process.exit(1)
  }
)

/**
 * The HTTP half, by hand against `pnpm dev`:
 *
 * ```
 * curl -s -o /dev/null -w "%{http_code}\n" -X POST localhost:3000/api/waitlist \
 *   -H 'content-type: application/json' -H 'x-forwarded-for: 203.0.113.7' \
 *   -d '{"email":"curl.check@quincy.test"}'                       # expect 200
 *
 * curl ... -d '{"email":"nope"}'                                  # expect 400
 * curl ... -d 'not json'                                          # expect 400
 * # four times from one x-forwarded-for                           # expect 429 on the 4th
 * ```
 *
 * The one that matters most is the first: a 307 there means `/api/waitlist`
 * has fallen out of `PUBLIC` in proxy.ts, and the form reports a network error
 * while the endpoint is fine.
 */
