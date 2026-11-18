"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import {
  ButtonAnchor,
  Disclosure,
  HoldButton,
  Muted,
  Text,
  TextLink,
  GlyphTile,
} from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

/**
 * Whether Quincy may speak for you on one channel.
 *
 * A strip rather than a big card, decided in `app/prototypes/connection`
 * against two alternatives. The reasoning, so it does not get relitigated:
 *
 * **Frequency.** You arrive here from a consent screen once every 60 days, and
 * from /channels to look at the strategy many times. Hierarchy is subtraction.
 *
 * **The modal state is `needs_reauth`, not `active`.** LinkedIn has no refresh
 * token on the self-serve tier, so a connection lands there every 60 days by
 * construction. One line and a sentence reads as a notice; a red badge reads
 * as an alarm, for a renewal.
 *
 * **Disconnect is out of the scan path.** It sits in a Disclosure labelled
 * "Manage connection", so the destructive action is findable by someone who
 * connected the wrong account and is looking for the way out. It is a
 * HoldButton, not a dialog (AGENTS.md, "Destructive actions").
 *
 * **On the kit since 2026-11-16** (plans/029). It sits in the Card of the
 * page's first Stage. Nothing is a green dot: a connection is permission, not
 * a running ritual, and connected is said in words. "Needs reconnecting" is the one line in ink rather than
 * grey, and not red: the kit's danger colour labels destructive actions only
 * (docs/design/states.md). The provider's photo is gone: the kit draws no
 * faces (Avatar), and a signed LinkedIn picture URL expires anyway, so the
 * row leads with the platform's glyph, as on /channels.
 */

export type ConnectionView = {
  channel: string
  state: "active" | "needs_reauth" | "revoked"
  handle: string | null
  displayName: string | null
  avatarUrl: string | null
  /** Milliseconds since the epoch. A Date would arrive as a string anyway. */
  expiresAt: number | null
  /**
   * Whether the platform issues refresh tokens to us. X does, so its two-hour
   * access token is renewed silently and its expiry is never the user's
   * problem. LinkedIn's self-serve tier does not, so a LinkedIn connection
   * genuinely ends and the human has to come back.
   */
  refreshable: boolean
}

/** What connecting actually grants, per platform, in the person's own terms. */
const GRANTS: Record<string, string> = {
  linkedin:
    "Quincy will be able to publish posts as you. It cannot read your feed, your existing posts, or your engagement.",
  x: "Quincy will be able to publish posts as you, and read back the ones it published so it can report how they did.",
  instagram:
    "Quincy will be able to publish posts as you — a picture of the words, plus the caption — and read back how each one did.",
}

/** Where to take the permission away at the source. */
const REVOKE_AT: Record<string, { label: string; href: string }> = {
  linkedin: {
    label: "LinkedIn permitted services",
    href: "https://www.linkedin.com/mypreferences/d/data-sharing-with-third-parties",
  },
  x: {
    label: "X connected apps",
    href: "https://x.com/settings/connected_apps",
  },
  instagram: {
    label: "Meta connected apps",
    href: "https://business.facebook.com/latest/settings/apps",
  },
}

function daysUntil(ms: number | null): number | null {
  if (ms === null) return null
  return Math.round((ms - Date.now()) / 86_400_000)
}

