"use client"

import { BookOpen01Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import type { StoryGap } from "@/lib/story-gaps"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

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
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-8 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-display text-balance">Stories</h1>
        <p className="max-w-[60ch] text-body text-pretty text-muted-foreground">
          What Quincy distilled from things you published, and what it is still
          missing. A story is what stops a draft writing around the subject.
        </p>
      </header>

      {stories.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-card-title">
            {stories.length} {stories.length === 1 ? "story" : "stories"}
          </h2>

          <ul role="list" className="flex flex-col">
            {stories.map((story) => (
              <li key={story.slug}>
                <button
                  type="button"
                  onClick={() => onSelect(story.slug)}
                  className={[
                    // A row rather than a card: this is a table of contents,
                    // and eight cards would be eight boxes saying nothing the
                    // titles do not.
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-3 text-left",
                    "transition-colors duration-150 hover:bg-accent",
                    "outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                    // 44px on its own at this padding, so nothing has to be
                    // grown with a pseudo-element for touch. This is a plain
                    // button rather than a [data-slot="button"], so the global
                    // hit-area rule in globals.css does not reach it.
                    "-mx-3",
                  ].join(" ")}
                >
                  <span className="text-body">{story.title}</span>
                  {story.point ? (
                    <span className="text-caption text-pretty text-muted-foreground">
                      {story.point}
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <HugeiconsIcon icon={BookOpen01Icon} />
            </EmptyMedia>
            <EmptyTitle>No stories yet</EmptyTitle>
            <EmptyDescription>
              Quincy distils these from what you publish. Connect X and let it
              read your posts, and the first few arrive with the voice.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <NeedsMaterial gaps={gaps} />
    </div>
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
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-card-title">Needs material</h2>
        <p className="max-w-[60ch] text-body text-pretty text-muted-foreground">
          Subjects your posts keep returning to with no story behind them.
          Answer one in Studio and Quincy writes the story from what you say.
        </p>
      </div>

      <ul role="list" className="flex flex-col gap-2.5">
        {gaps.map((gap) => (
          <li
            key={gap.theme}
            className="max-w-[65ch] text-body text-pretty text-muted-foreground"
          >
            {gap.question}
          </li>
        ))}
      </ul>
    </section>
  )
}
