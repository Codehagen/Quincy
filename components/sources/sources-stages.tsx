import * as React from "react"

import type {
  CirclebackSetup,
  GithubSetup,
  MergeQuestion,
} from "@/app/(app)/sources/actions"
import { SOURCES, type Connection } from "@/lib/sources"
import { Stage, Text, TextLink } from "@/components/kit"
import { ChannelSourceRow } from "@/components/sources/channel-source-row"
import { CirclebackSourceRow } from "@/components/sources/circleback-source-row"
import { GithubSourceRow } from "@/components/sources/github-source-row"
import { SourceList, SourceRow } from "@/components/sources/source-row"

/**
 * The body of /sources: everything under the title, as Stages.
 *
 * Data in, no reads of its own, so the page feeds it real rows and
 * app/prototypes/sources feeds it fixtures, and both render the component
 * that ships.
 *
 * Four groups, each shown only when it has a row:
 *
 * 1. **Reading now.** Sources with a connection. Circleback (plans/019) and
 *    GitHub (plans/021) are the live ones; anything else here is a fixture
 *    in the prototype, because nothing else can connect yet.
 * 2. **Ready to connect.** The live sources not yet connected. Given their
 *    own group rather than a live control hidden among a dozen that cannot
 *    be pressed. The row moves up into group 1 the moment it connects.
 * 3. **Your channels.** A channel is a source the moment it is connected, so
 *    it is said once here rather than asking you to connect X on two pages.
 *    The X row is the read-back (plans/011), shown only for a live X
 *    connection: a row offering to read a channel that cannot be read would
 *    be a dead control.
 * 4. **Coming later.** The register: listed so the roadmap is visible, with
 *    no control on any row, because a control that does nothing is the one
 *    thing this page refuses to ship. The Stage says why, once, in words.
 */

/**
 * The live sources, pulled out of the register. They are the ones with a
 * real connection model, so they are the ones whose rows own mutations.
 * The third live source adds an entry here rather than a third branch below.
 */
const LIVE = ["circleback", "github"] as const

export type SourcesStagesProps = {
  connections: Partial<Record<string, Connection>>
  circlebackSetup: CirclebackSetup | null
  githubSetup: GithubSetup | null
  /** `?github=…` from the install callback. */
  githubOutcome?: string
  question: MergeQuestion | null
  /** The X read-back, present only for an active X connection. */
  x: { handle: string | null; items: number } | null
}

export function SourcesStages({
  connections,
  circlebackSetup,
  githubSetup,
  githubOutcome,
  question,
  x,
}: SourcesStagesProps) {
  /**
   * The row, not the fixture. See `GithubSetup.connected`: a connections map
   * once carried demo fixtures that made Install unreachable, so the row is
   * the fact.
   */
  const githubConnected = githubSetup?.connected === true

  const rest = SOURCES.filter(
    (s) => !(LIVE as readonly string[]).includes(s.id)
  )
  const connected = rest.filter((s) => connections[s.id])
  const later = rest.filter((s) => !connections[s.id])

  const anyLiveConnected = Boolean(circlebackSetup) || githubConnected
  const anyLiveAvailable =
    !circlebackSetup || (!githubConnected && githubSetup !== null)

  return (
    <>
      {connected.length > 0 || anyLiveConnected ? (
        <Stage
          aria-label="Reading now"
          lead="Reading now."
          rest="What comes in from these reaches Quincy without you pressing anything."
        >
          <SourceList>
            {circlebackSetup ? (
              <CirclebackSourceRow
                connection={connections.circleback ?? null}
                setup={circlebackSetup}
              />
            ) : null}
            {githubConnected && githubSetup ? (
              <GithubSourceRow
                connection={connections.github ?? null}
                setup={githubSetup}
                outcome={githubOutcome}
                question={question}
              />
            ) : null}
            {connected.map((source) => (
              <SourceRow
                key={source.id}
                source={source}
                connection={connections[source.id] ?? null}
              />
            ))}
          </SourceList>
        </Stage>
      ) : null}

      {anyLiveAvailable ? (
        <Stage
          aria-label="Ready to connect"
          lead="Ready to connect."
          rest="Each one takes a minute, and none of them posts anything."
        >
          <SourceList>
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
          </SourceList>
        </Stage>
      ) : null}

      {x ? (
        <Stage
          aria-label="Your channels"
          lead="Your channels are sources too."
          rest="Quincy reads back what you post, so there is nothing to connect twice."
        >
          <SourceList>
            <ChannelSourceRow handle={x.handle} items={x.items} />
          </SourceList>
          <Text variant="small" tone="muted">
            <TextLink href="/channels">Manage them on Channels</TextLink>
          </Text>
        </Stage>
      ) : (
        <Text tone="muted">
          Your channels are sources too. Quincy reads back what you post, so
          there is nothing to connect twice.{" "}
          <TextLink href="/channels">Manage them on Channels</TextLink>.
        </Text>
      )}

      {later.length > 0 ? (
        <Stage
          aria-label="Coming later"
          lead="Coming later."
          rest="None of these can be connected yet, and nothing would read them if they could."
        >
          <SourceList>
            {later.map((source) => (
              <SourceRow key={source.id} source={source} connection={null} />
            ))}
          </SourceList>
        </Stage>
      ) : null}

      <Text tone="muted">
        Connecting a source never posts anything. Material comes in, a rhythm
        reads it, and you approve what it writes.{" "}
        <TextLink href="/rhythm">See what would read them</TextLink>.
      </Text>
    </>
  )
}
