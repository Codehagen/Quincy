import Link from "next/link"
import { notFound, redirect } from "next/navigation"
import { ArrowLeft01Icon, Megaphone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { getSession } from "@/lib/session"
import { getPage } from "@/lib/brain"
import {
  getConnection,
  isChannelEnabled,
  isConnectableChannel,
  isRefreshable,
} from "@/lib/channels"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
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
  /** Whether PolicyEditor will render, and with it EditorShell's own `<h1>`. */
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
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 px-8 pt-6">
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2.5"
          nativeButton={false}
          render={<Link href="/channels" />}
        >
          <HugeiconsIcon
            aria-hidden="true"
            data-icon="inline-start"
            icon={ArrowLeft01Icon}
          />
          Channels
        </Button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-3xl px-8 pt-4">
          {/* The page's heading — but only when nothing else provides one.
              PolicyEditor renders through EditorShell, which already owns an
              `<h1 className="text-display">` carrying this exact title, so
              emitting a second here would give the page two h1s and print
              "LinkedIn" twice.

              That leaves the case this is actually for: a connectable channel
              with no strategy yet, which is where you land coming back from a
              consent screen. Before this, that page had no heading at all — a
              back button and then content. A screen reader skimming headings
              found nothing. It is the one thing the rejected "Identity"
              variant got right, taken without its weight problem.

              The placement differs between the two cases, which is a wart. The
              real fix is for EditorShell to take an optional heading so the
              page can own its own title in both — worth doing when something
              else needs to touch that component, not for this. */}
          {/* `text-display`, matching PageHeaderTitle on /channels and
              EditorShell's own heading one state away. It was `text-section`
              first — 17px against their 40px, for the same page's title, so
              navigating between "connected with a strategy" and "connected
              without one" resized the same word by more than double. */}
          {!hasStrategy ? (
            <h1 className="text-display text-balance">{title}</h1>
          ) : null}

          {connectable ? (
            <div className={hasStrategy ? undefined : "pt-4"}>
              {error ? (
                // role="alert" rather than a toast: this arrives on page load,
                // and a toast that fires before assistive tech has settled is a
                // message nobody hears.
                <p
                  role="alert"
                  className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-caption text-pretty text-destructive"
                >
                  {CONNECT_ERRORS[error] ?? "The connection did not complete."}
                </p>
              ) : null}

              <ConnectionStrip
                channel={platform}
                label={title}
                connection={view}
                enabled={isChannelEnabled(platform)}
              />
            </div>
          ) : null}
        </div>

        {hasStrategy && page ? (
          <PolicyEditor page={page} slug={slug} title={title} />
        ) : (
          <div className="mx-auto w-full max-w-3xl px-8 py-10">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <HugeiconsIcon icon={Megaphone01Icon} />
                </EmptyMedia>
                <EmptyTitle>No strategy for {title} yet</EmptyTitle>
                <EmptyDescription>
                  Connecting is permission; a strategy is what Quincy does with
                  it. Quincy writes that with you in Studio — it is not a form
                  you fill in here.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button nativeButton={false} render={<Link href="/studio" />}>
                  Work it out in Studio
                </Button>
              </EmptyContent>
            </Empty>
          </div>
        )}
      </div>
    </div>
  )
}
