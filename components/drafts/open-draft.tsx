"use client"

import * as React from "react"

import { MarginRoom, TextLink, revealInPanel } from "@/components/kit"
import { duplicates, type Draft, type Version } from "@/lib/drafts"
import { goingOutLine, goingOutOfVersion } from "@/lib/going-out"

import { DraftFeed, type FeedAccount, type FeedField } from "./draft-feed"
import { DraftVerbs, Notices, STRANDED, type DraftAction } from "./draft-verbs"
import type { Row } from "./draft-rows"
import type { DraftsStore } from "./use-drafts"

/**
 * The open draft (decided on /prototypes/drafts-lab, round 2, "C · Feed"):
 * the idea, what prompted it, and each channel version drawn as its real
 * feed between two blank neighbours, edited in place, with Quincy's marks
 * in the margin and the verbs under the column. Inside the feed column the
 * post reads as the platform's own; everything outside it is the kit.
 */

/** The width each platform's column is drawn at, before the room narrows it. */
const OBJECT_WIDTH: Record<string, string> = { x: "598px", linkedin: "555px" }

/** The margin column beside the feed (narrower than the kit's 170, so the pane is 798). */
export const MARK_COLUMN_PX = 150

/** Who each channel's post is from, and who it is from where no channel is connected. */
export type FeedAccounts = { byChannel: Record<string, FeedAccount>; fallback: FeedAccount }

export function OpenDraft({ row, store, accounts }: { row: Row; store: DraftsStore; accounts: FeedAccounts }) {
  const d = row.draft
  const twins = duplicates({ ...d, versions: d.versions.map((v) => ({ ...v, text: store.textOf(v) })) })
  const editing = store.editingId != null && d.versions.some((v) => v.id === store.editingId)
  const firstWriting = d.versions.find((v) => v.state === "writing")?.id ?? null
  const lines = d.versions.map((v) => {
    const g = goingOutOfVersion(v, store.session(v))
    return { v, g, line: goingOutLine(g, v.label) }
  })
  /**
   * One ink action on the page (actions.md): the first waiting version's
   * Approve; then, on a decided piece, Give it a time where a slot exists,
   * else Post now where nothing else will send it. None while editing,
   * whose Save is the action.
   */
  const placeId = editing || firstWriting ? null : (lines.find((l) => l.line.placeable)?.v.id ?? null)
  const postId =
    editing || firstWriting || placeId
      ? null
      : (lines.find((l) => STRANDED.includes(l.g.kind) && l.line.postable)?.v.id ?? null)

  return (
    <article
      aria-label={d.idea}
      style={{ "--spacing-kit-margin": `${MARK_COLUMN_PX}px` } as React.CSSProperties}
      className="flex flex-col gap-kit-group"
    >
      <div className="flex flex-col gap-kit-related">
        <h2 className="text-kit-body font-kit-strong text-pretty text-kit-ink">{d.idea}</h2>
        <Provenance draft={d} />
      </div>
      {lines.map(({ v, g, line }, i) => (
        <VersionFeed
          key={v.id}
          first={i === 0}
          row={row}
          v={v}
          store={store}
          account={accounts.byChannel[v.channel] ?? accounts.fallback}
          twin={twins[v.channel]}
          going={g}
          line={line}
          action={!editing && v.id === firstWriting ? "approve" : v.id === placeId ? "place" : v.id === postId ? "post" : undefined}
        />
      ))}
    </article>
  )
}

/**
 * What prompted it: a saved post (its handle and a link; the post's text is
 * not stored), or your own idea when it says more than the heading.
 *
 * The seam for the saved post's sentence (decided as "proposed" in the
 * lab): when a draft keeps the text it leans on, or a `source_item` id to
 * read it from, it renders here, quoted, with the one Highlight on the
 * sentence the draft leans on. Until then every adapted draft links out.
 */
function Provenance({ draft }: { draft: Draft }) {
  const a = draft.from.adaptedFrom
  if (a) {
    if (!a.url) {
      return <p className="text-kit-meta text-kit-ink-muted">{a.handle ? `Adapted from @${a.handle}.` : "Adapted from a post you pasted."}</p>
    }
    return (
      <p className="text-kit-meta text-kit-ink-muted">
        <TextLink href={a.url} target="_blank" rel="noreferrer noopener">
          {a.handle ? `Read @${a.handle}'s post` : "Read the post it adapts"}
        </TextLink>
      </p>
    )
  }
  const hook = draft.from.riffHook
  if (hook && hook !== draft.idea) {
    return (
      <p className="text-kit-meta text-pretty text-kit-ink-muted">
        {`From the idea “${hook}”`}
        {/[.!?]$/.test(hook.trim()) ? "" : "."}
      </p>
    )
  }
  return null
}

function VersionFeed({
  row,
  v,
  store,
  account,
  twin,
  going,
  line,
  first,
  action,
}: {
  row: Row
  v: Version
  store: DraftsStore
  account: FeedAccount
  twin?: string
  going: ReturnType<typeof goingOutOfVersion>
  line: ReturnType<typeof goingOutLine>
  /** The first channel version: the one the pane brings into view when the draft opens. */
  first: boolean
  /** Which of its verbs is the page's one ink action, if any. */
  action?: DraftAction
}) {
  const titleId = React.useId()
  const text = store.textOf(v)
  const editing = store.editingId === v.id
  const writing = v.state === "writing"
  // One post per version today (see DraftFeed: the thread seam).
  const [draftText, setDraftText] = React.useState<string | null>(null)
  const shown = [editing ? (draftText ?? text) : text]
  const platform = v.channel === "linkedin" ? "linkedin" : "x"

  // The open post in view: on opening a draft (the first version only, or
  // the last would win and hide the first), and when E puts the caret in it.
  const postRef = React.useRef<HTMLDivElement>(null)
  React.useEffect(() => {
    if (editing || first) revealInPanel(postRef.current)
  }, [row.id, editing, first])

  // Leaving the field puts focus back on Edit, not on the page.
  const editRef = React.useRef<HTMLButtonElement>(null)
  const wasEditing = React.useRef(editing)
  React.useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const save = () => {
    store.saveEdit(v.id, shown[0]!)
    setDraftText(null)
  }
  const cancel = () => {
    store.setEditing(null)
    setDraftText(null)
  }
  const field: FeedField = editing
    ? {
        posts: shown,
        set: (_i, t) => setDraftText(t),
        onKey: (e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault()
            save()
          } else if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        },
      }
    : null

  return (
    <section aria-labelledby={titleId}>
      <span id={titleId} className="sr-only">{`Draft for ${v.label}`}</span>
      <MarginRoom objectWidth={OBJECT_WIDTH[platform]}>
        <div ref={postRef} className="flex flex-col gap-kit-related">
          <MarginRoom.Column>
            <DraftFeed
              platform={platform}
              account={account}
              posts={shown}
              writing={writing}
              field={field}
              onStartEdit={writing && !editing ? () => store.setEditing(v.id) : undefined}
            />
          </MarginRoom.Column>
          {editing ? null : (
            <MarginRoom.Column>
              <Notices v={v} text={text} twin={twin} hook={row.draft.from.riffHook} />
            </MarginRoom.Column>
          )}
          <DraftVerbs
            row={row}
            version={v}
            store={store}
            going={going}
            line={line}
            titleId={titleId}
            editing={editing ? shown : null}
            onSave={save}
            onCancel={cancel}
            editRef={editRef}
            action={action}
          />
        </div>
      </MarginRoom>
    </section>
  )
}
