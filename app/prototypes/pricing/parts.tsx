"use client"

import * as React from "react"

import { Button } from "@/components/ui/button"

/**
 * The walked track, extracted from round one's "The day" so the three hybrids
 * share one set of numbers instead of three drifting copies.
 *
 * The geometry is derived, not eyeballed, and it is written down here once
 * because getting it wrong is invisible in code and obvious in a screenshot —
 * the first version left a 9px hole above every dot.
 *
 * The eyebrow line box is 13px × 1.4 = 18.2px, so its optical centre is 9.1px
 * from the top of a row. Everything hangs off that:
 *
 * - the dot (7px) sits at 9.1 − 3.5 = 5.6px  → `top-[0.35rem]`
 * - the rail starts at that same 9.1px       → `top-[0.5625rem]`
 * - the rail ends at the next dot's centre, which is the row gap plus 9.1px
 *   below this row's bottom edge             → `-bottom-[2.5625rem]`
 *
 * **That last number assumes `gap-8` (2rem) between rows.** A caller using a
 * different gap has to change it here, which is the point of it living in one
 * file.
 */

/** Anything that fades or changes colour, as settled in the marketing round. */
export const EASE_FADE = "cubic-bezier(0.22, 0.61, 0.36, 1)"

/** One beat per row. Five rows land in 2.6s, inside the last round's ceiling. */
export const BEAT = 650

const REDUCE = "(prefers-reduced-motion: reduce)"

/**
 * Read through `useSyncExternalStore` rather than an effect that calls
 * `setState` on mount: the effect version renders twice on every visit and
 * trips `react-hooks/set-state-in-effect`. The server snapshot is "motion is
 * fine", which React reconciles on hydration.
 */
function subscribeMotion(onChange: () => void) {
  const query = window.matchMedia(REDUCE)
  query.addEventListener("change", onChange)
  return () => query.removeEventListener("change", onChange)
}
const readMotion = () => !window.matchMedia(REDUCE).matches
const readMotionOnServer = () => true

/**
 * The run.
 *
 * Rest is *everything lit*, not row zero. That is what makes the press
 * additive rather than a reveal — nothing is hidden from a visitor who never
 * presses, from a crawler, or from a screen reader — and it is also why a
 * reduced-motion visitor gets no hydration flash: the server already renders
 * the state they keep.
 */
export function useWalk(count: number) {
  const last = count - 1
  const [reached, setReached] = React.useState(last)
  const [running, setRunning] = React.useState(false)

  const motionOk = React.useSyncExternalStore(
    subscribeMotion,
    readMotion,
    readMotionOnServer
  )

  // Scheduled by the press, not stepped by an effect watching its own output.
  // Ids in a ref so a second press or an unmount mid-run cannot leave a timer
  // firing against a torn down component.
  const timers = React.useRef<ReturnType<typeof setTimeout>[]>([])

  const clear = React.useCallback(() => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }, [])

  React.useEffect(() => clear, [clear])

  const start = React.useCallback(() => {
    clear()
    setReached(0)
    setRunning(true)
    for (let step = 1; step <= last; step++) {
      timers.current.push(
        setTimeout(() => {
          setReached(step)
          if (step === last) setRunning(false)
        }, BEAT * step)
      )
    }
  }, [clear, last])

  return { reached, running, motionOk, start }
}

/**
 * The entrance, for the variant that arrives instead of being walked.
 *
 * Two animations were being conflated. The *walk* dims four rows to light one:
 * explanatory, and legitimate — but only when a person asks for it, because
 * autoplaying it means someone who scrolled down to read step five watches it
 * stay dim for two and a half seconds. An animation that fights the reader on
 * a page they came to read is the wrong trade at any easing.
 *
 * The *entrance* is the one that can autoplay: nothing dims, the rows simply
 * arrive. It carries no meaning the numerals 01–05 do not already carry, so it
 * is tuned to be over quickly rather than to teach the order.
 *
 * - 70ms apart, inside the 30–80ms band. Five rows land in under half a second.
 * - `translateY(8px)`, never from nothing and never from `scale(0)`.
 * - A strong ease-out. The CSS keyword is too weak to read as deliberate.
 * - Once. `disconnect()` on the first hit, so scrolling back up does not replay
 *   it — a re-run the reader did not ask for is noise the second time.
 */
export const STAGGER = 70
export const ENTER_MS = 320
export const EASE_ENTER = "cubic-bezier(0.23, 1, 0.32, 1)"

export function useEnterOnce() {
  const [entered, setEntered] = React.useState(false)

  const motionOk = React.useSyncExternalStore(
    subscribeMotion,
    readMotion,
    readMotionOnServer
  )

  // A ref callback rather than an effect, so the observer is attached the
  // moment the node exists and torn down with it. React 19 runs the returned
  // cleanup on detach.
  const ref = React.useCallback((node: HTMLElement | null) => {
    if (!node) return
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return
        setEntered(true)
        io.disconnect()
      },
      // Fires a little before the top edge lands, so the first row is already
      // moving when it comes into view rather than starting after it arrives.
      { rootMargin: "0px 0px -15% 0px" }
    )
    io.observe(node)
    return () => io.disconnect()
  }, [])

  /**
   * Reduced motion resolves to shown, so that visitor gets the finished state
   * with no hydration flash — the same rest-is-everything-lit rule `useWalk`
   * follows. Derived rather than set from an effect, which would both render
   * twice and trip `react-hooks/set-state-in-effect`.
   */
  return { ref, shown: entered || !motionOk }
}

