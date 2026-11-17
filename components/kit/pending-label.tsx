"use client"

import * as React from "react"
import { useLinkStatus } from "next/link"

/**
 * A link's words, dimmed while the route it opens is still loading.
 *
 * A dynamic route that was not prefetched holds the old page until its reads
 * land, and the row you pressed said nothing in the meantime. The dim waits a
 * beat so a fast navigation never flickers, and comes back at once. Must
 * render inside a next/link `<Link>`: that is where the status comes from.
 */
export function PendingLabel({ children }: { children: React.ReactNode }) {
  const { pending } = useLinkStatus()
  return (
    <span
      data-pending={pending || undefined}
      className="transition-[opacity] duration-(--kit-duration-state) ease-kit-out data-pending:opacity-60 data-pending:delay-150 motion-reduce:duration-0"
    >
      {children}
    </span>
  )
}
