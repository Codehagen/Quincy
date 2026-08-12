import Link from "next/link"
import { redirect } from "next/navigation"

import { getCirclebackSetup, getGithubSetup } from "@/app/(app)/sources/actions"
import { getConnection } from "@/lib/channels"
import { corpusSummary } from "@/lib/corpus-x"
import { getSession } from "@/lib/session"
import { getSourceConnections, SOURCES } from "@/lib/sources"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { ChannelSourceRow } from "@/components/sources/channel-source-row"
import { CirclebackSourceRow } from "@/components/sources/circleback-source-row"
import { GithubSourceRow } from "@/components/sources/github-source-row"
import { SourceRow } from "@/components/sources/source-row"
import { constructMetadata } from "@/lib/metadata"

/**
 * Where the material comes in.
 *
 * Symmetric with Channels, and read with the same eyes: a row per thing, one
 * treatment, the name and what it hands over on the left, its action on the
 * right. Roster won the exploration on that symmetry — you publish to five or
 * six places and read from as many as you can be bothered to wire up, so the
 * shape that has to survive twenty rows is the one that matters here.
 *
 * The page was built for two groups and rendered one for months. It renders
 * three now, and the middle one is the change: plans/019 landed
 * `source_connection` and one source that uses it, so "Connected" can finally
 * mount and the row draws the states it was designed for against real data
 * rather than fixtures.
 *
 * **The rest of the register stays deliberately dead**, and that is still the
 * honest shape. There is no connection model for the other ten — no OAuth, no
 * credentials — and, the part that matters more, no rhythm that would read
 * them. Three of them have a rhythm written on paper (Voice Notes reads voice,
 * Shipped Work reads github, Photo Carousels reads photos) and none of those
 * three run.
 *
 * Circleback is the exception on both counts, which is why it is pulled out of
 * that register entirely: material arrives on a webhook and becomes a riff
 * without anybody pressing anything. It is the first source on this page where
 * connecting it changes what the product does.
 *
 * The one live thing on the page is the channel read-back (plans/011): the
 * aside below always said "your channels are also sources", and the X row
 * makes that sentence true — a connected X account can be read into
 * `source_item` and compiled into the brain. It is a person pressing a
 * button, not a rhythm, which is why the page's no-brass rule is untouched.
 *
 * They are listed anyway, with buttons disabled and one sentence saying why,
 * because a roadmap you can see beats a surface that pretends nothing else
 * exists. What is not acceptable is a button that looks live and does nothing.
 *
 * The tile stays muted throughout. Brass means live, and nothing here is live.
 */
export const metadata = constructMetadata({
  title: "Sources",
  noIndex: true,
})

