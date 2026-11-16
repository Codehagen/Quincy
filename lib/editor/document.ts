import { createIdGenerator } from "ai"

import { newElement } from "./ops"
import { createProvenance } from "./provenance"
import { us, type Us } from "./time"
import {
  UNLOCKED,
  type Author,
  type CaptionStyle,
  type ProjectSnapshot,
  type Scene,
  type Track,
  type VideoDocument,
  type VideoElement,
} from "./types"

const newProjectId = createIdGenerator({ prefix: "vp", size: 16 })
const newSceneId = createIdGenerator({ prefix: "vs", size: 16 })
const newTrackId = createIdGenerator({ prefix: "vt", size: 16 })

/** Bump only alongside a migration. See VideoDocument.version. */
export const DOCUMENT_VERSION = 1

export const VERTICAL_CANVAS = { width: 1080, height: 1920 }
export const LANDSCAPE_CANVAS = { width: 1920, height: 1080 }
export const SQUARE_CANVAS = { width: 1080, height: 1080 }

/**
 * A project opens at the shape of the footage in it.
 *
 * This used to default vertical, on the reasoning that every surface the
 * atomiser outputs to is vertical except long-form YouTube. That was right
 * about the output and wrong about the input. The pillar recording is a webcam,
 * a screen share, a camera on a tripod — it is wide, and a project that opens
 * 9:16 greets you with your own footage cropped by a machine that has not been
 * told what matters in the frame yet.
 *
 * So: open at the source's own aspect, and make going vertical an edit. That is
 * also the honest shape of the atomiser — Scene.canvas is per-scene precisely
 * because one wide pillar becomes several differently-framed cuts, and a
 * reframe you performed is a decision the document can carry provenance for. A
 * crop applied at import is one nobody made.
 */
export function canvasForSource(source: {
  width: number
  height: number
  /** Degrees from the container matrix. 90 and 270 swap the display axes. */
  rotation?: number
}): { width: number; height: number } {
  // A phone shot sideways stores 1920x1080 and displays 1080x1920. Reading the
  // stored dimensions would open a portrait recording in a landscape canvas and
  // letterbox it on both sides — the single most common footage there is.
  const turned = source.rotation === 90 || source.rotation === 270
  const width = turned ? source.height : source.width
  const height = turned ? source.width : source.height

  if (!width || !height) return LANDSCAPE_CANVAS

  const ratio = width / height

  // Snapped to the three canvases the export path knows rather than kept exact.
  // A 1440x1080 camera and a 1920x1080 one are both "wide" to every downstream
  // decision, and a canvas per source aspect would mean an export preset per
  // source aspect. The tolerance is wide because the question being asked is
  // orientation, not precision.
  if (ratio > 1.2) return LANDSCAPE_CANVAS
  if (ratio < 0.85) return VERTICAL_CANVAS
  return SQUARE_CANVAS
}

/**
 * Word-by-word defaults.
 *
 * `wordsPerSegment: 1` is the look worth having: one word at a time, held for
 * exactly as long as it was spoken. Position sits at 62% of frame height rather
 * than centred, which clears the face in a talking head and stays above the
 * caption bar TikTok and Reels overlay across the bottom.
 */
export const DEFAULT_CAPTION_STYLE: CaptionStyle = {
  fontFamily: "Inter",
  fontSize: 64,
  fontWeight: 700,
  color: "#ffffff",
  activeColor: "#ffffff",
  inactiveColor: "#ffffff99",
  wordsPerSegment: 1,
  textTransform: "none",
  textAlign: "center",
  lineHeight: 1.15,
  letterSpacing: 0,
  background: {
    enabled: false,
    color: "#000000",
    cornerRadius: 12,
    paddingX: 30,
    paddingY: 18,
  },
  // Captions land on unpredictable footage, so they carry their own contrast
  // rather than trusting the frame behind them to be dark enough.
  shadow: { color: "rgba(0,0,0,0.6)", blur: 14, offsetX: 0, offsetY: 3 },
}

export function createTrack(
  kind: Track["kind"],
  overrides: Partial<Omit<Track, "kind">> = {}
): Track {
  return {
    id: overrides.id ?? newTrackId(),
    kind,
    name: overrides.name ?? defaultTrackName(kind),
    isMain: overrides.isMain,
    muted: overrides.muted,
    hidden: overrides.hidden,
    elements: overrides.elements ?? [],
  }
}

function defaultTrackName(kind: Track["kind"]): string {
  switch (kind) {
    case "video":
      return "Main"
    case "broll":
      return "B-roll"
    case "audio":
      return "Audio"
    case "caption":
      return "Captions"
    case "text":
      return "Text"
    case "graphic":
      return "Graphics"
  }
}

