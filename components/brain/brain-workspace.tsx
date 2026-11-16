"use client"

import { useQuery } from "@tanstack/react-query"
import { parseAsString, useQueryState } from "nuqs"

import { brainKeys } from "@/lib/brain-keys"
import { IDENTITY_CAP, type BrainPage } from "@/lib/brain"
import type { StoryGap } from "@/lib/story-gaps"
import {
  channelOfSlug,
  channelTitle,
  isStrategySlug,
  strategySlug,
} from "@/lib/strategy-format"
import {
  ButtonLink,
  Card,
  EmptyState,
  List,
  ListRow,
  LiveDot,
  Stage,
  Text,
  Tree,
  useRevealOnNarrow,
  type TreeNode,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { ProseEditor } from "@/components/brain/prose-editor"
import { RulesEditor } from "@/components/brain/rules-editor"
import { StoryIndex } from "@/components/brain/needs-material"
import { StrategyPage } from "@/components/brain/strategy-page"

/**
 * The brain, client-side, so switching pages costs nothing.
 *
 * It used to be a Server Component reading `searchParams`, which meant every
 * click in the tree was a fresh round trip to Neon for a set of pages that only
 * change when you save one. Measured from this app: the query executes in
 * 0.06ms and the round trip is ~120ms, so the entire cost was the network, paid
 * again on every navigation.
 *
 * Now the pages are fetched once and cached. The server still does the first
 * read — it prefetches and dehydrates, so the data is in the HTML and there is
 * no fetch-on-mount waterfall — and after that the tree is a pure client render.
 *
 * `shallow: true` on the page param is the other half of it. nuqs was the wrong
 * tool when the data lived on the server, because a shallow URL update would
 * have left the page showing the old server render. With the data in the cache
 * it is exactly right: the URL stays real and linkable, and changing it never
 * touches the server.
 */

/**
 * The three pages that always exist, whether or not they have been written.
 *
 * Named in the register the rest of the app is already in. The sidebar reads
 * Studio, Ideas, Drafts, Lineup, Numbers, Rhythm, Sources — the room where a
 * record gets made, which is also where the agent got its name. "My Human" and
 * "Instructions" were product nouns in a room full of studio nouns.
 *
 * Backstory, not "You": a label is not a name, and what a ghostwriter actually
 * needs is the story behind the person. It pairs with Stories one group down.
 * "Rules" is what the code has always called them — `rules`, `RULE_CAP`,
 * `rules-editor.tsx`.
 */
export const SINGLETONS = [
  {
    slug: "human",
    kind: "identity" as const,
    label: "Backstory",
    description:
      "Everything Quincy should know about you: background, what you have built, who you are writing for.",
  },
  {
    slug: "voice",
    kind: "voice" as const,
    label: "Voice",
    description:
      "How you sound. Capped on purpose, so the rule that matters is not buried under twelve that do not.",
  },
  {
    slug: "instructions",
    kind: "instruction" as const,
    label: "Rules",
    description:
      "Hard rules Quincy may not break. Not preferences — these outrank everything else in the brain.",
  },
]

/**
 * What crosses the wire. `createdAt` and `updatedAt` are Dates in the database
 * and strings after JSON, and both the fetch and the dehydrated cache go
 * through JSON — so the honest type says string rather than letting a Date
 * annotation lie about a value that will throw the moment someone calls
 * .getTime() on it. No editor reads them today; this keeps that true by making
 * it visible.
 */
export type BrainPageJSON = Omit<BrainPage, "createdAt" | "updatedAt"> & {
  createdAt: string
  updatedAt: string
}

async function fetchBrain(): Promise<BrainPageJSON[]> {
  const response = await fetch("/api/brain")

  if (!response.ok) {
    // Thrown with a status attached, because the retry rule in providers.tsx
    // reads `error.status` to decide that a 401 will not fix itself on the
    // third attempt. Without this the guard has nothing to read and retries
    // anyway — it was written against an error shape nothing produced.
    const error = Object.assign(new Error("Could not load the brain."), {
      status: response.status,
    })
    throw error
  }

  return response.json()
}

function label(page: BrainPageJSON) {
  return page.title || page.slug.split("/").at(-1) || page.slug
}

/** The virtual page that lists the stories and what they are missing. */
export const STORY_INDEX = "stories"

export function BrainWorkspace({
  userId,
  gaps,
  strategyChannels,
  corpusPosts,
  proposeNotice,
}: {
  userId: string
  /** Themes the corpus returns to with no story page. See lib/story-gaps.ts. */
  gaps: StoryGap[]
  /** X first, then anything else connected. Resolved on the server. */
  strategyChannels: string[]
  corpusPosts: number
  proposeNotice: string | null
}) {
  const [active, setActive] = useQueryState(
    "page",
    // clearOnDefault keeps /brain clean rather than /brain?page=human, and
    // shallow (the default) means selecting a page never asks the server for
    // anything — the data is already here.
    parseAsString.withDefault("human").withOptions({ clearOnDefault: true })
  )

  const { data: pages = [], isPending } = useQuery({
    queryKey: brainKeys.list(userId),
    queryFn: fetchBrain,
    // The brain changes when you save it, and saving invalidates this key. Left
    // at the default it would refetch every minute for a page that had not
    // moved.
    staleTime: 5 * 60 * 1000,
  })

  const byKind = (kind: BrainPage["kind"]) =>
    pages.filter((p) => p.kind === kind)
  const find = (slug: string) => pages.find((p) => p.slug === slug) ?? null

  // The inbox is plumbing: raw captures waiting for Heartbeat, with an empty
  // body by construction. Showing it would be showing the user a blank page and
  // calling it memory.
  const memories = byKind("memory").filter((p) => p.slug !== "memory/inbox")

  // `corrected` marks the exception, not the rule. Everything in a group is
  // compiled by construction, so marking all of it said nothing; a page you
  // have edited is the state that matters, because that is the one Heartbeat
  // stops writing to. It is a word in the row's meta ("yours"), not a glyph
  // with a title attribute, which touch and the keyboard never see.
  const mark = (corrected: boolean) => (corrected ? "yours" : undefined)

  // The collections Quincy fills. Each is a branch whose own row opens an
  // overview (the story index, or the group's explanation and its pages), so
  // an empty one is a single row that still says what will go there, one
  // press in, rather than sitting in the middle of the navigation.
  //
  // Stories and Notes, and the difference between them is already written down
  // in this codebase: `assertValid` rejects a story with no point because "a
  // story without a point is a note".
  //
  // Strategy is here as well as at /channels, not instead of it. The page is
  // the same row and the editor is the same component; what differs is the
  // question being asked. /channels asks "may Quincy speak for me here",
  // which is about a connection. /brain asks "what does Quincy know", and the
  // plan for a channel is knowledge the writer reads on every draft —
  // `renderBrain` has always put it in the prompt under "## Strategy". The
  // item exists whether or not the page does, because an absent page is
  // exactly the state the propose button is for.
  const groups: Group[] = [
    {
      value: STRATEGY_GROUP,
      label: "Strategy",
      items: strategyChannels.map((channel) => {
        const page = find(strategySlug(channel))
        return {
          slug: strategySlug(channel),
          label: channelTitle(channel),
          corrected: page?.provenance === "user",
        }
      }),
      about: "One plan per channel: what it is for, who reads it, and the split Quincy writes to.",
      empty: "Connect a channel and Quincy proposes a plan for it.",
    },
    {
      value: STORY_INDEX,
      label: "Stories",
      items: byKind("story").map((p) => ({
        slug: p.slug,
        label: label(p),
        corrected: p.provenance === "user",
      })),
      about: "Distilled from what you publish.",
      empty: "Nothing published yet.",
    },
    {
      value: NOTES_GROUP,
      label: "Notes",
      items: memories.map((p) => ({
        slug: p.slug,
        label: label(p),
        corrected: p.provenance === "user",
      })),
      about: "What Quincy picks up from your conversations, written on Monday night.",
      empty: "Nothing yet. Talk to Quincy in Studio and the first notes arrive after Monday.",
    },
  ]

  // The three pages you write come first and flat, because they always exist
  // and there is nothing to disclose. Six rows at rest, so the open page is
  // never far below the row that opened it (docs/design/page.md).
  const items: TreeNode[] = [
    ...SINGLETONS.map((s) => ({ value: s.slug, label: s.label })),
    ...groups.map((group) => ({
      value: group.value,
      label: group.label,
      // Tabular mono, so the column does not shuffle as counts tick 9 → 10.
      meta: String(group.items.length),
      children: group.items.map((item) => ({
        value: item.slug,
        label: item.label,
        meta: mark(Boolean(item.corrected)),
      })),
    })),
  ]

  // On a phone the open page sits under the tree, below the fold; bring its
  // top into view when the person picks another one. Focus stays on the row.
  const detailRef = useRevealOnNarrow<HTMLDivElement>(active)

  return (
    <Stage
      lead="What Quincy knows about you."
      rest="It reads these pages before every draft. Change one and the next draft follows."
    >
      <List aria-label="Brain pages">
        <Tree
          aria-label="Brain pages"
          items={items}
          value={active}
          // A second press on the open page would clear the selection; the
          // brain always has a page open, so a null keeps the current one.
          onValueChange={(next) => {
            if (next) void setActive(next)
          }}
        />
      </List>

      {/* The detail, under the list in the same Stage and at the same width.
          Keyed by the page inside renderEditor, so each editor's local state
          (the text, dirty, read or edit) resets when another page opens. */}
      <div ref={detailRef} className="flex flex-col self-stretch">
        {renderEditor({
          active,
          find,
          groups,
          isPending,
          gaps,
          corpusPosts,
          proposeNotice,
          stories: byKind("story"),
          onSelect: setActive,
        })}
      </div>
    </Stage>
  )
}

/** The branch rows that open an overview rather than a page. */
const STRATEGY_GROUP = "strategy"
const NOTES_GROUP = "notes"

type GroupItem = { slug: string; label: string; corrected?: boolean }

type Group = {
  value: string
  label: string
  items: GroupItem[]
  /** What the group holds, one sentence. */
  about: string
  /** What to do while it holds nothing. */
  empty: string
}

/**
 * A group's own row, opened: what it is for, and its pages as rows. The
 * explanation that used to sit inside the closed disclosure lives here, so
 * an empty group still says what it will hold.
 */
function GroupOverview({
  group,
  onSelect,
}: {
  group: Group
  onSelect: (slug: string) => void
}) {
  return (
    <Card>
      <div className="flex flex-col gap-kit-group">
        <header className="flex flex-col gap-kit-tight">
          <Text as="h2" weight="strong">
            {group.label}
          </Text>
          <Text tone="muted">{group.about}</Text>
        </header>

        {group.items.length === 0 ? (
          <div className="flex flex-col gap-kit-related">
            <Text>{group.empty}</Text>
            {group.value === STRATEGY_GROUP ? (
              <div className="flex">
                <ButtonLink href="/channels">Connect a channel</ButtonLink>
              </div>
            ) : null}
          </div>
        ) : (
          <ul role="list" className="-mx-kit-row-x flex flex-col gap-kit-tight">
            {group.items.map((item) => (
              <li key={item.slug} className="flex flex-col">
                <ListRow
                  onClick={() => onSelect(item.slug)}
                  meta={
                    item.corrected ? (
                      <span className="font-kit-mono text-kit-mono text-kit-ink-muted">
                        yours
                      </span>
                    ) : undefined
                  }
                >
                  {item.label}
                </ListRow>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Card>
  )
}

function renderEditor({
  active,
  find,
  groups,
  isPending,
  gaps,
  corpusPosts,
  proposeNotice,
  stories,
  onSelect,
}: {
  active: string
  find: (slug: string) => BrainPageJSON | null
  groups: Group[]
  isPending: boolean
  gaps: StoryGap[]
  corpusPosts: number
  proposeNotice: string | null
  stories: BrainPageJSON[]
  onSelect: (slug: string) => void
}) {
  const singleton = SINGLETONS.find((s) => s.slug === active)
  const page = find(active)
  const group = groups.find((g) => g.value === active && g.value !== STORY_INDEX)

  if (group) {
    return <GroupOverview group={group} onSelect={onSelect} />
  }

  if (active === STORY_INDEX) {
    return (
      <StoryIndex
        stories={stories.map((story) => ({
          slug: story.slug,
          title: story.title || story.slug,
          point: String(
            (story.data as { point?: unknown } | null)?.point ?? ""
          ),
        }))}
        gaps={gaps}
        onSelect={onSelect}
      />
    )
  }

  // Before the page lookup, because a channel with no strategy yet has no page
  // to look up and that is the state the propose button exists for.
  if (isStrategySlug(active)) {
    return (
      <StrategyPage
        key={active}
        page={page}
        channel={channelOfSlug(active)}
        corpusPosts={corpusPosts}
        cooldown={proposeNotice}
      />
    )
  }

  if (singleton?.kind === "identity") {
    return (
      <ProseEditor
        // Remount on page change. useBrainForm seeds its state from the page it
        // was given, and React reuses a component of the same type at the same
        // position — without this, switching pages would keep the previous
        // page's text in the box.
        key={singleton.slug}
        page={page}
        slug={singleton.slug}
        title={singleton.label}
        description={singleton.description}
        cap={IDENTITY_CAP}
      />
    )
  }

  if (singleton) {
    return (
      <RulesEditor
        key={singleton.slug}
        page={page}
        slug={singleton.slug}
        kind={singleton.kind}
        title={singleton.label}
        description={singleton.description}
      />
    )
  }

  if (page?.kind === "memory") {
    return (
      <ProseEditor
        key={page.slug}
        page={page}
        slug={page.slug}
        title={page.title}
        description="What Quincy has picked up from your conversations."
      />
    )
  }

  // A story is prose. `narrative` used to sit in `data` beside the fields that
  // select it, which put it on the wrong side of the brain's one rule — `data`
  // is what code reads, `body` is what only the model reads.
  if (page?.kind === "story") {
    return (
      <ProseEditor
        key={page.slug}
        page={page}
        slug={page.slug}
        title={page.title}
        description="Distilled from something you published. The point and the proof live with it."
      />
    )
  }

  if (isPending) {
    return (
      <Card>
        <Text as="div" role="status">
          <LiveDot pulse>Reading the brain.</LiveDot>
        </Text>
      </Card>
    )
  }

  // A page the link names but the brain does not hold: an old link to a note
  // that has since been folded away, or a slug typed by hand.
  return (
    <EmptyState
      media={<Friend size={40} state="idle" className="text-kit-ink" />}
      bold="Nothing here yet."
      rest={
        groups.find((g) => g.value === NOTES_GROUP)?.items.length
          ? "Pick a page above."
          : "Talk to Quincy in Studio. What is worth keeping gets written here on Monday night."
      }
    />
  )
}