export default async function SourcesPage({
  searchParams,
}: {
  /**
   * How the GitHub install went. The callback is a redirect, so this is the
   * only channel it has back to the user — and a redirect that lands on an
   * unchanged page is indistinguishable from one that did nothing at all.
   * Same shape as app/(app)/channels/[platform]/page.tsx.
   */
  searchParams: Promise<{ github?: string }>
}) {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/sources")
  }

  /**
   * Four reads, one round trip of waiting instead of four.
   *
   * Each of these depends only on the session, and a Neon round trip is
   * ~120ms while the queries themselves are microseconds — sequential awaits
   * here were the whole cost of the page. The corpus read below is the one
   * dependent read (it needs the X connection's state), so it starts after
   * that promise alone rather than after everything.
   */
  const [connections, circlebackSetup, githubSetup, xConnection] =
    await Promise.all([
      getSourceConnections(session.user),
      getCirclebackSetup(),
      getGithubSetup(),
      getConnection(session.user.id, "x"),
    ])
  const { github: githubOutcome } = await searchParams

  /**
   * The live sources are pulled out of both groups and rendered on their own.
   *
   * They are the ones with a real connection model — Circleback in plans/019,
   * GitHub in plans/021 — so they are the ones whose rows own mutations, and
   * `SourceRow` is a server component with disabled buttons by design.
   * Filtering them out here rather than teaching that component about a live
   * case keeps the dead register dead, which is the property the page's header
   * comment is protecting.
   *
   * Each sits in "Connected" once a row exists and in "Ready to connect" before
   * that, because the ones you can actually connect are the most useful thing
   * on the page and burying them among the disabled rows would be filing
   * beating usefulness.
   *
   * **This was a special case for one source and is now a list**, which is the
   * shape it should have had: the third live source adds an entry here rather
   * than a third branch at every point below.
   */
  const LIVE = ["circleback", "github"] as const

  /**
   * The row, not the fixture. See `GithubSetup.connected`.
   *
   * `connections` carries demo fixtures for the addresses in lib/demo.ts, and
   * one of them claims GitHub has been arriving since yesterday. Reading it here
   * made the Install button unreachable for every demo account — which is every
   * account that would install first.
   */
  const githubConnected = githubSetup?.connected === true

  const rest = SOURCES.filter(
    (s) => !(LIVE as readonly string[]).includes(s.id)
  )
  const connected = rest.filter((s) => connections[s.id])
  const available = rest.filter((s) => !connections[s.id])

  const anyLiveConnected = Boolean(circlebackSetup) || githubConnected
  const anyLiveAvailable = !circlebackSetup || !githubConnected

  // The channel read-back. Rendered only for a live X connection — a row
  // offering to read a channel that cannot be read would be the dead button
  // this page refuses to ship.
  const corpus =
    xConnection?.state === "active"
      ? await corpusSummary(session.user.id)
      : null

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-8 py-10">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Sources</PageHeaderTitle>
          <PageHeaderDescription>
            Where the material comes in. Quincy reads nothing you have not
            connected.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      {/* Said once, in text, rather than by duplicating every channel as a
          second row. Quincy's rhythms already read published work back as
          material — Atomize turns an essay into a week of posts — so a channel
          is a source the moment it is connected, and asking you to connect X on
          two pages would be a filing decision leaking into the product. */}
      {/* No surface at all. Given `bg-card` + `shadow-xs` this resolved to the
          identical surface as the list below — same token, same 20px radius,
          same shadow — so an aside about another page read as one more row of
          the thing you came to scan. `bg-muted` fixed that and broke something
          worse: muted-foreground on muted measures 4.45:1, under the 4.5 floor
          for 13px text.

          So it takes no fill and sits on the page ground at 5.57:1, which is
          also what the closing paragraph does. Two asides, one treatment, one
          at each end of the list — subordinate by weight rather than by being
          a quieter card. */}
      <p className="px-3 text-caption text-pretty text-muted-foreground">
        Your channels are also sources. Quincy reads back what you publish
        there, so there is nothing to connect twice —{" "}
        <Link
          href="/channels"
          className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
        >
          manage them on Channels
        </Link>
        .
      </p>

      {/* The sentence above, made real for X. One row, one action, and only
          when the connection is live — the section disappears rather than
          rendering a disabled promise. LinkedIn joins it when the DMA product
          clears review (plans/011). */}
      {xConnection?.state === "active" && corpus ? (
        <section className="flex flex-col gap-3">
          <h2 className="px-3 text-eyebrow text-muted-foreground uppercase">
            From your channels
          </h2>

          <ul
            role="list"
            className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
          >
            <ChannelSourceRow
              handle={xConnection.handle}
              items={corpus.items}
            />
          </ul>
        </section>
      ) : null}

      {/* Rendered only when something is connected. An empty "Connected" card
          with a heading over it would be a worse empty state than no section at
          all — it announces a group and then shows you nothing, which reads as
          a page that failed to load rather than a product you have not set up.
          Today this never renders; the day one source connects, it does. */}
      {connected.length > 0 || anyLiveConnected ? (
        <section className="flex flex-col gap-3">
          {/* Titled, because the group below it is. An unlabelled list followed
              by a labelled one runs h1 → nothing → h2, which drops a screen
              reader into a set of rows with no idea what they are. */}
          <h2 className="px-3 text-eyebrow text-muted-foreground uppercase">
            Connected
          </h2>

          <ul
            role="list"
            className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
          >
            {circlebackSetup ? (
              <CirclebackSourceRow
                connection={connections.circleback ?? null}
                setup={circlebackSetup}
              />
            ) : null}
            {githubConnected && githubSetup ? (
              <GithubSourceRow
                /* Only read once the row is known to exist, so a fixture can
                   never supply the "last merge" line for a source nothing has
                   merged into. */
                connection={connections.github ?? null}
                setup={githubSetup}
                outcome={githubOutcome}
              />
            ) : null}
            {connected.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                connection={connections[source.id]}
              />
            ))}
          </ul>
        </section>
      ) : null}

      {/* The one source anybody can actually connect, given its own group
          rather than a live button hidden among fourteen disabled ones. The
          group disappears the moment it is connected — the row moves up into
          "Connected" — so this heading never describes something already
          done. */}
      {anyLiveAvailable ? (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-1 px-3">
            <h2 className="text-eyebrow text-muted-foreground uppercase">
              Ready to connect
            </h2>
            {/* One sentence per source rather than one for the group. They do
                different things and the difference is what somebody is
                choosing between — a shared line would have to describe both
                and would therefore describe neither. */}
            {!circlebackSetup ? (
              <p className="text-caption text-pretty text-muted-foreground">
                Circleback sends Quincy each call as it ends. Quincy reads your
                own half of the transcript, keeps the passage worth publishing,
                and stores nothing anybody else said.
              </p>
            ) : null}
            {!githubConnected ? (
              <p className="text-caption text-pretty text-muted-foreground">
                GitHub sends Quincy each pull request as it merges. Quincy reads
                the description you already wrote — never the diff — and keeps
                the merges that carry an idea.
              </p>
            ) : null}
          </div>

          <ul
            role="list"
            className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
          >
            {!circlebackSetup ? (
              <CirclebackSourceRow connection={null} setup={null} />
            ) : null}
            {!githubConnected && githubSetup ? (
              <GithubSourceRow
                connection={null}
                setup={githubSetup}
                outcome={githubOutcome}
              />
            ) : null}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-3">
          <h2 className="text-eyebrow text-muted-foreground uppercase">
            Not connectable yet
          </h2>
          {/* The reason lives here, once, in text. A disabled control cannot
              hold a tooltip — it is not focusable, so a keyboard user would
              never reach the explanation. Both halves are stated: the
              connection does not exist, and neither does anything that would
              read it. The second is the one that decides whether connecting
              would be worth anything. */}
          <p className="text-caption text-pretty text-muted-foreground">
            Quincy will read these once accounts can be connected. Nothing here
            is wired up, and no rhythm runs yet that would read it.
          </p>
        </div>

        {/* One elevation token owns the edge — no border alongside it. */}
        <ul
          role="list"
          className="divide-y divide-border overflow-hidden rounded-xl bg-card shadow-xs"
        >
          {/* `connection={null}` for every row today, and not as a placeholder:
              `getSourceConnections` returns nothing because nothing is
              connected, so null is the true value rather than a value we have
              not fetched. The connected states this row can render are
              exercised in app/prototypes/sources, against this same
              component. */}
          {available.map((source) => (
            <SourceRow key={source.id} source={source} connection={null} />
          ))}
        </ul>
      </section>

      <p className="px-3 text-caption text-pretty text-muted-foreground">
        Connecting a source will not publish anything. Material arrives, a
        rhythm reads it, and you approve what it writes —{" "}
        {/* Underlined at rest, not on hover. Against the muted paragraph around
            it the link colour measures 1.92:1, and colour alone needs 3:1 to
            carry a link inside a block of text — so the underline is the thing
            actually marking it, and a hover-only underline is invisible to a
            keyboard or a thumb. Hover firms the line up rather than drawing
            one. */}
        <Link
          href="/rhythm"
          className="text-foreground underline decoration-muted-foreground/40 underline-offset-4 hover:decoration-current"
        >
          see what would read them
        </Link>
        .
      </p>
    </div>
  )
}
