"use client"

import * as React from "react"
import {
  ColorsIcon,
  ContrastIcon,
  DropletIcon,
  FlashIcon,
  PaintBoardIcon,
  PaintBucketIcon,
  SparklesIcon,
  SunIcon,
  ZoomInAreaIcon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react"

import {
  effectChips,
  effectLabel,
  effectRowCount,
  previewMove,
  previewResize,
  type EffectChip,
  type EffectHost,
} from "@/lib/editor/effect-lane"
import { trimPreviewDeltaUs } from "@/lib/editor/edits"
import { sceneDurationUs } from "@/lib/editor/timeline"
import { us, type Us } from "@/lib/editor/time"
import type {
  Scene,
  TimelineElement,
  Track,
  VideoElement,
} from "@/lib/editor/types"
import { cn } from "@/lib/utils"

import type { Filmstrip as FilmstripSheet } from "./studio"
import {
  ClipWaveform,
  Filmstrip,
  TimeRuler,
  TRACK_ICON,
  formatClock,
  formatTimecode,
} from "./studio-parts"
import type { Player } from "./use-player"
import {
  REVEAL_TRAVEL_MS,
  revealDelayMs,
  revealOffsetPx,
  type Reveal,
} from "./use-reveal"

/**
 * Lanes — locked in. Round 2 chose this; ported from
 * app/prototypes/editor/variants/lanes.tsx onto the real document.
 *
 * Full-height tracks with a header column, filmstrips and hover trim handles.
 * Video on top, captions under it: the spine is what you look at first, and
 * captions read better sitting directly under the frame they belong to than
 * stacked above it.
 *
 * The prototype hardcoded three lanes because its fixture had a music bed.
 * This renders whatever tracks the document has, which for a fresh import is
 * the spine and an empty caption lane — the row is drawn even when empty, so
 * the timeline does not change height the moment a tool returns.
 */

export type LaneSeekIndex = {
  intervalUs: number
  values: number[]
}

/** A trim in progress: which edge of which clip, and how far it has come. */
export type TrimDrag = {
  /** Carried rather than assumed to be the spine — b-roll trims the same way. */
  trackId: string
  elementId: string
  edge: "start" | "end"
  deltaUs: number
}

/**
 * The needle, moved without React.
 *
 * This is the one element on the page that genuinely changes every frame, and
 * it used to do so by re-rendering the whole timeline: the playhead was state,
 * the state lived at the Studio root, and 30–60 updates a second walked the
 * full tree. Now it subscribes to the player directly and writes `left` on its
 * own node — same markup as studio-parts' `Playhead` (which the prototypes
 * keep), no render after mount.
 *
 * A style write, not a transform: `left` as a percentage tracks the lane's own
 * width through zoom and resize for free, and a 1px needle has no layout
 * neighbours to disturb — the lane it sits in is absolutely positioned over
 * the tracks.
 */
function LivePlayhead({
  player,
  spanUs,
  live,
}: {
  player: Player
  spanUs: number
  live: boolean
}) {
  const ref = React.useRef<HTMLDivElement>(null)

  React.useLayoutEffect(() => {
    const position = (atUs: number) => {
      if (!ref.current) return
      ref.current.style.left = `${Math.min(1, Math.max(0, atUs / spanUs)) * 100}%`
    }

    position(player.readPlayhead())
    return player.subscribePlayhead(position)
  }, [player, spanUs])

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute inset-y-0 z-20 w-px"
    >
      <div
        className={cn("h-full w-px", live ? "bg-signal" : "bg-foreground/70")}
      />
      <div
        className={cn(
          "absolute -top-0.5 -left-[3px] size-[7px] rounded-full",
          live ? "bg-signal" : "bg-foreground/70"
        )}
      />
    </div>
  )
}

