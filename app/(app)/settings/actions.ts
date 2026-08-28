"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, count, eq, inArray, isNull } from "drizzle-orm"

import { auth } from "@/lib/auth"
import { db } from "@/lib/db"
import {
  atAgentLimit,
  MCP_CLIENTS_PER_USER,
  readAgentRegistration,
} from "@/lib/mcp-gate"
import {
  oauthAccessToken,
  oauthClient,
  oauthClientResource,
  oauthConsent,
  oauthRefreshToken,
  session,
} from "@/lib/schema"
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

/**
 * Disconnect an MCP client, which is what revocation is here.
 *
 * **Three writes, and each one closes a different door.** The 1.7 provider
 * spread what used to be one delete across three places, so a single statement
 * no longer ends a connection:
 *
 * 1. **The consent row goes.** That is the record of "this person said yes to
 *    this client for these scopes", and while it stands the next authorization
 *    is granted without a screen. Deleting it means the agent has to be
 *    consented to again, which is the behaviour a person pressing Remove
 *    expects.
 * 2. **The refresh tokens are revoked**, not deleted. This is the write that
 *    actually ends the connection: the next time the client presents one, the
 *    provider refuses with `invalid_grant`. Note what the row's survival is and
 *    is not worth — it lasts only until that attempt. Inside the 30-second
 *    reuse window a request identical in scopes, requested resources and DPoP
 *    confirmation replays the stored response and nothing is torn down; a
 *    non-identical one is refused and nothing is torn down either. Outside the
 *    window, `invalidateRefreshFamily` (introspect-*.mjs ~1498) **deletes**
 *    every refresh row for this client and account and every access token
 *    hanging off them. So there is no lasting evidence to read here; without
 *    this write the client would simply keep minting access tokens for thirty
 *    days.
 * 3. **Stored access tokens go.** In this deployment there usually are none —
 *    every MCP token is bound to a resource, which makes it a signed JWT with
 *    no row — but a token issued without a resource is opaque and stored, and
 *    leaving it would leave a working key behind.
 *
 * Then, if this account registered the client itself, the client row goes too
 * through the provider's own endpoint, which re-checks ownership. A client that
 * arrived by Client ID Metadata Document is owned by nobody and is deliberately
 * left standing: it is shared machinery, and another account may be using it.
 * The three writes above have already taken everything it had here.
 *
 * **What removal cannot take back is the hour on an access token already
 * issued.** A 1.7 access token is a self-contained JWT verified against the
 * JWKS; there is nothing to revoke and nothing to look up. That is stated on
 * the page and in docs/mcp.md rather than papered over.
 *
 * Named by `client_id` rather than by row id because that is what the whole
 * schema joins on, and it is not a credential: it travels in the query string
 * of every authorization request and is public by design. `userId` sits in the
 * same WHERE clause as every write, so a guessed id is worthless — the same
 * rule `revokeSessions` above follows, and for the same reason: ownership is
 * checked in the statement that writes, never in a caller that could forget.
 */
export async function removeConnectedAgent(
  clientId: string
): Promise<ActionResult> {
  const user = await requireUser()

  if (!clientId) {
    return { ok: false, message: "That agent is already gone." }
  }

  const removed = await db
    .delete(oauthConsent)
    .where(
      and(eq(oauthConsent.clientId, clientId), eq(oauthConsent.userId, user.id))
    )
    .returning({ clientId: oauthConsent.clientId })

  if (removed.length === 0) {
    return { ok: false, message: "That agent is already gone." }
  }

  await db
    .update(oauthRefreshToken)
    .set({ revoked: new Date() })
    .where(
      and(
        eq(oauthRefreshToken.clientId, clientId),
        eq(oauthRefreshToken.userId, user.id),
        isNull(oauthRefreshToken.revoked)
      )
    )

  await db
    .delete(oauthAccessToken)
    .where(
      and(
        eq(oauthAccessToken.clientId, clientId),
        eq(oauthAccessToken.userId, user.id)
      )
    )

  // Only a client this account registered. `deleteOAuthClient` refuses anything
  // else, so the ownership read is what keeps a shared CIMD client from
  // producing an error on a removal that otherwise worked.
  const [owner] = await db
    .select({ userId: oauthClient.userId })
    .from(oauthClient)
    .where(eq(oauthClient.clientId, clientId))
    .limit(1)

  if (owner?.userId === user.id) {
    try {
      await auth.api.deleteOAuthClient({
        body: { client_id: clientId },
        headers: await headers(),
      })
    } catch (error) {
      // The keys are already gone, so this is tidying rather than the act. Say
      // so plainly instead of reporting a failure that did not happen.
      console.error("[settings] client row not deleted:", error)
    }
  }

  revalidatePath("/settings")
  return { ok: true }
}

