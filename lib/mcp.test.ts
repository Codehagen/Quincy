import { tool, type Tool } from "ai"
import { z } from "zod"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  accountVerdict,
  describeScopes,
  forceConsentPrompt,
  MCP_METADATA,
  MCP_REQUESTS_PER_MINUTE,
  MCP_TOOLS,
  mcpGateStep,
  parseScopes,
  rateLimitEntries,
  resetRateLimit,
  scopeFor,
  takeRequest,
  textResult,
  toMcpTools,
} from "./mcp"

/**
 * The MCP adapter, tested for the four things that fail quietly.
 *
 * **What is exposed.** The allow-list is the security boundary. A tool added to
 * lib/chat-tools.ts must not appear over MCP until somebody names it here, and
 * the failure mode of getting that wrong is not an error — it is a bearer token
 * that can suddenly do something nobody agreed to.
 *
 * **What a scope buys.** A read-only token calling a write must be refused by
 * this file, not by the action underneath it. The action would refuse too, but
 * it would do so after resolving a session and reading a row, and a gate that
 * only holds because the thing behind it also holds is not a gate.
 *
 * **What a failure looks like.** An MCP client that gets a 500 has lost the
 * request and has nothing to tell its model. Every throw has to come back as a
 * result the model can read.
 *
 * **What a minute costs.** The counter is process-wide state, which is exactly
 * the kind of thing that is right until two tests run in one process.
 *
 * The tools here are fakes rather than the real `chatTools`, on purpose: what
 * is unproven without this file is the conversion, and building it out of
 * `tool()` and zod is the same shape the real factory produces with none of its
 * database.
 */

function fakeTools(
  overrides: Record<string, Tool> = {}
): Record<string, Tool> {
  const trivial = (name: string) =>
    tool({
      description: `${name} description`,
      inputSchema: z.object({}),
      execute: async () => `${name} ran`,
    })

  return {
    read_riffs: trivial("read_riffs"),
    read_drafts: trivial("read_drafts"),
    read_lineup: trivial("read_lineup"),
    read_numbers: trivial("read_numbers"),
    read_source: tool({
      description: "One delivered item, whole.",
      inputSchema: z.object({ ref: z.string() }),
      execute: async ({ ref }) => `read ${ref}`,
    }),
    read_story: trivial("read_story"),
    capture_riff: tool({
      description: "Turn text into a riff.",
      inputSchema: z.object({ text: z.string() }),
      execute: async ({ text }) => `captured ${text}`,
    }),
    draft_angle: trivial("draft_angle"),

    // Present in the chat and deliberately absent from MCP.
    read_channels: trivial("read_channels"),
    read_sources: trivial("read_sources"),

    ...overrides,
  }
}

beforeEach(() => {
  resetRateLimit()
})

afterEach(() => {
  vi.restoreAllMocks()
})

const BOTH = ["read", "write"]

describe("the allow-list", () => {
  it("maps the eight and nothing else", () => {
    const mapped = toMcpTools(fakeTools(), MCP_TOOLS, { scopes: BOTH })

    expect(mapped.map((t) => t.name)).toEqual([
      "read_riffs",
      "read_drafts",
      "read_lineup",
      "read_numbers",
      "read_source",
      "read_story",
      "capture_riff",
      "draft_angle",
    ])
  })

  it("leaves the chat's channel and source reads out", () => {
    const names = toMcpTools(fakeTools(), MCP_TOOLS, { scopes: BOTH }).map(
      (t) => t.name
    )

    expect(names).not.toContain("read_channels")
    expect(names).not.toContain("read_sources")
  })

  it("omits a name the factory does not produce rather than registering it", () => {
    const mapped = toMcpTools(fakeTools(), ["read_riffs", "approve_version"], {
      scopes: BOTH,
    })

    expect(mapped.map((t) => t.name)).toEqual(["read_riffs"])
  })

  it("omits a tool that has no execute, because it could only fail", () => {
    const mapped = toMcpTools(
      {
        read_riffs: { description: "no body", inputSchema: z.object({}) } as Tool,
      },
      ["read_riffs"],
      { scopes: BOTH }
    )

    expect(mapped).toEqual([])
  })

  it("carries the description and the schema across", () => {
    const [source] = toMcpTools(fakeTools(), ["read_source"], { scopes: BOTH })

    expect(source.description).toBe("One delivered item, whole.")
    expect(source.inputSchema.safeParse({ ref: "#282" }).success).toBe(true)
    expect(source.inputSchema.safeParse({}).success).toBe(false)
  })
})

