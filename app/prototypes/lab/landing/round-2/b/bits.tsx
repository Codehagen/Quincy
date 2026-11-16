import * as React from "react"

import { PRICE, REFUSALS } from "@/app/(marketing)/pricing/copy"

/**
 * Small parts every page in group b shares. Each page composes them its own
 * way; nothing here decides a page's rhythm.
 *
 * The facts come from the live pricing copy, so a lab page cannot drift from
 * what the product promises: one plan, $49 a month, the "never" lines.
 */
export { PRICE, REFUSALS }

/** The page's top line: the name and the way in. No pill nav. */
export function TopLine({ right }: { right?: React.ReactNode }) {
  return (
    <div className="flex h-[84px] items-center justify-between px-16 text-[15px]">
      <span className="font-[600] tracking-[-0.01em]">Quincy</span>
      <span className="flex items-center gap-6 text-kit-ink-muted">
        {right ?? (
          <>
            <span>Pricing</span>
            <span>Changelog</span>
            <span className="text-kit-ink">Join the waitlist</span>
          </>
        )}
      </span>
    </div>
  )
}

/** The page's one button. Ink on the ground in both modes. */
export function Cta({ children = "Join the waitlist", size = "lg" }: { children?: React.ReactNode; size?: "lg" | "md" }) {
  return (
    <button
      type="button"
      className={`inline-flex items-center rounded-full bg-kit-ink font-[560] tracking-[-0.01em] text-kit-ground transition-[opacity,scale] duration-(--kit-duration-press) ease-kit-out hover:opacity-90 active:scale-[0.98] motion-reduce:transition-none ${size === "lg" ? "h-12 px-6 text-[16px]" : "h-10 px-5 text-[15px]"}`}
    >
      {children}
    </button>
  )
}

/** A window's top bar: three quiet dots and a centred address pill. */
export function Chrome({ url }: { url: string }) {
  return (
    <div className="relative flex h-[38px] flex-none items-center gap-1.5 border-b border-kit-hairline px-4">
      {[0, 1, 2].map((i) => (
        <span key={i} className="size-2.5 rounded-full bg-kit-chrome" />
      ))}
      <span className="absolute left-1/2 -translate-x-1/2 rounded-full bg-kit-well px-3 py-0.5 font-kit-mono text-[11px] text-kit-ink-muted">
        {url}
      </span>
    </div>
  )
}

/** A filled check circle, as the kit's checklist draws it. Ink unless `done`. */
export function Check({ size = 16, tone = "ink" }: { size?: number; tone?: "ink" | "done" }) {
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" className="flex-none">
      <circle cx="8" cy="8" r="8" className={tone === "done" ? "fill-kit-success" : "fill-kit-ink"} />
      <path
        d="M4.6 8.2 L7 10.5 L11.4 5.8"
        fill="none"
        className={tone === "done" ? "stroke-kit-success-on" : "stroke-kit-object"}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The work receipt: what Quincy did, one checked line each. */
export function Receipt({
  lines,
  size = 14,
  tone = "ink",
}: {
  lines: readonly (readonly [string, string])[]
  size?: number
  tone?: "ink" | "done"
}) {
  return (
    <ul className="flex flex-col gap-2.5" style={{ fontSize: size, lineHeight: 1.4 }}>
      {lines.map(([did, result]) => (
        <li key={did} className="flex items-center gap-2.5">
          <Check size={size + 2} tone={tone} />
          <span>
            <span className="font-[560]">{did}</span>
            <span className="text-kit-ink-muted"> → {result}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Approve and Edit, as a draft card carries them. Spans: this is a picture. */
export function DraftActions({ approved = false }: { approved?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-[14px]">
      <span className="inline-flex h-9 items-center gap-1.5 rounded-kit-control bg-kit-action px-4 font-[560] text-kit-action-on">
        {approved ? "Approved" : "Approve"}
      </span>
      <span className="inline-flex h-9 items-center rounded-kit-control bg-kit-control px-4 font-[560] shadow-kit-control">
        Edit
      </span>
    </div>
  )
}

/** Varying widths so filler never reads as a ruler. */
export function Bars({ widths, h = 7, gap = 9 }: { widths: number[]; h?: number; gap?: number }) {
  return (
    <div className="flex flex-col" style={{ gap }} aria-hidden>
      {widths.map((w, i) => (
        <span key={i} className="block rounded-full bg-kit-skeleton" style={{ width: `${w}%`, height: h }} />
      ))}
    </div>
  )
}

/** The footer every page ends on. */
export function Footer() {
  return (
    <footer className="flex items-center justify-between border-t border-kit-hairline px-16 py-8 text-[14px] text-kit-ink-muted">
      <span className="flex items-center gap-6">
        <span className="font-[600] text-kit-ink">Quincy</span>
        <span>Pricing</span>
        <span>Changelog</span>
        <span>Privacy</span>
        <span>Terms</span>
      </span>
      <span>Codebase AS, Norway</span>
    </footer>
  )
}
