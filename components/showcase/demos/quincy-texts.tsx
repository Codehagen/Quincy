"use client"

/*
 * Quincy texts first: the agent reaches out in a few lines, and every note
 * ends in the person's choice.
 *
 * Story, in beats:
 * 1. Tue 07:40. "Morning. 3 ideas from yesterday's merged PR. The second has
 *    a number." The friend, as the sender, has just found them.
 * 2. The person picks "Draft the second". The chip presses, then fills in
 *    ink: the choice is theirs, and it stays on the record.
 * 3. Quincy types (three dots), then: Tue 07:52. "Draft's ready. Want it out
 *    at 8:30? It's held for your read." The friend waits.
 * 4. The person picks "Read it first".
 * 5. Quincy types, then: Wed 10:15. "Posted at 08:30. 1.6× your median."
 *    The friend squeezes its eyes shut, once, and is back to idle. The last
 *    note still offers two choices: it never ends on "done for you".
 *
 * Plays once when seen and holds the ending; nothing rewinds in view. The
 * first note is in the server HTML. The list is sized to its final frame,
 * so nothing below it moves while it plays. Reduced motion: the whole
 * thread at once, no typing dots, no movement.
 * No cursor: the system acts on its own, so the cause is the first line.
 */

import * as React from "react"

import { useInView, useReducedMotion } from "@/components/kit"
import { Friend, type MascotState } from "@/components/mascot"

export type QuincyMessage = {
  at: string
  text: string
  /** The person's choices. Every message ends in one. */
  choices: readonly string[]
  /** Which choice the person took, if the story shows it. */
  picked?: number
  /** The friend's state while this is the newest note. */
  state: MascotState
}

export const QUINCY_MESSAGES: readonly QuincyMessage[] = [
  {
    at: "Tue 07:40",
    text: "Morning. 3 ideas from yesterday’s merged PR. The second has a number.",
    choices: ["Draft the second", "Show all 3"],
    picked: 0,
    state: "found",
  },
  {
    at: "Tue 07:52",
    text: "Draft’s ready. Want it out at 8:30? It’s held for your read.",
    choices: ["Read it first", "Yes, 8:30", "Not today"],
    picked: 0,
    state: "waiting",
  },
  {
    at: "Wed 10:15",
    text: "Posted at 08:30. 1.6× your median.",
    choices: ["See the post", "Next idea"],
    state: "sent",
  },
]

/** One frame of the story. */
type Scene = {
  /** Quincy's notes on screen. */
  notes: number
  /** How many of those notes show the person's pick. */
  picks: number
  /** The note whose chip is being pressed. */
  pressing: number | null
  typing: boolean
}

/** The scenes in order, each with how long to hold the one before it. */
function script(messages: readonly QuincyMessage[], gapMs: number) {
  let s: Scene = { notes: 1, picks: 0, pressing: null, typing: false }
  const out: { scene: Scene; after: number }[] = [{ scene: s, after: 0 }]
  const go = (after: number, change: Partial<Scene>) => {
    s = { ...s, ...change }
    out.push({ scene: s, after })
  }
  messages.forEach((m, i) => {
    if (i > 0) {
      go(700, { typing: true })
      go(1600, { typing: false, notes: i + 1 })
    }
    if (m.picked === undefined) return
    // Reading time, the press, then the chip fills in ink
    go(gapMs, { pressing: i })
    go(160, { pressing: null, picks: i + 1 })
  })
  return out
}

/** The sender's avatar: the friend on an ink disc. */
function Sender({ state }: { state: MascotState }) {
  return (
    <span className="grid size-11 place-items-center rounded-full bg-kit-ink text-kit-ground">
      <Friend state={state} size={32} />
    </span>
  )
}