describe("scopes", () => {
  it("calls the two writers writes and everything else a read", () => {
    expect(scopeFor("capture_riff")).toBe("write")
    expect(scopeFor("draft_angle")).toBe("write")
    expect(scopeFor("read_riffs")).toBe("read")
  })

  it("splits a token's scope string on whitespace", () => {
    expect([...parseScopes("openid profile email read write")]).toEqual([
      "openid",
      "profile",
      "email",
      "read",
      "write",
    ])
    expect(parseScopes(null).size).toBe(0)
    expect(parseScopes("  read   ").has("read")).toBe(true)
  })

  it("refuses capture_riff on a read-only token, without running it", async () => {
    const execute = vi.fn(async () => "captured")
    const tools = fakeTools({
      capture_riff: tool({
        description: "Turn text into a riff.",
        inputSchema: z.object({ text: z.string() }),
        execute,
      }),
    })

    const [capture] = toMcpTools(tools, ["capture_riff"], { scopes: ["read"] })
    const result = await capture.run({ text: "something" })

    expect(execute).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toContain("write")
  })

  it("lets a read through on a read-only token", async () => {
    const [riffs] = toMcpTools(fakeTools(), ["read_riffs"], {
      scopes: ["read"],
    })

    const result = await riffs.run({})

    expect(result.isError).toBeUndefined()
    expect(result.content[0].text).toBe("read_riffs ran")
  })

  it("refuses everything on a token carrying only the OpenID scopes", async () => {
    const [riffs] = toMcpTools(fakeTools(), ["read_riffs"], {
      scopes: parseScopes("openid profile email"),
    })

    expect((await riffs.run({})).isError).toBe(true)
  })
})

describe("the guard", () => {
  it("refuses with the sentence it was given, before spending", async () => {
    const execute = vi.fn(async () => "drafted")
    const tools = fakeTools({
      draft_angle: tool({
        description: "Write an angle into a draft.",
        inputSchema: z.object({}),
        execute,
      }),
    })

    const [draft] = toMcpTools(tools, ["draft_angle"], {
      scopes: BOTH,
      guard: async () => "Your free day is over.",
    })

    const result = await draft.run({})

    expect(execute).not.toHaveBeenCalled()
    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("Your free day is over.")
  })

  it("stays out of the way when it has nothing to say", async () => {
    const guard = vi.fn(async () => null)

    const [riffs] = toMcpTools(fakeTools(), ["read_riffs"], {
      scopes: BOTH,
      guard,
    })

    expect((await riffs.run({})).content[0].text).toBe("read_riffs ran")
    expect(guard).toHaveBeenCalledWith({ name: "read_riffs", scope: "read" })
  })
})

describe("results", () => {
  it("turns a tool's prose into exactly one text block", async () => {
    const [source] = toMcpTools(fakeTools(), ["read_source"], { scopes: BOTH })

    const result = await source.run({ ref: "#282" })

    expect(result.content).toEqual([{ type: "text", text: "read #282" }])
    expect(result.content).toHaveLength(1)
  })

  it("stringifies a result that is not prose rather than dropping it", () => {
    expect(textResult({ waiting: 3 }).content[0].text).toContain('"waiting": 3')
  })

  it("turns a throw into an error result, never a 500", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    const tools = fakeTools({
      read_riffs: tool({
        description: "The raw material waiting.",
        inputSchema: z.object({}),
        // Typed, because `tool()` infers the output from the callback and a
        // body that only throws infers as `never`.
        execute: async (): Promise<string> => {
          throw new Error("Neon said no")
        },
      }),
    })

    const [riffs] = toMcpTools(tools, ["read_riffs"], { scopes: BOTH })

    // The assertion that matters is that this resolves at all: a rejection here
    // becomes a 500 at the route and the client loses the whole request.
    const result = await riffs.run({})

    expect(result.isError).toBe(true)
    expect(result.content[0].text).toBe("read_riffs failed: Neon said no")
  })

  it("survives a throw that is not an Error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {})

    const tools = fakeTools({
      read_riffs: tool({
        description: "The raw material waiting.",
        inputSchema: z.object({}),
        execute: async (): Promise<string> => {
          throw "nope"
        },
      }),
    })

    const [riffs] = toMcpTools(tools, ["read_riffs"], { scopes: BOTH })

    expect((await riffs.run({})).content[0].text).toContain("unknown failure")
  })
})

