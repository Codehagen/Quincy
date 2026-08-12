"use client"

import * as React from "react"
import type { UIMessage } from "ai"

import { cn } from "@/lib/utils"
import {
  useMessageScroller,
  useMessageScrollerVisibility,
} from "@/components/ui/message-scroller"

/**
 * Below this the rail is scaffolding for a list you can already see whole. Two
 * turns fit on one screen; a navigator for them is furniture.
 */
const MIN_TURNS = 3

/**
 * `KeyL` rather than `key`, so the binding survives a non-QWERTY layout.
 *
 * Nothing on screen names it. The rail is reachable by Tab either way, and a
 * floating caption over the transcript costs every reader something to buy one
 * reader a hint once. `aria-keyshortcuts` still carries it for anyone who
 * queries the accessibility tree.
 */
const SHORTCUT_CODE = "KeyL"

/**
 * One timing for the whole reveal, so the panel and the labels read as a single
 * object rather than two things that happen to fire together.
 *
 * The resting values are the *exit* — quicker and on a softer curve, because
 * leaving is already decided. Hover and focus-within override them with the
 * slower, stronger enter.
 *
 * Tailwind v4 writes the individual `translate` property, not `transform`, so
 * that is the name the transition has to carry. `transition-transform` here
 * would generate a rule that never fires and look like a dead animation.
 */
const REVEAL =
  "transition-[opacity,translate] duration-150 ease-in " +
  "group-hover/rail:duration-200 group-hover/rail:ease-[cubic-bezier(0.32,0.72,0,1)] " +
  "group-focus-within/rail:duration-200 group-focus-within/rail:ease-[cubic-bezier(0.32,0.72,0,1)]"

/**
 * The rail's label for a turn. Text parts win; a turn that is only files still
 * needs a name, and "Untitled" reads better than an empty row you cannot aim at.
 */
function labelFor(message: UIMessage) {
  const text = message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  if (text) {
    return text
  }

  const files = message.parts.filter((part) => part.type === "file").length
  if (files > 0) {
    return files === 1 ? "1 attachment" : `${files} attachments`
  }

  return "Untitled turn"
}

/**
 * A navigator for the whole conversation, not one message at a time.
 *
 * One tick per turn you took. The ticks never move — the labels fade and slide
 * in beside them, and the panel fades in behind. Nothing here animates a layout
 * property, so the hover area is the same shape before and after: a box that
 * grew under the cursor would chase it and flicker on the way out.
 *
 * Hovering scrolls, because scrubbing is the point. `behavior: "auto"` and not
 * smooth: a sweep down the rail fires a scroll per row, and smooth would queue
 * animations that never catch up with the pointer.
 */
