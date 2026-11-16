"use client"

import * as React from "react"
import { SentIcon } from "@hugeicons/core-free-icons"

import { duplicates, type Draft, type Version } from "@/lib/drafts"
import type { RuleOffer } from "@/lib/edit-classes"
import { goingOutLine, goingOutOfVersion, type GoingOutKind } from "@/lib/going-out"
import { countGraphemes, measurePost, splitAtFold } from "@/lib/post-length"
import type { SendNowResult } from "@/lib/publish-run"
import type { ApprovalPlacement } from "@/lib/scheduling"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogPanel,
  AlertDialogTrigger,
  Button,
  ButtonLink,
  Text,
  TextLink,
  useRevealOnNarrow,
} from "@/components/kit"
import {
  DraftCard,
  DraftCardActions,
  DraftCardBody,
  DraftCardHeader,
  DraftCardNotice,
} from "@/components/quincy"

import { RuleOfferLine } from "./rule-offer"

/**
 * The open piece: one DraftCard per channel version, stacked, under the list
 * that opened it (docs/design/page.md, "List and detail").
 *
 * Stacked rather than side by side, on the argument the old Ledger pane won:
 * five of seven real pieces have one version, and the two real multi-version
 * pieces are short enough to hold in your head.
 */
export type DraftPieceProps = {
  draft: Draft
  /** Every version decided. */
  done: boolean
  initials: string
  placements: Record<string, ApprovalPlacement | undefined>
  placing: string | null
  offers: Record<string, RuleOffer | undefined>
  posts: Record<string, SendNowResult | undefined>
  posting: string | null
  /** A version on the page is being edited, so its Save is the action. */
  anyEditing: boolean
  onApprove: (channel: string, text: string) => void
  onDiscard: (channel: string) => void
  onReopen: (channel: string) => void
  onSave: (versionId: string, text: string) => void
  onEditingChange: (versionId: string, editing: boolean) => void
  onPlace: (versionId: string) => void
  onPost: (versionId: string) => void
}

/** States with no time and no way out but a press here, where Post now leads. */
const STRANDED: GoingOutKind[] = ["no-slot", "slots-full", "failed"]

export function DraftPiece({
  draft,
  done,
  initials,
  placements,
  placing,
  offers,
  posts,
  posting,
  anyEditing,
  onApprove,
  onDiscard,
  onReopen,
  onSave,
  onEditingChange,
  onPlace,
  onPost,
}: DraftPieceProps) {
  const ref = useRevealOnNarrow<HTMLDivElement>(draft.id)
  const twins = duplicates(draft)

  const lines = draft.versions.map((v) => {
    const session = { placement: placements[v.id], posted: posts[v.id] }
    const going = goingOutOfVersion(v, session)
    return { v, session, going, line: goingOutLine(going, v.label) }
  })

  /**
   * One action on the page (docs/design/actions.md), worked out once here.
   * Editing wins (its Save is the card's own action); then the first version
   * waiting for Approve; then, on a finished piece, the one press that gives a
   * stranded version a future: Give it a time where a slot exists, else Post
   * now where nothing else will send it.
   */
  const approveId = anyEditing
    ? null
    : (lines.find((l) => l.going.kind === "writing")?.v.id ?? null)
  const placeId =
    anyEditing || approveId ? null : (lines.find((l) => l.line.placeable)?.v.id ?? null)
  const postId =
    anyEditing || approveId || placeId
      ? null
      : (lines.find((l) => STRANDED.includes(l.going.kind) && l.line.postable)?.v.id ??
        null)

  const hook = draft.from.riffHook
  const adapted = draft.from.adaptedFrom

  return (
    <div
      ref={ref}
      role="group"
      aria-label={draft.idea}
      className="flex w-full flex-col items-start gap-kit-stack self-stretch"
    >
      {/* Where it came from, when that says more than the row above: the angle
          it was drafted from (often the same sentence as the idea, so only
          when it differs), and a post somebody else wrote. A draft adapted
          from a stranger's post has to keep saying so. */}
      {(hook && hook !== draft.idea) || adapted ? (
        <Text variant="small" tone="muted">
          {hook && hook !== draft.idea ? (
            <>
              From the idea “{hook}”{/[.!?]$/.test(hook.trim()) ? "" : "."}{" "}
            </>
          ) : null}
          {adapted ? (
            <>
              Adapted from{" "}
              {adapted.url ? (
                <TextLink href={adapted.url} target="_blank" rel="noreferrer noopener">
                  {adapted.handle ? `@${adapted.handle}` : "a post"}
                </TextLink>
              ) : adapted.handle ? (
                `@${adapted.handle}`
              ) : (
                "a post you pasted"
              )}
              .
            </>
          ) : null}
        </Text>
      ) : null}

      {lines.map(({ v, session, line }) => (
        <DraftCard
          key={v.id}
          version={v}
          session={session}
          isAction={v.id === approveId}
          onApprove={(text) => onApprove(v.channel, text)}
          onReopen={() => onReopen(v.channel)}
          onDiscard={() => onDiscard(v.channel)}
          onSave={(text) => onSave(v.id, text)}
          onEditingChange={(on) => onEditingChange(v.id, on)}
        >
          <DraftCardHeader
            initials={initials}
            source={`${draft.from.sourceLabel} · ${draft.from.at}`}
          />
          <DraftCardBody />
          <Notices version={v} twin={twins[v.channel]} hook={hook} />
          <DraftCardActions
            more={
              line.placeable || line.postable ? (
                <>
                  {line.placeable ? (
                    // The repair for "approved before that slot existed": a
                    // press, rather than reopening and approving again.
                    <Button
                      variant={v.id === placeId ? "action" : "quiet"}
                      pending={placing === v.id}
                      pendingLabel="Giving it a time…"
                      onClick={() => onPlace(v.id)}
                    >
                      Give it a time
                    </Button>
                  ) : null}
                  {line.postable ? (
                    <PostNow
                      label={v.label}
                      idea={draft.idea}
                      isAction={v.id === postId}
                      pending={posting === v.id}
                      onPost={() => onPost(v.id)}
                    />
                  ) : null}
                </>
              ) : undefined
            }
          />
          {offers[v.id] ? (
            <RuleOfferLine offer={offers[v.id]!} channel={v.channel} />
          ) : null}
        </DraftCard>
      ))}

      {done ? <ButtonLink href="/lineup">Open Lineup</ButtonLink> : null}
    </div>
  )
}

