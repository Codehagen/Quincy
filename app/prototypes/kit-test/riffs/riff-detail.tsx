"use client"

import * as React from "react"
import Link from "next/link"
import {
  Delete02Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons"

import {
  Arrive,
  Button,
  Card,
  Highlight,
  IconButton,
  MarginNote,
  Menu,
  MenuItem,
  MenuPanel,
  MenuTrigger,
  Mono,
  Muted,
  Rule,
  Text,
} from "@/components/kit"
import { Friend } from "@/components/mascot"

import { draftAngle } from "./actions"
import { DESTINATIONS, WRITES, type Angle, type AngleStatus, type Riff } from "./data"

/**
 * The open riff: what you said, and what came back. One object, so it holds
 * the page's one action (Draft on the angle Quincy would start with), its one
 * Highlight (the line in the scrap the angles rest on) and its one MarginNote
 * (beside that angle).
 */
export function RiffDetail({
  riff,
  onAngleStatus,
  onDismissRiff,
}: {
  riff: Riff
  onAngleStatus: (angleId: string, status: AngleStatus) => void
  onDismissRiff: () => void
}) {
  const nameId = `riff-${riff.id}-name`
  const open = riff.angles.filter((a) => a.status === "open")
  // The angle that carries the action: Quincy's pick if it is still open,
  // else the first open one.
  const lead = open.find((a) => a.pick) ?? open[0]

  return (
    <Card width="with-margin">
      <article aria-labelledby={nameId}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-0.5">
            <Text as="h2" weight="strong" id={nameId}>
              {riff.sourceLabel}
            </Text>
            <Mono>{[riff.capturedAt, riff.sourceMeta].filter(Boolean).join(" · ")}</Mono>
            {riff.adaptedFrom ? (
              <Text variant="small" tone="muted">
                From{" "}
                <a
                  href={riff.adaptedFrom.url}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="underline underline-offset-4 hover:text-kit-ink"
                >
                  @{riff.adaptedFrom.handle}
                </a>
                ’s post. The idea is borrowed; the angles are yours.
              </Text>
            ) : null}
          </div>
          <Menu>
            <MenuTrigger
              render={<IconButton icon={MoreHorizontalIcon} aria-label="More for this riff" />}
            />
            <MenuPanel align="end">
              <MenuItem tone="danger" icon={Delete02Icon} onClick={onDismissRiff}>
                {riff.angles.some((a) => a.status === "drafted")
                  ? "Dismiss the rest"
                  : "Dismiss the whole riff"}
              </MenuItem>
            </MenuPanel>
          </Menu>
        </div>

        {riff.scrap ? <Scrap text={riff.scrap} keyLine={riff.keyLine} /> : null}

        {riff.state === "working" ? (
          <div className="mt-4" role="status">
            <span className="inline-flex items-center gap-2">
              <Friend size={20} state="reading" className="shrink-0" />
              <span className="min-w-0">
                Reading it. Angles usually land within a minute.
              </span>
            </span>
          </div>
        ) : riff.state === "failed" ? (
          <div className="mt-4" role="status">
            <Text>{riff.failure}</Text>
          </div>
        ) : (
          <>
            <div className="mt-4">
              <Text variant="small" tone="muted">
                {open.length === 0
                  ? "Everything here is decided."
                  : `I found ${open.length === 1 ? "one way" : `${open.length} ways`} to take it.`}
              </Text>
            </div>
            <ul aria-label="Angles">
              {riff.angles.map((angle, i) => (
                <li key={angle.id} className={i === 0 ? "pt-3" : undefined}>
                  {i === 0 ? null : <Rule />}
                  <AngleItem
                    angle={angle}
                    isAction={angle.id === lead?.id}
                    onStatus={(s) => onAngleStatus(angle.id, s)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </article>
    </Card>
  )
}

/** The raw material, verbatim, in a recess in the object. Never truncated. */
function Scrap({ text, keyLine }: { text: string; keyLine?: string }) {
  const paragraphs = text.split(/\n{2,}/)
  return (
    <blockquote className="mt-3 flex flex-col gap-2 rounded-kit-control bg-kit-well px-3 py-2.5">
      {paragraphs.map((p, i) => {
        const at = keyLine ? p.indexOf(keyLine) : -1
        return (
          <Text key={i}>
            {at < 0 || !keyLine ? (
              p
            ) : (
              <>
                {p.slice(0, at)}
                <Highlight>{keyLine}</Highlight>
                {p.slice(at + keyLine.length)}
              </>
            )}
          </Text>
        )
      })}
    </blockquote>
  )
}

type Focus = "draft" | "drafts-link" | "undo" | null

function AngleItem({
  angle,
  isAction,
  onStatus,
}: {
  angle: Angle
  isAction: boolean
  onStatus: (status: AngleStatus) => void
}) {
  const [pending, setPending] = React.useState(false)
  const [refused, setRefused] = React.useState<{ reason: string; message: string } | null>(null)
  const draftRef = React.useRef<HTMLButtonElement>(null)
  const draftsLinkRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  // Where focus goes once the swap lands: the pressed button goes inert
  // inside a closing Arrive, so its counterpart takes focus (motion.md).
  const focusNext = React.useRef<Focus>(null)

  React.useEffect(() => {
    const f = focusNext.current
    if (!f) return
    focusNext.current = null
    const target = { draft: draftRef, "drafts-link": draftsLinkRef, undo: undoRef }[f]
    target.current?.focus()
  }, [angle.status])

  const writes = WRITES[angle.shape]
  const decided = angle.status !== "open"

  const draft = async () => {
    setRefused(null)
    setPending(true)
    const result = await draftAngle(angle)
    setPending(false)
    if (!result.ok) {
      setRefused({ reason: result.reason, message: result.message })
      return
    }
    focusNext.current = "drafts-link"
    onStatus("drafted")
  }

  const dismiss = () => {
    setRefused(null)
    focusNext.current = "undo"
    onStatus("dismissed")
  }

  const undo = () => {
    focusNext.current = "draft"
    onStatus("open")
  }

  const body = (
    <div className="flex flex-col gap-1">
      <Text weight="strong" tone={decided ? "muted" : "ink"}>
        {angle.hook}
      </Text>
      <Text variant="small" tone="muted">
        {[angle.kind, angle.shape].filter(Boolean).join(" · ")} ·{" "}
        {writes === 0
          ? "no channel for this yet"
          : `writes ${writes} post${writes === 1 ? "" : "s"}, ${DESTINATIONS[angle.shape]}`}
      </Text>
      {decided ? null : (
        <Text variant="small">
          <span className="font-kit-strong">Why this one. </span>
          <Muted>{angle.why}</Muted>
        </Text>
      )}
    </div>
  )

  return (
    <div>
      {angle.pick ? (
        <MarginNote note={angle.pick.note} show={angle.status === "open"}>
          {body}
        </MarginNote>
      ) : (
        body
      )}

      <Arrive show={angle.status === "open"}>
        <div className="flex flex-col gap-3 pt-3">
          <div role="status" aria-live="polite">
            {refused ? (
              <div className="flex flex-wrap items-center gap-3">
                <Text>{refused.message}</Text>
                {refused.reason === "no-channel" ? (
                  <Button nativeButton={false} render={<Link href="/channels" />}>
                    Connect a channel
                  </Button>
                ) : (
                  <Button nativeButton={false} render={<Link href="/settings/billing" />}>
                    See plans
                  </Button>
                )}
              </div>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <Button
              ref={draftRef}
              variant={isAction ? "action" : "quiet"}
              pending={pending}
              pendingLabel="Drafting…"
              aria-label={`Draft: ${angle.hook}`}
              onClick={draft}
            >
              Draft this
            </Button>
            <div className="ml-auto">
              <Button
                variant="danger"
                disabled={pending}
                aria-label={`Dismiss: ${angle.hook}`}
                onClick={dismiss}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </Arrive>

      <Arrive show={angle.status === "drafted"} from="below">
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Text as="span">In Drafts. Nothing goes out until you approve it.</Text>
          <Button ref={draftsLinkRef} nativeButton={false} render={<Link href="/drafts" />}>
            Open Drafts
          </Button>
        </div>
      </Arrive>

      <Arrive show={angle.status === "dismissed"} from="below">
        <div className="flex flex-wrap items-center gap-3 pt-3">
          <Text as="span" tone="muted">
            Dismissed.
          </Text>
          <Button ref={undoRef} onClick={undo}>
            Undo
          </Button>
        </div>
      </Arrive>
    </div>
  )
}
