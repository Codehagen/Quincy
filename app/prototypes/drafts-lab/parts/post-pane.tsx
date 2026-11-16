"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import { BeatBracket, Beats, Button, HoldButton, MarginNote, SkeletonLines } from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"
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
 * Round 2 (owner, 2026-11-16: "Men posten står jo ikke på høyre side"): the
 * open draft IS the post. One lifted post object per channel version (a
 * thread is stacked posts joined by a connector), edited in place, with the
 * fold drawn inside it where the feed cuts. Quincy's marks stand outside
 * the post, in the margin beside the lines they mean.
 *
 * Three looks on one component:
 *   editor · the post in the pane, left-aligned (A)
 *   stage  · centred on a grey recess at feed width (B)
 *   feed   · between two blank skeleton posts, to judge the first line (C)
 *
 * How the marks get outside: the post sets `--kit-card-pad` to its own
 * padding, inside a `kit-stage` size container (the "room"). BeatBracket
 * and MarginNote already place their slot at `100% + card pad + gap`, which
 * from the post's body column is past the post's outer edge. Under 32rem of
 * room they fall under their lines, as everywhere in the kit.
 */

export type PostLook = "editor" | "stage" | "feed"

export function PostPane({ row, store, look, isAction = true }: { row: Row; store: DraftsStore; look: PostLook; isAction?: boolean }) {
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
    "--dl-avatar": `${o.avatar}px`,
    "--spacing-kit-margin": `${o.markCol}px`,
    "--dl-stage-pad": `${o.stagePad}px`,
    "--dl-post-x": `${o.postX}px`,
    "--dl-post-linkedin": `${o.postLinkedIn}px`,
  } as React.CSSProperties

  const posts = d.versions.map((v) => (
    <VersionPost
      key={v.id}
      draft={d}
      row={row}
      v={v}
      store={store}
      look={look}
      twin={twins[v.channel]}
      approveIsAction={isAction && !editing && v.id === firstWriting}
      placeIsAction={isAction && v.id === placeId}
      postIsAction={isAction && v.id === postId}
    />
  ))

  return (
    <article aria-label={d.idea} style={vars} className="dl-post-pane flex flex-col gap-kit-group" data-look={look}>
      {/* What it is and what prompted it: a small strip over the post, never inside it. */}
      <div className="flex flex-col gap-kit-related">
        <Head draft={d} />
        <Provenance draft={d} />
      </div>
      {look === "stage" ? (
        <div className="dl-stage flex flex-col gap-kit-group rounded-kit-object bg-kit-stage">{posts}</div>
      ) : (
        <div className="flex flex-col gap-kit-group">{posts}</div>
      )}
    </article>
  )
}

/* ── One channel version ─────────────────────────────────────────────── */

