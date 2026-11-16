"use client"

import * as React from "react"

import { Card, type CardBaseProps, type CardLayout } from "./card"
import { Mono } from "./mono"

const InWindow = React.createContext(false)

type WindowProps = Omit<CardBaseProps, "inset"> &
  CardLayout & {
    /** Mono path in the chrome, e.g. "hirequincy.com/lineup". */
    address: string
  }

/**
 * A Card with window chrome: three dots and a mono address. At most once per
 * view; a Window inside a Window throws, because chrome inside chrome stops
 * meaning "this is the product". Never an empty Window waiting on a loop.
 *
 * A client component only for that guard: context is the one way to see the
 * nesting, and server components cannot read context.
 */
export function Window({
  address,
  children,
  crop,
  width,
  ...props
}: WindowProps) {
  if (React.useContext(InWindow)) {
    throw new Error("kit: a Window inside a Window. Chrome appears at most once.")
  }
  return (
    <InWindow value={true}>
      <Card
        {...props}
        {...(crop === "corner" ? { crop } : { crop, width })}
        inset="none"
      >
        <div className="flex h-9 items-center gap-3.5 border-b border-kit-hairline px-3.5">
          <span className="flex gap-1.5" aria-hidden>
            <span className="size-[9px] rounded-full bg-kit-chrome" />
            <span className="size-[9px] rounded-full bg-kit-chrome" />
            <span className="size-[9px] rounded-full bg-kit-chrome" />
          </span>
          <span className="min-w-0 truncate">
            <Mono>{address}</Mono>
          </span>
        </div>
        <div className="[--kit-card-pad:var(--spacing-kit-pad)] p-(--kit-card-pad)">
          {children}
        </div>
      </Card>
    </InWindow>
  )
}
