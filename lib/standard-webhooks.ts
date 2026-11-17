import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Standard Webhooks verification (https://www.standardwebhooks.com), the
 * scheme Fathom and Granola both sign with.
 *
 * Pure and synchronous so it can be tested without a database: the caller in
 * lib/source-connections.ts decrypts the secret and hands it straight here,
 * and nothing else ever sees it.
 *
 * Circleback's scheme (lib/source-connections.ts `verifySignature`) is a bare
 * HMAC over the body. This one differs in the three ways that matter:
 *
 * - **The secret is base64 after `whsec_`**, and the key is the decoded bytes.
 *   Keying the HMAC with the string itself is the classic mistake and fails
 *   every delivery with nothing on screen explaining why.
 * - **The signed content is `{id}.{timestamp}.{body}`**, so a captured body
 *   cannot be replayed under a different id or time.
 * - **There is a timestamp**, so a replay can be bounded in time here rather
 *   than only structurally by the dedup key. Five minutes, the tolerance both
 *   vendors' own samples use.
 */

/** How far a delivery's timestamp may sit from now, either way. */
export const STANDARD_WEBHOOK_TOLERANCE_SECONDS = 5 * 60

export type StandardWebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

export function readStandardWebhookHeaders(headers: Headers): StandardWebhookHeaders {
  return {
    id: headers.get("webhook-id"),
    timestamp: headers.get("webhook-timestamp"),
    signature: headers.get("webhook-signature"),
  }
}

/** A `whsec_` secret in the shape the scheme requires. Checked before storing. */
export function isStandardWebhookSecret(secret: string): boolean {
  if (!secret.startsWith("whsec_")) return false
  const body = secret.slice("whsec_".length)
  return body.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(body)
}

export function verifyStandardWebhook(
  secret: string,
  headers: StandardWebhookHeaders,
  rawBody: string,
  nowSeconds = Math.floor(Date.now() / 1000)
): boolean {
  const { id, timestamp, signature } = headers
  if (!id || !timestamp || !signature) return false
  if (!isStandardWebhookSecret(secret)) return false

  // Digits only: `Number("1e9")` would parse, and a header is not a place to
  // be generous about what counts as a time.
  if (!/^\d{1,12}$/.test(timestamp)) return false
  const sent = Number(timestamp)
  if (Math.abs(nowSeconds - sent) > STANDARD_WEBHOOK_TOLERANCE_SECONDS) return false

  const key = Buffer.from(secret.slice("whsec_".length), "base64")
  const expected = Buffer.from(
    createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`, "utf8").digest("base64")
  )

  // Space-delimited, each `v1,<base64>`. Any one matching is enough: the
  // provider sends several while it rotates a secret.
  return signature
    .split(" ")
    .filter(Boolean)
    .some((versioned) => {
      const [version, value = ""] = versioned.split(",")
      if (version !== "v1") return false
      const provided = Buffer.from(value)
      // Length first: `timingSafeEqual` throws on a mismatch, and the length
      // of a base64 SHA-256 digest is not a secret.
      return provided.length === expected.length && timingSafeEqual(provided, expected)
    })
}
