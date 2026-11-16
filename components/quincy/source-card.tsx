import * as React from "react"

import { Card, Mono, Text, TextLink } from "@/components/kit"
import { hostnameOf, looksLikeUrl } from "@/lib/source-artifact"

/**
 * A source Quincy opened in the conversation (`read_source`): where it came
 * from in Mono, its title, a short excerpt, and a link out. A Card, not a
 * Window: a turn can open two sources, and chrome appears once per view.
 * The model still reads the whole source; this is only what the person needs
 * to recognise it.
 */
export type SourceCardProps = {
  url: string | null
  title: string
  excerpt: string
}

export function SourceCard({ url, title, excerpt }: SourceCardProps) {
  const host = hostnameOf(url)
  return (
    <Card width="with-margin">
      <div className="flex flex-col gap-kit-related">
        <div className="flex min-w-0 flex-col gap-kit-tight">
          <Mono>{host ?? "Source"}</Mono>
          <Text as="h3" weight="strong">
            {title}
          </Text>
        </div>
        {excerpt ? <Text tone="muted">{excerpt}</Text> : null}
        {url && looksLikeUrl(url) ? (
          <Text>
            <TextLink href={url} target="_blank" rel="noreferrer noopener">
              Open the source
            </TextLink>
          </Text>
        ) : null}
      </div>
    </Card>
  )
}
