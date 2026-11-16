"use client"

import * as React from "react"

import type { DraftAngleResult } from "@/lib/angle-draft"
import { CHANNELS_FOR_SHAPE, type Angle, type Riff } from "@/lib/riffs"
import {
  Arrive,
  Button,
  ButtonLink,
  Card,
  Highlight,
  LiveDot,
  MarginNote,
  Muted,
  Rule,
  Tab,
  TabList,
  TabPanel,
  Tabs,
  Tag,
  Tags,
  Text,
  Well,
} from "@/components/kit"

import { ProvenanceMark } from "./provenance-mark"

/* ── Data the card derives, exported so a list and the card agree ───────── */

/**
 * Quincy's reading of the scrap for one angle: the sentence the angle stands
 * on, and what Quincy would write in the margin about it.
 *
 * **Not on `Angle` yet** (a data gap, docs/design/quincy-riffs.md). The
 * generator does not return the sentence, so a caller that has it passes it
 * here; without it the card shows the scrap unmarked, which is honest.
 */
export type AngleReading = {
  /** A sentence of `riff.scrap`, verbatim. Highlighted while its angle is open. */
  line: string
  /** The margin note beside the scrap, ≤ 6 words, lower case. */
  note?: string
}

/** The refusals `draftAngle` can answer with (`DraftAngleResult`, lib/angle-draft.ts). */
export type DraftRefusal = Extract<DraftAngleResult, { ok: false }>

/**
 * The angle Quincy starts with: the lowest-positioned angle nobody has
 * drafted. The same rule `WaitingRiffPick.hook` states in
 * lib/waiting-work.ts, so the Studio greeting and the card offer the same one.
 */
export function pickAngle(riff: Pick<Riff, "angles">): Angle | undefined {
  return riff.angles.find((a) => a.status !== "drafted")
}

/**
 * The riff's name in a list row. Decided 2026-11-15 (quincy-riffs.md):
 *
 * 1. **The first angle's hook**, when the riff has angles. It is a sentence
 *    written to be a first line, so it is short, specific and says what the
 *    riff is for. Always angle 0, drafted or not, so the row keeps its name
 *    while the person works through it.
 * 2. **The scrap's first sentence**, while the riff is still being read or
 *    failed: the person's own words, stripped of a leading "…" and clipped.
 * 3. **"New voice note"**, when there are no words yet (a take still being
 *    transcribed).
 *
 * Not the scrap's first sentence always (the guess in kit-test): a spoken
 * take opens with filler ("…so, the deploy thing.") far more often than with
 * the point.
 */
export function riffTitle(riff: Pick<Riff, "angles" | "scrap" | "sourceLabel">): string {
  const hook = riff.angles[0]?.hook.trim()
  if (hook) return hook
  const first = firstSentence(riff.scrap)
  if (first) return first
  const label = riff.sourceLabel.trim()
  if (!label) return "New note"
  return COMMON_SOURCE.has(label.toLowerCase()) ? `New ${label.toLowerCase()}` : `New from ${label}`
}

const TITLE_MAX = 120

function firstSentence(text: string): string {
  const clean = text.trim().replace(/^[.…,\-–—\s]+/, "")
  if (!clean) return ""
  const sentence = clean.match(/^[\s\S]+?[.?!](?=\s|$)/)?.[0] ?? clean
  if (sentence.length <= TITLE_MAX) return sentence
  const cut = sentence.lastIndexOf(" ", TITLE_MAX - 1)
  return `${sentence.slice(0, cut > 0 ? cut : TITLE_MAX - 1)}…`
}

/**
 * Source labels that name a kind of material, not a vendor, so they read in
 * lower case after "your": "your voice note", but "Slack", "GitHub".
 */
const COMMON_SOURCE = new Set([
  "voice note",
  "voice notes",
  "meeting",
  "pull request",
  "email",
  "photos",
  "pasted",
  "pasted post",
  "note",
])

/** The material, named mid-sentence: "your voice note", "Slack", "what you wrote". */
export function sourcePhrase(label: string): string {
  const clean = label.trim()
  if (!clean) return "what you wrote"
  const lower = clean.toLowerCase()
  if (lower === "pasted") return "what you pasted"
  return COMMON_SOURCE.has(lower) ? `your ${lower}` : clean
}

