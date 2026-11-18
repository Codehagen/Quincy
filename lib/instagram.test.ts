import { readFileSync } from "node:fs"

import { describe, expect, it, vi } from "vitest"

import {
  captionProblem,
  countHashtags,
  exchangeInstagramCode,
  grantLooksRevoked,
  insightsFromPayload,
  INSTAGRAM_DAILY_CAP,
  INSTAGRAM_HASHTAG_LIMIT,
  instagramCardPath,
  instagramManualWait,
  INSTAGRAM_MANUAL_COOLDOWN_MS,
  overInstagramDailyCap,
  postIdFromCardFile,
  publicInstagramImageUrl,
  readShortLived,
  stripAuthorizationCode,
} from "./instagram"

describe("Instagram token parsing", () => {
  it("reads the wrapped short-lived payload and normalises permissions", () => {
    expect(
      readShortLived({
        data: [
          {
            access_token: "short",
            user_id: "99",
            permissions:
              "instagram_business_basic,instagram_business_content_publish",
          },
        ],
      })
    ).toEqual({
      accessToken: "short",
      scope: "instagram_business_basic instagram_business_content_publish",
    })
  })

  it("strips the fragment Meta appends to the code", () => {
    expect(stripAuthorizationCode("abc#_")).toBe("abc")
  })

  it("exchanges the code and then the short-lived token, and does not keep the short one", async () => {
    const fetchImpl = vi.fn()
    fetchImpl
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            data: [
              {
                access_token: "short",
                user_id: "1",
                permissions: "instagram_business_basic",
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "long",
            token_type: "bearer",
            expires_in: 60,
          }),
          {
            status: 200,
          }
        )
      )

    const tokens = await exchangeInstagramCode({
      code: "authcode#_",
      redirectUri: "https://quincy.example/api/connect/instagram/callback",
      clientId: "app",
      clientSecret: "secret",
      fetchImpl,
    })

    expect(tokens.accessToken).toBe("long")
    expect(tokens.refreshToken).toBeNull()
    expect(tokens.scope).toBe("instagram_business_basic")
    expect(tokens.expiresAt).not.toBeNull()

    const first = fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(first[0]).toBe("https://api.instagram.com/oauth/access_token")
    expect(first[1].body).toBeInstanceOf(FormData)
    const second = String(fetchImpl.mock.calls[1]?.[0])
    expect(second).toContain("grant_type=ig_exchange_token")
    expect(second).toContain("access_token=short")
    expect(second).not.toContain("authcode")
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
