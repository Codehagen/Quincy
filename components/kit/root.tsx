import * as React from "react"

import { kitHand, kitSans } from "./fonts"

type KitRootProps = Omit<
  React.ComponentPropsWithRef<"div">,
  "className" | "style"
> & {
  children: React.ReactNode
}

/**
 * The kit's root: wrap a whole page that has moved to the kit (never half a
 * page, per plan 029). It sets the two font variables, the ground, and the
 * body type so every kit component inside reads Inter 14/20 at 460 in ink.
 * At least one viewport tall, so a short page never shows the app's own
 * background under the ground.
 *
 * It is a wrapper rather than a class on <html> so the app's Geist default
 * and every page not yet migrated stay exactly as they are.
 */
export function KitRoot({ children, ...props }: KitRootProps) {
  return (
    <div
      {...props}
      data-slot="kit-root"
      className={`${kitSans.variable} ${kitHand.variable} min-h-dvh bg-kit-ground font-kit-sans text-kit-body text-kit-ink antialiased [font-feature-settings:"cv11","ss01"]`}
    >
      {children}
    </div>
  )
}
