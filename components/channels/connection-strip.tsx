"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  Alert01Icon,
  ArrowRight01Icon,
  LinkSquare02Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { HoldToConfirm } from "@/components/hold-to-confirm"
import {
  PlatformMark,
  hasPlatformMark,
} from "@/components/channels/platform-mark"

/**
 * Whether Quincy may speak for you on one channel.
 *
 * A strip rather than a card, decided in `app/prototypes/connection` against
 * two alternatives. The reasoning, so it does not get relitigated by whoever
 * next thinks this looks thin:
 *
 * **Frequency.** You arrive here from a consent screen once every 60 days, and
 * from /channels to look at the strategy many times. A card puts furniture in
 * front of the thing you usually came for. Hierarchy is subtraction.
 *
 * **The modal state is `needs_reauth`, not `active`.** LinkedIn has no refresh
 * token on the self-serve tier, so a connection lands there every 60 days by
 * construction. A layout that only holds while connected is a layout that looks
 * broken most of the time it is seen. One line and a sentence reads as a
 * notice; a bordered card with a red badge reads as an alarm, for a renewal.
 *
 * **Disconnect is out of the scan path.** It sits in a disclosure labelled
 * "Manage connection" — labelled that way rather than "Connection details" so
 * the destructive action is findable by someone who connected the wrong account
 * and is looking for the way out. Separating it is the rule; hiding it without
 * a signpost would have been a different and worse move.
 *
 * **Nothing is brass.** `--signal*` means "this ritual is running". A
 * connection is permission, and permission is not a run — the strip has no
 * cadence to read yet, so the question of whether a connected *and publishing*
 * channel earns brass cannot even be asked here. It reopens when Lineup wires
 * a rhythm to a channel.
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
}

function daysUntil(ms: number | null): number | null {
  if (ms === null) return null
  return Math.round((ms - Date.now()) / 86_400_000)
}

/**
 * The face, falling back to the platform mark when the image fails.
 *
 * Not a rare path. LinkedIn's `picture` from /v2/userinfo is a signed
 * media.licdn.com URL with an expiry in its query string; we store it at
 * connect time and may render it months later, so a broken-image glyph is the
 * eventual default rather than an edge case.
 */
function Face({
  connection,
  label,
}: {
  connection: ConnectionView
  label: string
}) {
  const [broken, setBroken] = React.useState(false)
  const show = Boolean(connection.avatarUrl) && !broken

  if (show) {
    return (
      // Not next/image: these are provider CDNs on hosts that change, and a
      // remotePatterns entry per platform would be a config change every time
      // LinkedIn moves a bucket. It is 28px and decorative — the name beside
      // it is the information.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={connection.avatarUrl!}
        alt=""
        width={28}
        height={28}
        onError={() => setBroken(true)}
        className="size-7 shrink-0 rounded-xs object-cover"
      />
    )
  }

  return (
    <div className="flex size-7 shrink-0 items-center justify-center rounded-xs bg-muted text-muted-foreground">
      {hasPlatformMark(connection.channel) ? (
        <PlatformMark platform={connection.channel} size={13} />
      ) : (
        <span aria-hidden="true" className="text-caption font-medium">
          {label.slice(0, 1)}
        </span>
      )}
    </div>
  )
}

/**
 * The link out to a provider's consent screen, with the wait acknowledged.
 *
 * Still an anchor and still a real navigation — no preventDefault, no fetch.
 * The state is presentational: leaving this origin takes a round trip through
 * our own route first, and a button that stays bright and idle through it reads
 * as a click that missed.
 *
 * A modified click is left alone. Cmd- or middle-clicking opens a background
 * tab and this page stays put, so a pending state there would never resolve.
 */
function ConnectLink({
  href,
  children,
  pendingLabel,
  variant,
  size,
}: {
  href: string
  children: React.ReactNode
  pendingLabel: string
  variant?: "default" | "outline" | "ghost"
  size?: "sm"
}) {
  const [leaving, setLeaving] = React.useState(false)

  return (
    <Button
      nativeButton={false}
      variant={variant}
      size={size}
      aria-busy={leaving || undefined}
      render={
        <a
          href={href}
          onClick={(event) => {
            if (
              event.defaultPrevented ||
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return
            }
            setLeaving(true)
          }}
        />
      }
    >
      {leaving ? pendingLabel : children}
    </Button>
  )
}

