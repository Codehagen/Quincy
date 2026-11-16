"use client"

import * as React from "react"

import {
  Arrive,
  ButtonLink,
  Card,
  Count,
  KitPage,
  LiveDot,
  ListRow,
  Mono,
  Lead,
  NavRow,
  Stage,
} from "@/components/kit"

import { BASELINE, CANNED_TRANSCRIPT, cannedAngles, type Angle, type Riff } from "./data"
import { MAX_SECONDS, Recorder, type RecorderPhase, type Take } from "./recorder"
import { RiffDetail, UndoBar, type Refusal } from "./riff-detail"
import { archiveRiff, draftAngle, READING_MS, sendToQuincy } from "./stubs"

/** layout.md: at most 6 rows before the detail; more is its own page. */
const MAX_ROWS = 6

type Row = Riff & { leaving?: boolean }

const nowMs = () => Date.now()

/** The angles still a question: what the page summary counts. */
function openAngles(riffs: Row[]) {
  return riffs
    .filter((r) => !r.leaving && r.state === "ready")
    .reduce((n, r) => n + r.angles.filter((a) => a.status !== "drafted").length, 0)
}

function rowTitle(riff: Riff) {
  if (!riff.scrap) return `New ${riff.sourceLabel.toLowerCase()}`
  const first = riff.scrap.split(/(?<=[.?!])\s/)[0] ?? riff.scrap
  return first
}

function rowDescription(riff: Riff) {
  if (riff.state === "working") return "Reading it"
  if (riff.state === "failed") return "I couldn't find a post in it"
  const waiting = riff.angles.filter((a) => a.status !== "drafted").length
  if (waiting === 0) return `${riff.sourceLabel} · all drafted`
  return `${riff.sourceLabel} · ${waiting} ${waiting === 1 ? "angle" : "angles"} waiting`
}

/** The pick's Draft can be the action only while it is still a step to take. */
function pickAvailable(riff: Riff | undefined, refusals: Record<string, Refusal>) {
  if (!riff || riff.state !== "ready" || !riff.pickId) return false
  const pick = riff.angles.find((a) => a.id === riff.pickId)
  return Boolean(pick && pick.status !== "drafted" && !refusals[pick.id])
}

