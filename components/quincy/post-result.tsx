import * as React from "react"

import { Avatar, Card, Mono, Text, TextLink } from "@/components/kit"
import { againstMedian, type AgainstMedianInput } from "@/lib/against-median"
import type { ScoredPost } from "@/lib/numbers"

/**
 * A published post, stated against the person's own median (plans/030 #7;
 * lab 30, 21's median line). Never a follower count, never a dark tile: the
 * number is a figure on its own line and the median is the grey line under it.
 *
 * Server-safe: no state, no effects.
 */

export type AgainstMedianProps = AgainstMedianInput & {
  /** `p` (default) on its own line; `span` inside a sentence. */
  as?: "p" | "span"
}

/**
 * The one line every number in the product needs: "1.8× your median." or
 * "Your median is 6." Muted body text, so it never adds a third type size.
 */
export function AgainstMedian({ as = "p", ...input }: AgainstMedianProps) {
  return (
    <Text as={as} tone="muted">
      {againstMedian(input).text}
    </Text>
  )
}

export type PostResultProps = {
  /** The scored post, from `getNumbers` (lib/numbers.ts `ScoredPost`). */
  post: ScoredPost
  /** Your corpus median (`NumbersView.median`). */
  median: number
  /** "X". `ScoredPost` carries no channel: the corpus is read from X today. */
  channelLabel: string
  initials: string
  /** `h3` (default) under a page's h2. */
  as?: "h2" | "h3"
}

export function PostResult({ post, median, channelLabel, initials, as = "h3" }: PostResultProps) {
  const titleId = React.useId()
  return (
    <Card role="group" aria-labelledby={titleId}>
      <div className="flex flex-col gap-kit-related">
        <div className="flex items-center gap-kit-related">
          <Avatar initials={initials} />
          <div className="flex min-w-0 flex-col">
            <Text as={as} weight="strong" id={titleId}>
              Published
            </Text>
            <Mono>
              {channelLabel} · {post.date}
            </Mono>
          </div>
        </div>

        <Text>{post.hook}</Text>

        <div>
          <Text>It reached</Text>
          <Text variant="figure">{post.impressions.toLocaleString("en-US")} views</Text>
          <AgainstMedian value={post.impressions} median={median} />
        </div>

        <Text tone="muted">
          {post.replies === 1 ? "One reply." : `${post.replies.toLocaleString("en-US")} replies.`}
          {post.live ? null : " Numbers from the import, not a live reading."}{" "}
          <TextLink href={post.url} target="_blank" rel="noreferrer">
            View the post
          </TextLink>
        </Text>
      </div>
    </Card>
  )
}
