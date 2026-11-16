import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { describeScopes } from "@/lib/mcp-gate"
import { constructMetadata } from "@/lib/metadata"
import { oauthClient } from "@/lib/schema"
import { getSession } from "@/lib/session"
import { ConsentForm } from "@/components/auth/consent-form"

/**
 * The screen an MCP client has to get past before a token exists.
 *
 * **Why it is here and not in the (app) group.** It is part of an
 * authorization flow, not part of the product: the person arrives mid-redirect
 * from `/api/auth/oauth2/authorize` and leaves to a client that is not this
 * app. A sidebar would offer them somewhere else to go in the middle of a
 * decision. The (auth) layout is already the right shell — the mark, a narrow
 * column, nothing to navigate to.
 *
 * It is deliberately **not** in `AUTH_PAGES` in proxy.ts. That set bounces a
 * signed-in visitor to /studio, and everybody who reaches this page is signed
 * in by definition — the provider sends them to /login first otherwise.
 *
 * **The contract, which changed with `@better-auth/oauth-provider`.** The
 * provider does not hand this page a short consent code any more. It signs the
 * *whole authorization query* and puts it on the URL: `client_id`, `scope`,
 * `redirect_uri`, `resource`, the PKCE challenge, `exp`, `ba_iat`, `ba_param`
 * and `sig`. The page's job is to read three of those for the sentence it
 * shows, and to hand the query back untouched as `oauth_query` when the person
 * answers. The provider verifies that signature against `BETTER_AUTH_SECRET`
 * before it reads a single field, so a query edited in the address bar buys
 * nothing — and the page never has to be trusted to restate what was asked
 * for.
 */
export const metadata = constructMetadata({
  title: "Connect an agent",
  noIndex: true,
})

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [params, session] = await Promise.all([searchParams, getSession()])

  /**
   * The signed query, rebuilt exactly as it arrived.
   *
   * Repeated parameters are kept — `resource` legitimately appears more than
   * once, and dropping one would change what the signature covers. Order does
   * not matter: the provider canonicalises by sorting before it verifies.
   */
  const query = new URLSearchParams()

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    if (Array.isArray(value)) {
      for (const one of value) query.append(key, one)
    } else {
      query.set(key, value)
    }
  }

  const oauthQuery = query.toString()
  const clientId = query.get("client_id")
  const scope = query.get("scope")
  // `sig` is the tell that this is a real authorization in progress rather than
  // somebody who bookmarked the page. Without it the POST would be refused with
  // `invalid_signature`, which is a worse thing to show than a plain sentence.
  const signed = Boolean(oauthQuery && query.get("sig"))

  // The page is a decision made by a person about their own account. Without a
  // session there is no account to decide about, and the `next` sends them back
  // here with the query intact once they are in.
  if (!session) {
    // Encoded, or the `&` between the parameters would end the `next` value and
    // the signature would be lost on the way back.
    redirect(`/login?next=${encodeURIComponent(`/consent?${oauthQuery}`)}`)
  }

  /**
   * The client, read for real rather than taken from the query.
   *
   * `client_id` arrives in a URL the browser has been through, so the name
   * beside "Allow" would otherwise be whatever the last redirect said it was.
   * The row is what the token will actually be issued against — including for
   * a client that identified itself with a Client ID Metadata Document, which
   * CIMD has already fetched, verified and written here before the browser
   * arrived.
   */
  const [client] = clientId
    ? await db
        .select({
          name: oauthClient.name,
          redirectUris: oauthClient.redirectUris,
          disabled: oauthClient.disabled,
        })
        .from(oauthClient)
        .where(eq(oauthClient.clientId, clientId))
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
   *
   * `redirect_uris` is a real array column now rather than a comma-joined
   * string, which is one fewer thing to split by hand.
   */
  const first = client?.redirectUris?.[0]?.trim()
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
      oauthQuery={signed ? oauthQuery : null}
      clientName={client?.name?.trim() || null}
      disabled={Boolean(client?.disabled)}
      destination={destination}
      email={session.user.email}
      permissions={describeScopes(requested)}
    />
  )
}
