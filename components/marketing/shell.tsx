import { KitRoot } from "@/components/kit"

import { MarketingFooter } from "./footer"
import { MarketingHeader } from "./header"

/**
 * The marketing surface's frame: the kit ground, the header, the page, the
 * footer. `app/(marketing)/layout.tsx` renders it around every marketing page,
 * and `/prototypes/landing` around the same HomePage.
 */
export function MarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <KitRoot>
      <div className="flex min-h-dvh flex-col">
        <MarketingHeader />
        <main className="flex-1">{children}</main>
        <MarketingFooter />
      </div>
    </KitRoot>
  )
}
