"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { MCP_CONSENT_ENDPOINT } from "@/lib/mcp-shared"
import { Button, ButtonLink, Text } from "@/components/kit"
import {
  Address,
  AuthActions,
  AuthCard,
  FormNotice,
} from "@/components/auth/parts"

/**
 * Allow or deny, and nothing else on the screen.
 *
 * **One primary action.** "Allow" is the ink pill; "Deny" is the quiet pill
 * under it. That is not a preference about which is safer — a page with two
 * equal buttons makes the reader compare two shapes before reading either
 * label, and this is the one screen in the product where the label is the whole
 * decision. Denying is also free and reversible: the client asks again.
 *
 * The post goes to the OAuth provider's consent endpoint —
 * `/api/auth/oauth2/consent`, body `{ accept, oauth_query }` — where
 * `oauth_query` is the whole signed authorization query this page was opened
 * with. The provider verifies that signature before it reads anything, so the
 * query is handed back exactly as it arrived rather than restated.
 *
 * It answers `{ redirect: true, url }` either way, and that URL is what carries
 * the authorization code (or `error=access_denied`) back to the client.
 * `Accept: application/json` is set explicitly: the endpoint answers a browser
 * navigation with a 302 and a `fetch` with JSON, and the header is what makes
 * that choice unambiguous. `credentials: "include"` because the endpoint sits
 * behind the session middleware.
 *
 * `window.location.assign` rather than the router: the destination is usually
 * not this app at all — `http://127.0.0.1:…` for a terminal client, or a
 * custom scheme for an editor — and Next's router cannot navigate to either.
 */
export function ConsentForm({
  oauthQuery,
  clientName,
  destination,
  disabled,
  email,
  permissions,
}: {
  oauthQuery: string | null
  clientName: string | null
  destination: string | null
  disabled: boolean
  email: string
  permissions: string[]
}) {
  const [pending, setPending] = React.useState<"allow" | "deny" | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  // A name is what the client called itself at registration and is not proof of
  // anything. It is still the only handle the reader has, and "an agent" is
  // what an unnamed one honestly is.
  const name = clientName || "An unnamed agent"

  async function answer(accept: boolean) {
    if (pending) return

    setError(null)
    setPending(accept ? "allow" : "deny")

    try {
      const response = await fetch(MCP_CONSENT_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        credentials: "include",
        body: JSON.stringify({ accept, oauth_query: oauthQuery }),
      })

      const body = (await response.json().catch(() => null)) as {
        url?: string
      } | null

      if (!response.ok || !body?.url) {
        setPending(null)
        setError(
          "That request has expired. Ask the agent to connect again and this page will come back."
        )
        return
      }

      window.location.assign(body.url)
    } catch {
      setPending(null)
      setError("Could not reach the server. Check your connection.")
    }
  }

  if (!oauthQuery || disabled) {
    return (
      <AuthCard
        title="Nothing to connect"
        lead={
          disabled
            ? "That agent has been removed from your account. Connect it again from the agent itself."
            : "This page opens on its own when an agent asks to reach Quincy. There is no request waiting."
        }
      >
        <AuthActions>
          <ButtonLink width="full" href="/studio">Open Studio</ButtonLink>
        </AuthActions>
      </AuthCard>
    )
  }

  return (
    <AuthCard
      title={`Connect ${name}?`}
      lead={
        <>
          It wants to reach Quincy as <Address>{email}</Address>
          {destination ? (
            <>
              , and will be sent back to <Address>{destination}</Address>
            </>
          ) : null}
          .
        </>
      }
    >
      <ul className="flex flex-col gap-kit-related">
        {permissions.map((permission) => (
          <li key={permission} className="flex items-start gap-2.5">
            <HugeiconsIcon
              icon={Tick02Icon}
              size={16}
              strokeWidth={2}
              className="mt-0.5 shrink-0 text-kit-ink-muted"
              aria-hidden="true"
            />
            <Text as="span">
              <span className="text-pretty">{permission}</span>
            </Text>
          </li>
        ))}
      </ul>

      {/* The invariant, said on the screen where it is worth most. It is true
          of every scope this server issues — see lib/mcp.ts. */}
      <Text variant="small" tone="muted">
        No agent can approve, schedule or publish anything. Quincy drafts, you
        send. You can remove this agent at any time in Settings.
      </Text>

      {error ? <FormNotice>{error}</FormNotice> : null}

      <AuthActions>
        <Button
          width="full"
          type="button"
          variant="action"
          disabled={pending === "deny"}
          pending={pending === "allow"}
          pendingLabel="Connecting…"
          onClick={() => answer(true)}
        >
          Allow
        </Button>
        {/* Quiet, under the action: two equal buttons make the reader compare
            two shapes before reading either label, and this is the one screen
            where the label is the whole decision. Still a real button with
            the kit's 44px hit area. */}
        <Button
          width="full"
          type="button"
          disabled={pending === "allow"}
          pending={pending === "deny"}
          pendingLabel="Cancelling…"
          onClick={() => answer(false)}
        >
          Deny
        </Button>
      </AuthActions>
    </AuthCard>
  )
}