/**
 * What Quincy noticed about a version, under its text and above Approve, the
 * press it exists to inform.
 */
function Notices({
  version,
  twin,
  hook,
}: {
  version: Version
  /** The label of a sibling with byte-identical text. */
  twin?: string
  /** The idea it was drafted from, to recognise a body that is only the hook. */
  hook?: string
}) {
  const writing = version.state === "writing"

  // The drafting call failed and `draftAngle` fell back to the hook, so the
  // model never wrote this. Compared with the text as it stands, so it clears
  // once the person has written anything.
  const isHook =
    writing && !!hook && hook.trim() !== "" && version.text.trim() === hook.trim()

  // Where the feed stops showing it: a few words before the cut, not a copy.
  const { visible, hidden } = splitAtFold(version.text, version.channel)
  const folded = writing && hidden.trim() !== ""
  const midWord = /\S$/.test(visible) && /^\S/.test(hidden)
  const before = visible.slice(-24).replace(/^\S*\s/, "")

  // Over the ceiling is said at rest too, not only while editing: Approve is
  // the press it should stop. Ink, not red (states.md).
  const { over } = measurePost(version.text, version.channel)

  return (
    <>
      {writing && over > 0 ? (
        <DraftCardNotice>
          {over} over the {version.label} limit. Trim it, or split it into a thread.
        </DraftCardNotice>
      ) : null}
      {isHook ? (
        <DraftCardNotice>
          I couldn&apos;t write this one, so this is your idea as it stood. Rewrite
          it and it&apos;s yours.
        </DraftCardNotice>
      ) : null}
      {folded ? (
        <DraftCardNotice>
          The feed cuts {midWord ? "mid-word " : ""}after “…{before}”.{" "}
          {countGraphemes(hidden)} characters sit behind the fold.
        </DraftCardNotice>
      ) : null}
      {twin ? (
        <DraftCardNotice>
          Identical to the {twin} version. This one was not written for{" "}
          {version.label}.
        </DraftCardNotice>
      ) : null}
    </>
  )
}

/**
 * Send it now, behind the one confirmation this page adds. Everything else
 * here can be taken back; a post on somebody's timeline cannot, and Quincy
 * has no unsend. The sentence names the channel and says both irreversible
 * facts (AlertDialog: the consequence is not on screen).
 */
function PostNow({
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
          <Button
            variant={isAction ? "action" : "quiet"}
            icon={SentIcon}
            pending={pending}
            pendingLabel="Posting…"
          >
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