/**
 * Register an MCP client that cannot introduce itself.
 *
 * **Why this exists at all.** Dynamic client registration is off — RFC 7591
 * anonymous registration lets any stranger who can reach the origin write a row
 * to `oauth_client`, and the 1.7 default is off for that reason. A client with
 * a public HTTPS home identifies itself through a Client ID Metadata Document
 * instead, which proves domain ownership and needs nothing from this page. A
 * client running on somebody's laptop has no such home, and this is how it gets
 * a client id: from the person who is going to use it, while they are signed
 * in.
 *
 * `/oauth2/create-client` is the provider's own sanctioned path for that. It
 * sits behind the session middleware and behind `clientPrivileges`, which
 * lib/auth.ts defines to allow exactly two actions — `create` and `delete`,
 * which are this action and Remove above. The row is stamped with the calling
 * account's `user_id`, and that ownership is what makes the client removable on
 * this page.
 *
 * **Three fields are decided here rather than asked for**, because getting any
 * of them wrong is an error a person cannot act on:
 *
 * - `token_endpoint_auth_method: "none"` makes it a public PKCE client, which
 *   is what every MCP client is. The default would mint a client secret that
 *   nothing would ever use and that this form would have to show.
 * - `application_type` follows the redirect URI. The provider validates the URI
 *   *against* this value — `web` refuses loopback and `native` refuses HTTPS
 *   loopback — so choosing it from the URI is what stops a correct URI being
 *   refused for a reason the form never mentioned. `readAgentRegistration` in
 *   lib/mcp-gate.ts makes that decision and has the tests.
 * - `grant_types` names the refresh grant explicitly, so a client asking for
 *   `offline_access` can actually renew.
 *
 * `scope` is deliberately absent. An unset `scopes` column means the client may
 * request anything the server advertises, which is the six in
 * `MCP_SCOPES_SUPPORTED`; a person is still the one who decides which of them
 * are granted, on /consent. Naming a subset here would be a second place to
 * keep that list right.
 *
 * The client id comes back once and is returned to the caller. It is not a
 * credential — it travels in the query string of every authorization request —
 * but it is the only thing the person needs and there is no second chance to
 * read it off this screen without going to the database.
 */
export type RegisterAgentResult =
  { ok: true; clientId: string } | { ok: false; message: string }

export async function registerAgent(input: {
  name: string
  redirectUri: string
}): Promise<RegisterAgentResult> {
  const user = await requireUser()

  const parsed = readAgentRegistration(input)

  if (!parsed.ok) {
    return parsed
  }

  /**
   * The ceiling on rows this form can create. AGENTS.md, "Money": every path a
   * person can trigger needs one, and this one writes a row to a table the
   * provider reads on every authorization.
   *
   * Counted rather than remembered, and counted per account, because the row is
   * stamped with `user_id` and that is the only thing that scopes it. The
   * predicate is `atAgentLimit` in lib/mcp-gate.ts so the number has a test.
   */
  const [registered] = await db
    .select({ clients: count() })
    .from(oauthClient)
    .where(eq(oauthClient.userId, user.id))

  if (atAgentLimit(registered?.clients ?? 0)) {
    return {
      ok: false,
      message: `You have ${MCP_CLIENTS_PER_USER} agents registered, which is the limit. Remove one you no longer use and try again.`,
    }
  }

  let clientId: string | undefined

  try {
    const created = await auth.api.createOAuthClient({
      body: {
        client_name: parsed.name,
        redirect_uris: [parsed.redirectUri],
        token_endpoint_auth_method: "none",
        application_type: parsed.applicationType,
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
      },
      headers: await headers(),
    })

    clientId = (created as { client_id?: string } | null)?.client_id
  } catch (error) {
    return {
      ok: false,
      message: readable(error, "That agent could not be registered."),
    }
  }

  if (!clientId) {
    return { ok: false, message: "That agent could not be registered." }
  }

  /**
   * The link row, checked rather than assumed.
   *
   * `createOAuthClient` writes two rows — the client and its
   * `oauth_client_resource` link to the MCP resource — inside
   * `runWithTransaction`. The drizzle adapter here is configured
   * `transaction: false`, because lib/db.ts runs the neon-http driver and that
   * driver speaks one request per statement with no transaction to open. So
   * `runWithTransaction` runs the callback and nothing more: the two writes are
   * two independent statements and the second can fail on its own.
   *
   * A client with no link is dead on arrival and dead silently.
   * `enforcePerClientResources` defaults to true in 1.7, so the authorization
   * request refuses to issue a token for a resource the client is not linked
   * to — and the person reading this page would have a client id that looks
   * right and fails at the last step of a flow they cannot see inside.
   *
   * So the client row is deleted, scoped by `user_id` the way every other write
   * on this page is, and the caller is told to try again. A retry is cheap; a
   * dead client id is a support conversation.
   */
  const [link] = await db
    .select({ id: oauthClientResource.id })
    .from(oauthClientResource)
    .where(eq(oauthClientResource.clientId, clientId))
    .limit(1)

  if (!link) {
    await db
      .delete(oauthClient)
      .where(
        and(eq(oauthClient.clientId, clientId), eq(oauthClient.userId, user.id))
      )

    return {
      ok: false,
      message: "Registration did not complete. Try again.",
    }
  }

  revalidatePath("/settings")
  return { ok: true, clientId }
}
