"use client"

import * as React from "react"
import { Audio, Video } from "@remotion/media"
import {
  AbsoluteFill,
  Img,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
} from "remotion"

import { isFullFrame } from "@/lib/editor/box"
import { bedGain, voiceRegions } from "@/lib/editor/ducking"
import { clipRate } from "@/lib/editor/timeline"
import { us } from "@/lib/editor/time"
import { textOpacity } from "@/lib/editor/titles"
import {
  dipOpacity,
  dissolveOpacity,
  transitionWindows,
  type TransitionWindow,
} from "@/lib/editor/transitions"
import {
  sampleChannel,
  cssFilter,
  cssObjectPosition,
  cssTransform,
  cssTransformOrigin,
  resolveVisual,
} from "@/lib/editor/effects"
import { cutEdges, edgeGain, type AudioEdges } from "@/lib/editor/audio-edges"
import { durationInFrames, framesFor, usForFrame } from "@/lib/editor/frames"
import type {
  AudioElement,
  Box,
  CaptionElement,
  ImageElement,
  Scene,
  TextElement,
  TimelineElement,
  VideoElement,
} from "@/lib/editor/types"

/**
 * The cut, as a composition.
 *
 * This is the compositor `lib/editor/types.ts` has claimed from the start —
 * "preview and export consume the same document through the same compositor" —
 * and until now there wasn't one. The preview was a `<video>` element with a
 * seek loop, which could show footage and nothing else: captions sat on the
 * timeline and never appeared on the picture, because nothing was drawing them.
 *
 * Everything here derives from one number. `useCurrentFrame()` is the frame
 * being shown, and the clip on screen, the caption word lit up and the playhead
 * on the timeline are all read from it. There is nothing to keep in sync,
 * because there are no two things — which is the difference between an editor
 * that feels like one machine and one that feels like a video element with a
 * diagram next to it.
 *
 * A clip is a `<Sequence>` holding a `<Video>` trimmed to its own window, so
 * the join between two clips is a mount rather than a seek. `premountFor` is
 * what makes it seamless: Remotion mounts the next sequence early and
 * invisibly, so its media has already loaded and landed on the right frame
 * before the playhead arrives at it.
 */

export type CompositionMedia = {
  /** The transcoded proxy. Normalised, upright, and safe to decode anywhere. */
  proxyUrl: string | null
  /**
   * This session's upload, played while the proxy is still transcoding.
   *
   * Carries `rotation` with it, because unlike the proxy it has not been
   * through ffmpeg — a phone recording holds its orientation in a display
   * matrix that the decoder does not apply.
   */
  localUrl?: string | null
  rotation?: number
  /** The cleaned voice, played in place of the clip's own sound when asked. */
  voiceUrl?: string | null
}

export type CompositionProps = {
  scene: Scene
  media: Record<string, CompositionMedia>
  background: string
}

/**
 * How far ahead the next clip is mounted.
 *
 * Two seconds at 30fps. Long enough for a proxy segment to load and seek over
 * a normal connection, short enough that a timeline of forty clips is not
 * mounting a dozen video decoders at once. This is the single prop that turns a
 * cut from "seek, stall, resume" into a hop you do not notice.
 */
const PREMOUNT_FRAMES = 60

/**
 * The canvas the document was laid out on. Fonts and offsets are in its
 * pixels, so an export at another resolution draws at this size and scales
 * the whole frame (`ScaledComposition`), rather than relaying out the text.
 */
const LayoutCanvas = React.createContext<{ width: number; height: number } | null>(null)

function useLayoutCanvas(): { width: number; height: number } {
  const config = useVideoConfig()
  return React.useContext(LayoutCanvas) ?? { width: config.width, height: config.height }
}

/** The cut drawn at `canvas` and scaled to whatever size is rendering it. */
export function ScaledComposition({
  canvas,
  ...props
}: CompositionProps & { canvas: { width: number; height: number } }) {
  const { width } = useVideoConfig()
  const scale = width / canvas.width
  return (
    <AbsoluteFill style={{ backgroundColor: props.background, overflow: "hidden" }}>
      <LayoutCanvas.Provider value={canvas}>
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: canvas.width,
            height: canvas.height,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
          }}
        >
          <EditorComposition {...props} />
        </div>
      </LayoutCanvas.Provider>
    </AbsoluteFill>
  )
}