describe("the per-minute counter", () => {
  it("counts down and then refuses", () => {
    const now = 1_000_000

    for (let i = 0; i < MCP_REQUESTS_PER_MINUTE; i += 1) {
      const verdict = takeRequest("usr_1", now)
      expect(verdict.ok).toBe(true)
    }

    const refused = takeRequest("usr_1", now)

    expect(refused.ok).toBe(false)
    if (!refused.ok) {
      expect(refused.retryAfterSeconds).toBe(60)
    }
  })

  it("counts each account separately", () => {
    const now = 2_000_000

    for (let i = 0; i < MCP_REQUESTS_PER_MINUTE; i += 1) {
      takeRequest("usr_1", now)
    }

    expect(takeRequest("usr_1", now).ok).toBe(false)
    expect(takeRequest("usr_2", now).ok).toBe(true)
  })

  it("opens the window again once the minute has passed", () => {
    const now = 3_000_000

    for (let i = 0; i < MCP_REQUESTS_PER_MINUTE; i += 1) {
      takeRequest("usr_1", now)
    }

    expect(takeRequest("usr_1", now).ok).toBe(false)
    expect(takeRequest("usr_1", now + 60_000).ok).toBe(true)
  })

  it("reports what is left, so a refusal is never a surprise", () => {
    const first = takeRequest("usr_1", 4_000_000)

    expect(first.ok && first.remaining).toBe(MCP_REQUESTS_PER_MINUTE - 1)
  })
})

describe("the rate-limit map", () => {
  it("drops closed windows once it is worth sweeping", () => {
    const now = 5_000_000

    for (let i = 0; i < 1_000; i += 1) {
      takeRequest(`usr_${i}`, now)
    }

    expect(rateLimitEntries()).toBe(1_000)

    // A minute later every one of those windows has closed. The next arrival
    // is what triggers the sweep, so the map holds that one and nothing else.
    const verdict = takeRequest("usr_late", now + 60_001)

    expect(verdict.ok).toBe(true)
    expect(rateLimitEntries()).toBe(1)
  })

  it("never sweeps a window that is still open", () => {
    const now = 6_000_000

    for (let i = 0; i < 1_000; i += 1) {
      takeRequest(`usr_${i}`, now)
    }

    // Same second: the sweep runs, finds nothing closed, and reclaims nothing.
    // A window that is still counting must survive it.
    expect(takeRequest("usr_new", now).ok).toBe(true)
    expect(rateLimitEntries()).toBe(1_001)

    for (let i = 1; i < MCP_REQUESTS_PER_MINUTE; i += 1) {
      takeRequest("usr_0", now)
    }

    expect(takeRequest("usr_0", now).ok).toBe(false)
  })
})

/**
 * The authorization server's own rules. They live in lib/mcp-gate.ts and are
 * re-exported here; lib/auth.ts imports them from there so the file that builds
 * `betterAuth()` does not inherit this file's import graph.
 *
 * Every one of these is a claim that used to be made by a comment and by
 * docs/mcp.md and by nothing that runs.
 */
