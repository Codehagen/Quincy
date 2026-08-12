import { cookies } from "next/headers"

/**
 * Which method this browser signed in with last, read on the server.
 *
 * Better Auth ships a client plugin for this, and it reads document.cookie
 * after hydration. That renders a badge that pops in a frame after the buttons
 * it labels, on the one screen where the whole point is to be seen before you
 * choose. The cookie is httpOnly:false but it is still a cookie, so the server
 * can read it and the badge lands in the first paint with nothing to shift.
 *
 * Cookie and not a database column, deliberately. The badge answers "which
 * button did I use last" *before* anyone has identified themselves, and a
 * column cannot answer that — the lookup key is the identity you have not
 * established yet. Looking it up by typed email instead would be an
 * unauthenticated endpoint that confirms an address exists and says how it
 * signs in, which is the account enumeration Better Auth works to prevent.
 * `storeInDatabase` is for showing "you usually use Google" inside settings,
 * where you are already signed in.
 */

const COOKIE = "better-auth.last_used_login_method"

/**
 * Both names are checked because secure cookies are enabled in production and
 * not in development. Guessing which one ships would be a bug that only exists
 * once deployed, and reading two keys costs nothing.
 */
const NAMES = [COOKIE, `__Secure-${COOKIE}`]

export type LoginMethod = "email" | "google"

export async function getLastLoginMethod(): Promise<LoginMethod | null> {
  const jar = await cookies()

  for (const name of NAMES) {
    const value = jar.get(name)?.value
    if (value === "email" || value === "google") {
      return value
    }
  }

  return null
}
