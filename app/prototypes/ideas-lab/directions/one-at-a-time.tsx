"use client"

import * as React from "react"

import type { Angle, Riff } from "@/lib/riffs"
import {
  Button,
  ButtonLink,
  Card,
  Highlight,
  Kbd,
  KitPage,
  List,
  ListRow,
  LiveDot,
  Mono,
  Stage,
  Tag,
  Tags,
  Text,
  Well,
} from "@/components/kit"
import { ProvenanceMark } from "@/components/quincy"

import { WRITES, readingsFor } from "../fixtures"
import { Capture, destinations, summaryFor, type Controls } from "../parts"
import type { FrameId, Queue } from "../queue"

/**
 * 2 · One at a time — a triage inbox. The unit is an idea, not the
 * material it came from: the page shows one idea, the sentence it stands
 * on, and three verbs with keys (D Draft, N Not this one, L Later). Deciding
 * moves to the next idea in place, so a run of decisions never leaves the
 * keyboard. The material is context under the idea, not the thing you open.
 */

type Item = { riff: Riff; angle: Angle }

function order(riffs: Riff[], later: readonly string[]): Item[] {
  const all: Item[] = []
  for (const riff of riffs) {
    if (riff.state !== "ready") continue
    for (const angle of riff.angles) if (angle.status !== "drafted") all.push({ riff, angle })
  }
  const now = all.filter((i) => !later.includes(i.angle.id))
  const kept = later.map((id) => all.find((i) => i.angle.id === id)).filter((i): i is Item => i != null)
  return [...now, ...kept]
}

type Just = { kind: "drafted" | "dropped" | "later"; hook: string } | null

export function OneAtATime({ q, c }: { q: Queue; frame: FrameId; c: Controls }) {
  const items = order(q.riffs, q.later)
  // A decision names the next idea itself (`after`), so falling back to the
  // first only happens when the open one left from another direction.
  const index = Math.max(items.findIndex((i) => i.angle.id === q.open.one), 0)
  const item = items[index] ?? null
  const [pending, setPending] = React.useState(false)
  const [just, setJust] = React.useState<Just>(null)
  const cardRef = React.useRef<HTMLDivElement>(null)

  const reading = q.riffs.filter((r) => r.state === "working")
  const failed = q.riffs.filter((r) => r.state === "failed")

  const go = (i: number) => {
    const next = items[(i + items.length) % items.length]
    if (next) q.setOpen("one", next.angle.id)
  }
  /** After a decision the same position holds the next idea; keep focus on the card. */
  const after = (kind: NonNullable<Just>["kind"], hook: string) => {
    setJust({ kind, hook })
    q.setOpen("one", items[index + 1]?.angle.id ?? items[index - 1]?.angle.id ?? null)
    cardRef.current?.focus({ preventScroll: true })
  }

  const draft = async () => {
    if (!item || pending) return
    setPending(true)
    await q.draft(item.angle)
    setPending(false)
    after("drafted", item.angle.hook)
  }
  const drop = () => {
    if (!item || pending) return
    q.drop(item.angle.id)
    after("dropped", item.angle.hook)
  }
  const later = () => {
    if (!item || pending) return
    if (q.later.includes(item.angle.id) && items.length === 1) return
    q.setLater(item.angle.id, true)
    after("later", item.angle.hook)
  }

  const onKey = (e: React.KeyboardEvent) => {
    const t = e.target as HTMLElement
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return
    if (e.metaKey || e.ctrlKey || e.altKey) return
    const k = e.key.toLowerCase()
    if (k === "d") void draft()
    else if (k === "n") drop()
    else if (k === "l") later()
    else if (k === "j" || e.key === "ArrowDown") go(index + 1)
    else if (k === "k" || e.key === "ArrowUp") go(index - 1)
    else return
    e.preventDefault()
    e.stopPropagation()
  }

  const readings = item ? readingsFor(item.riff) : {}
  const line = item ? readings[item.angle.id]?.line : undefined
  const peek = items.slice(index + 1, index + 1 + c.peek)

  return (
    <KitPage title="Ideas" summary={summaryFor(q.riffs)} width="wide">
      <div className="flex w-full flex-col gap-kit-page-gap" style={{ maxWidth: `${c.measureRem}rem` }}>
        <Stage
          aria-label="Ideas"
          {...(item
            ? { lead: "One at a time.", rest: "Draft it, drop it, or keep it for later. The next one takes its place." }
            : { lead: "That was all of them.", rest: "Say what happened, and I’ll find the next ones." })}
        >
          {item ? (
            <div className="flex flex-col gap-kit-stack self-stretch" onKeyDown={onKey}>
              <div
                ref={cardRef}
                tabIndex={-1}
                aria-label={`Idea ${index + 1} of ${items.length}`}
                className="self-stretch rounded-kit-object outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus"
              >
                <Card key={item.angle.id}>
                  <div className="flex flex-col gap-kit-group">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-kit-related gap-y-kit-tight">
                      <ProvenanceMark riff={item.riff} />
                      <Mono>{`${index + 1} / ${items.length}`}</Mono>
                    </div>

                    <div className="flex flex-col gap-kit-tight">
                      <Text as="h2" weight="strong">
                        {item.angle.hook}
                      </Text>
                      <Tags>
                        {item.angle.kind ? <Tag>{item.angle.kind}</Tag> : null}
                        <Tag>{item.angle.shape}</Tag>
                        {q.later.includes(item.angle.id) ? <Tag>Kept for later</Tag> : null}
                      </Tags>
                    </div>

                    {item.angle.why ? (
                      <Text variant="small" tone="muted">
                        {item.angle.why}
                      </Text>
                    ) : null}

                    {c.material !== "none" ? <Material riff={item.riff} line={line} whole={c.material === "whole"} /> : null}

                    <div className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight">
                      <Button variant="action" pending={pending} pendingLabel="Drafting…" onClick={() => void draft()}>
                        Draft this idea
                      </Button>
                      <span className="hidden @lg/kit-stage:inline-flex">
                        <Kbd keys={["D"]} />
                      </span>
                      <span className="order-last basis-full @lg/kit-stage:order-none @lg/kit-stage:flex-1 @lg/kit-stage:basis-0">
                        <Text variant="small" tone="muted">
                          {writesSentence(item.angle)}
                        </Text>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-kit-controls">
                      <Button onClick={drop}>Not this one</Button>
                      <span className="hidden @lg/kit-stage:inline-flex">
                        <Kbd keys={["N"]} />
                      </span>
                      <Button onClick={later}>Later</Button>
                      <span className="hidden @lg/kit-stage:inline-flex">
                        <Kbd keys={["L"]} />
                      </span>
                    </div>
                  </div>
                </Card>
              </div>

              {just ? <JustNow just={just} /> : null}

              {peek.length > 0 ? (
                <List aria-label="Next">
                  {peek.map((p, i) => (
                    <ListRow
                      key={p.angle.id}
                      description={`${p.riff.sourceLabel} · ${p.riff.capturedAt}`}
                      meta={<Mono>{`${index + 2 + i}`}</Mono>}
                      onClick={() => q.setOpen("one", p.angle.id)}
                    >
                      {p.angle.hook}
                    </ListRow>
                  ))}
                </List>
              ) : null}

              <Text variant="small" tone="muted">
                <span className="hidden @lg/kit-stage:inline">
                  <Kbd keys={["J"]} /> <Kbd keys={["K"]} /> to move without deciding.{" "}
                </span>
                {reading.length > 0 ? (
                  <LiveDot pulse>{`Still reading ${reading.length === 1 ? "one note" : `${reading.length} notes`}.`}</LiveDot>
                ) : null}{" "}
                {failed.length > 0
                  ? `${failed.length === 1 ? "One source" : `${failed.length} sources`} had no post in ${failed.length === 1 ? "it" : "them"}.`
                  : null}
              </Text>
            </div>
          ) : (
            <div className="flex flex-col gap-kit-stack self-stretch">
              {just ? <JustNow just={just} /> : null}
              <Capture isAction />
            </div>
          )}
        </Stage>

        {item ? (
          <Stage aria-label="Say what happened" lead="Say what happened." rest="I read it and add what I find to the queue.">
            <Capture isAction={false} compact />
          </Stage>
        ) : null}
      </div>
    </KitPage>
  )
}

