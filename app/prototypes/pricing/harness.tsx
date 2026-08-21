"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import "../picker.css"

import { Chrome } from "./chrome"
import { Ledger } from "./variants/ledger"
import { SequenceLedger } from "./variants/sequence-ledger"
import { YouAndIt } from "./variants/you-and-it"
import { DayOne } from "./variants/day-one"

/**
 * Round two. Ledger and the timeline both landed, so this round is three ways
 * of putting them together — and Ledger stays in position one as the baseline,
 * unchanged, because a merge you cannot compare against the thing it merged is
 * not a comparison.
 *
 * What changed between rounds is the *content* of the track, not the track.
 * Round one walked the five states an account moves through. These walk the
 * five things a person does: connect, import, correct, hand it material,
 * approve.
 *
 * That order is the flow's, and it corrects an earlier draft that opened with
 * "write down how you sound". You never describe yourself to Quincy — you
 * connect an account, `lib/corpus-x.ts` reads what you already published, and
 * `lib/voice.ts` writes the description. Your job is to correct it, and
 * `lib/voice.ts:240` then treats what you corrected as untouchable. The
 * reversal is the strongest thing these three have to sell, and `data.ts`
 * carries the full derivation.
 *
 * Statement and The day from round one are still on disk, one import and one
 * line from returning.
 *
 * The picker chrome is `PICKER.md` verbatim. It is not a design decision and
 * never adapts to the project. The variant swap stays instant; only the
 * highlight slides. The replay control is rendered because three of these four
 * walk a track on press, and `R` remounts so the walk can be watched again
 * from rest without a reload.
 */
const VARIANTS = [
  { name: "Ledger", render: () => <Ledger /> },
  { name: "Sequence", render: () => <SequenceLedger /> },
  { name: "You and it", render: () => <YouAndIt /> },
  { name: "Day one", render: () => <DayOne /> },
]

export function Harness() {
  // The router hook rather than an effect off location.search: it resolves on
  // the server too, so the first paint already carries the right variant.
  const params = useSearchParams()
  const requested = parseInt(params.get("v") ?? "", 10)
  const [current, setCurrent] = React.useState(
    requested >= 1 && requested <= VARIANTS.length ? requested - 1 : 0
  )
  const [ready, setReady] = React.useState(false)
  const [run, setRun] = React.useState(0)

  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  const [highlight, setHighlight] = React.useState({ left: 0, width: 0 })

  const measure = React.useCallback(() => {
    const el = itemRefs.current[current]
    if (!el) return
    setHighlight({ left: el.offsetLeft, width: el.offsetWidth })
  }, [current])

  React.useLayoutEffect(() => {
    measure()
  }, [measure])

  React.useEffect(() => {
    window.addEventListener("resize", measure)
    return () => window.removeEventListener("resize", measure)
  }, [measure])

  // Two frames, so the highlight takes its initial position without sliding in
  // from zero on load.
  React.useEffect(() => {
    const id = requestAnimationFrame(() =>
      requestAnimationFrame(() => setReady(true))
    )
    return () => cancelAnimationFrame(id)
  }, [])

  const select = React.useCallback((i: number) => {
    if (i < 0 || i >= VARIANTS.length) return
    setCurrent(i)
    const url = new URL(location.href)
    url.searchParams.set("v", String(i + 1))
    history.replaceState(null, "", url)
    // These are three whole pages of different lengths. Landing on Ledger at
    // Statement's scroll position would be comparing scroll offsets.
    window.scrollTo({ top: 0, behavior: "instant" })
  }, [])

  const replay = React.useCallback(() => setRun((n) => n + 1), [])

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null
      if (
        t &&
        (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)
      ) {
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return

      const num = parseInt(e.key, 10)
      if (num >= 1 && num <= VARIANTS.length) select(num - 1)
      else if (e.key === "ArrowRight") select((current + 1) % VARIANTS.length)
      else if (e.key === "ArrowLeft")
        select((current - 1 + VARIANTS.length) % VARIANTS.length)
      else if (e.key === "r" || e.key === "R") replay()
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [current, select, replay])

  return (
    <>
      {/* Keyed on the variant so switching remounts and no state carries over.
          The swap itself is instant — flipping is a high-frequency action and
          an animation on it would tax every comparison. */}
      <Chrome key={`${current}-${run}`}>{VARIANTS[current].render()}</Chrome>

      <nav
        className="proto-picker"
        aria-label="Prototype variants"
        {...(ready ? { "data-ready": "" } : {})}
      >
        <span
          className="proto-picker-highlight"
          aria-hidden="true"
          style={{
            width: highlight.width,
            transform: `translateX(${highlight.left}px)`,
          }}
        />
        {VARIANTS.map((v, i) => (
          <button
            key={v.name}
            ref={(el) => {
              itemRefs.current[i] = el
            }}
            className="proto-picker-item"
            onClick={() => select(i)}
            {...(i === current
              ? { "data-active": "", "aria-current": "true" as const }
              : {})}
          >
            {v.name}
          </button>
        ))}
        {/* Only the variant buttons are measured for the highlight, so the
            replay control renders outside that map and never lands in
            `itemRefs`. */}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={replay}
        >
          ↻
        </button>
      </nav>
    </>
  )
}
