import { readFile } from "node:fs/promises"

import { tool, type Tool } from "ai"
import { z } from "zod"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import {
  accountVerdict,
  atAgentLimit,
  describeScopes,
  isAdminOAuthPath,
  MCP_CLIENT_NAME_MAX,
  MCP_CLIENTS_PER_USER,
  MCP_REQUESTS_PER_MINUTE,
  MCP_RESOURCE,
  MCP_SCOPES_SUPPORTED,
  MCP_TOOLS,
  parseScopes,
  rateLimitEntries,
  readAgentRegistration,
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

function fakeTools(overrides: Record<string, Tool> = {}): Record<string, Tool> {
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
        read_riffs: {
          description: "no body",
          inputSchema: z.object({}),
        } as Tool,
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
 * Three of the old suites are gone with the code they covered:
 * `mcpGateStep` and `forceConsentPrompt` (the 1.7 provider requires consent
 * whenever no stored consent covers the scopes, so nothing has to force the
 * prompt) and the registration gate (dynamic registration is off, so there is
 * no unauthenticated POST to refuse). `MCP_METADATA` is gone too: the provider
 * builds both discovery documents from one `scopes` list.
 */
describe("the advertised scopes", () => {
  it("names the two that decide anything", () => {
    expect(MCP_SCOPES_SUPPORTED).toContain("read")
    expect(MCP_SCOPES_SUPPORTED).toContain("write")
  })

  it("keeps the four OpenID scopes the provider always issues", () => {
    expect([...MCP_SCOPES_SUPPORTED]).toEqual([
      "openid",
      "profile",
      "email",
      "offline_access",
      "read",
      "write",
    ])
  })
})

describe("the protected resource", () => {
  /**
   * The plugin refuses to boot on a resource it cannot bind a token to, and
   * `requireMcpAuth` refuses every token whose audience is not this exact
   * string. Both read the same constant, so what is worth asserting is the
   * shape the plugin validates: absolute, no query, no fragment.
   */
  it("is an absolute URL ending at the MCP route", () => {
    const url = new URL(MCP_RESOURCE)

    expect(url.pathname).toBe("/api/mcp")
    expect(url.search).toBe("")
    expect(url.hash).toBe("")
    expect(["https:", "http:"]).toContain(url.protocol)
  })
})

/**
 * Registering an agent by hand, which is the path a client without a Client ID
 * Metadata Document takes. Every rule here is one the provider would also
 * enforce, and the reason to enforce it twice is the error: the endpoint
 * answers `invalid_redirect_uri` with a sentence about application types, and
 * the person reading it typed a URL into a form.
 */
describe("registering an agent", () => {
  const ok = {
    name: "My terminal agent",
    redirectUri: "https://agent.example.com/cb",
  }

  it("takes an https redirect on a public host as a web client", () => {
    expect(readAgentRegistration(ok)).toEqual({
      ok: true,
      name: "My terminal agent",
      redirectUri: "https://agent.example.com/cb",
      applicationType: "web",
    })
  })

  it("takes http on the three loopback names as a native client", () => {
    for (const uri of [
      "http://127.0.0.1:33418/callback",
      "http://localhost:8976/cb",
      "http://[::1]:4000/cb",
    ]) {
      const result = readAgentRegistration({ ...ok, redirectUri: uri })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.applicationType).toBe("native")
    }
  })

  it("takes the whole 127.0.0.0/8 range, which is what RFC 8252 says", () => {
    // The provider's own `isLoopbackIP` accepts the range, so a form that took
    // only 127.0.0.1 refused URIs the endpoint would have accepted — and
    // refused them with a sentence listing three spellings, none of which was
    // the one the agent printed. 127.0.0.53 is a stub resolver's address and
    // agents do print it.
    for (const uri of [
      "http://127.0.0.2:9000/cb",
      "http://127.0.0.53:9000/cb",
      "http://127.1.2.3:9000/cb",
    ]) {
      const result = readAgentRegistration({ ...ok, redirectUri: uri })
      expect(result.ok).toBe(true)
      if (result.ok) expect(result.applicationType).toBe("native")
    }
  })

  it("does not read a public host that merely starts with 127 as loopback", () => {
    // The test is on the octet, not on the prefix: 127.example.com and
    // 1270.0.0.1 are not loopback and an authorization code sent to either
    // leaves this machine.
    for (const uri of [
      "http://127.example.com/cb",
      "http://1270.0.0.1/cb",
      "http://12.7.0.1/cb",
    ]) {
      expect(readAgentRegistration({ ...ok, redirectUri: uri }).ok).toBe(false)
    }
  })

  it("refuses http on anything that is not loopback", () => {
    // The whole point of the rule: an authorization code sent in the clear to
    // a host that is not this machine.
    const result = readAgentRegistration({
      ...ok,
      redirectUri: "http://agent.example.com/cb",
    })

    expect(result.ok).toBe(false)
  })

  it("refuses https on loopback, which the provider would refuse too", () => {
    // `web` refuses loopback and `native` refuses https loopback, so there is
    // no application type this could be registered under.
    expect(
      readAgentRegistration({ ...ok, redirectUri: "https://127.0.0.1:9000/cb" })
        .ok
    ).toBe(false)
  })

  it("refuses a scheme that is neither", () => {
    for (const uri of [
      "vscode://callback",
      "com.example.app:/cb",
      "javascript:alert(1)",
      "not a url",
    ]) {
      expect(readAgentRegistration({ ...ok, redirectUri: uri }).ok).toBe(false)
    }
  })

  it("refuses a redirect URI carrying a fragment or credentials", () => {
    expect(
      readAgentRegistration({
        ...ok,
        redirectUri: "https://a.example.com/cb#x",
      }).ok
    ).toBe(false)
    expect(
      readAgentRegistration({
        ...ok,
        redirectUri: "https://user:pw@a.example.com/cb",
      }).ok
    ).toBe(false)
  })

  it("trims the name and refuses an empty one", () => {
    const trimmed = readAgentRegistration({ ...ok, name: "  Codex  " })
    expect(trimmed.ok && trimmed.name).toBe("Codex")

    expect(readAgentRegistration({ ...ok, name: "   " }).ok).toBe(false)
  })

  it("refuses a name longer than the label it has to fit in", () => {
    expect(
      readAgentRegistration({ ...ok, name: "a".repeat(MCP_CLIENT_NAME_MAX) }).ok
    ).toBe(true)
    expect(
      readAgentRegistration({
        ...ok,
        name: "a".repeat(MCP_CLIENT_NAME_MAX + 1),
      }).ok
    ).toBe(false)
  })

  it("refuses an empty redirect URI rather than registering a client that cannot be used", () => {
    expect(readAgentRegistration({ ...ok, redirectUri: "  " }).ok).toBe(false)
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
    // `requireMcpAuth` verifies the token's signature and stops. Banning ends
    // the browser sessions and cannot reach a JWT that is already signed, so
    // this is the only thing between a banned account and the hour that token
    // has left.
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

/**
 * The provider's admin OAuth surface, and why a predicate exists for it.
 *
 * `@better-auth/oauth-provider` registers seven endpoints under
 * `/admin/oauth2`. Every one is gated on `clientPrivileges` or
 * `resourcePrivileges`, and the plugin's own comment says an undefined callback
 * "degrades to any authenticated session can manage resources" — which on a
 * product anyone can sign up for is no gate at all. Admin create takes
 * `skip_consent`; resource update takes `accessTokenTtl` and `disabled`.
 *
 * `lib/auth.ts` answers the whole prefix with 404 from its root before-hook.
 * `disabledPaths` cannot do it: better-auth compares the normalized path with
 * `includes`, an exact match, and two of the seven paths are parameterised.
 */
describe("the admin OAuth prefix", () => {
  it("matches the flat admin endpoints", () => {
    expect(isAdminOAuthPath("/admin/oauth2/create-client")).toBe(true)
    expect(isAdminOAuthPath("/admin/oauth2/update-client")).toBe(true)
    expect(isAdminOAuthPath("/admin/oauth2/resources")).toBe(true)
  })

  it("matches the parameterised resource endpoints, which a list cannot", () => {
    expect(isAdminOAuthPath("/admin/oauth2/resources/x")).toBe(true)
    expect(
      isAdminOAuthPath("/admin/oauth2/resources/https%3A%2F%2Fa.example/clients/c")
    ).toBe(true)
    // The prefix itself, so a missing trailing segment is not a way through.
    expect(isAdminOAuthPath("/admin/oauth2")).toBe(true)
  })

  it("leaves the user-scoped endpoints /settings needs alone", () => {
    // These two are the product: Register an agent and Remove. Closing them
    // would take the only sanctioned registration path down with the admin one.
    expect(isAdminOAuthPath("/oauth2/create-client")).toBe(false)
    expect(isAdminOAuthPath("/oauth2/delete-client")).toBe(false)
    expect(isAdminOAuthPath("/oauth2/authorize")).toBe(false)
    // Nothing that merely contains the string.
    expect(isAdminOAuthPath("/oauth2/admin/oauth2/create-client")).toBe(false)
    expect(isAdminOAuthPath("/admin/oauth2-something")).toBe(false)
  })
})

/**
 * The ceiling on registered clients.
 *
 * `oauth_client` is written by a session and a form, so without a bound one
 * account can fill the table as fast as a script can post — and every row shows
 * up on somebody's /settings.
 */
describe("the agent ceiling", () => {
  it("lets an account register up to the limit", () => {
    expect(atAgentLimit(0)).toBe(false)
    expect(atAgentLimit(MCP_CLIENTS_PER_USER - 1)).toBe(false)
  })

  it("refuses at the limit and past it", () => {
    expect(atAgentLimit(MCP_CLIENTS_PER_USER)).toBe(true)
    expect(atAgentLimit(MCP_CLIENTS_PER_USER + 5)).toBe(true)
  })

  it("is a tripwire, not a product limit", () => {
    // Same argument as MCP_DRAFTS_PER_DAY: nobody runs twenty agents, and an
    // account that has twenty is a script.
    expect(MCP_CLIENTS_PER_USER).toBe(20)
  })
})

/**
 * The session bridge, and the assertion that it is gone.
 *
 * `capture_riff` and `draft_angle` used to be the `/riffs` server actions,
 * which read a cookie — so the MCP route ran them inside an `AsyncLocalStorage`
 * and a `/get-session` branch in lib/auth.ts answered from it. That made a
 * bearer token able to produce a session object, which is a thing no route
 * should be able to do.
 *
 * Asserted against the source rather than by standing a route up, the same
 * shape lib/adapt.test.ts uses for the cooldown: what is being pinned is a fact
 * about the files.
 */
describe("the MCP write path", () => {
  it("resolves no session anywhere", async () => {
    const [route, auth, tools] = await Promise.all([
      readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8"),
      readFile(new URL("./auth.ts", import.meta.url), "utf8"),
      readFile(new URL("./chat-tools.ts", import.meta.url), "utf8"),
    ])

    // Code, not prose: all three files still *describe* the bridge in their
    // comments, and that history is worth keeping. What must be gone is the
    // import, the store and every call into it.
    for (const source of [route, auth, tools]) {
      expect(source).not.toContain("node:async_hooks")
      expect(source).not.toContain("new AsyncLocalStorage")
      expect(source).not.toMatch(/runAsMcpUser\(/)
      expect(source).not.toMatch(/mcpActor\./)
    }

    // The hook that answered /get-session from the store, and the import that
    // pulled the actions' session read into the tool factory.
    expect(auth).not.toContain('ctx.path === "/get-session"')
    expect(tools).not.toContain("riffs/actions")

    // The tools take the user they were built with.
    expect(tools).toContain("captureToRiffFor(user.id, text)")
    expect(tools).toContain("draftAngleFor(user.id, angleId)")
  })

  it("still runs every gate the writes had", async () => {
    const [route, writes] = await Promise.all([
      readFile(new URL("../app/api/mcp/route.ts", import.meta.url), "utf8"),
      readFile(new URL("./riff-writes.ts", import.meta.url), "utf8"),
    ])

    // The route's own three, per tool call and before anything is spent.
    expect(route).toContain("isEntitled(entitlement)")
    expect(route).toContain("ceilingVerdict(spent.costMicros)")
    expect(route).toContain("draftsToday(row.id)")

    // The write path's own, which are the ones the bridge used to be needed
    // for: a cooldown on each and an entitlement gate immediately before the
    // spend. Removing the session read must not have removed these with it.
    expect(writes.match(/spendCooldown\(userId, ADAPT_SPEND, 15_000\)/g))
      .toHaveLength(2)
    expect(writes.match(/resolveEntitlementForRequest\(\{ id: userId \}\)/g))
      .toHaveLength(2)
    expect(writes).toContain("spendTag: ADAPT_SPEND")
  })
})
