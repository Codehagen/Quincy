"use client"

import * as React from "react"
import { Alert02Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { MCP_CONSENT_ENDPOINT } from "@/lib/mcp-gate"
import { Button } from "@/components/ui/button"

/**
 * Allow or deny, and nothing else on the screen.
 *
 * **One primary action.** "Allow" is the filled button; "Deny" is a text link
 * under it. That is not a preference about which is safer — a page with two
 * equal buttons makes the reader compare two shapes before reading either
 * label, and this is the one screen in the product where the label is the whole
 * decision. Denying is also free and reversible: the client asks again.
 *
 * The post goes to the OIDC provider's own consent endpoint, which the `mcp`
 * plugin re-exports unchanged — `/api/auth/oauth2/consent`, body
 * `{ accept, consent_code }`. It answers `{ redirectURI }` either way, and
 * that URI is what carries the code (or `error=access_denied`) back to the
 * client. `credentials: "include"` because the endpoint sits behind the session
 * middleware and also reads the signed `oidc_consent_prompt` cookie when the
 * code is not in the body.
 *
 * `window.location.assign` rather than the router: the destination is usually
 * not this app at all — `http://127.0.0.1:…` for a terminal client, or a
 * custom scheme for an editor — and Next's router cannot navigate to either.
 */
export function ConsentForm({
  consentCode,
  clientName,
  destination,
  disabled,
  email,
  permissions,
}: {
  consentCode: string | null
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
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          consentCode ? { accept, consent_code: consentCode } : { accept }
        ),
      })

      const body = (await response.json().catch(() => null)) as {
        redirectURI?: string
      } | null

      if (!response.ok || !body?.redirectURI) {
        setPending(null)
        setError(
          "That request has expired. Ask the agent to connect again and this page will come back."
        )
        return
      }

      window.location.assign(body.redirectURI)
    } catch {
      setPending(null)
      setError("Could not reach the server. Check your connection.")
    }
  }

  if (!consentCode || disabled) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-section">Nothing to connect</h1>
        <p className="text-body text-pretty text-muted-foreground">
          {disabled
            ? "That agent has been removed from your account. Connect it again from the agent itself."
            : "This page opens on its own when an agent asks to reach Quincy. There is no request waiting."}
        </p>
        <div>
          <Button render={<a href="/studio" />}>Open Studio</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-section">Connect {name}?</h1>
        <p className="text-body text-pretty text-muted-foreground">
          It wants to reach Quincy as {email}
          {destination ? (
            <>
              , and will be sent back to{" "}
              <span className="break-all text-foreground">{destination}</span>
            </>
          ) : null}
          .
        </p>
      </div>

      <ul className="flex flex-col gap-2.5">
        {permissions.map((permission) => (
          <li
            key={permission}
            className="flex items-start gap-2.5 text-body text-pretty"
          >
            <HugeiconsIcon
              icon={Tick02Icon}
              className="mt-0.5 size-4 shrink-0 text-muted-foreground"
              aria-hidden="true"
            />
            <span>{permission}</span>
          </li>
        ))}
      </ul>

      {/* The invariant, said on the screen where it is worth most. It is true
          of every scope this server issues — see lib/mcp.ts. */}
      <p className="text-caption text-pretty text-muted-foreground">
        No agent can approve, schedule or publish anything. Quincy drafts, you
        send. You can remove this agent at any time in Settings.
      </p>

      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 text-caption text-pretty text-destructive"
        >
          <HugeiconsIcon
            icon={Alert02Icon}
            className="mt-px size-4 shrink-0"
            aria-hidden="true"
          />
          {error}
        </p>
      ) : null}

      <div className="flex flex-col items-center gap-4">
        <Button
          type="button"
          className="w-full"
          disabled={pending !== null}
          onClick={() => answer(true)}
        >
          {pending === "allow" ? "Connecting…" : "Allow"}
        </Button>

        {/* A text link, and still a real button with the 44px hit area every
            control in this app gets — the global `[data-slot="button"]::after`
            rule only reaches things that are buttons. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending !== null}
          onClick={() => answer(false)}
          className="text-muted-foreground hover:text-foreground"
        >
          {pending === "deny" ? "Cancelling…" : "Deny"}
        </Button>
      </div>
    </div>
  )
}