describe("the before-hook's decision", () => {
  it("forces consent on the authorization request", () => {
    expect(mcpGateStep("/mcp/authorize")).toBe("force-consent")
  })

  it("requires a session to register a client", () => {
    expect(mcpGateStep("/mcp/register")).toBe("require-session")
  })

  it("leaves every other path alone", () => {
    for (const path of [
      "/mcp/token",
      "/mcp/get-session",
      "/get-session",
      "/sign-in/email",
      "/oauth2/consent",
      // The prefix trap proxy.ts had. A path that merely starts with one of
      // ours must not inherit its rule.
      "/mcp/authorize-something",
      "/mcp/registered",
    ]) {
      expect(mcpGateStep(path)).toBe("pass")
    }
  })
})

describe("forcing the consent prompt", () => {
  it("adds consent when the client asked for nothing", () => {
    const query: Record<string, unknown> = {
      client_id: "abc",
      response_type: "code",
    }

    forceConsentPrompt(query)

    expect(query.prompt).toBe("consent")
  })

  it("overwrites a prompt that would skip the screen", () => {
    // `none` is the one a client sends when it wants a token without a person
    // in the loop, and the plugin compares the whole string to "consent".
    for (const prompt of ["none", "login", "select_account", "none consent"]) {
      const query: Record<string, unknown> = { prompt }
      forceConsentPrompt(query)
      expect(query.prompt).toBe("consent")
    }
  })

  it("mutates in place rather than replacing the object", () => {
    // Load-bearing: a before-hook is handed a shallow copy of the context, so
    // a new object would be thrown away and the endpoint would read the old
    // query. Same reference in, same reference out.
    const query: Record<string, unknown> = { state: "xyz" }

    expect(forceConsentPrompt(query)).toBe(query)
    expect(query.state).toBe("xyz")
  })

  it("survives a request that carried no query at all", () => {
    expect(forceConsentPrompt(undefined)).toBeUndefined()
    expect(forceConsentPrompt(null)).toBeNull()
  })
})

describe("the advertised metadata", () => {
  it("names the two scopes that decide anything", () => {
    // The bug this pins: the plugin builds
    // /.well-known/oauth-authorization-server from the *top-level* `metadata`
    // and the protected-resource document from `oidcConfig.metadata`. Only the
    // second was set, so a client reading RFC 8414 never saw these two.
    expect(MCP_METADATA.scopes_supported).toContain("read")
    expect(MCP_METADATA.scopes_supported).toContain("write")
  })

  it("keeps the four OpenID scopes the provider always issues", () => {
    expect(MCP_METADATA.scopes_supported).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "read",
      "write",
    ])
  })
})

describe("the consent screen's wording", () => {
  it("says what read and write buy, in that order", () => {
    expect(describeScopes(["write", "read"])).toEqual([
      "Read your riffs, drafts, lineup, numbers and stories",
      "Capture riffs and write drafts in your name — never approve or publish",
    ])
  })

  it("folds profile and email into the one line openid already says", () => {
    const lines = describeScopes(["openid", "profile", "email"])

    expect(lines).toHaveLength(1)
    expect(lines[0]).toContain("your name and email address")
  })

  it("shows a scope it does not recognise rather than hiding it", () => {
    expect(describeScopes(["read", "admin"])).toEqual([
      "Read your riffs, drafts, lineup, numbers and stories",
      "admin",
    ])
  })

  it("says nothing when nothing was asked for", () => {
    expect(describeScopes([])).toEqual([])
  })
})

describe("the account behind a live token", () => {
  it("lets an ordinary account through", () => {
    expect(accountVerdict({ banned: false })).toEqual({ ok: true })
    expect(accountVerdict({ banned: null })).toEqual({ ok: true })
    expect(accountVerdict({})).toEqual({ ok: true })
  })

  it("answers 401 for an account that was banned after the token was minted", () => {
    // `withMcpAuth` checks the token and stops. Banning ends the browser
    // sessions and leaves `oauth_access_token` alone, so this is the only
    // thing between a banned account and an hour of reads — plus a week of
    // refreshes after that.
    expect(accountVerdict({ banned: true })).toEqual({
      ok: false,
      status: 401,
      error: "This account is suspended.",
    })
  })

  it("answers 401 for an account that no longer exists", () => {
    expect(accountVerdict(null)).toEqual({
      ok: false,
      status: 401,
      error: "No such account.",
    })
    expect(accountVerdict(undefined).ok).toBe(false)
  })
})
