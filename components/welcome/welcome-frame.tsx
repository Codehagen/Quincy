import * as React from "react"

import { KitRoot } from "@/components/kit"
import { QuincyMark } from "@/components/mascot"

/**
 * First run's frame: the kit's ground, the lockup, and a viewport-tall body
 * the conversation fills. No sidebar, on purpose (app/(welcome)/layout.tsx
 * says why). Shared by the layout and the prototype harness, so the harness
 * shows exactly the frame a new account sees.
 */
export function WelcomeFrame({ children }: { children: React.ReactNode }) {
  return (
    <KitRoot>
      <div className="flex h-dvh flex-col">
        <header className="flex h-kit-shell-bar shrink-0 items-center px-kit-page-gutter text-kit-ink">
          <QuincyMark size="sm" />
        </header>
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </div>
    </KitRoot>
  )
}
