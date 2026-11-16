"use client"

import * as React from "react"
import Link from "next/link"

import {
  Arrive,
  Button,
  Card,
  Count,
  KitRoot,
  Lead,
  ListRow,
  LiveDot,
  Mono,
  Stage,
  Text,
} from "@/components/kit"

import { readTake } from "./actions"
import { MEDIAN_DECIDED_PER_WEEK, NEW_TAKES, type AngleStatus, type Riff } from "./data"
import { Recorder } from "./recorder"
import { RiffDetail } from "./riff-detail"

/** Still a question for the person: an open angle, or a riff to deal with. */
function isWaiting(r: Riff) {
  return r.state !== "ready" || r.angles.some((a) => a.status === "open")
}

/** Dismissed angles stay (with Undo) while their riff is open, then go. */
function purgeDismissed(r: Riff): Riff {
  return { ...r, angles: r.angles.filter((a) => a.status !== "dismissed") }
}

function clock(s: number) {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
}

/**
 * Mounts hidden and arrives on the next frame. Arrive only animates a change
 * of `show`, so content that mounts because of an action needs one frame at
 * `show={false}` first (the same trick as lab 31's Fresh).
 */
function Appear({ children }: { children: React.ReactNode }) {
  const [show, setShow] = React.useState(false)
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setShow(true))
    return () => cancelAnimationFrame(raf)
  }, [])
  return <Arrive show={show}>{children}</Arrive>
}

