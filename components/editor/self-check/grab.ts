import { FRAME_LONG_EDGE, MAX_CHECK_FRAMES } from "@/lib/editor/self-check"
import { findMainTrack, timelineToSourceUs } from "@/lib/editor/timeline"
import type { CaptionElement, Scene, VideoElement } from "@/lib/editor/types"

/**
 * Three frames of the cut, drawn in the browser from the proxy (plans/036,
 * phase C). No server render: an offscreen `<video>` seeks to each instant,
 * a canvas draws it framed the way the cut frames it (fit and crop) with the
 * caption on top, and the result leaves as a small JPEG.
 *
 * Approximate on purpose: a push-in's zoom and a look's colour are not
 * drawn. The check asks whether a caption covers a face and whether the
 * framing holds, and both read from this.
 *
 * Returns fewer frames, or none, when the proxy cannot be read (no proxy,
 * a seek that never lands, a canvas the browser will not export); then no
 * check is asked for and nothing is spent.
 */

export type GrabbedFrame = { atUs: number; dataUrl: string }

const SEEK_TIMEOUT_MS = 4000
/** How long a presented frame is waited for after a seek, where the browser can say. */
const FRAME_TIMEOUT_MS = 250
const JPEG_QUALITY = 0.7
/** A frame whose every sampled pixel is darker than this (0–255 luma) is taken as not drawn yet. */
const BLACK_LUMA = 14
/** The retry looks this many frames later, still inside the clip. */
const RETRY_FRAMES = 3
/** One frame at 30 fps: the margin kept inside a clip's window, whatever the proxy's rate. */
const FRAME_US = 1_000_000 / 30

/** Mirrors captionInset in composition.tsx: where the caption's baseline sits. */
function captionInset(width: number, height: number): number {
  if (height > width) return 0.18
  if (height === width) return 0.14
  return 0.1
}

export async function grabFrames({
  scene,
  canvas,
  proxyUrls,
  times,
  signal,
}: {
  scene: Scene
  canvas: { width: number; height: number }
  proxyUrls: Record<string, string | null>
  times: number[]
  signal?: AbortSignal
}): Promise<GrabbedFrame[]> {
  const scale = FRAME_LONG_EDGE / Math.max(canvas.width, canvas.height)
  const width = Math.round(canvas.width * scale)
  const height = Math.round(canvas.height * scale)

  const out = document.createElement("canvas")
  out.width = width
  out.height = height
  const context = out.getContext("2d")
  if (!context) return []

  const videos = new Map<string, HTMLVideoElement>()
  const frames: GrabbedFrame[] = []

  try {
    for (const atUs of times.slice(0, MAX_CHECK_FRAMES)) {
      if (signal?.aborted) break
      const main = findMainTrack(scene)
      const hit = main ? timelineToSourceUs(main, atUs, FRAME_US) : null
      const url = hit ? proxyUrls[hit.clip.mediaId] : null
      if (!hit || !url) continue
      const { clip } = hit

      let video = videos.get(url)
      if (!video) {
        video = document.createElement("video")
        video.crossOrigin = "anonymous"
        video.muted = true
        video.playsInline = true
        video.preload = "auto"
        video.src = url
        videos.set(url, video)
      }

      // The picture, checked before it is used: a seek can report done
      // before the decoder has a frame, and that draws as black.
      const later = Math.min(hit.sourceUs + RETRY_FRAMES * FRAME_US, clip.trimEndUs - FRAME_US)
      let shown = await frameAt(video, hit.sourceUs / 1_000_000)
      if (shown && isBlack(video)) shown = (await frameAt(video, later / 1_000_000)) && !isBlack(video)
      if (!shown || signal?.aborted) continue

      context.fillStyle = "#000"
      context.fillRect(0, 0, width, height)
      drawPicture(context, video, clip, width, height)
      drawCaption(context, scene, atUs, width, height, scale)

      try {
        frames.push({ atUs, dataUrl: out.toDataURL("image/jpeg", JPEG_QUALITY) })
      } catch {
        // A tainted canvas: the proxy came without CORS. Nothing to send.
        return []
      }
    }
  } finally {
    for (const video of videos.values()) {
      video.removeAttribute("src")
      video.load()
    }
  }

  return frames
}

/**
 * Seek and wait until a decoded frame of that instant is there to draw.
 *
 * Three waits, each the cause of a black frame when skipped: the metadata
 * (a fresh element told to seek before it knows its length seeks nowhere),
 * the `seeked` event, and a presented frame (`requestVideoFrameCallback`
 * where the browser has it; otherwise `readyState` reaching
 * HAVE_CURRENT_DATA).
 */
