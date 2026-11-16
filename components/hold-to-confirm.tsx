"use client"

import * as React from "react"
import { Loading03Icon, Tick02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"

import { cn } from "@/lib/utils"

const SNAP_BACK_MS = 200

// The impure clock, read only from event and rAF callbacks — never during
// render. Reading it through a named function keeps the component body clean
// for the purity lint, which cannot tell the two cases apart.
const nowMs = () => performance.now()

const prefersReduced = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

/**
 * Hold-to-confirm.
 *
 * A confirmation dialog asks "are you sure?" and trains people to click
 * through it. A hold asks for the same certainty as part of the action: you
 * prove intent by doing the thing, and you cancel by letting go.
 *
 * Progress is driven by requestAnimationFrame against `performance.now()`,
 * written to a `--p` custom property. Not a CSS transition — a transition
 * would collapse to zero under `prefers-reduced-motion` and fire the action
 * the instant the button was touched.
 *
 * The hold resumes rather than restarts: pressing again while the fill is
 * still draining picks up from the fill's current position, which is the same
 * "animate from the presentation value, never the target value" rule that
 * makes interrupted gestures feel continuous.
 */

type HoldToConfirmProps = {
  onConfirm: () => void | Promise<void>
  children: React.ReactNode
  /** Long enough to be deliberate, short enough not to feel punitive. */
  holdMs?: number
  hint?: string
  doneLabel?: string
  tone?: "destructive" | "primary"
  disabled?: boolean
  className?: string
}

export function HoldToConfirm({
  onConfirm,
  children,
  holdMs = 1200,
  hint = "hold",
  doneLabel = "Done",
  tone = "destructive",
  disabled = false,
  className,
}: HoldToConfirmProps) {
  const btnRef = React.useRef<HTMLButtonElement>(null)
  const raf = React.useRef(0)
  const holding = React.useRef(false)
  const startT = React.useRef(0)
  const lastP = React.useRef(0)
  const settled = React.useRef(false)
  const [phase, setPhase] = React.useState<"idle" | "confirming" | "done">(
    "idle"
  )

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

  // A pending frame must not outlive the component: the dialog can close
  // mid-hold, and completing afterwards would act without intent.
  React.useEffect(() => () => stopRaf(), [])

  const complete = async () => {
    stopRaf()
    holding.current = false
    settled.current = true
    setP(1)
    setPhase("confirming")
    try {
      await onConfirm()
      setPhase("done")
    } catch {
      // Let the operator try again rather than stranding the button.
      settled.current = false
      setPhase("idle")
      setP(0)
    }
  }

  const frame = () => {
    const p = Math.min((nowMs() - startT.current) / holdMs, 1)
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
    startT.current = nowMs() - lastP.current * holdMs
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
      if (t < 1 && lastP.current > 0.001)
        raf.current = requestAnimationFrame(back)
      else setP(0)
    }
    back()
  }

  const release = () => {
    if (settled.current || !holding.current) return
    holding.current = false
    snapBack()
  }

  return (
    <button
      ref={btnRef}
      type="button"
      data-slot="hold-to-confirm"
      data-charging="false"
      disabled={disabled || phase !== "idle"}
      aria-busy={phase === "confirming"}
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        try {
          event.currentTarget.setPointerCapture(event.pointerId)
        } catch {
          // Capture can throw on some devices; the plain pointer events
          // still carry the gesture.
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
      style={
        {
          "--p": 0,
          // Stronger than the global `manipulation`: a hold that begins on a
          // scrollable page must not be stolen by a pan.
          touchAction: "none",
        } as React.CSSProperties
      }
      className={cn(
        // No `overflow-hidden`. It was here to keep the progress fill inside
        // the rounded corners, and the fill now carries its own radius instead
        // — because the 44px touch hit-area in globals.css is an `::after` on
        // the button, and overflow-hidden would clip it back to the visible
        // box, silently reinstating the under-floor target it exists to fix.
        "relative isolate inline-flex items-center justify-center gap-2 rounded-md px-3 py-1.5",
        "text-body font-medium whitespace-nowrap select-none",
        "transition-[color,background-color,border-color,box-shadow] duration-150 ease-out",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
        "disabled:opacity-50",
        // A visible boundary at rest, not only on hover.
        //
        // This shipped as bare coloured text whose only affordance was a hover
        // background, which fails three ways. There is no hover on touch, so on
        // a phone the control announced itself as prose. The progress fill is
        // clipped to the button's own box, so with no edge it appeared out of
        // nowhere rather than filling something. And the failure that matters
        // here is not an accidental confirm — it is a *missed* one: someone
        // clicks, nothing happens because the gesture is a hold, and they
        // conclude it is broken.
        //
        // Bordered rather than filled. This is always the subordinate action
        // beside a constructive one, and a solid destructive button would make
        // the quiet option the loudest thing on the surface.
        "border",
        tone === "destructive" &&
          "border-destructive/30 text-destructive hover:border-destructive/50 hover:bg-destructive/10",
        tone === "primary" && "border-border text-foreground hover:bg-muted",
        phase === "done" &&
          "bg-success-500/15 text-success-500 dark:text-success-400",
        className
      )}
    >
      {/* clip-path sweeps a hard edge across rather than scaling a box, so the
          fill reads as a progress front instead of a growing rectangle. */}
      <span
        aria-hidden="true"
        className={cn(
          // `rounded-md` matches the button, so the fill stays inside the
          // corners now that the button no longer clips it.
          "absolute inset-0 -z-10 rounded-md [clip-path:inset(0_calc((1-var(--p,0))*100%)_0_0)]",
          tone === "destructive" ? "bg-destructive/25" : "bg-signal/30"
        )}
      />
      <span className="inline-flex items-center gap-1.5">
        {phase === "confirming" ? (
          <HugeiconsIcon
            aria-hidden="true"
            icon={Loading03Icon}
            size={14}
            className="animate-spin"
          />
        ) : null}
        {phase === "done" ? (
          <HugeiconsIcon
            aria-hidden="true"
            icon={Tick02Icon}
            size={14}
            strokeWidth={2.6}
          />
        ) : null}
        {phase === "done" ? doneLabel : children}
        {phase === "idle" ? (
          <span className="text-caption font-normal opacity-60">{hint}</span>
        ) : null}
      </span>
    </button>
  )
}
