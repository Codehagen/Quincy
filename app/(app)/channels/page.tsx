import Link from "next/link"
import { redirect } from "next/navigation"
import { ArrowRight01Icon, Megaphone01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { getSession } from "@/lib/session"
import { getBrainByKind, type BrainPage, type PolicyData } from "@/lib/brain"
import {
  isChannelEnabled,
  isConnectableChannel,
  listConnections,
} from "@/lib/channels"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"
import { constructMetadata } from "@/lib/metadata"

/**
 * Where the writing goes out.
 *
 * Symmetric with Sources, which is where the material comes in. A channel's
 * strategy is still a brain page of kind `policy`, saved through lib/brain.ts,
 * so the pillar-weight invariant still rejects a split that does not add up
 * to 100. None of that data moved.
 *
 * What moved is the shape. This was a row of tabs above one editor, and the
 * tab strip disappeared entirely when you only had one channel — a switcher
 * that is invisible until you have two of something is not navigation. Now the
 * page is an index and each channel has its own URL, which is what a list of
 * destinations should have been from the start.
 *
 * **The second list is no longer uniformly dead.** X and LinkedIn have a
 * connection model now (plan 005), so their buttons are real links to the
 * consent flow — but only where the deployment actually holds credentials for
 * them, which `isChannelEnabled` decides. Everything else stays disabled with
 * one sentence above the group saying why, because a roadmap you can see beats
 * a surface that pretends nothing else exists. What is still not acceptable is
 * a button that looks live and does nothing, which is why the reason lives in
 * text rather than in a tooltip no keyboard can reach — a disabled control is
 * not focusable.
 *
 * The tile stays muted throughout. Brass means "this ritual is running", and a
 * connected account is a capability, not a live run.
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

/**
 * Publishing destinations only, in the order Plan 005 takes them on. Meeting
 * recorders, note tools and repos are material coming *in* and belong to
 * /sources; Slack and Telegram are places you talk to Quincy and belong to the
 * chat. One grid holding all three is the mistake this page exists not to make.
 */
const SUPPORTED_PLATFORMS = [
  "x",
  "linkedin",
  "threads",
  "bluesky",
  "instagram",
  "youtube",
  "mastodon",
  "substack",
  "kit",
] as const

function readPolicy(page: BrainPage) {
  const data = (page.data ?? {}) as Partial<PolicyData>
  const platform = data.platform ?? page.slug.split("/").at(-1) ?? page.slug

  return {
    platform,
    // Derived rather than read from `title`, so rows already in the database
    // render correctly with no migration behind them.
    label:
      PLATFORM_LABEL[platform] ??
      (page.title || platform).replace(/\s+strategy$/i, ""),
    pillars: data.pillars ?? [],
    postsPerWeek: data.cadence?.postsPerWeek,
    windows: data.windows ?? [],
  }
}

/** "5×/week · 09:00" — the two numbers the scheduler actually reads. */
function cadenceLine(postsPerWeek?: number, windows: string[] = []) {
  const parts: string[] = []
  if (typeof postsPerWeek === "number" && postsPerWeek > 0) {
    parts.push(`${postsPerWeek}×/week`)
  }
  if (windows.length > 0) parts.push(windows.join(" · "))
  return parts.join(" · ")
}

/** "Building in public 40% · Dev tooling 30%" — the split, biggest first. */
function pillarLine(pillars: { name: string; weight: number }[]) {
  return [...pillars]
    .sort((a, b) => b.weight - a.weight)
    .map((p) => `${p.name} ${p.weight}%`)
    .join(" · ")
}

/** The tile. One treatment, because nothing on this page is live yet. */
function Tile({ platform, label }: { platform: string; label: string }) {
  // Card radius is 20px and the row insets 16px, so the tile derives to
  // 20 − 16 = 4px.
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-xs bg-muted text-muted-foreground">
      {hasPlatformMark(platform) ? (
        <PlatformMark platform={platform} size={16} />
      ) : (
        // A platform we have no logo for still gets a filled tile rather than
        // an empty box. The row beside it already says the name, so this is
        // decoration, not information.
        <span aria-hidden="true" className="text-caption font-medium">
          {label.slice(0, 1).toUpperCase()}
        </span>
      )}
    </div>
  )
}

function List({ children }: { children: React.ReactNode }) {
  return (
    // One elevation token owns the edge — no border alongside it.
    <ul
      role="list"
      className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
    >
      {children}
    </ul>
  )
}

export const metadata = constructMetadata({
  title: "Channels",
  noIndex: true,
})

