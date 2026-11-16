"use client"

import * as React from "react"
import { HighlighterIcon, SentIcon, Tick02Icon, ViewIcon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPanel,
  AlertDialogTrigger,
  BeatBracket,
  Beats,
  Button,
  Count,
  Highlight,
  HoldButton,
  LiveDot,
  MarginNote,
  Mono,
  Segmented,
  Text,
  Textarea,
  TextLink,
} from "@/components/kit"
import { hasPlatformMark, PlatformMark } from "@/components/channels/platform-mark"
import { QuincyAsks } from "@/components/quincy"
import { paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
import { duplicates } from "@/lib/drafts"
import { goingOutLine, goingOutOfVersion, type GoingOutKind, type GoingOutLine } from "@/lib/going-out"
import { countGraphemes, measurePost } from "@/lib/post-length"

import type { LabDraft, LabVersion } from "../data"
import { LabOptionsContext } from "../lab-options"
import { FeedPreview, feedCut } from "./feed-preview"
import type { DraftsStore, Row } from "../use-drafts"

/**
 * The open draft, marked up: what prompted it (the saved post's sentence
 * highlighted, proposed), then each channel version as the post itself with
 * Quincy's marks in the margin, the notices, and its verbs. Not a Card: it
 * is the pane (workspace.md, "never a Card per pane"), and the margin is the
 * pane's own room, measured as a `kit-stage` container so the beat brackets
 * stand to the right of the lines from 32rem (quincy-drafts.md).
 *
 * The marks, per editor-marks.md: three beat brackets when `readBeats` finds
 * them; otherwise (proposed, `data-marks="note"`) one handwritten note on
 * the beat that is missing, because 0 of the 110 live drafts bracket and a
 * page that never marks anything has lost its editor. Never a guessed bracket.
 */

/** States with no time and no way out but a press here, where Post now leads. */
const STRANDED: GoingOutKind[] = ["no-slot", "slots-full", "failed"]

export function DraftSheet({
  row,
  store,
  isAction = true,
  showIdea = true,
}: {
  row: Row
  store: DraftsStore
  /** Whether this sheet holds the page's one ink action (actions.md). */
  isAction?: boolean
  /** Off where the row above already reads as the title (inline). */
  showIdea?: boolean
}) {
  const d = row.draft
  const twins = duplicates({ ...d, versions: d.versions.map((v) => ({ ...v, text: store.textOf(v) })) })
  const editing = store.editingId != null && d.versions.some((v) => v.id === store.editingId)
  const firstWriting = d.versions.find((v) => v.state === "writing")?.id ?? null
  const lines = d.versions.map((v) => ({ v, line: goingOutLine(goingOutOfVersion(v, store.session(v)), v.label), g: goingOutOfVersion(v, store.session(v)) }))
  const placeId = editing || firstWriting ? null : (lines.find((l) => l.line.placeable)?.v.id ?? null)
  const postId = editing || firstWriting || placeId ? null : (lines.find((l) => STRANDED.includes(l.g.kind) && l.line.postable)?.v.id ?? null)

  return (
    <article aria-label={d.idea} className="flex flex-col gap-kit-group">
      {/* What it is and what prompted it read as one block: related, not a group apart. */}
      <div className="flex flex-col gap-kit-related">
        {showIdea ? <Head draft={d} /> : null}
        <Provenance draft={d} />
      </div>
      {d.versions.map((v, i) => (
        <React.Fragment key={v.id}>
          {i > 0 ? <hr className="border-kit-hairline" /> : null}
          <VersionBlock
            draft={d}
            row={row}
            v={v}
            store={store}
            many={d.versions.length > 1}
            twin={twins[v.channel]}
            approveIsAction={isAction && !editing && v.id === firstWriting}
            placeIsAction={isAction && v.id === placeId}
            postIsAction={isAction && v.id === postId}
          />
        </React.Fragment>
      ))}
    </article>
  )
}

/** The idea, in the person's words. The kind sits on the strip above (Table, Desk), not twice. */
function Head({ draft }: { draft: LabDraft }) {
  return <h2 className="text-kit-body font-kit-strong text-pretty text-kit-ink">{draft.idea}</h2>
}

/**
 * What prompted it. A saved post with its leaned-on sentence highlighted
 * (proposed: the sentence is not stored); a saved post with only its handle
 * and link (every real draft today); or your own idea, when it says more than
 * the title.
 */
function Provenance({ draft }: { draft: LabDraft }) {
  const a = draft.from.adaptedFrom
  if (a && draft.quote) {
    return (
      <figure className="flex flex-col gap-kit-tight rounded-kit-control bg-kit-stage px-kit-related py-kit-related">
        <figcaption className="flex items-center gap-1.5 text-kit-meta text-kit-ink-muted">
          <span>{`@${a.handle} wrote`}</span>
          <span aria-hidden>·</span>
          <TextLink href={a.url} target="_blank" rel="noreferrer noopener">
            Their post
          </TextLink>
        </figcaption>
        <blockquote className="text-kit-dense text-pretty text-kit-ink-muted">
          {draft.quote.before}
          <span className="text-kit-ink">
            <Highlight>{draft.quote.line}</Highlight>
          </span>
          {draft.quote.after}
        </blockquote>
      </figure>
    )
  }
  if (a) {
    // The strip above already says whose; this is the way to their words, which the draft does not keep.
    return (
      <p className="text-kit-meta text-kit-ink-muted">
        <TextLink href={a.url} target="_blank" rel="noreferrer noopener">
          {`Read @${a.handle}'s post`}
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

function VersionBlock({
  draft,
  row,
  v,
  store,
  many,
  twin,
  approveIsAction,
  placeIsAction,
  postIsAction,
}: {
  draft: LabDraft
  row: Row
  v: LabVersion
  store: DraftsStore
  many: boolean
  twin?: string
  approveIsAction: boolean
  placeIsAction: boolean
  postIsAction: boolean
}) {
  const titleId = React.useId()
  const text = store.textOf(v)
  const editing = store.editingId === v.id
  const length = measurePost(text, v.channel)
  const going = goingOutOfVersion(v, store.session(v))
  const line = goingOutLine(going, v.label)
  const writing = v.state === "writing"

  // Leaving edit (Save, Cancel, Escape) unmounts the field: focus goes back to Edit, not the body.
  const editRef = React.useRef<HTMLButtonElement>(null)
  const wasEditing = React.useRef(editing)
  React.useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const size = length.limit ? `${length.used} / ${length.limit}` : `${length.used} chars`

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-kit-related">
      <div className="flex min-w-0 items-center gap-2 text-kit-meta text-kit-ink-muted">
        {hasPlatformMark(v.channel) ? (
          <span aria-hidden className="grid size-4 place-items-center text-kit-ink">
            <PlatformMark platform={v.channel} size={13} />
          </span>
        ) : null}
        <h3 id={titleId} className="font-kit-strong text-kit-ink">
          {many ? `For ${v.label}` : `Draft for ${v.label}`}
        </h3>
        <span aria-hidden>·</span>
        <span className={`font-kit-mono text-kit-mono-sm whitespace-nowrap tabular-nums ${length.over > 0 ? "text-kit-ink" : ""}`}>{size}</span>
        {editing ? null : (
          <span className="ms-auto">
            <Segmented
              size="xs"
              aria-label={`How to show the ${v.label} version`}
              value={store.viewOf(v.id)}
              onValueChange={(view) => store.setView(v.id, view)}
              options={[
                { value: "marked", label: "Marked up", icon: HighlighterIcon },
                { value: "preview", label: "Preview in the feed (P)", icon: ViewIcon },
              ]}
            />
          </span>
        )}
      </div>

      {editing ? (
        <EditForm v={v} initial={text} onSave={(t) => store.saveEdit(v.id, t)} onCancel={() => store.setEditing(null)} />
      ) : store.viewOf(v.id) === "preview" ? (
        <FeedPreview v={v} text={text} />
      ) : (
        <Marked text={text} note={writing} />
      )}

      {!editing ? <Notices v={v} text={text} twin={twin} hook={draft.from.riffHook} /> : null}

      {!editing && writing ? (
        <div className="flex flex-wrap items-center gap-kit-controls">
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
      ) : null}

      {!editing && !writing ? (
        <div className="flex flex-col gap-kit-related border-t border-kit-hairline pt-kit-related">
          <Status line={line} sending={going.kind === "sending"} onReopen={line.undoable ? () => store.reopen(v.id) : undefined} />
          {line.placeable || line.postable ? (
            <div className="flex flex-wrap items-center gap-kit-controls">
              {line.placeable ? (
                <Button
                  size="sm"
                  variant={placeIsAction ? "action" : "quiet"}
                  pending={store.placing === v.id}
                  pendingLabel="Giving it a time…"
                  onClick={() => store.place(v.id)}
                >
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
      ) : null}
    </section>
  )
}

/**
 * Edit in place: the text as a Textarea counting against the channel's
 * ceiling, Save as the one action while it is open, Cmd/Ctrl+Enter to save
 * and Escape to cancel. Mounted only while editing, so it starts from the
 * text as it stands.
 */
function EditForm({ v, initial, onSave, onCancel }: { v: LabVersion; initial: string; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = React.useState(initial)
  const area = React.useRef<HTMLTextAreaElement>(null)
  React.useEffect(() => {
    area.current?.focus()
  }, [])
  const length = measurePost(text, v.channel)
  return (
    <form
      className="flex flex-col gap-kit-related"
      onSubmit={(e) => {
        e.preventDefault()
        onSave(text)
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onSave(text)
        } else if (e.key === "Escape") {
          e.preventDefault()
          onCancel()
        }
      }}
    >
      <Textarea ref={area} aria-label={`Text for ${v.label}`} value={text} onValueChange={setText} />
      {length.limit ? (
        <p className="text-kit-meta text-kit-ink-muted" aria-live="polite">
          <Count value={length.used} /> of {length.limit}
          {length.over > 0 ? `, ${length.over} over the ${v.label} limit.` : "."}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-kit-controls">
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

/** What the lab's offer says it noticed (rule-offer.tsx's words; the lab offers on the first edit, the server on the third). */
function offerQuestion(cls: string) {
  if (cls === "hashtag-removed") return "You've taken the hashtags out three times."
  if (cls === "shortened") return "You've cut it much shorter three times."
  return "You've cut a line out three times."
}

/* ── The post, with Quincy's marks ────────────────────────────────────── */

/**
 * The margin room: a `kit-stage` container (what BeatBracket and MarginNote
 * measure), with the prose narrowed by the margin column from 32rem. Under
 * that each mark sits under its lines and the prose takes the full width.
 */
const ROOM = "@container/kit-stage w-full"
const PROSE =
  "relative flex w-full flex-col gap-kit-related [--kit-card-pad:0px] @lg/kit-stage:w-[calc(100%-var(--spacing-kit-margin)-var(--spacing-kit-margin-gap))]"

function Lines({ lines }: { lines: Paragraph }) {
  return (
    <div className="dl-prose">
      {lines.map((l, i) =>
        l.figure ? (
          <Text key={i} variant="figure">
            {l.text}
          </Text>
        ) : (
          <p key={i}>{l.text}</p>
        )
      )}
    </div>
  )
}

/**
 * Proposed: the note when the beats are not there. Six words or fewer, lower
 * case, about the line it sits on (editor-marks.md). It names the missing
 * beat, never fills it in.
 */
function noteFor(p: Paragraph[]): { at: number | "all"; note: string } | null {
  if (p.length <= 1) return null
  if (p.length === 2) return { at: "all", note: "where's the middle beat?" }
  if (p.length === 3) return { at: 1, note: "what happened? no number yet" }
  return { at: "all", note: `${p.length} paragraphs. one too many?` }
}

/** `note`: only while the draft is still a decision; on a sent post the note is moot. */
function Marked({ text, note }: { text: string; note: boolean }) {
  const { marks } = React.useContext(LabOptionsContext)
  const beats = readBeats(text)
  if (beats) {
    return (
      <div className={ROOM}>
        <Beats>
          <div className={PROSE}>
            <BeatBracket beat="did">
              <Lines lines={beats.did} />
            </BeatBracket>
            <BeatBracket beat="happened">
              <Lines lines={beats.happened} />
            </BeatBracket>
            <BeatBracket beat="meant">
              <Lines lines={beats.meant} />
            </BeatBracket>
          </div>
        </Beats>
      </div>
    )
  }
  const p = paragraphsOf(text)
  const mark = marks === "note" && note ? noteFor(p) : null
  const body = p.map((para, i) =>
    mark && mark.at === i ? (
      <div key={i} data-dl-note>
        <MarginNote note={mark.note}>
          <Lines lines={para} />
        </MarginNote>
      </div>
    ) : (
      <Lines key={i} lines={para} />
    )
  )
  return (
    <div className={ROOM}>
      <div className={PROSE}>
        {mark && mark.at === "all" ? (
          <div data-dl-note>
            <MarginNote note={mark.note}>
              <div className="flex flex-col gap-kit-related">{body}</div>
            </MarginNote>
          </div>
        ) : (
          body
        )}
      </div>
    </div>
  )
}

/** What Quincy noticed, under the text and above Approve (draft-piece.tsx's four). */
function Notices({ v, text, twin, hook }: { v: LabVersion; text: string; twin?: string; hook?: string }) {
  if (v.state !== "writing") return null
  const { over } = measurePost(text, v.channel)
  const isHook = !!hook && text.trim() === hook.trim()
  // The same cut the preview draws (feed-preview.tsx), so the sentence and the line agree.
  const cut = feedCut(text, v.channel)
  const folded = cut.kind === "fold"
  const before = cut.visible.replace(/\s+$/, "").slice(-24).replace(/^\S*\s/, "")
  // Over the ceiling is ink: Approve is the press it should stop. The rest are muted (DraftCardNotice).
  const notes = [
    over > 0 ? { text: `${over} over the ${v.label} limit. Trim it, or split it into a thread.`, ink: true } : null,
    isHook ? { text: "I couldn't write this one, so this is your idea as it stood. Rewrite it and it's yours.", ink: false } : null,
    folded ? { text: `The feed cuts after “…${before}”. ${countGraphemes(cut.hidden.trim())} characters sit behind the fold.`, ink: false } : null,
    twin ? { text: `Identical to the ${twin} version. This one was not written for ${v.label}.`, ink: false } : null,
  ].filter((n): n is { text: string; ink: boolean } => n != null)
  if (notes.length === 0) return null
  return (
    <div role="note" className="flex flex-col gap-kit-tight">
      {notes.map((n) => (
        <p key={n.text} className={`text-kit-meta text-pretty ${n.ink ? "text-kit-ink" : "text-kit-ink-muted"}`}>
          {n.text}
        </p>
      ))}
    </div>
  )
}

function Status({
  line,
  sending,
  onReopen,
}: {
  line: GoingOutLine
  sending: boolean
  onReopen?: () => void
}) {
  if (sending) {
    return (
      <p className="text-kit-dense">
        <LiveDot pulse>{line.text}</LiveDot>
      </p>
    )
  }
  return (
    // No role="status" here: the change is said once by the foot, through the surface's one Announcer.
    <div className="flex min-h-8 items-center justify-between gap-kit-related">
      <p className={`text-kit-dense text-pretty ${line.tone === "quiet" ? "text-kit-ink-muted" : "text-kit-ink"}`}>
        {line.before}
        {line.at ? (
          <>
            {" "}
            <Mono tone="ink">{line.at}</Mono>
          </>
        ) : null}
        {line.after}
        {line.url ? (
          <>
            {" "}
            <TextLink href={line.url} target="_blank" rel="noreferrer">
              View the post
            </TextLink>
          </>
        ) : null}
      </p>
      {onReopen ? (
        <Button size="sm" variant="ghost" onClick={onReopen}>
          {line.tone === "wrong" ? "Reopen" : "Undo"}
        </Button>
      ) : null}
    </div>
  )
}

/** Post now, behind the one confirmation the page has: a post can't be unsent. */
function PostNow({ label, idea, isAction, pending, onPost }: { label: string; idea: string; isAction: boolean; pending: boolean; onPost: () => void }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          <Button size="sm" variant={isAction ? "action" : "quiet"} icon={SentIcon} pending={pending} pendingLabel="Posting…">
            Post now
          </Button>
        }
      />
      <AlertDialogPanel
        title={`Post this to ${label} now?`}
        description={`The ${label} version of “${idea}” goes out at once, in your name. Quincy can't unsend it.`}
      >
        <AlertDialogCancel>Not yet</AlertDialogCancel>
        <AlertDialogAction variant="action" onConfirm={onPost}>
          Post now
        </AlertDialogAction>
      </AlertDialogPanel>
    </AlertDialog>
  )
}
