import type { Tool } from "ai"
import { and, eq, gte, sql } from "drizzle-orm"
import { z } from "zod"

import { db } from "./db"
import { DRAFTING_MODEL } from "./drafting"
import { usageEvent } from "./schema-app"

/**
 * The authorization-server rules, re-exported so this file stays the one front
 * door to the MCP surface. They are declared in lib/mcp-gate.ts because
 * lib/auth.ts reads them too and must not inherit this file's import graph —
 * the header of that file has the argument.
 */
export {
  accountVerdict,
  atAgentLimit,
  describeScopes,
  isAdminOAuthPath,
  readAgentRegistration,
  MCP_CLIENT_NAME_MAX,
  MCP_CLIENTS_PER_USER,
  MCP_CONSENT_ENDPOINT,
  MCP_CONSENT_PAGE,
  MCP_RESOURCE,
  MCP_SCOPES_SUPPORTED,
  type AgentRegistration,
  type McpAccountVerdict,
} from "./mcp-gate"

/**
 * Quincy as a tool an outside agent can call.
 *
 * The Studio chat already has tools (lib/chat-tools.ts). This file does not
 * write a second set of them — it converts the ones that exist into the shape
 * the Model Context Protocol wants, so an agent reaching Quincy over OAuth sees
 * exactly what the chat sees and nothing more. A second implementation is a
 * second thing to keep true, and the money path is the half that goes wrong.
 *
 * ## Eight tools, and the four that are missing on purpose
 *
 * Six read, two write. `read_channels` and `read_sources` are left out because
 * they describe connections and grants rather than material, and an outside
 * agent has no business enumerating which platforms an account holds.
 *
 * **Nothing here approves, schedules or publishes, and nothing ever will.**
 * That is the product's single invariant — docs/vision.md: *Quincy drafts, you
 * send*. `approveVersion`, the lineup writes and lib/publish.ts are absent from
 * this file by design, not by omission, and a future tool that could reach them
 * would make a bearer token the one thing in the product that can put writing
 * out under somebody's name without a person pressing Approve. The token is
 * held by a program. That is the whole argument.
 *
 * ## Scopes
 *
 * Two, and they mean what they say. `read` opens the six reads. `write` is
 * required for `capture_riff` and `draft_angle`, which are the two that cost
 * money — and `write` still cannot approve anything.
 *
 * **What a leaked token is worth, stated honestly.** It reads everything the
 * account holds — every riff, every draft, the lineup, the numbers, the
 * stories — and with `write` it can spend a model call and leave a draft on
 * /drafts. It cannot approve, schedule or publish. The controls are the
 * consent screen the owner passes through to mint it (lib/mcp-gate.ts) and
 * the removal on /settings, which revokes the refresh token and drops the
 * consent. A 1.7 access token is a signed JWT with no row behind it, so the
 * hour it has left is the one thing removal cannot take back.
 */

/** The reads. None of these spends anything; all are bounded strings. */
export const MCP_READ_TOOLS = [
  "read_riffs",
  "read_drafts",
  "read_lineup",
  "read_numbers",
  "read_source",
  "read_story",
] as const

/** The writes. Both cost a model call and neither can publish. */
export const MCP_WRITE_TOOLS = ["capture_riff", "draft_angle"] as const

/** The allow-list, and the whole of the MCP surface. */
export const MCP_TOOLS = [...MCP_READ_TOOLS, ...MCP_WRITE_TOOLS] as const

export type McpScope = "read" | "write"

/** Advertised in the discovery metadata and asked for at authorization. */
export const MCP_SCOPES: McpScope[] = ["read", "write"]

const WRITE_SET = new Set<string>(MCP_WRITE_TOOLS)

/** Which scope a tool needs. Anything not named a write is a read. */
export function scopeFor(name: string): McpScope {
  return WRITE_SET.has(name) ? "write" : "read"
}

/**
 * The scopes on an access token, as a set.
 *
 * They arrive on the verified access token's `scope` claim, space-separated
 * (`effectiveScopes.join(" ")`), alongside the OpenID ones the provider always
 * issues. Splitting on any whitespace rather than a single space so a token
 * minted by hand with a tab in it is not silently read as one long scope.
 */
export function parseScopes(raw: string | null | undefined): Set<string> {
  return new Set(
    (raw ?? "")
      .split(/\s+/)
      .map((scope) => scope.trim())
      .filter(Boolean)
  )
}

/** One text block, which is the only content type these tools produce. */
export type McpToolResult = {
  content: { type: "text"; text: string }[]
  isError?: boolean
}

