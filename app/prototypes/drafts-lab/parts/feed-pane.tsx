"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { BeatBracket, Beats, Button, HoldButton, MarginNote } from "@/components/kit"
import { QuincyAsks } from "@/components/quincy"
import { paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
import { duplicates } from "@/lib/drafts"
import { goingOutLine, goingOutOfVersion } from "@/lib/going-out"
import { CHANNEL_RULES, measurePost } from "@/lib/post-length"

import { LAB_ACCOUNT, THREAD_BREAK, threadPosts, type LabDraft, type LabVersion } from "../data"
import { LabOptionsContext } from "../lab-options"
import type { DraftsStore, Row } from "../use-drafts"
import { Head, Notices, PostNow, Provenance, STRANDED, Status, noteFor, offerQuestion } from "./draft-sheet"
import { FeedColumn, FeedPost, FeedSkeleton, FeedThread, type FeedPlatform } from "./feed/feed"
import { feedCut } from "./feed-preview"
import { MarginRoom } from "./margin-room"

/**
 * C · Feed, picked (owner, 2026-11-16: "So the feed, but we need to make it
 * look more of the actual UI that they have"). Inside the feed column the
 * post reads as the platform's own: X's 598 column, LinkedIn's card on its
 * grey feed, their type, colours (tracking our light and dark) and action
 * rows, with no counts anywhere. Everything outside the column is the kit:
 * the strip above, the marks in the margin, the verbs under it.
 *
 * Measured, not copied as assets: sizes and colours from the platforms'
 * own light and dark themes, icons drawn here as paths of the same form.
 * The marks stand outside the column by the kit's own rule: each post's
 * text column sets `--kit-card-pad` to the distance from its right edge to
 * the column's outer edge, inside a `kit-stage` room, so BeatBracket and
 * MarginNote place their slot just past the column.
 */

export function FeedPane({ row, store, isAction = true }: { row: Row; store: DraftsStore; isAction?: boolean }) {
  const o = React.useContext(LabOptionsContext)
  const d = row.draft
  const twins = duplicates({ ...d, versions: d.versions.map((v) => ({ ...v, text: store.textOf(v) })) })
  const editing = store.editingId != null && d.versions.some((v) => v.id === store.editingId)
  const firstWriting = d.versions.find((v) => v.state === "writing")?.id ?? null
  const lines = d.versions.map((v) => {
    const g = goingOutOfVersion(v, store.session(v))
    return { v, g, line: goingOutLine(g, v.label) }
  })
  const placeId = editing || firstWriting ? null : (lines.find((l) => l.line.placeable)?.v.id ?? null)
  const postId = editing || firstWriting || placeId ? null : (lines.find((l) => STRANDED.includes(l.g.kind) && l.line.postable)?.v.id ?? null)
  const vars = {
    "--spacing-kit-margin": `${o.markCol}px`,
    "--dl-post-x": `${o.postX}px`,
    "--dl-post-linkedin": `${o.postLinkedIn}px`,
  } as React.CSSProperties

  return (
    <article aria-label={d.idea} style={vars} className="flex flex-col gap-kit-group">
      <div className="flex flex-col gap-kit-related">
        <Head draft={d} />
        <Provenance draft={d} />
      </div>
      {d.versions.map((v, i) => (
        <VersionFeed
          key={v.id}
          first={i === 0}
          draft={d}
          row={row}
          v={v}
          store={store}
          twin={twins[v.channel]}
          approveIsAction={isAction && !editing && v.id === firstWriting}
          placeIsAction={isAction && v.id === placeId}
          postIsAction={isAction && v.id === postId}
        />
      ))}
    </article>
  )
}

function VersionFeed({
  draft,
  row,
  v,
  store,
  twin,
  approveIsAction,
  placeIsAction,
  postIsAction,
  first,
}: {
  draft: LabDraft
  row: Row
  v: LabVersion
  store: DraftsStore
  /** The first channel version: the one the pane brings into view when the draft opens. */
  first: boolean
  twin?: string
  approveIsAction: boolean
  placeIsAction: boolean
  postIsAction: boolean
}) {
  const titleId = React.useId()
  const text = store.textOf(v)
  const editing = store.editingId === v.id
  const writing = v.state === "writing"
  const [posts, setPosts] = React.useState<string[] | null>(null)
  const shown = editing ? (posts ?? split(text)) : split(text)
  const going = goingOutOfVersion(v, store.session(v))
  const line = goingOutLine(going, v.label)
  const linkedin = v.channel === "linkedin"

  // The open post in view: on opening a draft, and when E puts the caret in it.
  const postRef = React.useRef<HTMLDivElement>(null)
  // Each version would scroll the pane on open, and the last one would win and
  // hide the first: only the first version reveals on open; E reveals its own.
  React.useEffect(() => {
    if (editing || first) revealInPane(postRef.current)
  }, [row.id, editing, first])

  // Entering edit starts from the text as it stands; leaving it puts focus back on Edit.
  const editRef = React.useRef<HTMLButtonElement>(null)
  const wasEditing = React.useRef(editing)
  React.useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const save = () => {
    store.saveEdit(v.id, shown.length > 1 ? shown.join("\n---\n") : shown[0]!)
    setPosts(null)
  }
  const cancel = () => {
    store.setEditing(null)
    setPosts(null)
  }
  const startEdit = writing && !editing ? () => store.setEditing(v.id) : undefined
  const field = editing
    ? {
        posts: shown,
        set: (i: number, t: string) => setPosts(shown.map((p, j) => (j === i ? t : p))),
        onKey: (e: React.KeyboardEvent) => {
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
      <MarginRoom data-channel={v.channel}>
        <div ref={postRef} className="flex flex-col gap-kit-related">
          <MarginRoom.Column>
            <DraftFeed platform={linkedin ? "linkedin" : "x"} posts={shown} writing={writing} field={field} onStartEdit={startEdit} />
          </MarginRoom.Column>

          {editing ? (
            // The counter is ours, under the post: a ring is the composer's, not the feed's, and the column must read as the feed.
            <MarginRoom.Column className="flex flex-wrap items-center gap-kit-controls">
              <Button size="sm" variant="action" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <span aria-live="polite" className="ms-auto">
                <Counter posts={shown} channel={v.channel} />
              </span>
            </MarginRoom.Column>
          ) : (
            <>
              <MarginRoom.Column>
                <Notices v={v} text={shown.length > 1 ? shown[0]! : text} twin={twin} hook={draft.from.riffHook} />
              </MarginRoom.Column>
              {writing ? (
                <MarginRoom.Column className="flex flex-wrap items-center gap-kit-controls">
                  <Button
                    size="sm"
                    variant={approveIsAction ? "action" : "quiet"}
                    icon={Tick02Icon}
                    shortcut={approveIsAction ? "A" : undefined}
                    pending={store.approving === v.id}
                    pendingLabel="Approving…"
                    aria-describedby={titleId}
                    onClick={() => store.approve(row, v.id)}
                  >
                    Approve
                  </Button>
                  <Button ref={editRef} size="sm" variant="ghost" shortcut={approveIsAction ? "E" : undefined} aria-describedby={titleId} onClick={() => store.setEditing(v.id)}>
                    Edit
                  </Button>
                  <span className="ms-auto">
                    <HoldButton pendingLabel="Discarding…" aria-describedby={titleId} onConfirm={() => store.discard(row, v.id)}>
                      Discard
                    </HoldButton>
                  </span>
                </MarginRoom.Column>
              ) : (
                <MarginRoom.Column className="flex flex-col gap-kit-related">
                  <Status line={line} sending={going.kind === "sending"} onReopen={line.undoable ? () => store.reopen(v.id) : undefined} />
                  {line.placeable || line.postable ? (
                    <div className="flex flex-wrap items-center gap-kit-controls">
                      {line.placeable ? (
                        <Button size="sm" variant={placeIsAction ? "action" : "quiet"} pending={store.placing === v.id} pendingLabel="Giving it a time…" onClick={() => store.place(v.id)}>
                          Give it a time
                        </Button>
                      ) : null}
                      {line.postable ? (
                        <PostNow label={v.label} idea={draft.idea} isAction={postIsAction} pending={store.posting === v.id} onPost={() => store.postNow(v.id)} />
                      ) : null}
                    </div>
                  ) : null}
                  {store.offers[v.id] ? (
                    <QuincyAsks
                      question={offerQuestion(store.offers[v.id]!.class)}
                      rest={`Add “${store.offers[v.id]!.text}” to your voice?`}
                      isAction={false}
                      answer={{ kind: "yes", label: "Add to voice", pendingLabel: "Adding…", onAnswer: async () => ({ ok: true }) }}
                      onDecline={() => store.answerOffer(v.id, false)}
                      answered="Added to your voice. It's on your voice page now."
                    />
                  ) : null}
                </MarginRoom.Column>
              )}
            </>
          )}
        </div>
      </MarginRoom>
    </section>
  )
}

/**
 * Scroll the pane (never the page) the least that shows the post and its
 * verbs: past the strip and the skeleton above it, but no further. Taller
 * than the pane, its top goes to the top. Instant, so reduced motion has
 * nothing to reduce.
 */
function revealInPane(el: HTMLElement | null) {
  const pane = el?.closest<HTMLElement>('[data-slot="kit-panel-body"]')
  if (!el || !pane) return
  const r = el.getBoundingClientRect()
  const p = pane.getBoundingClientRect()
  const pad = 16
  if (r.bottom > p.bottom - pad) {
    pane.scrollTop += Math.min(r.top - p.top - pad, r.bottom - p.bottom + pad)
  } else if (r.top < p.top + pad) {
    pane.scrollTop -= p.top + pad - r.top
  }
}

function split(text: string) {
  return THREAD_BREAK.test(text) ? threadPosts(text) : [text]
}

/** Our readout, while editing only: "207 / 280", or each post of a thread. */
function Counter({ posts, channel }: { posts: string[]; channel: string }) {
  const limit = CHANNEL_RULES[channel]?.limit ?? null
  const used = posts.map((p) => measurePost(p, channel).used)
  const over = limit != null && used.some((u) => u > limit)
  const words = limit ? used.map((u) => `${u} / ${limit}`).join(" · ") : used.map((u) => `${u} chars`).join(" · ")
  return <span className={`font-kit-mono text-kit-mono-sm whitespace-nowrap tabular-nums ${over ? "text-kit-ink" : "text-kit-ink-muted"}`}>{words}</span>
}

type Field = {
  posts: string[]
  set: (i: number, t: string) => void
  onKey: (e: React.KeyboardEvent) => void
} | null

/* ── The draft drawn as the feed, on the compound parts ──────────────── */

/**
 * The draft's posts as the platform's feed, with a skeleton neighbour above
 * and below. Reading: the words with their fold and Quincy's marks. Editing:
 * each post's words as its field. A three-post thread whose middle post
 * holds the number is bracketed one beat per post.
 */
function DraftFeed({
  platform,
  posts,
  writing,
  field,
  onStartEdit,
}: {
  platform: FeedPlatform
  posts: string[]
  writing: boolean
  field: Field
  onStartEdit?: () => void
}) {
  const shown = platform === "linkedin" ? posts.slice(0, 1) : posts
  const threadBeats = !field && shown.length === 3 && readBeats(shown.join("\n\n")) != null
  const BEATS = ["did", "happened", "meant"] as const
  const items = shown.map((p, i) => {
    const post = (
      <FeedPost key={i} initials={LAB_ACCOUNT.initials}>
        <FeedPost.Header
          name={LAB_ACCOUNT.name}
          handle={platform === "x" ? LAB_ACCOUNT.handle : undefined}
          headline={platform === "linkedin" ? LAB_ACCOUNT.headline : undefined}
        />
        <FeedPost.Body>
          {field ? (
            <FeedPost.Field
              value={field.posts[i]!}
              onValueChange={(t) => field.set(i, t)}
              onKeyDown={field.onKey}
              autoFocus={i === 0}
              aria-label={shown.length > 1 ? `Post ${i + 1} of ${shown.length} for X` : `Text for ${platform === "x" ? "X" : "LinkedIn"}`}
            />
          ) : (
            <FeedText text={p} channel={platform} marks={!threadBeats} note={writing} onStartEdit={onStartEdit} />
          )}
        </FeedPost.Body>
        <FeedPost.Actions />
      </FeedPost>
    )
    return threadBeats ? (
      <BeatBracket key={i} beat={BEATS[i]!}>
        {post}
      </BeatBracket>
    ) : (
      post
    )
  })
  const thread = <FeedThread>{items}</FeedThread>
  return (
    <FeedColumn platform={platform}>
      {platform === "x" ? (
        <FeedColumn.Tabs>
          <FeedColumn.Tab current>For you</FeedColumn.Tab>
          <FeedColumn.Tab>Following</FeedColumn.Tab>
        </FeedColumn.Tabs>
      ) : null}
      <FeedSkeleton />
      {threadBeats ? <Beats>{thread}</Beats> : thread}
      <FeedSkeleton />
    </FeedColumn>
  )
}

/* ── The words: read with the fold and Quincy's marks, or edited ──────── */

type Placed = { text: string; start: number; end: number }

function placed(text: string, paras: Paragraph[]): Placed[][] {
  let at = 0
  return paras.map((p) =>
    p.map((l) => {
      const start = Math.max(at, text.indexOf(l.text, at))
      at = start + l.text.length
      return { text: l.text, start, end: at }
    })
  )
}

/**
 * The post's words as the feed shows them: real line breaks, the number on
 * its own line, the platform's own "Show more" / "…more" where it truncates,
 * then (for you only) a fold line and the rest. Beat brackets or the
 * missing-beat note stand outside the column, beside the lines they mean.
 */
function FeedText({
  text,
  channel,
  marks,
  note,
  onStartEdit,
}: {
  text: string
  channel: string
  marks: boolean
  note: boolean
  onStartEdit?: () => void
}) {
  const { marks: noteOn } = React.useContext(LabOptionsContext)
  const paras = paragraphsOf(text)
  const cut = feedCut(text, channel)
  const foldAt = cut.kind ? cut.visible.replace(/\s+$/, "").length : null
  const rows = placed(text, paras)
  const firstCut = foldAt == null ? null : (rows.flat().find((l) => l.end > foldAt) ?? null)

  const para = (lines: Placed[], key: number) => (
    <div key={key}>
      {lines.map((l, i) => {
        if (foldAt == null || l.end <= foldAt) return <p key={i}>{l.text}</p>
        if (l !== firstCut) return <p key={i} className="feed-behind">{l.text}</p>
        const split = Math.max(0, foldAt - l.start)
        return (
          <React.Fragment key={i}>
            {split > 0 ? (
              <p>
                {l.text.slice(0, split).replace(/\s+$/, "")}
                {cut.kind === "fold" ? " " : null}
                {cut.kind === "fold" ? <FeedPost.More /> : null}
              </p>
            ) : null}
            {cut.kind === "limit" ? <FeedPost.More /> : null}
            <FeedPost.Fold>{cut.kind === "fold" ? "The feed cuts here" : `Stops at ${CHANNEL_RULES[channel]?.limit}. The rest won't post`}</FeedPost.Fold>
            <p className="feed-behind">{l.text.slice(split).replace(/^\s+/, "")}</p>
          </React.Fragment>
        )
      })}
    </div>
  )

  const beats = marks ? readBeats(text) : null
  let body: React.ReactNode
  if (beats) {
    body = (
      <Beats>
        <div className="feed-paras">
          {(["did", "happened", "meant"] as const).map((beat, i) => (
            <BeatBracket key={beat} beat={beat}>
              {para(rows[i]!, i)}
            </BeatBracket>
          ))}
        </div>
      </Beats>
    )
  } else {
    const mark = marks && note && noteOn === "note" ? noteFor(paras) : null
    const list = rows.map((r, i) =>
      mark && mark.at === i ? (
        <MarginNote key={i} note={mark.note}>
          {para(r, i)}
        </MarginNote>
      ) : (
        para(r, i)
      )
    )
    body =
      mark && mark.at === "all" ? (
        <MarginNote note={mark.note}>
          <div className="feed-paras">{list}</div>
        </MarginNote>
      ) : (
        <div className="feed-paras">{list}</div>
      )
  }
  return (
    <div
      className={`feed-text ${onStartEdit ? "cursor-text" : ""}`}
      // Only a click on the words opens the field: not one on a bracket, a note or the gap between paragraphs.
      onClick={onStartEdit ? (e) => ((e.target as HTMLElement).closest("p") ? onStartEdit() : undefined) : undefined}
    >
      {body}
    </div>
  )
}
