"use client"

import * as React from "react"

import { useReducedMotion } from "./use-reduced-motion"

export type ArriveProps = {
  /** Whether the content is here. Flip it back and the motion retargets. */
  show: boolean
  /** `above` for a row joining a list, `below` for an object rising into place. */
  from?: "above" | "below"
  /**
   * Animate in on mount, for content that mounts BECAUSE of an action (a
   * new row after a recording, an Undo bar after a dismiss). Never on
   * content that is there when the page loads: nothing moves on load. The
   * content is interactive from the first frame, so it can take focus at
   * once.
   */
  appear?: boolean
  /**
   * Called once the content has finished leaving (`show` went false and the
   * collapse ended; at once under reduced motion). The presence hook: keep a
   * removed item mounted with `show={false}`, and drop it from your data
   * here, so it leaves with motion instead of vanishing.
   */
  onExitComplete?: () => void
  children: React.ReactNode
}

/**
 * Something the person caused arrives or leaves: a rule slides into the
 * brain, a riff card rises under the recorder, a dismissed row folds away.
 * Every Arrive has a cause; never a timer.
 *
 * It grows its height with `grid-template-rows: 0fr → 1fr`, which needs the
 * inner box clipped while it moves. Only the vertical axis is ever clipped,
 * so a MarginNote reaching into the margin column is never cut, and once
 * the content has arrived the clip is removed, so focus rings show too.
 *
 * Presence: while it leaves, it keeps showing the children it had when it
 * was last shown, so `<Arrive show={undo != null}>{undo && …}</Arrive>`
 * folds the old content away rather than collapsing an empty box.
 * Hidden content is inert and out of the accessibility tree.
 */
export function Arrive({
  show,
  from = "above",
  appear = false,
  onExitComplete,
  children,
}: ArriveProps) {
  const reduced = useReducedMotion()
  // `settled` means the last change has finished moving. Reset during
  // render when `show` changes (no effect, no extra frame clipped). With
  // `appear`, the mount itself is a change.
  const [prevShow, setPrevShow] = React.useState(show)
  const [settled, setSettled] = React.useState(!(appear && show))
  if (prevShow !== show) {
    setPrevShow(show)
    setSettled(false)
  }
  // What it shows while leaving: the children from the last time it was shown.
  const [kept, setKept] = React.useState(children)
  if (show && kept !== children) setKept(children)

  // Reduced motion removes the transition, so there is no transitionend:
  // the exit is complete the moment it happens.
  const exitRef = React.useRef(onExitComplete)
  React.useEffect(() => {
    exitRef.current = onExitComplete
  })
  React.useEffect(() => {
    if (!show && reduced) exitRef.current?.()
  }, [show, reduced])

  const clip = !show || !(settled || reduced)

  const state = show
    ? "grid-rows-[1fr] opacity-100 translate-y-0"
    : `grid-rows-[0fr] opacity-0 ${from === "below" ? "translate-y-3" : "-translate-y-2"}`
  // @starting-style: the first frame after mount starts from the hidden
  // state and transitions in. Pure CSS, so nothing waits on a frame.
  const appearFrom = appear
    ? `starting:grid-rows-[0fr] starting:opacity-0 ${from === "below" ? "starting:translate-y-3" : "starting:-translate-y-2"}`
    : ""

  return (
    <div
      data-slot="kit-arrive"
      data-on={show || undefined}
      aria-hidden={!show || undefined}
      inert={!show}
      onTransitionEnd={(e) => {
        if (e.target !== e.currentTarget || e.propertyName !== "grid-template-rows") return
        setSettled(true)
        if (!show) onExitComplete?.()
      }}
      className={`grid transition-[grid-template-rows,opacity,translate] duration-(--kit-duration-enter) ease-kit-out motion-reduce:transition-none ${state} ${appearFrom}`}
    >
      <div
        className={`min-h-0 ${clip ? "overflow-x-visible overflow-y-clip" : "overflow-visible"}`}
      >
        {/* The body: a Stage puts its stack gap here as padding, inside the
            clip, so a closed Arrive in a Stage costs no gap (stage.tsx). */}
        <div data-slot="kit-arrive-body">{show ? children : kept}</div>
      </div>
    </div>
  )
}
