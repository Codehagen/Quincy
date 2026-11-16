"use client"

import * as React from "react"
import { ArrowDown02Icon } from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import { MessageScroller as Primitive } from "@shadcn/react/message-scroller"

import { CONTROL_SURFACE, FOCUS_RING, HIT_44 } from "./control-styles"
import { useReducedMotion } from "./use-reduced-motion"

/**
 * A conversation that scrolls: the transcript, held to the live edge while a
 * reply streams, and a way back to the end once you scroll up.
 *
 * On `@shadcn/react/message-scroller`, the behaviour layer the chatbot
 * template uses (and components/ui/message-scroller.tsx before it). It is
 * already a dependency and it does what a stick-to-bottom library would:
 * follow the end only while the reader is there, anchor a new turn rather
 * than drag the reader along with a long reply, keep position on prepend.
 * The viewport is a labelled region and the content a `log` with
 * `aria-relevant="additions"`, so a screen reader hears new turns without
 * the page taking focus.
 *
 *   <MessageList label="Conversation with Quincy">
 *     {messages.map((m) => <MessageListItem key={m.id} id={m.id} anchor={m.role === "user"}>…</MessageListItem>)}
 *   </MessageList>
 *
 * Fills its parent (`h-full`): give it a parent with a definite height.
 */
export type MessageListProps = {
  /** The region's name: "Conversation with Quincy". */
  label: string
  /** MessageListItems, oldest first. */
  children: React.ReactNode
  /** Rendered after the list inside the scroll, at the column's width: a status line. */
  footer?: React.ReactNode
  /**
   * How far the previous turn peeks above an anchored one, in px, so a new
   * question never reads as the top of an empty page. Default 64.
   */
  peek?: number
}

export function MessageList({ label, children, footer, peek = 64 }: MessageListProps) {
  const viewport = React.useRef<HTMLDivElement>(null)
  return (
    <Primitive.Provider autoScroll scrollPreviousItemPeek={peek}>
      <Primitive.Root
        data-slot="kit-message-list"
        className="relative flex size-full min-h-0 flex-col overflow-hidden"
      >
        <Primitive.Viewport
          ref={viewport}
          aria-label={label}
          className={`size-full min-h-0 min-w-0 overflow-y-auto overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin] ${FOCUS_RING} focus-visible:outline-offset-[-2px]`}
        >
          <Primitive.Content className="mx-auto flex h-max min-h-full w-full max-w-kit-page flex-col gap-kit-lead-gap px-kit-page-gutter pt-kit-group pb-kit-group">
            {children}
            {footer}
          </Primitive.Content>
        </Primitive.Viewport>
        <ScrollToEnd viewport={viewport} />
      </Primitive.Root>
    </Primitive.Provider>
  )
}

export type MessageListItemProps = {
  /** The message id: what the list measures and scrolls to. */
  id: string
  /**
   * Hold this item at the top when it arrives (the person's turn), so the
   * reply streams downward from a fixed point instead of dragging the reader.
   */
  anchor?: boolean
  children: React.ReactNode
}

/**
 * One turn in a MessageList. No `content-visibility`: an off-screen item
 * skipping layout reports a stale height, and the list measures every item to
 * place its anchor (measured: an 800px reply moved its rect by 23px).
 */
export function MessageListItem({ id, anchor = false, children }: MessageListItemProps) {
  return (
    <Primitive.Item messageId={id} scrollAnchor={anchor} className="min-w-0 shrink-0">
      {children}
    </Primitive.Item>
  )
}

/**
 * The round control that takes you back to the newest turn. Present only
 * while the end is out of view; it rises in and sinks out on the kit's state
 * duration, and only fades under reduced motion, where the jump is instant.
 *
 * The control leaves once the end is in view, so focus goes to the
 * transcript it scrolled rather than falling to the page.
 */
function ScrollToEnd({ viewport }: { viewport: React.RefObject<HTMLDivElement | null> }) {
  const reduced = useReducedMotion()
  return (
    <Primitive.Button
      direction="end"
      behavior={reduced ? "auto" : "smooth"}
      onClick={() => {
        // After the primitive's own blur, which runs once this returns.
        requestAnimationFrame(() => viewport.current?.focus({ preventScroll: true }))
      }}
      aria-label="Scroll to the newest message"
      data-slot="kit-scroll-to-end"
      className={
        `absolute bottom-kit-related left-1/2 grid size-kit-control-md -translate-x-1/2 place-items-center rounded-full text-kit-ink ${CONTROL_SURFACE} ${FOCUS_RING} ${HIT_44} ` +
        "transition-[opacity,translate,scale] duration-(--kit-duration-state) ease-kit-out motion-reduce:transition-[opacity] " +
        "hover:bg-kit-control-hover data-[active=false]:pointer-events-none data-[active=false]:translate-y-2 data-[active=false]:opacity-0 motion-reduce:data-[active=false]:translate-y-0 data-[active=true]:opacity-100"
      }
    >
      <HugeiconsIcon icon={ArrowDown02Icon} size={18} strokeWidth={2} aria-hidden />
    </Primitive.Button>
  )
}
