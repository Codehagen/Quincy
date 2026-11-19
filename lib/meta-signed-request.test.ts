import { createHmac } from "node:crypto"

import { describe, expect, it } from "vitest"

import {
  deletionConfirmationCode,
  deletionStatusUrl,
  parseMetaSignedRequest,
  readDeletionReceipt,
} from "./meta-signed-request"

const SECRET = "test-app-secret"

function sign(payload: Record<string, unknown>, secret = SECRET): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${sig}.${body}`
}

describe("parseMetaSignedRequest", () => {
  it("accepts a signed request and reads the app-scoped user id", () => {
    const parsed = parseMetaSignedRequest(
      sign({
        algorithm: "HMAC-SHA256",
        issued_at: 1_700_000_000,
        user_id: "218471",
      }),
      SECRET
    )
    expect(parsed).toEqual({
      userId: "218471",
      issuedAt: 1_700_000_000,
      expires: null,
    })
  })

  it("accepts a numeric user id", () => {
    const parsed = parseMetaSignedRequest(
      sign({ algorithm: "HMAC-SHA256", user_id: 218471 }),
      SECRET
    )
    expect(parsed?.userId).toBe("218471")
  })

  it("rejects a different secret, a flipped payload, and the wrong algorithm", () => {
    const signed = sign({ algorithm: "HMAC-SHA256", user_id: "218471" })
    expect(parseMetaSignedRequest(signed, "other-secret")).toBeNull()

    const [sig, payload] = signed.split(".")
    const flipped = `${sig}.${payload!.slice(0, -1)}${payload!.endsWith("A") ? "B" : "A"}`
    expect(parseMetaSignedRequest(flipped, SECRET)).toBeNull()

    expect(
      parseMetaSignedRequest(
        sign({ algorithm: "HMAC-SHA1", user_id: "218471" }),
        SECRET
      )
    ).toBeNull()
  })

  it("keeps an expired signature and rejects a user id that is not digits", () => {
    expect(
      parseMetaSignedRequest(
        sign({
          algorithm: "HMAC-SHA256",
          user_id: "218471",
          expires: 1_000,
        }),
        SECRET
      )?.userId
    ).toBe("218471")
    expect(
      parseMetaSignedRequest(
        sign({ algorithm: "HMAC-SHA256", user_id: "not-a-user" }),
        SECRET
      )
    ).toBeNull()
  })

  it("rejects a missing secret without throwing", () => {
    expect(
      parseMetaSignedRequest(
        sign({ algorithm: "HMAC-SHA256", user_id: "1" }),
        ""
      )
    ).toBeNull()
  })
})

describe("deletion confirmation code", () => {
  const now = Date.UTC(2026, 10, 19, 12, 0, 0)

  it("round-trips the time and the number of connections removed", () => {
    const code = deletionConfirmationCode(2, SECRET, now)
    expect(code).toMatch(/^[0-9a-z]+$/)
    expect(code).not.toContain(SECRET)
    expect(readDeletionReceipt(code, SECRET, now)).toEqual({
      at: new Date(now),
      removed: 2,
    })
    expect(deletionStatusUrl(code, "https://hirequincy.com")).toBe(
      `https://hirequincy.com/data-deletion?code=${code}`
    )
  })

  it("rejects a code signed with another secret or edited in place", () => {
    const code = deletionConfirmationCode(1, SECRET, now)
    expect(readDeletionReceipt(code, "other-secret", now)).toBeNull()
    const edited = `${code.slice(0, -1)}${code.endsWith("a") ? "b" : "a"}`
    expect(readDeletionReceipt(edited, SECRET, now)).toBeNull()
  })
})
