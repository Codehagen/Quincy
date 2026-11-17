"use client"

import * as React from "react"
import { SentIcon, Tick02Icon } from "@hugeicons/core-free-icons"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPanel,
  AlertDialogTrigger,
  Button,
  HoldButton,
  LiveDot,
  MarginRoom,
  Mono,
  TextLink,
} from "@/components/kit"
import type { Version } from "@/lib/drafts"
import type { GoingOut, GoingOutKind, GoingOutLine } from "@/lib/going-out"
import { CHANNEL_RULES, countGraphemes, feedCut, measurePost } from "@/lib/post-length"

import { RuleOfferLine } from "./rule-offer"
import type { DraftsStore } from "./use-drafts"
import type { Row } from "./draft-rows"

/**
 * The row under a version's feed column: the verbs in the kit, never inside
 * the platform's picture. Writing: Approve (A), Edit (E) and the Discard
 * hold. Editing: Save, Cancel and the counter. Decided: the status line, Give
 * it a time, Post now and the voice rule offer.
 */

/** States with no time and no way out but a press here, where Post now leads. */
export const STRANDED: GoingOutKind[] = ["no-slot", "slots-full", "failed"]

export type DraftVerbsProps = {
  row: Row
  version: Version
  store: DraftsStore
  going: GoingOut
  line: GoingOutLine
  /** The id of the version's hidden title ("Draft for X"), which each verb is described by. */
  titleId: string
  /** The words being edited, one per post; null when not editing. */
  editing: string[] | null
  onSave: () => void
  onCancel: () => void
  editRef: React.Ref<HTMLButtonElement>
  /** The page's one ink action (actions.md), decided by the open draft. */
  approveIsAction: boolean
  placeIsAction: boolean
  postIsAction: boolean
}

export function DraftVerbs({
  row,
  version: v,
  store,
  going,
  line,
  titleId,
  editing,
  onSave,
  onCancel,
  editRef,
  approveIsAction,
  placeIsAction,
  postIsAction,
}: DraftVerbsProps) {
  if (editing) {
    // The counter is ours, under the post: a ring is the composer's, not the feed's, and the column must read as the feed.
    return (
      <MarginRoom.Column className="flex flex-wrap items-center gap-kit-controls">
        <Button size="sm" variant="action" onClick={onSave}>
          Save
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <span aria-live="polite" className="ms-auto">
          <Counter posts={editing} channel={v.channel} />
        </span>
      </MarginRoom.Column>
    )
  }

  if (v.state === "writing") {
    return (
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
        <Button
          ref={editRef}
          size="sm"
          variant="ghost"
          shortcut={approveIsAction ? "E" : undefined}
          aria-describedby={titleId}
          onClick={() => store.setEditing(v.id)}
        >
          Edit
        </Button>
        <span className="ms-auto">
          <HoldButton pendingLabel="Discarding…" aria-describedby={titleId} onConfirm={() => store.discard(row, v.id)}>
            Discard
          </HoldButton>
        </span>
      </MarginRoom.Column>
    )
  }

  const offer = store.offers[v.id]
  return (
    <MarginRoom.Column className="flex flex-col gap-kit-related">
      <Status line={line} sending={going.kind === "sending"} onReopen={line.undoable ? () => store.reopen(v.id) : undefined} />
      {line.placeable || line.postable ? (
        <div className="flex flex-wrap items-center gap-kit-controls">
          {line.placeable ? (
            // The repair for "approved before that slot existed": a press, rather than reopening and approving again.
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
            <PostNow
              label={v.label}
              idea={row.draft.idea}
              isAction={postIsAction}
              pending={store.posting === v.id}
              onPost={() => store.postNow(v.id)}
            />
          ) : null}
        </div>
      ) : null}
      {offer ? <RuleOfferLine offer={offer} channel={v.channel} /> : null}
    </MarginRoom.Column>
  )
}

/** Our readout, while editing only: "207 / 280", or each post of a thread. */
export function Counter({ posts, channel }: { posts: string[]; channel: string }) {
  const limit = CHANNEL_RULES[channel]?.limit ?? null
  const used = posts.map((p) => measurePost(p, channel).used)
  const over = limit != null && used.some((u) => u > limit)
  const words = limit ? used.map((u) => `${u} / ${limit}`).join(" · ") : used.map((u) => `${u} chars`).join(" · ")
  return (
    <span className={`font-kit-mono text-kit-mono-sm whitespace-nowrap tabular-nums ${over ? "text-kit-ink" : "text-kit-ink-muted"}`}>
      {words}
    </span>
  )
}

/**
 * What Quincy noticed about a waiting version, under the column and above
 * Approve, the press it exists to inform. Over the limit is ink (Approve is
 * the press it should stop); the hook fallback, the fold and the twin are
 * muted. The fold sentence reads the same `feedCut` the column draws.
 */
export function Notices({ v, text, twin, hook }: { v: Version; text: string; twin?: string; hook?: string }) {
  if (v.state !== "writing") return null
  const { over } = measurePost(text, v.channel)
  // The drafting call failed and fell back to the hook, so the model never
  // wrote this. Compared with the text as it stands, so it clears once the
  // person has written anything.
  const isHook = !!hook && hook.trim() !== "" && text.trim() === hook.trim()
  const cut = feedCut(text, v.channel)
  const folded = cut.kind === "fold"
  const before = cut.visible.replace(/\s+$/, "").slice(-24).replace(/^\S*\s/, "")
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

/** Where a decided version stands, with Undo (approved) or Reopen (didn't go). */
export function Status({ line, sending, onReopen }: { line: GoingOutLine; sending: boolean; onReopen?: () => void }) {
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

/**
 * Send it now, behind the one confirmation this page has. Everything else
 * here can be taken back; a post on somebody's timeline cannot, and Quincy
 * has no unsend. The sentence names the channel and says both irreversible
 * facts.
 */
export function PostNow({
  label,
  idea,
  isAction,
  pending,
  onPost,
}: {
  label: string
  idea: string
  /** Only when nothing else will send this version (actions.md). */
  isAction: boolean
  pending: boolean
  onPost: () => void
}) {
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
