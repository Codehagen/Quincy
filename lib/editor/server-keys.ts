import { createHmac, timingSafeEqual } from "node:crypto"

/**
 * Keys the editor signs with, each derived from the one server secret.
 *
 * Derived rather than shared: `BETTER_AUTH_SECRET` already signs sessions,
 * and the self-check offer signs with it under its own prefix. A signature
 * minted for one use must never verify for another, so each use takes an
 * HMAC of the secret under its own label as its key. No new environment
 * variable: every instance already has this one, and an approval signed on
 * one instance is checked on whichever instance takes the next request.
 */
export function derivedKey(label: string): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) throw new Error("BETTER_AUTH_SECRET is not set.")
  return createHmac("sha256", secret).update(`quincy.editor.${label}`).digest("base64url")
}

/** The key the SDK signs and checks tool approvals with. */
export function toolApprovalSecret(): string {
  return derivedKey("tool-approval")
}

/**
 * The gate's record of what it asked about, signed.
 *
 * The SDK's approval signature binds the tool call's name, id and input, and
 * nothing about the timeline: `delete_clip 3` stays a valid input after the
 * person has moved clip 3. The gate signs the clips it measured, so on the
 * yes the server can see whether the same clips would go.
 */
export function signGateRecord(toolCallId: string, clipIds: string[]): string {
  return createHmac("sha256", derivedKey("gate-record"))
    .update(`${toolCallId}\n${clipIds.join(",")}`)
    .digest("base64url")
}

export function verifyGateRecord(
  toolCallId: string,
  clipIds: string[],
  signature: string
): boolean {
  const expected = Buffer.from(signGateRecord(toolCallId, clipIds))
  const given = Buffer.from(signature)
  return expected.length === given.length && timingSafeEqual(expected, given)
}
