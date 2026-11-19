/*
 * A clip's filmstrip with its waveform under it, on the real editor's model
 * (components/editor/studio-parts.tsx: Filmstrip, ClipWaveform):
 *
 * - Tiles are a fixed width and keep their shape; a narrow clip shows fewer
 *   tiles, and the clip's edge cuts the last one, never squashes it.
 * - Each tile shows the frame from the middle of the stretch of source it
 *   stands for, so a tile in the push-in range shows the pushed-in framing.
 * - The waveform is the clip's own slice of the source, drawn inside the
 *   clip under the frames.
 *
 * The lab has no real frames, so a tile is the preview's grey founder,
 * reframed a little from second to second so it reads as frames, not as
 * wallpaper. Everything is integer or fixed-decimal arithmetic: the server
 * and the client draw the same strip (no hydration mismatch).
 */

import { HOOK } from "../round-1/fixture"
import { Waveform } from "../round-1/parts"

export const FILM_H = 36
export const WAVE_H = 16
export const CLIP_H = FILM_H + WAVE_H
const TILE_W = 30

const ZOOM = [1, 1.04, 1.08, 1.03] as const
const DRIFT = [0, -3, 2, -1] as const

/** One frame of the take at source second `t`, as a small picture. */
function Frame({ t }: { t: number }) {
  const s = Math.floor(t)
  const pushed = t >= HOOK.at && t < HOOK.end
  const z = pushed ? 1.28 : ZOOM[s % ZOOM.length]
  const dx = DRIFT[Math.floor(s / 2) % DRIFT.length]
  const tx = (80 - 80 * z + dx).toFixed(2)
  const ty = (70 - 70 * z).toFixed(2)
  return (
    <svg width={TILE_W} height={FILM_H} viewBox="0 0 160 160" preserveAspectRatio="xMidYMid slice" className="block shrink-0">
      <rect width="160" height="160" className="fill-kit-stage" />
      <g transform={`translate(${tx} ${ty}) scale(${z})`}>
        <rect x="104" y="22" width="44" height="54" rx="3" className="fill-kit-object" />
        <rect x="104" y="98" width="70" height="3" className="fill-kit-chrome" />
        <path d="M34 160c2-26 18-40 46-40s44 14 46 40Z" className="fill-kit-ink-muted" />
        <rect x="72" y="104" width="16" height="18" rx="6" className="fill-kit-chrome" />
        <ellipse cx="80" cy="84" rx="19" ry="23" className="fill-kit-chrome" />
        <path d="M61 80c0-16 8-25 19-25s20 8 20 22c-6-7-14-9-22-9s-12 4-17 12Z" className="fill-kit-ink-muted" />
      </g>
      {/* A hairline between frames, as on film. */}
      <rect x="159" width="1" height="160" className="fill-kit-object" />
    </svg>
  )
}

export function ClipFilm({ from, to, width }: { from: number; to: number; width: number }) {
  const count = Math.max(1, Math.ceil(width / TILE_W))
  const span = Math.max(0.001, to - from)
  return (
    <>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 flex overflow-hidden" style={{ height: FILM_H }}>
        {Array.from({ length: count }, (_, i) => {
          // The middle of the source this tile stands for.
          const t = Math.min(to - 0.01, from + Math.min(1, ((i + 0.5) * TILE_W) / Math.max(width, 1)) * span)
          return <Frame key={i} t={t} />
        })}
      </div>
      <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center overflow-hidden bg-kit-object px-0.5" style={{ height: WAVE_H }}>
        <Waveform from={from} to={to} width={Math.max(4, width - 4)} height={WAVE_H - 4} />
      </div>
    </>
  )
}
