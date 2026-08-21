"use client"

import * as React from "react"
import { useSearchParams } from "next/navigation"

import "../picker.css"
import { Shell } from "../shell"

import { Lineage } from "./variants/lineage"

/**
 * Lineage won; Ledger and Scoreboard are deleted. The harness stays so the
 * next round is one import and one line here.
 */
const VARIANTS = [{ name: "Lineage", render: () => <Lineage /> }]

export function Harness() {
  // Read through the router hook rather than syncing an effect off
  // location.search: the hook resolves on the server too, so the first paint
  // already carries the right variant and there is no setState-in-effect.
  const params = useSearchParams()
  const requested = parseInt(params.get("v") ?? "", 10)
  const [current, setCurrent] = React.useState(
    requested >= 1 && requested <= VARIANTS.length ? requested - 1 : 0
  )
  const [ready, setReady] = React.useState(false)

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

  // Two frames, so the highlight takes its initial position without sliding
  // in from zero on load.
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
  }, [])

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
    }

    document.addEventListener("keydown", onKey)
    return () => document.removeEventListener("keydown", onKey)
  }, [current, select])

  return (
    <>
      <Shell>
        {/* Keyed on the variant so switching remounts and any local state
            inside it resets. The swap itself is instant — flipping is a
            high-frequency action and an animation on it would tax every
            comparison. */}
        <div key={current}>{VARIANTS[current].render()}</div>
      </Shell>

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
      </nav>
    </>
  )
}
