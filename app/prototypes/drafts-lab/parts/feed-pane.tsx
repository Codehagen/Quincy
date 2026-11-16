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
import { feedCut } from "./feed-preview"

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
      {d.versions.map((v) => (
        <VersionFeed
          key={v.id}
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
}: {
  draft: LabDraft
  row: Row
  v: LabVersion
  store: DraftsStore
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
      <div className="dl-room @container/kit-stage" data-channel={v.channel}>
        <div className="flex flex-col gap-kit-related">
          {linkedin ? (
            <LinkedInFeed v={v} posts={shown} writing={writing} field={field} onStartEdit={startEdit} />
          ) : (
            <XFeed v={v} posts={shown} writing={writing} field={field} onStartEdit={startEdit} />
          )}

          {editing ? (
            // The counter is ours, under the post: a ring is the composer's, not the feed's, and the column must read as the feed.
            <div className="dl-col flex flex-wrap items-center gap-kit-controls">
              <Button size="sm" variant="action" onClick={save}>
                Save
              </Button>
              <Button size="sm" variant="ghost" onClick={cancel}>
                Cancel
              </Button>
              <span aria-live="polite" className="ms-auto">
                <Counter posts={shown} channel={v.channel} />
              </span>
            </div>
          ) : (
            <>
              <div className="dl-col">
                <Notices v={v} text={shown.length > 1 ? shown[0]! : text} twin={twin} hook={draft.from.riffHook} />
              </div>
              {writing ? (
                <div className="dl-col flex flex-wrap items-center gap-kit-controls">
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
                </div>
              ) : (
                <div className="dl-col flex flex-col gap-kit-related">
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
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  )
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

/* ── X ───────────────────────────────────────────────────────────────── */

function XFeed({ v, posts, writing, field, onStartEdit }: { v: LabVersion; posts: string[]; writing: boolean; field: Field; onStartEdit?: () => void }) {
  const threadBeats = !field && posts.length === 3 && readBeats(posts.join("\n\n")) != null
  const BEATS = ["did", "happened", "meant"] as const
  const own = posts.map((p, i) => {
    const post = (
      <XPost key={i} connectAbove={i > 0} connectBelow={i < posts.length - 1}>
        {field ? (
          <FeedField value={field.posts[i]!} label={posts.length > 1 ? `Post ${i + 1} of ${posts.length} for X` : "Text for X"} autoFocus={i === 0} onChange={(t) => field.set(i, t)} onKeyDown={field.onKey} />
        ) : (
          <FeedText text={p} channel="x" more="Show more" marks={!threadBeats} note={writing} onStartEdit={onStartEdit} />
        )}
      </XPost>
    )
    return threadBeats ? (
      <BeatBracket key={i} beat={BEATS[i]!}>
        {post}
      </BeatBracket>
    ) : (
      post
    )
  })
  return (
    <div className="dl-col xf">
      <div aria-hidden className="xf-tabs">
        <span className="xf-tab" data-on="">
          For you
        </span>
        <span className="xf-tab">Following</span>
      </div>
      <XSkeleton />
      {threadBeats ? <Beats>{own}</Beats> : own}
      <XSkeleton />
    </div>
  )
}

function XPost({ connectAbove, connectBelow, children }: { connectAbove: boolean; connectBelow: boolean; children: React.ReactNode }) {
  return (
    <div className="xf-post" data-thread-above={connectAbove || undefined} data-thread-below={connectBelow || undefined}>
      <div className="xf-gutter">
        {connectAbove ? <span aria-hidden className="xf-line-above" /> : null}
        <span aria-hidden className="xf-avatar">
          {LAB_ACCOUNT.initials}
        </span>
        {connectBelow ? <span aria-hidden className="xf-line-below" /> : null}
      </div>
      <div className="xf-main">
        <div className="xf-head">
          <span className="xf-name">{LAB_ACCOUNT.name}</span>
          <span className="xf-dim xf-handle">{`@${LAB_ACCOUNT.handle}`}</span>
          <span className="xf-dim" aria-hidden>
            ·
          </span>
          <span className="xf-dim">now</span>
          <span aria-hidden className="xf-more">
            <XIcon d={X_ICONS.more} />
          </span>
        </div>
        {children}
        <XActions />
      </div>
    </div>
  )
}

function XActions() {
  return (
    <div aria-hidden className="xf-actions">
      <span>
        <XIcon d={X_ICONS.reply} />
      </span>
      <span>
        <XIcon d={X_ICONS.repost} />
      </span>
      <span>
        <XIcon d={X_ICONS.like} />
      </span>
      <span>
        <XIcon d={X_ICONS.views} />
      </span>
      <span className="xf-actions-end">
        <XIcon d={X_ICONS.bookmark} />
        <XIcon d={X_ICONS.share} />
      </span>
    </div>
  )
}

function XSkeleton() {
  return (
    <div aria-hidden className="xf-post xf-skel">
      <div className="xf-gutter">
        <span className="xf-avatar" />
      </div>
      <div className="xf-main">
        <div className="xf-head">
          <span className="xf-bar" style={{ width: "28%" }} />
          <span className="xf-bar" style={{ width: "18%" }} />
        </div>
        <div className="flex flex-col gap-2 pt-1">
          <span className="xf-bar" style={{ width: "94%" }} />
          <span className="xf-bar" style={{ width: "86%" }} />
          <span className="xf-bar" style={{ width: "48%" }} />
        </div>
        <XActions />
      </div>
    </div>
  )
}

/**
 * X's action icons, drawn here in the same form (outline, round joins) on a
 * 24 grid: reply, repost, like, views, bookmark, share, and the "more" dots.
 */
const X_ICONS = {
  reply: "M4.5 10.5a6.5 6.5 0 0 1 6.5-6.5h2a6.5 6.5 0 0 1 0 13h-1.2L7 20.2V16.4a6.5 6.5 0 0 1-2.5-5.9Z",
  repost: "M4.5 9V7.5A2.5 2.5 0 0 1 7 5h9.5m0 0L14 2.5M16.5 5 14 7.5M19.5 15v1.5A2.5 2.5 0 0 1 17 19H7.5m0 0L10 16.5M7.5 19l2.5 2.5",
  like: "M12 20s-7.5-4.6-7.5-10A4.25 4.25 0 0 1 12 7.3 4.25 4.25 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10Z",
  views: "M5 20V12M10 20V5M15 20v-9M20 20V8",
  bookmark: "M6.5 4.5h11v15.5L12 16.2l-5.5 3.8V4.5Z",
  share: "M12 3.5V15m0-11.5L7.5 8M12 3.5 16.5 8M4.5 14v4.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V14",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
} as const

function XIcon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" width="18.75" height="18.75" fill="none" stroke="currentColor" strokeWidth={d === X_ICONS.more ? 3 : 1.75} strokeLinecap="round" strokeLinejoin="round">
      <path d={d} />
    </svg>
  )
}

/* ── LinkedIn ────────────────────────────────────────────────────────── */

function LinkedInFeed({ v, posts, writing, field, onStartEdit }: { v: LabVersion; posts: string[]; writing: boolean; field: Field; onStartEdit?: () => void }) {
  return (
    <div className="dl-col lf">
      <LinkedInSkeleton />
      <div className="lf-card">
        <div className="lf-head">
          <span aria-hidden className="lf-avatar">
            {LAB_ACCOUNT.initials}
          </span>
          <div className="min-w-0">
            <div className="lf-name">{LAB_ACCOUNT.name}</div>
            <div className="lf-dim lf-small truncate">{LAB_ACCOUNT.headline}</div>
            <div className="lf-dim lf-small flex items-center gap-1">
              now <span aria-hidden>·</span>
              <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.2">
                <circle cx="8" cy="8" r="6.2" />
                <path d="M1.8 8h12.4M8 1.8c1.8 1.7 2.6 3.8 2.6 6.2s-.8 4.5-2.6 6.2M8 1.8C6.2 3.5 5.4 5.6 5.4 8s.8 4.5 2.6 6.2" />
              </svg>
            </div>
          </div>
        </div>
        <div className="lf-body">
          {field ? (
            <FeedField value={field.posts[0]!} label="Text for LinkedIn" autoFocus onChange={(t) => field.set(0, t)} onKeyDown={field.onKey} />
          ) : (
            <FeedText text={posts[0]!} channel={v.channel} more="…more" marks note={writing} onStartEdit={onStartEdit} />
          )}
        </div>
        <LinkedInActions />
      </div>
      <LinkedInSkeleton />
    </div>
  )
}

const LI_ICONS = {
  Like: "M7.5 10.5V19.5H4.5V10.5h3Zm0 0 3.6-6.3a1.7 1.7 0 0 1 3.1 1.2l-.7 3.6h4.6a1.9 1.9 0 0 1 1.9 2.2l-1.1 6.6a2 2 0 0 1-2 1.7H7.5",
  Comment: "M4.5 6.5A2 2 0 0 1 6.5 4.5h11a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H11l-4.5 3.5v-3.5h0a2 2 0 0 1-2-2v-8Z",
  Repost: "M7 7.5h10.5l-2.5-2.5M17 16.5H6.5L9 19M17.5 7.5V12M6.5 16.5V12",
  Send: "M20.5 3.5 3.5 10.2l6.8 3.1 3.1 6.8 7.1-16.6ZM10.3 13.3l4.6-4.6",
} as const

function LinkedInActions() {
  return (
    <div aria-hidden className="lf-actions">
      {(Object.keys(LI_ICONS) as (keyof typeof LI_ICONS)[]).map((k) => (
        <span key={k} className="lf-action">
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <path d={LI_ICONS[k]} />
          </svg>
          <span>{k}</span>
        </span>
      ))}
    </div>
  )
}

function LinkedInSkeleton() {
  return (
    <div aria-hidden className="lf-card lf-skel">
      <div className="lf-head">
        <span className="lf-avatar" />
        <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
          <span className="xf-bar" style={{ width: "32%" }} />
          <span className="xf-bar" style={{ width: "54%" }} />
        </div>
      </div>
      <div className="lf-body flex flex-col gap-2">
        <span className="xf-bar" style={{ width: "92%" }} />
        <span className="xf-bar" style={{ width: "60%" }} />
      </div>
      <LinkedInActions />
    </div>
  )
}

/* ── The words: read with the fold and Quincy's marks, or edited ──────── */

/** The body as the field, set exactly as the post's text, the caret at the end. */
function FeedField({
  value,
  label,
  autoFocus,
  onChange,
  onKeyDown,
}: {
  value: string
  label: string
  autoFocus?: boolean
  onChange: (t: string) => void
  onKeyDown: (e: React.KeyboardEvent) => void
}) {
  const ref = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const el = ref.current
    if (!autoFocus || !el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [autoFocus])
  return <textarea ref={ref} aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKeyDown} className="feed-text feed-field" />
}

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
  more,
  marks,
  note,
  onStartEdit,
}: {
  text: string
  channel: string
  more: string
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
                {cut.kind === "fold" ? <span className="feed-more">{more}</span> : null}
              </p>
            ) : null}
            {cut.kind === "limit" ? <span className="feed-more">{more}</span> : null}
            <FoldLine kind={cut.kind!} channel={channel} />
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
    <div className={`feed-text ${onStartEdit ? "cursor-text" : ""}`} onClick={onStartEdit}>
      {body}
    </div>
  )
}

/** Where the feed stops showing it, drawn for you only (the feed draws nothing here). */
function FoldLine({ kind, channel }: { kind: "fold" | "limit"; channel: string }) {
  return (
    <span role="separator" aria-label={kind === "fold" ? "The feed cuts here" : "The limit"} className="feed-fold">
      <span aria-hidden className="feed-fold-rule" />
      <span aria-hidden>{kind === "fold" ? "The feed cuts here" : `Stops at ${CHANNEL_RULES[channel]?.limit}. The rest won't post`}</span>
    </span>
  )
}
