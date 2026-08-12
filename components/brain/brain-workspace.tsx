"use client"

import { useQuery } from "@tanstack/react-query"
import { BrainIcon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { parseAsString, useQueryState } from "nuqs"

import { brainKeys } from "@/lib/brain-keys"
import { IDENTITY_CAP, type BrainPage } from "@/lib/brain"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  BrainTree,
  type TreeGroup,
  type TreeItem,
} from "@/components/brain/brain-tree"
import { ProseEditor } from "@/components/brain/prose-editor"
import { RulesEditor } from "@/components/brain/rules-editor"

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
 * Studio, Riffs, Drafts, Lineup, Numbers, Rhythm, Sources — the room where a
 * record gets made, which is also where the agent got its name. "My Human" and
 * "Instructions" were product nouns in a room full of studio nouns, and four of
 * Stanley's six page names were ours too.
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

export function BrainWorkspace({ userId }: { userId: string }) {
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

  const byKind = (kind: BrainPage["kind"]) => pages.filter((p) => p.kind === kind)
  const find = (slug: string) => pages.find((p) => p.slug === slug) ?? null

  // The inbox is plumbing: raw captures waiting for Heartbeat, with an empty
  // body by construction. Showing it would be showing the user a blank page and
  // calling it memory.
  const memories = byKind("memory").filter((p) => p.slug !== "memory/inbox")

  // The three pages you write. Flat, because they always exist and there is
  // nothing to disclose.
  const owned: TreeItem[] = SINGLETONS.map((s) => ({
    slug: s.slug,
    label: s.label,
  }))

  // The collections Quincy fills. Disclosures, so an empty one is a closed row
  // with a zero on it — the explanation is still there, one click in, rather
  // than sitting permanently in the middle of the navigation.
  //
  // Stories and Notes, and the difference between them is already written down
  // in this codebase: `assertValid` rejects a story with no point because "a
  // story without a point is a note".
  //
  // `corrected` marks the exception, not the rule. Everything in here is
  // compiled by construction, so marking all of it said nothing; a page you
  // have edited is the state that matters, because that is the one Heartbeat
  // stops writing to.
  const groups: TreeGroup[] = [
    {
      label: "Stories",
      items: byKind("story").map((p) => ({
        slug: p.slug,
        label: label(p),
        corrected: p.provenance === "user",
      })),
      empty: "Distilled from what you publish. Nothing published yet.",
    },
    {
      label: "Notes",
      items: memories.map((p) => ({
        slug: p.slug,
        label: label(p),
        corrected: p.provenance === "user",
      })),
      empty: "What Quincy picks up from your conversations, written on Monday night.",
    },
  ]

  return (
    // h-full and min-h-0: the tree and the editor each scroll on their own, so
    // the outer container must have a ceiling to resolve against rather than
    // growing to fit both.
    <div className="flex h-full min-h-0 flex-col md:flex-row">
      <BrainTree
        pages={owned}
        groups={groups}
        active={active}
        onSelect={setActive}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        {renderEditor({ active, find, memories, isPending })}
      </div>
    </div>
  )
}

function renderEditor({
  active,
  find,
  memories,
  isPending,
}: {
  active: string
  find: (slug: string) => BrainPageJSON | null
  memories: BrainPageJSON[]
  isPending: boolean
}) {
  const singleton = SINGLETONS.find((s) => s.slug === active)
  const page = find(active)

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

  return (
    <div className="mx-auto flex w-full max-w-3xl px-8 py-10">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <HugeiconsIcon icon={BrainIcon} />
          </EmptyMedia>
          <EmptyTitle>{isPending ? "Loading" : "Nothing here yet"}</EmptyTitle>
          <EmptyDescription>
            {isPending
              ? "Reading the brain."
              : memories.length === 0
                ? "Talk to Quincy in Studio. What is worth keeping gets written here on Monday night."
                : "Pick a page on the left."}
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  )
}
