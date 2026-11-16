"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { parseAsString, useQueryState } from "nuqs"

import { archiveRiff, discardAngle, draftAngle } from "@/app/(app)/ideas/actions"
import type { Angle, Riff } from "@/lib/riffs"
import {
  Button,
  ButtonLink,
  Card,
  Count,
  EmptyState,
  KitPage,
  List,
  ListHeading,
  ListRow,
  LiveDot,
  Stage,
  STAGE_STACK,
  Text,
  UndoBar,
  useReducedMotion,
  useRevealOnNarrow,
} from "@/components/kit"
import { Friend } from "@/components/mascot"
import { RiffCard, dismissedSentence, pickAngle, riffTitle } from "@/components/quincy"

import { AdaptBox } from "./adapt-box"
import { ChannelGaps } from "./channel-gap"
import { RecordBox } from "./record-box"
import { RiffsRefresh } from "./riffs-refresh"
import { Steer } from "./steer"

/**
 * /ideas, shown as Ideas: say what happened, then work what came back.
 *
 * **Capture is the page; the queue is what came back** (decided at
 * /prototypes/riffs on 2026-08-08: the live problem was input, not the size
 * of the queue). So the recorder stands first, in its own Stage, and the
 * ideas follow as list and detail (docs/design/page.md): the riffs as
 * ListRows grouped by the day they came in, the open one under them as a
 * RiffCard (`@/components/quincy`). On the kit since 2026-11-16.
 *
 * **The screen renders KitPage**, because the summary counts the ideas still
 * waiting and that changes with every Draft and Dismiss.
 *
 * **Wide, the list and the open riff stand side by side** (KitPage
 * `width="wide"`, docs/design/page.md "Wide"). From a stage of
 * `--container-kit-split` (66rem) the Ideas Stage becomes two columns: the
 * list in a 24rem column (`--container-kit-list`) that sticks and scrolls on
 * its own, and the RiffCard in the rest. Under it, today's single column,
 * unchanged. The layout is CSS (a container query on the Stage), so the
 * first paint is already right; only where the UndoBar stands is decided in
 * script (`useSplit`), and the UndoBar is never showing on load.
 *
 * **Which button is the action** is decided once, here (actions.md): words
 * typed into "Ask for a different idea" first, then the open riff's pick
 * (Draft this idea), then Record a thought.
 *
 * **Dismiss can be undone, so the archive waits for the Undo to leave.**
 * `archiveRiff` overwrites the riff's state and there is no action that puts
 * it back, so Dismiss hides the riff here and the write goes out when the
 * UndoBar leaves: the person's next action on the page, a second Dismiss,
 * seven quiet seconds (`UNDO_MS`), leaving the page, or closing the tab. Undo
 * before then costs nothing, because nothing was written. Closing the tab goes
 * through a keepalive fetch to /api/riffs/archive rather than the server
 * action, because the browser may cancel an ordinary request as the page dies.
 */

/** How long a Dismiss can be undone before the archive goes out on its own. */
const UNDO_MS = 7000

/**
 * The stage width the two columns start at, in rem, when the CSS variable
 * cannot be read. `--container-kit-split` in app/globals.css is the source.
 */
const SPLIT_FALLBACK_REM = 66

/**
 * Whether the Stage is wide enough for list and detail side by side: the
 * same test as the `@kit-split/kit-stage` container variant, measured on the
 * same box (the Stage's content box), against the same variable. Used only
 * to decide where the UndoBar stands; the columns themselves are CSS.
 */
