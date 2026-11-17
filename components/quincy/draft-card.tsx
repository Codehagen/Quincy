"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"

import {
  Arrive,
  Avatar,
  BeatBracket,
  Beats,
  Button,
  Card,
  Count,
  HoldButton,
  MarginNote,
  Mono,
  Rule,
  Text,
  Textarea,
  TextLink,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { useControllable } from "@/components/kit/use-controllable"
import { paragraphsOf, readBeats, type Paragraph } from "@/lib/draft-beats"
import type { Version } from "@/lib/drafts"
import {
  goingOutLine,
  goingOutOfVersion,
  type GoingOut,
  type GoingOutLine,
  type GoingOutSession,
} from "@/lib/going-out"
import { measurePost, type PostLength } from "@/lib/post-length"

/**
 * One channel version of a draft, up to Approve and after (plans/030 #1).
 * docs/design/quincy-drafts.md is the guide; lab picks 21, 07, 27.
 *
 * Compound: `DraftCard` holds the version and the callbacks, the parts read
 * them from context. A read-only snapshot (the chat's history) is the root
 * with a header and a body and no `DraftCardActions`.
 *
 *   <DraftCard version={v} onApprove={…} onReopen={…} onDiscard={…} onSave={…}>
 *     <DraftCardHeader initials="C" source="onboarding-email.md" />
 *     <DraftCardBody />
 *     <DraftCardActions opening="Wed 09:00" />
 *   </DraftCard>
 *
 * The state is the server's (`Version`), read through lib/going-out.ts, plus
 * what this session just did (`session`). The card holds no "approved" flag
 * of its own: the parent updates the version, and the card follows.
 */

type Ctx = {
  version: Version
  going: GoingOut
  line: GoingOutLine
  length: PostLength
  text: string
  setText: (t: string) => void
  editing: boolean
  setEditing: (e: boolean) => void
  titleId: string
  isAction: boolean
  approving: boolean
  approve: () => void
  onReopen?: () => void | Promise<void>
  onDiscard?: () => void | Promise<void>
  canEdit: boolean
  saving: boolean
  /** Set by a press in this card, so focus follows the swap it caused. */
  pressedRef: React.RefObject<boolean>
}

const DraftContext = React.createContext<Ctx | null>(null)

function useDraft(part: string): Ctx {
  const ctx = React.useContext(DraftContext)
  if (!ctx) throw new Error(`${part} must sit inside <DraftCard>.`)
  return ctx
}

/**
 * The room a draft card measures for its beat brackets: a `kit-stage` size
 * container, the one Card `with-margin`, BeatBracket and MarginNote already
 * read (bracket.tsx). From 32rem wide the card gives up the margin column
 * (170 + a 10 gap) and the brackets stand in it, to the right of the lines,
 * as on the landing's picture. Under 32rem the card is full width and each
 * label sits under its lines.
 *
 * A container query, not a viewport one: Studio's column, /drafts' Stage and
 * a phone each answer for themselves, with no Stage needed around the card.
 * The card's width comes from the room, never from the brackets, so the
 * lines never reflow when the marks appear. It stretches, because a size
 * container has no width of its own (and a Stage's stack is items-start).
 */
export const DRAFT_ROOM = "@container/kit-stage w-full self-stretch"

export type DraftCardProps = {
  /** The row, from `getDrafts` (lib/drafts.ts `Version`). */
  version: Version
  /** What this session just did that the row does not show yet. */
  session?: GoingOutSession
  /** Approve the text on screen. May be async; a throw keeps it unapproved. */
  onApprove?: (text: string) => void | Promise<void>
  /** Undo / Reopen: back to writing. Its queued post goes (`reopenVersion`). */
  onReopen?: () => void | Promise<void>
  /** Delete this version for good. Rendered as a HoldButton. */
  onDiscard?: () => void | Promise<void>
  /** Save an edit. Without it there is no Edit button. */
  onSave?: (text: string) => void | Promise<void>
  /** Whether Approve is the page's one action (docs/design/actions.md). Default true. */
  isAction?: boolean
  editing?: boolean
  defaultEditing?: boolean
  onEditingChange?: (editing: boolean) => void
  children: React.ReactNode
}

export function DraftCard({
  version,
  session,
  onApprove,
  onReopen,
  onDiscard,
  onSave,
  isAction = true,
  editing: editingProp,
  defaultEditing = false,
  onEditingChange,
  children,
}: DraftCardProps) {
  const titleId = React.useId()
  const [editing, setEditing] = useControllable(editingProp, defaultEditing, onEditingChange)
  const [text, setText] = React.useState(version.text)
  const [approving, setApproving] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const pressedRef = React.useRef(false)

  // A new text from the server replaces the local one, unless it is mid-edit.
  const [seen, setSeen] = React.useState(version.text)
  if (seen !== version.text) {
    setSeen(version.text)
    if (!editing) setText(version.text)
  }

  const going = goingOutOfVersion(version, session)
  const line = goingOutLine(going, version.label)
  const length = measurePost(editing ? text : version.text, version.channel)

  const approve = async () => {
    if (!onApprove || approving) return
    pressedRef.current = true
    setApproving(true)
    try {
      await onApprove(version.text)
    } catch {
      pressedRef.current = false
    } finally {
      setApproving(false)
    }
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!onSave || saving || !editing) return
    setSaving(true)
    try {
      await onSave(text)
      setEditing(false)
    } catch {
      // Stays in edit with the words intact, so nothing typed is lost.
    } finally {
      setSaving(false)
    }
  }

  const value: Ctx = {
    version,
    going,
    line,
    length,
    text,
    setText,
    editing,
    setEditing: (next) => {
      if (!next) setText(version.text)
      setEditing(next)
    },
    titleId,
    isAction,
    approving,
    approve: () => void approve(),
    onReopen,
    onDiscard,
    canEdit: onSave != null,
    saving,
    pressedRef,
  }

  return (
    <DraftContext value={value}>
      <div className={DRAFT_ROOM}>
        <Card width="with-margin" role="group" aria-labelledby={titleId}>
          <form onSubmit={save} className="flex flex-col gap-kit-related">
            {children}
          </form>
        </Card>
      </div>
    </DraftContext>
  )
}

