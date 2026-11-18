import { readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

import {
  captionProblem,
  chooseInstagramAccount,
  countHashtags,
  exchangeInstagramCode,
  grantLooksRevoked,
  insightsFromPayload,
  INSTAGRAM_DAILY_CAP,
  INSTAGRAM_HASHTAG_LIMIT,
  instagramAuthorizeUrl,
  instagramCardPath,
  instagramManualWait,
  INSTAGRAM_MANUAL_COOLDOWN_MS,
  overInstagramDailyCap,
  postIdFromCardFile,
  publicInstagramImageUrl,
  readTokenResponse,
  stripAuthorizationCode,
} from "./instagram"

describe("Unified login", () => {
  it("builds a config_id dialog and does not send a scope", () => {
    const url = new URL(
      instagramAuthorizeUrl({
        appId: "1312197614370991",
        configId: "cfg_1",
        redirectUri: "https://hirequincy.com/api/connect/instagram/callback",
        state: "state",
        version: "v25.0",
      })
    )
    expect(url.origin + url.pathname).toBe(
      "https://www.facebook.com/v25.0/dialog/oauth"
    )
    expect(url.searchParams.get("config_id")).toBe("cfg_1")
    expect(url.searchParams.get("response_type")).toBe("code")
    expect(url.searchParams.get("override_default_response_type")).toBe("true")
    expect(url.searchParams.has("scope")).toBe(false)
    expect(url.searchParams.get("client_id")).toBe("1312197614370991")
  })

  it("reads a non-expiring token as having no expiry", () => {
    expect(
      readTokenResponse({ access_token: "sua", token_type: "bearer" })
    ).toEqual({
      accessToken: "sua",
      expiresAt: null,
    })
  })

  it("strips the fragment Meta appends to the code", () => {
    expect(stripAuthorizationCode("abc#_")).toBe("abc")
  })

  it("exchanges the code on graph.facebook.com and records granted permissions", async () => {
    const fetchImpl = vi.fn()
    fetchImpl
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "sua", token_type: "bearer" }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              { permission: "instagram_basic", status: "granted" },
              { permission: "instagram_content_publish", status: "declined" },
            ],
          }),
          { status: 200 }
        )
      )

    const tokens = await exchangeInstagramCode({
      code: "authcode#_",
      redirectUri: "https://hirequincy.com/api/connect/instagram/callback",
      clientId: "1312197614370991",
      clientSecret: "secret",
      fetchImpl,
      env: { META_GRAPH_VERSION: "v25.0" },
    })

    expect(tokens.accessToken).toBe("sua")
    expect(tokens.refreshToken).toBeNull()
    expect(tokens.expiresAt).toBeNull()
    expect(tokens.scope).toBe("instagram_basic")

    const exchangeUrl = String(fetchImpl.mock.calls[0]?.[0])
    expect(exchangeUrl).toContain("https://graph.facebook.com/v25.0/oauth/access_token")
    expect(exchangeUrl).toContain("code=authcode")
    expect(exchangeUrl).not.toContain("authcode#_")
    expect(String(fetchImpl.mock.calls[1]?.[0])).toContain("/me/permissions")
  })

  it("connects the one shared account and refuses none or several", () => {
    expect(chooseInstagramAccount([{ id: "1789", username: "quincy" }]).id).toBe("1789")
    expect(() => chooseInstagramAccount([])).toThrow(/professional account/)
    expect(() => chooseInstagramAccount([{ id: "1" }, { id: "2" }])).toThrow(/more than one/)
  })
})

describe("caption limits", () => {
  it("allows a caption inside the hashtag cap", () => {
    expect(captionProblem("A post.\n\n#one #two")).toBeNull()
    expect(countHashtags("#one #two")).toBe(2)
  })

  it("rejects the 31st hashtag", () => {
    const tags = Array.from(
      { length: INSTAGRAM_HASHTAG_LIMIT + 1 },
      (_, i) => `#t${i}`
    ).join(" ")
    expect(captionProblem(tags)).toContain("31 hashtags")
  })
})