/**
 * The UndoBar's sentence after a Dismiss: "Dismissed the ideas from your
 * voice note (today)." Past tense, names the thing (actions.md); the word
 * "riff" never reaches the person. `capturedAt` is `formatConversationDate`
 * output: Today, Yesterday, 3 days ago, 26 Aug.
 */
export function dismissedSentence(riff: Pick<Riff, "sourceLabel" | "capturedAt">): string {
  const day = /^(Today|Yesterday)$/.test(riff.capturedAt)
    ? riff.capturedAt.toLowerCase()
    : riff.capturedAt
  return `Dismissed the ideas from ${sourcePhrase(riff.sourceLabel)} (${day}).`
}

/**
 * "3 ideas from your voice note". The person never reads the word "riff":
 * the material is named by its source, and an angle is an idea.
 */
export function ideasFrom(riff: Pick<Riff, "angles" | "sourceLabel">): string {
  const n = riff.angles.length
  return `${n === 1 ? "One idea" : `${n} ideas`} from ${sourcePhrase(riff.sourceLabel)}.`
}

/** "X and LinkedIn": a sentence about the item, not a Tag (type.md). */
function destinations(angle: Angle): string {
  const labels = (CHANNELS_FOR_SHAPE[angle.shape] ?? []).map((c) => c.label)
  if (labels.length <= 1) return labels.join("")
  return `${labels.slice(0, -1).join(", ")} and ${labels.at(-1)}`
}

/**
 * What Draft this idea will do, beside it: where it goes, and how many posts
 * that is when the page knows (a short post for two channels is written
 * twice, and nothing else says so).
 */
function writesSentence(angle: Angle, writes: number | undefined): string {
  const where = destinations(angle)
  if (writes === undefined) return where ? `For ${where}.` : ""
  if (writes === 0) return "No channel for this yet."
  const posts = `Writes ${writes === 1 ? "one post" : `${writes} posts`}`
  return where ? `${posts}, for ${where}.` : `${posts}.`
}

/* ── AngleTabs ─────────────────────────────────────────────────────────── */

/** Kinds that run past a tab's 12 characters, said shorter. */
const SHORT_KIND: Record<string, string> = { "Behind the scenes": "Backstage" }

/**
 * One tab label per angle: its kind, when every angle has one; else "Idea 1",
 * "Idea 2". A repeated kind is numbered ("Story", "Story 2"), so two tabs
 * never read the same.
 */
export function angleTabLabels(angles: readonly Pick<Angle, "id" | "kind">[]): string[] {
  const kinds = angles.map((a) => SHORT_KIND[a.kind] ?? a.kind)
  if (kinds.some((k) => !k || k.length > 12)) return angles.map((_, i) => `Idea ${i + 1}`)
  const seen = new Map<string, number>()
  return kinds.map((k) => {
    const n = (seen.get(k) ?? 0) + 1
    seen.set(k, n)
    return n === 1 ? k : `${k} ${n}`
  })
}

export type AngleTabsProps = {
  angles: readonly Angle[]
  /** The open angle's id. Controlled: the card moves the highlighter with it. */
  value: string
  onValueChange: (id: string) => void
  /** The panel for one angle. Only the open one is rendered. */
  children: (angle: Angle) => React.ReactNode
}

/**
 * The angles of one riff as tabs (lab 22): picking one swaps the panel below
 * and moves the highlighter in the scrap to the sentence it stands on. Tabs,
 * not Segmented, because picking changes what is shown (controls.md). One
 * angle has no tabs; the panel stands alone.
 */
export function AngleTabs({ angles, value, onValueChange, children }: AngleTabsProps) {
  const labels = angleTabLabels(angles)
  const open = angles.find((a) => a.id === value) ?? angles[0]
  if (!open) return null
  if (angles.length === 1) return <div className="flex flex-col gap-kit-related">{children(open)}</div>

  return (
    <Tabs value={open.id} onValueChange={onValueChange}>
      <TabList aria-label="Ideas">
        {angles.map((a, i) => (
          <Tab key={a.id} value={a.id}>
            {labels[i]!}
          </Tab>
        ))}
      </TabList>
      {angles.map((a) => (
        <TabPanel key={a.id} value={a.id}>
          {a.id === open.id ? <div className="flex flex-col gap-kit-related">{children(a)}</div> : null}
        </TabPanel>
      ))}
    </Tabs>
  )
}

