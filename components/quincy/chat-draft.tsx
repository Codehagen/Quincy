"use client"

import * as React from "react"

import { Card, LiveDot, Mono, Text } from "@/components/kit"
import type { ApprovalPreview } from "@/lib/draft-writes"
import {
  isDraftArtifactOutput,
  type DraftArtifactOutput,
  type DraftVersionRef,
} from "@/lib/draft-artifact"
import type { Version } from "@/lib/drafts"
import { goingOutLine } from "@/lib/going-out"
import type { ApprovalPlacement } from "@/lib/scheduling"
import type { StudioDraftActions } from "@/lib/studio-draft-actions"
import type { DraftToolPart } from "@/lib/studio-message"

import { StreamCaret, useRevealedText } from "./reveal-text"
import { DRAFT_ROOM, DraftCard, DraftCardActions, DraftCardBody, DraftCardHeader } from "./draft-card"

/**
 * A draft in the Studio conversation (plans/030 #1 and #14): the same
 * DraftCard /drafts shows, bound to the row the tool wrote.
 *
 * - **Writing**: from the first token of the tool's input the card is there,
 *   with a pulsing LiveDot ("Writing the LinkedIn version"), and the words
 *   arrive in it as the tool streams preliminary outputs. Thinking above it
 *   folds as it lands (lib/studio-turn.ts).
 * - **Held**: the card with Approve · Edit, and the slot Approve would take.
 *   Approve lands in the same Lineup slot as /drafts; nothing publishes from
 *   here. Edit saves the row, and the saved words travel into the next turn
 *   (`report`), so "make it shorter" works on what is on screen.
 * - **Decided** this session: when it goes out, and Undo.
 * - **History**: a version a later turn revised is a snapshot, header and
 *   body only. One that was approved before this page loaded says so.
 *
 * Actions come from context (`ChatDraftProvider`), so the transcript renders
 * against the server actions in Studio and against in-memory fixtures in the
 * kit lab and the scripted transport.
 */

type Ctx = {
  actions: StudioDraftActions | null
  initials: string
  /** versionId → the toolCallId whose card is the live one for it. */
  currentToolCallId: ReadonlyMap<string, string>
  /** The version whose Approve is the view's one action, if any. */
  actionVersionId: string | null
  /** The words on screen, for the next turn's `currentDrafts`. */
  report: (version: DraftVersionRef) => void
}

const ChatDraftContext = React.createContext<Ctx | null>(null)

export type ChatDraftProviderProps = Ctx & { children: React.ReactNode }

export function ChatDraftProvider({ children, ...ctx }: ChatDraftProviderProps) {
  const { actions, initials, currentToolCallId, actionVersionId, report } = ctx
  const value = React.useMemo(
    () => ({ actions, initials, currentToolCallId, actionVersionId, report }),
    [actions, initials, currentToolCallId, actionVersionId, report],
  )
  return <ChatDraftContext value={value}>{children}</ChatDraftContext>
}

function useChatDraft(): Ctx {
  return (
    React.useContext(ChatDraftContext) ?? {
      actions: null,
      initials: "",
      currentToolCallId: new Map(),
      actionVersionId: null,
      report: () => {},
    }
  )
}

function isRunning(state: string) {
  return state === "input-streaming" || state === "input-available"
}

export type ChatDraftProps = {
  /** A `draft_angle` or `revise_version` part that lib/studio-turn.ts planned as a card. */
  part: DraftToolPart
}

export function ChatDraft({ part }: ChatDraftProps) {
  const running = isRunning(part.state)
  const output = part.state === "output-available" && isDraftArtifactOutput(part.output) ? part.output : null
  const streaming = Boolean(output?.streaming || ("preliminary" in part && part.preliminary))

  // Seen arriving in this mount, and whether any words streamed: a draft that
  // landed whole after a wait (a revision) writes itself in; history does not.
  const [sawRunning, setSawRunning] = React.useState(running || streaming)
  const [sawWords, setSawWords] = React.useState(false)
  if ((running || streaming) && !sawRunning) setSawRunning(true)
  const hasWords = Boolean(output?.versions.some((v) => v.body.length > 0))
  if (streaming && hasWords && !sawWords) setSawWords(true)

  if (!output) {
    return <WritingCard label={null} body="" />
  }

  return (
    <div data-slot="quincy-chat-draft" className="flex w-full flex-col gap-kit-stack">
      {output.versions.map((version) =>
        streaming ? (
          <WritingCard key={version.channel} label={version.label} body={version.body} />
        ) : (
          <SettledVersion
            key={`${part.toolCallId}-${version.channel}`}
            version={version}
            toolCallId={part.toolCallId}
            output={output}
            writeIn={sawRunning && !sawWords && !output.existing}
          />
        ),
      )}
    </div>
  )
}

/**
 * The card while the words arrive: the header, the words so far, a LiveDot.
 * In the settled card's room (DRAFT_ROOM), so it is already the width the
 * DraftCard will be: the lines do not move when it lands and the beats
 * appear beside them.
 */
function WritingCard({ label, body, caret = true }: { label: string | null; body: string; caret?: boolean }) {
  return (
    <div className={DRAFT_ROOM}>
      <Card width="with-margin" aria-busy>
        <div className="flex flex-col gap-kit-related">
          <div className="flex min-w-0 flex-col">
            <Text as="h3" weight="strong">
              {label ? `Draft for ${label}` : "A draft"}
            </Text>
            <Mono>writing</Mono>
          </div>
          {body ? (
            <Text>
              <span className="whitespace-pre-wrap">
                {body}
                {caret ? <StreamCaret /> : null}
              </span>
            </Text>
          ) : null}
          <Text as="div" role="status" tone="muted">
            <LiveDot pulse>{label ? `Writing the ${label} version.` : "Writing it. A draft usually lands within a minute."}</LiveDot>
          </Text>
        </div>
      </Card>
    </div>
  )
}

