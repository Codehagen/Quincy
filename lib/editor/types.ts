import type { Us } from "./time"

/**
 * The edit document.
 *
 * One JSON object is the single source of truth for a project, and three
 * different things read it: the canvas preview, the export renderer, and the
 * agent. That is deliberate and it is the whole architecture. An agent "edit"
 * is a change to this object and nothing else — no render, no encode, no job.
 * Cutting 60 seconds of silence out of a talk is two dozen numbers changing,
 * which is why it can land while you watch.
 *
 * The rule that keeps it honest: **preview and export consume the same
 * document through the same compositor.** Every editor that grew a separate
 * export path shipped exports that did not match what the user approved.
 *
 * Shape follows what a timeline editor has to store, with two deliberate
 * departures documented at their definitions: integer microseconds
 * instead of float seconds (see ./time.ts), and animation channels keyed
 * directly by property path instead of a separate binding table.
 */
export type VideoDocument = {
  /** Bumped only for shapes that need a migration, never for content. */
  version: number
  metadata: DocumentMetadata
  settings: DocumentSettings
  scenes: Scene[]
  currentSceneId: string
}

export type DocumentMetadata = {
  id: string
  name: string
  /** Derived from the tracks. Stored so a project list need not load scenes. */
  durationUs: Us
  createdAt: string
  updatedAt: string
}

export type DocumentSettings = {
  fps: number
  canvas: { width: number; height: number }
  background: { type: "color"; color: string }
}

/**
 * A scene is an independent timeline. One project can hold several because the
 * atomiser produces several cuts from one recording — a vertical TikTok and a
 * Shorts cut are different scenes over the same assets, not different projects.
 * Sharing the project means they share the ingest, the transcript and the media.
 */
export type Scene = {
  id: string
  name: string
  /** The cut the project opens on. Exactly one scene carries this. */
  isMain: boolean
  /** Per-scene, because the atomiser's cuts differ in aspect ratio. */
  canvas?: { width: number; height: number }
  tracks: Track[]
}

/**
 * Track kinds double as the timeline's colour taxonomy, so adding one is a
 * design decision as much as a data one.
 *
 * Effects like blur and punch-in zoom are **not** tracks. They live on the
 * element that carries them, as keyframed channels, because an effect without
 * a clip underneath has nothing to apply to. Showing them as their own lanes is
 * a view concern and belongs to the timeline component.
 */
export type TrackKind =
  "video" | "broll" | "audio" | "caption" | "text" | "graphic"

export type Track = {
  id: string
  kind: TrackKind
  name: string
  /** The spine of the cut. Exactly one video track carries this. */
  isMain?: boolean
  muted?: boolean
  hidden?: boolean
  /**
   * Ordered by startUs, and the ordering is an invariant the ops maintain
   * rather than something callers re-sort. Half the timeline reads reduce to
   * a binary search over this array; an unsorted array makes them all linear.
   */
  elements: TimelineElement[]
}

export type TimelineElement =
  VideoElement | AudioElement | CaptionElement | TextElement

type ElementBase = {
  id: string
  name: string
  /** Position on the scene timeline. */
  startUs: Us
  durationUs: Us
  hidden?: boolean
  provenance: Provenance
}

/**
 * A window onto source media. `trimStartUs` and `trimEndUs` are offsets *into
 * the asset*, and durationUs is the length on the timeline — they are only
 * equal at normal speed, which is why the cut is not derived from them.
 */
export type VideoElement = ElementBase & {
  kind: "video"
  mediaId: string
  trimStartUs: Us
  trimEndUs: Us
  sourceDurationUs: Us
  transform: Transform
  /**
   * How the picture meets a frame it does not match.
   *
   * Absent fits the whole thing in and accepts bars. Cropping throws away
   * footage the user recorded on purpose, and doing that by default means the
   * editor decides what the shot is about — so the raw frame is what you get,
   * and `cover` is a thing someone asks for once they can see what they are
   * giving up.
   *
   * Only meaningful when the source and the frame disagree. At matching aspect
   * the two are the same pixels.
   */
  fit?: "cover" | "contain"
  /**
   * Which part survives the crop, in 0–1 of the source. Absent is the centre.
   *
   * Kept as a fraction of the *source* rather than an offset in canvas pixels
   * so it can be decided without knowing how big the footage is: 0 is its left
   * edge whatever its dimensions, and the browser resolves the arithmetic
   * because it is the thing that knows the intrinsic size. An agent asked to
   * keep the speaker on the left can answer in the same units it was asked in.
   */
  crop?: { x: number; y: number }
  opacity: number
  blendMode: BlendMode
  /** Independent of the element's own audio, which mutes with `muted`. */
  volume: number
  muted: boolean
  effects: Effect[]
  animations: Animations
}

export type AudioElement = ElementBase & {
  kind: "audio"
  mediaId: string
  trimStartUs: Us
  trimEndUs: Us
  sourceDurationUs: Us
  volume: number
  muted: boolean
  /**
   * Music under a voice. The envelope is derived from where the transcript says
   * words are, not from analysing the mix, so it is exact and costs nothing.
   */
  ducking?: Ducking
  animations: Animations
}

export type Ducking = {
  enabled: boolean
  /** Multiplier applied while speech is present. 0.2 is a normal music bed. */
  amount: number
  attackUs: Us
  releaseUs: Us
}

/**
 * One caption on screen. With word-by-word captions that is a single token, and
 * a 90 second talk becomes a few hundred of these.
 */
