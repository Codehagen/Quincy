import { Suspense } from "react"
import { redirect } from "next/navigation"

import { ButtonLink, Card, KitPage, List, Mono, NavRow, Stage, Text } from "@/components/kit"
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons"
import { SampleButton } from "@/components/editor/sample-button"
import { UploadDrop } from "@/components/editor/upload-drop"
import { StageSkeleton } from "@/components/quincy/stage-skeleton"
import { listProjects } from "@/lib/editor/projects"
import { sampleAvailable } from "@/lib/editor/sample"
import { constructMetadata } from "@/lib/metadata"
import { getSession } from "@/lib/session"

/**
 * One recording in, several cuts out.
 *
 * In the sidebar as "Cuts · Beta" (nav.ts): the editor is still the largest
 * unfinished surface in the app, and the tag says so instead of hiding it.
 */
export const metadata = constructMetadata({
  title: "Cuts",
  noIndex: true,
})

const SUMMARY = "Drop a recording and it becomes something you can cut."

/**
 * The reads sit under the page's own Suspense: on a client navigation the
 * layout's boundary is above what re-renders, so reads awaited outside one
 * held the navigation. The fallback is the page's frame and title.
 */
export default function CutsPage({
  searchParams,
}: {
  searchParams: Promise<{ all?: string }>
}) {
  return (
    <Suspense
      fallback={
        <KitPage title="Cuts" summary={SUMMARY}>
          <StageSkeleton lines={["64%", "40%"]} />
          <StageSkeleton lines={["46%", "58%", "38%"]} />
        </KitPage>
      }
    >
      <Cuts searchParams={searchParams} />
    </Suspense>
  )
}

async function Cuts({ searchParams }: { searchParams: Promise<{ all?: string }> }) {
  const session = await getSession()
  if (!session) redirect("/login?next=/cuts")

  const [projects, { all }, hasSample] = await Promise.all([
    listProjects(session.user.id),
    searchParams,
    // Only when the owner has committed a prepared sample (see
    // docs/video-ingest.md). Before that there is no button, not a broken one.
    sampleAvailable(),
  ])

  // Cuts opens the room, not a list of rooms: with a cut in progress, the
  // sidebar row lands in the editor on the most recently touched one
  // (listProjects orders by updatedAt). The list and the upload stay one
  // click away, behind the editor's "All cuts" (?all=1).
  if (projects.length > 0 && !all) redirect(`/cuts/${projects[0].id}`)

  return (
    <KitPage
      title="Cuts"
      summary={SUMMARY}
      // Cuts is full screen, without the app sidebar: this is the way back.
      actions={
        <ButtonLink href="/studio" icon={ArrowLeft01Icon}>
          Back to Studio
        </ButtonLink>
      }
    >
      <Stage
        lead="A recording in."
        rest="It is transcoded to an editing copy, the audio is read for a waveform, and the words are timestamped, all before you touch it."
      >
        <Card>
          <div className="flex flex-col gap-kit-related">
            <UploadDrop />
            {/* For someone with nothing to cut yet. Made from files prepared
                once and committed, so it spends nothing (lib/editor/sample.ts). */}
            {hasSample && projects.length === 0 ? <SampleButton /> : null}
          </div>
        </Card>
      </Stage>

      <Stage lead="Your cuts." aria-label="Your cuts">
        {projects.length > 0 ? (
          <List>
            {projects.map((project) => (
              <NavRow
                key={project.id}
                href={`/cuts/${project.id}`}
                // Revision, not a date: it is the number the save path
                // actually turns on, and seeing it move is the cheapest
                // evidence that optimistic concurrency is working.
                meta={<Mono>rev {project.revision}</Mono>}
              >
                {project.title}
              </NavRow>
            ))}
          </List>
        ) : (
          <Text tone="muted">Nothing here yet.</Text>
        )}
      </Stage>
    </KitPage>
  )
}
