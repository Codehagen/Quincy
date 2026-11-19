"use client"

import { useEffect, useState } from "react"
import { ExportButton } from "@/components/editor/export-button"
import { ProjectName } from "@/components/editor/project-name"
import type { MediaEntry } from "@/components/editor/studio"
import { StudioFrame } from "@/components/editor/studio-frame"
import { StudioLibrary } from "@/components/editor/studio-library"
import { PlayButton, formatClock } from "@/components/editor/studio-parts"
import { Chat } from "./chat"
import { RECOMMEND_AT } from "./chat-times"
import { MainLane } from "./lane"
import { MAIN_PARK } from "./main-run"
import { cutX } from "./cut-time"
import { swing } from "./parts"
import { Preview, sourceAt } from "./preview"
import { STRIP, TAKE_URL, TAKE_US, loadWave, waveNow } from "./take"
import { ThreeCuts } from "./three"
import { SPINES_AT } from "./three-run"
import { AT, CAPTIONS_AT, DROP_AT, RUN_AT } from "./timeline"

// The whole editor as the product lays it out (StudioFrame: top bar, tool rail with the media library, preview,
// the side rail, the timeline card, the chat margin), every slot filled from the film's clock.

/** The desk's own size in CSS px; the camera scales it onto the 1280 × 720 stage. */
export const DESK_W = 1440
export const DESK_H = 810

const MEDIA: MediaEntry[] = [
  { id: "take", filename: "my-take.mp4", durationUs: TAKE_US, width: 432, height: 768, fps: 30, rotation: 0, hasAudio: true, proxyUrl: TAKE_URL, seekIndexUrl: null, filmstrip: STRIP, reading: null },
]

export function useWave() {
  const [wave, setWave] = useState(waveNow)
  useEffect(() => {
    void loadWave().then(setWave)
  }, [])
  return wave
}

const css = (s: React.CSSProperties) =>
  Object.entries(s)
    .map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => `-${m.toLowerCase()}`)}:${v}`)
    .join(";")

export function Desk({ t }: { t: number }) {
  const wave = useWave()
  const three = t >= AT.three + 150
  const running = (t >= RUN_AT && t < MAIN_PARK) || (t >= AT.three + 800 && t < RECOMMEND_AT - 1500)
  return (
    <div data-desk className="relative overflow-hidden bg-kit-ground" style={{ width: DESK_W, height: DESK_H }}>
      <StudioFrame
        name={<ProjectName name="My take" onRename={() => {}} />}
        exportAction={<ExportButton state={{ status: "idle" }} onStart={() => {}} onCancel={() => {}} />}
        tool="media"
        onToolChange={() => {}}
        panel={<StudioLibrary media={MEDIA} />}
        preview={<Preview t={t} captionsAt={CAPTIONS_AT} />}
        side="chat"
        onSideChange={() => {}}
        chat={<Chat t={t} />}
        transcript={null}
        running={running}
        transport={
          <div className="flex items-center gap-3">
            <PlayButton playing onToggle={() => {}} size="sm" />
            <span className="text-kit-small text-kit-ink-muted tabular-nums">{formatClock(cutX(sourceAt(t)) * 1e6)}</span>
          </div>
        }
      >
        <div data-film-region="lanes" className="h-[262px]">
          {!three ? (
            <div className="pt-6">
              <MainLane t={t} wave={wave} dropAt={DROP_AT} captionsAt={CAPTIONS_AT} />
            </div>
          ) : (
            <ThreeCuts t={t} wave={wave} recommended={t >= RECOMMEND_AT} rowStyle={(i) => css(swing(t, SPINES_AT + i * 80, { tilt: -2, y: 22 }))} />
          )}
        </div>
      </StudioFrame>
    </div>
  )
}