export default async function ChannelsPage() {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/channels")
  }

  // Concurrent: the policy pages and the connection list are independent
  // questions about the same account, and serializing them doubled the page's
  // Neon wait for nothing.
  const [pages, allConnections] = await Promise.all([
    getBrainByKind(session.user.id, "policy"),
    listConnections(session.user.id),
  ])
  const channels = pages.map(readPolicy)
  const configured = new Set(channels.map((c) => c.platform))
  const available = SUPPORTED_PLATFORMS.filter((p) => !configured.has(p))

  // One query for every connection, then a lookup per row. The alternative —
  // getConnection inside the map — is a Neon round trip per platform, and this
  // page renders nine of them.
  //
  // Keyed by plain string on purpose. The rows this page iterates are the nine
  // SUPPORTED_PLATFORMS and whatever slugs are already in the database, which
  // is a wider set than the two Quincy can connect. A narrower key would make
  // every lookup a cast.
  const connections = new Map<
    string,
    Awaited<ReturnType<typeof listConnections>>[number]
  >(allConnections.map((c) => [c.channel, c]))

  /** A platform this deployment can actually start a consent flow for. */
  const connectable = (platform: string) =>
    isConnectableChannel(platform) && isChannelEnabled(platform)

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Channels</PageHeaderTitle>
          <PageHeaderDescription>
            Where the writing goes out. Quincy publishes nowhere you have not
            set up.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {channels.length === 0 ? (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={Megaphone01Icon} />
            </EmptyMedia>
            <EmptyTitle>No channels yet</EmptyTitle>
            <EmptyDescription>
              A channel is one place you publish, and what Quincy should sound
              like there. Quincy writes the strategy with you — it is not a form
              you fill in here.
            </EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button nativeButton={false} render={<Link href="/studio" />}>
              Set one up in Studio
              <HugeiconsIcon
                aria-hidden="true"
                data-icon="inline-end"
                icon={ArrowRight01Icon}
              />
            </Button>
          </EmptyContent>
        </Empty>
      ) : (
        <List>
          {channels.map((channel) => {
            const cadence = cadenceLine(channel.postsPerWeek, channel.windows)
            const pillars = pillarLine(channel.pillars)
            const connection = connections.get(channel.platform)

            return (
              <li
                key={channel.platform}
                className="flex items-center gap-3 px-4 py-3"
              >
                <Tile platform={channel.platform} label={channel.label} />

                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex items-center gap-2">
                    <p className="text-card-title">{channel.label}</p>
                    {/* The account, not the strategy. A channel with a policy
                        and no connection is a plan Quincy cannot carry out,
                        and that difference belongs where the eye already is
                        rather than one click away. */}
                    {connection ? (
                      <Badge
                        variant={
                          connection.state === "active"
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {connection.state === "active"
                          ? (connection.handle ?? "Connected")
                          : "Needs reconnecting"}
                      </Badge>
                    ) : connectable(channel.platform) ? (
                      <Badge variant="ghost">Not connected</Badge>
                    ) : null}
                  </div>
                  <p className="truncate text-caption text-muted-foreground">
                    {pillars || "No pillars set"}
                  </p>
                </div>

                {/* shrink-0 and nowrap together: a channel with three posting
                    windows was wrapping its cadence onto a second line, which
                    made that one row taller than its neighbours and broke the
                    scan down the column. The pillar line on the left is the one
                    allowed to give up space, and it already truncates. */}
                <div className="ml-auto flex shrink-0 items-center gap-4">
                  {cadence ? (
                    <p className="hidden font-mono text-caption whitespace-nowrap text-muted-foreground tabular-nums sm:block">
                      {cadence}
                    </p>
                  ) : null}

                  {/* The row is not itself a link: wrapping it would make the
                      whole thing one announcement and kill text selection. The
                      action is its own control.

                      nativeButton={false} because this renders an anchor — Base
                      UI warns otherwise, and the warning is right. */}
                  <Button
                    variant="ghost"
                    nativeButton={false}
                    render={<Link href={`/channels/${channel.platform}`} />}
                  >
                    Manage
                    <HugeiconsIcon
                      aria-hidden="true"
                      data-icon="inline-end"
                      icon={ArrowRight01Icon}
                    />
                  </Button>
                </div>
              </li>
            )
          })}
        </List>
      )}

      {available.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 px-3">
            <h2 className="text-eyebrow text-muted-foreground uppercase">
              Other platforms
            </h2>
            {/* The reason lives here, once, in text. A disabled control cannot
                hold a tooltip — it is not focusable, so a keyboard user would
                never reach the explanation. */}
            <p className="text-caption text-pretty text-muted-foreground">
              Connect an account and Quincy can publish there. The rest are not
              wired up yet.
            </p>
          </div>

          <List>
            {available.map((platform) => {
              const label = PLATFORM_LABEL[platform]
              const connection = connections.get(platform)
              const live = connectable(platform)

              return (
                <li
                  key={platform}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Tile platform={platform} label={label} />

                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-card-title">{label}</p>
                    {connection ? (
                      <Badge
                        variant={
                          connection.state === "active"
                            ? "outline"
                            : "destructive"
                        }
                      >
                        {connection.state === "active"
                          ? (connection.handle ?? "Connected")
                          : "Needs reconnecting"}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="ml-auto shrink-0">
                    {live ? (
                      // A real link to the consent flow, not a fetch: the
                      // point is to leave this origin, and an anchor does that
                      // without a handler and survives slow JavaScript.
                      <Button
                        nativeButton={false}
                        variant={connection ? "ghost" : "outline"}
                        render={
                          <Link
                            href={
                              connection
                                ? `/channels/${platform}`
                                : `/api/connect/${platform}`
                            }
                          />
                        }
                      >
                        {connection ? "Manage" : "Connect"}
                      </Button>
                    ) : (
                      // The Button's own disabled style is opacity: 0.5, which
                      // drops this label to 2.72:1 — measured. Nothing requires
                      // contrast on a disabled control, but this label is the
                      // entire point of the row: it is what tells you the
                      // platform is coming. So the button recedes by surface
                      // instead of by dimming, and the word stays readable.
                      <Button
                        variant="outline"
                        disabled
                        className="disabled:border-transparent disabled:bg-muted disabled:text-muted-foreground disabled:opacity-100"
                      >
                        Connect
                      </Button>
                    )}
                  </div>
                </li>
              )
            })}
          </List>
        </section>
      ) : null}
    </div>
  )
}
