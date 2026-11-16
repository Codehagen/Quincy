import { afterEach, describe, expect, it, vi } from "vitest"

/**
 * The base-URL guard, in the three environments that behave differently.
 *
 * A file of its own rather than more cases in lib/mcp.test.ts, because every
 * assertion here needs a *fresh module evaluation* — the throw is at import,
 * which is the whole point of it — and `vi.resetModules()` around a re-import
 * is easier to keep honest when it is the only thing a file does.
 *
 * Written on 2026-09-10, after preview builds had been failing since
 * 2026-08-28 with nobody watching. The regression was invisible for thirteen
 * days because no pull request was opened in that window, which is exactly the
 * kind of gap a unit test closes and a green pipeline does not.
 */
describe("the base URL the MCP server publishes as its own", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  async function load() {
    vi.resetModules()
    return import("./mcp-gate")
  }

  it("uses BETTER_AUTH_URL when it is set, everywhere", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BETTER_AUTH_URL", "https://hirequincy.com")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", "quincy-xyz.vercel.app")

    // An explicit value wins over the deployment's own hostname: somebody wrote
    // it down on purpose, and a preview that was given a name uses that name.
    const { MCP_RESOURCE } = await load()
    expect(MCP_RESOURCE).toBe("https://hirequincy.com/api/mcp")
  })

  it("lets a preview derive its identity from its own hostname", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BETTER_AUTH_URL", undefined)
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", "quincy-xyz.vercel.app")

    // The build that used to fail here. A preview answers only on this host, so
    // this is the correct issuer, audience and OAuth resource for it.
    const { MCP_RESOURCE } = await load()
    expect(MCP_RESOURCE).toBe("https://quincy-xyz.vercel.app/api/mcp")
  })

  it("still refuses to boot in production with no name", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("BETTER_AUTH_URL", undefined)
    vi.stubEnv("VERCEL_ENV", "production")
    vi.stubEnv("VERCEL_URL", "quincy-abc.vercel.app")

    // Deliberately NOT derived from VERCEL_URL. The production deployment's
    // name is written down once; inferring it from a URL that changes on every
    // push would publish a different issuer per deploy and invalidate every
    // token signed by the last one.
    await expect(load()).rejects.toThrow(/BETTER_AUTH_URL is not set/)
  })
})
