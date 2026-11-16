"use client"

import * as React from "react"
import { Mic01Icon, StopIcon } from "@hugeicons/core-free-icons"

import {
  Arrive,
  Button,
  ButtonLink,
  Card,
  Highlight,
  HoldButton,
  List,
  ListRow,
  LiveDot,
  MarginNote,
  Mono,
  Muted,
  Rule,
  SkeletonLines,
  Tag,
  Tags,
  Text,
  TextLink,
  UndoBar,
  Well,
  useRevealOnNarrow,
} from "@/components/kit"

/*
 * Client demos for the patterns section (docs/design/actions.md, removing.md, states.md,
 * page.md "List and detail"). Fixture copy; nothing is sent anywhere.
 */

type Angle = { id: string; hook: string; kind: string; shape: string; note?: string }

const RIFFS = [
  {
    id: "walk",
    title: "Nobody reads the pricing page until the call goes badly",
    source: "Voice note",
    meta: "Today · 4:12",
    scrap:
      "So the call on Tuesday, the guy had read the pricing page three times. Three times. And he still asked what a seat was.",
    keyLine: "he still asked what a seat was",
    angles: [
      { id: "a", hook: "He read the pricing page three times and still asked what a seat was.", kind: "Story", shape: "Short post", note: "start here. it's the one you told twice" },
      { id: "b", hook: "Why seat pricing confuses the people it is meant for.", kind: "Argument", shape: "Thread" },
    ] satisfies Angle[],
  },
  {
    id: "hire",
    title: "The hire who asked for the worst customer call",
    source: "Typed note",
    meta: "Yesterday",
    scrap: "New hire asked to listen to our worst call first. Best onboarding question I have heard.",
    keyLine: "Best onboarding question I have heard.",
    angles: [{ id: "c", hook: "Our newest hire asked for the worst call first.", kind: "Story", shape: "Short post" }] satisfies Angle[],
  },
]

/** One angle, with its own Draft. Only Quincy's pick carries the action. */
function AngleItem({ angle, isAction }: { angle: Angle; isAction: boolean }) {
  const [state, setState] = React.useState<"open" | "drafting" | "drafted">("open")
  const hookId = React.useId()
  const linkRef = React.useRef<HTMLAnchorElement>(null)
  const moved = React.useRef(false)

  React.useEffect(() => {
    if (state === "drafted" && moved.current) linkRef.current?.focus()
  }, [state])

  const draft = () => {
    setState("drafting")
    // Stands in for the request the person's press started.
    window.setTimeout(() => {
      moved.current = true
      setState("drafted")
    }, 900)
  }

  const body = (
    <div className="flex flex-col gap-kit-tight">
      <Text weight="strong" id={hookId}>
        {angle.hook}
      </Text>
      <Tags>
        <Tag>{angle.kind}</Tag>
        <Tag>{angle.shape}</Tag>
      </Tags>
    </div>
  )

  return (
    <div>
      {angle.note ? (
        <MarginNote note={angle.note} show={state !== "drafted"}>
          {body}
        </MarginNote>
      ) : (
        body
      )}
      <Arrive show={state !== "drafted"}>
        <div className="pt-kit-related">
          <Button
            variant={isAction ? "action" : "quiet"}
            pending={state === "drafting"}
            pendingLabel="Drafting…"
            aria-describedby={hookId}
            onClick={draft}
          >
            Draft this
          </Button>
        </div>
      </Arrive>
      <Arrive show={state === "drafted"} from="below">
        <div className="flex flex-wrap items-center gap-kit-related pt-kit-related">
          <Text as="span">In Drafts. Nothing goes out until you approve it.</Text>
          <ButtonLink ref={linkRef} href="#list-detail" aria-describedby={hookId}>
            Open Drafts
          </ButtonLink>
        </div>
      </Arrive>
    </div>
  )
}

/**
 * List and detail in one Stage, at one width, the detail under the list. On
 * a stage under 32rem, picking a row brings the detail's top into view
 * (useRevealOnNarrow); focus stays on the row.
 */
