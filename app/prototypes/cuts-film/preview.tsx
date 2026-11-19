"use client"

import { useLayoutEffect, useRef } from "react"
import { cutX } from "./cut-time"
import { easeInOut, lerp, progress } from "./motion"
import { CAPTIONS, CUT_S, KEPT, TAKE_URL } from "./take"
import { CUTS, landed } from "./three-run"

// The preview: the owner's take, playing the cut, seeked to the film's clock every frame (the render waits for
// the seek). Captions burn in once they have landed; once cut A's push-in lands, the strong line pushes in.

/** The source second the preview shows at `t` ms: the kept stretches end to end, looping. */
export function sourceAt(t: number) {
  let s = (t / 1000) % CUT_S
  for (const [a, b] of KEPT) {
    if (s < b - a) return a + s
    s -= b - a
  }
  return KEPT[0]![0]
}

const ZOOM_AT = landed(CUTS[0]!, (w) => w.kind === "zoom")
const STRONG = [11.98, 17.82]

export function Preview({ t, captionsAt }: { t: number; captionsAt: number }) {
  const video = useRef<HTMLVideoElement>(null)
  const s = sourceAt(t)
  useLayoutEffect(() => {
    const v = video.current
    if (v && Math.abs(v.currentTime - s) > 0.001) v.currentTime = s
  }, [s])
  const line = t >= captionsAt ? CAPTIONS.find((c) => s >= c.from && s < c.to) : undefined
  // The push-in: eased over 600 ms when it lands, then on the strong line only (in by 400 ms of cut time).
  const inLine = s >= STRONG[0]! && s < STRONG[1]! ? easeInOut(Math.min(1, (cutX(s) - cutX(STRONG[0]!)) / 0.4)) : 0
  const zoom = lerp(1, 1.16, easeInOut(progress(t, ZOOM_AT, 600)) * inLine)
  return (
    <div data-film-region="preview" className="relative h-full overflow-hidden rounded-kit-control bg-kit-ink shadow-kit-object" style={{ aspectRatio: "9 / 16" }}>
      <video ref={video} src={TAKE_URL} muted playsInline preload="auto" className="size-full object-cover" style={{ scale: zoom === 1 ? undefined : zoom.toFixed(4) }} />
      {line ? (
        <span
          className="absolute inset-x-4 bottom-10 text-center text-[17px] leading-tight font-kit-strong text-balance text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.6)]"
          style={{ opacity: progress(t, captionsAt, 200) }}
        >
          {line.text}
        </span>
      ) : null}
    </div>
  )
}