/**
 * The one thing an opacity-based entrance owes a page: without JS the rows
 * would never be told to arrive. The content is in the HTML either way — this
 * only stops it being painted at `opacity: 0` forever.
 */
export function EnterFallbackStyle() {
  return (
    <noscript>
      <style>{`[data-enter]{opacity:1!important;transform:none!important}`}</style>
    </noscript>
  )
}

/**
 * `visibility` rather than unmounting: unmounting hands the space back and the
 * heading row reflows. Hidden also takes it out of the tab order, which is
 * correct — under reduced motion this control has nothing to do, because the
 * state it would animate towards is the state already on screen.
 */
export function WalkButton({
  onStart,
  running,
  motionOk,
  label = "Watch it happen",
}: {
  onStart: () => void
  running: boolean
  motionOk: boolean
  label?: string
}) {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={onStart}
      disabled={running}
      style={motionOk ? undefined : { visibility: "hidden" }}
    >
      {label}
    </Button>
  )
}

/**
 * One row of the track: the dot, the connector below it, and whatever the
 * caller renders beside them.
 *
 * The connector is drawn per row rather than as one rail behind the list, so
 * its ends land exactly on the two dots it joins instead of being nudged into
 * place with magic offsets. The fill is a `scaleY` transform — a transform
 * rather than a height so there is nothing to lay out, and *linear* rather
 * than the settled drawer curve because this rail is a clock, not an element
 * arriving. Eased, time would appear to pass faster in the middle of a step.
 */
export function TrackRow({
  lit,
  filled,
  last,
  enter,
  children,
}: {
  lit: boolean
  filled: boolean
  last: boolean
  /**
   * Present when the caller autoplays an entrance instead of a walk. The row
   * arrives on `shown`; `index` is only a delay, so the stagger is expressed
   * once here rather than by every caller.
   */
  enter?: { shown: boolean; index: number }
  children: React.ReactNode
}) {
  const delay = enter ? enter.index * STAGGER : 0
  const arrived = enter ? enter.shown : true

  return (
    <li
      className="relative flex flex-col gap-1.5"
      data-enter={enter ? "" : undefined}
      style={
        enter
          ? {
              opacity: arrived ? 1 : 0,
              // Only transform and opacity — both skip layout and paint.
              transform: arrived ? "translateY(0)" : "translateY(8px)",
              transition: `opacity ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms, transform ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms`,
            }
          : undefined
      }
    >
      {last ? null : (
        <span
          aria-hidden="true"
          className="absolute -bottom-[2.5625rem] -left-[1.8125rem] top-[0.5625rem] w-px bg-border"
        >
          {/* In entrance mode the connector draws on the same beat as its own
              row. Because a draw takes longer than the gap between rows, the
              five overlap and read as one line running down the page rather
              than five segments taking turns. */}
          <span
            className="absolute inset-0 origin-top bg-foreground"
            style={
              enter
                ? {
                    transform: `scaleY(${arrived ? 1 : 0})`,
                    transition: `transform ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms`,
                  }
                : {
                    transform: `scaleY(${filled ? 1 : 0})`,
                    transition: `transform ${BEAT}ms linear`,
                  }
            }
          />
        </span>
      )}

      <span
        aria-hidden="true"
        className="absolute -left-8 top-[0.35rem] size-[0.4375rem] rounded-full"
        style={{
          backgroundColor: lit
            ? "var(--color-foreground)"
            : "var(--color-border)",
          transition: `background-color 200ms ${EASE_FADE}`,
        }}
      />

      {children}
    </li>
  )
}

/**
 * The row's small state label. Uppercase, so it takes the eyebrow step — that
 * step carries 0.06em of tracking for exactly this, since default tracking on
 * capitals clumps.
 */
export function TrackEyebrow({
  lit,
  children,
}: {
  lit: boolean
  children: React.ReactNode
}) {
  return (
    <span
      className="text-eyebrow uppercase"
      style={{
        color: lit ? "var(--color-muted-foreground)" : "var(--color-border)",
        transition: `color 200ms ${EASE_FADE}`,
      }}
    >
      {children}
    </span>
  )
}

/** The row's heading. Dims with the row; the body copy underneath never does. */
export function TrackHeading({
  lit,
  className = "",
  children,
}: {
  lit: boolean
  className?: string
  children: React.ReactNode
}) {
  return (
    <h3
      className={className}
      style={{
        color: lit
          ? "var(--color-foreground)"
          : "var(--color-muted-foreground)",
        transition: `color 200ms ${EASE_FADE}`,
      }}
    >
      {children}
    </h3>
  )
}