async function frameAt(video: HTMLVideoElement, seconds: number): Promise<boolean> {
  if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
    if (!(await once(video, "loadedmetadata", SEEK_TIMEOUT_MS))) return false
  }
  const target = Math.max(0, Math.min(seconds, (video.duration || seconds) - 0.001))
  if (Math.abs(video.currentTime - target) > 0.001 || video.seeking) {
    const seeked = once(video, "seeked", SEEK_TIMEOUT_MS)
    video.currentTime = target
    if (!(await seeked)) return false
  }
  await presented(video)
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    if (!(await once(video, "loadeddata", SEEK_TIMEOUT_MS))) return false
  }
  return video.videoWidth > 0 && video.videoHeight > 0
}

/** True when the event fires before the timeout; false on an error or the timeout. */
function once(video: HTMLVideoElement, event: string, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (ok: boolean) => {
      window.clearTimeout(timer)
      video.removeEventListener(event, onEvent)
      video.removeEventListener("error", onError)
      resolve(ok)
    }
    const onEvent = () => done(true)
    const onError = () => done(false)
    const timer = window.setTimeout(() => done(false), timeoutMs)
    video.addEventListener(event, onEvent)
    video.addEventListener("error", onError)
  })
}

/** The next presented frame, or a short wait where the browser cannot say. */
function presented(video: HTMLVideoElement): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, FRAME_TIMEOUT_MS)
    if ("requestVideoFrameCallback" in video) {
      video.requestVideoFrameCallback(() => {
        window.clearTimeout(timer)
        resolve()
      })
    }
  })
}

/** A small probe of the video's own pixels: true when none of them is lit. */
let probe: CanvasRenderingContext2D | null = null
function isBlack(video: HTMLVideoElement): boolean {
  if (!probe) {
    const canvas = document.createElement("canvas")
    canvas.width = 16
    canvas.height = 9
    probe = canvas.getContext("2d", { willReadFrequently: true })
  }
  if (!probe) return false
  try {
    probe.drawImage(video, 0, 0, 16, 9)
    const { data } = probe.getImageData(0, 0, 16, 9)
    for (let i = 0; i < data.length; i += 4) {
      const luma = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2]
      if (luma > BLACK_LUMA) return false
    }
    return true
  } catch {
    // A tainted canvas cannot be read here; the export below says so.
    return false
  }
}

function drawPicture(
  context: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  clip: VideoElement,
  width: number,
  height: number
) {
  const vw = video.videoWidth
  const vh = video.videoHeight
  if (!vw || !vh) return
  const cover = clip.fit === "cover"
  const fit = cover ? Math.max(width / vw, height / vh) : Math.min(width / vw, height / vh)
  const dw = vw * fit
  const dh = vh * fit
  const cropX = clip.crop?.x ?? 0.5
  const cropY = clip.crop?.y ?? 0.5
  const x = cover ? (width - dw) * cropX : (width - dw) / 2
  const y = cover ? (height - dh) * cropY : (height - dh) / 2
  context.drawImage(video, x, y, dw, dh)
}

function drawCaption(
  context: CanvasRenderingContext2D,
  scene: Scene,
  atUs: number,
  width: number,
  height: number,
  scale: number
) {
  const caption = scene.tracks
    .filter((t) => t.kind === "caption")
    .flatMap((t) => t.elements)
    .find(
      (e): e is CaptionElement =>
        e.kind === "caption" && atUs >= e.startUs && atUs < e.startUs + e.durationUs
    )
  if (!caption) return

  const style = caption.style
  const text = caption.tokens.map((t) => t.text).join(" ")
  const words = style.textTransform === "uppercase" ? text.toUpperCase() : text
  const size = style.fontSize * scale

  context.font = `${style.fontWeight} ${size}px ${style.fontFamily}`
  context.textAlign = "center"
  context.textBaseline = "bottom"
  context.fillStyle = style.activeColor || style.color
  context.shadowColor = "rgba(0, 0, 0, 0.6)"
  context.shadowBlur = 4

  const lines = wrap(context, words, width * 0.86)
  const lineHeight = size * (style.lineHeight || 1.2)
  let baseline = height - height * captionInset(width, height) + caption.transform.position.y * scale
  for (const line of lines.reverse()) {
    context.fillText(line, width / 2, baseline)
    baseline -= lineHeight
  }
  context.shadowBlur = 0
}

function wrap(context: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  let line = ""
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word
    if (line && context.measureText(next).width > max) {
      lines.push(line)
      line = word
    } else {
      line = next
    }
  }
  if (line) lines.push(line)
  return lines
}