export function EditorComposition({
  scene,
  media,
  background,
}: CompositionProps) {
  const { fps } = useVideoConfig()
  // Where the voice is, for every music bed's duck. Once per scene, not per
  // frame: the regions only move when the document does.
  const voice = React.useMemo(() => voiceRegions(scene), [scene])

  return (
    <AbsoluteFill style={{ backgroundColor: background }}>
      {scene.tracks
        /**
         * Document order, and it is load-bearing.
         *
         * The document lists the spine first and the lanes that sit over it
         * after — which is exactly DOM paint order, where later siblings draw
         * on top. Reversing it, which looked right for about a minute, put the
         * video over the captions: the text was in the DOM at full size and
         * behind the picture, so the lane showed captions and the frame did
         * not. Visible only by looking at it.
         */
        .filter((track) => !track.hidden)
        .map((track) => {
          const edges = cutEdges(track)
          const windows = transitionWindows(track)
          const into = new Map(windows.map((window) => [window.next.id, window]))
          const outOf = new Map(
            windows
              .filter((window) => window.kind === "dissolve")
              .map((window) => [window.previous.id, window])
          )
          const muted = Boolean(track.muted)

          const layers = track.elements.map((element) => {
            if (element.hidden) return null

            const from = framesFor(element.startUs, fps)
            const length = durationInFrames(element.durationUs, fps)

            if (element.kind === "video") {
              const tail = outOf.get(element.id)
              return (
                <React.Fragment key={element.id}>
                  <Sequence
                    from={from}
                    durationInFrames={length}
                    premountFor={PREMOUNT_FRAMES}
                    // Named, because Remotion's own timeline reads these and a
                    // composition of "Sequence, Sequence, Sequence" is unusable
                    // the moment something goes wrong.
                    name={element.name}
                  >
                    <Clip
                      element={element}
                      media={media[element.mediaId]}
                      edges={edges.get(element.id)}
                      length={length}
                      trackMuted={muted}
                      dissolve={into.get(element.id)}
                    />
                  </Sequence>
                  {tail ? (
                    // The outgoing clip carries on past its own end, under the
                    // incoming one, for as long as the dissolve lasts. Silent:
                    // the sound cuts where the cut is.
                    <Sequence
                      from={framesFor(tail.joinUs, fps)}
                      durationInFrames={durationInFrames(tail.durationUs, fps)}
                      name={`${element.name} (dissolve)`}
                    >
                      <Clip
                        element={{
                          ...element,
                          startUs: tail.joinUs,
                          durationUs: tail.durationUs,
                          trimStartUs: element.trimEndUs,
                          trimEndUs: us(
                            element.trimEndUs +
                              Math.round(tail.durationUs * clipRate(element))
                          ),
                          muted: true,
                          animations: { channels: {} },
                        }}
                        media={media[element.mediaId]}
                        length={durationInFrames(tail.durationUs, fps)}
                        trackMuted
                      />
                    </Sequence>
                  ) : null}
                </React.Fragment>
              )
            }

            if (element.kind === "image") {
              return (
                <Sequence
                  key={element.id}
                  from={from}
                  durationInFrames={length}
                  premountFor={PREMOUNT_FRAMES}
                  name={element.name}
                >
                  <Still element={element} media={media[element.mediaId]} />
                </Sequence>
              )
            }

            if (element.kind === "audio") {
              return (
                <Sequence
                  key={element.id}
                  from={from}
                  durationInFrames={length}
                  premountFor={PREMOUNT_FRAMES}
                  name={element.name}
                >
                  <Bed
                    element={element}
                    media={media[element.mediaId]}
                    regions={voice}
                    trackMuted={muted}
                  />
                </Sequence>
              )
            }

            if (element.kind === "caption") {
              return (
                <Sequence
                  key={element.id}
                  from={from}
                  durationInFrames={length}
                  name={element.name}
                >
                  <Caption element={element} />
                </Sequence>
              )
            }

            if (element.kind === "text") {
              return (
                <Sequence
                  key={element.id}
                  from={from}
                  durationInFrames={length}
                  name={element.name}
                >
                  <TextLayer element={element} />
                </Sequence>
              )
            }

            return null
          })

          // Dips paint over the whole track, after its clips.
          const dips = windows
            .filter((window) => window.kind !== "dissolve")
            .map((window) => {
              const half = Math.round(window.durationUs / 2)
              return (
                <Sequence
                  key={`dip-${window.next.id}`}
                  from={framesFor(us(window.joinUs - half), fps)}
                  durationInFrames={Math.max(
                    1,
                    durationInFrames(window.durationUs, fps)
                  )}
                  name="Dip"
                >
                  <Dip window={window} />
                </Sequence>
              )
            })

          return (
            <React.Fragment key={track.id}>
              {layers}
              {dips}
            </React.Fragment>
          )
        })}
    </AbsoluteFill>
  )
}