export function ConnectionStrip({
  channel,
  label,
  connection,
  enabled,
  isAction = false,
}: {
  channel: string
  label: string
  connection: ConnectionView | null
  /** False when the deployment has no client id for this platform. */
  enabled: boolean
  /**
   * Connect / Reconnect is the page's one ink action. The page decides
   * (docs/design/actions.md): it is, when there is no strategy form below
   * whose Save holds the action.
   */
  isAction?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const connectHref = `/api/connect/${channel}`
  const expiresInDays = daysUntil(connection?.expiresAt ?? null)
  const revoke = REVOKE_AT[channel]

  /**
   * HoldButton catches whatever `onConfirm` throws and returns the button to
   * idle so the action can be retried. Right for the button, wrong on its own:
   * a failed disconnect would look exactly like one never attempted. So the
   * message is captured before the throw goes on to do its work.
   *
   * `busy` outlives the fetch deliberately — `router.refresh()` does not
   * resolve, so without it the button re-enables before the strip re-renders.
   */
  async function disconnect() {
    setError(null)
    setBusy(true)

    try {
      const response = await fetch(`/api/connect/${channel}/disconnect`, {
        method: "POST",
      })

      if (!response.ok) {
        throw new Error(
          response.status === 401
            ? "Your session ended. Sign in again, then disconnect."
            : `${label} could not be disconnected (${response.status}). Try again.`
        )
      }

      router.refresh()
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `${label} could not be disconnected. Try again.`
      )
      throw cause
    } finally {
      setBusy(false)
    }
  }

  // Not configured on this deployment. Say so rather than offering a control
  // that fails on click — the reason lib/auth.ts hides the Google button.
  if (!enabled) {
    return (
      <Text tone="muted">
        This deployment has no {label} credentials, so there is nothing to
        connect to.
      </Text>
    )
  }

  if (!connection || connection.state === "revoked") {
    return (
      <div className="flex flex-col gap-kit-related sm:flex-row sm:items-center sm:gap-kit-group">
        <div className="flex min-w-0 flex-1 items-start gap-kit-related">
          <GlyphTile
        label={label} quiet
        mark={hasPlatformMark(channel) ? <PlatformMark platform={channel} size={16} /> : undefined}
      />
          <Text>
            <span className="font-kit-strong">{label} isn&rsquo;t connected.</span>{" "}
            <Muted>
              {GRANTS[channel] ??
                `Quincy will be able to publish posts as you on ${label}.`}{" "}
              Nothing goes out without your approval.
            </Muted>
          </Text>
        </div>
        <div className="flex shrink-0">
          <ButtonAnchor
            href={connectHref}
            variant={isAction ? "action" : "quiet"}
            pendingLabel={`Opening ${label}…`}
          >
            Connect
          </ButtonAnchor>
        </div>
      </div>
    )
  }

  const stale = connection.state === "needs_reauth"
  const name = connection.displayName ?? connection.handle ?? label

  const status = stale
    ? channel === "linkedin"
      ? "LinkedIn access expires every 60 days and can't be renewed on its own. Reconnect to keep publishing. It usually takes one click."
      : `${label} access has lapsed. Reconnect to keep publishing.`
    : // Only for channels we cannot refresh, matching the rule in
      // lib/channels-maintenance.ts: an approaching expiry on X is renewed
      // silently by getAccessToken, so warning about it manufactures an errand.
      //
      // The `>= 0` floor covers the window between a token actually expiring
      // and the next 06:00 sweep noticing: the row is still `active`, and
      // without it the copy reads "expires in -3 days".
      !connection.refreshable &&
        expiresInDays !== null &&
        expiresInDays >= 0 &&
        expiresInDays <= 10
      ? expiresInDays === 0
        ? "Access expires today. I'll ask you to reconnect before it does."
        : `Access expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}. I'll ask you to reconnect before it does.`
      : null

  return (
    <div className="flex flex-col gap-kit-related">
      <div className="flex items-center gap-kit-related">
        <GlyphTile
        label={label}
        mark={hasPlatformMark(channel) ? <PlatformMark platform={channel} size={16} /> : undefined}
      />

        <div className="flex min-w-0 flex-1 flex-col gap-kit-tight">
          <Text weight="strong">{name}</Text>
          <Text as="div" variant="small" tone="muted">
            {stale ? (
              <span className="text-kit-ink">Needs reconnecting.</span>
            ) : connection.handle && connection.displayName ? (
              `Connected as ${connection.handle}`
            ) : (
              "Connected"
            )}
          </Text>
        </div>

        <div className="flex shrink-0">
          <ButtonAnchor
            href={connectHref}
            variant={stale && isAction ? "action" : "quiet"}
            pendingLabel="Opening…"
          >
            Reconnect
          </ButtonAnchor>
        </div>
      </div>

      {/* Its own line under the row rather than squeezed into it: the state
          that needs explaining still gets explained on a phone. */}
      {status ? <Text tone="muted">{status}</Text> : null}

      {error ? (
        // Ink, not red (states.md). `alert`, because a failed disconnect
        // means Quincy can still speak for you, which is what you came to stop.
        <div role="alert">
          <Text>{error}</Text>
        </div>
      ) : null}

      <Disclosure summary="Manage connection">
        <div className="flex flex-col items-start gap-kit-related">
          {revoke ? (
            <Text tone="muted">
              Disconnecting deletes the stored credentials. You can also remove
              Quincy from{" "}
              <TextLink href={revoke.href} target="_blank" rel="noreferrer noopener">
                {revoke.label}
                {/* The new tab has to be said: nothing else announces it. */}
                <span className="sr-only"> (opens in a new tab)</span>
              </TextLink>
              .
            </Text>
          ) : null}

          <HoldButton
            onConfirm={disconnect}
            disabled={busy}
            pendingLabel="Disconnecting…"
            doneLabel="Disconnected"
          >
            {`Disconnect ${label}`}
          </HoldButton>
        </div>
      </Disclosure>
    </div>
  )
}