/**
 * A tool answer as MCP content.
 *
 * Every tool in lib/chat-tools.ts returns prose — a sentence a model repeats to
 * a person, not rows a program reads — so the conversion is one text block and
 * nothing else. A tool that ever returns something structured is stringified
 * rather than dropped, because a result the client cannot see is worse than an
 * ugly one.
 */
export function textResult(value: unknown, isError = false): McpToolResult {
  const text =
    typeof value === "string"
      ? value
      : value === undefined
        ? ""
        : JSON.stringify(value, null, 2)

  return isError
    ? { content: [{ type: "text", text }], isError: true }
    : { content: [{ type: "text", text }] }
}

/**
 * A refusal that runs before the tool does, or null to let it through.
 *
 * This is where entitlement and the daily ceiling land. It returns a sentence
 * rather than a boolean for the same reason the chat tools return prose: the
 * caller is a model, and "your free day is over" and "twenty drafts already"
 * want different next moves from it.
 */
export type McpGuard = (tool: {
  name: string
  scope: McpScope
}) => string | null | Promise<string | null>

export type McpTool = {
  name: string
  description: string
  /** A Standard Schema, ready for `server.registerTool`. */
  inputSchema: z.ZodType
  scope: McpScope
  run: (input: Record<string, unknown>) => Promise<McpToolResult>
}

/**
 * The AI SDK declares `inputSchema` as a flexible schema: a zod object, or the
 * output of `jsonSchema()`. MCP's registration wants a Standard Schema, which
 * zod v4 satisfies and a raw JSON Schema does not.
 *
 * All eight tools use zod today. A tool that ever arrives with a JSON Schema is
 * registered as an open object rather than refused — losing the argument names
 * in the listing is a worse tool, and dropping the tool entirely is no tool at
 * all.
 */
function asStandardSchema(schema: unknown): z.ZodType {
  if (schema && typeof schema === "object" && "~standard" in schema) {
    return schema as z.ZodType
  }
  return z.object({}).catchall(z.unknown())
}

/**
 * Convert the chat's tools into MCP tools, keeping only the names allowed.
 *
 * The allow-list is positive and it is the security boundary: a tool added to
 * lib/chat-tools.ts tomorrow does not appear over MCP until somebody names it
 * here. A name in the list that the factory does not produce is skipped rather
 * than registered as a broken tool.
 *
 * Order follows the allow-list, not the factory, so the listing an agent reads
 * is stable whatever order the tools happen to be declared in.
 */
export function toMcpTools(
  tools: Record<string, Tool>,
  allowed: readonly string[] = MCP_TOOLS,
  options: {
    /** The scopes the caller's token actually carries. */
    scopes?: Iterable<string>
    /** Entitlement, ceilings — anything that can refuse before we spend. */
    guard?: McpGuard
  } = {}
): McpTool[] {
  const granted = new Set(options.scopes ?? [])
  const guard = options.guard

  const mapped: McpTool[] = []

  for (const name of allowed) {
    const tool = tools[name]
    if (!tool?.execute) {
      continue
    }

    const scope = scopeFor(name)
    const execute = tool.execute

    mapped.push({
      name,
      // The AI SDK allows a description to be a function of the call context.
      // MCP's listing is a static document, so a dynamic description has no
      // context to be computed from — the name is the honest fallback.
      description:
        typeof tool.description === "string" ? tool.description : name,
      inputSchema: asStandardSchema(tool.inputSchema),
      scope,
      run: async (input) => {
        if (!granted.has(scope)) {
          return textResult(
            `This token does not carry the “${scope}” scope, so ${name} is not available to it. Ask for ${scope} at authorization and connect again.`,
            true
          )
        }

        if (guard) {
          const refusal = await guard({ name, scope })
          if (refusal) {
            return textResult(refusal, true)
          }
        }

        try {
          // The second argument is the AI SDK's tool-call context. Nothing in
          // lib/chat-tools.ts reads it, and passing an empty object is honest
          // rather than a stub that pretends to carry a message history.
          const result = await execute(input, {
            toolCallId: `mcp_${name}`,
            messages: [],
          } as never)

          return textResult(result)
        } catch (cause) {
          /**
           * A throw becomes a tool error, never a 500.
           *
           * An MCP client that gets a 500 has lost the whole request and has
           * nothing to tell its model. An `isError` result is a sentence the
           * model can read and act on, and it keeps the session alive for the
           * next call. The message only — a stack trace over the wire tells a
           * stranger about the inside of the server.
           */
          console.error(`[mcp] ${name} failed:`, cause)
          const message =
            cause instanceof Error ? cause.message : "unknown failure"
          return textResult(`${name} failed: ${message}`, true)
        }
      },
    })
  }

  return mapped
}

