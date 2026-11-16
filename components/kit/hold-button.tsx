"use client"

import * as React from "react"
import { Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { BUTTON_BASE, BUTTON_SIZE } from "./control-styles"
import { PendingAnnouncer, StableLabel } from "./stable-label"

/** AGENTS.md: 1200ms is calibrated. Not a prop, so no call site drifts. */
const HOLD_MS = 1200
const SNAP_BACK_MS = 200

// The impure clock, read only from event and rAF callbacks, never during
// render. A named function keeps the body clean for the purity lint.
const nowMs = () => performance.now()

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export type HoldButtonProps = {
  /** The action, as on a danger Button: "Dismiss the riff". */
  children: string
  /** May be async and may throw: a throw returns the button to idle for a retry. */
  onConfirm: () => void | Promise<void>
  /** What the label says while `onConfirm` runs ("Dismissing…"). Announced. */
  pendingLabel?: string
  /** What it says once confirmed. Default "Done". */
  doneLabel?: string
  disabled?: boolean
  "aria-describedby"?: string
  ref?: React.Ref<HTMLButtonElement>
}

/**
 * A destructive action you hold for 1.2s; letting go cancels. The kit's
 * port of components/hold-to-confirm.tsx: the same behaviour, the kit's
 * look (the quiet control with a danger label, as `Button variant="danger"`,
 * and a danger-tint fill that sweeps across while it is held).
 *
 * Four things are load-bearing (AGENTS.md); leave them alone:
 * - progress runs on requestAnimationFrame, not a CSS transition, which
 *   reduced motion would collapse to zero and fire on touch;
 * - the hold resumes from where the fill is (`start = now − p × hold`);
 * - `touchAction: "none"`, so a pan cannot steal a hold;
 * - Space and Enter hold and release, and blur releases.
 */
export function HoldButton({
  children,
  onConfirm,
  pendingLabel,
  doneLabel = "Done",
  disabled = false,
  ref,
  ...props
}: HoldButtonProps) {
  const btnRef = React.useRef<HTMLButtonElement | null>(null)
  const raf = React.useRef(0)
  const holding = React.useRef(false)
  const startT = React.useRef(0)
  const lastP = React.useRef(0)
  const settled = React.useRef(false)
  const [phase, setPhase] = React.useState<"idle" | "confirming" | "done">("idle")

  const setRefs = (node: HTMLButtonElement | null) => {
    btnRef.current = node
    if (typeof ref === "function") ref(node)
    else if (ref) ref.current = node
  }

  const setP = (p: number) => {
    lastP.current = p
    const el = btnRef.current
    if (el) {
      el.style.setProperty("--p", p.toFixed(4))
      el.dataset.charging = p > 0 && p < 1 ? "true" : "false"
    }
  }

  const stopRaf = () => {
    if (raf.current) cancelAnimationFrame(raf.current)
    raf.current = 0
  }

  // A pending frame must not outlive the component: completing after an
  // unmount would act without intent.
  React.useEffect(() => () => stopRaf(), [])

  const complete = async () => {
    stopRaf()
    holding.current = false
    settled.current = true
    // A keyboard hold leaves focus on the button. It is never natively
    // disabled while confirming, so focus stays; if something still moved
    // it, a throw brings it back for the retry.
    const hadFocus =
      typeof document !== "undefined" && document.activeElement === btnRef.current
    setP(1)
    setPhase("confirming")
    try {
      await onConfirm()
      setPhase("done")
    } catch {
      settled.current = false
      setPhase("idle")
      setP(0)
      const el = btnRef.current
      if (hadFocus && el && document.activeElement !== el) el.focus()
    }
  }

  const frame = () => {
    const p = Math.min((nowMs() - startT.current) / HOLD_MS, 1)
    setP(p)
    if (p >= 1) {
      void complete()
      return
    }
    raf.current = requestAnimationFrame(frame)
  }

  const start = () => {
    if (disabled || settled.current || holding.current) return
    holding.current = true
    // Resume from wherever the fill actually is, not from zero.
    startT.current = nowMs() - lastP.current * HOLD_MS
    stopRaf()
    raf.current = requestAnimationFrame(frame)
  }

  const snapBack = () => {
    stopRaf()
    if (prefersReduced()) {
      setP(0)
      return
    }
    const from = lastP.current
    const t0 = nowMs()
    const back = () => {
      const t = Math.min((nowMs() - t0) / SNAP_BACK_MS, 1)
      const eased = 1 - Math.pow(1 - t, 3)
      setP(from * (1 - eased))
      if (t < 1 && lastP.current > 0.001) raf.current = requestAnimationFrame(back)
      else setP(0)
    }
    back()
  }

  const release = () => {
    if (settled.current || !holding.current) return
    holding.current = false
    snapBack()
  }

  const current = phase === "done" ? 2 : phase === "confirming" && pendingLabel ? 1 : 0
  const hint = (
    <span className="inline-flex items-center gap-1.5">
      {children}
      <span className="font-kit-regular text-kit-ink-muted">hold</span>
    </span>
  )
  const done = (
    <span className="inline-flex items-center gap-1.5 text-kit-ink">
      <HugeiconsIcon icon={Tick02Icon} size={16} strokeWidth={2} aria-hidden />
      {doneLabel}
    </span>
  )

  return (
    <>
      <button
        {...props}
        ref={setRefs}
        type="button"
        data-slot="kit-hold-button"
        data-charging="false"
        // Native `disabled` only for the prop. While confirming or done the
        // button stays focusable (a native disable drops focus to <body>):
        // aria-disabled announces it, data-disabled styles it, and the
        // settled ref already ignores every press and key.
        data-disabled={disabled || phase !== "idle" || undefined}
        disabled={disabled}
        aria-disabled={phase !== "idle" || undefined}
        aria-busy={phase === "confirming" || undefined}
        onPointerDown={(event) => {
          if (event.button !== 0) return
          event.preventDefault()
          try {
            event.currentTarget.setPointerCapture(event.pointerId)
          } catch {
            // Capture can throw on some devices; plain pointer events still carry it.
          }
          start()
        }}
        onPointerUp={release}
        onPointerCancel={release}
        onPointerLeave={release}
        onKeyDown={(event) => {
          if ((event.key === " " || event.key === "Enter") && !event.repeat) {
            event.preventDefault()
            start()
          }
        }}
        onKeyUp={(event) => {
          if (event.key === " " || event.key === "Enter") {
            event.preventDefault()
            release()
          }
        }}
        // Focus can leave mid keyboard-hold; without this the timer runs on.
        onBlur={release}
        style={{ "--p": 0, touchAction: "none" } as React.CSSProperties}
        className={
          `isolate ${BUTTON_BASE} ${BUTTON_SIZE.md} bg-kit-control text-kit-danger shadow-kit-control ` +
          "hover:not-data-disabled:bg-kit-control-hover disabled:opacity-50"
        }
      >
        {/* A hard edge sweeps across (clip-path), so it reads as a progress
            front, not a growing box. Its own radius, because overflow-hidden
            on the button would clip the 44px touch hit area (::after). */}
        <span
          aria-hidden
          className="absolute inset-0 -z-10 rounded-full bg-kit-danger-tint [clip-path:inset(0_calc((1-var(--p,0))*100%)_0_0)]"
        />
        <StableLabel current={current} labels={[hint, pendingLabel ?? hint, done]} />
      </button>
      <PendingAnnouncer
        message={phase === "confirming" ? (pendingLabel ?? null) : phase === "done" ? doneLabel : null}
      />
    </>
  )
}