export function ConversationRail({ messages }: { messages: UIMessage[] }) {
  const { scrollToMessage } = useMessageScroller()
  const { currentAnchorId } = useMessageScrollerVisibility()

  const items = React.useMemo(
    () =>
      messages
        .filter((message) => message.role === "user")
        .map((message) => ({ id: message.id, label: labelFor(message) })),
    [messages]
  )

  const navRef = React.useRef<HTMLElement>(null)
  const listRef = React.useRef<HTMLOListElement>(null)
  const itemRefs = React.useRef<(HTMLButtonElement | null)[]>([])
  // Where focus came from, so Escape can hand it back instead of dropping the
  // user at the top of the tab order.
  const returnFocusRef = React.useRef<HTMLElement | null>(null)

  // Only anchors register here, and the anchors are exactly the user's turns —
  // so this maps onto the ticks without any bookkeeping of our own. It is null
  // above the first turn, where the first tick is still the one you are heading
  // into.
  const activeIndex = items.findIndex((item) => item.id === currentAnchorId)
  const current = activeIndex === -1 ? 0 : activeIndex

  // The shortcut handler is registered once and must not re-register on every
  // scroll, so it reads the active index through a ref instead of closing over
  // it. Same ref answers "did focus actually move?" below.
  const currentRef = React.useRef(current)
  React.useEffect(() => {
    currentRef.current = current
  }, [current])

  const jump = React.useCallback(
    (index: number) => {
      const item = items[index]
      if (!item) {
        return
      }

      // scrollMargin, because align:"start" alone lands the turn flush against
      // the top edge with nothing above it to say what you jumped past.
      scrollToMessage(item.id, { align: "start", scrollMargin: 24 })
    },
    [items, scrollToMessage]
  )

  // One focus target, one shortcut.
  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== SHORTCUT_CODE || !event.shiftKey) {
        return
      }

      if (!event.metaKey && !event.ctrlKey) {
        return
      }

      event.preventDefault()
      itemRefs.current[currentRef.current]?.focus()
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  // A long conversation overflows the rail, so the rail scrolls too. Manual
  // arithmetic rather than scrollIntoView: that walks up the tree and would
  // scroll the transcript underneath as a side effect of tidying the rail.
  React.useEffect(() => {
    const list = listRef.current
    const element = itemRefs.current[current]
    if (!list || !element) {
      return
    }

    const top = element.offsetTop
    const bottom = top + element.offsetHeight

    if (top < list.scrollTop) {
      list.scrollTop = top
    } else if (bottom > list.scrollTop + list.clientHeight) {
      list.scrollTop = bottom - list.clientHeight
    }
  }, [current])

  function onItemKeyDown(
    event: React.KeyboardEvent<HTMLButtonElement>,
    index: number
  ) {
    if (event.key === "Escape") {
      const target = event.currentTarget
      const back = returnFocusRef.current

      if (back?.isConnected) {
        back.focus()
      } else {
        target.blur()
      }
      return
    }

    let next: number | null = null

    if (event.key === "ArrowDown") {
      next = Math.min(index + 1, items.length - 1)
    } else if (event.key === "ArrowUp") {
      next = Math.max(index - 1, 0)
    } else if (event.key === "Home") {
      next = 0
    } else if (event.key === "End") {
      next = items.length - 1
    }

    if (next === null) {
      return
    }

    event.preventDefault()
    itemRefs.current[next]?.focus()
    jump(next)
  }

  if (items.length < MIN_TURNS) {
    return null
  }

  return (
    <nav
      ref={navRef}
      aria-label="Jump to a message"
      aria-keyshortcuts="Meta+Shift+L Control+Shift+L"
      data-slot="conversation-rail"
      onFocusCapture={(event) => {
        const from = event.relatedTarget as HTMLElement | null
        if (!from || !navRef.current?.contains(from)) {
          returnFocusRef.current = from
        }
      }}
      className={cn(
        // Gated on pointer precision as well as width. Rows sit edge to edge
        // at 32px, so the usual remedy for a small target — grow the hit area
        // with a pseudo-element — cannot apply without the grown areas
        // overlapping their neighbours. This is a fine-pointer affordance, and
        // the media query should say so.
        //
        // No z-index. The rail is a later sibling of the viewport, so paint
        // order already puts it on top, and the jump-to-end button after it
        // stays reachable. An arbitrary step here would only be a number to
        // maintain.
        // end-6, not end-2. The viewport keeps a thin scrollbar with a stable
        // gutter, so end-2 put the ticks flush against the thumb's lane with
        // nothing between them. Two position indicators touching read as one
        // element, and half of that element glides while the other half snaps
        // turn to turn. They carry different information — which turn versus
        // how much text — so the fix is clearance, not deleting one.
        "group/rail absolute end-6 top-1/2 hidden -translate-y-1/2 xl:pointer-fine:block",
        // Fixed width. Nothing about the reveal touches layout, so the box the
        // cursor is inside never changes shape mid-gesture. Inert by default —
        // only the tick column below opts back into hit-testing, so a collapsed
        // rail lets clicks through to the transcript underneath it.
        "pointer-events-none w-72",
        // Sweeping the rail is a drag across text. Without this it paints a
        // selection over every label you pass.
        "select-none"
      )}
    >
      {/* Its own layer so it can fade rather than animate a colour up from
          transparent, which browsers interpolate through grey. It also takes
          over hit-testing once open: without that, the 12px gutter between a
          label and its tick would be a hole the cursor falls through, and
          crossing it would collapse the rail. */}
      <div
        aria-hidden="true"
        className={cn(
          "bg-popover absolute inset-0 rounded-lg opacity-0 shadow-md",
          "group-focus-within/rail:pointer-events-auto group-focus-within/rail:opacity-100",
          "group-hover/rail:pointer-events-auto group-hover/rail:opacity-100",
          REVEAL
        )}
      />

      {/* role="list", because list-style:none strips list semantics in Safari.
          relative, because the scroll arithmetic above reads offsetTop against
          this element. The padding lives here rather than on the rows: setting
          overflow-y forces overflow-x to `auto` too, so a full-width row would
          have its focus ring clipped on both sides. */}
      <ol
        ref={listRef}
        role="list"
        className="no-scrollbar scroll-fade-y relative max-h-[60svh] overflow-y-auto p-2"
      >
        {items.map((item, index) => {
          const isActive = index === current

          return (
            // Rows are exactly 32px, so the intrinsic size is a measurement
            // rather than a guess — off-screen rows in a long thread cost
            // nothing to lay out or paint, and the scrollbar never jumps.
            <li
              key={item.id}
              className="[contain-intrinsic-size:auto_2rem] [content-visibility:auto]"
            >
              <button
                type="button"
                ref={(node) => {
                  itemRefs.current[index] = node
                }}
                // Absent rather than "false" when inactive: the bare `data-active`
                // variant matches on presence, so a false value would still hit.
                data-active={isActive || undefined}
                aria-current={isActive ? "location" : undefined}
                // Roving tabindex — the rail is one stop in the tab order, and
                // the arrows move within it.
                tabIndex={isActive ? 0 : -1}
                onMouseEnter={() => jump(index)}
                onFocus={() => {
                  // Focusing the tick you are already on should not yank the
                  // transcript to re-align it.
                  if (index !== currentRef.current) {
                    jump(index)
                  }
                }}
                onClick={() => jump(index)}
                onKeyDown={(event) => onItemKeyDown(event, index)}
                // Inert while collapsed: the row spans the full panel width,
                // and a collapsed rail must not intercept the transcript behind
                // it. Focus and click still work — pointer-events only governs
                // hit testing, and a click on the tick child bubbles up here.
                //
                // Live the moment the rail opens, so the whole row scrubs and
                // not just the tick. The label is the obvious thing to aim at
                // once you can read it; leaving it inert made the visible half
                // of the row the half that did nothing.
                className={cn(
                  "group/row pointer-events-none flex h-8 w-full items-center gap-3 rounded-sm outline-none",
                  // ring-inset, not a ring drawn outside the box. The row's
                  // content-visibility turns on paint containment, which clips
                  // anything painted past the row's own edges — an outset ring
                  // survived only as four corner arcs and read as decoration
                  // rather than as focus.
                  "focus-visible:ring-ring/50 focus-visible:ring-2 focus-visible:ring-inset",
                  "group-focus-within/rail:pointer-events-auto group-hover/rail:pointer-events-auto"
                )}
              >
                <span
                  className={cn(
                    "text-caption text-muted-foreground group-data-active/row:text-foreground",
                    "min-w-0 flex-1 translate-x-2 truncate text-end opacity-0",
                    "group-focus-within/rail:translate-x-0 group-focus-within/rail:opacity-100",
                    "group-hover/rail:translate-x-0 group-hover/rail:opacity-100",
                    REVEAL
                  )}
                >
                  {item.label}
                </span>

                {/* The tick's hit area, not the tick. 40×32 is what you aim at
                    while the rail is collapsed; the 24×2 mark inside it is what
                    you see.

                    Short of the 40×40 desktop floor, and deliberately: rows sit
                    edge to edge, so a taller target would overlap its
                    neighbour's. This is the largest size that does not. */}
                <span className="pointer-events-auto flex h-8 w-10 shrink-0 items-center justify-end">
                  {/* Sand, not brass. Brass means live in this system, and a
                      read position is not a running ritual. */}
                  <span
                    aria-hidden="true"
                    // 80%, measured rather than eyeballed: it lands the mark at
                    // 3.66:1 on the page and 3.97:1 on the open panel. 70% read
                    // as quiet enough but measured 3.01:1, which clears the 3:1
                    // floor for a meaningful graphic by nothing at all.
                    className="bg-muted-foreground/80 group-data-active/row:bg-foreground h-0.5 w-6 rounded-full transition-colors duration-150"
                  />
                </span>
              </button>
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