/** The colour across a dip, coming up to the join and back down after it. */
function Dip({ window }: { window: TransitionWindow }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const half = Math.round(window.durationUs / 2)
  const atUs = window.joinUs - half + usForFrame(frame, fps)
  return (
    <AbsoluteFill
      style={{
        backgroundColor: window.kind === "dip_white" ? "#ffffff" : "#000000",
        opacity: dipOpacity(atUs, window),
        pointerEvents: "none",
      }}
    />
  )
}

/** A rectangle of the frame, for a picture that does not fill it. */
function boxStyle(box: Box | undefined): React.CSSProperties | undefined {
  if (isFullFrame(box) || !box) return undefined
  return {
    left: `${box.x * 100}%`,
    top: `${box.y * 100}%`,
    width: `${box.width * 100}%`,
    height: `${box.height * 100}%`,
    overflow: "hidden",
  }
}

/** A still over the cut. */
function Still({
  element,
  media,
}: {
  element: ImageElement
  media: CompositionMedia | undefined
}) {
  const visual = useVisual(element)
  const src = media?.proxyUrl ?? media?.localUrl ?? null
  if (!src) return null
  return (
    <AbsoluteFill
      style={{
        ...boxStyle(element.box),
        transform: cssTransform(visual),
        transformOrigin: cssTransformOrigin(visual),
        filter: cssFilter(visual),
        opacity: visual.opacity,
      }}
    >
      <Img
        src={src}
        style={{
          width: "100%",
          height: "100%",
          objectFit: element.fit ?? "contain",
        }}
      />
    </AbsoluteFill>
  )
}

/** A music bed, ducked under the voice. */
function Bed({
  element,
  media,
  regions,
  trackMuted,
}: {
  element: AudioElement
  media: CompositionMedia | undefined
  regions: ReturnType<typeof voiceRegions>
  trackMuted: boolean
}) {
  const { fps } = useVideoConfig()
  const src = media?.proxyUrl ?? media?.localUrl ?? null
  if (!src || trackMuted || element.muted) return null
  return (
    <Audio
      src={src}
      trimBefore={framesFor(element.trimStartUs, fps)}
      trimAfter={framesFor(element.trimEndUs, fps)}
      volume={(frame: number) =>
        bedGain(element, usForFrame(frame, fps), regions) *
        fadeGain(element, usForFrame(frame, fps))
      }
    />
  )
}

/**
 * A bed's own fade, from the `volume` channel when it has one (keyframed
 * 0–1). Absent is flat.
 */
function fadeGain(element: AudioElement, elementUs: number): number {
  const channel = element.animations.channels["volume"]
  if (!channel || channel.keys.length === 0) return 1
  const value = sampleChannel(channel, Math.round(elementUs))
  return value === null ? 1 : Math.max(0, Math.min(1, value))
}

/**
 * One clip of footage.
 *
 * `trimBefore` and `trimAfter` are the window into the source, in frames, which
 * is the same pair of numbers the document has always stored as microseconds.
 * That is the whole reason the cut plays correctly with no seek arithmetic
 * anywhere: the composition states which part of the recording this clip is,
 * and Remotion is responsible for being on the right frame of it.
 *
 * The whole picture is fitted into the frame unless the element asks to fill it.
 * Cropping discards footage that was recorded on purpose, and an editor that
 * does that on its own has decided what the shot is about. So the raw frame is
 * the default, Fill is one click away, and `crop` says which part survives once
 * someone has chosen to lose the rest.
 */
