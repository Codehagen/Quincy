import * as React from "react"

import { Friend } from "@/components/mascot/friend"

import { Card, type CardWidth } from "./card"
import { Lead, Text } from "./text"

export type EmptyStateProps = {
  /**
   * One sentence, said by a person who has run out of work: "Nothing
   * planned for this week." Not "No items found", and never an apology.
   */
  bold: string
  /** What to do, in Quincy's voice: "Tell me what you shipped and I'll find the post in it." */
  rest?: string
  /**
   * The person's own baseline, so empty does not read as failing: "Your
   * usual week has three." Small and muted under the lead. Leave it out
   * rather than invent one.
   */
  baseline?: string
  /**
   * What stands above the words. Leave it out and the friend is there:
   * `<Friend size={40} state="idle" />`, because an empty page is where
   * Quincy speaks (docs/design/quincy-chat.md, "EmptyState"). Pass another
   * Friend when a more fitting state applies. `null` leaves the words alone,
   * on purpose; use it only where a friend already stands for this object.
   * The friend may appear more than once on a page, one per object
   * (docs/design/mascot.md). Never an icon in a tinted circle.
   */
  media?: React.ReactNode
  /** The one way in: a Button, a ButtonLink, EmptyStarters. One, never two. */
  children?: React.ReactNode
  /**
   * `card` (default): its own object, standing where the list would be.
   * `none`: just the words, for inside an object that is already there (a
   * List, a Sheet, a Popover).
   */
  frame?: "card" | "none"
  /** With `frame="card"`: the width of the object it stands in for. */
  width?: CardWidth
}

/**
 * What an EmptyState shows above its words: the friend unless the caller
 * passed something, and nothing when the caller passed `null`. Exported so
 * the default can be tested without a DOM.
 */
export function emptyStateMedia(media: React.ReactNode | undefined): React.ReactNode {
  if (media === undefined) return <Friend size={40} state="idle" className="text-kit-ink" />
  return media
}

/**
 * Nothing here yet, and the one next step. Left-aligned like everything
 * else in the kit: an empty state is a sentence on the page, not a poster
 * centred in a void. components/quincy/empty-state.tsx is this with the
 * Quincy defaults (with-margin, the starters) and can sit on it.
 *
 * Put it in a Stage with no lead of its own, so the page does not say two
 * bold sentences (docs/design/layout.md, "A Stage without a lead").
 */
export function EmptyState({
  bold,
  rest,
  baseline,
  media,
  children,
  frame = "card",
  width = "full",
}: EmptyStateProps) {
  const shown = emptyStateMedia(media)
  const body = (
    <div data-slot="kit-empty-state" className="flex flex-col gap-kit-related">
      {shown != null ? <div className="flex">{shown}</div> : null}
      <div className="flex flex-col gap-kit-tight">
        <Lead bold={bold} rest={rest} />
        {baseline ? (
          <Text variant="small" tone="muted">
            {baseline}
          </Text>
        ) : null}
      </div>
      {children != null ? <div className="flex flex-wrap gap-kit-controls pt-kit-tight">{children}</div> : null}
    </div>
  )
  return frame === "card" ? <Card width={width}>{body}</Card> : body
}