export type DraftCardHeaderProps = {
  /** The person's initials, for the neutral Avatar. */
  initials: string
  /** Where it came from (`Draft.from.sourceLabel`), in the meta line. */
  source?: string
  /** `h3` (default) under a page's h2; `h2` when the card is the section. */
  as?: "h2" | "h3"
}

/** "Draft for X", and the meta line: source · length against the ceiling. */
export function DraftCardHeader({ initials, source, as = "h3" }: DraftCardHeaderProps) {
  const { version, length, titleId } = useDraft("DraftCardHeader")
  const size = length.limit ? `${length.used} / ${length.limit}` : `${length.used} chars`
  return (
    <div className="flex items-center gap-kit-related">
      <Avatar initials={initials} />
      <div className="flex min-w-0 flex-col">
        <Text as={as} weight="strong" id={titleId}>
          Draft for {version.label}
        </Text>
        <Mono>{source ? `${source} · ${size}` : size}</Mono>
      </div>
    </div>
  )
}

function Lines({ lines }: { lines: Paragraph }) {
  return (
    <div>
      {lines.map((l, i) =>
        l.figure ? (
          <Text key={i} variant="figure">
            {l.text}
          </Text>
        ) : (
          <Text key={i}>{l.text}</Text>
        ),
      )}
    </div>
  )
}

/**
 * The post. Three beats in the blue pen when the text clearly has them
 * (lib/draft-beats.ts), otherwise its paragraphs plain: no bracket is ever a
 * guess. While editing, a Textarea with the length counting against the
 * channel's ceiling.
 */
export function DraftCardBody() {
  const { version, text, setText, editing, length } = useDraft("DraftCardBody")
  const area = React.useRef<HTMLTextAreaElement>(null)

  React.useEffect(() => {
    if (editing) area.current?.focus()
  }, [editing])

  if (editing) {
    return (
      <div className="flex flex-col gap-kit-tight">
        <Textarea
          ref={area}
          aria-label={`Text for ${version.label}`}
          value={text}
          onValueChange={setText}
        />
        {length.limit ? (
          <Text variant="small" tone="muted" aria-live="polite">
            <Count value={length.used} /> of {length.limit}
            {length.over > 0 ? `, ${length.over} over the ${version.label} limit.` : "."}
          </Text>
        ) : null}
      </div>
    )
  }

  const beats = readBeats(version.text)
  if (beats) {
    return (
      <Beats>
        <div className="flex flex-col gap-kit-related">
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
    )
  }

  return (
    <div className="flex flex-col gap-kit-related">
      {paragraphsOf(version.text).map((p, i) => (
        <Lines key={i} lines={p} />
      ))}
    </div>
  )
}

/**
 * Something Quincy noticed about this version: the same text as another
 * channel, the riff's hook repeated back. One muted sentence, after the body.
 */
export function DraftCardNotice({ children }: { children: React.ReactNode }) {
  return (
    <Text tone="muted" role="note">
      {children}
    </Text>
  )
}

export type DraftCardActionsProps = {
  /**
   * The slot Approve would take ("Wed 09:00"), when the page knows it
   * (`nextFreeSlot` in lib/scheduling.ts). Not on `Version`; omit it and the
   * line is left out.
   */
  opening?: string
  /**
   * Quincy's note on the time once it is set ("your best hour"). Needs a
   * reason the data does not hold yet (docs/design/quincy-drafts.md); omit it.
   */
  note?: string
  /**
   * Further controls once it is decided, on their own row under the status
   * line: Post now (behind an AlertDialog), Give it a time. The page renders
   * them from `goingOutLine(…).postable` / `.placeable`, and decides which
   * one, if any, is the action.
   */
  more?: React.ReactNode
}

