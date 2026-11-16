"use client"

import * as React from "react"

import { NavRow } from "@/components/kit"
import { QuincyMark } from "@/components/mascot"
import { NAV } from "@/components/quincy/shell/nav"
import { Phone } from "@/components/showcase/phone"
import { Window } from "@/components/showcase/window"

/**
 * The frames every direction is judged in, copied from shell-lab/frames.tsx
 * (that lab is deleted when its direction ships; this one must not depend on
 * it). The desktop is a browser at a width you pick, with a stand-in sidebar
 * at the real 13rem, because the sidebar is what decides whether the Ideas
 * stage reaches the split breakpoint. The phone is the showcase's pro frame.
 */

export const DESKTOP_HEIGHT = 860

/** The showcase Window's chrome tokens, pointed at the kit's (shell-lab, frames.tsx). */
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

/** Scales a fixed design size down to the width it is given, never up. */
export function Fit({ width, height, children }: { width: number; height: number; children: React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [scale, setScale] = React.useState<number | null>(null)

  React.useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setScale(Math.min(1, entry.contentRect.width / width)))
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

/** A browser holding the app: the stand-in sidebar, then the page in its own scroll. */
export function DesktopFrame({ width, children }: { width: number; children: React.ReactNode }) {
  return (
    <Fit width={width} height={DESKTOP_HEIGHT}>
      <div style={CHROME_TOKENS} className="h-full">
        <Window url="hirequincy.com/ideas" lights="grey" style={{ width, height: DESKTOP_HEIGHT }}>
          <div className="absolute inset-0 flex overflow-hidden bg-kit-ground font-kit-sans text-kit-body text-kit-ink">
            <Sidebar />
            <div data-lab-scroll className="relative min-w-0 flex-1 overflow-y-auto" style={{ "--lab-frame-h": "820px" } as React.CSSProperties}>
              {children}
            </div>
          </div>
        </Window>
      </div>
    </Fit>
  )
}

/**
 * The real nav (app-sidebar.tsx's markup), with Ideas current. The rows do
 * not leave the lab: it is one page.
 */
function Sidebar() {
  return (
    <nav aria-label="Quincy (stand-in)" className="flex w-kit-sidebar flex-none flex-col">
      <div className="flex h-kit-shell-bar shrink-0 items-center px-kit-shell-mark text-kit-ink select-none">
        <QuincyMark size="sm" />
      </div>
      <ul className="px-kit-shell-pad">
        {NAV.map((item) => (
          <li key={item.href}>
            <NavRow
              href={item.href}
              prefetch={false}
              onClick={(e) => e.preventDefault()}
              icon={item.icon}
              current={item.href === "/ideas"}
              density="compact"
            >
              {item.label}
            </NavRow>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** The phone: content under the status bar, the page scrolling inside. */
export function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <Phone width={340} time="07:52">
      <div
        data-lab-scroll
        style={{ "--lab-frame-h": "600px" } as React.CSSProperties}
        className="absolute inset-0 top-[62px] overflow-y-auto bg-kit-ground font-kit-sans text-kit-body text-kit-ink"
      >
        {children}
      </div>
    </Phone>
  )
}
