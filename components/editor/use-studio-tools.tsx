"use client"

import * as React from "react"

import { keepCorrections } from "@/lib/editor/correct-words"
import { captionRules } from "@/lib/editor/document"
import { setSpeed } from "@/lib/editor/edits"
import { toEdl, toFcpxml } from "@/lib/editor/interchange"
import { layoutBox, setBox, type LayoutKey } from "@/lib/editor/layout"
import type { EditOp } from "@/lib/editor/ops"
import { moveElement, placeMedia, type PlaceAs } from "@/lib/editor/placement"
import {
  applyCaptionPreset,
  applyLookPreset,
  CAPTION_PRESETS,
  type CaptionPreset,
  type LookPreset,
} from "@/lib/editor/presets"
import { nameSpeaker, speakerLabel, speakerNumbers } from "@/lib/editor/speakers"
import { cuesToWords, parseSubtitles, subtitleCues, toSrt, toVtt } from "@/lib/editor/subtitles"
import { findMainTrack } from "@/lib/editor/timeline"
import { us } from "@/lib/editor/time"
import { addText, editText, positionText } from "@/lib/editor/titles"
import { addCaptions } from "@/lib/editor/tools"
import { setTransition, previousClip } from "@/lib/editor/transitions"
import type {
  AudioElement,
  Scene,
  TextElement,
  TimelineElement,
  Track,
  TransitionKind,
  VideoDocument,
  VideoElement,
} from "@/lib/editor/types"

import type { ExportFile } from "./export-button"
import type { MediaEntry } from "./studio"
import type { StudioTool } from "./studio-frame"
import { StudioLibrary } from "./studio-library"
import {
  StudioInspector,
  StudioSettingsPanel,
  StudioTextPanel,
  StudioTransitionsPanel,
  type JoinRow,
  type TextRow,
} from "./studio-panels"
import { SelectedOnFrame, type FrameRect, type HandleSelection } from "./preview-handles"
import { download, safeName } from "./use-export"
import type { Player } from "./use-player"

/**
 * The editing basics (plan 042) as the studio uses them: the library's
 * media, placing and moving things on the lanes, the text, transitions and
 * settings panels, the selected thing's properties, and the files the export
 * dialog hands out.
 *
 * Kept out of studio.tsx because each of these is a builder from lib/editor
 * plus the one line that commits it, and the studio is already the place
 * where everything meets. Every hand edit still goes through the studio's
 * `commit`, so the run lock and one-undo-per-gesture hold here too.
 */