describe("the public image URL", () => {
  it("builds an https card URL and refuses localhost", () => {
    expect(
      publicInstagramImageUrl("sch_" + "a".repeat(24), {
        BETTER_AUTH_URL: "https://hirequincy.com",
      })
    ).toBe(
      `https://hirequincy.com${instagramCardPath("sch_" + "a".repeat(24))}`
    )
    expect(
      publicInstagramImageUrl("sch_1", {
        BETTER_AUTH_URL: "http://localhost:3000",
      })
    ).toBeNull()
    expect(
      publicInstagramImageUrl("sch_1", {
        BETTER_AUTH_URL: "https://127.0.0.1:3000",
      })
    ).toBeNull()
    expect(publicInstagramImageUrl("sch_1", {})).toBeNull()
  })

  it("only accepts the scheduled-post file name the route serves", () => {
    const id = `sch_${"ab".repeat(12)}`
    expect(postIdFromCardFile(`${id}.jpg`)).toBe(id)
    expect(postIdFromCardFile("sch_1.jpg")).toBeNull()
    expect(postIdFromCardFile("../etc/passwd.jpg")).toBeNull()
  })
})

describe("insights", () => {
  it("maps views onto impressions and leaves a missing quote count at zero", () => {
    expect(
      insightsFromPayload({
        data: [
          { name: "views", values: [{ value: 40 }] },
          { name: "likes", total_value: { value: 3 } },
          { name: "comments", values: [{ value: 1 }] },
          { name: "shares", values: [{ value: 2 }] },
          { name: "saved", values: [{ value: 4 }] },
        ],
      })
    ).toEqual({
      impressions: 40,
      likes: 3,
      replies: 1,
      reposts: 2,
      bookmarks: 4,
      quotes: 0,
    })
  })

  it("returns null when Meta sent no numbers", () => {
    expect(insightsFromPayload({ data: [] })).toBeNull()
  })

  it("treats code 190 as a dead grant", () => {
    expect(grantLooksRevoked('{"error":{"code":190}}')).toBe(true)
    expect(grantLooksRevoked("invalid_grant")).toBe(true)
    expect(grantLooksRevoked('{"error":{"code":100}}')).toBe(false)
  })
})

describe("the card route stays outside the login gate", () => {
  it("does not match the proxy for a .jpg card, and still matches an app page", () => {
    const source = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8")
    const line = source.split("\n").find((row) => row.includes("png|jpg|jpeg"))
    const literal = line?.slice(line.indexOf('"'), line.lastIndexOf('"') + 1)
    const pattern = JSON.parse(literal ?? '""') as string
    const matcher = new RegExp(`^${pattern}$`)
    const card = `/api/media/instagram/sch_${"ab".repeat(12)}.jpg`

    expect(matcher.test(card)).toBe(false)
    expect(matcher.test("/drafts")).toBe(true)
    expect(matcher.test("/api/cron/publish")).toBe(false)
  })
})

describe("the send bounds", () => {
  it("caps a day at the published allowance", () => {
    expect(overInstagramDailyCap(INSTAGRAM_DAILY_CAP - 1)).toBe(false)
    expect(overInstagramDailyCap(INSTAGRAM_DAILY_CAP)).toBe(true)
  })

  it("holds Post now for ten minutes after the previous Instagram post", () => {
    const now = new Date("2026-11-18T12:00:00.000Z")
    expect(instagramManualWait(null, now)).toBe(0)
    expect(
      instagramManualWait(
        new Date(now.getTime() - INSTAGRAM_MANUAL_COOLDOWN_MS),
        now
      )
    ).toBe(0)
    expect(instagramManualWait(new Date(now.getTime() - 60_000), now)).toBe(
      INSTAGRAM_MANUAL_COOLDOWN_MS - 60_000
    )
  })
})
