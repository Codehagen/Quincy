import { withMcpAuth } from "better-auth/plugins"
import { eq } from "drizzle-orm"
import { createMcpHandler } from "mcp-handler"

import { auth, runAsMcpUser } from "@/lib/auth"
import { ceilingVerdict } from "@/lib/chat-guards"
import { chatTools } from "@/lib/chat-tools"
import { db } from "@/lib/db"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import {
  accountVerdict,
  draftsToday,
  MCP_DRAFTS_PER_DAY,
  MCP_REQUESTS_PER_MINUTE,
  MCP_TOOLS,
  parseScopes,
  takeRequest,
  toMcpTools,
  type McpGuard,
} from "@/lib/mcp"
import { user as userTable } from "@/lib/schema"
import { summariseUsage } from "@/lib/usage"

/**
 * The MCP endpoint. One route, mounted where mcp-handler 2.x says to mount it.
 *
 * `mcp-handler` dropped the `[transport]` segment and the HTTP+SSE transport in
 * 2.0: the handler serves streamable HTTP from wherever it is mounted, and
 * `basePath` is a no-op shim. So the URL an agent connects to is
 * `/api/mcp` and there is no second path to keep in step with it.
 *
 * `withMcpAuth` is Better Auth's wrapper. It reads the bearer token, checks it
 * against `oauth_access_token`, and answers 401 with the `WWW-Authenticate`
 * header RFC 9728 asks for — which is how a client discovers where to
 * authorize. Everything below it has a real user.
 *
 * **What this route can do is exactly what lib/chat-tools.ts can do, minus two
 * reads, and it can never do more.** No approve, no schedule, no publish. See
 * the header of lib/mcp.ts for the argument; the short version is that the
 * token is held by a program and "Quincy drafts, you send" is the product.
 */

/**
 * The same ceiling the chat route takes, for the same reason: `draft_angle`
 * embeds a full generation, and Vercel ending the function mid-call is what a
 * client sees as a tool that started and never finished.
 */
export const maxDuration = 120

