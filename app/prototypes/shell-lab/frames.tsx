"use client"

import * as React from "react"

/* eslint-disable no-restricted-imports -- A lab that judges the app against
   the landing's pictures has to draw them, and the brief asks for the
   showcase frames by import. Same exemption as app/prototypes/lab/landing;
   add this folder to eslint.config.mjs's showcase ignores if it stays. */
import { Phone } from "@/components/showcase/phone"
import { Window } from "@/components/showcase/window"
/* eslint-enable no-restricted-imports */

/**
 * The two frames every direction is judged in: a desktop browser at 1280×800
 * and a phone. Both are the showcase's own pieces (imported, not copied), so
 * a direction sits in the same chrome as the landing picture beside it.
 */

export const DESKTOP = { width: 1280, height: 800 } as const

/**
 * The showcase Window outside a showcase Stage has no --ss-* tokens (they
 * are scoped to `.ss-fit > .ss-stage` in components/showcase/theme.css). A
 * Stage cannot hold the shell either: it reverts buttons, links and lists
 * to the browser's own, which is right for a picture and wrong for a shell
 * you click. So the frame borrows just the chrome's tokens, pointed at the
 * kit's, the way theme.css does.
 */
const CHROME_TOKENS = {
  "--ss-canvas": "var(--kit-ground)",
  "--ss-chrome": "var(--kit-object)",
  "--ss-line": "var(--kit-hairline)",
  "--ss-line-faint": "var(--kit-hairline)",
  "--ss-ink-1": "color-mix(in oklch, var(--kit-ink) 4%, transparent)",
  "--ss-ink-5": "color-mix(in oklch, var(--kit-ink) 15%, transparent)",
  "--ss-text-faint": "var(--kit-ink-muted)",
  "--ss-text-strong": "var(--kit-ink)",
  "--ss-radius-window": "var(--radius-kit-object)",
  "--ss-shadow-window": "var(--kit-elevation-object)",
} as React.CSSProperties

/**
 * Scales a fixed design size down to the width it is given, never up. Hidden
 * until the first measure, so it never paints at full size and jumps.
 */
export function Fit({
  width,
  height,
  children,
}: {
  width: number
  height: number
  children: React.ReactNode
}) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setScale(Math.min(1, entry.contentRect.width / width))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [width])

  return (
    <div ref={ref} className="w-full overflow-hidden" style={{ aspectRatio: `${width} / ${height}`, maxWidth: width }}>
      <div
        style={{
          width,
          height,
          transform: `scale(${scale ?? 1})`,
          transformOrigin: "0 0",
          visibility: scale == null ? "hidden" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  )
}

/** A browser at desktop width, holding one direction's whole shell. */
export function DesktopFrame({ url, children }: { url: string; children: React.ReactNode }) {
  return (
    <Fit width={DESKTOP.width} height={DESKTOP.height}>
      <div style={CHROME_TOKENS} className="h-full">
        <Window url={url} lights="grey" style={{ width: DESKTOP.width, height: DESKTOP.height }}>
          {/* The window's body is a flex child with no height of its own; the
              shell fills it absolutely so its own scroll areas get a ceiling. */}
          <div className="absolute inset-0 overflow-hidden bg-kit-ground font-kit-sans text-kit-body text-kit-ink">
            {children}
          </div>
        </Window>
      </div>
    </Fit>
  )
}

/**
 * The phone: the showcase's pro frame, white screen. Content starts under
 * the status bar; the shell fills what is left. 402pt wide inside, close
 * to the 390px the screenshots are taken at.
 */
export function PhoneFrame({ children, width = 340 }: { children: React.ReactNode; width?: number }) {
  return (
    <Phone width={width} time="07:52">
      <div className="absolute inset-0 top-[62px] overflow-hidden bg-kit-ground font-kit-sans text-kit-body text-kit-ink">
        {children}
      </div>
    </Phone>
  )
}