function useSplit(ref: React.RefObject<HTMLElement | null>): boolean {
  const [split, setSplit] = React.useState(false)
  React.useEffect(() => {
    const el = ref.current
    if (!el || typeof ResizeObserver === "undefined") return
    const root = getComputedStyle(document.documentElement)
    const rem = parseFloat(root.fontSize) || 16
    const at =
      (parseFloat(root.getPropertyValue("--container-kit-split")) || SPLIT_FALLBACK_REM) * rem
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setSplit(entry.contentRect.width >= at)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [ref])
  return split
}

/** Rows before the open riff (page.md: at most 6). */
const ROW_CAP = 6

const rowId = (riffId: string) => `idea-row-${riffId}`

/** Ideas still waiting on a decision: an angle not drafted yet. */
function waitingIdeas(riff: Riff) {
  return riff.state === "ready" ? riff.angles.filter((a) => a.status !== "drafted").length : 0
}

/** Still a question for the person: being read, failed, or an idea waiting. */
function isWaiting(riff: Riff) {
  return riff.state !== "ready" || waitingIdeas(riff) > 0
}

/**
 * Group by the day string the server already rendered (`capturedAt`, from
 * `formatConversationDate`, bucketed in the person's own zone). A second date
 * computation could put a riff labelled "Yesterday" under "Today".
 */
function groupByDay(riffs: Riff[]): [string, Riff[]][] {
  const groups = new Map<string, Riff[]>()
  for (const riff of riffs) {
    const list = groups.get(riff.capturedAt) ?? []
    list.push(riff)
    groups.set(riff.capturedAt, list)
  }
  return [...groups.entries()]
}

/** The row's second line: what state the riff is in, by its source. */
function rowDescription(riff: Riff): string {
  const from = riff.sourceLabel || "Written here"
  if (riff.state === "working") return riff.stuck ? `${from} · taking longer than usual` : `${from} · reading it now`
  if (riff.state === "failed") return `${from} · I couldn't find a post in it`
  if (riff.angles.length === 0) return `${from} · nothing left on it`
  const waiting = waitingIdeas(riff)
  if (waiting === 0) return `${from} · every idea drafted`
  return `${from} · ${waiting === 1 ? "one idea" : `${waiting} ideas`}`
}

export function IdeasScreen({
  riffs: fromServer,
  gaps,
  writes,
}: {
  riffs: Riff[]
  /** Channels each riff reaches none of, by riff id (`channelGaps`, on the server). */
  gaps: Record<string, { id: string; label: string }[]>
  /** How many posts each shape writes for this account (`writesPerShape`). */
  writes: Record<Angle["shape"], number>
}) {
  const router = useRouter()

  /** Riffs dismissed here: hidden at once, archived when the Undo leaves. */
  const [gone, setGone] = React.useState<ReadonlySet<string>>(() => new Set())
  const [undo, setUndo] = React.useState<Riff | null>(null)
  const [steering, setSteering] = React.useState(false)
  const [showAll, setShowAll] = React.useState(false)
  /** A deferred archive that did not go through: the riff is back, and why. */
  const [refused, setRefused] = React.useState<string | null>(null)
  const [openParam, setOpenParam] = useQueryState("idea", parseAsString)
  const focusRow = React.useRef<string | null>(null)

  const riffs = fromServer.filter((r) => !gone.has(r.id))
  const open =
    riffs.find((r) => r.id === openParam) ?? riffs.find(isWaiting) ?? riffs[0] ?? null
  const openKey = open?.id ?? ""

  const detailRef = useRevealOnNarrow<HTMLDivElement>(open?.id)
  const stageRef = React.useRef<HTMLElement>(null)
  const split = useSplit(stageRef)
  const reduced = useReducedMotion()

  // Wide, the list sticks while the detail scrolls with the page, so a row
  // picked while reading far down a long riff opens one whose top is above
  // the fold. Bring that top back, as useRevealOnNarrow does on a phone.
  // Compared, not counted, so it never scrolls on load.
  const seenWide = React.useRef(openKey)
  React.useEffect(() => {
    if (seenWide.current === openKey) return
    seenWide.current = openKey
    const el = detailRef.current
    if (!split || !el || el.getBoundingClientRect().top >= 0) return
    el.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" })
  }, [openKey, split, reduced, detailRef])

  const select = React.useCallback(
    (id: string) => {
      void setOpenParam(id)
    },
    [setOpenParam]
  )

  // A restored or newly selected row takes focus back (page.md).
  React.useEffect(() => {
    const id = focusRow.current
    if (!id) return
    focusRow.current = null
    document.getElementById(rowId(id))?.focus({ preventScroll: true })
  }, [openKey])

  /** The archive itself. A failure brings the riff back and re-reads. */
  const commit = React.useCallback(
    (riff: Riff) => {
      archiveRiff({ riffId: riff.id })
        .then((result) => {
          if (!result.ok) throw new Error(result.message)
          router.refresh()
        })
        .catch((error) => {
          console.error(error)
          setRefused(`Couldn't dismiss "${riffTitle(riff)}". It's back in the list.`)
          setGone((current) => {
            const next = new Set(current)
            next.delete(riff.id)
            return next
          })
          router.refresh()
        })
    },
    [router]
  )

  /**
   * The dismissed riff whose archive has not gone out yet. A ref beside the
   * `undo` state, set only in handlers, so the write happens exactly once
   * (a state updater with a side effect runs twice under StrictMode).
   */
  const pendingUndo = React.useRef<Riff | null>(null)
  /** The UNDO_MS timer for the pending archive, so Undo and the next action can stop it. */
  const undoTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const stopUndoTimer = React.useCallback(() => {
    if (undoTimer.current != null) clearTimeout(undoTimer.current)
    undoTimer.current = null
  }, [])

  /** Called at the top of every other handler: the Undo leaves on the next action. */
  const clearUndo = React.useCallback(() => {
    stopUndoTimer()
    const riff = pendingUndo.current
    pendingUndo.current = null
    if (riff) commit(riff)
    setUndo(null)
  }, [commit, stopUndoTimer])

  // Leaving the page is the last moment to write it. A route change within the
  // app unmounts this screen with the page still alive, so the server action
  // is safe there; a closing tab is not, so pagehide uses a keepalive fetch.
  React.useEffect(() => {
    const onPageHide = () => {
      const riff = pendingUndo.current
      if (!riff) return
      pendingUndo.current = null
      if (undoTimer.current != null) clearTimeout(undoTimer.current)
      undoTimer.current = null
      void fetch("/api/riffs/archive", {
        method: "POST",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ riffId: riff.id }),
      }).catch(() => {})
    }
    window.addEventListener("pagehide", onPageHide)
    return () => {
      window.removeEventListener("pagehide", onPageHide)
      if (undoTimer.current != null) clearTimeout(undoTimer.current)
      undoTimer.current = null
      const riff = pendingUndo.current
      if (!riff) return
      pendingUndo.current = null
      void archiveRiff({ riffId: riff.id }).catch(() => {})
    }
  }, [])

  const dismiss = (riff: Riff) => {
    // One Undo per page: a second Dismiss writes the first.
    stopUndoTimer()
    if (pendingUndo.current) commit(pendingUndo.current)
    pendingUndo.current = riff
    setRefused(null)
    undoTimer.current = setTimeout(() => {
      undoTimer.current = null
      if (pendingUndo.current?.id !== riff.id) return
      clearUndo()
    }, UNDO_MS)
    const at = riffs.findIndex((r) => r.id === riff.id)
    const rest = riffs.filter((r) => r.id !== riff.id)
    setGone((current) => new Set(current).add(riff.id))
    setUndo(riff)
    // The next riff down takes its place, so you can keep working the queue.
    const next = rest.slice(Math.max(at, 0)).find(isWaiting) ?? rest.find(isWaiting) ?? rest[0]
    if (next) select(next.id)
    else void setOpenParam(null)
  }

  const restore = () => {
    if (!undo) return
    const riff = undo
    stopUndoTimer()
    pendingUndo.current = null
    setUndo(null)
    setGone((current) => {
      const next = new Set(current)
      next.delete(riff.id)
      return next
    })
    focusRow.current = riff.id
    select(riff.id)
  }

  const draft = async (angle: Angle) => {
    clearUndo()
    const result = await draftAngle({ angleId: angle.id })
    // The angle comes back drafted on the re-read; RiffCard stays pending
    // until it does, so a second press cannot draft twice.
    if (result.ok) router.refresh()
    return result
  }

  const captured = React.useCallback(
    (riffId: string) => {
      setShowAll(false)
      select(riffId)
    },
    [select]
  )

  /* ── Which button is the action (actions.md) ── */
  const pickWaiting = open != null && open.state === "ready" && pickAngle(open) != null
  const pickIsAction = !steering && pickWaiting
  const recordIsAction = !steering && !pickIsAction

  const waiting = riffs.reduce((n, r) => n + waitingIdeas(r), 0)
  const summary =
    riffs.length === 0 ? undefined : waiting === 0 ? (
      "Nothing is waiting on you."
    ) : (
      <>
        <Count value={waiting} /> {waiting === 1 ? "idea" : "ideas"} waiting on you.
      </>
    )

  // At most ROW_CAP rows, and the open one is always among them.
  const capped = !showAll && riffs.length > ROW_CAP
  let visible = capped ? riffs.slice(0, ROW_CAP) : riffs
  if (capped && open && !visible.includes(open)) {
    visible = [...visible.slice(0, ROW_CAP - 1), open]
  }
  const hidden = riffs.length - visible.length

  /**
   * A refusal, then the UndoBar. Under the list and the open riff in one
   * column; under the list alone when the two stand side by side, so the
   * Undo stays beside the row that folded away (page.md, "Wide").
   */
  const notices = (
    <>
      {/* Ink, not red: a refusal is not destruction (docs/design/states.md). */}
      {refused ? (
        <Text role="alert" variant="small">
          {refused}
        </Text>
      ) : null}

      <UndoBar show={undo != null} width={riffs.length === 0 ? "full" : "with-margin"} onUndo={restore}>
        {undo ? dismissedSentence(undo) : null}
      </UndoBar>
    </>
  )

  return (
    <KitPage title="Ideas" summary={summary} width="wide">
      {/* Only mounts a timer while something is being read. */}
      <RiffsRefresh active={riffs.some((r) => r.state === "working")} />

      <Stage
        aria-label="Say what happened"
        lead="Say what happened."
        rest="However it comes out. I read through the false starts and find the posts in it."
      >
        <Card>
          <div className="flex flex-wrap items-center gap-kit-controls">
            <RecordBox isAction={recordIsAction} onOpen={clearUndo} onCaptured={captured} />
            <AdaptBox onOpen={clearUndo} onCaptured={captured} />
          </div>
          <div className="mt-kit-related">
            <Text variant="small" tone="muted">
              You hear the take back before anything is sent. Or paste a post you
              saw, and I find what you could take from it.
            </Text>
          </div>
        </Card>
      </Stage>

      <Stage
        ref={stageRef}
        aria-label="Ideas"
        {...(riffs.length > 0
          ? waiting > 0
            ? { lead: "This is what came back.", rest: "Open one to see the ideas I found in it, and why." }
            : { lead: "Everything here is decided.", rest: "Dismiss what you are done with, or say something new." }
          : {})}
      >
        {riffs.length === 0 ? (
          <EmptyState
            media={<Friend size={40} state="idle" className="text-kit-ink" />}
            bold="Nothing to work on yet."
            rest="Say a half-thought above, or add a source and I'll bring you the material: your merges, your meetings, the posts you save."
          >
            <ButtonLink href="/sources">Add a source</ButtonLink>
          </EmptyState>
        ) : (
          /* One column, 14 apart, as the Stage stacks them; from a stage of
             --container-kit-split, two. Each column is then a kit-stage
             container of its own, so the list (384, under 32rem) drops the
             margin column and the RiffCard (≥ 640) keeps it. */
          <div className="flex flex-col gap-kit-stack self-stretch @kit-split/kit-stage:grid @kit-split/kit-stage:grid-cols-[var(--container-kit-list)_minmax(0,1fr)] @kit-split/kit-stage:items-start @kit-split/kit-stage:gap-x-kit-page-gutter">
            {/* The list column. Wide, it sticks under the top of the page
                and, past the window's height, scrolls inside itself; the
                UndoBar and a refusal stand under the list, outside the
                scroll, so they are never scrolled away. */}
            <div className={`${STAGE_STACK} @kit-split/kit-stage:sticky @kit-split/kit-stage:top-kit-group @kit-split/kit-stage:max-h-[calc(100svh-2*var(--spacing-kit-group))] @kit-split/kit-stage:[container:kit-stage/inline-size]`}>
              {/* The scroll. The 12px pad, given back by a negative margin,
                  keeps the list's ring and shadow from being clipped. */}
              <div className="self-stretch @kit-split/kit-stage:-m-kit-related @kit-split/kit-stage:min-h-0 @kit-split/kit-stage:overflow-y-auto @kit-split/kit-stage:overscroll-contain @kit-split/kit-stage:p-kit-related">
                <List width="with-margin" aria-label="Ideas">
                  {groupByDay(visible).map(([day, dayRiffs]) => (
                    <React.Fragment key={day}>
                      <ListHeading>{day}</ListHeading>
                      {dayRiffs.map((r) => (
                        <ListRow
                          key={r.id}
                          id={rowId(r.id)}
                          selected={r.id === openKey}
                          titleLines={2}
                          leading={r.state === "working" ? <LiveDot pulse /> : undefined}
                          description={rowDescription(r)}
                          onClick={() => {
                            clearUndo()
                            select(r.id)
                          }}
                        >
                          {riffTitle(r)}
                        </ListRow>
                      ))}
                    </React.Fragment>
                  ))}
                  {hidden > 0 ? (
                    <ListRow
                      onClick={() => {
                        clearUndo()
                        setShowAll(true)
                      }}
                    >
                      Show {hidden} more
                    </ListRow>
                  ) : null}
                </List>
              </div>
              {split ? notices : null}
            </div>

            {open ? (
              <div className="min-w-0 @kit-split/kit-stage:[container:kit-stage/inline-size]">
                <RiffCard
                  key={open.id}
                  ref={detailRef}
                  riff={open}
                  isAction={pickIsAction}
                  writes={writes}
                  onDraft={draft}
                  onDismiss={dismiss}
                  angleExtra={(angle) =>
                    angle.status === "drafted" ? null : (
                      <NotThisOne angle={angle} onStart={clearUndo} />
                    )
                  }
                >
                  {open.state === "ready" && open.angles.length > 0 ? (
                    <>
                      <ChannelGaps riffId={open.id} gaps={gaps[open.id] ?? []} onAsk={clearUndo} />
                      <Steer
                        riffId={open.id}
                        onTypingChange={setSteering}
                        onAsk={clearUndo}
                      />
                    </>
                  ) : null}
                </RiffCard>
              </div>
            ) : null}
          </div>
        )}

        {split && riffs.length > 0 ? null : notices}
      </Stage>
    </KitPage>
  )
}

/**
 * Drop one idea. Deleted, not archived (`discardAngle`): an idea is Quincy's
 * suggestion about the material, not the material, and Ask for a different
 * idea makes another. Nothing of yours is lost, so it is the plain control
 * (removing.md), quiet and after Draft.
 */
function NotThisOne({ angle, onStart }: { angle: Angle; onStart: () => void }) {
  const router = useRouter()
  const [pending, startTransition] = React.useTransition()
  const [failure, setFailure] = React.useState<string | null>(null)
  const hookId = React.useId()

  return (
    <>
      <span id={hookId} hidden>
        {angle.hook}
      </span>
      <Button
        aria-describedby={hookId}
        pending={pending}
        pendingLabel="Dropping…"
        onClick={() => {
          onStart()
          setFailure(null)
          startTransition(async () => {
            try {
              const result = await discardAngle({ angleId: angle.id })
              if (!result.ok) {
                setFailure(result.message)
                return
              }
              router.refresh()
            } catch {
              setFailure("That didn't go through. Try again.")
            }
          })
        }}
      >
        Not this one
      </Button>
      {failure ? (
        <span role="status">
          <Text variant="small" as="span">
            {failure}
          </Text>
        </span>
      ) : null}
    </>
  )
}
