"use client"

import { useLayoutEffect, useRef } from "react"
import { PromptInput } from "@/components/ai-elements/prompt-input"
import { ASK_TEXT, SEND_AT, TYPE_TIMES } from "./timeline"

// The margin's composer (the editor's PromptInput), typed into on the film's clock. A textarea only shows its
// caret while focused and blinks on wall time, so a mirror with the textarea's own computed type sits over it and
// draws a caret after the last typed letter; the mirror's text is transparent, so only the caret shows.

export function Composer({ t, busy }: { t: number; busy: boolean }) {
  const typed = t >= SEND_AT ? 0 : TYPE_TIMES.filter((at) => at <= t).length
  const value = ASK_TEXT.slice(0, typed)
  const wrap = useRef<HTMLDivElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const area = wrap.current?.querySelector("textarea")
    const m = mirror.current
    if (!area || !m) return
    const cs = getComputedStyle(area)
    const box = area.getBoundingClientRect()
    const host = wrap.current!.getBoundingClientRect()
    const k = host.width / wrap.current!.offsetWidth
    Object.assign(m.style, {
      left: `${(box.left - host.left) / k}px`,
      top: `${(box.top - host.top) / k}px`,
      width: `${area.offsetWidth}px`,
      font: cs.font,
      lineHeight: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
      padding: cs.padding,
    })
  })
  // Steady while letters arrive, then a 530 ms blink once the hands stop.
  const last = TYPE_TIMES.filter((at) => at <= t).at(-1) ?? 0
  const caretOn = typed > 0 && t < SEND_AT && (t - last < 500 || Math.floor((t - last) / 530) % 2 === 1)
  return (
    <div ref={wrap} className="relative">
      <PromptInput label="Message Quincy" placeholder="Tighten this, add captions, make it vertical" value={value} onValueChange={() => {}} onSubmit={() => {}} busy={busy} onStop={() => {}} />
      <div ref={mirror} aria-hidden className="pointer-events-none absolute whitespace-pre-wrap text-transparent">
        {value}
        <span className="relative">
          <span className="absolute top-[0.1em] left-0 h-[1.1em] w-px bg-kit-ink" style={{ opacity: caretOn ? 1 : 0 }} />
        </span>
      </div>
    </div>
  )
}