/* ── RiffCard ──────────────────────────────────────────────────────────── */

export type RiffCardProps = {
  /** The riff, as `listRiffs` reads it (`Riff`, lib/riffs.ts). */
  riff: Riff
  /** Quincy's reading per angle id. A data gap today; see `AngleReading`. */
  readings?: Partial<Record<Angle["id"], AngleReading>>
  /**
   * Whether the open angle's Draft this is the page's one action right now
   * (actions.md, "Which action wins"). The page decides; the card never does.
   */
  isAction?: boolean
  /** `draftAngle` from app/(app)/ideas/actions.ts, or a stand-in with its result. */
  onDraft: (angle: Angle) => Promise<DraftAngleResult>
  /**
   * The riff leaves the page and stays in the table. The page folds the card
   * away and shows an UndoBar with `dismissedSentence(riff)`.
   */
  onDismiss: (riff: Riff) => void
  /** A failed riff's way out. Without it, the failure stands alone. */
  onRetry?: (riff: Riff) => void
  /** After the source and day: a take's length, a PR number. Not on `Riff` yet. */
  meta?: string
  /** For `useRevealOnNarrow` in a list and detail. */
  ref?: React.Ref<HTMLDivElement>
  /**
   * How many posts Draft this idea writes, per shape, for this account
   * (`writesPerShape`, lib/drafting.ts). With it the panel says "Writes 2
   * posts, for X and LinkedIn." and "No channel for this yet." at 0; without
   * it, only where the idea goes.
   */
  writes?: Partial<Record<Angle["shape"], number>>
  /**
   * The open idea's own quiet controls, at the far end of its Draft row (the
   * Ideas page puts "Not this one" here). They leave with the row when the
   * idea is drafted or refused. Called for the open idea only.
   */
  angleExtra?: (angle: Angle) => React.ReactNode
  /**
   * The page's tools for the whole riff, under the ideas and above the Rule
   * (asking for another idea, a channel nothing reaches). Pass it only for a
   * ready riff.
   */
  children?: React.ReactNode
}

/**
 * One riff, open: where it came from, what the person said (a Well, with the
 * one sentence the open angle stands on highlighted), the angles Quincy found
 * as tabs, and the one verb, Draft this. Dismiss sits under a Rule, away from
 * it. Key it by the riff (`key={riff.id}`) so local state resets per riff.
 */
export function RiffCard({
  riff,
  readings,
  isAction = false,
  onDraft,
  onDismiss,
  onRetry,
  meta,
  ref,
  writes,
  angleExtra,
  children,
}: RiffCardProps) {
  const titleId = React.useId()
  const pick = pickAngle(riff)
  const [openId, setOpenId] = React.useState(() => pick?.id ?? riff.angles[0]?.id ?? "")
  const open = riff.angles.find((a) => a.id === openId) ?? pick ?? riff.angles[0]
  const reading = open ? readings?.[open.id] : undefined
  const anyDrafted = riff.angles.some((a) => a.status === "drafted")
  const allDrafted = riff.angles.length > 0 && !pick

  return (
    <Card ref={ref} width="with-margin" role="region" aria-labelledby={titleId}>
      <div className="flex flex-col gap-kit-group">
        <div className="flex flex-col gap-kit-tight">
          <Text as="h2" weight="strong" id={titleId}>
            {riffTitle(riff)}
          </Text>
          <ProvenanceMark riff={riff} meta={meta} />
        </div>

        {riff.scrap ? <Scrap scrap={riff.scrap} reading={reading} /> : null}

        {riff.state === "working" ? (
          <Text as="div" role="status">
            <LiveDot pulse>
              {riff.stuck
                ? "Still reading it. This one is taking longer than usual."
                : "Reading it. Ideas usually land within a minute."}
            </LiveDot>
          </Text>
        ) : riff.state === "failed" ? (
          <div role="status" className="flex flex-col gap-kit-related">
            <Text>
              I couldn&apos;t find a post in this one.
              {riff.failure ? (
                <>
                  {" "}
                  <Muted>{riff.failure}</Muted>
                </>
              ) : null}
            </Text>
            {onRetry ? (
              <div>
                <Button onClick={() => onRetry(riff)}>Try again</Button>
              </div>
            ) : null}
          </div>
        ) : riff.angles.length === 0 ? (
          <Text tone="muted">Nothing left on this one.</Text>
        ) : (
          <div className="flex flex-col gap-kit-related">
            <Text variant="small" tone="muted">
              {allDrafted
                ? "Every idea here is drafted."
                : ideasFrom(riff)}
            </Text>
            <AngleTabs angles={riff.angles} value={open?.id ?? ""} onValueChange={setOpenId}>
              {(angle) => (
                <AnglePanel
                  key={angle.id}
                  angle={angle}
                  isAction={isAction}
                  onDraft={onDraft}
                  writes={writes?.[angle.shape]}
                  extra={angleExtra?.(angle)}
                />
              )}
            </AngleTabs>
          </div>
        )}

        {children != null ? <div className="flex flex-col gap-kit-related">{children}</div> : null}
      </div>

      <Rule />
      <div>
        <Button aria-describedby={titleId} onClick={() => onDismiss(riff)}>
          {anyDrafted ? "Dismiss the rest" : "Dismiss"}
        </Button>
      </div>
    </Card>
  )
}

