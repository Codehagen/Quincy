import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { describeScopes } from "@/lib/mcp-gate"
import { constructMetadata } from "@/lib/metadata"
import { oauthApplication } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { ConsentForm } from "@/components/auth/consent-form"

/**
 * The screen an MCP client has to get past before a token exists.
 *
 * **Why it is here and not in the (app) group.** It is part of an
 * authorization flow, not part of the product: the person arrives mid-redirect
 * from `/api/auth/mcp/authorize` and leaves to a client that is not this app.
 * A sidebar would offer them somewhere else to go in the middle of a decision.
 * The (auth) layout is already the right shell — the mark, a narrow column,
 * nothing to navigate to.
 *
 * It is deliberately **not** in `AUTH_PAGES` in proxy.ts. That set bounces a
 * signed-in visitor to /studio, and everybody who reaches this page is signed
 * in by definition — the plugin sends them to /login first otherwise.
 *
 * The plugin hands us three things in the query: `consent_code`, `client_id`
 * and `scope`. The code is also in a signed, ten-minute `oidc_consent_prompt`
 * cookie, which is what the endpoint falls back to — so a code that is missing
 * or forged in the URL cannot buy anything the cookie does not already agree
 * to.
 */
export const metadata = constructMetadata({
  title: "Connect an agent",
  noIndex: true,
})

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{
    consent_code?: string
    client_id?: string
    scope?: string
  }>
}) {
  const [{ consent_code: consentCode, client_id: clientId, scope }, session] =
    await Promise.all([searchParams, getSession()])

  // The page is a decision made by a person about their own account. Without a
  // session there is no account to decide about, and the `next` sends them back
  // here with the query intact once they are in.
  if (!session) {
    const params = new URLSearchParams()
    if (consentCode) params.set("consent_code", consentCode)
    if (clientId) params.set("client_id", clientId)
    if (scope) params.set("scope", scope)

    // Encoded, or the `&` between the three would end the `next` parameter and
    // the consent code would be lost on the way back.
    redirect(`/login?next=${encodeURIComponent(`/consent?${params}`)}`)
  }

  /**
   * The client, read for real rather than taken from the query.
   *
   * `client_id` arrives in a URL the browser has been through, so the name
   * beside "Allow" would otherwise be whatever the last redirect said it was.
   * The row is what the token will actually be issued against.
   */
  const [client] = clientId
    ? await db
        .select({
          name: oauthApplication.name,
          redirectUrls: oauthApplication.redirectUrls,
          disabled: oauthApplication.disabled,
        })
        .from(oauthApplication)
        .where(eq(oauthApplication.clientId, clientId))
        .limit(1)
    : []

  const requested = (scope ?? "").split(/\s+/).filter(Boolean)

  /**
   * Where the code goes when this is allowed, as a host.
   *
   * The whole redirect URL is the thing that matters and the thing nobody
   * reads; the host is the part that answers "is this going where I think it
   * is". A custom scheme — `cursor://`, `vscode://` — has no host, so the
   * scheme itself is shown instead of an empty string.
   */
  const first = client?.redirectUrls?.split(",")[0]?.trim()
  let destination: string | null = null

  if (first) {
    try {
      const url = new URL(first)
      destination = url.host || url.protocol.replace(/:$/, "")
    } catch {
      destination = first
    }
  }

  return (
    <ConsentForm
      consentCode={consentCode ?? null}
      clientName={client?.name?.trim() || null}
      disabled={Boolean(client?.disabled)}
      destination={destination}
      email={session.user.email}
      permissions={describeScopes(requested)}
    />
  )
}
