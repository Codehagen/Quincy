import { Suspense } from "react"
import { redirect } from "next/navigation"

import {
  getCirclebackSetup,
  getGithubSetup,
  getOpenMergeQuestion,
} from "@/app/(app)/sources/actions"
import { getConnection } from "@/lib/channels"
import { corpusSummary } from "@/lib/corpus-x"
import { getSession } from "@/lib/session"
import { getSourceConnections } from "@/lib/sources"
import { constructMetadata } from "@/lib/metadata"
import { KitPage } from "@/components/kit"
import { SourcesStages } from "@/components/sources/sources-stages"

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
 * **A kit page since 2026-11-16** (plans/029: a page moves whole). The
 * groups are Stages and the rows sit in one Card per group, after the
 * landing's reads-and-posts picture. The body lives in
 * components/sources/sources-stages.tsx so app/prototypes/sources can mount
 * the same component against fixtures.
 */
export const metadata = constructMetadata({
  title: "Sources",
  noIndex: true,
})

type Props = {
  /**
   * How the GitHub install went. The callback is a redirect, so this is the
   * only channel it has back to the person, and a redirect that lands on an
   * unchanged page is indistinguishable from one that did nothing at all.
   * Same shape as app/(app)/channels/[platform]/page.tsx.
   */
  searchParams: Promise<{ github?: string }>
}

export default async function SourcesPage({ searchParams }: Props) {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/sources")
  }

  /**
   * The title renders before the reads (docs/design/page.md): KitPage stays
   * outside the Suspense, and the body waits for its data inside it.
   */
  return (
    <KitPage
      title="Sources"
      summary="Where your material comes in. Quincy reads nothing you have not connected."
    >
      <Suspense fallback={null}>
        <SourcesBody user={session.user} searchParams={searchParams} />
      </Suspense>
    </KitPage>
  )
}

async function SourcesBody({
  user,
  searchParams,
}: {
  user: Parameters<typeof getSourceConnections>[0]
  searchParams: Props["searchParams"]
}) {
  /**
   * Five reads, one round trip of waiting instead of five.
   *
   * Each of these depends only on the session, and a Neon round trip is
   * ~120ms while the queries themselves are microseconds, so sequential
   * awaits here were the whole cost of the page. The corpus read below is the
   * one dependent read (it needs the X connection's state), so it starts
   * after that promise alone rather than after everything.
   */
  const [connections, circlebackSetup, githubSetup, xConnection, question] =
    await Promise.all([
      getSourceConnections(user),
      getCirclebackSetup(),
      getGithubSetup(),
      getConnection(user.id, "x"),
      /**
       * The one question Quincy is waiting on, read here rather than by the
       * row. See plans/027 phase 1c: one indexed select against a page that
       * is already making four, and a client component cannot make it.
       */
      getOpenMergeQuestion(),
    ])
  const { github: githubOutcome } = await searchParams

  // The channel read-back. Only for a live X connection: a row offering to
  // read a channel that cannot be read would be a dead control.
  const corpus =
    xConnection?.state === "active" ? await corpusSummary(user.id) : null

  return (
    <SourcesStages
      connections={connections}
      circlebackSetup={circlebackSetup}
      githubSetup={githubSetup}
      githubOutcome={githubOutcome}
      question={question}
      x={
        xConnection?.state === "active" && corpus
          ? { handle: xConnection.handle, items: corpus.items }
          : null
      }
    />
  )
}