/**
 * A scene opens with the spine and a caption lane and nothing else.
 *
 * Empty b-roll and music lanes would be four rows of nothing on a timeline that
 * has to fit under a preview. The ops add a lane the moment something needs
 * one, so the timeline only ever shows tracks that hold something.
 */
export function createScene(options: {
  name?: string
  isMain?: boolean
  canvas?: { width: number; height: number }
}): Scene {
  return {
    id: newSceneId(),
    name: options.name ?? "Main cut",
    isMain: options.isMain ?? true,
    canvas: options.canvas,
    tracks: [
      createTrack("video", { name: "Main", isMain: true }),
      createTrack("caption"),
    ],
  }
}

export function createDocument(options: {
  name: string
  fps?: number
  canvas?: { width: number; height: number }
}): VideoDocument {
  const now = new Date().toISOString()
  const scene = createScene({})

  return {
    version: DOCUMENT_VERSION,
    metadata: {
      id: newProjectId(),
      name: options.name,
      durationUs: us(0),
      createdAt: now,
      updatedAt: now,
    },
    settings: {
      // 30 is what phones shoot and what every vertical surface expects. A
      // 60fps source is conformed on ingest rather than dragging the project
      // rate up and doubling every render.
      fps: options.fps ?? 30,
      canvas: options.canvas ?? VERTICAL_CANVAS,
      background: { type: "color", color: "#000000" },
    },
    scenes: [scene],
    currentSceneId: scene.id,
  }
}

/**
 * What a project looks like the moment an asset finishes ingesting.
 *
 * One clip on the spine, untrimmed, at the source's own aspect. That is the
 * whole opening state and it is deliberately boring: the editor should show you
 * your footage exactly as you shot it, and every difference from that should be
 * something you or the agent did, with provenance saying which.
 *
 * The caption lane is created empty even when a transcript exists. Captions are
 * an edit — `add_captions` builds them from the words with a style, and burning
 * them in at import would mean the first thing you see is a choice nobody made.
 */
export function documentForAsset(asset: {
  id: string
  filename: string
  durationUs: Us
  width: number
  height: number
  fps: number | null
  rotation: number
}): VideoDocument {
  const canvas = canvasForSource(asset)
  const document = createDocument({
    name: titleFromFilename(asset.filename),
    // The proxy is conformed on ingest, so this rate is the one the timeline
    // and the export share. Falling back to 30 rather than 0: a zero frame rate
    // makes every frame-snapping calculation downstream a division by zero.
    fps: asset.fps && asset.fps > 0 ? asset.fps : 30,
    canvas,
  })

  const scene = document.scenes[0]
  const mainTrack = scene.tracks.find((track) => track.isMain)

  if (!mainTrack) throw new Error("createScene produced no main track")

  mainTrack.elements = [
    newElement<VideoElement>(
      {
        kind: "video",
        name: asset.filename,
        mediaId: asset.id,
        startUs: us(0),
        durationUs: asset.durationUs,
        trimStartUs: us(0),
        trimEndUs: asset.durationUs,
        sourceDurationUs: asset.durationUs,
        transform: IDENTITY_TRANSFORM,
        opacity: 1,
        blendMode: "normal",
        volume: 1,
        muted: false,
        effects: [],
        animations: { channels: {} },
      },
      // "user", not "agent": the person chose this file, and an import they
      // performed should survive undoing an agent run.
      "user"
    ),
  ]

  document.metadata.durationUs = asset.durationUs

  return document
}

export const IDENTITY_TRANSFORM = {
  position: { x: 0, y: 0 },
  scaleX: 1,
  scaleY: 1,
  rotate: 0,
}

/**
 * "IMG_8762.MOV" is not a project name, but it is the only one we have, and
 * inventing a better one would mean guessing at content nobody has looked at.
 * Stripping the extension is the whole transformation — a name you recognise
 * beats a name that reads well.
 */
function titleFromFilename(filename: string): string {
  const withoutExtension = filename.replace(/\.[^.]+$/, "").trim()
  return withoutExtension || "Untitled"
}

export function createSnapshot(document: VideoDocument): ProjectSnapshot {
  // Revision starts at 0 and the first write makes it 1, so "never edited" is
  // a value rather than something the caller has to remember.
  return { document, revision: 0, lock: UNLOCKED }
}

/** Provenance for something the ops layer is not creating for you. */
export function authored(author: Author) {
  return createProvenance(author)
}