export type CaptionElement = ElementBase & {
  kind: "caption"
  tokens: CaptionToken[]
  style: CaptionStyle
  transform: Transform
}

/**
 * A word, bound back to the exact source media range it came from.
 *
 * This binding is what makes transcript editing work. Deleting a word from the
 * transcript is a lookup to the source range and a cut on the timeline, with no
 * search and no guessing. It also survives the ripple: after silence removal
 * moves every clip left, a token still knows which asset instant it belongs to,
 * so its new timeline position is recomputed rather than tracked.
 *
 * Losing this is how transcript editing degrades into "roughly the right place".
 */
export type CaptionToken = {
  id: string
  text: string
  /** Relative to the caption element, not the scene. */
  startUs: Us
  endUs: Us
  sourceMediaId: string
  /** The video element this word was spoken in, before any cuts moved it. */
  sourceElementId: string
  sourceStartUs: Us
  sourceEndUs: Us
}

export type CaptionStyle = {
  fontFamily: string
  fontSize: number
  fontWeight: number
  color: string
  activeColor: string
  inactiveColor: string
  /** 1 gives the word-by-word look. Higher reads as a phrase at a time. */
  wordsPerSegment: number
  textTransform: "none" | "uppercase" | "lowercase"
  textAlign: "left" | "center" | "right"
  lineHeight: number
  letterSpacing: number
  background: {
    enabled: boolean
    color: string
    cornerRadius: number
    paddingX: number
    paddingY: number
  }
  shadow: { color: string; blur: number; offsetX: number; offsetY: number }
}

export type TextElement = ElementBase & {
  kind: "text"
  content: string
  style: CaptionStyle
  transform: Transform
  animations: Animations
}

export type Transform = {
  position: { x: number; y: number }
  scaleX: number
  scaleY: number
  rotate: number
}

export type BlendMode = "normal" | "multiply" | "screen" | "overlay"

export type Effect = {
  id: string
  type: EffectType
  enabled: boolean
  params: Record<string, number>
}

export type EffectType =
  | "blur"
  | "zoom"
  | "brightness"
  | "saturation"
  | "contrast"
  | "hue"
  | "grayscale"
  | "sepia"
  | "invert"

/* ── Animation ────────────────────────────────────────────────────────────
   The other way to do this is a binding table mapping a property path to
   channel ids, with the channels stored separately. That indirection buys
   multi-component properties (a position with x and y under one binding), and
   costs a join on every read.

   We key channels by the leaf path instead — `transform.position.x` is its own
   channel. Same expressive power, one lookup, and a channel can be reasoned
   about without loading the table that explains it.
   ──────────────────────────────────────────────────────────────────────── */

export type Animations = {
  /** Keyed by property path, e.g. `effects.blur-1.params.intensity`. */
  channels: Record<string, AnimationChannel>
}

export type AnimationChannel = {
  path: string
  /** Ordered by timeUs, maintained by the ops rather than re-sorted on read. */
  keys: Keyframe[]
}

export type Keyframe = {
  id: string
  /** Relative to the element, so trimming the clip does not shift the curve. */
  timeUs: Us
  value: number
  /**
   * How the value travels to the *next* key. On the last key it is inert.
   * `hold` is not `step`: step jumps at the next key, hold stays flat until it.
   */
  interpolation: "linear" | "bezier" | "step" | "hold"
  /** Control points for `bezier`, as CSS cubic-bezier ordering. */
  easing?: [number, number, number, number]
}

/* ── Provenance ───────────────────────────────────────────────────────────
   The reason an agent and a human can edit the same timeline.

   Authorship is tracked per *field*, not per element. Per-element is not
   enough: the agent trims a clip you positioned, and now the whole clip reads
   as the agent's. Undoing its run would throw away your placement. With field
   granularity, `trimStartUs` is the agent's and `startUs` is yours, and undo
   returns only what the agent touched.

   It is surfaced in the UI rather than kept as metadata — the timeline carries
   a provenance colour — so it is load-bearing.
   ──────────────────────────────────────────────────────────────────────── */

export type Author = "user" | "agent"

export type Provenance = {
  createdBy: Author
  lastEditedBy: Author
  /**
   * Field path within the element to whoever last wrote it. Absent means
   * nobody has touched it since creation, so `createdBy` answers for it.
   */
  fields: Record<string, Author>
}

/* ── The stored envelope ──────────────────────────────────────────────── */

/**
 * What the server holds and the client syncs against.
 *
 * `revision` is the concurrency control: a write states the revision it was
 * based on and loses if the document has moved. That is what stops a stale
 * agent run from overwriting the drag you did while it was thinking.
 */
export type ProjectSnapshot = {
  document: VideoDocument
  revision: number
  lock: DocumentLock
}

/**
 * The agent holds the document for the length of a run.
 *
 * A real merge between concurrent human and agent edits is a CRDT and weeks of
 * work for a case that lasts a few seconds. Locking during a run is what
 * the honest version of the tradeoff: the timeline goes
 * read-only with a visible reason, instead of silently resolving a conflict the
 * user did not know they were in.
 */
export type DocumentLock =
  | { status: "unlocked"; runId: null; lockedBy: null; startedAt: null }
  | {
      status: "locked"
      runId: string
      lockedBy: Author
      startedAt: string
    }

export const UNLOCKED: DocumentLock = {
  status: "unlocked",
  runId: null,
  lockedBy: null,
  startedAt: null,
}