export function StudioLanes({
  scene,
  player,
  playing,
  hoverUs,
  onHover,
  onSeek,
  selectedId,
  onSelect,
  seekIndex,
  filmstrips,
  zoom,
  onZoomBy,
  onZoomSpan,
  trim,
  onTrim,
  onTrimCommit,
  reveal,
  selectedEffectId,
  onSelectEffect,
  onMoveEffect,
  onResizeEffect,
  locked,
}: {
  scene: Scene
  player: Player
  playing: boolean
  hoverUs: number | null
  onHover: (timeUs: number | null) => void
  onSeek: (timeUs: Us) => void
  selectedId: string | null
  onSelect: (elementId: string | null) => void
  seekIndex: LaneSeekIndex | null
  /** The frame sheets, by media id. Absent for assets ingested before they existed. */
  filmstrips: Record<string, FilmstripSheet | null>
  zoom: number
  onZoomBy: (factor: number) => void
  /** Zoom so a chosen range fills the lane. */
  onZoomSpan: (rangeUs: number) => void
  /** Null when nothing is being dragged. */
  trim: TrimDrag | null
  onTrim: (trim: TrimDrag | null) => void
  onTrimCommit: (trim: TrimDrag) => void
  /** Where everything was before the agent's last edit, or null when idle. */
  reveal: Reveal | null
  selectedEffectId: string | null
  onSelectEffect: (chip: EffectChip | null) => void
  onMoveEffect: (chip: EffectChip, deltaUs: number) => void
  onResizeEffect: (
    chip: EffectChip,
    edge: "start" | "end",
    deltaUs: number
  ) => void
  /**
   * True while an agent run holds the document.
   *
   * The toolbar already disables on this. The lane did not, so a drag during a
   * run produced an op the server answers with a 423 — a gesture that looks
   * like it worked, then silently is not there.
   */
  locked?: boolean
}) {
  /**
   * The clip being trimmed, and by how much the cut would change if the drag
   * landed now.
   *
   * A trim is not applied until the pointer goes up. Applying on every move
   * would be forty revisions for one drag, each its own undo step — so the
   * document holds still and the lane draws the pending state itself.
   */
  const dragging = trim
    ? scene.tracks
        .flatMap((track) =>
          track.elements.map((element) => ({ track, element }))
        )
        .find(({ element }) => element.id === trim.elementId)
    : undefined

  const previewDeltaUs =
    trim && dragging?.element.kind === "video"
      ? trimPreviewDeltaUs(dragging.element, trim.edge, trim.deltaUs)
      : 0

  /**
   * The axis is the scene's own length.
   *
   * After a cut the timeline is shorter than the footage, and drawing against
   * the source length would leave a dead tail that grows with every edit —
   * clips shrinking into a corner as you tighten, which is backwards from what
   * tightening should feel like.
   *
   * The pending trim is folded in for the same reason the clips are: the axis
   * will move by exactly this much on release, so moving it now is one
   * continuous gesture instead of a snap the moment the pointer lifts.
   */
  const span = Math.max(1, sceneDurationUs(scene) + previewDeltaUs)

  /**
   * Where a clip sits while a trim is in flight.
   *
   * The dragged clip changes length and stays put; everything after it on the
   * same track slides by the same amount. That is a ripple trim: the cut is
   * contiguous, so trimming an in-point does not move the clip on the timeline,
   * it changes which part of the source plays and closes the rest up behind it.
   */
  const geometryOf = (trackId: string, element: TimelineElement) => {
    const plain = { startUs: element.startUs, durationUs: element.durationUs }
    if (!previewDeltaUs || !dragging || dragging.track.id !== trackId)
      return plain

    if (element.id === dragging.element.id) {
      return { ...plain, durationUs: element.durationUs + previewDeltaUs }
    }
    if (element.startUs > dragging.element.startUs) {
      return { ...plain, startUs: element.startUs + previewDeltaUs }
    }
    return plain
  }

  /**
   * The lane's own width, for the reveal and for deciding what fits on a chip.
   *
   * Clips are positioned in percentages, and a transform cannot be — a
   * percentage translate is relative to the element's own width, not the lane's.
   * So the sweep needs one real measurement.
   *
   * Measured on the *container* and multiplied by the zoom, rather than read off
   * the lane itself. The lane's width is `zoom * 100%`, so reading it during the
   * render that changed the zoom returns the previous value — the DOM has not
   * been written yet. Reading the container instead gives a number that does not
   * move when the zoom does, and an observer rather than a ref read means it is
   * right on the first render instead of zero until something else happens.
   */
  const scrollRef = React.useRef<HTMLDivElement | null>(null)
  const [containerWidth, setContainerWidth] = React.useState(0)

  React.useEffect(() => {
    const node = scrollRef.current
    if (!node) return

    const observer = new ResizeObserver(([entry]) => {
      setContainerWidth(entry.contentRect.width)
    })

    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const laneWidth = containerWidth * zoom

  /**
   * The effects on each track, packed into rows.
   *
   * Computed from the document rather than stored beside it, so the lane cannot
   * drift from what renders — a chip is a view of the same effect the
   * compositor is drawing, not a second record of it.
   */
  const effectRows = React.useMemo(() => {
    const rows = new Map<string, EffectChip[][]>()

    for (const track of scene.tracks) {
      const chips = effectChips(track)
      /**
       * At least one row on any track that can carry an effect, even with
       * nothing on it.
       *
       * The same rule `Lane` states for tracks: the row is drawn when empty so
       * the timeline does not change height the moment something lands in it.
       * Without this the first punch-in pushed the spine, the captions and
       * everything below them down by 36px, which is the whole timeline
       * jumping under the cursor that just clicked "+ Zoom".
       *
       * It also says the lane is there. An effects row you only ever see after
       * you have already made an effect cannot tell you effects exist.
       */
      const minimum = CAN_CARRY_EFFECTS.has(track.kind) ? 1 : 0
      const grouped: EffectChip[][] = Array.from(
        { length: Math.max(minimum, effectRowCount(chips)) },
        () => []
      )

      for (const chip of chips) grouped[chip.row].push(chip)
      rows.set(track.id, grouped)
    }

    return rows
  }, [scene])

  const effectRowsFor = (track: Track) => effectRows.get(track.id) ?? []

  /**
   * The clips an effect on this track could be dragged onto.
   *
   * The whole track, not the clip the effect started on. A split is a cut the
   * user made for their own reasons and it should not become a wall an effect
   * cannot cross.
   */
  const hostsFor = (track: Track): EffectHost[] =>
    track.elements
      .filter((element) => "effects" in element)
      .map((element) => ({
        id: element.id,
        startUs: element.startUs,
        durationUs: element.durationUs,
      }))

  const pointerToUs = (event: React.PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = (event.clientX - rect.left) / rect.width
    return Math.min(span, Math.max(0, ratio * span))
  }

  /* ── Drag to zoom ─────────────────────────────────────────────────────
     Press anywhere on the lane, drag across the part you want, release, and it
     fills the width.

     Listened for in the capture phase, and that is the whole trick. Clips stop
     pointerdown from propagating so that selecting one does not also move the
     playhead — correct, and it would have meant this gesture worked in the gaps
     between clips and died on the clips themselves. On a cut with no gaps that
     is every pixel anyone would actually aim at. Capture runs on the way down,
     so the lane sees the press first and decides afterwards what it was.

     The gesture lives in a ref and only its band lives in state. A pointermove
     handler that read its own progress back out of React state would be reading
     the value from the render that installed it, one move behind, for the whole
     drag.
     ──────────────────────────────────────────────────────────────────── */

  const [band, setBand] = React.useState<{
    fromUs: number
    toUs: number
  } | null>(null)

  const gesture = React.useRef<{
    originX: number
    fromUs: number
    toUs: number
    dragged: boolean
  } | null>(null)

  /** Set by a drag, read and cleared by the click that follows it. */
  const swallowClick = React.useRef(false)

  /** Where to scroll once the new zoom has been laid out. */
  const pendingScrollUs = React.useRef<number | null>(null)

  React.useLayoutEffect(() => {
    const at = pendingScrollUs.current
    if (at === null) return
    pendingScrollUs.current = null

    const node = scrollRef.current
    if (!node) return

    // Layout effect, not effect: the zoom changed the lane's width in this same
    // commit, and scrolling a frame later is a visible jump to the wrong place
    // followed by a correction.
    node.scrollLeft = (at / span) * (node.clientWidth * zoom)
  }, [zoom, span])

  /** Where a client x lands on the timeline, accounting for scroll and zoom. */
  const clientXToUs = (clientX: number) => {
    const node = scrollRef.current
    if (!node) return 0

    const rect = node.getBoundingClientRect()
    const ratio =
      (clientX - rect.left + node.scrollLeft) / (node.clientWidth * zoom)

    return Math.min(span, Math.max(0, ratio * span))
  }

  const onLanePointerDownCapture = (event: React.PointerEvent) => {
    // Trim handles and effect chips own their own drags, and both sit above the
    // lane. A gesture that started on one is theirs.
    if ((event.target as HTMLElement).closest("[data-owns-drag]")) return
    if (event.button !== 0) return

    const fromUs = clientXToUs(event.clientX)
    gesture.current = {
      originX: event.clientX,
      fromUs,
      toUs: fromUs,
      dragged: false,
    }

    const onPointerMove = (move: PointerEvent) => {
      const current = gesture.current
      if (!current) return

      // Below the threshold this is still a click. Zooming on a two-pixel
      // wobble would turn every press on the timeline into a navigation.
      if (
        !current.dragged &&
        Math.abs(move.clientX - current.originX) < MARQUEE_MIN_PX
      ) {
        return
      }

      current.dragged = true
      current.toUs = clientXToUs(move.clientX)
      setBand({ fromUs: current.fromUs, toUs: current.toUs })
    }

    const detach = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      setBand(null)
    }

    const onPointerUp = () => {
      const current = gesture.current
      gesture.current = null
      detach()

      if (!current?.dragged) return

      // The click that follows this pointerup would otherwise select whatever
      // the drag started over, and seek to a position the zoom just made
      // irrelevant.
      swallowClick.current = true

      const fromUs = Math.min(current.fromUs, current.toUs)
      const toUs = Math.max(current.fromUs, current.toUs)
      if (toUs - fromUs < MARQUEE_MIN_US) return

      pendingScrollUs.current = fromUs
      onZoomSpan(toUs - fromUs)
    }

    /** The pointer taken away mid-gesture. Nothing was chosen, so nothing moves. */
    const onPointerCancel = () => {
      gesture.current = null
      detach()
    }

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
  }

  const onLaneClickCapture = (event: React.MouseEvent) => {
    if (!swallowClick.current) return
    swallowClick.current = false
    event.stopPropagation()
    event.preventDefault()
  }

  /** Cmd/Ctrl+wheel zooms, which is the reflex from every other editor. */
  const onWheel = (event: React.WheelEvent) => {
    if (!event.metaKey && !event.ctrlKey) return
    event.preventDefault()
    onZoomBy(event.deltaY < 0 ? 1.12 : 1 / 1.12)
  }

  return (
    <div className="flex">
      {/* Outside the scroll container, so the headers stay put while the lanes
          scroll under them. */}
      <div className="w-[88px] shrink-0 pt-5">
        {scene.tracks.map((track) => (
          <React.Fragment key={track.id}>
            {/* One header for the group, and blanks under it. Repeating
                "Effects" down three rows would read as three kinds of effect
                rather than one lane that ran out of room. */}
            {effectRowsFor(track).map((_, row) => (
              <div
                key={`fx-${track.id}-${row}`}
                className="flex h-9 items-center gap-1.5 truncate text-[11px] text-muted-foreground"
              >
                {row === 0 ? (
                  <>
                    <HugeiconsIcon
                      aria-hidden="true"
                      icon={SparklesIcon}
                      size={13}
                    />
                    <span className="truncate">Effects</span>
                  </>
                ) : null}
              </div>
            ))}

            <div
              className={cn(
                "flex items-center gap-1.5 truncate text-[11px] text-muted-foreground",
                LANE_HEIGHT[track.kind]
              )}
            >
              <HugeiconsIcon
                aria-hidden="true"
                icon={TRACK_ICON[track.kind]}
                size={13}
              />
              <span className="truncate">{track.name}</span>
            </div>
          </React.Fragment>
        ))}
      </div>

      <div
        ref={scrollRef}
        className="min-w-0 flex-1 overflow-x-auto"
        onWheel={onWheel}
        onPointerDownCapture={onLanePointerDownCapture}
        onClickCapture={onLaneClickCapture}
      >
        <div
          className="relative"
          style={{ width: `${zoom * 100}%` }}
          onPointerMove={(event) => onHover(pointerToUs(event))}
          onPointerLeave={() => onHover(null)}
          onPointerDown={(event) => {
            // Clicking the lane itself is "I am looking somewhere else now", so
            // it drops the effect selection as well as moving the playhead.
            // Without it the toolbar keeps offering − ×1.20 + Remove for
            // something you stopped caring about several edits ago, and Remove
            // is destructive.
            onSelectEffect(null)
            onSeek(us(Math.round(pointerToUs(event))))
          }}
        >
          {/* More marks as it widens: seven labels across a 16x lane leaves
              twelve seconds between them, which is not a ruler. */}
          <TimeRuler
            spanUs={span}
            marks={Math.min(25, 7 + Math.round(Math.log2(zoom) * 3))}
          />
          <LivePlayhead player={player} spanUs={span} live={playing} />

          {/* The range being chosen. Drawn over every lane rather than inside
              one, because the gesture is about a stretch of time and not about
              a track — and inert, so it cannot swallow the release that ends
              the drag it is describing. */}
          {band ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-20 rounded-[3px] border border-foreground/40 bg-foreground/10"
              style={{
                left: `${(Math.min(band.fromUs, band.toUs) / span) * 100}%`,
                width: `${(Math.abs(band.toUs - band.fromUs) / span) * 100}%`,
              }}
            />
          ) : null}

          {/* The hover head. Quieter than the playhead — it is a question, not
              a position — and it carries the timecode so the preview does not
              have to be read for "where am I". */}
          {hoverUs !== null ? (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 z-10 w-px"
              style={{ left: `${(hoverUs / span) * 100}%` }}
            >
              <div className="h-full w-px bg-foreground/30" />
              <span className="absolute -top-5 left-1 rounded border border-border bg-card px-1 text-[10px] text-muted-foreground tabular-nums">
                {formatClock(hoverUs)}
              </span>
            </div>
          ) : null}

          {scene.tracks.map((track) => (
            <React.Fragment key={track.id}>
              {/* Above the track, not below it. The stack reads as depth, so
                  what is drawn on top of the picture belongs on top of the
                  picture — an effects lane underneath the footage it applies to
                  reads as something the footage sits on. */}
              {effectRowsFor(track).map((row, index) => (
                <EffectRow
                  key={`fx-${track.id}-${index}`}
                  empty={row.length === 0}
                >
                  {row.map((chip) => (
                    <EffectChipView
                      key={chip.id}
                      chip={chip}
                      span={span}
                      laneWidth={laneWidth}
                      selected={chip.id === selectedEffectId}
                      disabled={locked}
                      onSelect={onSelectEffect}
                      hosts={hostsFor(track)}
                      onMove={onMoveEffect}
                      onResize={onResizeEffect}
                    />
                  ))}
                </EffectRow>
              ))}

              <Lane track={track}>
                {track.elements.map((element, index) =>
                  track.kind === "caption" ? (
                    <CaptionChip
                      key={element.id}
                      element={element}
                      geometry={geometryOf(track.id, element)}
                      span={span}
                      reveal={reveal}
                      revealIndex={index}
                      revealCount={track.elements.length}
                      laneWidth={laneWidth}
                    />
                  ) : (
                    <Clip
                      key={element.id}
                      element={element}
                      geometry={geometryOf(track.id, element)}
                      span={span}
                      selected={element.id === selectedId}
                      onSelect={onSelect}
                      seekIndex={track.kind === "video" ? seekIndex : null}
                      strip={
                        "mediaId" in element
                          ? (filmstrips[element.mediaId] ?? null)
                          : null
                      }
                      trackId={track.id}
                      reveal={reveal}
                      revealIndex={index}
                      revealCount={track.elements.length}
                      laneWidth={laneWidth}
                      trimming={trim?.elementId === element.id}
                      onTrim={onTrim}
                      onTrimCommit={onTrimCommit}
                    />
                  )
                )}
              </Lane>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  )
}

/**
 * A row of the effects lane.
 *
 * Shorter than a track row — a chip carries an icon and a word, not a filmstrip
 * — but not as short as it was. At 20px the label had to be 9px to fit, and
 * 9px text on a coloured chip cannot pass contrast at any opacity worth using.
 * 28px is the height at which the row can say what it is.
 */
function EffectRow({
  empty,
  children,
}: {
  empty?: boolean
  children: React.ReactNode
}) {
  return (
    <div className="relative h-9 py-1">
      <div
        className={cn(
          "relative h-full rounded-[3px]",
          // The same treatment an empty track lane gets, so a reserved row
          // reads as a place something goes rather than as a gap.
          empty && "border border-dashed border-border/50"
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * How tall each kind of lane is.
 *
 * The spine is taller than the rest because it is the only one showing
 * pictures, and the pictures keep the footage's own shape — a portrait frame at
 * 36px is 20 pixels across, which reads as a stripe rather than as a shot.
 * 60px, which leaves a 44px picture once the lane's padding and the clip's
 * inset come out of it. Measured rather than guessed: the spine is 44px and
 * the other lanes are 25px. Two rounds of estimating from
 * screenshots put it at 95px, because the screenshots were retina and every
 * dimension in them was double.
 *
 * One map, read by both the header column and the lanes. They are separate
 * DOM trees that have to line up row for row, and two independent `h-` classes
 * is a misalignment waiting for someone to change one of them.
 */
const LANE_HEIGHT: Record<Track["kind"], string> = {
  video: "h-[60px]",
  broll: "h-[60px]",
  audio: "h-11",
  caption: "h-11",
  text: "h-11",
  graphic: "h-11",
}

/**
 * A track row.
 *
 * Always drawn, even empty: the timeline must not change height when a tool
 * returns, or every lane below it jumps as each one lands.
 */
function Lane({
  track,
  children,
}: {
  track: Track
  children: React.ReactNode
}) {
  const empty = track.elements.length === 0

  return (
    <div className={cn("relative py-1", LANE_HEIGHT[track.kind])}>
      <div
        className={cn(
          "relative h-full rounded-[3px]",
          empty && "border border-border/50 bg-secondary/30"
        )}
      >
        {children}
      </div>
    </div>
  )
}

/**
 * What each kind of effect is, at a glance.
 *
 * An icon and not a colour per kind. Rows are packed to save vertical space, so
 * the same zoom sits on row one today and row two after you add a blur beside
 * it — colour keyed to kind would survive that, but four palette hues would
 * also claim "these are four categories" in a palette where every hue already
 * means something else (brass is action, danger is loss, success is done). One
 * surface, and the icon carries the kind.
 */
const EFFECT_ICON: Record<EffectChip["kind"], IconSvgElement> = {
  zoom: ZoomInAreaIcon,
  blur: DropletIcon,
  brightness: SunIcon,
  contrast: ContrastIcon,
  saturation: PaintBoardIcon,
  hue: ColorsIcon,
  // The three looks share one icon on purpose. They are the same *kind* of
  // decision — a wholesale change to how the picture reads — and three
  // near-identical glyphs at 12px would be three ways of saying "look" that
  // nobody can tell apart. The label does the telling.
  grayscale: PaintBucketIcon,
  sepia: PaintBucketIcon,
  invert: PaintBucketIcon,
  "fade-in": FlashIcon,
  "fade-out": FlashIcon,
}

/** Icon, a space and three characters. Below this the label is noise. */
const EFFECT_LABEL_MIN_PX = 62

/**
 * Two 12px edges and something left to grab between them.
 *
 * Under this the handles are the whole chip, so the gesture you get is decided
 * by which of two targets the cursor landed in rather than by what you meant.
 */
const EFFECT_HANDLE_MIN_PX = 34

/**
 * Which tracks get an effects row drawn under their name whether or not they
 * have one. An effect applies to a picture, so a caption or audio lane has
 * nothing to show and no reason to reserve the space.
 */
const CAN_CARRY_EFFECTS = new Set<Track["kind"]>(["video", "broll"])

/**
 * How far the pointer travels before a press becomes a zoom.
 *
 * Six pixels, which is roughly the wobble in a click made while talking. Below
 * it every press on the timeline would be a navigation.
 */
const MARQUEE_MIN_PX = 6

/**
 * The shortest range worth zooming to. A hundred milliseconds is about three
 * frames; anything under it is a slip rather than a selection, and zooming to
 * it would land at 32x somewhere nobody chose.
 */
const MARQUEE_MIN_US = 100_000

/** One frame at 30fps, the same nudge a trim edge takes. */
const EFFECT_NUDGE_US = 33_333

/**
 * One effect on the lane: drag it to move it, click it to change how far it
 * goes, arrow keys to nudge it a frame at a time.
 *
 * The keyboard path is not a courtesy. `TrimHandle` below argues that a trim
 * you can only perform by dragging is a trim you cannot perform precisely, and
 * a punch-in that lands one frame after the word it emphasises is the same
 * problem — so the same arrow keys do the same thing, and Shift takes ten.
 *
 * A fade is not draggable. It is an opacity curve pinned to the ends of its
 * clip — a fade-in that starts a second late is not a fade-in, it is a flash —
 * so it is shown, because you should be able to see that it is there, and it is
 * retimed by asking for a different length rather than by sliding it.
 */
function EffectChipView({
  chip,
  span,
  laneWidth,
  selected,
  disabled,
  hosts,
  onSelect,
  onMove,
  onResize,
}: {
  chip: EffectChip
  span: number
  laneWidth: number
  hosts: EffectHost[]
  selected: boolean
  disabled?: boolean
  onSelect: (chip: EffectChip | null) => void
  onMove: (chip: EffectChip, deltaUs: number) => void
  onResize: (chip: EffectChip, edge: "start" | "end", deltaUs: number) => void
}) {
  /**
   * Where the chip is drawn while a gesture is in flight.
   *
   * One piece of state for both gestures, because they produce the same thing —
   * a box — and holding a move offset and a resize delta separately meant every
   * render had to work out which of the two was live before it could position
   * anything.
   */
  const [preview, setPreview] = React.useState<{
    startUs: number
    durationUs: number
  } | null>(null)

  /**
   * A look has no window, so there is nothing to move and nothing to resize.
   *
   * `moveEffect` and `resizeEffect` both answer a curveless effect with no ops
   * at all, which is right — and a chip that still offered the gesture drew a
   * drag the document refused, which reads as the effect snapping back.
   */
  const movable = chip.effectId !== null && chip.windowed && !disabled

  const startUs = preview?.startUs ?? chip.startUs
  const durationUs = preview?.durationUs ?? chip.durationUs
  const widthPx = (durationUs / span) * laneWidth

  /**
   * Whether there is room for two edges and a body between them.
   *
   * Below this the handles are the whole chip, so grabbing it to move it means
   * resizing it instead — and the gesture you get is decided by which of two
   * 12px targets your cursor happened to land in.
   */
  const resizable = movable && widthPx >= EFFECT_HANDLE_MIN_PX

  const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
    onSelect(chip)
    if (!movable || laneWidth === 0) return

    event.stopPropagation()
    event.preventDefault()
    // preventDefault suppresses the mousedown that would have focused this
    // button, so the focus has to be taken by hand — otherwise clicking a chip
    // and then pressing Escape or an arrow key does nothing at all.
    event.currentTarget.focus()

    const originX = event.clientX
    const perPx = span / laneWidth

    // Clamped to the clip, because the op is. An unclamped preview follows the
    // cursor past the end of the shot and the commit pulls it back, so the drag
    // shows you a position the document was never going to accept.
    const onPointerMove = (move: PointerEvent) => {
      setPreview(previewMove(chip, (move.clientX - originX) * perPx, hosts))
    }

    const stop = () => {
      window.removeEventListener("pointermove", onPointerMove)
      window.removeEventListener("pointerup", onPointerUp)
      window.removeEventListener("pointercancel", onPointerCancel)
      setPreview(null)
    }

    const onPointerUp = (up: PointerEvent) => {
      stop()

      const deltaUs = (up.clientX - originX) * perPx
      // A click is a selection, not a one-microsecond move. Without this every
      // click on a chip writes a revision, and undo fills up with edits nobody
      // made.
      if (Math.abs(up.clientX - originX) > 2) onMove(chip, deltaUs)
    }

    /**
     * The pointer taken away mid-drag: a system gesture, a right-click, the
     * browser deciding it owns the touch now.
     *
     * Without this the listeners stay attached and `dragUs` stays set, so the
     * chip renders at an offset the document does not have — and the next
     * pointerup anywhere on the page commits a move nobody made.
     */
    const onPointerCancel = () => stop()

    window.addEventListener("pointermove", onPointerMove)
    window.addEventListener("pointerup", onPointerUp)
    window.addEventListener("pointercancel", onPointerCancel)
  }

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (!movable) return

    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
    if (!direction) return

    event.preventDefault()
    event.stopPropagation()
    onMove(chip, direction * EFFECT_NUDGE_US * (event.shiftKey ? 10 : 1))
  }

  return (
    /**
     * A box, with the chip and its two edges inside it.
     *
     * It was a single `<button>` until the edges arrived, and a button cannot
     * hold buttons — nesting interactive content is invalid, and the browser
     * reparents its way out of it in ways that lose the inner click entirely.
     * So the box does the positioning and the three controls sit in it, which
     * is the shape `Clip` already has for the same reason.
     */
    <div
      className={cn("group/chip absolute inset-y-0", preview && "z-30")}
      style={{
        left: `${(startUs / span) * 100}%`,
        width: chipWidth((durationUs / span) * 100),
        // Without this a horizontal drag inside the scrolling lane is a pan,
        // not a move, on every touch device.
        touchAction: "none",
      }}
    >
      <button
        type="button"
        data-owns-drag=""
        onPointerDown={onPointerDown}
        onClick={() => onSelect(chip)}
        onKeyDown={onKeyDown}
        aria-current={selected ? "true" : undefined}
        title={`${effectLabel(chip)} — ${formatTimecode(chip.startUs)}`}
        className={cn(
          "absolute inset-0 flex items-center justify-center gap-1 overflow-hidden rounded-[3px] px-1.5",
          "text-[11px] leading-none whitespace-nowrap",
          // Selection inverts the fill rather than adding a ring: the chip is
          // 28px tall, and a ring on every side of it merges with its
          // neighbours' on a dense lane. The focus ring stays, because "the
          // keyboard is here" is a different claim from "this one is selected".
          selected
            ? "bg-effect-foreground text-effect-surface"
            : "bg-effect-surface text-effect-foreground",
          "transition-colors duration-150 ease-out",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          movable ? "cursor-grab active:cursor-grabbing" : "cursor-default",
          preview && "shadow-md"
        )}
      >
        <HugeiconsIcon
          aria-hidden="true"
          icon={EFFECT_ICON[chip.kind]}
          size={12}
          className="shrink-0"
        />
        {/* Below three characters the label is noise, and the icon alone still
            says an effect is here — which is the thing that was missing.

            `min-w-0` is what makes `truncate` work at all here. A flex item
            defaults to `min-width: auto`, so it refuses to shrink below its
            content and never reaches the width at which an ellipsis appears —
            it just overflows, and the button's `overflow-hidden` cuts it. Under
            `justify-center` that cut lands on *both* ends, so a narrow chip
            shows the middle of its label and neither edge. */}
        {widthPx >= EFFECT_LABEL_MIN_PX ? (
          <span className="min-w-0 truncate">{effectLabel(chip)}</span>
        ) : null}
      </button>

      {resizable ? (
        <>
          <EffectEdge
            edge="start"
            chip={chip}
            onPreview={setPreview}
            onResize={onResize}
          />
          <EffectEdge
            edge="end"
            chip={chip}
            onPreview={setPreview}
            onResize={onResize}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * One end of an effect, draggable.
 *
 * The same gesture the clips have, for the same argument `TrimHandle` makes
 * about pointer capture: the pointer leaves a 12px target on the first
 * millimetre of a real drag, and capture is what keeps the events — including
 * the pointerup that ends it — coming back to the element that started them.
 *
 * The scale is read once on pointerdown from the chip's own box. Reading it per
 * move would use the box's *pending* width, so the scale would drift as the
 * preview grew and the edge would accelerate away from the cursor.
 *
 * Hidden until the chip is hovered or the edge has focus. An effects lane is
 * dense and four permanently visible grab bars per chip would read as ticks on
 * a ruler rather than as something to take hold of.
 */
function EffectEdge({
  edge,
  chip,
  onPreview,
  onResize,
}: {
  edge: "start" | "end"
  chip: EffectChip
  onPreview: (preview: { startUs: number; durationUs: number } | null) => void
  onResize: (chip: EffectChip, edge: "start" | "end", deltaUs: number) => void
}) {
  const drag = React.useRef<{ x: number; usPerPx: number } | null>(null)

  const capture = (element: HTMLElement, pointerId: number, on: boolean) => {
    try {
      if (on) element.setPointerCapture(pointerId)
      else element.releasePointerCapture(pointerId)
    } catch {
      // No active pointer with that id. Capture is an optimisation on where the
      // events go; it must never stand between the gesture and the edit.
    }
  }

  const deltaFrom = (clientX: number) =>
    drag.current
      ? Math.round((clientX - drag.current.x) * drag.current.usPerPx)
      : 0

  /**
   * What the box looks like partway through a drag of this edge.
   *
   * Shares its clamp with `resizeEffect` rather than following the cursor,
   * which is what made a drag past the end of a clip show a length and then
   * take it back on release.
   */
  const previewFor = (deltaUs: number) => previewResize(chip, edge, deltaUs)

  return (
    <button
      type="button"
      data-owns-drag=""
      aria-label={`${edge === "start" ? "Start" : "End"} of ${effectLabel(chip)}`}
      onKeyDown={(event) => {
        const direction =
          event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
        if (!direction) return

        event.preventDefault()
        // The chip's own arrow keys move the whole effect. Without this, an
        // arrow on a focused edge would retime it and move it at once.
        event.stopPropagation()
        onResize(
          chip,
          edge,
          direction * EFFECT_NUDGE_US * (event.shiftKey ? 10 : 1)
        )
      }}
      onPointerDown={(event) => {
        // The lane seeks on pointerdown and the chip selects and moves on it; a
        // grab on the edge is none of those.
        event.stopPropagation()
        event.preventDefault()
        event.currentTarget.focus()

        const box = event.currentTarget.parentElement?.getBoundingClientRect()
        if (!box?.width || !chip.durationUs) return

        drag.current = {
          x: event.clientX,
          usPerPx: chip.durationUs / box.width,
        }
        capture(event.currentTarget, event.pointerId, true)
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        onPreview(previewFor(deltaFrom(event.clientX)))
      }}
      onPointerUp={(event) => {
        if (!drag.current) return
        const deltaUs = deltaFrom(event.clientX)
        drag.current = null
        onPreview(null)
        // A click on an edge is not a zero-microsecond resize. Without this
        // every press writes a revision and undo fills with edits nobody made.
        if (Math.abs(deltaUs) > 0) onResize(chip, edge, deltaUs)
        capture(event.currentTarget, event.pointerId, false)
      }}
      onPointerCancel={(event) => {
        drag.current = null
        onPreview(null)
        capture(event.currentTarget, event.pointerId, false)
      }}
      className={cn(
        // The visible line is 3px; the target is wider than it looks, because a
        // 3px hit area is a 3px hit area.
        "absolute inset-y-0 z-10 w-3 cursor-ew-resize opacity-0",
        "transition-opacity duration-150 ease-out",
        "group-hover/chip:opacity-100 focus-visible:opacity-100",
        "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        // Inside the box rather than straddling its edge. Chips butt against
        // each other on a packed row, and a handle hanging 6px past the end
        // would sit on top of the neighbour it is not part of.
        edge === "start" ? "left-0" : "right-0"
      )}
    >
      <span
        aria-hidden="true"
        className="absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full bg-current opacity-70"
      />
    </button>
  )
}

/**
 * A chip's width, with a gutter bitten out of the right-hand side.
 *
 * Chips are positioned and sized in percentages of the lane, so butt-joined
 * elements — every word of a word-by-word caption — share an edge and the lane
 * reads as one long bar with seams in it. Six fixed pixels of gap is what makes
 * them read as separate things.
 *
 * Fixed pixels and not a percentage, deliberately: a percentage gutter would
 * grow as you zoom in, and zoomed in is where you least need help telling one
 * chip from the next. `max()` rather than a `min-width`, because a negative
 * `calc` width is an invalid declaration that CSS drops entirely — leaving an
 * absolutely positioned element at `width: auto`, which is its text.
 */
function chipWidth(percent: number): string {
  return `max(2px, calc(${percent}% - ${CHIP_GUTTER_PX}px))`
}

const CHIP_GUTTER_PX = 6

type Geometry = { startUs: number; durationUs: number }

function Clip({
  element,
  geometry,
  trackId,
  span,
  selected,
  onSelect,
  seekIndex,
  strip,
  trimming,
  onTrim,
  onTrimCommit,
  reveal,
  revealIndex,
  revealCount,
  laneWidth,
}: {
  element: TimelineElement
  geometry: Geometry
  trackId: string
  span: number
  selected: boolean
  onSelect: (elementId: string) => void
  seekIndex: LaneSeekIndex | null
  strip: FilmstripSheet | null
  trimming: boolean
  onTrim: (trim: TrimDrag | null) => void
  onTrimCommit: (trim: TrimDrag) => void
  reveal: Reveal | null
  revealIndex: number
  revealCount: number
  laneWidth: number
}) {
  const clip = element as VideoElement
  const trimmable = element.kind === "video"
  /** Whether this clip is drawing footage rather than the flat placeholder. */
  const showsFrames = trimmable && Boolean(strip)

  const offsetPx = revealOffsetPx(
    reveal,
    element.id,
    geometry.startUs,
    span,
    laneWidth
  )

  return (
    <div
      className={cn(
        "group absolute inset-y-1",
        // The stagger lives here, on one state change, rather than in a timer
        // that feeds clips in one at a time. globals.css flattens every
        // transition-duration under `reduce`, and useReveal declines to capture
        // at all — so this is belt and braces on a preference that matters.
        reveal?.animating &&
          "transition-transform ease-out motion-reduce:transition-none"
      )}
      style={{
        left: `${(geometry.startUs / span) * 100}%`,
        width: `${(geometry.durationUs / span) * 100}%`,
        transform: offsetPx ? `translateX(${offsetPx}px)` : undefined,
        transitionDuration: reveal ? `${REVEAL_TRAVEL_MS}ms` : undefined,
        transitionDelay: reveal?.animating
          ? `${revealDelayMs(revealIndex, revealCount)}ms`
          : undefined,
      }}
    >
      <button
        type="button"
        onClick={(event) => {
          // The lane below seeks on pointerdown; a click on a clip should
          // select it and not also move the playhead to its left edge.
          event.stopPropagation()
          onSelect(element.id)
        }}
        onPointerDown={(event) => event.stopPropagation()}
        title={element.name}
        className={cn(
          "absolute inset-0 overflow-hidden rounded-[4px] border border-border/70 bg-secondary text-left",
          // No reduced-motion gate: globals.css flattens every
          // transition-duration under `reduce`, so CSS motion is covered
          // project-wide.
          "transition-[background-color] duration-150 ease-out",
          "hover:bg-sand-200 dark:hover:bg-sand-800",
          "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
          selected && "ring-2 ring-foreground/70"
        )}
      >
        <Filmstrip
          strip={trimmable ? strip : null}
          trimStartUs={clip.trimStartUs ?? 0}
          trimEndUs={clip.trimEndUs ?? 0}
          widthPx={(geometry.durationUs / span) * laneWidth}
        />

        {trimmable && seekIndex ? (
          <ClipWaveform
            peaks={seekIndex.values}
            intervalUs={seekIndex.intervalUs}
            trimStartUs={clip.trimStartUs}
            trimEndUs={clip.trimEndUs}
            overFrames={showsFrames}
          />
        ) : null}

        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[2px]"
          style={{
            backgroundImage:
              element.provenance.createdBy === "agent"
                ? element.provenance.lastEditedBy === "user"
                  ? "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 60%, transparent) 0 2px, transparent 2px 8px)"
                  : "repeating-linear-gradient(90deg, color-mix(in oklch, var(--color-sand-500) 85%, transparent) 0 3px, transparent 3px 6px)"
                : undefined,
          }}
        />

        {/* A scrim under the name, and only when there is something to read it
            against. Dark text on video is legible over a jacket and invisible
            over a window, and there is no colour that is legible over both —
            so the picture is darkened where the label sits rather than the
            label being asked to cope. */}
        {showsFrames ? (
          <span
            aria-hidden="true"
            className="absolute inset-x-0 top-0 h-5 bg-gradient-to-b from-black/55 to-transparent"
          />
        ) : null}

        <span
          className={cn(
            "relative block truncate px-1.5 pt-2 text-[10px] leading-none",
            showsFrames ? "text-white" : "text-foreground/80"
          )}
        >
          {element.name}
        </span>
      </button>

      {/* Hidden until hover so 22 clips are not 44 permanent grab targets. */}
      {trimmable ? (
        <>
          <TrimHandle
            edge="start"
            clip={clip}
            trackId={trackId}
            trimming={trimming}
            onTrim={onTrim}
            onTrimCommit={onTrimCommit}
          />
          <TrimHandle
            edge="end"
            clip={clip}
            trackId={trackId}
            trimming={trimming}
            onTrim={onTrim}
            onTrimCommit={onTrimCommit}
          />
        </>
      ) : null}
    </div>
  )
}

/**
 * One frame at 30fps, which is what an arrow key moves an edge by.
 *
 * A trim you can only perform by dragging is a trim you cannot perform
 * precisely, and the last few frames of a cut are the ones worth arguing over.
 * Shift takes ten at a time for crossing a second without holding a key down.
 */
const NUDGE_US = 33_333

/**
 * A draggable edge.
 *
 * Pointer capture rather than window listeners: the pointer leaves this 3px
 * target on the first millimetre of any real drag, and capture is what keeps
 * the events coming to the element that started it — including the pointerup,
 * which is otherwise delivered to whatever the cursor happens to be over and
 * leaves the drag running.
 *
 * The pixels-per-microsecond scale is read once, on pointerdown, from the clip
 * this handle belongs to. Reading it per move would use the clip's *pending*
 * width, so the scale would drift as the preview moved and the edge would
 * accelerate away from the cursor.
 *
 * Both capture calls are guarded, and the commit happens before the release.
 * `setPointerCapture` and `releasePointerCapture` throw when the pointer id is
 * not active — a pointer the OS took away, a capture the browser declined —
 * and an exception on the way out of pointerup swallows the whole drag: the
 * preview has been drawn for a second, the pointer lifts, and the timeline
 * quietly returns to where it was. Capture is an optimisation on where the
 * events go. It must never stand between the gesture and the edit.
 */
function TrimHandle({
  edge,
  clip,
  trackId,
  trimming,
  onTrim,
  onTrimCommit,
}: {
  edge: "start" | "end"
  clip: VideoElement
  trackId: string
  trimming: boolean
  onTrim: (trim: TrimDrag | null) => void
  onTrimCommit: (trim: TrimDrag) => void
}) {
  const drag = React.useRef<{ x: number; pxPerUs: number } | null>(null)

  const capture = (element: HTMLElement, pointerId: number, on: boolean) => {
    try {
      if (on) element.setPointerCapture(pointerId)
      else element.releasePointerCapture(pointerId)
    } catch {
      // No active pointer with that id. Worth nothing on its own, and worth
      // less than the drag it would otherwise abort.
    }
  }

  const deltaFrom = (clientX: number) =>
    drag.current
      ? Math.round((clientX - drag.current.x) / drag.current.pxPerUs)
      : 0

  const nudge = (event: React.KeyboardEvent) => {
    const direction =
      event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : 0
    if (!direction) return

    event.preventDefault()
    event.stopPropagation()
    onTrimCommit({
      trackId,
      elementId: clip.id,
      edge,
      deltaUs: direction * NUDGE_US * (event.shiftKey ? 10 : 1),
    })
  }

  return (
    <button
      type="button"
      data-owns-drag=""
      aria-label={`Trim ${edge === "start" ? "in" : "out"} point of ${clip.name}`}
      onKeyDown={nudge}
      onPointerDown={(event) => {
        // The lane seeks on pointerdown and the clip selects on click; a grab
        // on the edge is neither.
        event.stopPropagation()
        event.preventDefault()

        const box = event.currentTarget.parentElement?.getBoundingClientRect()
        if (!box?.width || !clip.durationUs) return

        drag.current = {
          x: event.clientX,
          pxPerUs: box.width / clip.durationUs,
        }
        capture(event.currentTarget, event.pointerId, true)
        onTrim({ trackId, elementId: clip.id, edge, deltaUs: 0 })
      }}
      onPointerMove={(event) => {
        if (!drag.current) return
        onTrim({
          trackId,
          elementId: clip.id,
          edge,
          deltaUs: deltaFrom(event.clientX),
        })
      }}
      onPointerUp={(event) => {
        if (!drag.current) return
        const deltaUs = deltaFrom(event.clientX)
        drag.current = null
        onTrimCommit({ trackId, elementId: clip.id, edge, deltaUs })
        capture(event.currentTarget, event.pointerId, false)
      }}
      onPointerCancel={(event) => {
        drag.current = null
        onTrim(null)
        capture(event.currentTarget, event.pointerId, false)
      }}
      className={cn(
        // The visible line is 3px; the target is wider than it looks, because a
        // 3px hit area is a 3px hit area.
        "absolute inset-y-0 z-20 w-3 cursor-ew-resize opacity-0",
        "transition-opacity duration-150 ease-out",
        "group-hover:opacity-100 focus-visible:opacity-100",
        trimming && "opacity-100",
        edge === "start" ? "-left-1.5" : "-right-1.5"
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-y-1 left-1/2 w-[3px] -translate-x-1/2 rounded-full",
          trimming ? "bg-foreground" : "bg-foreground/50"
        )}
      />
    </button>
  )
}

/** Three characters and the padding, at the 11px the caption labels use. */
const CAPTION_LABEL_MIN_PX = 30

function CaptionChip({
  element,
  geometry,
  span,
  reveal,
  revealIndex,
  revealCount,
  laneWidth,
}: {
  element: TimelineElement
  geometry: Geometry
  span: number
  reveal: Reveal | null
  revealIndex: number
  revealCount: number
  laneWidth: number
}) {
  // Captions sweep with the clips they belong to. A tightening that moved the
  // spine and left the words behind for 400ms would read as the bug the remap
  // exists to prevent.
  const offsetPx = revealOffsetPx(
    reveal,
    element.id,
    geometry.startUs,
    span,
    laneWidth
  )

  /**
   * How wide this chip actually is, which is what decides whether the word
   * fits — not the zoom level.
   *
   * The threshold used to be `zoom >= 6`, and zoom on its own cannot answer the
   * question: a word is a fraction of the *cut*, so at 8x a 300ms word is 96px
   * wide on a 15 second take and 5px wide on a five minute one. The short cut
   * showed its words two steps before it needed to and the long one never showed
   * them at all, at any zoom, which is the case where reading the lane matters
   * most. Twenty-eight pixels is about three characters and the padding —
   * enough that a truncated word still says which word it is.
   */
  const widthPx = (geometry.durationUs / span) * laneWidth

  return (
    <span
      className={cn(
        // inset-y-0.5, not inset-y-1.5: the row is 36px and the chip was using
        // 24 of it, which is why the words were unreadable at any size that fit
        // inside them. The lane is no taller for this.
        "absolute inset-y-0.5 flex items-center overflow-hidden rounded-[3px] bg-sand-300 dark:bg-sand-700",
        reveal?.animating &&
          "transition-transform ease-out motion-reduce:transition-none"
      )}
      style={{
        left: `${(geometry.startUs / span) * 100}%`,
        width: chipWidth((geometry.durationUs / span) * 100),
        transform: offsetPx ? `translateX(${offsetPx}px)` : undefined,
        transitionDuration: reveal ? `${REVEAL_TRAVEL_MS}ms` : undefined,
        transitionDelay: reveal?.animating
          ? `${revealDelayMs(revealIndex, revealCount)}ms`
          : undefined,
      }}
    >
      {/* The word itself, once there is room for it. Below that the chip is
          narrower than a character and the lane is better read as density.

          Full-strength foreground, not /70: at this size the dimmed version was
          3.51:1 in light and 4.03:1 in dark, both under the 4.5:1 floor. The
          chip is already a quiet surface; the text on it does not also have to
          be quiet. */}
      {widthPx >= CAPTION_LABEL_MIN_PX ? (
        <span
          // min-w-0 for the same reason as the effect chip: a flex item will
          // not shrink past its content, so truncate never fires and the word
          // is cut without an ellipsis instead of being shortened with one.
          className="block min-w-0 truncate px-1.5 text-[11px] leading-none text-foreground"
          title={element.name}
        >
          {element.name}
        </span>
      ) : null}
    </span>
  )
}