export function useStudioTools({
  document,
  scene,
  canvas,
  fps,
  media,
  setMedia,
  commit,
  player,
  selectedId,
  running,
  fetcher,
}: {
  document: VideoDocument
  scene: Scene
  canvas: { width: number; height: number }
  fps: number
  media: Record<string, MediaEntry>
  setMedia: React.Dispatch<React.SetStateAction<Record<string, MediaEntry>>>
  commit: (ops: EditOp[]) => void
  player: Player
  selectedId: string | null
  running: boolean
  fetcher: typeof fetch
}) {
  const spine = findMainTrack(scene)

  /* ── Library ── */

  const addToLibrary = React.useCallback(
    async (assetId: string) => {
      const response = await fetcher(`/api/editor/assets/${assetId}/entry`)
      if (!response.ok) throw new Error("The file was added but could not be opened.")
      const entry = (await response.json()) as MediaEntry
      setMedia((current) => ({ ...current, [entry.id]: entry }))
      const library = document.metadata.library ?? []
      if (!library.includes(entry.id))
        commit([{ op: "update_metadata", patch: { library: [...library, entry.id] } }])
    },
    [fetcher, setMedia, document.metadata.library, commit]
  )

  const place = React.useCallback(
    (entry: MediaEntry, as: PlaceAs, atUs?: number, preferTrackId?: string) => {
      commit(
        placeMedia(
          scene,
          { ...entry, kind: entry.kind ?? "video" },
          {
            as,
            atUs: atUs ?? player.readPlayhead(),
            author: "user",
            preferTrackId,
          }
        )
      )
    },
    [commit, scene, player]
  )

  const dropMedia = React.useCallback(
    (mediaId: string, atUs: number, trackId: string | null) => {
      const entry = media[mediaId]
      if (!entry) return
      const kind = entry.kind ?? "video"
      const lane = scene.tracks.find((track) => track.id === trackId)
      if (kind === "image") return place(entry, "overlay", atUs)
      if (kind === "audio") return place(entry, "music", atUs, lane?.kind === "audio" ? lane.id : undefined)
      if (lane && lane.id === spine?.id) return place(entry, "spine", atUs)
      if (lane?.kind === "audio") return place(entry, "music", atUs, lane.id)
      return place(entry, "overlay", atUs, lane?.kind === "video" ? lane.id : undefined)
    },
    [media, scene, spine?.id, place]
  )

  const moveOverlay = React.useCallback(
    (trackId: string, elementId: string, startUs: number, toTrackId: string | null) =>
      commit(moveElement(scene, trackId, elementId, { startUs, toTrackId: toTrackId ?? undefined })),
    [commit, scene]
  )

  /* ── The selected thing ── */

  const selected = React.useMemo(() => findSelected(scene, selectedId), [scene, selectedId])

  const patchSelected = React.useCallback(
    (patch: Record<string, unknown>) => {
      if (!selected) return
      commit([
        {
          op: "update_element",
          sceneId: scene.id,
          trackId: selected.track.id,
          elementId: selected.element.id,
          patch,
          target: {
            action: "press",
            kind: "element",
            trackId: selected.track.id,
            elementId: selected.element.id,
          },
        },
      ])
    },
    [commit, scene.id, selected]
  )

  const canvasAspect = canvas.width / canvas.height

  const inspector = selected ? (
    <StudioInspector
      element={selected.element}
      disabled={running}
      onSpeed={(speed) => commit(setSpeed(scene, selected.track.id, selected.element.id, speed))}
      onVolume={(volume) => patchSelected({ volume, muted: volume === 0 })}
      onDucking={(enabled) => {
        const element = selected.element as AudioElement
        patchSelected({
          ducking: {
            enabled,
            amount: element.ducking?.amount ?? 0.35,
            attackUs: element.ducking?.attackUs ?? 150_000,
            releaseUs: element.ducking?.releaseUs ?? 400_000,
          },
        })
      }}
      onLayout={(key: LayoutKey) => {
        const entry = "mediaId" in selected.element ? media[selected.element.mediaId] : undefined
        const sourceAspect = entry?.width && entry?.height ? entry.width / entry.height : canvasAspect
        commit(
          setBox(scene, selected.track.id, selected.element.id, layoutBox(key, { canvasAspect, sourceAspect }))
        )
      }}
      onOpacity={(opacity) => patchSelected({ opacity })}
    />
  ) : null

  /* ── Text ── */

  const texts: TextRow[] = React.useMemo(
    () =>
      scene.tracks
        .flatMap((track) =>
          track.elements
            .filter((element): element is TextElement => element.kind === "text")
            .map((element) => ({
              id: element.id,
              trackId: track.id,
              role: element.role,
              content: element.content,
              subtitle: element.subtitle,
              startUs: element.startUs,
            }))
        )
        .sort((a, b) => a.startUs - b.startUs),
    [scene]
  )

  /* ── Transitions ── */

  const joins: JoinRow[] = React.useMemo(() => {
    const rows: JoinRow[] = []
    for (const track of scene.tracks) {
      if (track.kind !== "video") continue
      for (const element of track.elements) {
        if (element.kind !== "video" || !previousClip(track, element)) continue
        rows.push({
          trackId: track.id,
          elementId: element.id,
          atUs: element.startUs,
          kind: element.transition?.kind ?? null,
          durationUs: element.transition?.durationUs ?? 500_000,
        })
      }
    }
    return rows.sort((a, b) => a.atUs - b.atUs)
  }, [scene])

  const onTransition = React.useCallback(
    (join: JoinRow, kind: TransitionKind | null, durationUs: number): string | null => {
      if (kind === null && join.kind === null) return null
      const result = setTransition(scene, join.trackId, join.elementId, kind, durationUs)
      if (result.ops.length > 0) commit(result.ops)
      return result.reason
    },
    [commit, scene]
  )

  /* ── Settings ── */

  const hasCaptions = scene.tracks.some(
    (track) => track.kind === "caption" && track.elements.length > 0
  )
  const [captionPreset, setCaptionPreset] = React.useState<CaptionPreset["key"] | null>(null)
  const [look, setLook] = React.useState<LookPreset["key"] | null>(null)
  const [importNote, setImportNote] = React.useState<string | null>(null)

  const onCaptionPreset = React.useCallback(
    async (key: CaptionPreset["key"]) => {
      setCaptionPreset(key)
      const preset = CAPTION_PRESETS.find((candidate) => candidate.key === key)
      const clip = spine?.elements.find((element): element is VideoElement => element.kind === "video")
      const first = scene.tracks
        .filter((track) => track.kind === "caption")
        .flatMap((track) => track.elements)
        .find((element) => element.kind === "caption")
      const regroup =
        preset?.style.wordsPerSegment !== undefined &&
        first?.kind === "caption" &&
        first.style.wordsPerSegment !== preset.style.wordsPerSegment
      if (regroup && clip && first?.kind === "caption") {
        // Grouping comes from the transcript; rebuilding keeps the words
        // bound to the recording, with the preset's style on every segment.
        const response = await fetcher(`/api/editor/assets/${clip.mediaId}/transcript`).catch(() => null)
        if (response?.ok) {
          const { words } = (await response.json()) as { words: Parameters<typeof addCaptions>[1] }
          commit(
            keepCorrections(
              scene,
              addCaptions(scene, words, {
                mediaId: clip.mediaId,
                author: "user",
                rules: captionRules(document),
                style: { ...first.style, ...preset.style },
              })
            )
          )
          return
        }
      }
      commit(applyCaptionPreset(scene, key))
    },
    [commit, scene, spine, fetcher, document]
  )

  const onImportSubtitles = React.useCallback(
    async (file: File) => {
      setImportNote(null)
      const clip = spine?.elements.find((element): element is VideoElement => element.kind === "video")
      if (!clip) {
        setImportNote("There is no recording to put the captions on.")
        return
      }
      if (file.size > 2_000_000) {
        setImportNote("That file is too large to be subtitles.")
        return
      }
      const cues = parseSubtitles(await file.text())
      if (cues.length === 0) {
        setImportNote("No subtitles were found in that file.")
        return
      }
      commit(
        addCaptions(scene, cuesToWords(cues), {
          mediaId: clip.mediaId,
          author: "user",
          rules: 1,
          wordsPerSegment: 4,
        })
      )
      setImportNote(
        `${cues.length} subtitles, timed against the recording. They follow the cut from here.`
      )
    },
    [commit, scene, spine]
  )

  const speakers = React.useMemo(
    () =>
      speakerNumbers(scene).map((speaker) => ({
        speaker,
        name: document.metadata.speakers?.[String(speaker)] ?? "",
        placeholder: speakerLabel(speaker, undefined),
      })),
    [scene, document.metadata.speakers]
  )

  const panelFor = (tool: StudioTool | null, fallback: React.ReactNode): React.ReactNode => {
    const list = Object.values(media)
    switch (tool) {
      case "media":
      case "images":
      case "sounds":
        return (
          <StudioLibrary
            media={list}
            filter={tool === "images" ? "image" : tool === "sounds" ? "audio" : undefined}
            onAdded={addToLibrary}
            onPlace={(entry, as) => place(entry, as)}
            disabled={running}
          />
        )
      case "text":
        return (
          <StudioTextPanel
            texts={texts}
            disabled={running}
            onAdd={(role, content, subtitle) =>
              commit(
                addText(scene, {
                  role,
                  content,
                  subtitle,
                  atUs: role === "lower_third" ? player.readPlayhead() : undefined,
                  author: "user",
                })
              )
            }
            onEdit={(id, patch) => commit(editText(scene, id, patch))}
            onRemove={(trackId, elementId) =>
              commit([
                {
                  op: "remove_element",
                  sceneId: scene.id,
                  trackId,
                  elementId,
                  target: { action: "press", kind: "track", trackId },
                },
              ])
            }
            onSeek={(atUs) => player.seekTo(us(Math.round(atUs)))}
          />
        )
      case "transitions":
        return (
          <StudioTransitionsPanel
            joins={joins}
            onSet={onTransition}
            onSeek={(atUs) => player.seekTo(us(Math.round(atUs)))}
            disabled={running}
          />
        )
      case "settings":
        return (
          <StudioSettingsPanel
            hasCaptions={hasCaptions}
            captionPreset={captionPreset}
            onCaptionPreset={(key) => void onCaptionPreset(key)}
            look={look}
            onLook={(key) => {
              setLook(key)
              commit(applyLookPreset(scene, key))
            }}
            speakers={speakers}
            onNameSpeaker={(speaker, name) => commit(nameSpeaker(document.metadata, speaker, name))}
            background={document.settings.background.color}
            onBackground={(color) =>
              commit([
                {
                  op: "update_settings",
                  patch: { background: { ...document.settings.background, color } },
                },
              ])
            }
            onImportSubtitles={(file) => void onImportSubtitles(file)}
            importNote={importNote}
            disabled={running}
          />
        )
      default:
        return fallback
    }
  }

  /* ── Export files ── */

  const cues = React.useMemo(() => subtitleCues(scene), [scene])
  const hasVideo = Boolean(spine?.elements.some((element) => element.kind === "video"))

  const exportFiles = {
    srt: cues.length > 0,
    vtt: cues.length > 0,
    chapters: (document.metadata.chapters?.length ?? 0) > 0,
    edl: hasVideo,
    fcpxml: hasVideo,
  } satisfies Record<ExportFile, boolean>

  const exportFile = React.useCallback(
    (file: ExportFile, chapterText: string | null) => {
      const name = safeName(document.metadata.name)
      const names = Object.fromEntries(
        Object.entries(media).map(([id, entry]) => [id, { filename: entry.filename, durationUs: entry.durationUs }])
      )
      const text = (body: string, type: string, extension: string) =>
        download(new Blob([body], { type }), `${name}.${extension}`)
      switch (file) {
        case "srt":
          return text(toSrt(cues, document.metadata.speakers), "application/x-subrip", "srt")
        case "vtt":
          return text(toVtt(cues, document.metadata.speakers), "text/vtt", "vtt")
        case "chapters":
          return chapterText ? text(chapterText, "text/plain", "chapters.txt") : undefined
        case "edl":
          return text(toEdl(scene, { title: document.metadata.name, fps, media: names }), "text/plain", "edl")
        case "fcpxml":
          return text(
            toFcpxml(scene, {
              title: document.metadata.name,
              fps,
              width: canvas.width,
              height: canvas.height,
              media: names,
            }),
            "application/xml",
            "fcpxml"
          )
      }
    },
    [cues, document.metadata, media, scene, fps, canvas]
  )

  /* ── Handles on the preview ── */

  const handleSelection: HandleSelection | null = !selected
    ? null
    : selected.element.kind === "text"
      ? { kind: "text", element: selected.element }
      : (selected.element.kind === "video" && selected.track.id !== spine?.id) ||
          selected.element.kind === "image"
        ? { kind: "box", element: selected.element as VideoElement }
        : null

  const previewOverlay =
    handleSelection && !running
      ? (frame: FrameRect, container: HTMLElement | null) => (
          <SelectedOnFrame
            player={player}
            selection={handleSelection}
            frame={frame}
            canvas={canvas}
            container={container}
            onBox={(box) =>
              selected && commit(setBox(scene, selected.track.id, selected.element.id, box))
            }
            onTextMove={(position) =>
              selected && commit(positionText(scene, selected.element.id, position))
            }
            onTextEdit={(content) =>
              selected && commit(editText(scene, selected.element.id, { content }))
            }
          />
        )
      : undefined

  return {
    previewOverlay,
    panelFor,
    inspector,
    dropMedia,
    moveOverlay,
    exportFiles,
    exportFile,
    selected,
  }
}

export type SelectedThing = { track: Track; element: TimelineElement } | null

function findSelected(scene: Scene, selectedId: string | null): SelectedThing {
  if (!selectedId) return null
  for (const track of scene.tracks) {
    const element = track.elements.find((candidate) => candidate.id === selectedId)
    if (element) return { track, element }
  }
  return null
}