/**
 * Approve · Edit · hold to discard, swapping for what happens next: when it
 * goes out with Undo, or what went wrong with Reopen, or the posted receipt.
 */
export function DraftCardActions({ opening, note, more }: DraftCardActionsProps) {
  const ctx = useDraft("DraftCardActions")
  const { going, line, editing, version, titleId, pressedRef } = ctx
  const deciding = going.kind === "writing" || editing
  const approveRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const editRef = React.useRef<HTMLButtonElement>(null)
  const [reopening, setReopening] = React.useState(false)
  const wasEditing = React.useRef(editing)

  // The pressedRef button goes inert in its closing Arrive; focus follows to
  // its counterpart (docs/design/motion.md, "Focus").
  React.useEffect(() => {
    if (!pressedRef.current) return
    pressedRef.current = false
    ;(deciding ? approveRef : undoRef).current?.focus({ preventScroll: true })
  }, [deciding, pressedRef])

  // Leaving edit (Save or Cancel) puts focus back on Edit.
  React.useEffect(() => {
    if (wasEditing.current && !editing) editRef.current?.focus({ preventScroll: true })
    wasEditing.current = editing
  }, [editing])

  const reopen = async () => {
    if (!ctx.onReopen) return
    pressedRef.current = true
    setReopening(true)
    try {
      await ctx.onReopen()
    } catch {
      pressedRef.current = false
    } finally {
      setReopening(false)
    }
  }

  const statusLine = (
    <Status
      line={line}
      sending={going.kind === "sending"}
      undoRef={undoRef}
      reopening={reopening}
      onReopen={ctx.onReopen ? () => void reopen() : undefined}
    />
  )
  // `more` sits outside the status region, so a pending label on Post now is
  // not read out as a change of state.
  const status =
    more != null ? (
      <div className="flex flex-col gap-kit-related">
        {statusLine}
        <div className="flex flex-wrap items-center gap-kit-controls">{more}</div>
      </div>
    ) : (
      statusLine
    )

  return (
    <div>
      <Rule />
      {/* Each side renders only while shown; Arrive keeps the last children
          while it folds away, so nothing collapses mid-exit. */}
      <Arrive show={deciding}>
        {!deciding ? null : editing ? (
          <div className="flex gap-kit-controls">
            <Button type="submit" variant="action" pending={ctx.saving} pendingLabel="Saving…">
              Save
            </Button>
            <Button onClick={() => ctx.setEditing(false)}>Cancel</Button>
          </div>
        ) : (
          <div className="flex flex-col gap-kit-related">
            {opening ? (
              <Text tone="muted">
                <Mono>{opening}</Mono> is open for {version.label}.
              </Text>
            ) : null}
            <div className="flex flex-wrap items-center gap-kit-controls">
              <Button
                ref={approveRef}
                variant={ctx.isAction ? "action" : "quiet"}
                icon={Tick02Icon}
                pending={ctx.approving}
                pendingLabel="Approving…"
                aria-describedby={titleId}
                onClick={ctx.approve}
              >
                Approve
              </Button>
              {ctx.canEdit ? (
                <Button ref={editRef} aria-describedby={titleId} onClick={() => ctx.setEditing(true)}>
                  Edit
                </Button>
              ) : null}
              {ctx.onDiscard ? (
                <span className="ml-auto">
                  <HoldButton pendingLabel="Discarding…" aria-describedby={titleId} onConfirm={ctx.onDiscard}>
                    Discard
                  </HoldButton>
                </span>
              ) : null}
            </div>
          </div>
        )}
      </Arrive>
      <Arrive show={!deciding} from="below">
        {deciding ? null : note && going.kind === "scheduled" ? (
          <MarginNote note={note}>{status}</MarginNote>
        ) : (
          status
        )}
      </Arrive>
    </div>
  )
}

function Status({
  line,
  sending,
  undoRef,
  reopening,
  onReopen,
}: {
  line: GoingOutLine
  sending: boolean
  undoRef: React.Ref<HTMLButtonElement>
  reopening: boolean
  onReopen?: () => void
}) {
  // Sending: the one state that is running right now, said with the friend
  // in its working state beside the words.
  if (sending) {
    return (
      <Text as="div" role="status">
        <span className="inline-flex items-center gap-2">
          <Friend size={20} state="reading" className="shrink-0" />
          <span className="min-w-0">
            {line.text}
          </span>
        </span>
      </Text>
    )
  }

  const words = (
    <Text as="span" tone={line.tone === "quiet" ? "muted" : "ink"}>
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
    </Text>
  )

  return (
    <div role="status" className="flex min-h-kit-control-md items-center justify-between gap-kit-related">
      {words}
      {line.undoable && onReopen ? (
        <Button ref={undoRef} pending={reopening} pendingLabel="Reopening…" onClick={onReopen}>
          {line.tone === "wrong" ? "Reopen" : "Undo"}
        </Button>
      ) : null}
    </div>
  )
}