function Clip({
  element,
  media,
  edges,
  length,
  trackMuted = false,
  dissolve,
}: {
  element: VideoElement
  media: CompositionMedia | undefined
  /** Which ends of this clip are cuts, to soften (audio-edges.ts). */
  edges?: AudioEdges
  /** The clip's length in frames, for the ramp at its end. */
  length: number
  /** The lane's own mute, over the clip's. */
  trackMuted?: boolean
  /** The dissolve this clip arrives through, when it has one. */
  dissolve?: TransitionWindow
}) {
  const { fps } = useVideoConfig()
  const frame = useCurrentFrame()
  const visual = useVisual(element)
  const arriving =
    dissolve && dissolve.kind === "dissolve"
      ? dissolveOpacity(usForFrame(frame, fps), dissolve)
      : 1
  const speed = clipRate(element)

  const src = media?.proxyUrl ?? media?.localUrl ?? null

  if (!src) {
    // Still ingesting. Black rather than an error: the clip is on the timeline
    // because the upload succeeded, and the proxy is seconds away.
    return <AbsoluteFill style={{ backgroundColor: "#000" }} />
  }

  // Only the original needs rotating. The proxy has been through ffmpeg, which
  // applies the display matrix and strips it — rotating that too is how upright
  // footage ends up on its side.
  const usingOriginal = !media?.proxyUrl && Boolean(media?.localUrl)

  // The sound: the clip's own, or the cleaned voice in its place over the
  // same window of the recording. Without a stored voice the clip plays as
  // recorded, which is what "clean" falls back to rather than silence.
  const cleanVoice =
    element.voice === "clean" ? (media?.voiceUrl ?? null) : null
  const volume = element.muted || trackMuted
    ? 0
    : edges && (edges.in || edges.out)
      ? (frame: number) => element.volume * edgeGain(frame, length, edges)
      : element.volume
  const rotation = usingOriginal ? (media?.rotation ?? 0) : 0

  return (
    // Two layers, because the two transforms mean different things. The outer
    // one is the edit — the punch-in, the framing, the fade — and the inner one
    // is a correction to footage that has not been through ffmpeg yet. Merged
    // into one string they would compose, and rotating a phone recording would
    // rotate the zoom's origin with it.
    <AbsoluteFill
      style={{
        transform: cssTransform(visual),
        transformOrigin: cssTransformOrigin(visual),
        filter: cssFilter(visual),
        opacity:
          visual.opacity * arriving === 1
            ? undefined
            : visual.opacity * arriving,
        ...boxStyle(element.box),
        mixBlendMode:
          element.blendMode === "normal" ? undefined : element.blendMode,
      }}
    >
      <AbsoluteFill
        style={rotation ? { transform: `rotate(${rotation}deg)` } : undefined}
      >
        <Video
          src={src}
          trimBefore={framesFor(element.trimStartUs, fps)}
          trimAfter={framesFor(element.trimEndUs, fps)}
          volume={cleanVoice ? 0 : volume}
          playbackRate={speed}
          style={{
            width: "100%",
            height: "100%",
            // Which part of an overflowing source is kept. The browser resolves
            // it against the intrinsic size, so nothing here needs to know how
            // big the footage is — which is why the document can store the crop
            // as a fraction and stay honest about footage it has never measured.
            objectPosition: cssObjectPosition(visual),
          }}
          objectFit={element.fit ?? "contain"}
        />
      </AbsoluteFill>
      {cleanVoice ? (
        <Audio
          src={cleanVoice}
          trimBefore={framesFor(element.trimStartUs, fps)}
          trimAfter={framesFor(element.trimEndUs, fps)}
          volume={volume}
          playbackRate={speed}
        />
      ) : null}
    </AbsoluteFill>
  )
}

/**
 * The element's look on the frame being drawn.
 *
 * `useCurrentFrame()` inside a `<Sequence>` counts from the sequence's own
 * start, which is exactly the clock keyframes are stored in — so the curve on a
 * clip survives being moved along the timeline, and no offset arithmetic
 * happens here to make that true.
 *
 * The resolver is a plain function in `lib/editor/effects.ts` rather than logic
 * in this component, so that the export path and a test can ask the same
 * question without mounting a player.
 */
function useVisual(element: TimelineElement) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()

  return resolveVisual(element, usForFrame(frame, fps))
}

/**
 * How far up from the bottom the captions sit, as a fraction of frame height.
 *
 * The number is set by what the platform puts on top of the video, not by
 * taste. TikTok and Reels draw a username, a description and a row of buttons
 * across the bottom of a vertical frame, and anything burned into that band is
 * unreadable on the only screen it will be watched on. Roughly the bottom fifth
 * is theirs; the captions sit just above it, low enough to stay out of a
 * talking head's face and high enough to survive.
 *
 * A wide frame has no such overlay, and 16:9 subtitles have sat near the bottom
 * edge since television — a caption a fifth of the way up a landscape frame
 * reads as floating in the middle of the picture.
 */
