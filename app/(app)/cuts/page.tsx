import Link from "next/link"
import { redirect } from "next/navigation"

import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { UploadDrop } from "@/components/editor/upload-drop"
import { listProjects } from "@/lib/editor/projects"
import { constructMetadata } from "@/lib/metadata"
import { getSession } from "@/lib/session"

/**
 * One recording in, several cuts out.
 *
 * Deliberately not in the sidebar yet. The editor is the largest unfinished
 * surface in the app and putting it in the navigation would promise a finished
 * one — the same call /channels made while it only had two platforms.
 */
export const metadata = constructMetadata({
  title: "Cuts",
  noIndex: true,
})

export default async function CutsPage() {
  const session = await getSession()
  if (!session) redirect("/login?next=/cuts")

  const projects = await listProjects(session.user.id)

  return (
    <div className="mx-auto w-full max-w-4xl px-6 pb-24">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderTitle>Cuts</PageHeaderTitle>
          <PageHeaderDescription>
            Drop a recording and it becomes something you can cut. The file is
            transcoded to an editing copy, the audio is read for a waveform, and
            the words are timestamped — all before you touch it.
          </PageHeaderDescription>
        </PageHeaderContent>
      </PageHeader>

      <UploadDrop />

      {projects.length > 0 ? (
        <ul className="mt-10 space-y-1">
          {projects.map((project) => (
            <li key={project.id}>
              <Link
                href={`/cuts/${project.id}`}
                className="flex items-baseline justify-between gap-4 rounded-lg px-3 py-2.5 transition-colors hover:bg-foreground/[0.04]"
              >
                <span className="truncate text-sm">{project.title}</span>
                <span className="shrink-0 text-xs text-foreground/40 tabular-nums">
                  {/* Revision, not a date: it is the number the save path
                      actually turns on, and seeing it move is the cheapest
                      evidence that optimistic concurrency is working. */}
                  rev {project.revision}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-10 px-3 text-sm text-foreground/40">
          Nothing here yet.
        </p>
      )}
    </div>
  )
}
