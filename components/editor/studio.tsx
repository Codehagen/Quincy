"use client"

import * as React from "react"

import {
  LANDSCAPE_CANVAS,
  SQUARE_CANVAS,
  VERTICAL_CANVAS,
} from "@/lib/editor/document"
import { effectSpec, stepAmount } from "@/lib/editor/effect-catalogue"
import { effectChips, type EffectChip } from "@/lib/editor/effect-lane"
import {
  applyEffect,
  cropSpine,
  deleteAndRipple,
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
  trimEdge,
} from "@/lib/editor/edits"
import { findMainTrack, sceneDurationUs } from "@/lib/editor/timeline"
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

import { StudioChat } from "./studio-chat"
import { StudioEffects } from "./studio-effects"
import { StudioFrame, type StudioTool } from "./studio-frame"
import { PlayheadClock } from "./studio-parts"
import { StudioLanes, type TrimDrag } from "./studio-lanes"
import { StudioSide, type SideTab } from "./studio-side"
import { StudioTranscript, type TranscriptSelection } from "./studio-transcript"
import type { CompositionMedia } from "./composition"
import { ExportButton } from "./export-button"
import { StudioPreview } from "./studio-preview"
import { ZoomControls, useZoom } from "./studio-zoom"
import { useDocument } from "./use-document"
import { useExport } from "./use-export"
import { useReveal } from "./use-reveal"
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
  durationUs: number | null
  width: number | null
  height: number | null
  fps: number | null
  rotation: number
  hasAudio: boolean
  proxyUrl: string | null
  seekIndexUrl: string | null
  filmstrip: Filmstrip | null
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
  media,
  localFile,
}: {
  projectId: string
  document: VideoDocument
  revision: number
  media: Record<string, MediaEntry>
  /** The File from this session's upload, if the editor was reached that way. */
  localFile?: File | null
}) {
  const {
    document,
    apply,
    applyAgentOps,
    syncRevision,
    undo,
    redo,
    canUndo,
    canRedo,
    save,
    retry,
  } = useDocument(projectId, initialDocument, revision)

  const [selectedId, setSelectedId] = React.useState<string | null>(null)
  /**
   * Where the pointer is over the lane, or null. Kept separate from the
   * playhead on purpose: hover previews an instant, clicking commits to it,
   * and the agent never touches either.
   */
  const [hoverUs, setHoverUs] = React.useState<number | null>(null)
  /**
   * A trim edge mid-flight. Held here rather than in the document because a
   * drag is not an edit until it lands — applying every pointermove would be
   * one revision and one undo step per frame of movement.
   */
  const [trim, setTrim] = React.useState<TrimDrag | null>(null)
  const zoom = useZoom()

  const scene =
    document.scenes.find((s) => s.id === document.currentSceneId) ??
    document.scenes[0]
  const canvas = scene?.canvas ?? document.settings.canvas
  const trackId = scene ? mainTrackId(scene) : null

  const firstClip = scene ? findMainTrack(scene)?.elements[0] : undefined
  const asset =
    firstClip && "mediaId" in firstClip ? media[firstClip.mediaId] : undefined

  const durationUs = us(scene ? sceneDurationUs(scene) : 0)
  const fps = document.settings.fps

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
  const compositionMedia = React.useMemo(() => {
    const entries: Record<string, CompositionMedia> = {}

    for (const [id, entry] of Object.entries(media)) {
      entries[id] = {
        proxyUrl: entry.proxyUrl,
        localUrl: id === asset?.id ? localUrl : null,
        rotation: entry.rotation,
      }
    }

    return entries
  }, [media, asset?.id, localUrl])

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

  const applyStreamedOps = React.useCallback(
    (ops: Parameters<typeof applyAgentOps>[0]) => {
      // Before, not after. Reading the scene once the ops have landed records
      // the result and animates nothing.
      capture(sceneRef.current)
      applyAgentOps(ops)
    },
    [capture, applyAgentOps]
  )

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
    // Read at call time, not rendered from: the playhead is no longer state,
    // and an event handler wants where it is now, not where it last rendered.
    const at =
      hoverUs === null ? player.readPlayhead() : us(Math.round(hoverUs))
    commit(splitAt(scene, trackId, at))
  }, [commit, scene, trackId, hoverUs, player])

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
   */
  const addZoom = React.useCallback(() => {
    if (!scene || !clipAtPlayhead) return

    const atUs = player.readPlayhead()
    const endUs = Math.min(
      clipAtPlayhead.startUs + clipAtPlayhead.durationUs,
      atUs + DEFAULT_ZOOM_US
    )

    commit(
      punchIn(scene, clipAtPlayhead.id, {
        fromUs: us(Math.round(atUs)),
        toUs: us(Math.round(endUs)),
      })
    )
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

  const [tab, setTab] = React.useState<SideTab>("chat")

  /** Which rail tool is open. Closed by default: the preview is the point. */
  const [tool, setTool] = React.useState<StudioTool | null>(null)

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
    commit(deleteAndRipple(scene, trackId, selectedId))
    setSelectedId(null)
  }, [commit, scene, trackId, selectedId, selectedWords, deleteWords])

  /**
   * Keyboard, because this is an editor. Ignored while a text field has focus,
   * or typing an s into the composer would split the timeline.
   */
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable
      ) {
        return
      }

      if (event.key === " ") {
        event.preventDefault()
        player.toggle()
      } else if (event.key === "Escape") {
        // Drops all three. Escape means "never mind" everywhere else in the
        // app, and both a selected effect and a selected phrase leave a
        // destructive button sitting in a toolbar.
        setSelectedEffect(null)
        setSelectedId(null)
        setTranscriptSelection(null)
      } else if (event.key === "s" && !event.metaKey && !event.ctrlKey) {
        event.preventDefault()
        split()
      } else if (event.key === "Backspace" || event.key === "Delete") {
        event.preventDefault()
        remove()
      } else if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault()
        if (running) return
        if (event.shiftKey) redo()
        else undo()
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [player, split, remove, undo, redo, running])

  if (!scene) return null

  return (
    <StudioFrame
      title={document.metadata.name}
      playing={player.playing}
      onTogglePlaying={player.toggle}
      clock={<PlayheadClock player={player} />}
      hoverUs={hoverUs}
      running={running}
      durationUs={durationUs}
      preview={
        <StudioPreview
          player={player}
          scene={scene}
          media={compositionMedia}
          canvas={canvas}
          fps={fps}
          durationUs={durationUs}
          background={document.settings.background.color}
        />
      }
      headerEnd={<SaveBadge save={save} onRetry={retry} />}
      exportAction={
        <ExportButton
          state={exporter.state}
          onStart={exporter.start}
          onCancel={exporter.cancel}
          // A run is rewriting the timeline; rendering it mid-edit would
          // encode a cut that is still moving.
          disabled={running}
        />
      }
      toolbarEnd={
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <FrameControls
            canvas={canvas}
            onChange={setFrame}
            fit={fit}
            onFitChange={setFit}
            disabled={running}
          />
          <EffectControls
            chip={liveEffect}
            onAdd={addZoom}
            onAmount={setAmount}
            onRemove={dropEffect}
            disabled={running}
          />
          <EditActions
            onSplit={split}
            onDelete={remove}
            onUndo={undo}
            onRedo={redo}
            disabled={running}
            canDelete={Boolean(selectedId)}
            canUndo={canUndo}
            canRedo={canRedo}
          />
          <ZoomControls
            zoom={zoom.zoom}
            onFit={zoom.fit}
            onZoomIn={zoom.zoomIn}
            onZoomOut={zoom.zoomOut}
            canZoomIn={zoom.canZoomIn}
            canZoomOut={zoom.canZoomOut}
          />
        </div>
      }
      tool={tool}
      onToolChange={setTool}
      panel={
        <StudioEffects
          applied={appliedEffects}
          hasClip={clipAtPlayhead !== null}
          onApply={applyFromPanel}
          onRemove={removeFromPanel}
          locked={running}
        />
      }
      chat={
        <StudioSide
          tab={tab}
          onTabChange={setTab}
          chat={
            <StudioChat
              projectId={projectId}
              onOps={applyStreamedOps}
              onSaved={syncRevision}
              onRunningChange={setRunning}
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
            />
          }
        />
      }
    >
      <StudioLanes
        scene={scene}
        player={player}
        playing={player.playing}
        hoverUs={hoverUs}
        onHover={setHoverUs}
        onSeek={player.seekTo}
        selectedId={selectedId}
        onSelect={setSelectedId}
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
      />
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
const FRAMES: {
  label: string
  hint: string
  canvas: typeof LANDSCAPE_CANVAS
}[] = [
  { label: "16:9", hint: "Wide", canvas: LANDSCAPE_CANVAS },
  { label: "9:16", hint: "Vertical", canvas: VERTICAL_CANVAS },
  { label: "1:1", hint: "Square", canvas: SQUARE_CANVAS },
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
  "relative h-6 rounded px-2 text-[11px] whitespace-nowrap before:absolute before:-inset-y-2 before:inset-x-0 transition-[color,background-color,transform] duration-150 ease-out active:scale-[0.96] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50"

const SEGMENT_ON = "bg-card text-foreground shadow-sm"
const SEGMENT_OFF = "text-muted-foreground hover:text-foreground"

/**
 * The frame, and how the picture meets it.
 *
 * One group and not two. They were separate for a version and the toolbar ran
 * out of room — five groups clipped the zoom stepper off the right edge — but
 * the better reason is that they are one decision: 9:16 and Fill is a vertical
 * cut, 9:16 and Fit is a wide take with bars, and choosing the shape without
 * choosing what happens to the footage is only half an answer. The divider says
 * they are related rather than the same.
 */
function FrameControls({
  canvas,
  onChange,
  fit,
  onFitChange,
  disabled,
}: {
  canvas: { width: number; height: number }
  onChange: (canvas: { width: number; height: number }) => void
  fit: "cover" | "contain"
  // Fit first, because it is where a project starts: the whole picture, nothing
  // discarded. Fill is the choice you make after seeing what the bars cost.
  onFitChange: (fit: "cover" | "contain") => void
  disabled?: boolean
}) {
  const fits = [
    { value: "contain" as const, label: "Fit", hint: "Show all of it" },
    { value: "cover" as const, label: "Fill", hint: "Crop to the frame" },
  ]

  return (
    <div
      role="group"
      aria-label="Frame"
      className="flex items-center gap-0.5 rounded-md bg-secondary/40 p-0.5"
    >
      {FRAMES.map((frame) => {
        const active =
          canvas.width === frame.canvas.width &&
          canvas.height === frame.canvas.height

        return (
          <button
            key={frame.label}
            type="button"
            onClick={() => onChange(frame.canvas)}
            disabled={disabled}
            aria-pressed={active}
            title={`${frame.hint} — ${frame.label}`}
            className={cn(
              SEGMENT,
              "tabular-nums",
              active ? SEGMENT_ON : SEGMENT_OFF
            )}
          >
            {frame.label}
          </button>
        )
      })}

      <span aria-hidden="true" className="mx-0.5 h-3.5 w-px bg-border" />

      {fits.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onFitChange(option.value)}
          disabled={disabled}
          aria-pressed={fit === option.value}
          title={`${option.label} — ${option.hint}`}
          className={cn(
            SEGMENT,
            fit === option.value ? SEGMENT_ON : SEGMENT_OFF
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Two seconds of push, which is an emphasis rather than a new framing. */
const DEFAULT_ZOOM_US = 2_000_000

/**
 * Add a zoom, and change the one that is selected.
 *
 * The amount field only appears once something on the lane is selected, because
 * "how far" has no answer otherwise, and a disabled input sitting in the toolbar
 * permanently is chrome that teaches you nothing. Adding is always available:
 * that is the thing you cannot currently do without typing a sentence.
 *
 * The step, the range and the unit come from the catalogue rather than being
 * one shared 0.05. They were one shared 0.05 when zoom was the only effect you
 * could make, and it does not survive the others: 0.05 of a blur is a
 * twentieth of a pixel, and 0.05 of a hue rotation is a fifth of a degree.
 *
 * A fade is selectable and has no amount — its length is the whole of it — so
 * the field is absent rather than showing a number that edits nothing.
 */
function EffectControls({
  chip,
  onAdd,
  onAmount,
  onRemove,
  disabled,
}: {
  chip: EffectChip | null
  onAdd: () => void
  onAmount: (amount: number) => void
  onRemove: () => void
  disabled?: boolean
}) {
  // Both halves have to be checked against the chip existing, not just against
  // null: `undefined !== null` is true, so a missing chip read as adjustable.
  const adjustable =
    chip !== null && chip.effectId !== null && chip.amount !== null

  // A fade's kind is not an effect type, so it has no spec. Guarded on
  // `adjustable` rather than on the kind, because that is the same question.
  const spec = adjustable ? effectSpec(chip.kind as EffectType) : null

  return (
    <div
      role="group"
      aria-label="Effects"
      // Sized for its widest state, not its current one. Selecting a chip adds
      // − ×1.20 + Remove, and in a right-aligned toolbar that pushed Split,
      // Delete, Undo and Redo 120px to the left — so the button under the
      // cursor after clicking a chip was not the button that had been there a
      // moment earlier, and Undo and Redo are one apart.
      className="flex min-w-[196px] items-center gap-0.5 rounded-md bg-secondary/40 p-0.5"
    >
      <button
        type="button"
        onClick={onAdd}
        disabled={disabled}
        title="Add a zoom at the playhead"
        className={cn(SEGMENT, SEGMENT_OFF)}
      >
        + Zoom
      </button>

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
          <span className="min-w-[46px] text-center text-[11px] tabular-nums">
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

      {chip?.effectId ? (
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

function EditActions({
  onSplit,
  onDelete,
  onUndo,
  onRedo,
  canDelete,
  canUndo,
  canRedo,
  disabled,
}: {
  onSplit: () => void
  onDelete: () => void
  onUndo: () => void
  onRedo: () => void
  canDelete: boolean
  canUndo: boolean
  canRedo: boolean
  /** A run holds the document. Everything here writes to it. */
  disabled?: boolean
}) {
  return (
    <div className="flex items-center gap-0.5">
      <Action onClick={onSplit} disabled={disabled}>
        Split
      </Action>
      <Action onClick={onDelete} disabled={disabled || !canDelete}>
        Delete
      </Action>
      <Action onClick={onUndo} disabled={disabled || !canUndo}>
        Undo
      </Action>
      <Action onClick={onRedo} disabled={disabled || !canRedo}>
        Redo
      </Action>
    </div>
  )
}

function Action({
  onClick,
  disabled,
  children,
}: {
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors duration-150 ease-out hover:bg-secondary hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:pointer-events-none disabled:text-muted-foreground/40"
    >
      {children}
    </button>
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
          : save.message

  const bad = save.status === "conflict" || save.status === "error"

  return (
    <span className="flex items-center gap-2">
      <span
        className={`text-xs ${bad ? "text-red-500" : "text-muted-foreground"}`}
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
          className="rounded-md px-2 py-1 text-xs underline underline-offset-2 hover:bg-secondary"
        >
          Retry
        </button>
      ) : null}
    </span>
  )
}
