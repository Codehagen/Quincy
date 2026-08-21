"use server"

import { headers } from "next/headers"

import { auth } from "@/lib/auth"
import { rescheduleForUser } from "@/lib/rhythm-run"
import { getSession } from "@/lib/session"
import { isValidTimeZone } from "@/lib/timezone"

/**
 * Fill in a timezone for somebody who signed up without one.
 *
 * The signup form sends the browser's zone, so a password signup arrives with
 * it already set. Three groups do not: Google sign-ups, which never touch that
 * form; anybody who signed up before the column existed; and anybody whose
 * browser declined to answer. For them the zone has to arrive later, from the
 * only place that knows it — see `TimeZoneSync`.
 *
 * **Fills a blank, never corrects one.** Following the browser on every visit
 * would mean a week in New York silently redrawing every slot in the lineup and
 * then redrawing them back on the flight home. A timezone is where you live,
 * not where you opened a laptop, and changing it is a decision with a settings
 * page in its future, not a side effect of travel.
 */
export async function rememberTimeZone(zone: string) {
  const session = await getSession()
  if (!session) return

  // Already answered. This is also what makes the client's fire-once effect
  // harmless if it ever fires twice.
  if (session.user.timezone) return

  // Arrives from the client, so it is a string that could be anything. Writing
  // it unchecked would put a value in the column that throws a RangeError the
  // next time /lineup renders. `resolveTimeZone` would catch it on read, but a
  // row that can only ever fall back is not worth storing.
  if (!isValidTimeZone(zone)) return

  /**
   * Through Better Auth, not through Drizzle, and the difference is the whole
   * plan.
   *
   * `session.cookieCache` serves the entire `user` object out of a signed
   * cookie for five minutes without touching the database, so a raw
   * `db.update` lands in the row and changes nothing the next render can see.
   * A Norwegian signing in with Google would meet the product with every
   * scheduled post two hours out, with nothing to correct it until the cookie
   * aged out — on the one visit where the product is explaining itself.
   *
   * `updateUser` writes the same column and then calls `setSessionCookie`,
   * which re-issues the cookie with the new value in it. `timezone` is
   * `input: true` in lib/auth.ts precisely so this path is open; the same call
   * is what `saveTimezone` on the settings page makes.
   *
   * The cookie cache itself stays as it is. Shortening it to paper over this
   * would slow every authenticated request in the app to fix one write.
   */
  await auth.api.updateUser({
    body: { timezone: zone },
    headers: await headers(),
  })

  /**
   * Every rhythm cursor this user has, recomputed against the zone we just
   * learned.
   *
   * `rhythm_subscription.next_run_at` is denormalised from the wall clock plus
   * this column, and until a moment ago this column was empty — so
   * `resolveTimeZone` was answering UTC and every cursor was computed against
   * it. A user in Oslo who switched a rhythm on before `TimeZoneSync` fired
   * would have a 09:00 rhythm firing at 10:00 local, correct on the card and
   * an hour out in the world.
   *
   * The `updateUser` call above makes a captured timezone take effect
   * immediately for rendering (advisor-plans/005). This is the same fix for
   * scheduling, and it belongs here rather than in a cron because
   * "immediately" is the whole point.
   *
   * Logged rather than thrown: the zone is stored, which is the thing the user
   * asked for, and a rhythm an hour out is a smaller failure than an action
   * that reports failure after succeeding.
   */
  try {
    await rescheduleForUser(session.user.id, zone)
  } catch (cause) {
    console.error("[timezone] could not reschedule rhythms:", cause)
  }
}
