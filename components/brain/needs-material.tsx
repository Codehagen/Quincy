"use client"

import type { StoryGap } from "@/lib/story-gaps"
import { Card, EmptyState, ListRow, Rule, Text } from "@/components/kit"
import { Friend } from "@/components/mascot"

/**
 * The story index, and the half of it that is missing. Plan 027, 3b.
 *
 * A story bank lists what it holds. This is the other question — what it does
 * not — and it is the one that produces the next story. Every line is a
 * question Quincy would ask, written from a theme and a count with no model
 * call anywhere: see lib/story-gaps.ts.
 *
 * **The count is in the sentence on purpose.** "You mention pricing in 7 posts"
 * is a claim about somebody's own writing, and a claim about somebody's own
 * writing has to carry its evidence or it is Quincy having an opinion about
 * them. Seven is checkable; "often" is not.
 */
export function StoryIndex({
  stories,
  gaps,
  onSelect,
}: {
  stories: { slug: string; title: string; point: string }[]
  gaps: StoryGap[]
  onSelect: (slug: string) => void
}) {
  if (stories.length === 0) {
    return (
      <Card>
        <div className="flex flex-col gap-kit-group">
          <EmptyState
            frame="none"
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="No stories yet."
            rest="I distil these from what you publish. Connect X and let me read your posts, and the first few arrive with your voice."
          />
          {gaps.length > 0 ? (
            <>
              <Rule />
              <NeedsMaterial gaps={gaps} />
            </>
          ) : null}
        </div>
      </Card>
    )
  }

  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <header className="flex flex-col gap-kit-tight">
          <Text as="h2" weight="strong">
            {stories.length} {stories.length === 1 ? "story" : "stories"}
          </Text>
          <Text tone="muted">
            What Quincy distilled from things you published. A story is what
            stops a draft writing around the subject.
          </Text>
        </header>

        {/* Rows, not cards: this is a table of contents, and eight cards
            would be eight boxes saying nothing the titles do not. Pulled out
            by the row's own inset, so the titles line up with the heading
            and the hover shape reaches past them. */}
        <ul role="list" className="-mx-kit-row-x flex flex-col gap-kit-tight">
          {stories.map((story) => (
            <li key={story.slug} className="flex flex-col">
              <ListRow
                description={story.point || undefined}
                onClick={() => onSelect(story.slug)}
              >
                {story.title}
              </ListRow>
            </li>
          ))}
        </ul>

        {gaps.length > 0 ? (
          <>
            <Rule />
            <NeedsMaterial gaps={gaps} />
          </>
        ) : null}
      </div>
    </Card>
  )
}

/**
 * The gap list. Five at most — see `STORY_GAP_CAP`: a sixth line turns a
 * prompt into a backlog, and a backlog is a thing to feel guilty about rather
 * than a thing to answer.
 */
export function NeedsMaterial({ gaps }: { gaps: StoryGap[] }) {
  if (gaps.length === 0) return null

  return (
    <section className="flex flex-col gap-kit-related">
      <div className="flex flex-col gap-kit-tight">
        <Text as="h3" weight="strong">
          Needs material
        </Text>
        <Text tone="muted">
          Subjects your posts keep returning to with no story behind them.
          Answer one in Studio and Quincy writes the story from what you say.
        </Text>
      </div>

      <ul role="list" className="flex flex-col gap-kit-related">
        {gaps.map((gap) => (
          <Text as="li" key={gap.theme}>
            {gap.question}
          </Text>
        ))}
      </ul>
    </section>
  )
}
