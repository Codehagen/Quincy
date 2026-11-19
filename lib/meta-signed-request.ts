import { createHmac, timingSafeEqual } from "node:crypto"

import { BASE_URL } from "./metadata"

/**
 * Meta's data-deletion `signed_request`, and the confirmation code we hand
 * back.
 *
 * The signature is HMAC-SHA256 of the *encoded payload string* (the part
 * after the dot), keyed with the app secret, compared to the decoded
 * signature bytes. That is Meta's published check. The secret is an
 * argument and is never written to a log from here.
 *
 * The confirmation code is itself signed, so the status page can say what
 * happened without a table. It is lowercase alphanumeric: Meta asks for an
 * alphanumeric code, and a base64url blob would not be one.
 */

export type MetaSignedRequest = {
  userId: string
  issuedAt: number | null
  expires: number | null
}

const STAMP_LEN = 12
const COUNT_LEN = 4
const SIG_LEN = 64
const BODY_LEN = 1 + STAMP_LEN + COUNT_LEN
const CODE_LEN = BODY_LEN + SIG_LEN

export function parseMetaSignedRequest(
  signedRequest: string,
  secret: string
): MetaSignedRequest | null {
  if (!secret || !signedRequest) return null
  const dot = signedRequest.indexOf(".")
  if (dot <= 0 || signedRequest.indexOf(".", dot + 1) !== -1) return null

  const encodedSig = signedRequest.slice(0, dot)
  const payload = signedRequest.slice(dot + 1)
  if (!encodedSig || !payload) return null

  let sig: Buffer
  let json: unknown
  try {
    sig = Buffer.from(encodedSig, "base64url")
    json = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"))
  } catch {
    return null
  }

  const expected = createHmac("sha256", secret).update(payload).digest()
  if (sig.length !== expected.length || !timingSafeEqual(sig, expected)) {
    return null
  }

  if (typeof json !== "object" || json === null) return null
  const record = json as Record<string, unknown>
  if (record.algorithm !== "HMAC-SHA256") return null

  const rawId = record.user_id
  const userId =
    typeof rawId === "string" || typeof rawId === "number" ? String(rawId) : ""
  if (!/^\d{1,32}$/.test(userId)) return null

  // Expiry is recorded and not enforced. Meta retries a deletion callback,
  // and the check they publish is the HMAC, not the clock. Rejecting a
  // late retry would leave the Instagram tokens in place.
  const expires = typeof record.expires === "number" ? record.expires : null
  const issuedAt =
    typeof record.issued_at === "number" ? record.issued_at : null
  return { userId, issuedAt, expires }
}

export type DeletionReceipt = {
  at: Date
  removed: number
}

/**
 * `1` + base36 timestamp (12) + base36 count (4) + hex HMAC (64).
 *
 * Fixed widths so the signature can be cut off the end and checked without
 * a separator, which would not be alphanumeric.
 */
export function deletionConfirmationCode(
  removed: number,
  secret: string,
  now = Date.now()
): string {
  if (!secret) {
    throw new Error("META_APP_SECRET is not set.")
  }
  const stamp = now.toString(36)
  if (stamp.length > STAMP_LEN) {
    throw new Error("Deletion timestamp does not fit the confirmation code.")
  }
  const count = Math.max(0, Math.min(Math.floor(removed), 36 ** COUNT_LEN - 1))
  const body =
    "1" +
    stamp.padStart(STAMP_LEN, "0") +
    count.toString(36).padStart(COUNT_LEN, "0")
  const sig = createHmac("sha256", secret).update(body).digest("hex")
  return body + sig
}

export function readDeletionReceipt(
  code: string,
  secret: string,
  now = Date.now()
): DeletionReceipt | null {
  if (!secret) return null
  const trimmed = code.trim()
  if (trimmed.length !== CODE_LEN || !/^[0-9a-z]+$/.test(trimmed)) return null

  const body = trimmed.slice(0, BODY_LEN)
  const sig = trimmed.slice(BODY_LEN)
  if (body[0] !== "1") return null

  const expected = createHmac("sha256", secret).update(body).digest("hex")
  const given = Buffer.from(sig)
  const want = Buffer.from(expected)
  if (given.length !== want.length || !timingSafeEqual(given, want)) return null

  const at = Number.parseInt(body.slice(1, 1 + STAMP_LEN), 36)
  const removed = Number.parseInt(body.slice(1 + STAMP_LEN), 36)
  if (!Number.isFinite(at) || !Number.isFinite(removed)) return null
  if (at < Date.UTC(2024, 0, 1) || at > now + 86_400_000) return null
  return { at: new Date(at), removed }
}

export function deletionStatusUrl(code: string, origin = BASE_URL): string {
  const url = new URL("/data-deletion", origin)
  url.searchParams.set("code", code)
  return url.toString()
}
