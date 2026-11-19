import { BASE_URL } from "@/lib/metadata"
import { deleteInstagramDataForMetaUser } from "@/lib/meta-data-deletion"
import {
  deletionConfirmationCode,
  deletionStatusUrl,
  parseMetaSignedRequest,
} from "@/lib/meta-signed-request"

/**
 * Meta's Data Deletion Request Callback.
 *
 * Facebook POSTs `signed_request` when someone removes the app or asks
 * Facebook to delete the data the app holds. The body is form-encoded.
 * There is no session: the signature is the authentication, and `proxy.ts`
 * lists this path as public so the POST is not redirected to /login.
 *
 * The response shape is Meta's: `{ url, confirmation_code }`. The URL is
 * the status page for that code. The secret is read here and passed down.
 * It is not logged, and neither is the raw signed request.
 */

export async function POST(request: Request) {
  const secret = process.env.META_APP_SECRET
  if (!secret) {
    return Response.json(
      { error: "Meta data deletion is not configured." },
      { status: 503 }
    )
  }

  const signed = await readSignedRequest(request)
  if (!signed) {
    return Response.json({ error: "Missing signed_request." }, { status: 400 })
  }

  const parsed = parseMetaSignedRequest(signed, secret)
  if (!parsed) {
    return Response.json({ error: "Invalid signed_request." }, { status: 400 })
  }

  let removed: number
  try {
    removed = await deleteInstagramDataForMetaUser(parsed.userId)
  } catch (cause) {
    console.error("[meta] data deletion failed:", deletionErrorText(cause))
    return Response.json(
      { error: "Could not complete deletion." },
      { status: 500 }
    )
  }

  const confirmation_code = deletionConfirmationCode(removed, secret)
  const url = deletionStatusUrl(confirmation_code, BASE_URL)
  console.info(
    `[meta] data deletion completed, connections removed: ${removed}`
  )
  return Response.json({ url, confirmation_code })
}

/**
 * The database's own words when it has them. Drizzle's message repeats the
 * SQL and the bound id; the nested message is the one that says the column
 * is missing or the connection failed. The app secret is not in either.
 */
function deletionErrorText(cause: unknown): string {
  if (!(cause instanceof Error)) return "unknown"
  const nested = cause.cause instanceof Error ? cause.cause.message : ""
  return nested || cause.message
}

async function readSignedRequest(request: Request): Promise<string | null> {
  const fromQuery = new URL(request.url).searchParams.get("signed_request")
  if (fromQuery) return fromQuery

  const type = request.headers.get("content-type") ?? ""
  if (type.includes("application/json")) {
    try {
      const body = (await request.json()) as { signed_request?: unknown }
      return typeof body.signed_request === "string"
        ? body.signed_request
        : null
    } catch {
      return null
    }
  }

  try {
    const form = await request.formData()
    const value = form.get("signed_request")
    return typeof value === "string" ? value : null
  } catch {
    return null
  }
}