/* ── The scrap, with the open angle's sentence highlighted ─────────────── */

/** Past this, the scrap shows the passage around the sentence, not all of it. */
const SCRAP_LONG = 600
const SCRAP_AROUND = 220

function Scrap({ scrap, reading }: { scrap: string; reading: AngleReading | undefined }) {
  const [whole, setWhole] = React.useState(false)
  const at = reading ? scrap.indexOf(reading.line) : -1
  const long = scrap.length > SCRAP_LONG
  const passage = !whole && long ? around(scrap, at) : { from: 0, to: scrap.length }
  const shown = scrap.slice(passage.from, passage.to)
  const hit = at >= passage.from && reading && at + reading.line.length <= passage.to ? at - passage.from : -1

  const words =
    hit >= 0 && reading ? (
      <>
        {shown.slice(0, hit)}
        <Highlight>{reading.line}</Highlight>
        {shown.slice(hit + reading.line.length)}
      </>
    ) : (
      shown
    )

  const well = (
    <Well as="blockquote">
      <Text>
        {passage.from > 0 ? "…" : ""}
        {words}
        {passage.to < scrap.length ? "…" : ""}
      </Text>
    </Well>
  )

  return (
    <div className="flex flex-col gap-kit-related">
      {/* Keyed by the sentence, so a tab swap sweeps the new line in and the
          note writes in after it, instead of the old ones jumping. */}
      <React.Fragment key={reading?.line ?? ""}>
        {reading?.note && hit >= 0 ? (
          <MarginNote note={reading.note} timing="after-highlight">
            {well}
          </MarginNote>
        ) : (
          well
        )}
      </React.Fragment>
      {long ? (
        <div>
          <Button aria-expanded={whole} onClick={() => setWhole((w) => !w)}>
            {whole ? "Show less" : "Show all of it"}
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/** The passage around `at`, cut at word boundaries; the opening when there is no hit. */
function around(text: string, at: number): { from: number; to: number } {
  if (at < 0) return { from: 0, to: wordEnd(text, SCRAP_LONG) }
  const from = at - SCRAP_AROUND <= 0 ? 0 : wordStart(text, at - SCRAP_AROUND)
  const to = wordEnd(text, at + SCRAP_AROUND * 2)
  return { from, to }
}

function wordStart(text: string, i: number) {
  const space = text.indexOf(" ", i)
  return space < 0 ? i : space + 1
}

function wordEnd(text: string, i: number) {
  if (i >= text.length) return text.length
  const space = text.lastIndexOf(" ", i)
  return space <= 0 ? i : space
}

/* ── One angle's panel ─────────────────────────────────────────────────── */

function AnglePanel({
  angle,
  isAction,
  onDraft,
  writes,
  extra,
}: {
  angle: Angle
  isAction: boolean
  onDraft: (angle: Angle) => Promise<DraftAngleResult>
  writes?: number
  extra?: React.ReactNode
}) {
  const hookId = React.useId()
  const drafted = angle.status === "drafted"
  // Pending from the press until the angle comes back drafted: between the
  // action's answer and the page's refresh, a second press would draft twice.
  const [pending, setPending] = React.useState(false)
  // A refusal from the action, or a throw (the request never came back),
  // which has no reason and so no way out but Try again.
  const [refusal, setRefusal] = React.useState<
    Pick<DraftRefusal, "message"> & { reason?: DraftRefusal["reason"] } | null
  >(null)
  const openRef = React.useRef<HTMLAnchorElement>(null)
  const pressed = React.useRef(false)

  // Draft → Open Drafts: the pressed button goes inert inside a closing
  // Arrive, so focus moves to its counterpart (motion.md, "Focus").
  React.useEffect(() => {
    if (drafted && pressed.current) {
      pressed.current = false
      openRef.current?.focus()
    }
  }, [drafted])

  const draft = async () => {
    pressed.current = true
    setRefusal(null)
    setPending(true)
    try {
      const result = await onDraft(angle)
      if (!result.ok) {
        pressed.current = false
        setRefusal(result)
        setPending(false)
      }
    } catch {
      pressed.current = false
      setRefusal({ message: "That didn't go through. Nothing was drafted." })
      setPending(false)
    }
  }

  return (
    <>
      <div className="flex flex-col gap-kit-tight">
        <Text weight="strong" id={hookId}>
          {angle.hook}
        </Text>
        <Tags>
          {angle.kind ? <Tag>{angle.kind}</Tag> : null}
          <Tag>{angle.shape}</Tag>
        </Tags>
      </div>
      {angle.why ? (
        <Text variant="small" tone="muted">
          {angle.why}
        </Text>
      ) : null}

      {/* One wrapper for the three outcomes, so the closed ones cost no gap
          in the panel's column: only one is ever open, and an Arrive
          collapses to nothing only when its parent adds no gap around it. */}
      <div className="flex flex-col">
        <Arrive show={!drafted && !refusal}>
          {/* Draft and the idea's own controls ("Not this one") share the
              first line at every width; the sentence about what Draft writes
              sits between them from 40rem and drops under them on a phone,
              so the controls never wrap one under the other. */}
          <div className="flex flex-wrap items-center gap-x-kit-related gap-y-kit-tight">
            <Button
              variant={isAction ? "action" : "quiet"}
              aria-describedby={hookId}
              pending={pending && !drafted}
              pendingLabel="Drafting…"
              onClick={draft}
            >
              Draft this idea
            </Button>
            <span className="order-last basis-full sm:order-none sm:min-w-0 sm:flex-1 sm:basis-0">
              <Text variant="small" tone="muted">
                {writesSentence(angle, writes)}
              </Text>
            </span>
            {extra != null ? (
              // Away from Draft, at the row's far end.
              <div className="ml-auto flex flex-wrap items-center justify-end gap-kit-controls">{extra}</div>
            ) : null}
          </div>
        </Arrive>
        <Arrive show={refusal != null}>
          {refusal ? (
            <div role="status" className="flex flex-col gap-kit-related">
              <Text>{refusal.message}</Text>
              <div className="flex flex-wrap gap-kit-controls">
                {refusal.reason === "entitlement" ? (
                  <ButtonLink href="/settings/billing">See plans</ButtonLink>
                ) : refusal.reason === "no-channel" ? (
                  <ButtonLink href="/channels">Connect a channel</ButtonLink>
                ) : null}
                <Button onClick={draft}>Try again</Button>
              </div>
            </div>
          ) : null}
        </Arrive>

        <Arrive show={drafted}>
          <div className="flex flex-wrap items-center gap-kit-related">
            <Text variant="small" tone="muted">
              {angle.fellBack
                ? "Drafted, but only the hook came out. Write the rest in Drafts."
                : "Drafted. It waits in Drafts until you approve it."}
            </Text>
            <ButtonLink ref={openRef} href="/drafts">
              Open Drafts
            </ButtonLink>
          </div>
        </Arrive>
      </div>
    </>
  )
}