export function RiffsScreen({ initialRiffs }: { initialRiffs: Riff[] }) {
  const [riffs, setRiffs] = React.useState<Row[]>(initialRiffs)
  // Open Quincy's first ready riff on load: the open row is selected
  // (layout.md), and a list with nothing open has no Draft to offer.
  const [selectedId, setSelectedId] = React.useState<string | null>(
    () => initialRiffs.find((r) => r.state === "ready")?.id ?? null,
  )
  const [refusals, setRefusals] = React.useState<Record<string, Refusal>>({})
  const [undo, setUndo] = React.useState<{ riff: Riff; index: number } | null>(null)
  // Rows that mount because of something the person did animate in; rows
  // that were there on load do not (motion.md, `appear`).
  const [arrived, setArrived] = React.useState<ReadonlySet<string>>(() => new Set())

  // Capture state, lifted so a tab swap mid-recording keeps the take.
  const [mode, setMode] = React.useState<"say" | "write">("say")
  const [phase, setPhase] = React.useState<RecorderPhase>("idle")
  const [elapsed, setElapsed] = React.useState(0)
  const [take, setTake] = React.useState<Take | null>(null)
  const [text, setText] = React.useState("")
  const [textError, setTextError] = React.useState<string | undefined>()
  const [writePending, setWritePending] = React.useState(false)

  const toggleRef = React.useRef<HTMLButtonElement>(null)
  const sendRef = React.useRef<HTMLButtonElement>(null)
  const undoRef = React.useRef<HTMLButtonElement>(null)
  const detailRef = React.useRef<HTMLDivElement>(null)
  const startedAt = React.useRef(0)
  const focusAfter = React.useRef<"toggle" | "send" | null>(null)
  const focusRowId = React.useRef<string | null>(null)
  const scrollToDetail = React.useRef(false)

  const visible = riffs.filter((r) => !r.leaving)
  const selected = visible.find((r) => r.id === selectedId)
  const open = openAngles(riffs)

  // One action per page (actions.md). Whatever the person is in the middle
  // of holds it: a take being recorded or reviewed, written words being
  // sent. Otherwise an open riff's pick does, and failing that, Record.
  const captureBusy = phase !== "idle" || writePending || text.trim() !== ""
  const pickIsAction = !captureBusy && pickAvailable(selected, refusals)
  const recorderIsAction = !pickIsAction

  // The clock while recording. A clock, not motion: it says how long.
  React.useEffect(() => {
    if (phase !== "recording") return
    const id = setInterval(() => {
      const seconds = Math.floor((nowMs() - startedAt.current) / 1000)
      setElapsed(Math.min(seconds, MAX_SECONDS))
      if (seconds >= MAX_SECONDS) {
        setTake({ name: "thought.m4a", seconds: MAX_SECONDS })
        focusAfter.current = "send"
        setPhase("review")
      }
    }, 250)
    return () => clearInterval(id)
  }, [phase])

  // Focus follows the control that replaced the pressed one.
  React.useEffect(() => {
    const target = focusAfter.current
    if (!target) return
    focusAfter.current = null
    if (target === "send") sendRef.current?.focus()
    else toggleRef.current?.focus()
  }, [phase, mode])

  React.useEffect(() => {
    if (undo) undoRef.current?.focus()
  }, [undo])

  React.useEffect(() => {
    const id = focusRowId.current
    if (!id) return
    focusRowId.current = null
    document.querySelector<HTMLElement>(`[data-riff-row="${CSS.escape(id)}"]`)?.focus()
  }, [riffs, selectedId])

  // On a stage under 32rem the detail sits below the fold: bring its top
  // into view without moving focus (layout.md, "List and detail").
  React.useEffect(() => {
    if (!scrollToDetail.current) return
    scrollToDetail.current = false
    const card = detailRef.current
    const stage = card?.closest('[data-slot="kit-stage"]')
    if (card && stage && stage.getBoundingClientRect().width < 512) {
      card.scrollIntoView({ block: "nearest" })
    }
  }, [selectedId])

  /** "It stays until the next action on the page" (actions.md). */
  const clearUndo = () => setUndo(null)

  const pick = (id: string) => {
    clearUndo()
    scrollToDetail.current = true
    setSelectedId(id)
  }

  const startRecording = () => {
    clearUndo()
    startedAt.current = nowMs()
    setElapsed(0)
    setTake(null)
    setMode("say")
    focusAfter.current = "toggle"
    setPhase("recording")
  }

  const onToggle = () => {
    if (phase === "recording") {
      const seconds = Math.max(1, Math.floor((nowMs() - startedAt.current) / 1000))
      setTake({ name: "thought.m4a", seconds })
      focusAfter.current = "send"
      setPhase("review")
    } else {
      startRecording()
    }
  }

  /** A new riff joins the top of the list, opens, and is read. */
  const addRiff = (riff: Riff) => {
    setRiffs((rs) => [riff, ...rs])
    setArrived((s) => new Set(s).add(riff.id))
    setSelectedId(riff.id)
    setTimeout(() => {
      const canned = cannedAngles(riff.id)
      setRiffs((rs) =>
        rs.map((r) =>
          r.id === riff.id
            ? { ...r, state: "ready", scrap: r.scrap || CANNED_TRANSCRIPT, ...canned }
            : r,
        ),
      )
    }, READING_MS)
  }

  const onSend = async () => {
    if (!take) return
    clearUndo()
    setPhase("sending")
    await sendToQuincy()
    const id = `r-new-${nowMs()}`
    addRiff({
      id,
      sourceLabel: "Voice note",
      sourcePhrase: "the voice note",
      capturedAt: "Today",
      capturedPhrase: "today",
      duration: `${Math.floor(take.seconds / 60)}:${String(take.seconds % 60).padStart(2, "0")}`,
      scrap: "",
      state: "working",
      failure: "",
      adaptedFrom: null,
      angles: [],
    })
    setTake(null)
    focusAfter.current = "toggle"
    setPhase("idle")
  }

  const onThrowAway = () => {
    setTake(null)
    focusAfter.current = "toggle"
    setPhase("idle")
  }

  const onWriteSubmit = async () => {
    const words = text.trim()
    if (!words) {
      setTextError("Write a sentence first. That is enough for me to start.")
      return
    }
    clearUndo()
    setWritePending(true)
    await sendToQuincy()
    addRiff({
      id: `r-new-${nowMs()}`,
      sourceLabel: "Written here",
      sourcePhrase: "the note you wrote",
      capturedAt: "Today",
      capturedPhrase: "today",
      scrap: words,
      state: "working",
      failure: "",
      adaptedFrom: null,
      angles: [],
    })
    setText("")
    setWritePending(false)
  }

  const onDraft = async (riff: Riff, angle: Angle) => {
    clearUndo()
    setRefusals((r) => {
      const next = { ...r }
      delete next[angle.id]
      return next
    })
    const result = await draftAngle(angle)
    if (!result.ok) {
      setRefusals((r) => ({
        ...r,
        [angle.id]: { message: result.message, fix: result.fix, channel: result.channel },
      }))
      return
    }
    setRiffs((rs) =>
      rs.map((r) =>
        r.id === riff.id
          ? {
              ...r,
              angles: r.angles.map((a) => (a.id === angle.id ? { ...a, status: "drafted" } : a)),
            }
          : r,
      ),
    )
  }

  const onDismiss = (riff: Riff) => {
    const index = riffs.findIndex((r) => r.id === riff.id)
    setRiffs((rs) => rs.map((r) => (r.id === riff.id ? { ...r, leaving: true } : r)))
    setSelectedId(null)
    setUndo({ riff, index })
    void archiveRiff()
  }

  const onUndo = () => {
    if (!undo) return
    const { riff, index } = undo
    setRiffs((rs) => {
      if (rs.some((r) => r.id === riff.id)) {
        // Still folding away: flip it back and the Arrive retargets.
        return rs.map((r) => (r.id === riff.id ? { ...r, leaving: false } : r))
      }
      const next = [...rs]
      next.splice(Math.min(index, next.length), 0, riff)
      return next
    })
    setArrived((s) => new Set(s).add(riff.id))
    setSelectedId(riff.id)
    focusRowId.current = riff.id
    setUndo(null)
  }

  const purge = (id: string) => setRiffs((rs) => rs.filter((r) => r.id !== id || !r.leaving))

  // Rows beyond the cap move to their own page; leaving rows stay mounted
  // until their fold ends.
  const capped = new Set(visible.slice(0, MAX_ROWS).map((r) => r.id))
  const rows = riffs.filter((r) => r.leaving || capped.has(r.id))
  const overflow = visible.length - MAX_ROWS

  return (
    <KitPage
      title="Riffs"
      summary={
        <>
          <Count value={open} /> {open === 1 ? "angle" : "angles"} waiting. Your usual week clears{" "}
          {BASELINE.anglesClearedPerWeek}.
        </>
      }
    >
      <Stage lead="Say what happened." rest="However it comes out. I read through the false starts.">
        <Recorder
          mode={mode}
          onModeChange={(m) => {
            clearUndo()
            setMode(m)
          }}
          phase={phase}
          elapsed={elapsed}
          take={take}
          isAction={recorderIsAction}
          onToggle={onToggle}
          onSend={onSend}
          onRecordAgain={startRecording}
          onThrowAway={onThrowAway}
          toggleRef={toggleRef}
          sendRef={sendRef}
          text={text}
          onTextChange={(v) => {
            setText(v)
            setTextError(undefined)
          }}
          textError={textError}
          writePending={writePending}
          onWriteSubmit={onWriteSubmit}
        />
      </Stage>

      {/* One Stage either way, so the Undo below keeps its place (and its
          focus) when dismissing the last riff turns the list into the empty
          state. */}
      <Stage
        lead={rows.length === 0 ? undefined : "This is what came back."}
        rest={
          rows.length === 0
            ? undefined
            : "Open one and I'll draft it in your voice. Nothing goes out until you approve it."
        }
      >
        {rows.length === 0 ? (
          <Card>
            <Lead
              bold="Nothing is waiting on you."
              rest="Say a half-thought above and I'll find the angles in it."
            />
            <div className="pt-kit-related">
              <ButtonLink href="/sources">Connect a source</ButtonLink>
            </div>
          </Card>
        ) : (
          <Card inset="none" width="with-margin">
            <div className="flex flex-col p-1.5">
              {rows.map((riff) => (
                <Arrive
                  key={riff.id}
                  show={!riff.leaving}
                  appear={arrived.has(riff.id)}
                  onExitComplete={() => purge(riff.id)}
                >
                  <ListRow
                    data-riff-row={riff.id}
                    selected={riff.id === selectedId}
                    titleLines={2}
                    description={rowDescription(riff)}
                    leading={riff.state === "working" ? <LiveDot pulse /> : undefined}
                    meta={<Mono>{riff.capturedAt}</Mono>}
                    onClick={() => pick(riff.id)}
                  >
                    {rowTitle(riff)}
                  </ListRow>
                </Arrive>
              ))}
              {overflow > 0 ? (
                <NavRow href="/ideas" count={visible.length}>
                  All riffs
                </NavRow>
              ) : null}
            </div>
          </Card>
        )}

        {selected ? (
          <RiffDetail
            key={selected.id}
            ref={detailRef}
            riff={selected}
            pickIsAction={pickIsAction}
            refusals={refusals}
            onDraft={onDraft}
            onDismiss={onDismiss}
            onRecordAgain={startRecording}
          />
        ) : null}

        <UndoSlot undo={undo} onUndo={onUndo} undoRef={undoRef} />
      </Stage>
    </KitPage>
  )
}

function UndoSlot({
  undo,
  onUndo,
  undoRef,
}: {
  undo: { riff: Riff } | null
  onUndo: () => void
  undoRef: React.Ref<HTMLButtonElement>
}) {
  // Arrive sits in the Stage's `items-start` column, which would shrink it
  // to its content; the wrapper lets the Card take the list's width.
  return (
    <div className="self-stretch">
      <Arrive show={undo != null} appear>
        {undo ? <UndoBar ref={undoRef} riff={undo.riff} onUndo={onUndo} /> : null}
      </Arrive>
    </div>
  )
}
