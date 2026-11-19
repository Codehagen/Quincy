"use client"

import * as React from "react"

import { Button } from "@/components/kit"
import { findMainTrack, sceneDurationUs } from "@/lib/editor/timeline"
import type { Scene, VideoElement } from "@/lib/editor/types"

import type { Filmstrip as FilmstripSheet } from "./studio"
import { ClipFace, formatClockTenths } from "./studio-parts"

/**
 * Three cuts, as three spines in the lanes panel (plans/036, phase D; lab
 * piece 53). The preview above shows the lead cut large; here each cut is
 * its spine and its caption lane, drawn small enough that all three fit.
 *
 * **Every spine is a target.** Clips carry `data-target="element:<id>"`, the
 * lanes `track:<id>`, the frame badge `control:frame`, and the whole spine
 * sits in `data-cut-scene`, which is where its cursor looks things up: the
 * three cuts share the take's element ids, so a lookup is scoped to its cut.
 *
 * **The lead is the lead.** The recommended cut sits first on the object
 * surface with its elevation; B and C sit flatter and quieter, so the
 * hierarchy reads before any word does.
 *
 * **A spine clip is a lane clip, smaller.** Each draws through `ClipFace`,
 * the same frames-over-waveform the main lane draws, at the spine's height
 * (36px for the lead, 28px for B and C): tiles keep their aspect, so a
 * narrow clip shows fewer, and the wave takes the same share of the height.
 * The width they need is measured once per resize, never per frame; before
 * that, server and client both draw the empty frame row.
 *
 * Clips are placed with `translate` in container units, so when a gap
 * closes the clips after it slide (one move, 200 ms) and nothing re-lays out
 * per frame. Under reduced motion they move at once.
 */

export type CutView = {
  sceneId: string
  letter: string
  name: string
  where: string
}

export function CutSpines({
  cuts,
  scenes,
  recommendedId,
  onOpen,
  disabled,
  filmstrips,
  seekIndex,
}: {
  cuts: readonly CutView[]
  scenes: readonly Scene[]
  /** Frame sheets by media id, as the main lane gets them. */
  filmstrips: Record<string, FilmstripSheet | null>
  /** The take's peaks; null draws the clips without a wave. */
  seekIndex: { values: number[]; intervalUs: number } | null
  /** The cut Quincy recommends, once it has said so. */
  recommendedId: string | null
  /** Open one cut in the full lanes. */
  onOpen: (sceneId: string) => void
  disabled?: boolean
}) {
  return (
    <ol aria-label="Three cuts" className="flex flex-col gap-2 p-1">
      {cuts.map((cut, index) => {
        const scene = scenes.find((s) => s.id === cut.sceneId)
        if (!scene) return null
        const lead = index === 0
        return (
          <li
            key={cut.sceneId}
            data-cut-scene={cut.sceneId}
            className={`flex flex-col gap-1.5 rounded-kit-object p-1.5 ${
              lead ? "bg-kit-object shadow-kit-object" : "shadow-kit-control"
            }`}
          >
            <Spine
              scene={scene}
              cut={cut}
              lead={lead}
              recommended={recommendedId === cut.sceneId}
              onOpen={onOpen}
              disabled={disabled}
              filmstrips={filmstrips}
              seekIndex={seekIndex}
            />
          </li>
        )
      })}
    </ol>
  )
}

function Spine({
  scene,
  cut,
  lead,
  recommended,
  onOpen,
  disabled,
  filmstrips,
  seekIndex,
}: {
  scene: Scene
  cut: CutView
  lead: boolean
  recommended: boolean
  onOpen: (sceneId: string) => void
  disabled?: boolean
  filmstrips: Record<string, FilmstripSheet | null>
  seekIndex: { values: number[]; intervalUs: number } | null
}) {
  const laneRef = React.useRef<HTMLDivElement | null>(null)
  const laneWidth = useWidth(laneRef)
  // The lane's height less the clip's 2px inset top and bottom.
  const clipHeight = lead ? 36 : 28
  const spanUs = Math.max(1, sceneDurationUs(scene))
  const spine = findMainTrack(scene)
  const captions = scene.tracks.find((t) => t.kind === "caption")
  const canvas = scene.canvas
  const shape = !canvas ? "Source" : canvas.width < canvas.height ? "9:16" : canvas.width === canvas.height ? "1:1" : "16:9"

  return (
    <>
      <div className="flex items-center gap-2 px-1.5">
        <span className={`text-kit-meta font-kit-strong ${lead ? "text-kit-ink" : "text-kit-ink-muted"}`}>{cut.name}</span>
        {recommended ? <span className="text-kit-meta text-kit-ink-muted">Recommended</span> : null}
        <span className="ml-auto flex items-center gap-2 text-kit-mono-sm text-kit-ink-muted tabular-nums">
          <span data-target="control:frame" className="rounded-kit-chip px-1">
            {shape}
          </span>
          {formatClockTenths(sceneDurationUs(scene))}
        </span>
        <Button size="xs" onClick={() => onOpen(cut.sceneId)} disabled={disabled} aria-label={`Open ${cut.name} in the lanes`}>
          Open
        </Button>
      </div>

      {spine ? (
        <div
          ref={laneRef}
          data-target={`track:${spine.id}`}
          data-lane-kind="video"
          className={`relative overflow-hidden rounded-kit-control bg-kit-well [container-type:inline-size] ${lead ? "h-10" : "h-8"}`}
        >
          {spine.elements.map((clip) => {
            const video = clip.kind === "video" ? (clip as VideoElement) : null
            return (
              <div
                key={clip.id}
                data-target={`element:${clip.id}`}
                className="cut-spine-clip absolute inset-y-0.5 left-0 overflow-hidden rounded-kit-chip bg-kit-object shadow-kit-control"
                style={{
                  width: `calc(${(clip.durationUs / spanUs) * 100}% - 2px)`,
                  ["--x" as string]: clip.startUs / spanUs,
                }}
              >
                <ClipFace
                  strip={video ? (filmstrips[video.mediaId] ?? null) : null}
                  wave={video ? seekIndex : null}
                  trimStartUs={video?.trimStartUs ?? 0}
                  trimEndUs={video?.trimEndUs ?? 0}
                  widthPx={laneWidth > 0 ? Math.max(0, (clip.durationUs / spanUs) * laneWidth - 2) : 0}
                  heightPx={clipHeight}
                />
              </div>
            )
          })}
        </div>
      ) : null}

      {captions ? (
        <div
          data-target={`track:${captions.id}`}
          data-lane-kind="caption"
          className="relative h-2.5 overflow-hidden rounded-kit-chip [container-type:inline-size]"
        >
          <span data-target="control:captions" aria-hidden className="pointer-events-none absolute inset-0" />
          {captions.elements.map((caption) => (
            <span
              key={caption.id}
              className="cut-spine-clip absolute inset-y-0 left-0 rounded-[2px] bg-kit-ink-muted opacity-40"
              style={{
                width: `max(1px, calc(${(caption.durationUs / spanUs) * 100}% - 1px))`,
                ["--x" as string]: caption.startUs / spanUs,
              }}
            />
          ))}
        </div>
      ) : null}
    </>
  )
}

/** An element's width, read on resize only; 0 until measured. */
function useWidth(ref: React.RefObject<HTMLElement | null>): number {
  const [width, setWidth] = React.useState(0)
  React.useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref])
  return width
}