/**
 * Sixty requests a minute per user, counted in this process.
 *
 * A ceiling, per AGENTS.md, on a path that a program drives rather than a
 * person: nothing here spends money on its own, but every call is a Neon round
 * trip and an agent in a loop makes them as fast as the network allows.
 *
 * **In-memory, and that is a tripwire rather than a wall.** This deploys to
 * Fluid Compute, so a cold start gets a fresh counter and two concurrent
 * instances never see each other's — the same limitation lib/auth.ts names for
 * better-auth's default rate-limit storage, which is why *that* one is on the
 * database. The difference is what is being protected: this bounds chatter, and
 * the two things that cost real money are bounded by the entitlement gate and
 * by `draftsToday` below, both of which read the database and both of which
 * hold across instances.
 */
export const MCP_REQUESTS_PER_MINUTE = 60

const RATE_WINDOW_MS = 60_000

const requestCounts = new Map<string, { count: number; resetAt: number }>()

/**
 * When the map is allowed to grow before it is swept.
 *
 * An entry costs a user id and two numbers, and it is only ever read again if
 * that account calls back inside the same minute — so on a long-lived instance
 * the map is a list of everyone who has ever connected, not a rate limiter's
 * working set. A thousand is far past any plausible concurrent-minute count for
 * this product and small enough that the sweep is never worth measuring.
 */
const RATE_MAP_SWEEP_AT = 1_000

/**
 * Drop every window that has already closed.
 *
 * Opportunistic rather than scheduled: a timer would keep a serverless instance
 * alive to tidy a map, which costs more than the map does. An expired entry is
 * already treated as absent by `takeRequest`, so this only reclaims memory and
 * can never change a verdict.
 */
function sweepExpired(now: number): void {
  for (const [userId, window] of requestCounts) {
    if (window.resetAt <= now) {
      requestCounts.delete(userId)
    }
  }
}

export type RateVerdict =
  { ok: true; remaining: number } | { ok: false; retryAfterSeconds: number }

/**
 * Count one request against a user's minute, and say whether it may proceed.
 *
 * `now` is a parameter so a test can walk the clock instead of sleeping
 * through a real minute.
 */
export function takeRequest(userId: string, now = Date.now()): RateVerdict {
  const current = requestCounts.get(userId)

  if (!current || current.resetAt <= now) {
    // Before the insert, so the sweep is what makes room rather than something
    // that runs after the map has already grown past the bound.
    if (requestCounts.size >= RATE_MAP_SWEEP_AT) {
      sweepExpired(now)
    }

    requestCounts.set(userId, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return { ok: true, remaining: MCP_REQUESTS_PER_MINUTE - 1 }
  }

  if (current.count >= MCP_REQUESTS_PER_MINUTE) {
    return {
      ok: false,
      retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
    }
  }

  current.count += 1
  return { ok: true, remaining: MCP_REQUESTS_PER_MINUTE - current.count }
}

/** Test-only. The map is process-wide and one test would leak into the next. */
export function resetRateLimit(): void {
  requestCounts.clear()
}

/** Test-only. How many windows are being held, which is what the sweep bounds. */
export function rateLimitEntries(): number {
  return requestCounts.size
}

/**
 * How many drafts this account may have written in a day, over any surface.
 *
 * Twenty is a tripwire and not a product limit: the live database holds four
 * drafts in total, so an account that writes twenty in a day is a script rather
 * than a person. `draft_angle` is the only tool here that calls the expensive
 * model, and an agent asked to "draft everything waiting" will happily call it
 * once per angle.
 *
 * The ceiling is on the account rather than on the token, because a wallet does
 * not care which client emptied it — the same argument lib/chat-guards.ts makes
 * for sharing one day ceiling across two routes.
 */
export const MCP_DRAFTS_PER_DAY = 20

/**
 * Drafts written in the last 24 hours, counted from the metering rows.
 *
 * `draftAngle` writes exactly one `usage_event` per call, tagged with
 * `DRAFTING_MODEL`, whether the generation succeeded or failed — which is what
 * a ceiling must count, since a failed generation was still paid for.
 *
 * A trailing window rather than the calendar day, for the same reason the chat
 * route uses one: a session either side of midnight would otherwise get two
 * days' worth.
 */
export async function draftsToday(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000)

  const [row] = await db
    .select({ drafts: sql<number>`count(*)::int` })
    .from(usageEvent)
    .where(
      and(
        eq(usageEvent.userId, userId),
        eq(usageEvent.model, DRAFTING_MODEL),
        gte(usageEvent.createdAt, since)
      )
    )

  return row?.drafts ?? 0
}
