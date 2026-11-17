import { Suspense } from "react"
import { redirect } from "next/navigation"

import { filterFromParam } from "@/lib/connectors"
import { loadConnectors } from "@/lib/connectors-load"
import { constructMetadata } from "@/lib/metadata"
import { getSession } from "@/lib/session"
import { ConnectorsWorkspace } from "@/components/connectors/connectors-workspace"

/**
 * Connectors: where the material comes in and where the writing goes out,
 * on one page (decided on the connectors lab, 2026-11-17). It replaces
 * /sources and /channels, which redirect here (next.config.ts); a channel's
 * topics and times moved with it, to /connectors/[platform].
 *
 * This file reads; lib/connectors-load.ts turns rows into connectors, and
 * components/connectors draws them. Every verb on the page goes through the
 * server action or route that already held it, with its guards unchanged.
 *
 * - `?open=<id>` opens a connector's pane (the GitHub callback lands on
 *   `?open=github&github=…`).
 * - `?show=sources|channels|connected` picks the tab.
 * - `?github=…` is what GitHub's install callback said on its way back.
 */
export const metadata = constructMetadata({
  title: "Connectors",
  noIndex: true,
})

type Props = {
  searchParams: Promise<{ open?: string; show?: string; github?: string }>
}

export default function ConnectorsPage({ searchParams }: Props) {
  return (
    <Suspense>
      <Connectors searchParams={searchParams} />
    </Suspense>
  )
}

async function Connectors({ searchParams }: Props) {
  const session = await getSession()
  if (!session) {
    redirect("/login?next=/connectors")
  }

  const { open, show, github } = await searchParams
  const connectors = await loadConnectors(session.user, { githubOutcome: github })

  return (
    <ConnectorsWorkspace
      connectors={connectors}
      defaultValue={open ?? (github ? "github" : null)}
      defaultFilter={filterFromParam(show)}
    />
  )
}