function toVersion(
  ref: DraftVersionRef,
  row: { body: string; state: "writing" | "approved" },
  preview: ApprovalPreview | null,
): Version {
  return {
    id: ref.versionId,
    channel: ref.channel,
    label: ref.label,
    text: row.body,
    state: row.state,
    goingOut: null,
    // Unknown until the preview answers; a slot is the common case.
    hasSlot: !(preview && preview.ok && "reason" in preview && preview.reason === "no-slot"),
    sent: null,
  }
}

function SettledVersion({
  version: ref,
  toolCallId,
  output,
  writeIn,
}: {
  version: DraftVersionRef
  toolCallId: string
  output: DraftArtifactOutput
  writeIn: boolean
}) {
  const ctx = useChatDraft()
  const current = ctx.currentToolCallId.get(ref.versionId) === toolCallId
  const [row, setRow] = React.useState({ body: ref.body, state: ref.state, updatedAt: ref.updatedAt })
  const [preview, setPreview] = React.useState<ApprovalPreview | null>(null)
  const [placement, setPlacement] = React.useState<ApprovalPlacement | undefined>(undefined)
  const [error, setError] = React.useState<string | null>(null)
  const { text: arriving, done: arrived } = useRevealedText(ref.body, writeIn)
  const { actions, report } = ctx

  // The row, not the snapshot the tool returned: a refresh after Approve or an
  // edit made on /drafts must show what is true now.
  React.useEffect(() => {
    if (!actions || !current) return
    let cancelled = false
    void actions.read(ref.versionId).then((read) => {
      if (!cancelled && read.ok) setRow({ body: read.body, state: read.state, updatedAt: read.updatedAt })
    })
    return () => {
      cancelled = true
    }
  }, [actions, current, ref.versionId])

  React.useEffect(() => {
    if (!actions || !current || row.state !== "writing") return
    let cancelled = false
    void actions.preview(ref.versionId).then((p) => {
      if (!cancelled) setPreview(p)
    })
    return () => {
      cancelled = true
    }
  }, [actions, current, row.state, ref.versionId])

  // What is on screen goes into the next turn.
  React.useEffect(() => {
    if (!current) return
    report({ ...ref, body: row.body, state: row.state, updatedAt: row.updatedAt })
  }, [current, report, ref, row.body, row.state, row.updatedAt])

  if (writeIn && !arrived) {
    return <WritingCard label={ref.label} body={arriving} />
  }

  const version = toVersion(ref, row, preview)
  const notices = (
    <>
      {output.fellBack.includes(ref.channel) ? (
        <Text tone="muted" role="note">
          I could not write this one, so it is the idea itself. It needs your rewrite.
        </Text>
      ) : null}
      {error ? (
        <Text role="status">
          {error}
        </Text>
      ) : null}
    </>
  )

  // A later turn revised this version: the card above it is what it was.
  if (!current || !actions) {
    return (
      <DraftCard version={version}>
        <DraftCardHeader initials={ctx.initials} source={current ? undefined : "earlier version"} />
        <DraftCardBody />
      </DraftCard>
    )
  }

  // Approved before this page loaded: the row says so, the slot is on Lineup.
  if (row.state === "approved" && !placement) {
    return (
      <DraftCard version={version}>
        <DraftCardHeader initials={ctx.initials} />
        <DraftCardBody />
        <Text role="status">{goingOutLine({ kind: "approved" }, ref.label).text}</Text>
      </DraftCard>
    )
  }

  // The row as written, after an action that moved it: the next Approve sends
  // this updatedAt as its expectation. A failed read keeps what is on screen.
  async function refresh() {
    if (!actions) return
    try {
      const read = await actions.read(ref.versionId)
      if (read.ok) setRow({ body: read.body, state: read.state, updatedAt: read.updatedAt })
    } catch {
      // The action itself succeeded; the next Approve will say if the row moved.
    }
  }

  const opening =
    preview && preview.ok && "goingOut" in preview ? preview.goingOut : undefined

  return (
    <DraftCard
      version={version}
      session={{ placement }}
      isAction={ctx.actionVersionId === ref.versionId}
      onApprove={async (text) => {
        setError(null)
        const result = await actions.approve(ref.versionId, text, row.updatedAt)
        if (!result.ok) {
          setError(result.message)
          throw new Error(result.message)
        }
        setPlacement(result.placement)
        setRow((r) => ({ ...r, state: "approved" }))
        // Approve moved the row's updatedAt. Keeping the old one would make
        // Undo then Approve read as a stale write and be refused.
        await refresh()
      }}
      onReopen={async () => {
        setError(null)
        await actions.reopen(ref.versionId)
        setPlacement(undefined)
        setRow((r) => ({ ...r, state: "writing" }))
        await refresh()
      }}
      onSave={async (text) => {
        setError(null)
        const saved = await actions.save(ref.versionId, text)
        if (!saved.ok) {
          setError(saved.message)
          throw new Error(saved.message)
        }
        setRow((r) => ({ ...r, body: saved.body, updatedAt: saved.updatedAt }))
      }}
    >
      <DraftCardHeader initials={ctx.initials} />
      <DraftCardBody />
      {notices}
      <DraftCardActions opening={opening} />
    </DraftCard>
  )
}