const handler = withMcpAuth(auth, async (request, session) => {
  const userId = session.userId

  if (!userId) {
    // A token with no user is a token for a client-credentials grant, which
    // this server does not issue. Nothing here can act without a person behind
    // it, so there is nothing to serve.
    return Response.json(
      { error: "This token is not tied to an account." },
      { status: 401 }
    )
  }

  /**
   * The per-minute ceiling, before anything reads the database.
   *
   * Ordering copied from the chat route: the checks that cost nothing come
   * first, so a request that is going to be refused never pays for a lookup.
   */
  const rate = takeRequest(userId)

  if (!rate.ok) {
    return Response.json(
      {
        error: `Too many requests. Quincy accepts ${MCP_REQUESTS_PER_MINUTE} a minute per account.`,
        state: "rate-limited",
      },
      {
        status: 429,
        headers: { "Retry-After": String(rate.retryAfterSeconds) },
      }
    )
  }

  /**
   * The user row, read for real.
   *
   * `withMcpAuth` hands back the access token record and nothing else, so the
   * email and timezone the tools need are not on it. Read from the table rather
   * than carried on the token: `trialEndsAt` decides whether this account may
   * spend, and a value cached on a token minted a week ago would be a free day
   * that never ends. This is the same rule the chat route follows — the user
   * comes from the session, never from the request.
   */
  const [row] = await db
    .select({
      id: userTable.id,
      email: userTable.email,
      timezone: userTable.timezone,
      trialEndsAt: userTable.trialEndsAt,
      banned: userTable.banned,
    })
    .from(userTable)
    .where(eq(userTable.id, userId))
    .limit(1)

  /**
   * Deleted, or banned since the token was minted.
   *
   * Both are facts that changed after `withMcpAuth` did its work — it checks
   * the bearer token against `oauth_access_token` and nothing else. A ban in
   * particular ends the browser sessions and leaves the OAuth tokens alone, so
   * without this an agent connected before the ban keeps reading everything
   * the account holds for an hour, and keeps refreshing for a week after that.
   *
   * Read from the row on every request rather than carried on the token, for
   * the same reason `trialEndsAt` is: a fact cached at mint time is a fact that
   * cannot change. The verdict itself is pure and lives in lib/mcp-gate.ts, so
   * both refusals have a test.
   */
  const account = accountVerdict(row)

  if (!account.ok) {
    return Response.json({ error: account.error }, { status: account.status })
  }

  /**
   * The money gate, resolved once for the request.
   *
   * `ForRequest` rather than the pure resolver, and the choice is the question
   * docs/billing.md asks: is a user actually here? They are — a person
   * authorized this client in a browser and is watching an agent work on their
   * behalf. An account that predates the trial column gets its free day here,
   * exactly as it would on a page load.
   *
   * Not a 402 for the whole request, unlike the chat route, and that is
   * deliberate. Read-only means read-only: an unentitled account may still ask
   * what is waiting. Only the two writes are refused, and they are refused with
   * a sentence the calling model can act on rather than a status code it will
   * report as a broken server.
   */
  const entitlement = await resolveEntitlementForRequest(row)

  const guard: McpGuard = async ({ name, scope }) => {
    if (scope !== "write") {
      return null
    }

    if (!isEntitled(entitlement)) {
      return entitlement.state === "lapsed"
        ? "Your subscription is no longer active, so Quincy cannot write anything right now. Reading still works. /settings/billing is where that is fixed."
        : "Your free day is over, so Quincy cannot write anything right now. Reading still works. /settings/billing is where that is fixed."
    }

    /**
     * The day's money, shared with the chat rather than counted again here.
     *
     * `CHAT_DAILY_CEILING_MICROS` bounds what one account may spend in a
     * trailing day, and lib/chat-guards.ts says why it is per person rather
     * than per route: a wallet does not care which surface emptied it. This
     * route was the one surface that did not read it, which made the MCP path
     * the cheap way around a limit every other spending path respects.
     *
     * Read inside the guard rather than once per request, so a token that only
     * ever calls reads never pays for the aggregate query — the same ordering
     * the entitlement gate above follows.
     */
    const spent = await summariseUsage(
      row.id,
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    )
    const ceiling = ceilingVerdict(spent.costMicros)

    if (!ceiling.ok) {
      return `${ceiling.error} Reading still works.`
    }

    if (name === "draft_angle") {
      /**
       * The draft count, which bounds the number of pieces rather than the
       * money — two different questions, and AGENTS.md is explicit that
       * conflating them is how a ceiling ends up counting the wrong thing. A
       * cheap day of twenty drafts is still twenty drafts nobody asked for.
       *
       * `draftAngle` also holds a 15s cooldown of its own now, shared with the
       * adapt family. That is the "how often", this is the "how many".
       */
      const written = await draftsToday(row.id)

      if (written >= MCP_DRAFTS_PER_DAY) {
        return `Quincy has drafted ${written} pieces in the last day, which is the ceiling. It picks up again tomorrow — approve what is on /drafts first.`
      }
    }

    return null
  }

  const tools = toMcpTools(chatTools(row), MCP_TOOLS, {
    scopes: parseScopes(session.scopes),
    guard,
  })

  return createMcpHandler(
    (server) => {
      for (const tool of tools) {
        server.registerTool(
          tool.name,
          {
            description: tool.description,
            inputSchema: tool.inputSchema,
          },
          async (args) => {
            /**
             * Only the writes run as the token's user.
             *
             * The six reads take the user as an argument and never resolve a
             * session at all. The two writes are the server actions the web app
             * calls, and those read the session from the request — see
             * `runAsMcpUser` in lib/auth.ts for why the bridge exists and how
             * narrowly it is bound. Widening it to every tool would cost
             * nothing today and would be one less thing stopping the next tool
             * from reaching something it should not.
             */
            const input = (args ?? {}) as Record<string, unknown>

            return tool.scope === "write"
              ? runAsMcpUser({ userId: row.id }, () => tool.run(input))
              : tool.run(input)
          }
        )
      }
    },
    {
      serverInfo: { name: "quincy", version: "1" },
      capabilities: { tools: {} },
    }
  )(request)
})

export { handler as GET, handler as POST }
