"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import { session } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { ZONES } from "@/lib/zones"

/**
 * Mutations for /settings. See plans/024.
 *
 * Every one of them goes through `auth.api`, never through a direct write to
 * the `user` table. Better Auth owns that row: it revalidates the session
 * cookie cache after an update, and a hand-written UPDATE would leave the
 * signed cookie carrying the old name for up to five minutes while the
 * database carried the new one. The five-minute window is documented in
 * docs/billing.md for the trial; it applies to every field on the session.
 */

export type ActionResult = { ok: true } | { ok: false; message: string }

/**
 * Turn a better-auth failure into something a person can act on.
 *
 * The one worth naming is freshness. `revokeSession` and `revokeOtherSessions`
 * sit behind `freshSessionMiddleware`, which refuses a session older than
 * `freshAge` — a day, by default — with "Session is not fresh". That is a
 * correct gate on a control that can lock somebody out of their own browsers,
 * and a useless sentence to read: it names an internal rule and gives no way
 * out. The way out is signing in again, so that is what it says.
 */
function readable(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : ""

  if (/not fresh/i.test(message)) {
    return "For safety this needs a recent sign-in. Sign out, sign back in, and try again."
  }

  return message || fallback
}

async function requireUser() {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")
  return session.user
}

/**
 * The name Quincy writes with.
 *
 * Trimmed and length-bounded here rather than only in the field, because a
 * server action is a public endpoint: the form is a courtesy and this is the
 * check. 80 characters is longer than any real name and short enough that the
 * sentence it lands in cannot become a paragraph.
 */
export async function saveName(name: string): Promise<ActionResult> {
  await requireUser()

  const trimmed = name.trim()

  if (!trimmed) {
    return { ok: false, message: "Quincy needs something to call you." }
  }

  if (trimmed.length > 80) {
    return { ok: false, message: "That is longer than 80 characters." }
  }

  await auth.api.updateUser({
    body: { name: trimmed },
    headers: await headers(),
  })

  // The sidebar and the mail both read the name off the session, so the whole
  // app group is stale, not just this page.
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * The clock everything in the product is drawn against.
 *
 * Validated against the list rather than against `Intl` alone. A caller could
 * post any string that happens to be a valid identifier — "Etc/GMT+12" is real
 * and would render a legible page while quietly moving somebody's schedule. The
 * allowed set is the set we offer, plus whatever the account already had, which
 * is what stops this from refusing a zone an older signup was given by its
 * browser.
 */
export async function saveTimezone(
  timezone: string,
  current: string | null
): Promise<ActionResult> {
  await requireUser()

  if (!ZONES.includes(timezone) && timezone !== current) {
    return { ok: false, message: "That is not one of the zones offered." }
  }

  await auth.api.updateUser({
    body: { timezone },
    headers: await headers(),
  })

  // /lineup, /rhythm and /drafts all draw dates in this zone.
  revalidatePath("/", "layout")
  return { ok: true }
}

/**
 * Change the password, and end every other session while doing it.
 *
 * `revokeOtherSessions` is not a convenience. Somebody changing a password
 * usually believes somebody else has it, and leaving the other sessions alive
 * answers the wrong question — the new password would protect the next sign-in
 * while the intruder stayed signed in on the old one.
 *
 * The wrong current password comes back as an error from better-auth rather
 * than as a thrown exception we should re-word: "Password is incorrect" is
 * already the sentence, and inventing our own would drift from the API's.
 */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<ActionResult> {
  await requireUser()

  if (newPassword.length < 8) {
    return { ok: false, message: "Use at least 8 characters." }
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    })
  } catch (error) {
    return {
      ok: false,
      message: readable(
        error,
        "That did not work. Check the current password and try again."
      ),
    }
  }

  revalidatePath("/settings")
  return { ok: true }
}

/**
 * Sign one other browser out, named by session **id** rather than by token.
 *
 * This is the whole reason this action does a lookup instead of taking what
 * better-auth's own endpoint takes. A session token *is* the credential — it is
 * what the cookie holds, and the cookie is `httpOnly` precisely so that script
 * on the page can never read it. Rendering the tokens of every session into the
 * markup so the client can post one back would hand all of them to any script
 * that runs on this page, which is the protection thrown away.
 *
 * The id is useless to an attacker and the token never leaves the server. The
 * `userId` in the WHERE clause is what makes a guessed id worthless too: the
 * ownership check lives in the same statement as the read, not in a caller that
 * could forget it.
 *
 * Takes a list because the page groups sessions by browser: one laptop that has
 * signed in repeatedly is one row and one press, and the tokens behind it are
 * the server's problem rather than the reader's.
 *
 * **Why this is one endpoint call and then one statement**, rather than a call
 * per token. `auth.api.revokeSession` is the full HTTP endpoint — origin check,
 * session resolution, freshness middleware — and it costs about 900ms against
 * Neon. Measured on a group of 39, a loop over it took 34 seconds with the
 * button disabled throughout. Nobody waits that out; they conclude it is broken
 * and press something else.
 *
 * The split keeps both things that matter:
 *
 *  - The first token goes through the endpoint, so `freshSessionMiddleware`
 *    still runs. That gate is the reason a stolen day-old session cannot lock
 *    the real owner out of their own browsers, and skipping it to save a round
 *    trip would be trading the point of the feature for its speed.
 *  - The rest are deleted in one statement, which is what better-auth does with
 *    them anyway: with no `secondaryStorage` configured (this app has none), its
 *    `internalAdapter.deleteSession` is a row delete and nothing else. Its own
 *    `revokeOtherSessions` does not go through the endpoint either — it maps the
 *    adapter over the list directly.
 *
 * The `userId` in the WHERE clause is doing the same work as before: ownership
 * is checked in the statement that deletes, not in a caller that could forget.
 *
 * The cookie cache is unaffected by the choice. A revoked session whose cookie
 * carries cached data stays readable for up to the five minutes configured in
 * lib/auth.ts no matter how the row goes away.
 */
export async function revokeSessions(
  sessionIds: string[]
): Promise<ActionResult> {
  const user = await requireUser()

  if (sessionIds.length === 0) {
    return { ok: true }
  }

  const rows = await db
    .select({ id: session.id, token: session.token })
    .from(session)
    .where(and(inArray(session.id, sessionIds), eq(session.userId, user.id)))

  if (rows.length === 0) {
    return { ok: false, message: "Those sessions are already signed out." }
  }

  const [first, ...rest] = rows

  try {
    await auth.api.revokeSession({
      body: { token: first.token },
      headers: await headers(),
    })
  } catch (error) {
    return {
      ok: false,
      message: readable(error, "That browser could not be signed out."),
    }
  }

  if (rest.length > 0) {
    await db.delete(session).where(
      and(
        inArray(
          session.id,
          rest.map((row) => row.id)
        ),
        eq(session.userId, user.id)
      )
    )
  }

  revalidatePath("/settings")
  return { ok: true }
}

/**
 * Sign every other browser out, keeping this one.
 *
 * Never "sign out everywhere": a control that ends the session you are reading
 * it in is one nobody presses twice, and the case it exists for — a laptop left
 * somewhere — is exactly the case where you want to stay signed in here.
 */
export async function revokeOtherSessions(): Promise<ActionResult> {
  await requireUser()

  try {
    await auth.api.revokeOtherSessions({
      headers: await headers(),
    })
  } catch (error) {
    return {
      ok: false,
      message: readable(error, "The other sessions could not be signed out."),
    }
  }

  revalidatePath("/settings")
  return { ok: true }
}
