import { redirect } from "next/navigation"

import { getSession } from "@/lib/session"
import { getBrainByKind, type BrainPage, type PolicyData } from "@/lib/brain"
import {
  isChannelEnabled,
  isConnectableChannel,
  listConnections,
} from "@/lib/channels"
import {
  ChannelsScreen,
  type AvailablePlatformView,
  type ChannelRowView,
} from "@/components/channels/channels-screen"
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
 * them, which `isChannelEnabled` decides. Everything else is listed with no
 * control and one sentence above the group saying why, because a roadmap you
 * can see beats a surface that pretends nothing else exists. What is still not
 * acceptable is a button that looks live and does nothing, which is why the
 * reason lives in text rather than in a tooltip no keyboard can reach.
 *
 * A kit page since 2026-11-16 (plans/029). This file reads; the markup is
 * components/channels/channels-screen.tsx, so the filled states can be laid
 * out from fixtures in app/prototypes/setup-pages.
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

  /** Only what the row needs, so a token never crosses into the markup. */
  const connectionView = (platform: string) => {
    const c = connections.get(platform)
    return c ? { state: c.state, handle: c.handle } : null
  }

  const rows: ChannelRowView[] = channels.map((channel) => ({
    platform: channel.platform,
    label: channel.label,
    pillars: pillarLine(channel.pillars),
    cadence: cadenceLine(channel.postsPerWeek, channel.windows),
    connection: connectionView(channel.platform),
    connectable: connectable(channel.platform),
  }))

  const others: AvailablePlatformView[] = available.map((platform) => ({
    platform,
    label: PLATFORM_LABEL[platform],
    connection: connectionView(platform),
    live: connectable(platform),
  }))

  return <ChannelsScreen channels={rows} available={others} />
}
