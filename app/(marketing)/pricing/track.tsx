"use client"

import * as React from "react"
import { HugeiconsIcon } from "@hugeicons/react"

import {
  hasPlatformMark,
  PlatformMark,
} from "@/components/channels/platform-mark"

import { SEQUENCE } from "./copy"

/**
 * The five steps, as a track that arrives.
 *
 * Self-contained rather than importing from `app/prototypes/pricing` — that
 * directory is throwaway and deleting it must not break a production page.
 *
 * ## The geometry
 *
 * Derived, not eyeballed, and written down because getting it wrong is
 * invisible in code and obvious in a screenshot. The eyebrow line box is
 * 13px × 1.4 = 18.2px, so its optical centre is 9.1px from the top of a row:
 *
 * - the dot (7px) sits at 9.1 − 3.5 = 5.6px  → `top-[0.35rem]`
 * - the rail starts at that same 9.1px       → `top-[0.5625rem]`
 * - the rail ends at the next dot's centre, which is the row gap plus 9.1px
 *   below this row's bottom edge             → `-bottom-[2.5625rem]`
 *
 * **That last number assumes `gap-8` (2rem) between rows.**
 *
 * ## The motion
 *
 * An earlier version dimmed four rows to spotlight one, walked on a button
 * press. That is legitimate *explanatory* motion, but only when a person asks
 * for it — autoplaying it means somebody who scrolled down to read step five
 * watches it sit dim for two and a half seconds. An animation that fights the
 * reader on a page they came to read is the wrong trade at any easing.
 *
 * So nothing dims. The rows simply arrive, and the entrance carries no meaning
 * the numerals 01–05 do not already carry — which is why it is tuned to be over
 * quickly rather than to teach the order.
 *
 * - 70ms apart, inside the 30–80ms band. Five rows land in under half a second.
 * - `translateY(8px)`, never from nothing and never from `scale(0)`.
 * - A strong ease-out; the CSS keyword is too weak to read as deliberate.
 * - Transform and opacity only, both of which skip layout and paint.
 * - Once — `disconnect()` on the first hit, because a replay the reader did not
 *   ask for is noise the second time.
 */
const STAGGER = 70
const ENTER_MS = 320
const EASE_ENTER = "cubic-bezier(0.23, 1, 0.32, 1)"

/**
 * **Reduced motion is handled in CSS, deliberately not in JS.**
 *
 * The obvious version reads the media query with `useSyncExternalStore` and
 * resolves the row to "shown". It has a bug that only appears for the people it
 * is meant to protect: the server has no media query, so it renders the rows
 * hidden, the client with reduced motion renders them shown, and hydration
 * reconciles the difference by transitioning — playing the exact animation that
 * visitor asked not to see, on top of a real server/client mismatch.
 *
 * Pure CSS has neither problem. The server and the client agree (both start
 * hidden), and a reduced-motion visitor never runs the transition at all
 * because the rule below wins on `!important` before the first paint.
 *
 * The `noscript` copy is the same guarantee for a reader with no JS at all: the
 * copy is in the HTML either way, and this stops it being painted at zero
 * forever. Both rules key off `data-step`.
 */
const ENTRANCE_CSS = `
[data-step]{opacity:0;transform:translateY(8px)}
[data-step][data-shown]{opacity:1;transform:none}
@media (prefers-reduced-motion: reduce){
  [data-step]{opacity:1!important;transform:none!important;transition:none!important}
  [data-rail]{transform:none!important;transition:none!important}
}`

