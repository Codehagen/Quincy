import { notFound, redirect } from "next/navigation"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import { getSession } from "@/lib/session"
import { getPage } from "@/lib/brain"
import {
  getConnection,
  isChannelEnabled,
  isConnectableChannel,
  isRefreshable,
} from "@/lib/channels"
import { ButtonLink, Card, EmptyState, KitPage, Stage, Text } from "@/components/kit"
import { PolicyEditor } from "@/components/channels/policy-editor"
import {
  ConnectionStrip,
  type ConnectionView,
} from "@/components/channels/connection-strip"
import { constructMetadata } from "@/lib/metadata"

/**
 * One channel: whether Quincy may speak for you there, and what it should sound
 * like when it does.
 *
 * The two halves are independent, and that independence is why this route no
 * longer requires a policy page to exist. It used to `notFound()` without one,
 * on the reasoning that a policy page is created by the agent and landing
 * without one is a wrong URL. That stopped being true the moment a channel
 * could be connected: `/api/connect/linkedin/callback` redirects here, and a
 * person who connects LinkedIn before ever discussing a LinkedIn strategy would
 * have been shown a 404 as the reward for a successful connection.
 *
 * So the rule is now narrower. A *connectable* channel always has a page —
 * there is a connection to show, and the strategy is an empty state. Anything
 * else still 404s, because for those there is genuinely nothing here.
 *
 * **A kit page since 2026-11-16** (plans/029). KitPage owns the one `h1` (the
 * channel's name) in every state, which settles the old wart where the title
 * came from EditorShell with a strategy and from this page without one.
 * Two Stages: the connection, then the strategy (EditorShell is a Card with
 * an `h2`). Connect is the page's ink action only when there is no strategy
 * form below, whose Save holds it otherwise (docs/design/actions.md).
 */

const PLATFORM_LABEL: Record<string, string> = {
  x: "X",
  linkedin: "LinkedIn",
  threads: "Threads",
  bluesky: "Bluesky",
  instagram: "Instagram",
  youtube: "YouTube",
  mastodon: "Mastodon",
  substack: "Substack",
  kit: "Kit",
}

/** What the callback puts in the URL, in the person's own terms. */
const CONNECT_ERRORS: Record<string, string> = {
  cancelled: "You cancelled before granting access. Nothing changed.",
  signed_out:
    "Your session ended during the connection. Sign in and try again.",
  expired: "That connection attempt timed out. Try again.",
  state_mismatch:
    "The connection could not be verified and was refused. Try again from this page.",
  channel_mismatch:
    "The connection came back for a different channel and was refused.",
  no_code: "The provider did not return an authorization code. Try again.",
  bad_handshake: "The connection could not be verified. Try again.",
  exchange_failed:
    "The provider rejected the connection. If this repeats, the app credentials may be wrong.",
  not_configured: "This deployment has no credentials for that channel.",
}

export const metadata = constructMetadata({
  title: "Channel",
  noIndex: true,
})

export default async function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>
  searchParams: Promise<{ connected?: string; error?: string }>
}) {
  const { platform } = await params
  const session = await getSession()
  if (!session) {
    redirect(`/login?next=/channels/${platform}`)
  }

  const slug = `strategy/${platform}`
  const connectable = isConnectableChannel(platform)

  // The strategy page and the connection are independent reads; the 404
  // decision below only needs the first, and by then both are in hand.
  const [page, connection] = await Promise.all([
    getPage(session.user.id, slug),
    connectable ? getConnection(session.user.id, platform) : null,
  ])
  /**
   * Whether PolicyEditor will render. The page's `<h1>` is KitPage's (the
   * channel's name) either way; EditorShell's title is an `<h2>` under it.
   */
  const hasStrategy = Boolean(page && page.kind === "policy")

  if ((!page || page.kind !== "policy") && !connectable) {
    notFound()
  }

  const { error } = await searchParams

  const view: ConnectionView | null =
    connectable && connection
      ? {
          channel: connection.channel,
          state: connection.state,
          handle: connection.handle,
          displayName: connection.displayName,
          avatarUrl: connection.avatarUrl,
          // Serialised across the server/client boundary, so an epoch rather
          // than a Date — which would arrive as a string and lie about its type.
          expiresAt: connection.accessTokenExpiresAt?.getTime() ?? null,
          // Computed here rather than in the strip: `isRefreshable` reads the
          // channel config, which carries client secrets, so it must not be
          // imported into a client component. A boolean crosses the boundary;
          // the config does not.
          refreshable: isRefreshable(platform),
        }
      : null

  const title =
    PLATFORM_LABEL[platform] ??
    (page?.title || platform).replace(/\s+strategy$/i, "")

  return (
    <KitPage
      title={title}
      summary={
        hasStrategy
          ? "Whether I can publish here, and how I should sound when I do."
          : "Whether I can publish here."
      }
      actions={
        <ButtonLink href="/channels" icon={ArrowLeft01Icon}>
          Channels
        </ButtonLink>
      }
    >
      {connectable ? (
        <Stage lead="Your account.">
          <Card>
            <div className="flex flex-col gap-kit-related">
              {error ? (
                // role="alert" rather than a toast: this arrives on page load,
                // and a toast that fires before assistive tech has settled is a
                // message nobody hears. Ink, not red (docs/design/states.md).
                <div role="alert">
                  <Text>
                    {CONNECT_ERRORS[error] ?? "The connection did not complete."}
                  </Text>
                </div>
              ) : null}

              <ConnectionStrip
                channel={platform}
                label={title}
                connection={view}
                enabled={isChannelEnabled(platform)}
                isAction={!hasStrategy}
              />
            </div>
          </Card>
        </Stage>
      ) : null}

      {hasStrategy && page ? (
        <Stage lead="How I write here.">
          <PolicyEditor page={page} slug={slug} title={title} />
        </Stage>
      ) : (
        // No lead: the empty state opens with its own bold sentence.
        <Stage>
          <EmptyState
            bold={`No strategy for ${title} yet.`}
            rest="I propose one from the posts I've read, and you edit it afterwards."
          >
            {/* The proposal itself lives on /brain, which is the one page
                that holds the corpus count, the cooldown and the editor.
                A second Propose button here would be a second call site
                for a model call that already has a home. */}
            <ButtonLink href={`/brain?page=${slug}`}>
              Propose from my posts
            </ButtonLink>
          </EmptyState>
        </Stage>
      )}
    </KitPage>
  )
}
