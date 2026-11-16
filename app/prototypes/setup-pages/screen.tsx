import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"

import {
  OUTLIER_GATE,
  hook,
  median as medianOf,
  rollupByAngle,
  type NumbersView,
  type ScoredPost,
} from "@/lib/numbers"
import { ButtonLink, Card, KitPage, Stage } from "@/components/kit"
import { AppShell } from "@/components/quincy/shell/app-shell"
import { ChannelsScreen } from "@/components/channels/channels-screen"
import { ConnectionStrip } from "@/components/channels/connection-strip"
import { PolicyEditor } from "@/components/channels/policy-editor"
import { NumbersScreen } from "@/components/numbers/numbers-screen"
import { POSTS } from "./numbers-data"

const USER = { name: "Ada Lind", email: "dev@quincy.test" }

function numbersFixture(): NumbersView {
  const mid = medianOf(POSTS.map((p) => p.impr))
  const sorted = [...POSTS].sort((a, b) => b.at.localeCompare(a.at))
  const fmt = (at: string) =>
    new Date(`${at}T12:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      timeZone: "UTC",
    })
  const newest = sorted[0]
  const oldest = sorted.at(-1)!
  const axis = (at: string) =>
    new Date(`${at}T12:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      timeZone: "UTC",
    })
  const scored: ScoredPost[] = sorted.map((p) => ({
    id: p.id,
    url: `https://x.com/i/status/${p.id}`,
    hook: hook(p.body, 110),
    date: fmt(p.at),
    impressions: p.impr,
    replies: p.replies,
    multiple: p.impr / mid,
    live: false,
  }))
  const bodies = new Map(POSTS.map((p) => [p.id, p.body]))
  return {
    scored: scored.length,
    skipped: 4,
    median: mid,
    mean: Math.round(POSTS.reduce((s, p) => s + p.impr, 0) / POSTS.length),
    live: {
      count: 9,
      median: 1840,
      mean: 2600,
      best: 9100,
      medianEngagements: 31,
      empty: false,
      since: "today at 06:00",
      days: 30,
      connected: true,
      matched: 6,
    },
    // Each end with its own year: the posts run from Nov 2025 to Aug 2026,
    // and a year pasted onto both read "27 Nov 2026 to 8 Aug 2026".
    from: `${fmt(oldest.at)} ${oldest.at.slice(0, 4)}`,
    to: `${fmt(newest.at)} ${newest.at.slice(0, 4)}`,
    fromAxis: axis(oldest.at),
    toAxis: axis(newest.at),
    byDate: [...scored].reverse(),
    outliers: scored.filter((p) => p.multiple >= OUTLIER_GATE).length,
    below: scored.filter((p) => p.multiple < 1).length,
    best: Math.max(...scored.map((p) => p.multiple)),
    linkRepliesBelow: 3,
    rows: rollupByAngle(scored, bodies),
    inferred: true,
  }
}

const POLICY = {
  id: "fixture",
  slug: "strategy/x",
  kind: "policy",
  title: "X strategy",
  body: "",
  data: {
    platform: "x",
    goal: "Reply to every person who replies",
    goalDate: "2026-12-31",
    positioning: "Building a booking tool for small harbours, in public.",
    audience: { primary: "Harbour masters and the people who build for them", secondary: "" },
    pillars: [
      { name: "Building in public", weight: 40 },
      { name: "Small software", weight: 35 },
      { name: "Harbour life", weight: 25 },
    ],
    cadence: { postsPerDay: 1, postsPerWeek: 5 },
    windows: ["08:00", "12:30"],
    leanInto: ["Open with a moment, not a lesson"],
    avoid: ["Generic advice that could come from anyone"],
  },
}

export async function Screen({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const s = (await searchParams).s ?? "channels"
  let body: React.ReactNode

  if (s === "numbers") {
    body = <NumbersScreen numbers={numbersFixture()} />
  } else if (s === "channel" || s === "channel-stale") {
    body = (
      <KitPage
        title="X"
        summary="Whether I can publish here, and how I should sound when I do."
        actions={
          <ButtonLink href="/channels" icon={ArrowLeft01Icon}>
            Channels
          </ButtonLink>
        }
      >
        <Stage lead="Your account.">
          <Card>
            <ConnectionStrip
              channel={s === "channel" ? "x" : "linkedin"}
              label={s === "channel" ? "X" : "LinkedIn"}
              enabled
              connection={{
                channel: s === "channel" ? "x" : "linkedin",
                state: s === "channel" ? "active" : "needs_reauth",
                handle: "@adalind",
                displayName: "Ada Lind",
                avatarUrl: null,
                expiresAt: null,
                refreshable: s === "channel",
              }}
            />
          </Card>
        </Stage>
        <Stage lead="How I write here.">
          {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
          <PolicyEditor page={POLICY as any} slug="strategy/x" title="X" />
        </Stage>
      </KitPage>
    )
  } else {
    body = (
      <ChannelsScreen
        channels={[
          {
            platform: "x",
            label: "X",
            pillars: "Building in public 40% · Small software 35% · Harbour life 25%",
            cadence: "5×/week · 08:00 · 12:30",
            connection: { state: "active", handle: "@adalind" },
            connectable: true,
          },
          {
            platform: "linkedin",
            label: "LinkedIn",
            pillars: "Small software 60% · Hiring 40%",
            cadence: "2×/week · 08:00",
            connection: { state: "needs_reauth", handle: "Ada Lind" },
            connectable: true,
          },
        ]}
        available={["threads", "bluesky", "instagram", "youtube", "mastodon", "substack", "kit"].map(
          (p) => ({
            platform: p,
            label: p === "youtube" ? "YouTube" : p === "kit" ? "Kit" : p[0].toUpperCase() + p.slice(1),
            connection: null,
            live: false,
          })
        )}
      />
    )
  }

  return (
    <AppShell defaultOpen conversations={[]} user={USER}>
      {body}
    </AppShell>
  )
}
