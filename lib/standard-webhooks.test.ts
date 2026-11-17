import { createHmac } from "node:crypto"
import { describe, expect, it } from "vitest"

import { isStandardWebhookSecret, verifyStandardWebhook } from "./standard-webhooks"

/**
 * The scheme Fathom and Granola sign with. Tested against a signature built
 * the way the spec builds it, so a mistake in either direction (keying with
 * the string instead of the decoded bytes, signing the body alone) fails here
 * rather than as every real delivery refused with nothing on screen.
 */

const SECRET = "whsec_" + Buffer.from("a-thirty-two-byte-test-secret!!!").toString("base64")
const NOW = 1_763_380_000
const BODY = '{"event_type":"note.generated","note_id":"not_1d3tmYTlCICgjy"}'

function sign(id: string, ts: string, body: string, secret = SECRET) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64")
  return "v1," + createHmac("sha256", key).update(`${id}.${ts}.${body}`).digest("base64")
}

const headers = (overrides: Partial<{ id: string; timestamp: string; signature: string }> = {}) => ({
  id: "msg_1",
  timestamp: String(NOW),
  signature: sign("msg_1", String(NOW), BODY),
  ...overrides,
})

describe("verifyStandardWebhook", () => {
  it("accepts a delivery signed as the spec says", () => {
    expect(verifyStandardWebhook(SECRET, headers(), BODY, NOW)).toBe(true)
  })

  it("accepts any one of several signatures, as during a rotation", () => {
    const signature = `v1,bm90LXRoaXMtb25l ${sign("msg_1", String(NOW), BODY)}`
    expect(verifyStandardWebhook(SECRET, headers({ signature }), BODY, NOW)).toBe(true)
  })

  it("refuses a body that changed by one byte", () => {
    expect(verifyStandardWebhook(SECRET, headers(), BODY.replace("1d3", "1d4"), NOW)).toBe(false)
  })

  it("refuses a signature replayed under another id", () => {
    expect(verifyStandardWebhook(SECRET, headers({ id: "msg_2" }), BODY, NOW)).toBe(false)
  })

  it("refuses a delivery older or newer than five minutes", () => {
    const old = String(NOW - 301)
    expect(verifyStandardWebhook(SECRET, headers({ timestamp: old, signature: sign("msg_1", old, BODY) }), BODY, NOW)).toBe(false)
    const ahead = String(NOW + 301)
    expect(verifyStandardWebhook(SECRET, headers({ timestamp: ahead, signature: sign("msg_1", ahead, BODY) }), BODY, NOW)).toBe(false)
  })

  it("refuses a signature keyed with the secret string instead of its bytes", () => {
    const wrong = "v1," + createHmac("sha256", SECRET).update(`msg_1.${NOW}.${BODY}`).digest("base64")
    expect(verifyStandardWebhook(SECRET, headers({ signature: wrong }), BODY, NOW)).toBe(false)
  })

  it("refuses missing headers, unknown versions and non-numeric times", () => {
    expect(verifyStandardWebhook(SECRET, { id: null, timestamp: String(NOW), signature: "x" }, BODY, NOW)).toBe(false)
    expect(verifyStandardWebhook(SECRET, headers({ signature: sign("msg_1", String(NOW), BODY).replace("v1,", "v2,") }), BODY, NOW)).toBe(false)
    expect(verifyStandardWebhook(SECRET, headers({ timestamp: "1.7e9" }), BODY, NOW)).toBe(false)
  })
})

describe("isStandardWebhookSecret", () => {
  it("wants whsec_ and base64 after it", () => {
    expect(isStandardWebhookSecret(SECRET)).toBe(true)
    expect(isStandardWebhookSecret("whsec_")).toBe(false)
    expect(isStandardWebhookSecret("https://quincy/api/webhooks/fathom/abc")).toBe(false)
    expect(isStandardWebhookSecret("whsec_not base64!")).toBe(false)
  })
})
