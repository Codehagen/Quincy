import { clipRate, findMainTrack } from "./timeline"
import type { Scene, VideoElement } from "./types"

/**
 * The cut as a list another editor can open: a CMX3600 EDL and an FCPXML.
 *
 * Both describe the edit, not the look. Each clip on the spine is an event
 * with its in and out in the recording and its place on the timeline;
 * b-roll goes on a second video track. Effects, captions, text and music are
 * left out, because neither format carries them faithfully and a half-carried
 * look is worse than none. The file is named by what it holds.
 */

type MediaNames = Record<string, { filename: string; durationUs?: number | null }>

function frames(timeUs: number, fps: number): number {
  return Math.round((timeUs / 1_000_000) * fps)
}

function timecode(timeUs: number, fps: number): string {
  const base = Math.round(fps)
  const total = frames(timeUs, fps)
  const f = total % base
  const s = Math.floor(total / base) % 60
  const m = Math.floor(total / base / 60) % 60
  const h = Math.floor(total / base / 3600)
  const pad = (value: number) => String(value).padStart(2, "0")
  return `${pad(h)}:${pad(m)}:${pad(s)}:${pad(f)}`
}

function reelName(filename: string): string {
  return (
    filename
      .replace(/\.[^.]+$/, "")
      .replace(/[^A-Za-z0-9]/g, "")
      .slice(0, 8)
      .toUpperCase() || "AX"
  )
}

function overlayClips(scene: Scene): VideoElement[] {
  const spine = findMainTrack(scene)
  return scene.tracks
    .filter(
      (track) =>
        (track.kind === "video" || track.kind === "broll") &&
        track.id !== spine?.id &&
        !track.hidden
    )
    .flatMap((track) => track.elements)
    .filter((element): element is VideoElement => element.kind === "video")
    .sort((a, b) => a.startUs - b.startUs)
}

/**
 * What neither file carries, said in the file instead of lost in silence:
 * stills (no format here holds one worth trusting) and clips that start where
 * the spine has nothing to hang them on.
 */
function leftOut(scene: Scene): string | null {
  const spine = spineClips(scene)
  const overlayTracks = scene.tracks.filter(
    (track) =>
      (track.kind === "video" || track.kind === "broll") &&
      track.id !== findMainTrack(scene)?.id &&
      !track.hidden
  )
  const stills = overlayTracks
    .flatMap((track) => track.elements)
    .filter((element) => element.kind === "image").length
  const unanchored = overlayClips(scene).filter(
    (overlay) =>
      !spine.some(
        (clip) =>
          overlay.startUs >= clip.startUs && overlay.startUs < clip.startUs + clip.durationUs
      )
  ).length
  const parts = [
    stills > 0 ? `${stills} ${stills === 1 ? "still" : "stills"}` : null,
    unanchored > 0
      ? `${unanchored} ${unanchored === 1 ? "clip" : "clips"} outside the main track`
      : null,
  ].filter(Boolean)
  return parts.length > 0 ? `NOT INCLUDED: ${parts.join(", ")}` : null
}

function spineClips(scene: Scene): VideoElement[] {
  return (findMainTrack(scene)?.elements ?? []).filter(
    (element): element is VideoElement => element.kind === "video"
  )
}

