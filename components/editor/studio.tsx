"use client"

import * as React from "react"
import {
  AudioWave01Icon,
  Delete02Icon,
  Redo02Icon,
  ScissorIcon,
  Undo02Icon,
  KeyboardIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"

import { chapterLines, placeChapters } from "@/lib/editor/chapters"
import {
  captionRules,
  currentScene,
  LANDSCAPE_CANVAS,
  SQUARE_CANVAS,
  VERTICAL_CANVAS,
} from "@/lib/editor/document"
import { effectSpec, stepAmount } from "@/lib/editor/effect-catalogue"
import { effectChips, type EffectChip } from "@/lib/editor/effect-lane"
import {
  copyElement,
  duplicateElement,
  pasteElement,
  type ClipboardItem,
} from "@/lib/editor/clipboard"
import { hintFor, keyActionFor } from "@/lib/editor/keymap"
import { placeMarkers, toggleMarker } from "@/lib/editor/markers"
import { setAudioFades } from "@/lib/editor/audio-fades"
import {
  applyEffect,
  cropSpine,
  deleteAndRipple,
  deleteTimelineRange,
  removeElements,
  deleteSpeech,
  mainTrackId,
  moveEffect,
  punchIn,
  reframe,
  removeEffect,
  removeEffectsOfType,
  resizeEffect,
  setEffectAmount,
  splitAt,
  setVoice,
  trimEdge,
} from "@/lib/editor/edits"
import { findMainTrack, sceneDurationUs } from "@/lib/editor/timeline"
import { addCaptions, restoreSpeech } from "@/lib/editor/tools"
import {
  cleanUpReview,
  cutAways,
  reviewCuts,
  type CutAway,
  type ReviewItem,
} from "@/lib/editor/transcript-edit"
import type { Word } from "@/lib/editor/transcript"
import type { TakeReading } from "@/lib/editor/reading"
import { us } from "@/lib/editor/time"
import {
  sourceRangesFor,
  timelineSpan,
  transcriptLines,
  transcriptWords,
  wordsBetween,
} from "@/lib/editor/transcript-view"
import type {
  EffectType,
  VideoDocument,
  VideoElement,
} from "@/lib/editor/types"
import { cn } from "@/lib/utils"

import { AgentCursors } from "./agent-cursor/agent-cursor"
import { CutSpines, type CutView } from "./cut-spines"
import type { CutsData, RecommendData } from "@/lib/editor/stream-parts"
import { useDirector } from "./agent-cursor/director"
import { StudioChat, type StudioHarness } from "./studio-chat"
import { useStrongLine } from "./use-strong-line"
import { StudioEffects } from "./studio-effects"
import {
  DeskIconButton,
  FrameMenu,
  SceneMenu,
  TimelineZoom,
  type FrameShape,
} from "./desk-controls"
import { ProjectName } from "./project-name"
import {
  StudioFrame,
  useWideDesk,
  type SideView,
  type StudioTool,
} from "./studio-frame"
import { useStudioTools } from "./use-studio-tools"
import {
  correctWords,
  findWords,
  replaceWords,
} from "@/lib/editor/correct-words"
import { speakerLabel, speakerNumbers } from "@/lib/editor/speakers"
import { formatClockTenths, PlayButton, PlayheadClock } from "./studio-parts"
import { StudioLanes, type TrimDrag } from "./studio-lanes"
import { StudioTranscript, type TranscriptSelection } from "./studio-transcript"
import type { CompositionMedia } from "./composition"
import { ExportButton } from "./export-button"
import { StudioPreview } from "./studio-preview"
import { cycleRate, rateLabel, stepRate } from "./playback-rate"
import { useZoom } from "./studio-zoom"
import { ArrivalPasses } from "./arrival/arrival"
import { scanPasses } from "./arrival/passes"
import { useArrival } from "./arrival/use-arrival"
import { useDocument } from "./use-document"
import { editorOwnsKey } from "./editor-keys"
import { useExport } from "./use-export"
import { useFrameThrottle } from "./use-frame-throttle"
import { GAP_CLOSE, useReveal } from "./use-reveal"
import { ShortcutSheet } from "./shortcut-sheet"
import { usePlayer, usePlayheadSelector } from "./use-player"

/**
 * The studio: the Console layout from the prototype, on a real document.
 *
 * This composes three things that were built separately and had never met — the
 * chrome (chosen in the prototype, fixture-driven), the document state
 * (use-document, edits.ts) and the player (use-player, real media).
 */

export type MediaEntry = {
  id: string
  filename: string
  /** Absent on entries made before images and music: a video. */
  kind?: "video" | "audio" | "image"
  durationUs: number | null
  width: number | null
  height: number | null
  fps: number | null
  rotation: number
  hasAudio: boolean
  proxyUrl: string | null
  seekIndexUrl: string | null
  /** The cleaned voice (media.ts `voiceCleanArgs`), when one is stored. */
  voiceUrl?: string | null
  filmstrip: Filmstrip | null
  /** The poster frame, or the picture itself for an image. */
  thumbnailUrl?: string | null
  /** What Quincy noticed in the take; null without a transcript. */
  reading: TakeReading | null
}

/**
 * The frames the spine draws, as one sheet plus the numbers needed to slice it.
 *
 * The geometry travels with the URL rather than being a constant, because the
 * sheet is planned from the asset's duration — a fifteen-second clip and a
 * ten-minute talk are sampled at different intervals and the tile count is
 * capped. A constant would be right until the first asset that planned
 * differently.
 */
export type Filmstrip = {
  url: string
  tiles: number
  /** Source microseconds between one tile and the next. */
  intervalUs: number
  tileWidth: number
  tileHeight: number
}

export type SeekIndex = {
  intervalUs: number
  values: number[]
  keyframesUs: number[]
}

export function Studio({
  projectId,
  document: initialDocument,
  revision,
  media: initialMedia,
  localFile,
  harness,
}: {
  projectId: string
  document: VideoDocument
  revision: number
  media: Record<string, MediaEntry>
  /** The File from this session's upload, if the editor was reached that way. */
  localFile?: File | null
  /** Prototype mock only: a local network in place of the routes (studio-chat.tsx). */
  harness?: StudioHarness
}) {
  const {
    document,
    apply,
    applyAgentOps,
    syncRevision,
    awaitSync,
    syncLost,
    undo: undoDocument,
    redo: redoDocument,
    beginRun,
    endRun,
    historyIds,
    runEntry,
    canUndo,
    canRedo,
    save,
    retry,
  } = useDocument(projectId, initialDocument, revision, harness?.fetch)

  /**
   * The project's media. State rather than the prop, because the library adds
   * to it: a file uploaded here is listed (and placeable) without a reload.
   */
  const [media, setMedia] = React.useState(initialMedia)

  /**
   * Undo and redo jump the lanes without the cursor: one crossfade, 150ms
   * (plans/036). The class is re-added on the node so the fade replays on
   * every press without remounting the lanes.
   */
  const lanesRef = React.useRef<HTMLDivElement | null>(null)
  const fadeLanes = React.useCallback(() => {
    const node = lanesRef.current
    if (!node) return
    node.classList.remove("agent-fade")
    void node.offsetWidth
    node.classList.add("agent-fade")
  }, [])
  const undo = React.useCallback(() => {
    undoDocument()
    fadeLanes()
  }, [undoDocument, fadeLanes])
  const redo = React.useCallback(() => {
    redoDocument()
    fadeLanes()
  }, [redoDocument, fadeLanes])

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  /**
   * Clips selected along with `selectedId`: Shift-click or ⌘A. Kept apart so
   * everything that reads one selected clip (the toolbar, the panels) goes on
   * reading the first, and only Delete and the lanes need the rest.
   */
  const [alsoSelected, setAlsoSelected] = React.useState<string[]>([])
  // Read through a ref: the lanes memoise their clips, so a callback that
  // closed over `selectedId` would see the selection from before the first
  // click and treat a Shift-click as a fresh one.
  const selectedRef = React.useRef(selectedId)
  React.useEffect(() => {
    selectedRef.current = selectedId
  }, [selectedId])
  const selectClip = React.useCallback(
    (elementId: string | null, additive = false) => {
      const current = selectedRef.current
      if (!additive || elementId === null || current === null) {
        setSelectedId(elementId)
        setAlsoSelected([])
        return
      }
      if (current === elementId) return
      setAlsoSelected((rest) =>
        rest.includes(elementId)
          ? rest.filter((id) => id !== elementId)
          : [...rest, elementId]
      )
    },
    []
  )
  /**
   * Where the pointer is over the lane, or null. Kept separate from the
   * playhead on purpose: hover previews an instant, clicking commits to it,
   * and the agent never touches either.
   */
  const [hoverUs, setHoverUs] = React.useState<number | null>(null)
  /**
   * The same value for handlers. Split reads where the pointer is at the
   * instant of the press, so it has no reason to be rebuilt every frame the
   * pointer moves — and rebuilding it re-bound the window's key listener with
   * it, sixty times a second, for as long as the pointer was over the lane.
   */
  const hoverRef = React.useRef<number | null>(null)
  const writeHover = React.useCallback((value: number | null) => {
    hoverRef.current = value
    setHoverUs(value)
  }, [])
  // One write per frame. The lane draws its own head from the pointer; this
  // state is for the preview seek and the scrub badge.
  const { schedule: onHover } = useFrameThrottle(writeHover)
  /**
   * A trim edge mid-flight. Held here rather than in the document because a
   * drag is not an edit until it lands — applying every pointermove would be
   * one revision and one undo step per frame of movement.
   */
  const [trim, setTrim] = React.useState<TrimDrag | null>(null)
  const zoom = useZoom()

  const scene = currentScene(document)
  const canvas = scene?.canvas ?? document.settings.canvas
  const trackId = scene ? mainTrackId(scene) : null

  const firstClip = scene ? findMainTrack(scene)?.elements[0] : undefined
  const asset =
    firstClip && "mediaId" in firstClip ? media[firstClip.mediaId] : undefined

  const durationUs = us(scene ? sceneDurationUs(scene) : 0)
  const fps = document.settings.fps

  /** The cut as the starters read it: its frame now, and whether it has captions. */
  const hasCaptions = Boolean(
    scene?.tracks.some((t) => t.kind === "caption" && t.elements.length > 0)
  )
  const chatFrame = React.useMemo(
    () => ({ width: canvas.width, height: canvas.height, hasCaptions }),
    [canvas.width, canvas.height, hasCaptions]
  )

  const player = usePlayer({ fps, durationUs })

  /**
   * The original, played while the proxy is still transcoding.
   *
   * The one idea worth taking from a fully client-side editor: the bytes are
   * already on the machine, so a network round trip before showing them is a
   * wait nobody needed. Revoked on unmount — not revoking leaks the whole file
   * for the life of the document, which on a gigabyte take is the tab's memory.
   */
  const localUrl = React.useMemo(
    () => (localFile ? URL.createObjectURL(localFile) : null),
    [localFile]
  )

  React.useEffect(() => {
    if (!localUrl) return
    return () => URL.revokeObjectURL(localUrl)
  }, [localUrl])

  /**
   * What the composition needs per asset: where to fetch it, and whether it has
   * been through ffmpeg yet.
   */
  /** Cleaned voices fetched this session, by media id (POST …/voice). */
  const [voiceUrls, setVoiceUrls] = React.useState<Record<string, string>>({})

  const compositionMedia = React.useMemo(() => {
    const entries: Record<string, CompositionMedia> = {}

    for (const [id, entry] of Object.entries(media)) {
      entries[id] = {
        proxyUrl: entry.proxyUrl,
        localUrl: id === asset?.id ? localUrl : null,
        rotation: entry.rotation,
        voiceUrl: voiceUrls[id] ?? entry.voiceUrl ?? null,
      }
    }

    return entries
  }, [media, asset?.id, localUrl, voiceUrls])

  /**
   * The frame sheets, by media id.
   *
   * Kept beside `compositionMedia` rather than inside it: the compositor needs
   * a URL to decode and a rotation to correct, and the lane needs a sprite and
   * its geometry. Merging them would hand the export renderer four numbers it
   * has no use for.
   */
  const filmstrips = React.useMemo(() => {
    const sheets: Record<string, MediaEntry["filmstrip"]> = {}
    for (const [id, entry] of Object.entries(media))
      sheets[id] = entry.filmstrip
    return sheets
  }, [media])

  /**
   * Export renders this exact composition, which is the point.
   *
   * Same scene, same media, same canvas as the preview is drawing. There is no
   * second renderer to drift from the first — the failure every editor that
   * grew a separate export path eventually ships.
   */
  const exporter = useExport({
    scene: scene ?? document.scenes[0],
    media: compositionMedia,
    canvas,
    fps,
    durationUs,
    background: document.settings.background.color,
    name: document.metadata.name,
  })

  const [seekIndex, setSeekIndex] = React.useState<SeekIndex | null>(null)

  React.useEffect(() => {
    const url = asset?.seekIndexUrl
    if (!url) return

    let cancelled = false

    fetch(url)
      .then((response) => (response.ok ? response.json() : null))
      .then((index: SeekIndex | null) => {
        if (!cancelled && index) setSeekIndex(index)
      })
      .catch(() => {
        // Degraded rather than broken: without it the clips have no waveform.
      })

    return () => {
      cancelled = true
    }
  }, [asset?.seekIndexUrl])

  /**
   * Hover drives the picture without moving the playhead.
   *
   * Depends on `previewAt` and not on the whole player: the player object
   * carries the playhead, so taking the effect on it would re-run this on every
   * frame of playback — and re-running a seek on every frame of playback is a
   * render loop, not a preview.
   */
  const previewAt = player.previewAt
  React.useEffect(() => {
    previewAt(hoverUs === null ? null : us(Math.round(hoverUs)))
  }, [hoverUs, previewAt])

  /**
   * True while an agent run holds the document.
   *
   * The timeline goes read-only for the seconds a run takes. That is the
   * tradeoff written down in DocumentLock, and it is honest rather than
   * defensive: the server refuses the user's writes while the lock is held, so
   * an editor that kept accepting edits would be collecting work it cannot
   * save.
   */
  const [running, setRunning] = React.useState(false)

  /**
   * The agent's edits, watched rather than discovered.
   *
   * The ops land whole — one tool call is one revision, deliberately — so this
   * is choreography over a finished result, not a simulation of it arriving.
   * It gates nothing: the document changed the moment the ops did, and clicking
   * a clip mid-sweep selects it.
   */
  const { reveal, capture } = useReveal()

  /**
   * The scene as of the last render.
   *
   * `onOps` is handed to useChat and called from a stream callback, so reading
   * the scene through the closure would give whichever render created it. The
   * reveal needs the scene as it is at the instant the ops arrive, or it
   * captures a "before" that is already several edits old.
   */
  const sceneRef = React.useRef(scene)
  React.useEffect(() => {
    sceneRef.current = scene
  })

  /**
   * Quincy's cursor (plans/036). The run's ops reach the document through the
   * director, one press at a time: the press and the change land together,
   * and the clips after a cut slide into the gap (one move, 200ms).
   */
  const deskRef = React.useRef<HTMLDivElement | null>(null)
  const documentRef = React.useRef(document)
  React.useEffect(() => {
    documentRef.current = document
  })
  const sceneById = React.useCallback(
    (id?: string) =>
      id
        ? documentRef.current.scenes.find((s) => s.id === id)
        : sceneRef.current,
    []
  )
  const spanUs = React.useCallback(
    (sceneId?: string) => {
      const target = sceneById(sceneId)
      return target ? sceneDurationUs(target) : 0
    },
    [sceneById]
  )
  /** Where one of three cuts keeps its targets: its spine, so its cursor never finds another cut's. */
  const scopeOf = React.useCallback(
    (sceneId: string) =>
      deskRef.current?.querySelector<HTMLElement>(
        `[data-cut-scene="${CSS.escape(sceneId)}"]`
      ) ?? null,
    []
  )
  const onLand = React.useCallback(
    (beat: { ops: Parameters<typeof applyAgentOps>[0]; sceneId?: string }) => {
      // Before, not after. Reading the scene once the ops have landed records
      // the result and animates nothing. A cut's spine slides on its own.
      if (!beat.sceneId) capture(sceneRef.current, GAP_CLOSE)
      applyAgentOps(beat.ops)
    },
    [capture, applyAgentOps]
  )
  const director = useDirector({ root: deskRef, spanUs, onLand, scopeOf })

  /**
   * Three cuts (plans/036, phase D): while they are on the desk the lanes
   * panel shows their three spines and the preview the lead cut. Opening
   * one puts it in the full lanes; the spines come back from the switcher.
   */
  const [cutSet, setCutSet] = React.useState<{
    cuts: CutView[]
    recommendedId: string | null
  } | null>(null)
  const [cutsShown, setCutsShown] = React.useState(false)

  /** The reading, with the strong line once it has been chosen. */
  const reading = useStrongLine(
    asset?.id,
    asset?.reading ?? null,
    harness?.fetch
  )

  /** The arrival: the reading played once, the first time this take is opened (phase G). */
  const arrival = useArrival({
    assetId: asset?.id ?? null,
    hasReading: reading !== null,
    mode: harness?.arrival,
  })
  const passes = React.useMemo(
    () =>
      reading && asset
        ? scanPasses(reading, {
            width: asset.width,
            height: asset.height,
            rotation: asset.rotation,
            fps: asset.fps,
          })
        : [],
    [reading, asset]
  )

  /** Where the self-check grabs its frames: the scene now, the canvas, the proxies. */
  const look = React.useMemo(
    () => ({
      scene: sceneById,
      canvas,
      proxyUrls: Object.fromEntries(
        Object.entries(media).map(([id, entry]) => [id, entry.proxyUrl])
      ),
    }),
    [canvas, media, sceneById]
  )

  /**
   * "+ Captions from the transcript" by hand: the stored transcript, read
   * once, and the same builder the agent's add_captions uses. Spends nothing.
   */
  const [captionsPending, setCaptionsPending] = React.useState(false)

  /**
   * Every hand edit goes through here, and it is the only place that knows
   * about the lock. Guarding each callback separately is how one of them ends
   * up unguarded — this one is a keyboard shortcut nobody remembers to check.
   */
  const commit = React.useCallback(
    (ops: Parameters<typeof apply>[0]) => {
      if (running) return
      apply(ops)
    },
    [apply, running]
  )

  const studioTools = useStudioTools({
    document,
    scene: scene ?? document.scenes[0],
    canvas,
    fps,
    media,
    setMedia,
    commit,
    player,
    selectedId,
    running,
    fetcher: harness?.fetch ?? fetch,
  })

  const openScene = React.useCallback(
    (sceneId: string) => {
      if (running) return
      commit([{ op: "select_scene", sceneId }])
      setCutsShown(false)
    },
    [commit, running]
  )

  const cutsDesk = React.useMemo(
    () => ({
      onCuts: (data: CutsData) => {
        setCutSet({ cuts: data.cuts, recommendedId: null })
        setCutsShown(true)
      },
      onRecommend: (pick: RecommendData) =>
        setCutSet((prev) =>
          prev ? { ...prev, recommendedId: pick.sceneId } : prev
        ),
      undoCut: (sceneId: string) => commit([{ op: "remove_scene", sceneId }]),
      hasScene: (sceneId: string) =>
        document.scenes.some((s) => s.id === sceneId),
      durationOf: (sceneId: string) => {
        const target = document.scenes.find((s) => s.id === sceneId)
        return target ? sceneDurationUs(target) : 0
      },
      aspectOf: (sceneId: string) => {
        const c =
          document.scenes.find((s) => s.id === sceneId)?.canvas ??
          document.settings.canvas
        return c.width / c.height
      },
    }),
    [commit, document]
  )
  const liveCuts =
    cutSet?.cuts.filter((cut) =>
      document.scenes.some((s) => s.id === cut.sceneId)
    ) ?? []
  const showSpines = cutsShown && liveCuts.length > 0

  const addCaptionsByHand = React.useCallback(async () => {
    const clip = scene
      ? findMainTrack(scene)?.elements.find((e) => e.kind === "video")
      : undefined
    if (!scene || !clip || clip.kind !== "video" || captionsPending) return
    setCaptionsPending(true)
    try {
      const response = await (harness?.fetch ?? fetch)(
        `/api/editor/assets/${clip.mediaId}/transcript`
      )
      if (!response.ok) return
      const { words } = (await response.json()) as { words: Word[] }
      commit(
        addCaptions(scene, words, {
          mediaId: clip.mediaId,
          author: "user",
          rules: captionRules(document),
        })
      )
    } catch {
      // Offline: the button is still there to press again.
    } finally {
      setCaptionsPending(false)
    }
  }, [scene, captionsPending, commit, harness, document])

  /**
   * Cut where the pointer is, and fall back to the playhead when it is not over
   * the lane.
   *
   * Hover wins because of where the hand already is: you find the cut by moving
   * along the timeline watching the preview follow, and at the moment you see
   * it, the pointer is on the frame you want and the playhead is wherever
   * playback last stopped. Splitting at the playhead there means clicking to
   * move it first — which loses the position you had just found, since the
   * click seeks and the preview jumps. The Split *button* has no pointer on the
   * lane, so it gets the playhead, which is the same rule and not a special
   * case: cut at the instant the user is looking at.
   */
  const split = React.useCallback(() => {
    if (!scene || !trackId) return
    // Read at call time, not rendered from: neither the playhead nor the
    // hover is state this reads, and an event handler wants where they are
    // now, not where they last rendered.
    const hover = hoverRef.current
    const at = hover === null ? player.readPlayhead() : us(Math.round(hover))
    commit(splitAt(scene, trackId, at))
  }, [commit, scene, trackId, player])

  const commitTrim = React.useCallback(
    (drag: TrimDrag) => {
      setTrim(null)
      if (!scene) return
      // The drag's own track, not the spine: b-roll and audio trim the same way
      // and would otherwise ripple the wrong lane.
      commit(
        trimEdge(scene, drag.trackId, drag.elementId, drag.edge, drag.deltaUs)
      )
    },
    [commit, scene]
  )

  const setFrame = React.useCallback(
    (next: { width: number; height: number }) => {
      if (!scene) return
      commit(reframe(scene, next))
    },
    [commit, scene]
  )

  /**
   * The spine's framing, read off its first clip.
   *
   * One control for the whole spine rather than one per clip, because a cut
   * where clip two fits and clips one and three fill is not a choice anyone
   * makes on purpose — it is what a per-clip control produces by accident.
   */
  const fit = React.useMemo(() => {
    if (!scene) return "contain"
    const clip = findMainTrack(scene)?.elements.find(
      (element): element is VideoElement => element.kind === "video"
    )
    return clip?.fit ?? "contain"
  }, [scene])

  const setFit = React.useCallback(
    (next: "cover" | "contain") => {
      if (!scene) return
      commit(cropSpine(scene, { fit: next }))
    },
    [commit, scene]
  )

  /**
   * The effect under the cursor on the lane.
   *
   * Held as the chip rather than an id because the controls need what it is —
   * a zoom takes a different amount from a blur — and re-deriving that from an
   * id would mean walking every element's effects on every keystroke in the
   * amount field.
   */
  const [selectedEffect, setSelectedEffect] = React.useState<EffectChip | null>(
    null
  )

  /**
   * Forget the selection when the effect stops existing.
   *
   * An agent run can delete the clip a selected chip sat on, and a stale chip
   * would leave the amount field editing an effect that is no longer there —
   * writing an op the reducer quietly drops, so the number moves in the UI and
   * nothing happens on the frame.
   */
  const liveEffect = React.useMemo(() => {
    if (!scene || !selectedEffect) return null

    return (
      scene.tracks
        .flatMap((track) => effectChips(track))
        .find((chip) => chip.id === selectedEffect.id) ?? null
    )
  }, [scene, selectedEffect])

  const moveSelectedEffect = React.useCallback(
    (chip: EffectChip, deltaUs: number) => {
      if (!scene || !chip.effectId) return
      commit(moveEffect(scene, chip.elementId, chip.effectId, deltaUs))
    },
    [commit, scene]
  )

  /**
   * Drag one end of an effect to retime it.
   *
   * The last thing on the lane that still needed a sentence to the agent:
   * moving a punch-in worked, and making one longer meant asking for it.
   */
  const resizeSelectedEffect = React.useCallback(
    (chip: EffectChip, edge: "start" | "end", deltaUs: number) => {
      if (!scene || !chip.effectId) return
      commit(resizeEffect(scene, chip.elementId, chip.effectId, edge, deltaUs))
    },
    [commit, scene]
  )

  const setAmount = React.useCallback(
    (amount: number) => {
      if (!scene || !liveEffect?.effectId) return
      commit(
        setEffectAmount(
          scene,
          liveEffect.elementId,
          liveEffect.effectId,
          amount
        )
      )
    },
    [commit, scene, liveEffect]
  )

  const dropEffect = React.useCallback(() => {
    if (!scene || !liveEffect?.effectId) return
    commit(removeEffect(scene, liveEffect.elementId, liveEffect.effectId))
    setSelectedEffect(null)
  }, [commit, scene, liveEffect])

  /**
   * The clip under the playhead.
   *
   * What every effect lands on, because an effect belongs to a clip and there
   * is nowhere else to put one. Also what the panel reads to say which effects
   * are already on — a panel that offered "Contrast" as a fresh choice on a
   * clip that already has contrast would be offering to replace it without
   * saying so.
   */
  const clipAtPlayheadId = usePlayheadSelector(
    player,
    React.useCallback(
      (atUs: number) => {
        if (!scene) return null
        return (
          findMainTrack(scene)?.elements.find(
            (element) =>
              atUs >= element.startUs &&
              atUs < element.startUs + element.durationUs
          )?.id ?? null
        )
      },
      [scene]
    )
  )

  // Rendering from the id rather than the selector returning the element:
  // ids compare by value across frames, elements do not, and the selector's
  // equality check is what keeps this from updating 30 times a second. The
  // panel re-renders when the playhead crosses a clip edge and not before.
  const clipAtPlayhead = React.useMemo(() => {
    if (!scene || !clipAtPlayheadId) return null
    return (
      findMainTrack(scene)?.elements.find(
        (element) => element.id === clipAtPlayheadId
      ) ?? null
    )
  }, [scene, clipAtPlayheadId])

  const appliedEffects = React.useMemo(() => {
    const types = new Set<EffectType>()
    if (!clipAtPlayhead || !("effects" in clipAtPlayhead)) return types

    for (const effect of clipAtPlayhead.effects) types.add(effect.type)
    return types
  }, [clipAtPlayhead])

  /**
   * Add a zoom where the playhead is.
   *
   * Two seconds, or whatever is left of the clip, because a punch-in is an
   * emphasis and one that runs a whole minute is a different framing rather
   * than a beat.
   *
   * The push starts at 1, so with the playhead parked on its first frame the
   * press used to change nothing you could see: a small chip appeared on the
   * lane and the picture stayed as it was. So the new zoom is selected (its
   * amount and Remove come up) and the playhead moves to the top of the
   * push, where the preview shows what the press did.
   */
  const addZoom = React.useCallback(() => {
    if (!scene || !clipAtPlayhead) return

    const atUs = player.readPlayhead()
    const endUs = Math.min(
      clipAtPlayhead.startUs + clipAtPlayhead.durationUs,
      atUs + DEFAULT_ZOOM_US
    )

    const ops = punchIn(scene, clipAtPlayhead.id, {
      fromUs: us(Math.round(atUs)),
      toUs: us(Math.round(endUs)),
    })
    if (ops.length === 0) return
    commit(ops)

    const added = addedZoomId(ops)
    if (added) {
      // Only the id is read back: liveEffect finds the chip in the scene the
      // commit just wrote, so the rest is filled in from the document.
      setSelectedEffect({ id: `${clipAtPlayhead.id}:${added}` } as EffectChip)
    }
    const peakUs = atUs + Math.min(ZOOM_RAMP_US, (endUs - atUs) / 2)
    player.seekTo(us(Math.round(peakUs)))
  }, [commit, scene, clipAtPlayhead, player])

  /**
   * Apply an effect from the panel.
   *
   * Zoom goes through `punchIn` and everything else through `applyEffect`,
   * which is the split the catalogue calls movement and look: one is a window
   * with a curve in it, the rest are decisions about the whole shot.
   */
  const applyFromPanel = React.useCallback(
    (type: EffectType) => {
      if (!scene || !clipAtPlayhead) return

      if (type === "zoom") {
        addZoom()
        return
      }

      commit(applyEffect(scene, clipAtPlayhead.id, type))
    },
    [addZoom, commit, scene, clipAtPlayhead]
  )

  const removeFromPanel = React.useCallback(
    (type: EffectType) => {
      if (!scene || !clipAtPlayhead) return
      commit(removeEffectsOfType(scene, clipAtPlayhead.id, type))
    },
    [commit, scene, clipAtPlayhead]
  )

  /**
   * Drag-to-zoom, against the scene's own length.
   *
   * The lane knows the range it was handed; only this knows what fraction of
   * the cut that is, because the axis is the scene duration and the scene lives
   * here.
   */
  const zoomToSpanRef = zoom.zoomToSpan
  const zoomToSpan = React.useCallback(
    (rangeUs: number) => zoomToSpanRef(rangeUs, durationUs),
    [zoomToSpanRef, durationUs]
  )

  /* ── The transcript ───────────────────────────────────────────────────
     A second way to point at an edit. The words are already in the document
     and already bound to the instants they were spoken at; this reads that
     binding for the first time.
     ──────────────────────────────────────────────────────────────────── */

  /** The right panel: the chat by default, the transcript, or hidden. */
  const [side, setSide] = React.useState<SideView | null>("chat")

  /**
   * Which rail tool is open. Undefined until the person picks: then Media
   * from `xl` up (the library is where a cut starts) and closed below, where
   * it would take the preview's room. Before the width is known the frame
   * decides in CSS (`libraryAuto`), so nothing flashes on load.
   */
  const [toolChoice, setTool] = React.useState<StudioTool | null | undefined>(
    undefined
  )
  const wideDesk = useWideDesk()
  const tool: StudioTool | null =
    toolChoice !== undefined ? toolChoice : wideDesk === false ? null : "media"

  const [transcriptSelection, setTranscriptSelection] =
    React.useState<TranscriptSelection | null>(null)

  const lines = React.useMemo(
    () => (scene ? transcriptLines(scene) : []),
    [scene]
  )

  const words = React.useMemo(
    () => (scene ? transcriptWords(scene) : []),
    [scene]
  )

  /** Where words begin and end, for a dragged overlay to snap to. */
  const wordEdgesUs = React.useMemo(
    () => words.flatMap((word) => [word.startUs, word.endUs]),
    [words]
  )

  /**
   * The word under the playhead, at the word's cadence rather than the
   * frame's. The transcript renders from this id and so re-renders a few
   * times a second while captions play — not sixty.
   */
  const liveWordId = usePlayheadSelector(
    player,
    React.useCallback(
      (atUs: number) =>
        words.find((word) => atUs >= word.startUs && atUs < word.endUs)?.id ??
        null,
      [words]
    )
  )

  /**
   * The selection resolved against the words that currently exist.
   *
   * Derived rather than stored, so an agent run that deletes the sentence you
   * had highlighted empties the selection instead of leaving Delete pointed at
   * words that are gone.
   */
  const selectedWords = React.useMemo(() => {
    if (!transcriptSelection) return []

    return wordsBetween(
      words,
      transcriptSelection.anchorId,
      transcriptSelection.focusId
    )
  }, [words, transcriptSelection])

  const selectedWordIds = React.useMemo(
    () => new Set(selectedWords.map((word) => word.id)),
    [selectedWords]
  )

  /**
   * One selection at a time across the three surfaces.
   *
   * The clip, the effect chip and the words all answer the Delete key, and a
   * keypress that deletes two of them is not a thing anyone can undo in one
   * step. Selecting words drops the other two, the same way clicking the lane
   * already drops the effect.
   */
  const selectWords = React.useCallback((next: TranscriptSelection | null) => {
    setTranscriptSelection(next)
    if (!next) return

    setSelectedId(null)
    setSelectedEffect(null)
  }, [])

  const deleteWords = React.useCallback(() => {
    if (!scene || selectedWords.length === 0) return

    commit(deleteSpeech(scene, sourceRangesFor(selectedWords)))
    setTranscriptSelection(null)
  }, [commit, scene, selectedWords])

  /**
   * The recording's own transcript, for what the captions cannot show: the
   * words a cut took. Fetched when the transcript panel opens, once per
   * media, and never paid for again (the asset already holds it).
   */
  const mainMediaId = React.useMemo(() => {
    const clip = scene
      ? findMainTrack(scene)?.elements.find((e) => e.kind === "video")
      : undefined
    return clip && clip.kind === "video" ? clip.mediaId : null
  }, [scene])
  const [sourceTranscript, setSourceTranscript] = React.useState<{
    mediaId: string
    /** Null when the fetch failed: kept, so the panel does not ask again. */
    words: Word[] | null
  } | null>(null)

  /**
   * One line the studio says when a press could not do what it promised: a
   * cooldown, a paywall, a stretch that cannot go back. In ink, not red (a
   * limit is not a failure), and gone after a few seconds.
   */
  const [notice, setNotice] = React.useState<{
    text: string
    plans?: boolean
  } | null>(null)
  React.useEffect(() => {
    if (!notice) return
    const timer = window.setTimeout(() => setNotice(null), 5000)
    return () => window.clearTimeout(timer)
  }, [notice])

  React.useEffect(() => {
    if (side !== "transcript" || !mainMediaId) return
    if (sourceTranscript?.mediaId === mainMediaId) return
    let live = true
    void (async () => {
      try {
        const response = await (harness?.fetch ?? fetch)(
          `/api/editor/assets/${mainMediaId}/transcript`
        )
        if (!live) return
        if (!response.ok) {
          setSourceTranscript({ mediaId: mainMediaId, words: null })
          return
        }
        const { words: fetched } = (await response.json()) as { words: Word[] }
        if (live) setSourceTranscript({ mediaId: mainMediaId, words: fetched })
      } catch {
        // Offline: the panel still reads the captions, and says what it lacks.
        if (live) setSourceTranscript({ mediaId: mainMediaId, words: null })
      }
    })()
    return () => {
      live = false
    }
  }, [side, mainMediaId, sourceTranscript, harness])

  const sourceWords =
    sourceTranscript && sourceTranscript.mediaId === mainMediaId
      ? sourceTranscript.words
      : null
  const sourceTranscriptFailed =
    sourceTranscript?.mediaId === mainMediaId && sourceTranscript.words === null
  const sourceDurationUs = mainMediaId
    ? (media[mainMediaId]?.durationUs ?? null)
    : null

  const cutList = React.useMemo<CutAway[]>(
    () =>
      scene && mainMediaId && sourceWords && sourceDurationUs
        ? cutAways(scene, mainMediaId, sourceWords, us(sourceDurationUs))
        : [],
    [scene, mainMediaId, sourceWords, sourceDurationUs]
  )

  const review = React.useMemo<ReviewItem[]>(
    () =>
      scene && mainMediaId && sourceWords
        ? cleanUpReview(scene, mainMediaId, sourceWords)
        : [],
    [scene, mainMediaId, sourceWords]
  )

  /** Put a cut stretch back where it was in the recording. */
  const restoreCut = React.useCallback(
    (cut: CutAway) => {
      if (!scene || !sourceDurationUs) return
      const ops = restoreSpeech(scene, {
        mediaId: cut.mediaId,
        atUs: cut.sourceUs,
        sourceDurationUs: us(sourceDurationUs),
        words: sourceWords,
        rules: captionRules(document),
      })
      if (ops.length === 0) {
        setNotice({ text: "That stretch could not be put back here." })
        return
      }
      commit(ops)
    },
    [commit, scene, sourceDurationUs, sourceWords, document]
  )

  /** The reviewed stumbles, cut in one step (and one undo). */
  const cleanUp = React.useCallback(
    (items: ReviewItem[]) => {
      if (!scene || !mainMediaId || !sourceWords || !sourceDurationUs) return
      const ranges = reviewCuts(items, sourceWords, us(sourceDurationUs))
      const ops =
        ranges.length > 0
          ? deleteSpeech(scene, [{ mediaId: mainMediaId, ranges }])
          : []
      if (ops.length === 0) {
        setNotice({ text: "Nothing left to remove." })
        return
      }
      commit(ops)
    },
    [commit, scene, mainMediaId, sourceWords, sourceDurationUs]
  )

  const placedChapters = React.useMemo(
    () => (scene ? placeChapters(scene, document.metadata.chapters ?? []) : []),
    [scene, document.metadata.chapters]
  )

  /**
   * Clean sound, as a switch on the cut. The voice track is made at ingest;
   * a take from before that is cleaned once, here, on the first press.
   */
  const cleanSound = React.useMemo(
    () =>
      Boolean(
        scene &&
        findMainTrack(scene)?.elements.some(
          (element) => element.kind === "video" && element.voice === "clean"
        )
      ),
    [scene]
  )
  const [voicePending, setVoicePending] = React.useState(false)
  const toggleVoice = React.useCallback(async () => {
    if (!scene || !mainMediaId || voicePending) return
    if (cleanSound) {
      commit(setVoice(scene, "original"))
      return
    }
    if (!voiceUrls[mainMediaId] && !media[mainMediaId]?.voiceUrl) {
      setVoicePending(true)
      try {
        const response = await (harness?.fetch ?? fetch)(
          `/api/editor/assets/${mainMediaId}/voice`,
          { method: "POST" }
        )
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: string
          } | null
          setNotice({
            text: body?.error ?? "The sound could not be cleaned right now.",
            plans: response.status === 402,
          })
          return
        }
        const { url } = (await response.json()) as { url: string }
        setVoiceUrls((prev) => ({ ...prev, [mainMediaId]: url }))
      } catch {
        setNotice({ text: "The sound could not be cleaned right now." })
        return
      } finally {
        setVoicePending(false)
      }
    }
    commit(setVoice(scene, "clean"))
  }, [
    scene,
    mainMediaId,
    voicePending,
    cleanSound,
    commit,
    voiceUrls,
    media,
    harness,
  ])

  /** Preview speed: the preview's only, never the document's. */
  const [rate, setRate] = React.useState(1)

  /**
   * Punch in on what was said.
   *
   * On the clip the selection *starts* in, and `punchIn` clamps the window to
   * that clip's end. A phrase that runs across a cut is one thing the speaker
   * said, so emphasising it is one push — three separate zooms across three
   * clips is not what anybody means by "emphasise this".
   */
  const zoomWords = React.useCallback(() => {
    if (!scene) return

    const span = timelineSpan(selectedWords)
    if (!span) return

    const clip = findMainTrack(scene)?.elements.find(
      (element) =>
        span.startUs >= element.startUs &&
        span.startUs < element.startUs + element.durationUs
    )
    if (!clip) return

    commit(
      punchIn(scene, clip.id, {
        fromUs: us(Math.round(span.startUs)),
        toUs: us(Math.round(span.endUs)),
      })
    )
  }, [commit, scene, selectedWords])

  const remove = React.useCallback(() => {
    if (!scene) return

    // The words win when they are what is selected, because selecting them
    // cleared the clip — so this is not a tie, it is an order.
    if (selectedWords.length > 0) {
      deleteWords()
      return
    }

    if (!trackId || !selectedId) return
    if (alsoSelected.length > 0) {
      commit(removeElements(scene, [selectedId, ...alsoSelected]))
      selectClip(null)
      return
    }
    // Something over the cut (b-roll, a picture, text, music) comes off its
    // own lane and leaves a gap; only the spine ripples.
    const over = studioTools.selected
    if (over && over.track.id !== trackId) {
      commit([
        {
          op: "remove_element",
          sceneId: scene.id,
          trackId: over.track.id,
          elementId: over.element.id,
          target: { action: "press", kind: "track", trackId: over.track.id },
        },
      ])
      setSelectedId(null)
      return
    }
    commit(deleteAndRipple(scene, trackId, selectedId))
    setSelectedId(null)
  }, [
    commit,
    scene,
    trackId,
    selectedId,
    selectedWords,
    deleteWords,
    studioTools.selected,
    alsoSelected,
    selectClip,
  ])

  /**
   * The in and out marks. Not in the document: they are where the person is
   * pointing, like the playhead, and an undo that moved them would be undoing
   * something nobody did.
   */
  const [marks, setMarks] = React.useState<{
    inUs: number | null
    outUs: number | null
  }>({ inUs: null, outUs: null })
  const [shortcutsOpen, setShortcutsOpen] = React.useState(false)

  const markerTimes = React.useMemo(
    () => (scene ? placeMarkers(scene, document.metadata.markers) : []),
    [scene, document.metadata.markers]
  )

  /** What ⌘C copied. In the editor, not the system clipboard: a clip is not text. */
  const clipboard = React.useRef<ClipboardItem | null>(null)

  /** Every place a cut falls on the spine, with the start and the end, and the markers. */
  const cutPoints = React.useMemo(() => {
    const spine = scene ? findMainTrack(scene) : null
    const points = new Set<number>([0, ...markerTimes])
    for (const element of spine?.elements ?? []) {
      points.add(element.startUs)
      points.add(element.startUs + element.durationUs)
    }
    return [...points].sort((x, y) => x - y)
  }, [scene, markerTimes])

  const seekBy = React.useCallback(
    (deltaUs: number) => {
      const next = Math.min(
        durationUs,
        Math.max(0, player.readPlayhead() + deltaUs)
      )
      player.seekTo(us(Math.round(next)))
    },
    [player, durationUs]
  )

  /**
   * Q and W: the clip under the playhead loses everything before (or after)
   * the playhead, and the spine closes up. After Q the frame that was under
   * the playhead is now the clip's first, so the playhead goes there.
   */
  const trimToPlayhead = React.useCallback(
    (edge: "start" | "end") => {
      if (!scene || !trackId || !clipAtPlayhead) return
      const at = player.readPlayhead()
      const clipEnd = clipAtPlayhead.startUs + clipAtPlayhead.durationUs
      const delta =
        edge === "start" ? at - clipAtPlayhead.startUs : at - clipEnd
      if (delta === 0) return
      commit(trimEdge(scene, trackId, clipAtPlayhead.id, edge, delta))
      if (edge === "start") player.seekTo(us(clipAtPlayhead.startUs))
    },
    [commit, scene, trackId, clipAtPlayhead, player]
  )

  const cutMarked = React.useCallback(() => {
    if (!scene || marks.inUs === null || marks.outUs === null) return
    const ops = deleteTimelineRange(scene, marks.inUs, marks.outUs)
    if (ops.length === 0) return
    commit(ops)
    player.seekTo(us(Math.round(Math.min(marks.inUs, marks.outUs))))
    setMarks({ inUs: null, outUs: null })
  }, [commit, scene, marks, player])

  /**
   * Keyboard, because this is an editor. Who owns a press (a text field, a
   * focused control, the chat margin, or the editor) is decided in
   * editor-keys.ts; what a press means is the table in lib/editor/keymap.ts,
   * which the shortcut sheet reads too. Both are tested.
   */
  const onKey = React.useEffectEvent((event: KeyboardEvent) => {
    const target = event.target instanceof HTMLElement ? event.target : null
    if (!editorOwnsKey(target, event)) return

    const action = keyActionFor(event)
    if (!action) return

    // Escape is "never mind": it never swallows the press, so a dialog or a
    // menu still closes on it. Copy and paste with nothing to copy or paste
    // leave the browser's own to happen.
    const passive =
      action === "deselect" ||
      (action === "copy" && !selectedId) ||
      (action === "paste" && !clipboard.current)
    if (passive && action !== "deselect") return
    if (!passive) event.preventDefault()

    // While Quincy cuts, the document is read-only: the keys that only look
    // still work, the ones that edit do nothing.
    const edits =
      action === "split" ||
      action === "delete-range" ||
      action === "trim-start" ||
      action === "trim-end" ||
      action === "delete" ||
      action === "add-zoom" ||
      action === "add-marker" ||
      action === "paste" ||
      action === "duplicate" ||
      action === "undo" ||
      action === "redo"
    if (edits && running) return

    // A locked spine answers no edit by hand: the guard is against a stray
    // key as much as a stray drag.
    const spineEdit =
      action === "split" ||
      action === "delete-range" ||
      action === "trim-start" ||
      action === "trim-end" ||
      action === "paste" ||
      action === "duplicate" ||
      action === "delete"
    if (spineEdit && scene && findMainTrack(scene)?.locked) return

    const frameUs = 1_000_000 / fps
    const at = player.readPlayhead()

    switch (action) {
      case "toggle-play":
        player.toggle()
        break
      case "play-forward":
        // Pressed while playing it speeds up, the way a shuttle does.
        if (player.playing) setRate((current) => stepRate(current, 1))
        else player.play()
        break
      case "pause":
        player.pause()
        setRate(1)
        break
      case "back-second":
        player.pause()
        seekBy(-1_000_000)
        break
      case "frame-back":
        player.pause()
        seekBy(-frameUs)
        break
      case "frame-forward":
        player.pause()
        seekBy(frameUs)
        break
      case "second-back":
        seekBy(-1_000_000)
        break
      case "second-forward":
        seekBy(1_000_000)
        break
      case "previous-cut": {
        // A hair of slack, so pressing ↑ while parked on a cut goes to the one
        // before it rather than to where it already is.
        const before = cutPoints.filter((point) => point < at - frameUs / 2)
        player.seekTo(us(before.at(-1) ?? 0))
        break
      }
      case "next-cut": {
        const after = cutPoints.find((point) => point > at + frameUs / 2)
        player.seekTo(us(Math.min(after ?? durationUs, durationUs)))
        break
      }
      case "go-start":
        player.seekTo(us(0))
        break
      case "go-end":
        player.seekTo(us(durationUs))
        break
      case "slower":
        setRate((current) => stepRate(current, -1))
        break
      case "faster":
        setRate((current) => stepRate(current, 1))
        break
      case "split":
        split()
        break
      case "mark-in":
        setMarks((current) => ({ ...current, inUs: at }))
        break
      case "mark-out":
        setMarks((current) => ({ ...current, outUs: at }))
        break
      case "clear-marks":
        setMarks({ inUs: null, outUs: null })
        break
      case "delete-range":
        cutMarked()
        break
      case "trim-start":
        trimToPlayhead("start")
        break
      case "trim-end":
        trimToPlayhead("end")
        break
      case "delete":
        remove()
        break
      case "add-zoom":
        addZoom()
        break
      case "undo":
        undo()
        break
      case "redo":
        redo()
        break
      case "deselect":
        // Drops everything. Escape means "never mind" everywhere else in the
        // app, and a selected effect, a selected phrase and a marked range
        // each leave something destructive one key away.
        setSelectedEffect(null)
        selectClip(null)
        setTranscriptSelection(null)
        setMarks({ inUs: null, outUs: null })
        break
      case "timeline-in":
        zoom.zoomIn()
        break
      case "timeline-out":
        zoom.zoomOut()
        break
      case "timeline-fit":
        zoom.fit()
        break
      case "shortcuts":
        setShortcutsOpen(true)
        break
      case "add-marker":
        if (scene) commit(toggleMarker(scene, document.metadata, at))
        break
      case "copy":
        if (scene && selectedId)
          clipboard.current = copyElement(scene, selectedId)
        break
      case "paste":
        if (scene && clipboard.current)
          commit(pasteElement(scene, clipboard.current, at))
        break
      case "duplicate":
        if (scene && selectedId) commit(duplicateElement(scene, selectedId))
        break
      case "select-all": {
        const spine = scene ? findMainTrack(scene) : null
        const ids = spine?.elements.map((element) => element.id) ?? []
        setSelectedId(ids[0] ?? null)
        setAlsoSelected(ids.slice(1))
        break
      }
    }
  })

  React.useEffect(() => {
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  if (!scene) return null

  return (
    <StudioFrame
      deskRef={deskRef}
      overlay={<AgentCursors director={director} />}
      name={
        <ProjectName
          name={document.metadata.name}
          onRename={(name) => commit([{ op: "rename", name }])}
          disabled={running}
        />
      }
      topCenter={
        <>
          <FrameMenu
            shapes={FRAMES}
            canvas={canvas}
            onChange={setFrame}
            fit={fit}
            onFitChange={setFit}
            disabled={running}
          />
          <div className="flex items-center gap-0.5">
            <DeskIconButton
              icon={Undo02Icon}
              label="Undo"
              shortcut={["mod", "Z"]}
              side="bottom"
              onClick={undo}
              disabled={running || !canUndo}
            />
            <DeskIconButton
              icon={Redo02Icon}
              label="Redo"
              shortcut={["shift", "mod", "Z"]}
              side="bottom"
              onClick={redo}
              disabled={running || !canRedo}
            />
            <DeskIconButton
              icon={KeyboardIcon}
              label="Keyboard shortcuts"
              shortcut={["?"]}
              side="bottom"
              onClick={() => setShortcutsOpen(true)}
            />
            <ShortcutSheet
              open={shortcutsOpen}
              onOpenChange={setShortcutsOpen}
            />
          </div>
        </>
      }
      hoverUs={hoverUs}
      running={running}
      preview={
        <StudioPreview
          player={player}
          scene={scene}
          media={compositionMedia}
          canvas={canvas}
          fps={fps}
          durationUs={durationUs}
          background={document.settings.background.color}
          playbackRate={rate}
          overlay={studioTools.previewOverlay}
        />
      }
      headerEnd={<SaveBadge save={save} onRetry={retry} />}
      exportAction={
        <ExportButton
          state={exporter.state}
          onStart={(resolution) => void exporter.start(resolution)}
          onCancel={exporter.cancel}
          onFile={(file) =>
            studioTools.exportFile(
              file,
              placedChapters.length > 0 ? chapterLines(placedChapters) : null
            )
          }
          files={studioTools.exportFiles}
          // A run is rewriting the timeline; rendering it mid-edit would
          // encode a cut that is still moving.
          disabled={running}
        />
      }
      transport={
        <>
          <PlayButton
            playing={player.playing}
            onToggle={player.toggle}
            size="sm"
          />
          <button
            type="button"
            onClick={() => setRate(cycleRate)}
            title="Preview speed (< and >)"
            aria-label={`Preview speed ${rateLabel(rate)}`}
            className={cn(
              "relative rounded px-1.5 py-0.5 text-kit-small tabular-nums",
              "before:absolute before:-inset-1",
              "transition-colors duration-150 ease-out hover:bg-kit-row-hover",
              "outline-hidden focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus focus-visible:outline-solid",
              rate === 1 ? "text-kit-ink-muted" : "text-kit-ink"
            )}
          >
            {rateLabel(rate)}
          </button>
          {notice ? (
            <span
              role="status"
              className="truncate text-kit-small text-kit-ink"
            >
              {notice.text}
              {notice.plans ? (
                <>
                  {" "}
                  <a
                    href="/settings?section=plan"
                    className="underline decoration-kit-link-line underline-offset-4 hover:decoration-kit-ink"
                  >
                    See plans
                  </a>
                </>
              ) : null}
            </span>
          ) : null}
          {/* One line, fixed-width digits: the clock never wraps or jitters. */}
          <span className="text-kit-small whitespace-nowrap text-kit-ink tabular-nums">
            <PlayheadClock player={player} />
            <span className="text-kit-ink-muted">
              {" / "}
              {formatClockTenths(durationUs)}
            </span>
          </span>
        </>
      }
      toolbar={
        <>
          {document.scenes.length > 1 ? (
            <SceneMenu
              scenes={document.scenes}
              currentId={showSpines ? null : scene.id}
              cutsLabel={
                liveCuts.length > 0 ? `All ${liveCuts.length} cuts` : null
              }
              onPick={openScene}
              onShowCuts={() => setCutsShown(true)}
              disabled={running}
            />
          ) : null}
          <DeskIconButton
            icon={ScissorIcon}
            label="Split"
            shortcut={hintFor("split")}
            onClick={split}
            disabled={running}
          />
          {mainMediaId && media[mainMediaId]?.hasAudio ? (
            <DeskIconButton
              icon={AudioWave01Icon}
              label={
                voicePending
                  ? "Cleaning the sound…"
                  : cleanSound
                    ? "Play the sound as recorded"
                    : "Clean the sound"
              }
              onClick={() => void toggleVoice()}
              disabled={running || voicePending}
              pressed={cleanSound}
            />
          ) : null}
          <DeskIconButton
            icon={Delete02Icon}
            label="Delete the selected clip"
            shortcut={["⌫"]}
            onClick={remove}
            disabled={running || !selectedId}
          />
          <DeskIconButton
            icon={ZoomInAreaIcon}
            label="Add a zoom at the playhead"
            shortcut={hintFor("add-zoom")}
            onClick={addZoom}
            disabled={running || !clipAtPlayhead}
          />
        </>
      }
      selection={
        <EffectControls
          chip={liveEffect}
          onAmount={setAmount}
          onRemove={dropEffect}
          disabled={running}
        />
      }
      toolbarEnd={
        <TimelineZoom
          zoom={zoom.zoom}
          onZoom={zoom.set}
          onZoomIn={zoom.zoomIn}
          onZoomOut={zoom.zoomOut}
          canZoomIn={zoom.canZoomIn}
          canZoomOut={zoom.canZoomOut}
        />
      }
      tool={tool}
      libraryAuto={toolChoice === undefined && wideDesk === null}
      onToolChange={setTool}
      panel={
        tool === "effects" ? (
          <StudioEffects
            applied={appliedEffects}
            hasClip={clipAtPlayhead !== null}
            onApply={applyFromPanel}
            onRemove={removeFromPanel}
            locked={running}
          />
        ) : (
          <>
            {studioTools.inspector}
            {studioTools.panelFor(tool, null)}
          </>
        )
      }
      side={side}
      onSideChange={setSide}
      chat={
        <StudioChat
          projectId={projectId}
          director={director}
          controls={{
            beginRun,
            endRun,
            awaitSync,
            syncLost,
            undo,
            redo,
            historyIds,
            runEntry,
            durationUs,
          }}
          onSaved={syncRevision}
          onRunningChange={setRunning}
          reading={reading}
          arrival={arrival}
          passes={
            arrival.played ? (
              <ArrivalPasses
                passes={passes}
                atMs={arrival.atMs}
                settled={arrival.phase === "settled"}
              />
            ) : null
          }
          frame={chatFrame}
          look={look}
          desk={cutsDesk}
          harness={harness}
        />
      }
      transcript={
        <StudioTranscript
          lines={lines}
          selectedIds={selectedWordIds}
          liveWordId={liveWordId}
          onSelect={selectWords}
          onSeek={(atUs) => player.seekTo(us(Math.round(atUs)))}
          onDelete={deleteWords}
          onZoom={zoomWords}
          locked={running}
          cutAways={cutList}
          onRestore={restoreCut}
          review={review}
          onCleanUp={cleanUp}
          chapters={placedChapters}
          transcriptMissing={sourceTranscriptFailed}
          chapterText={
            placedChapters.length > 0 ? chapterLines(placedChapters) : null
          }
          onCorrect={(tokenId, text) =>
            commit(correctWords(scene, [{ tokenId, text }]))
          }
          onReplace={(find, replace) =>
            commit(replaceWords(scene, find, replace))
          }
          countMatches={(find) => findWords(scene, find).length}
          speakerName={
            speakerNumbers(scene).length > 1
              ? (speaker) => speakerLabel(speaker, document.metadata.speakers)
              : undefined
          }
        />
      }
    >
      <div ref={lanesRef}>
        {showSpines ? (
          <CutSpines
            cuts={liveCuts}
            scenes={document.scenes}
            recommendedId={cutSet?.recommendedId ?? null}
            onOpen={openScene}
            disabled={running}
            filmstrips={filmstrips}
            seekIndex={seekIndex}
          />
        ) : (
          <StudioLanes
            marks={marks}
            onAddCaptions={
              asset?.id ? () => void addCaptionsByHand() : undefined
            }
            captionsPending={captionsPending}
            scene={scene}
            player={player}
            playing={player.playing}
            onHover={onHover}
            onSeek={player.seekTo}
            selectedId={selectedId}
            onSelect={selectClip}
            alsoSelected={selectedId ? alsoSelected : []}
            onTrackChange={(laneId, patch) =>
              commit([
                {
                  op: "update_track",
                  sceneId: scene.id,
                  trackId: laneId,
                  patch,
                },
              ])
            }
            onAudioVolume={(laneId, elementId, volume) =>
              commit([
                {
                  op: "update_element",
                  sceneId: scene.id,
                  trackId: laneId,
                  elementId,
                  patch: { volume, muted: volume === 0 },
                },
              ])
            }
            onAudioFades={(laneId, elementId, fades) =>
              commit(setAudioFades(scene, laneId, elementId, fades))
            }
            markerTimes={markerTimes}
            seekIndex={seekIndex}
            filmstrips={filmstrips}
            zoom={zoom.zoom}
            onZoomBy={zoom.scaleBy}
            onZoomSpan={zoomToSpan}
            trim={trim}
            onTrim={setTrim}
            onTrimCommit={commitTrim}
            reveal={reveal}
            selectedEffectId={liveEffect?.id ?? null}
            onSelectEffect={setSelectedEffect}
            onMoveEffect={moveSelectedEffect}
            onResizeEffect={resizeSelectedEffect}
            locked={running}
            scanning={arrival.phase === "scanning"}
            onDropMedia={studioTools.dropMedia}
            onMoveElement={studioTools.moveOverlay}
            wordEdgesUs={wordEdgesUs}
          />
        )}
      </div>
    </StudioFrame>
  )
}

/**
 * The three frames a cut can be in, and which one this scene is in now.
 *
 * Three and not a free aspect field, because these are the shapes the export
 * path knows and the platforms actually take. An arbitrary ratio would be a
 * preset per project and an export that matches nothing.
 *
 * Wide is listed first. It is where a pillar recording starts, and the cuts the
 * atomiser makes out of it are the vertical ones — so the order reads left to
 * right as the work does, rather than putting the output shape where the input
 * belongs.
 */
const FRAMES: readonly FrameShape[] = [
  { key: "wide", label: "16:9", hint: "Wide", canvas: LANDSCAPE_CANVAS },
  { key: "vertical", label: "9:16", hint: "Vertical", canvas: VERTICAL_CANVAS },
  { key: "square", label: "1:1", hint: "Square", canvas: SQUARE_CANVAS },
]

/** The shared look of every segmented button in the toolbar. */
/**
 * The shared look of every segmented button in the toolbar.
 *
 * `before:-inset-y-2` grows the hit area to 40px tall without changing the
 * layout — the toolbar is a deliberately dense 24px row, and these cannot get
 * physically bigger without the row getting bigger. It only grows vertically:
 * the buttons sit 2px apart, so a horizontal bleed would overlap its
 * neighbour's target, and a hit area that steals from the control next to it is
 * worse than one that is merely small.
 *
 * The press scale matches PlayButton and the 0.96 the project uses elsewhere.
 */
const SEGMENT =
  "relative h-6 rounded px-2 text-kit-small whitespace-nowrap before:absolute before:-inset-y-2 before:inset-x-0 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96] outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-kit-focus disabled:pointer-events-none disabled:opacity-50"

const SEGMENT_OFF = "text-kit-ink-muted hover:text-kit-ink"

/** Two seconds of push, which is an emphasis rather than a new framing. */
const DEFAULT_ZOOM_US = 2_000_000

/** The push-in ramp punchIn draws by default, so the playhead lands on its top. */
const ZOOM_RAMP_US = 600_000

/** The id of the zoom a punchIn's ops wrote: the last effect on the patch. */
function addedZoomId(ops: ReturnType<typeof punchIn>): string | null {
  const op = ops[0]
  if (!op || op.op !== "update_element") return null
  const effects = (op.patch as { effects?: { id: string; type: string }[] })
    .effects
  const zoom = effects?.filter((effect) => effect.type === "zoom").at(-1)
  return zoom?.id ?? null
}

/**
 * The selected effect's name, its amount and Remove.
 *
 * Nothing at all until a chip on the lane is selected, because "how far" has
 * no answer otherwise. It used to sit among the tools on the right, sized for
 * its widest state so selecting a chip did not shove Split and Delete
 * sideways — which left a wide empty well beside "+ Zoom" that read as a
 * search field. It now stands on the left after the clock, where appearing
 * moves nothing: the row's spacer takes the room. Adding a zoom is a tool
 * button like Split.
 *
 * The step, the range and the unit come from the catalogue rather than being
 * one shared 0.05: 0.05 of a blur is a twentieth of a pixel, and 0.05 of a
 * hue rotation is a fifth of a degree.
 *
 * A fade is selectable and has no amount — its length is the whole of it — so
 * only its name and Remove show.
 */
function EffectControls({
  chip,
  onAmount,
  onRemove,
  disabled,
}: {
  chip: EffectChip | null
  onAmount: (amount: number) => void
  onRemove: () => void
  disabled?: boolean
}) {
  if (!chip) return null

  // Both halves have to be checked against the chip existing, not just against
  // null: `undefined !== null` is true, so a missing chip read as adjustable.
  const adjustable = chip.effectId !== null && chip.amount !== null

  // A fade's kind is not an effect type, so it has no spec. Guarded on
  // `adjustable` rather than on the kind, because that is the same question.
  const spec = adjustable ? effectSpec(chip.kind as EffectType) : null
  const name =
    spec?.label ??
    (chip.kind === "fade-in"
      ? "Fade in"
      : chip.kind === "fade-out"
        ? "Fade out"
        : "Effect")

  return (
    <div
      role="group"
      aria-label={`Selected effect: ${name}`}
      className="flex flex-none items-center gap-0.5 rounded-md bg-kit-well p-0.5"
    >
      <span className="px-2 text-kit-small font-kit-strong text-kit-ink">
        {name}
      </span>

      {adjustable && spec ? (
        <>
          <button
            type="button"
            onClick={() => onAmount(stepAmount(spec.type, chip.amount!, -1))}
            disabled={disabled || chip.amount! <= spec.min}
            aria-label={`Less ${spec.label.toLowerCase()}`}
            className={cn(SEGMENT, SEGMENT_OFF, "text-center")}
          >
            −
          </button>
          {/* Tabular figures, because this number changes under the cursor and
              proportional ones make the + button shuffle sideways between
              ×1.10 and ×1.25. */}
          <span className="min-w-[46px] text-center text-kit-small tabular-nums">
            {spec.format(chip.amount!)}
          </span>
          <button
            type="button"
            onClick={() => onAmount(stepAmount(spec.type, chip.amount!, 1))}
            disabled={disabled || chip.amount! >= spec.max}
            aria-label={`More ${spec.label.toLowerCase()}`}
            className={cn(SEGMENT, SEGMENT_OFF, "text-center")}
          >
            +
          </button>
        </>
      ) : null}

      {chip.effectId ? (
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          title="Remove this effect"
          className={cn(SEGMENT, SEGMENT_OFF)}
        >
          Remove
        </button>
      ) : null}
    </div>
  )
}

/**
 * Says what happened to the last edit, and only when there is something to say.
 *
 * "Saved" fading in after every change is noise; a conflict that says nothing
 * is a lost afternoon. So `clean` renders nothing and everything else renders.
 */
function SaveBadge({
  save,
  onRetry,
}: {
  save: ReturnType<typeof useDocument>["save"]
  onRetry: () => void
}) {
  if (save.status === "clean") return null

  const text =
    save.status === "saving"
      ? "Saving"
      : save.status === "dirty"
        ? "Unsaved"
        : save.status === "conflict"
          ? "Someone else edited this — reload to continue"
          : save.status === "unsynced"
            ? "Could not confirm what Quincy saved — reload to continue"
            : save.message

  const bad =
    save.status === "conflict" ||
    save.status === "error" ||
    save.status === "unsynced"

  return (
    <span className="flex items-center gap-2">
      <span
        className={`text-kit-small ${bad ? "text-kit-danger" : "text-kit-ink-muted"}`}
        role={bad ? "alert" : undefined}
      >
        {text}
      </span>

      {/* Only once the automatic attempts have stopped. Offering Retry while it
          is still retrying invites someone to queue a second write. */}
      {save.status === "error" && save.givenUp ? (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md px-2 py-1 text-kit-small underline underline-offset-2 hover:bg-kit-row-hover"
        >
          Retry
        </button>
      ) : null}
    </span>
  )
}