export function Track() {
  const [entered, setEntered] = React.useState(false)

  // A ref callback rather than an effect, so the observer attaches the moment
  // the node exists and is torn down with it. React 19 runs the returned
  // cleanup on detach.
  const ref = React.useCallback((node: HTMLOListElement | null) => {
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

  return (
    <>
      <style>{ENTRANCE_CSS}</style>
      <noscript>
        <style>{`[data-step]{opacity:1!important;transform:none!important}`}</style>
      </noscript>

      <ol ref={ref} className="flex flex-col gap-8 pl-8">
        {SEQUENCE.map((step, index) => {
          const delay = index * STAGGER
          const last = index === SEQUENCE.length - 1

          return (
            <li
              key={step.label}
              data-step=""
              data-shown={entered ? "" : undefined}
              className="relative flex flex-col gap-1.5"
              style={{
                transition: `opacity ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms, transform ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms`,
              }}
            >
              {last ? null : (
                <span
                  aria-hidden="true"
                  className="absolute top-[0.5625rem] -bottom-[2.5625rem] -left-[1.8125rem] w-px bg-border"
                >
                  {/* Each connector draws on its own row's beat. Because a draw
                      outlasts the gap between rows, the five overlap and read
                      as one line running down the page rather than as five
                      segments taking turns. */}
                  <span
                    data-rail=""
                    className="absolute inset-0 origin-top bg-foreground"
                    style={{
                      transform: `scaleY(${entered ? 1 : 0})`,
                      transition: `transform ${ENTER_MS}ms ${EASE_ENTER} ${delay}ms`,
                    }}
                  />
                </span>
              )}

              {/* **The icon is the node.** It replaces the 7px dot rather than
                  sitting beside it: an icon next to a dot next to a numeral is
                  three marks competing inside 30px of gutter, and at 14px muted
                  the icon loses — it reads as a smudge rather than as a symbol.
                  On the rail it has the space to be recognised, and the rail
                  gains a node that means something instead of a generic dot.

                  Geometry, continuing the derivation at the head of this file.
                  The rail's centre line sits 28.5px left of the content edge
                  (`-left-8` + half of the old 7px dot), and every node has to
                  land on that same centre or the track bends:

                    box    22px, so    left = −28.5 − 11  = −39.5px
                                        → `-left-[2.46875rem]`
                    centre 9.1px, so    top  =   9.1 − 11 =  −1.9px
                                        → `-top-[0.11875rem]`

                  The glyph is 16px rather than the app's usual 14px. These are
                  hairline strokes on a warm ground at the far edge of the
                  measure, and at 14px they read as smudges rather than as a
                  link, a book, a pencil, a mic and a tick. 14px is right inside
                  a dense app row; it is not right for the one mark carrying a
                  step on a page somebody is scanning.

                  `bg-background` is load-bearing: the rail runs underneath, and
                  the box masks it so the line breaks at each node rather than
                  striking through the glyph. */}
              <span
                aria-hidden="true"
                className="absolute -top-[0.11875rem] -left-[2.46875rem] flex size-[1.375rem] items-center justify-center rounded-full bg-background text-foreground"
              >
                <HugeiconsIcon icon={step.icon} className="size-4" />
              </span>

              {/* Uppercase, so it takes the eyebrow step — that step carries
                  0.06em of tracking for exactly this, since default tracking on
                  capitals clumps. The numeral keeps the order; the icon on the
                  rail is the glanceable half. */}
              <span className="text-eyebrow text-muted-foreground uppercase">
                {String(index + 1).padStart(2, "0")}
              </span>

              {/* At full width the heading can take the display-adjacent step
                  rather than `text-section`: this is the page's body, not a
                  column inside it, and a 17px heading at this measure would
                  read as a list item rather than as a beat. */}
              <h3 className="max-w-[34ch] text-[1.375rem] leading-[1.25] font-semibold tracking-[-0.01em] text-balance">
                {step.label}
              </h3>
              <p className="max-w-[45ch] text-body-lg text-pretty text-muted-foreground">
                {step.body}
              </p>

              {/* The named things a step touches. Two rows on this page carry
                  one — the channels you connect, and the material that arrives
                  — and they answer the question the prose cannot: *does it do
                  mine*. A stranger scanning for "LinkedIn" finds it here or
                  decides the product is not for them.

                  A list rather than a caption, because it is one: a screen
                  reader should be able to count the platforms. The marks
                  themselves stay `aria-hidden` and the label beside each does
                  the announcing, which is also why no mark is load-bearing —
                  monochrome logos are recognisable, not readable. */}
              {step.marks?.length ? (
                <ul className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1.5">
                  {step.marks.map((mark) => (
                    <li
                      key={mark.id}
                      className="flex items-center gap-1.5 text-caption text-muted-foreground"
                    >
                      {hasPlatformMark(mark.id) ? (
                        <PlatformMark platform={mark.id} size={14} />
                      ) : mark.icon ? (
                        <HugeiconsIcon
                          aria-hidden="true"
                          icon={mark.icon}
                          className="size-3.5"
                        />
                      ) : null}
                      {mark.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ol>
    </>
  )
}