function writesSentence(angle: Angle) {
  const where = destinations(angle)
  const n = WRITES[angle.shape]
  if (n === 0) return "No channel for this yet."
  return `Writes ${n === 1 ? "one post" : `${n} posts`}${where ? `, for ${where}` : ""}.`
}

function JustNow({ just }: { just: NonNullable<Just> }) {
  const said = { drafted: "Drafted", dropped: "Dropped", later: "Kept for later" }[just.kind]
  return (
    <div role="status" className="flex flex-wrap items-center gap-kit-related">
      <Text variant="small" tone="muted">
        {`${said}: “${just.hook}”`}
      </Text>
      {just.kind === "drafted" ? (
        <ButtonLink href="#" onClick={(e) => e.preventDefault()}>
          Open Drafts
        </ButtonLink>
      ) : null}
    </div>
  )
}

/** The person's words: the one sentence, or all of it with the sentence marked. */
function Material({ riff, line, whole }: { riff: Riff; line: string | undefined; whole: boolean }) {
  const at = line ? riff.scrap.indexOf(line) : -1
  if (!whole && line && at >= 0) {
    return (
      <Well as="blockquote">
        <Text>
          {at > 0 ? "…" : ""}
          {line}
          {at + line.length < riff.scrap.length ? "…" : ""}
        </Text>
      </Well>
    )
  }
  return (
    <Well as="blockquote">
      <Text>
        {at >= 0 && line ? (
          <>
            {riff.scrap.slice(0, at)}
            <Highlight active>{line}</Highlight>
            {riff.scrap.slice(at + line.length)}
          </>
        ) : (
          riff.scrap
        )}
      </Text>
    </Well>
  )
}