function captionInset(width: number, height: number): number {
  if (height > width) return 0.18
  if (height === width) return 0.14
  return 0.1
}

/**
 * One caption, with the spoken word lit.
 *
 * The active word is chosen by comparing the frame to each token's own range,
 * which is why the tokens carry times at all. Highlighting by index against
 * elapsed time would drift the moment a word ran long, and the words that run
 * long are the emphasised ones — the exact words the effect exists to land on.
 */
function Caption({ element }: { element: CaptionElement }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { width, height } = useLayoutCanvas()
  const style = element.style

  const atUs = (frame / fps) * 1_000_000

  return (
    <AbsoluteFill
      style={{
        // Anchored to the bottom, not the top. A caption that runs to two lines
        // has to grow *away* from the edge it is measured from, and measured
        // from the top it grows down into the band the platform draws its own
        // interface over — so the longest captions, the ones most worth
        // reading, are the ones that end up underneath a username.
        justifyContent: "flex-end",
        alignItems: "center",
        paddingBottom: height * captionInset(width, height),
        // Canvas pixels from where the style puts it, negative is up: the
        // self-check lifts a caption off a face this way (lib/editor/self-check.ts).
        transform: element.transform.position.y
          ? `translateY(${element.transform.position.y}px)`
          : undefined,
        pointerEvents: "none",
      }}
    >
      <span
        style={{
          maxWidth: "86%",
          textAlign: style.textAlign,
          fontFamily: style.fontFamily,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
          textShadow: `${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color}`,
          ...(style.background.enabled
            ? {
                backgroundColor: style.background.color,
                borderRadius: style.background.cornerRadius,
                padding: `${style.background.paddingY}px ${style.background.paddingX}px`,
              }
            : null),
        }}
      >
        {element.tokens.map((token, index) => {
          const active = atUs >= token.startUs && atUs < token.endUs

          return (
            <span
              key={token.id}
              style={{
                color: active ? style.activeColor : style.inactiveColor,
                marginRight: index === element.tokens.length - 1 ? 0 : "0.28em",
              }}
            >
              {token.text}
            </span>
          )
        })}
      </span>
    </AbsoluteFill>
  )
}

/**
 * Text over the picture, placed by what it is for (lib/editor/titles.ts):
 * a title in the middle, a name and role low on the left, an end card in the
 * middle. `transform.position` moves it from there, in canvas pixels.
 */
function TextLayer({ element }: { element: TextElement }) {
  const frame = useCurrentFrame()
  const { fps } = useVideoConfig()
  const { width, height } = useLayoutCanvas()
  const style = element.style
  const role = element.role
  const opacity = textOpacity(usForFrame(frame, fps), element.durationUs)
  const lower = role === "lower_third"
  const inset = Math.round(Math.min(width, height) * 0.06)

  return (
    <AbsoluteFill
      style={{
        justifyContent: lower ? "flex-end" : "center",
        alignItems: lower ? "flex-start" : "center",
        padding: lower ? `0 ${inset}px ${Math.round(height * 0.16)}px` : inset,
        pointerEvents: "none",
        opacity,
        transform:
          element.transform.position.x || element.transform.position.y
            ? `translate(${element.transform.position.x}px, ${element.transform.position.y}px)`
            : undefined,
      }}
    >
      <div
        // The preview's handles find the text by this to draw around it.
        data-text-id={element.id}
        style={{
          maxWidth: lower ? "70%" : "86%",
          textAlign: style.textAlign,
          fontFamily: style.fontFamily,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          letterSpacing: style.letterSpacing,
          textTransform: style.textTransform,
          color: style.color,
          textShadow: `${style.shadow.offsetX}px ${style.shadow.offsetY}px ${style.shadow.blur}px ${style.shadow.color}`,
          ...(style.background.enabled
            ? {
                backgroundColor: style.background.color,
                borderRadius: style.background.cornerRadius,
                padding: `${style.background.paddingY}px ${style.background.paddingX}px`,
              }
            : null),
        }}
      >
        <div style={{ fontSize: style.fontSize }}>{element.content}</div>
        {element.subtitle ? (
          <div
            style={{
              fontSize: Math.round(style.fontSize * 0.6),
              fontWeight: Math.max(400, style.fontWeight - 200),
              opacity: 0.85,
              marginTop: Math.round(style.fontSize * 0.15),
            }}
          >
            {element.subtitle}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  )
}