export function RiffsScreen({ initial }: { initial: Riff[] }) {
  const [riffs, setRiffs] = React.useState(initial)
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => initial.find(isWaiting)?.id ?? null,
  )
  const [undoRiff, setUndoRiff] = React.useState<{ riff: Riff; index: number } | null>(null)
  const takes = React.useRef(0)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const focusRow = React.useRef<string | null>(null)

  const listed = riffs.filter((r) => isWaiting(r) || r.id === selectedId)
  const selected = riffs.find((r) => r.id === selectedId) ?? null
  const openAngles = riffs.reduce(
    (n, r) => n + r.angles.filter((a) => a.status === "open").length,
    0,
  )

  React.useEffect(() => {
    if (undoRiff) undoRef.current?.focus()
  }, [undoRiff])

  React.useEffect(() => {
    const id = focusRow.current
    if (!id) return
    focusRow.current = null
    document.getElementById(`row-${id}`)?.focus()
  }, [selectedId])

  const select = (id: string) => {
    setRiffs((rs) => rs.map((r) => (r.id === selectedId ? purgeDismissed(r) : r)))
    setSelectedId(id)
  }

  const setAngleStatus = (riffId: string, angleId: string, status: AngleStatus) => {
    setRiffs((rs) =>
      rs.map((r) =>
        r.id === riffId
          ? { ...r, angles: r.angles.map((a) => (a.id === angleId ? { ...a, status } : a)) }
          : r,
      ),
    )
  }

  const kept = React.useCallback((seconds: number) => {
    const n = takes.current++
    const take = NEW_TAKES[n % NEW_TAKES.length]!
    const id = `take-${n}`
    const riff: Riff = {
      id,
      scrap: "",
      sourceLabel: "Voice note",
      sourceMeta: clock(seconds),
      capturedAt: "Today",
      state: "working",
      failure: "",
      adaptedFrom: null,
      angles: [],
    }
    setRiffs((rs) => [riff, ...rs])
    setSelectedId(id)
    setUndoRiff(null)
    void readTake(take).then((t) => {
      setRiffs((rs) =>
        rs.map((r) =>
          r.id === id
            ? {
                ...r,
                ...t,
                state: "ready",
                angles: t.angles.map((a) => ({ ...a, id: `${id}-${a.id}` })),
              }
            : r,
        ),
      )
    })
  }, [])

  const dismissRiff = (riff: Riff) => {
    const index = riffs.findIndex((r) => r.id === riff.id)
    const rest = riffs.filter((r) => r.id !== riff.id)
    setRiffs(rest)
    setUndoRiff({ riff, index })
    // The next riff down takes its place, so you can keep working the queue.
    const next = rest.slice(index).find(isWaiting) ?? rest.find(isWaiting)
    setSelectedId(next?.id ?? null)
  }

  const undoDismiss = () => {
    if (!undoRiff) return
    const { riff, index } = undoRiff
    setRiffs((rs) => [...rs.slice(0, index), riff, ...rs.slice(index)])
    focusRow.current = riff.id
    setSelectedId(riff.id)
    setUndoRiff(null)
  }

  return (
    <KitRoot>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 pt-10 pb-24 sm:px-8">
        <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <Text as="h1" weight="strong">
            Riffs
          </Text>
          {openAngles > 0 ? (
            <Text as="p" variant="small" tone="muted">
              <Count value={openAngles} /> {openAngles === 1 ? "angle" : "angles"} waiting.
              Your usual week clears {MEDIAN_DECIDED_PER_WEEK}.
            </Text>
          ) : null}
        </header>

        <Recorder isAction={listed.length === 0} onKept={kept} />

        <Stage
          aria-label="What came back"
          {...(listed.length > 0
            ? {
                lead: "This is what came back.",
                rest: "Open one to see the angles I found in it, and why.",
              }
            : {})}
        >
          {undoRiff ? (
            <Appear key={undoRiff.riff.id}>
              <div className="flex flex-wrap items-center gap-3">
                <Text as="span">
                  Dismissed the {undoRiff.riff.sourceLabel.toLowerCase()} from{" "}
                  {undoRiff.riff.capturedAt === "Today" || undoRiff.riff.capturedAt === "Yesterday"
                    ? undoRiff.riff.capturedAt.toLowerCase()
                    : undoRiff.riff.capturedAt}
                  .
                </Text>
                <Button ref={undoRef} onClick={undoDismiss}>
                  Undo
                </Button>
              </div>
            </Appear>
          ) : null}

          {listed.length === 0 ? (
            <Card>
              <Lead
                bold="Nothing is waiting on you."
                rest="Say a half-thought above and I'll find the angles in it. Or connect a source, and I'll bring you the material."
              />
              <div className="mt-4">
                <Button nativeButton={false} render={<Link href="/sources" />}>
                  Connect a source
                </Button>
              </div>
            </Card>
          ) : (
            <>
              <Card inset="none">
                <ul className="flex flex-col p-1.5" aria-label="Riffs waiting">
                  {listed.map((r) => {
                    const row = <RiffRow riff={r} selected={r.id === selectedId} onOpen={() => select(r.id)} />
                    return (
                      <li key={r.id}>
                        {r.id.startsWith("take-") ? <Appear>{row}</Appear> : row}
                      </li>
                    )
                  })}
                </ul>
              </Card>
              {selected ? (
                <RiffDetail
                  key={selected.id}
                  riff={selected}
                  onAngleStatus={(angleId, status) => setAngleStatus(selected.id, angleId, status)}
                  onDismissRiff={() => dismissRiff(selected)}
                />
              ) : null}
            </>
          )}
        </Stage>
      </main>
    </KitRoot>
  )
}

function RiffRow({
  riff,
  selected,
  onOpen,
}: {
  riff: Riff
  selected: boolean
  onOpen: () => void
}) {
  const open = riff.angles.filter((a) => a.status === "open")
  const first = open.find((a) => a.pick) ?? open[0]

  const title =
    riff.state === "working"
      ? `${riff.sourceLabel}, ${riff.sourceMeta ?? ""}`
      : riff.state === "failed"
        ? riff.scrap
        : (first?.hook ?? riff.angles[0]?.hook ?? riff.scrap)

  const description =
    riff.state === "working"
      ? "Reading it now"
      : riff.state === "failed"
        ? `${riff.sourceLabel} · I could not find a post in it`
        : open.length === 0
          ? `${riff.sourceLabel} · everything here is decided`
          : `${riff.sourceLabel} · ${open.length} ${open.length === 1 ? "angle" : "angles"}`

  return (
    <ListRow
      id={`row-${riff.id}`}
      selected={selected}
      onClick={onOpen}
      leading={riff.state === "working" ? <LiveDot pulse /> : undefined}
      description={description}
      meta={<Mono>{riff.capturedAt}</Mono>}
    >
      {title}
    </ListRow>
  )
}