function VersionPost({
  draft,
  row,
  v,
  store,
  look,
  twin,
  approveIsAction,
  placeIsAction,
  postIsAction,
}: {
  draft: LabDraft
  row: Row
  v: LabVersion
  store: DraftsStore
  look: PostLook
  twin?: string
  approveIsAction: boolean
  placeIsAction: boolean
  postIsAction: boolean
}) {
  const titleId = React.useId()
  const text = store.textOf(v)
  const editing = store.editingId === v.id
  const writing = v.state === "writing"
  const posts = THREAD_BREAK.test(text) ? threadPosts(text) : [text]
  const going = goingOutOfVersion(v, store.session(v))
  const line = goingOutLine(going, v.label)

  // Leaving edit unmounts the fields: focus goes back to Edit, not the body.
  const editRef = React.useRef<HTMLButtonElement>(null)
  const wasEditing = React.useRef(editing)
  React.useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const room = (children: React.ReactNode) => (
    <div className="dl-room @container/kit-stage" data-channel={v.channel} data-centred={look === "editor" ? undefined : ""}>
      <div className="flex flex-col gap-kit-related">{children}</div>
    </div>
  )

  if (editing) {
    return (
      <section aria-labelledby={titleId}>
        <span id={titleId} className="sr-only">{`Draft for ${v.label}`}</span>
        {room(<EditPosts v={v} initial={posts} onSave={(t) => store.saveEdit(v.id, t)} onCancel={() => store.setEditing(null)} />)}
      </section>
    )
  }

  const startEdit = writing ? () => store.setEditing(v.id) : undefined
  const body = <ReadPosts v={v} posts={posts} writing={writing} look={look} onStartEdit={startEdit} />

  return (
    <section aria-labelledby={titleId}>
      <span id={titleId} className="sr-only">{`Draft for ${v.label}`}</span>
      {room(
        <>
          {body}
          <div className="dl-col">
            <Notices v={v} text={posts.length > 1 ? posts[0]! : text} twin={twin} hook={draft.from.riffHook} />
          </div>
          {writing ? (
            // One quiet row under the post: the verbs, the length, the hold.
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
    </section>
  )
}

/**
 * The length, as a composer counts it: in the post's own corner, the same
 * place while reading and while editing, one per post of a thread. Ink once
 * it is over the limit.
 */
function Counter({ text, channel }: { text: string; channel: string }) {
  const limit = CHANNEL_RULES[channel]?.limit ?? null
  const used = measurePost(text, channel).used
  return (
    <span className={`self-end font-kit-mono text-kit-mono-sm whitespace-nowrap tabular-nums ${limit != null && used > limit ? "text-kit-ink" : "text-kit-ink-muted"}`}>
      {limit ? `${used} / ${limit}` : `${used} chars`}
    </span>
  )
}

/* ── Reading: the post(s), the fold inside, the marks outside ─────────── */

function ReadPosts({
  v,
  posts,
  writing,
  look,
  onStartEdit,
}: {
  v: LabVersion
  posts: string[]
  writing: boolean
  look: PostLook
  onStartEdit?: () => void
}) {
  // A thread of three whose middle post holds the number: one beat per post.
  const threadBeats = posts.length === 3 && readBeats(posts.join("\n\n")) != null
  const BEATS = ["did", "happened", "meant"] as const
  const objects = posts.map((p, i) => (
    <PostObject key={i} v={v} first={i === 0} connectBelow={i < posts.length - 1} beat={threadBeats ? BEATS[i] : undefined} onStartEdit={onStartEdit}>
      <PostBody text={p} channel={v.channel} marks={!threadBeats} note={writing} />
      <Counter text={p} channel={v.channel} />
    </PostObject>
  ))
  const stack = threadBeats ? (
    <Beats>
      <div className="flex flex-col">{objects}</div>
    </Beats>
  ) : (
    <div className="flex flex-col">{objects}</div>
  )
  if (look !== "feed") return stack
  return (
    <div className="flex flex-col gap-kit-related">
      <SkeletonPost />
      {stack}
      <SkeletonPost />
    </div>
  )
}

/** The post object: the account, the body, and a connector down to the next post of a thread. */
function PostObject({
  v,
  first,
  connectBelow,
  beat,
  onStartEdit,
  children,
}: {
  v: LabVersion
  first: boolean
  connectBelow: boolean
  /** In a three-post thread, the beat this whole post is: its bracket stands beside the post. */
  beat?: "did" | "happened" | "meant"
  onStartEdit?: () => void
  children: React.ReactNode
}) {
  const post = (
      <div className="dl-post relative rounded-kit-object bg-kit-object shadow-kit-object">
        <div className="flex gap-3">
          <Avatar />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <PostHeader v={v} glyph={first} />
            {onStartEdit ? (
              // Clicking the words is the way in; E and the Edit button are the same for keys.
              <div className="flex cursor-text flex-col gap-1" onClick={onStartEdit}>
                {children}
              </div>
            ) : (
              children
            )}
          </div>
        </div>
      </div>
  )
  return (
    <div className="dl-col flex flex-col">
      {beat ? <BeatBracket beat={beat}>{post}</BeatBracket> : post}
      {connectBelow ? <span aria-hidden className="dl-connector" /> : null}
    </div>
  )
}

function Avatar() {
  return (
    <span aria-hidden className="dl-avatar grid shrink-0 place-items-center rounded-full bg-kit-well font-kit-strong text-kit-small text-kit-ink-muted shadow-kit-inset select-none">
      {LAB_ACCOUNT.initials}
    </span>
  )
}

function PostHeader({ v, glyph }: { v: LabVersion; glyph: boolean }) {
  return (
    <div className="flex min-w-0 items-baseline gap-1.5 text-kit-dense">
      <span className="truncate font-kit-strong text-kit-ink">{LAB_ACCOUNT.name}</span>
      <span className="truncate text-kit-ink-muted">{`@${LAB_ACCOUNT.handle}`}</span>
      <span aria-hidden className="text-kit-ink-muted">·</span>
      <span className="shrink-0 text-kit-ink-muted">not posted</span>
      {glyph && hasPlatformMark(v.channel) ? (
        <span className="ms-auto grid size-4 shrink-0 place-items-center self-center text-kit-ink-muted">
          <PlatformMark platform={v.channel} size={13} />
          <span className="sr-only">{v.label}</span>
        </span>
      ) : null}
    </div>
  )
}

type Placed = { text: string; start: number; end: number; figure: boolean }

/** Each paragraph's lines with where they sit in the text, so the fold can be drawn between or inside them. */
function placed(text: string, paras: Paragraph[]): Placed[][] {
  let at = 0
  return paras.map((p) =>
    p.map((l) => {
      const start = Math.max(at, text.indexOf(l.text, at))
      at = start + l.text.length
      return { text: l.text, start, end: at, figure: l.figure }
    })
  )
}

/**
 * The words of one post with the cut drawn inside it: what the feed shows,
 * the line, then what sits behind it (muted). Marks: three beat brackets
 * when the post has them, else (while waiting, on the control) the note on
 * the missing beat. Both stand outside the post.
 */
function PostBody({ text, channel, marks, note }: { text: string; channel: string; marks: boolean; note: boolean }) {
  const { marks: noteOn } = React.useContext(LabOptionsContext)
  const paras = paragraphsOf(text)
  const cut = feedCut(text, channel)
  const foldAt = cut.kind ? cut.visible.replace(/\s+$/, "").length : null
  const rows = placed(text, paras)
  // The first line the cut touches, found before rendering: the line is drawn there, once.
  const firstCut = foldAt == null ? null : rows.flat().find((l) => l.end > foldAt) ?? null

  const renderPara = (lines: Placed[], key: number) => (
    <div key={key} className="dl-prose">
      {lines.map((l, i) => {
        if (foldAt == null || l.end <= foldAt) return <p key={i}>{l.text}</p>
        if (l !== firstCut) return <p key={i} className="dl-behind">{l.text}</p>
        if (l.start >= foldAt) {
          return (
            <React.Fragment key={i}>
              <FoldLine kind={cut.kind!} channel={channel} />
              <p className="dl-behind">{l.text}</p>
            </React.Fragment>
          )
        }
        const split = foldAt - l.start
        return (
          <React.Fragment key={i}>
            <p>
              {l.text.slice(0, split).replace(/\s+$/, "")}
              {cut.kind === "fold" ? <span className="text-kit-ink-muted">…more</span> : null}
            </p>
            <FoldLine kind={cut.kind!} channel={channel} />
            <p className="dl-behind">{l.text.slice(split).replace(/^\s+/, "")}</p>
          </React.Fragment>
        )
      })}
    </div>
  )

  const beats = marks ? readBeats(text) : null
  if (beats) {
    return (
      <Beats>
        <div className="dl-paras flex flex-col">
          {(["did", "happened", "meant"] as const).map((beat, i) => (
            <BeatBracket key={beat} beat={beat}>
              {renderPara(rows[i]!, i)}
            </BeatBracket>
          ))}
        </div>
      </Beats>
    )
  }
  const mark = marks && note && noteOn === "note" ? noteFor(paras) : null
  const body = rows.map((r, i) =>
    mark && mark.at === i ? (
      <MarginNote key={i} note={mark.note}>
        {renderPara(r, i)}
      </MarginNote>
    ) : (
      renderPara(r, i)
    )
  )
  return (
    <div className="dl-paras flex flex-col">
      {mark && mark.at === "all" ? (
        <MarginNote note={mark.note}>
          <div className="dl-paras flex flex-col">{body}</div>
        </MarginNote>
      ) : (
        body
      )}
    </div>
  )
}

/** The feed's cut, drawn inside the post: a dashed line and what it means. */
function FoldLine({ kind, channel }: { kind: "fold" | "limit"; channel: string }) {
  const rules = CHANNEL_RULES[channel]
  return (
    <span role="separator" className="my-1.5 flex items-center gap-2 text-kit-meta text-kit-ink-muted" aria-label={kind === "fold" ? "The feed cuts here" : "The limit"}>
      <span aria-hidden className="h-px flex-1 border-t border-dashed border-kit-ink-muted" />
      <span aria-hidden className="shrink-0">
        {kind === "fold" ? "The feed cuts here" : `Stops at ${rules?.limit}. The rest won't post`}
      </span>
    </span>
  )
}

/** A post with no words: the feed around yours, for judging how its first line stops a scroll. */
function SkeletonPost() {
  return (
    <div aria-hidden className="dl-col">
      <div className="dl-post flex gap-3 rounded-kit-object bg-kit-object opacity-70 shadow-kit-object">
        <span className="dl-avatar shrink-0 rounded-full bg-kit-well" />
        <div className="flex min-w-0 flex-1 flex-col gap-2 pt-1">
          <SkeletonLines widths={["34%"]} />
          <SkeletonLines widths={["94%", "88%", "52%"]} />
        </div>
      </div>
    </div>
  )
}

/* ── Editing in place ─────────────────────────────────────────────────── */

/**
 * The post, with its words as the field: the same object, the same account
 * line, the caret in the body. One field per post of a thread. Cmd/Ctrl+Enter
 * saves, Escape cancels; the length counts live under it. The marks step
 * away while the words move (they would point at lines that are changing).
 */
function EditPosts({ v, initial, onSave, onCancel }: { v: LabVersion; initial: string[]; onSave: (t: string) => void; onCancel: () => void }) {
  const [posts, setPosts] = React.useState(initial)
  const first = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    const el = first.current
    if (!el) return
    el.focus()
    el.setSelectionRange(el.value.length, el.value.length)
  }, [])
  const joined = posts.length > 1 ? posts.join("\n---\n") : posts[0]!
  const save = () => onSave(joined)
  const cut = posts.length === 1 ? feedCut(posts[0]!, v.channel) : null
  return (
    <form
      className="flex flex-col gap-kit-related"
      onSubmit={(e) => {
        e.preventDefault()
        save()
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          save()
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <div className="flex flex-col">
        {posts.map((p, i) => {
          return (
            <div key={i} className="dl-col flex flex-col">
              {/* The post is the field: the focus ring goes round the post, not a box inside it. */}
              <div className="dl-post relative rounded-kit-object bg-kit-object shadow-kit-object has-[textarea:focus-visible]:outline-2 has-[textarea:focus-visible]:outline-offset-2 has-[textarea:focus-visible]:outline-kit-focus has-[textarea:focus-visible]:outline-solid">
                <div className="flex gap-3">
                  <Avatar />
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <PostHeader v={v} glyph={i === 0} />
                    <textarea
                      ref={i === 0 ? first : undefined}
                      aria-label={posts.length > 1 ? `Post ${i + 1} of ${posts.length} for ${v.label}` : `Text for ${v.label}`}
                      value={p}
                      onChange={(e) => setPosts((ps) => ps.map((x, j) => (j === i ? e.target.value : x)))}
                      className="dl-prose dl-field w-full resize-none bg-transparent outline-hidden"
                    />
                    <span aria-live="polite" className="flex flex-col">
                      <Counter text={p} channel={v.channel} />
                    </span>
                  </div>
                </div>
              </div>
              {i < posts.length - 1 ? <span aria-hidden className="dl-connector" /> : null}
            </div>
          )
        })}
      </div>
      {cut?.kind === "fold" ? (
        <p className="dl-col text-kit-meta text-pretty text-kit-ink-muted">{`The feed cuts after “…${cut.visible.replace(/\s+$/, "").slice(-24).replace(/^\S*\s/, "")}”.`}</p>
      ) : null}
      <div className="dl-col flex flex-wrap items-center gap-kit-controls">
        <Button type="submit" size="sm" variant="action">
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  )
}