export function ListAndDetail() {
  const [openId, setOpenId] = React.useState(RIFFS[0]!.id)
  const riff = RIFFS.find((r) => r.id === openId)!
  const detailRef = useRevealOnNarrow<HTMLDivElement>(openId)
  const at = riff.scrap.indexOf(riff.keyLine)
  return (
    <>
      <List width="with-margin" aria-label="Riffs waiting">
        {RIFFS.map((r) => (
          <ListRow
            key={r.id}
            selected={r.id === openId}
            onClick={() => setOpenId(r.id)}
            titleLines={2}
            description={`${r.source} · ${r.angles.length} ${r.angles.length === 1 ? "angle" : "angles"}`}
            meta={<Mono>{r.meta.split(" · ")[0]}</Mono>}
          >
            {r.title}
          </ListRow>
        ))}
      </List>
      <Card key={riff.id} ref={detailRef} width="with-margin">
        <div className="flex flex-col gap-kit-group">
          <div className="flex flex-col gap-kit-tight">
            <Text as="h3" weight="strong">
              {riff.source}
            </Text>
            <Mono>{riff.meta}</Mono>
          </div>
          <Well as="blockquote">
            <Text>
              {riff.scrap.slice(0, at)}
              <Highlight>{riff.keyLine}</Highlight>
              {riff.scrap.slice(at + riff.keyLine.length)}
            </Text>
          </Well>
          <ul aria-label="Angles">
            {riff.angles.map((a, i) => (
              <li key={a.id}>
                {i > 0 ? <Rule /> : null}
                <AngleItem angle={a} isAction={i === 0} />
              </li>
            ))}
          </ul>
        </div>
      </Card>
    </>
  )
}

/**
 * Which action wins: underway beats open, open beats standing. Record and
 * the open riff's Draft share one page; one value decides which is the ink action.
 */
export function WhichActionWins() {
  const [recording, setRecording] = React.useState(false)
  const [drafted, setDrafted] = React.useState(false)
  const againRef = React.useRef<HTMLButtonElement>(null)
  const draftRef = React.useRef<HTMLButtonElement>(null)
  const moved = React.useRef<"again" | "draft" | null>(null)

  // 1. underway → its step; 2. an open item's step; 3. the standing step.
  const winner = recording ? "stop" : !drafted ? "draft" : "record"

  React.useEffect(() => {
    if (moved.current === "again") againRef.current?.focus()
    if (moved.current === "draft") draftRef.current?.focus()
    moved.current = null
  }, [drafted])

  return (
    <>
      <Card>
        <div className="flex flex-wrap items-center gap-kit-related">
          <Button
            variant={winner === "stop" || winner === "record" ? "action" : "quiet"}
            icon={recording ? StopIcon : Mic01Icon}
            onClick={() => setRecording((r) => !r)}
          >
            {recording ? "Stop" : "Record a thought"}
          </Button>
          {recording ? (
            <Text as="span" role="status">
              <LiveDot pulse>Recording</LiveDot>
            </Text>
          ) : (
            <Text variant="small" tone="muted">
              {winner === "record" ? "Nothing is open, so Record is the step." : "Quiet while a riff is open."}
            </Text>
          )}
        </div>
      </Card>
      <Card>
        <div className="flex flex-col gap-kit-related">
          <Text weight="strong" id="wins-hook">
            He read the pricing page three times and still asked what a seat was.
          </Text>
          <Arrive show={!drafted}>
            <div>
              <Button
                ref={draftRef}
                variant={winner === "draft" ? "action" : "quiet"}
                aria-describedby="wins-hook"
                onClick={() => {
                  moved.current = "again"
                  setDrafted(true)
                }}
              >
                Draft this
              </Button>
            </div>
          </Arrive>
          <Arrive show={drafted}>
            <div className="flex flex-wrap items-center gap-kit-related">
              <Text as="span" tone="muted">
                Drafted. Nothing goes out until you approve it.
              </Text>
              <Button
                ref={againRef}
                onClick={() => {
                  moved.current = "draft"
                  setDrafted(false)
                }}
              >
                Start over
              </Button>
            </div>
          </Arrive>
        </div>
      </Card>
    </>
  )
}

/** Incorrect: the repeated verb as the ink action on every item. */
export function EveryRowBlue() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text weight="strong">Seat pricing, in one call</Text>
        <div><Button variant="action">Draft this</Button></div>
        <Rule />
        <Text weight="strong">Why seats confuse buyers</Text>
        <div><Button variant="action">Draft this</Button></div>
      </div>
    </Card>
  )
}

