"use client"

import * as React from "react"

import { devWarn, objectOf } from "./dev-warn"
import { useInView } from "./use-in-view"

/**
 * The yellow highlighter on the ONE sentence that matters. One per view; never
 * a heading. It sweeps once, the first time it is seen; pass `active` to
 * drive it yourself (a tab swap). It is a transition on `background-size`, so
 * flipping `active` back retargets mid-sweep instead of restarting.
 * Under reduced motion it is simply there.
 */
export function Highlight({
  children,
  active,
}: {
  children: React.ReactNode
  active?: boolean
}) {
  const [ref, seen] = useInView<HTMLElement>()
  const on = active ?? seen

  // Development only: the two rules a type cannot see.
  React.useEffect(() => {
    if (process.env.NODE_ENV === "production") return
    const el = ref.current
    if (!el) return
    if (el.closest("h1, h2, h3")) {
      devWarn("highlight-heading", "a Highlight inside a heading. Highlight the finding, not the title.")
    }
    const object = objectOf(el)
    if (object && object.querySelectorAll('[data-slot="kit-highlight"]').length > 1) {
      devWarn("highlight-count", "two Highlights in one Card or Window. One per object: two compete and neither wins.")
    }
  }, [ref])

  return (
    <mark
      ref={ref}
      data-slot="kit-highlight"
      data-on={on || undefined}
      className="-mx-0.5 bg-transparent bg-[linear-gradient(var(--kit-highlight),var(--kit-highlight))] bg-size-[0%_82%] bg-position-[0_58%] bg-no-repeat px-0.5 text-inherit box-decoration-clone transition-[background-size] duration-(--kit-duration-sweep) ease-kit-out data-on:bg-size-[100%_82%] motion-reduce:transition-none"
    >
      {children}
    </mark>
  )
}