export function toEdl(
  scene: Scene,
  options: { title: string; fps: number; media: MediaNames }
): string {
  const { fps } = options
  const missing = leftOut(scene)
  const lines = [
    `TITLE: ${options.title.replace(/[\r\n]/g, " ").slice(0, 70)}`,
    "FCM: NON-DROP FRAME",
    ...(missing ? [`* ${missing}`] : []),
    "",
  ]
  let event = 1
  const emit = (clip: VideoElement, track: "V" | "AA/V") => {
    const name = options.media[clip.mediaId]?.filename ?? clip.mediaId
    const sourceIn = clip.trimStartUs
    const sourceOut = clip.trimEndUs
    lines.push(
      `${String(event).padStart(3, "0")}  ${reelName(name).padEnd(8)} ${track.padEnd(5)} C        ${timecode(sourceIn, fps)} ${timecode(sourceOut, fps)} ${timecode(clip.startUs, fps)} ${timecode(clip.startUs + clip.durationUs, fps)}`
    )
    const rate = clipRate(clip)
    if (rate !== 1) {
      lines.push(
        `M2   ${reelName(name).padEnd(8)}       ${(rate * fps).toFixed(1).padStart(5)}    ${timecode(sourceIn, fps)}`
      )
    }
    lines.push(`* FROM CLIP NAME: ${name}`, "")
    event += 1
  }
  for (const clip of spineClips(scene)) emit(clip, "AA/V")
  for (const clip of overlayClips(scene)) emit(clip, "V")
  return lines.join("\n")
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

export function toFcpxml(
  scene: Scene,
  options: {
    title: string
    fps: number
    width: number
    height: number
    media: MediaNames
    /** The file each media id should point at, relative or absolute. */
    srcFor?: (mediaId: string, filename: string) => string
  }
): string {
  const fps = Math.round(options.fps)
  const t = (timeUs: number) => `${frames(timeUs, fps)}/${fps}s`
  const spine = spineClips(scene)
  const overlays = overlayClips(scene)
  const used = [...new Set([...spine, ...overlays].map((clip) => clip.mediaId))]
  const assetId = (mediaId: string) => `r${used.indexOf(mediaId) + 2}`
  const total = spine.reduce(
    (end, clip) => Math.max(end, clip.startUs + clip.durationUs),
    0
  )

  const assets = used
    .map((mediaId) => {
      const entry = options.media[mediaId]
      const filename = entry?.filename ?? mediaId
      const src = options.srcFor?.(mediaId, filename) ?? `./${filename}`
      const duration = entry?.durationUs ? ` duration="${t(entry.durationUs)}"` : ""
      return `    <asset id="${assetId(mediaId)}" name="${escapeXml(filename)}" start="0s"${duration} hasVideo="1" hasAudio="1" format="r1">\n      <media-rep kind="original-media" src="${escapeXml(src)}"/>\n    </asset>`
    })
    .join("\n")

  const clipXml = (clip: VideoElement, lane?: number, offsetUs: number = clip.startUs) => {
    const name = escapeXml(options.media[clip.mediaId]?.filename ?? clip.name)
    const rate = clipRate(clip)
    const laneAttr = lane ? ` lane="${lane}"` : ""
    const retime =
      rate !== 1
        ? `\n          <timeMap><timept time="0s" value="${t(clip.trimStartUs)}" interp="linear"/><timept time="${t(clip.durationUs)}" value="${t(clip.trimEndUs)}" interp="linear"/></timeMap>`
        : ""
    return `<asset-clip ref="${assetId(clip.mediaId)}"${laneAttr} name="${name}" offset="${t(offsetUs)}" start="${t(clip.trimStartUs)}" duration="${t(clip.durationUs)}">${retime}`
  }

  // A spine plays its items one after another, whatever their offsets say,
  // so a hole in the cut has to be written as a gap or every clip after it
  // lands early.
  let previousEnd = 0
  const body = spine
    .map((clip) => {
      const gap =
        clip.startUs > previousEnd
          ? `        <gap name="Gap" offset="${t(previousEnd)}" duration="${t(clip.startUs - previousEnd)}"/>\n`
          : ""
      previousEnd = clip.startUs + clip.durationUs
      const connected = overlays
        .filter(
          (overlay) =>
            overlay.startUs >= clip.startUs &&
            overlay.startUs < clip.startUs + clip.durationUs
        )
        .map(
          (overlay) =>
            // A connected clip's offset is in its parent's own time.
            `\n          ${clipXml(overlay, 1, clip.trimStartUs + (overlay.startUs - clip.startUs) * clipRate(clip))}</asset-clip>`
        )
        .join("")
      return `${gap}        ${clipXml(clip)}${connected}\n        </asset-clip>`
    })
    .join("\n")

  const missing = leftOut(scene)
  // "--" may not appear inside an XML comment.
  const missingComment = missing ? `\n  <!-- ${missing.replace(/-{2,}/g, "-")} -->` : ""

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE fcpxml>
<fcpxml version="1.10">${missingComment}
  <resources>
    <format id="r1" frameDuration="1/${fps}s" width="${options.width}" height="${options.height}"/>
${assets}
  </resources>
  <library>
    <event name="${escapeXml(options.title)}">
      <project name="${escapeXml(options.title)}">
        <sequence format="r1" duration="${t(total)}" tcStart="0s" tcFormat="NDF">
          <spine>
${body}
          </spine>
        </sequence>
      </project>
    </event>
  </library>
</fcpxml>
`
}