/** Correct: the pick is the action; the same verb elsewhere is quiet. */
export function PickIsBlue() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text weight="strong">Seat pricing, in one call</Text>
        <div><Button variant="action">Draft this</Button></div>
        <Rule />
        <Text weight="strong">Why seats confuse buyers</Text>
        <div><Button>Draft this</Button></div>
      </div>
    </Card>
  )
}

/**
 * A reversible dismissal: a quiet Dismiss, the riff folds away (Arrive),
 * and the UndoBar arrives where it stood, on the Stage, with focus on Undo.
 * Undo puts the riff back and focus on its Dismiss. The delete-for-good is
 * a HoldButton at the other end of the row.
 */
export function DismissWithUndo() {
  const [dismissed, setDismissed] = React.useState(false)
  const dismissRef = React.useRef<HTMLButtonElement>(null)
  const restored = React.useRef(false)

  React.useEffect(() => {
    if (!dismissed && restored.current) {
      restored.current = false
      dismissRef.current?.focus()
    }
  }, [dismissed])

  return (
    <>
      <Arrive show={!dismissed}>
        <Card>
          <div className="flex flex-col gap-kit-related">
            <div className="flex flex-col gap-kit-tight">
              <Text weight="strong" id="dismiss-riff">
                The hire who asked for the worst call
              </Text>
              <Mono>Yesterday · typed note</Mono>
            </div>
            <Rule />
            <div className="flex flex-wrap items-center justify-between gap-kit-related">
              <Button ref={dismissRef} aria-describedby="dismiss-riff" onClick={() => setDismissed(true)}>
                Dismiss
              </Button>
              <HoldButton pendingLabel="Deleting…" onConfirm={() => new Promise((r) => setTimeout(r, 600))}>
                Delete the riff
              </HoldButton>
            </div>
          </div>
        </Card>
      </Arrive>
      <UndoBar
        show={dismissed}
        onUndo={() => {
          restored.current = true
          setDismissed(false)
        }}
      >
        Dismissed the typed note from yesterday.
      </UndoBar>
    </>
  )
}

/** Working: the dot pulses beside words that say what and how long. */
export function Working() {
  return (
    <Card>
      <Text as="div" role="status">
        <LiveDot pulse>Reading it. Angles usually land within a minute.</LiveDot>
      </Text>
    </Card>
  )
}

/** Incorrect: skeleton bars as a loading state. */
export function SkeletonAsLoading() {
  return (
    <Card>
      <SkeletonLines widths={["86%", "70%", "78%"]} />
    </Card>
  )
}

/** A refusal: an ink sentence where the action was, and the way out. */
export function Refusal() {
  return (
    <Card>
      <div role="status" className="flex flex-col gap-kit-related">
        <Text>
          I can’t draft for LinkedIn yet. <Muted>Connect it and I’ll write this one first.</Muted>
        </Text>
        <div>
          <ButtonLink href="#states">Connect LinkedIn</ButtonLink>
        </div>
      </div>
    </Card>
  )
}

/** Incorrect: a red banner for something that is not destructive. */
export function RedBanner() {
  return (
    <Card>
      <div className="rounded-kit-control bg-kit-danger-tint p-kit-recess">
        <Text as="span" weight="strong">
          <span className="text-kit-danger">Error: channel not connected.</span>
        </Text>
      </div>
    </Card>
  )
}

/** Links: TextLink inside a sentence, ButtonLink standing as a control. */
export function Links() {
  return (
    <Card>
      <div className="flex flex-col gap-kit-related">
        <Text tone="muted">
          From <TextLink href="#links">@ada’s post</TextLink>. The idea is borrowed; the angles are yours.
        </Text>
        <div className="flex flex-wrap items-center gap-kit-controls">
          <ButtonLink href="#links">Open Drafts</ButtonLink>
          <Button>Undo</Button>
        </div>
      </div>
    </Card>
  )
}

/** Incorrect: a Button rendering an anchor is announced as a button. */
export function ButtonAsAnchor() {
  return (
    <Card>
      <Button nativeButton={false} render={<a href="#links" />}>
        Open Drafts
      </Button>
    </Card>
  )
}

/** Correct: ButtonLink is a real link with the button look. */
export function RealLink() {
  return (
    <Card>
      <ButtonLink href="#links">Open Drafts</ButtonLink>
    </Card>
  )
}
