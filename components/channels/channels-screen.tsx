import * as React from "react"
import { Friend } from "@/components/mascot"

import {
  ButtonAnchor,
  ButtonLink,
  Card,
  EmptyState,
  KitPage,
  Mono,
  Stage,
  Text,
  GlyphTile,
} from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"

/**
 * /channels on the kit (plans/029), as one presentational screen so the page
 * reads the database and app/prototypes/setup-pages can lay out the filled
 * states this account does not have. Server-safe: no hooks.
 *
 * Two Stages: the channels Quincy has a strategy for, and every other
 * publishing destination. The rows are the /sources row (glyph, name, what it
 * is, its state, one control at the end), because the two pages are one idea:
 * material in, writing out. Not ListRows: a ListRow is a button that opens
 * something, and these rows hold their own control.
 *
 * **The connection state is words, not a badge.** Connected says the handle.
 * "Needs reconnecting" is the one state that interrupts, so it is the one
 * line in ink rather than grey. Not red: the kit's danger colour labels
 * destructive actions only (docs/design/states.md), and reconnecting destroys
 * nothing. Nothing here is a LiveDot either: a connection is permission, not
 * a running ritual.
 *
 * **A platform that cannot be connected has no control.** The old page drew
 * a disabled Connect on each; the kit does not ship a control that means
 * "not yet" (docs/design/buttons.md), and the Stage above the list says why
 * in words a keyboard can reach.
 */

export type ChannelConnectionState = "active" | "needs_reauth" | "revoked"

export type ChannelRowView = {
  platform: string
  label: string
  /** "Building in public 40% · Dev tooling 30%", biggest first, or "". */
  pillars: string
  /** "5×/week · 09:00", or "". */
  cadence: string
  connection: { state: ChannelConnectionState; handle: string | null } | null
  /** This deployment can start a consent flow for it. */
  connectable: boolean
}

export type AvailablePlatformView = {
  platform: string
  label: string
  connection: { state: ChannelConnectionState; handle: string | null } | null
  /** Connectable on this deployment (holds credentials for it). */
  live: boolean
}

function nameId(platform: string) {
  return `channel-${platform}-name`
}

/** The connection, as the words the row says. Null when there is nothing to say. */
function connectionLine(
  connection: ChannelRowView["connection"],
  connectable: boolean
): React.ReactNode {
  if (connection && connection.state !== "active") {
    return <span className="text-kit-ink">Needs reconnecting.</span>
  }
  if (connection) {
    return connection.handle ? `Connected as ${connection.handle}` : "Connected"
  }
  return connectable ? "Not connected" : null
}

function Row({
  platform,
  label,
  description,
  status,
  quiet = false,
  action,
}: {
  platform: string
  label: string
  description?: React.ReactNode
  status?: React.ReactNode
  quiet?: boolean
  action?: React.ReactNode
}) {
  return (
    <li className="flex items-center gap-kit-related">
      <GlyphTile
        label={label} quiet={quiet}
        mark={hasPlatformMark(platform) ? <PlatformMark platform={platform} size={16} /> : undefined}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-kit-tight">
        <Text id={nameId(platform)} weight="strong">
          {label}
        </Text>
        {description ? (
          // Wraps rather than truncates: on a phone the pillar split is the
          // only thing that says what the channel is for.
          <Text as="div" variant="small" tone="muted">
            {description}
          </Text>
        ) : null}
        {status ? (
          <Text as="div" variant="small" tone="muted">
            {status}
          </Text>
        ) : null}
      </div>

      {action ? <div className="flex shrink-0 items-center">{action}</div> : null}
    </li>
  )
}

function Rows({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <ul role="list" className="flex flex-col gap-kit-group">
        {children}
      </ul>
    </Card>
  )
}

export function ChannelsScreen({
  channels,
  available,
}: {
  channels: ChannelRowView[]
  available: AvailablePlatformView[]
}) {
  return (
    <KitPage
      title="Channels"
      summary="Where your writing goes out. I publish nowhere you haven't set up."
    >
      {channels.length === 0 ? (
        // No lead: the empty state opens with its own bold sentence.
        <Stage>
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="No channels yet."
            rest="A channel is one place you publish, and how I should sound there. We set it up together in Studio. It isn't a form you fill in here."
          >
            <ButtonLink href="/studio" variant="action">
              Set one up in Studio
            </ButtonLink>
          </EmptyState>
        </Stage>
      ) : (
        <Stage
          lead="Where I publish for you."
          rest="Each one has its own split of topics and its own times."
        >
          <Rows>
            {channels.map((channel) => {
              const connection = connectionLine(
                channel.connection,
                channel.connectable
              )
              return (
                <Row
                  key={channel.platform}
                  platform={channel.platform}
                  label={channel.label}
                  description={channel.pillars || "No topics set yet"}
                  status={
                    connection || channel.cadence ? (
                      <span className="flex flex-wrap items-baseline gap-x-kit-related">
                        {connection ? <span>{connection}</span> : null}
                        {channel.cadence ? <Mono>{channel.cadence}</Mono> : null}
                      </span>
                    ) : null
                  }
                  action={
                    <ButtonLink
                      href={`/channels/${channel.platform}`}
                      aria-describedby={nameId(channel.platform)}
                    >
                      Manage
                    </ButtonLink>
                  }
                />
              )
            })}
          </Rows>
        </Stage>
      )}

      {available.length > 0 ? (
        <Stage
          lead="Other places you post."
          rest="Connect an account and I can publish there. The rest aren't wired up yet."
        >
          <Rows>
            {available.map((platform) => (
              <Row
                key={platform.platform}
                platform={platform.platform}
                label={platform.label}
                quiet={!platform.live && !platform.connection}
                status={
                  platform.connection
                    ? connectionLine(platform.connection, platform.live)
                    : platform.live
                      ? null
                      : "Not wired up yet"
                }
                action={
                  platform.connection && platform.live ? (
                    <ButtonLink
                      href={`/channels/${platform.platform}`}
                      aria-describedby={nameId(platform.platform)}
                    >
                      Manage
                    </ButtonLink>
                  ) : platform.live ? (
                    // A real navigation to the consent flow, not next/link:
                    // the point is to leave this origin through a route
                    // handler, and a plain anchor does that without a
                    // prefetch and survives slow JavaScript.
                    <ButtonAnchor
                      href={`/api/connect/${platform.platform}`}
                      pendingLabel="Opening…"
                      aria-describedby={nameId(platform.platform)}
                    >
                      Connect
                    </ButtonAnchor>
                  ) : null
                }
              />
            ))}
          </Rows>
        </Stage>
      ) : null}
    </KitPage>
  )
}