export function ConnectionStrip({
  channel,
  label,
  connection,
  enabled,
}: {
  channel: string
  label: string
  connection: ConnectionView | null
  /** False when the deployment has no client id for this platform. */
  enabled: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const connectHref = `/api/connect/${channel}`
  const expiresInDays = daysUntil(connection?.expiresAt ?? null)
  const revoke = REVOKE_AT[channel]

  /**
   * HoldToConfirm catches whatever `onConfirm` throws and returns the button to
   * idle so the action can be retried. Right for the button, wrong on its own:
   * a failed disconnect would look exactly like one never attempted, on a
   * control whose whole job is to stop Quincy speaking for you. So the message
   * is captured before the throw goes on to do its work.
   *
   * `busy` outlives the fetch deliberately — `router.refresh()` does not
   * resolve, so without it the button re-enables before the strip has
   * re-rendered.
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
      <p className="border-b border-border pb-4 text-caption text-muted-foreground">
        This deployment has no {label} credentials, so there is nothing to
        connect to.
      </p>
    )
  }

  if (!connection || connection.state === "revoked") {
    return (
      <div className="flex flex-wrap items-center gap-3 border-b border-border pb-4">
        <p className="min-w-0 flex-1 text-body text-pretty">
          <span className="font-medium">{label} is not connected.</span>{" "}
          <span className="text-muted-foreground">
            {GRANTS[channel] ??
              `Quincy will be able to publish posts as you on ${label}.`}{" "}
            Nothing goes out without your approval.
          </span>
        </p>

        <ConnectLink
          href={connectHref}
          size="sm"
          pendingLabel={`Opening ${label}…`}
        >
          Connect
        </ConnectLink>
      </div>
    )
  }

  const stale = connection.state === "needs_reauth"
  const name = connection.displayName ?? connection.handle ?? label

  const status = stale
    ? channel === "linkedin"
      ? "LinkedIn access expires every 60 days and cannot be renewed automatically. Reconnect to keep publishing — it usually takes one click."
      : `${label} access has lapsed. Reconnect to keep publishing.`
    : // Only for channels we cannot refresh, matching the rule in
      // lib/channels-maintenance.ts: an approaching expiry on X is renewed
      // silently by getAccessToken, so warning about it manufactures an errand.
      // X's token lives two hours, so without this gate every healthy X
      // connection reads "expires in 0 days" forever.
      //
      // The `>= 0` floor covers the window between a token actually expiring
      // and the next 06:00 sweep noticing: the row is still `active`, and
      // without it the copy reads "expires in -3 days".
      !connection.refreshable &&
        expiresInDays !== null &&
        expiresInDays >= 0 &&
        expiresInDays <= 10
      ? expiresInDays === 0
        ? "Access expires today. Quincy will ask you to reconnect before it does."
        : `Access expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}. Quincy will ask you to reconnect before it does.`
      : null

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border pb-4">
        <Face connection={connection} label={label} />

        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <p className="truncate text-body font-medium">{name}</p>

          {stale ? (
            <span className="inline-flex h-5 shrink-0 items-center gap-1 rounded-4xl bg-destructive/10 px-2 text-xs font-medium whitespace-nowrap text-destructive">
              <HugeiconsIcon
                aria-hidden="true"
                icon={Alert01Icon}
                className="size-3"
              />
              Needs reconnecting
            </span>
          ) : (
            <span className="inline-flex h-5 shrink-0 items-center rounded-4xl border border-border px-2 text-xs font-medium whitespace-nowrap text-muted-foreground">
              Connected
            </span>
          )}

          {connection.handle && connection.displayName ? (
            <p className="hidden truncate text-caption text-muted-foreground sm:block">
              {connection.handle}
            </p>
          ) : null}
        </div>

        <ConnectLink
          href={connectHref}
          size="sm"
          variant={stale ? "default" : "ghost"}
          pendingLabel={`Opening ${label}…`}
        >
          Reconnect
        </ConnectLink>
      </div>

      {/* Escapes the strip rather than truncating inside it. The strip has the
          least room of the three layouts considered, and it only earns that
          restraint if the state that needs explaining still gets explained. */}
      {status ? (
        <p className="max-w-prose pt-3 text-caption text-pretty text-muted-foreground">
          {status}
        </p>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="max-w-prose pt-3 text-caption text-pretty text-destructive"
        >
          {error}
        </p>
      ) : null}

      {/* A native details rather than a popover: no JavaScript to open, keyboard
          operable for free, and this is a disclosure rather than a menu. */}
      <details data-slot="disclosure" className="group pt-3">
        <summary
          // On touch this is the only route to Disconnect, and a caption-sized
          // line is well under the 44px floor. `relative` is what lets the
          // hit-area rule in globals.css hang an ::after on it.
          data-slot="disclosure-summary"
          className={cn(
            "relative inline-flex cursor-pointer list-none items-center gap-1 rounded-sm text-caption text-muted-foreground ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2",
            // The marker is suppressed in both engines; Safari needs the
            // pseudo-element form and Firefox the list-style.
            "[&::-webkit-details-marker]:hidden"
          )}
        >
          Manage connection
          <HugeiconsIcon
            aria-hidden="true"
            icon={ArrowRight01Icon}
            // Same 200ms and same curve as the panel it points at — they are
            // one gesture, and paired elements that disagree on timing read as
            // broken. It was 150ms against a panel that did not animate at all.
            className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.32,0.72,0,1)] group-open:rotate-90"
          />
        </summary>

        <div className="flex flex-col items-start gap-3 pt-3">
          {revoke ? (
            <p className="max-w-prose text-caption text-pretty text-muted-foreground">
              Disconnecting deletes the stored credentials. You can also remove
              Quincy from{" "}
              <a
                href={revoke.href}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-sm underline underline-offset-4 ring-ring outline-hidden transition-colors duration-150 hover:text-foreground focus-visible:ring-2"
              >
                {revoke.label}
                {/* The icon is decorative and hidden, so without this the link
                    would announce as ordinary text and open a new tab with no
                    warning. The seen cue and the heard one must agree. */}
                <span className="sr-only"> (opens in a new tab)</span>
                <HugeiconsIcon
                  aria-hidden="true"
                  icon={LinkSquare02Icon}
                  className="ml-1 inline size-3.5 align-[-0.15em]"
                />
              </a>
              .
            </p>
          ) : null}

          {/* A hold, not a dialog. A dialog's second click becomes reflex; a
              hold makes the confirmation part of the action — see AGENTS.md. */}
          <HoldToConfirm
            onConfirm={disconnect}
            disabled={busy}
            hint="hold to disconnect"
            doneLabel="Disconnected"
          >
            Disconnect {label}
          </HoldToConfirm>
        </div>
      </details>
    </div>
  )
}
