import Link from "next/link"

import { SOURCES } from "@/lib/sources"
import {
  PageHeader,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderTitle,
} from "@/components/page-header"
import { SourceRow } from "@/components/sources/source-row"

import { MOCK_CONNECTIONS } from "../data"

/**
 * Roster, with connections.
 *
 * Mounts the **production** `SourceRow` — not a copy of it — against mock
 * states, so what gets reviewed here is the component that ships. A prototype
 * that reimplements the row would drift from it within a week and review the
 * wrong thing.
 *
 * The page chrome is a near-copy of `app/(app)/sources/page.tsx` and that is
 * fine: chrome is not what is under review. The rows are.
 *
 * Everything here is fixture. The real page shows eleven inert rows, because
 * eleven inert rows is the truth today.
 */
export function Roster() {
  const connected = SOURCES.filter((s) => MOCK_CONNECTIONS[s.id] !== null)
  const available = SOURCES.filter((s) => MOCK_CONNECTIONS[s.id] === null)

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

      <p className="text-caption text-muted-foreground px-3 text-pretty">
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

      {/* Connected first, then the rest in authored order. One treatment per
          row is about presentation; sequence is a separate question, and four
          live sources scattered through eleven rows makes you hunt for the one
          you came to check.

          Titled, because the group below it is. An unlabelled list followed by
          a labelled one runs h1 → nothing → h2, which drops a screen reader
          into seven rows with no idea what they are. */}
      <section className="flex flex-col gap-3">
        <h2 className="text-eyebrow text-muted-foreground px-3 uppercase">
          Connected
        </h2>

        <ul
          role="list"
          className="bg-card divide-border divide-y overflow-hidden rounded-xl shadow-xs"
        >
          {connected.map((source) => (
            <SourceRow
              key={source.id}
              source={source}
              connection={MOCK_CONNECTIONS[source.id]}
            />
          ))}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1 px-3">
          <h2 className="text-eyebrow text-muted-foreground uppercase">
            Not connectable yet
          </h2>
          <p className="text-caption text-muted-foreground text-pretty">
            Quincy will read these once accounts can be connected. Nothing here
            is wired up, and no rhythm runs yet that would read it.
          </p>
        </div>

        <ul
          role="list"
          className="bg-card divide-border divide-y overflow-hidden rounded-xl shadow-xs"
        >
          {available.map((source) => (
            <SourceRow key={source.id} source={source} connection={null} />
          ))}
        </ul>
      </section>

      <p className="text-caption text-muted-foreground px-3 text-pretty">
        Connecting a source will not publish anything. Material arrives, a
        rhythm reads it, and you approve what it writes —{" "}
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