function Rows({
  messages,
  scene,
  ids,
}: {
  messages: readonly QuincyMessage[]
  scene: Scene
  ids?: { you: string }
}) {
  const newest = scene.notes - 1
  const out = messages.slice(0, scene.notes).map((m, i) => {
    const pickedOn = m.picked !== undefined && i < scene.picks
    return (
      <li key={m.at} data-row={m.at} className="flex flex-col gap-kit-related">
        <p data-part="fade" className="text-center font-kit-mono text-kit-mono text-kit-ink-muted">
          {m.at}
        </p>
        <div className="flex items-end gap-2.5">
          <span className="grid size-11 flex-none place-items-center" aria-hidden>
            {ids && i === newest && !scene.typing ? <Sender state={m.state} /> : null}
          </span>
          <p
            data-part="bubble"
            className="max-w-[min(26rem,100%)] origin-bottom-left rounded-[1.25rem] rounded-bl-md bg-kit-object px-4 py-2.5 text-[0.9375rem] leading-[1.45] text-kit-ink tabular-nums shadow-kit-object sm:text-base"
          >
            {m.text}
          </p>
        </div>
        <div data-part="fade" className="flex flex-wrap gap-kit-controls pl-[3.375rem]">
          {m.choices.map((c, j) => {
            const picked = pickedOn && j === m.picked
            const pressing = scene.pressing === i && j === m.picked
            return (
              <span
                key={c}
                data-picked={picked || undefined}
                data-pressing={pressing || undefined}
                aria-describedby={picked && ids ? ids.you : undefined}
                className="inline-flex h-8 items-center rounded-full bg-kit-object px-3.5 text-kit-small font-kit-strong text-kit-ink shadow-kit-control select-none transition-[background-color,color,scale] duration-(--kit-duration-press) ease-kit-out data-picked:bg-kit-ink data-picked:text-kit-ground data-pressing:scale-(--kit-press-scale) motion-reduce:transition-none"
              >
                {c}
              </span>
            )
          })}
        </div>
      </li>
    )
  })
  if (scene.typing) {
    out.push(
      <li key="typing" data-row="typing" aria-hidden className="flex items-end gap-2.5">
        <span className="grid size-11 flex-none place-items-center">
          <Sender state="writing" />
        </span>
        <span
          data-part="bubble"
          className="flex h-11 origin-bottom-left items-center gap-1.5 rounded-[1.25rem] rounded-bl-md bg-kit-object px-4 shadow-kit-object"
        >
          {[0, 160, 320].map((d) => (
            <i
              key={d}
              className="size-2 rounded-full bg-kit-ink-muted motion-safe:animate-pulse"
              style={{ animationDelay: `${d}ms`, animationDuration: "1.2s" }}
            />
          ))}
        </span>
      </li>,
    )
  }
  return out
}

const MOVE = { duration: 360, easing: "cubic-bezier(0.32, 0.72, 0, 1)" }
const ENTER = { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }

/**
 * The thread as text messages on a grey stage: Quincy's notes are white
 * objects on the left, the friend is the sender's avatar beside the newest
 * one only (one face on view), and the person's choice fills in ink.
 */
export function QuincyTexts({
  messages = QUINCY_MESSAGES,
  gapMs = 1500,
}: {
  messages?: readonly QuincyMessage[]
  gapMs?: number
}) {
  const beats = React.useMemo(() => script(messages, gapMs), [messages, gapMs])
  const [ref, seen] = useInView<HTMLDivElement>()
  const reduced = useReducedMotion()
  const [step, setStep] = React.useState(0)
  const listRef = React.useRef<HTMLOListElement>(null)
  // Where each row was on screen just before the scene changed (FLIP)
  const before = React.useRef<Map<string, number> | null>(null)
  const you = `${React.useId()}-you`

  const last = beats.length - 1
  const at = reduced ? last : step
  const scene = beats[at].scene

  React.useEffect(() => {
    if (!seen || reduced || step >= last) return
    const t = window.setTimeout(() => {
      const list = listRef.current
      if (list) {
        const tops = new Map<string, number>()
        for (const el of Array.from(list.children) as HTMLElement[]) {
          tops.set(el.dataset.row ?? "", el.getBoundingClientRect().top)
        }
        before.current = tops
      }
      setStep((s) => s + 1)
    }, beats[step + 1].after)
    return () => window.clearTimeout(t)
  }, [seen, reduced, step, last, beats])

  // Rows already there slide to their new place; a new row's bubble grows
  // out of its avatar corner while its stamp and chips fade in. Transform
  // and opacity only, through WAAPI.
  React.useLayoutEffect(() => {
    const list = listRef.current
    const was = before.current
    before.current = null
    if (!list || !was) return
    for (const el of Array.from(list.children) as HTMLElement[]) {
      const old = was.get(el.dataset.row ?? "")
      if (old === undefined) {
        el.querySelector<HTMLElement>('[data-part="bubble"]')?.animate(
          [
            { opacity: 0, transform: "scale(0.9)" },
            { opacity: 1, transform: "none" },
          ],
          ENTER,
        )
        el.querySelectorAll<HTMLElement>('[data-part="fade"]').forEach((f, k) =>
          f.animate([{ opacity: 0 }, { opacity: 1 }], { ...ENTER, delay: k * 120, fill: "backwards" }),
        )
        continue
      }
      for (const a of el.getAnimations()) if (a.id === "qt-move") a.cancel()
      const dy = old - el.getBoundingClientRect().top
      if (Math.abs(dy) < 0.5) continue
      const a = el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], MOVE)
      a.id = "qt-move"
    }
  }, [at])

  return (
    <div ref={ref} className="grid">
      {/* The final frame, invisible, holds the list at its full height */}
      <ol aria-hidden className="invisible col-start-1 row-start-1 flex select-none flex-col gap-kit-group">
        <Rows messages={messages} scene={beats[last].scene} />
      </ol>
      <ol
        ref={listRef}
        aria-label="Messages from Quincy"
        className="col-start-1 row-start-1 flex flex-col justify-end gap-kit-group"
      >
        <Rows messages={messages} scene={scene} ids={{ you }} />
      </ol>
      {/* Screen-reader context for the picked chip: `hidden` keeps it off
          the page and out of anything copied from it */}
      <span id={you} hidden>
        Your choice
      </span>
    </div>
  )
}
