import { secondsToUs, us, type Us } from "./time"
import type { AudioPeaks } from "./transcript"

/**
 * What ffmpeg is asked to do, as data.
 *
 * Argument lists rather than shell strings, and built by pure functions so the
 * decisions in them are testable without running a transcode. The decisions are
 * the point: every flag here is load-bearing and several of them are the
 * difference between an editor that works on real phone footage and one that
 * works on the sample file.
 */

export type ProbeResult = {
  durationUs: Us
  width: number
  height: number
  fps: number
  /** Degrees, normalised to 0/90/180/270. Phones shoot sideways constantly. */
  rotation: number
  hasAudio: boolean
  videoCodec: string | null
  audioCodec: string | null
}

export const PROBE_ARGS = [
  "-v",
  "error",
  "-print_format",
  "json",
  "-show_format",
  "-show_streams",
] as const

export function probeArgs(input: string): string[] {
  return [...PROBE_ARGS, input]
}

/**
 * Read ffprobe's JSON into the handful of facts the editor branches on.
 *
 * Deliberately forgiving. A container missing a duration or a frame rate is
 * common enough (screen recordings, streams saved to disk) that throwing would
 * reject files that edit perfectly well once transcoded.
 */
export function parseProbe(json: unknown): ProbeResult {
  const data = json as {
    format?: { duration?: string }
    streams?: {
      codec_type?: string
      codec_name?: string
      width?: number
      height?: number
      avg_frame_rate?: string
      r_frame_rate?: string
      duration?: string
      side_data_list?: { rotation?: number }[]
      tags?: { rotate?: string }
    }[]
  }

  const streams = data.streams ?? []
  const video = streams.find((stream) => stream.codec_type === "video")
  const audio = streams.find((stream) => stream.codec_type === "audio")

  const durationSeconds = Number(data.format?.duration ?? video?.duration ?? 0)

  return {
    durationUs: Number.isFinite(durationSeconds)
      ? secondsToUs(durationSeconds)
      : us(0),
    width: video?.width ?? 0,
    height: video?.height ?? 0,
    fps: parseFrameRate(video?.avg_frame_rate ?? video?.r_frame_rate),
    rotation: normaliseRotation(video),
    hasAudio: Boolean(audio),
    videoCodec: video?.codec_name ?? null,
    audioCodec: audio?.codec_name ?? null,
  }
}

/**
 * ffprobe reports frame rate as a rational string: "30000/1001" is 29.97.
 * Parsing it as a float gives NaN, and a NaN frame rate silently makes every
 * frame calculation downstream NaN too.
 */
export function parseFrameRate(value: string | undefined): number {
  if (!value) return 0

  const [numerator, denominator] = value.split("/").map(Number)
  if (!denominator) return Number.isFinite(numerator) ? numerator : 0
  if (!Number.isFinite(numerator) || denominator === 0) return 0

  return Math.round((numerator / denominator) * 1000) / 1000
}

/**
 * Rotation lives in two places depending on who wrote the file: modern
 * containers use display-matrix side data, older ones a `rotate` tag. Reading
 * only one is how footage from half the phones on the market ends up sideways.
 */
function normaliseRotation(
  stream:
    | {
        side_data_list?: { rotation?: number }[]
        tags?: { rotate?: string }
      }
    | undefined
): number {
  const sideData = stream?.side_data_list?.find(
    (entry) => entry.rotation !== undefined
  )?.rotation
  const tag = stream?.tags?.rotate ? Number(stream.tags.rotate) : undefined
  const raw = sideData ?? tag ?? 0

  // Side data is negative for a clockwise rotation; the editor wants degrees
  // in 0..359 whichever way it arrived.
  return ((Math.round(raw) % 360) + 360) % 360
}

export type ProxyOptions = {
  /**
   * Long edge in pixels. Matches the canvas, which is 1920 on its long edge in
   * every orientation the editor offers.
   */
  maxEdge: number
  fps: number
  crf: number
}

/**
 * What the editor plays, and — because export renders the same React tree —
 * what it delivers.
 *
 * This was 720 and CRF 26, chosen when nothing had been exported yet and the
 * only job was keeping a 4K source scrubbing on a laptop. It stopped being the
 * right number the moment export shipped, because the scrub proxy quietly
 * became the delivery master and nobody moved it.
 *
 * The arithmetic, on a phone video shot 1080×1920. `maxEdge` caps the *long*
 * edge, so 720 produced a 405×720 proxy. The canvas is 1080×1920. Every frame
 * on screen was that picture blown up 1.79× on a retina display, and every
 * frame exported was it blown up 2.67× and re-encoded — two lossy generations,
 * the first at a CRF aggressive enough to leave artefacts for the second one to
 * bake in.
 *
 * 1920 is the canvas's own long edge, so the proxy is now 1:1 with what gets
 * rendered and the upscale is gone from both places at once. It is not a
 * "high" setting; it is 1080p, which is what this product outputs.
 *
 * CRF 20 rather than 26 for the same reason: this file is a *source* for
 * another encode, not a final. Artefacts it carries get re-compressed rather
 * than dropped.
 *
 * The cost is real and lands on ingest and storage — roughly seven times the
 * pixels of the old proxy, and a bigger file to pull before playback starts.
 * The scale expression still only ever shrinks, so a 720p source stays 720p and
 * pays none of it. If scrubbing a 4K source turns out to suffer, the fix is two
 * proxies — a small one for the timeline and this one for export — rather than
 * going back to shipping a soft master.
 */
export const DEFAULT_PROXY: ProxyOptions = { maxEdge: 1920, fps: 30, crf: 20 }

/**
 * Build the proxy the editor actually plays.
 *
 * This single command is what removes the codec problem from the browser. The
 * originals are HEVC, 10-bit, variable frame rate, rotated, 4K; the proxy is
 * always H.264 8-bit yuv420p at a constant rate, which every browser decodes in
 * hardware. Without it, WebCodecs support becomes a per-device lottery.
 *
 * Each flag, and why:
 *
 * - `yuv420p` because 10-bit and 4:2:2 are widely unsupported in browser decode
 *   even where the codec itself is fine.
 * - `-vsync cfr` because variable frame rate footage (every screen recording)
 *   makes frame-accurate seeking meaningless.
 * - `-movflags +faststart` so the moov atom is at the front and playback can
 *   begin on the first range request instead of after a full download.
 * - `-g` at two seconds so seeking lands near a keyframe. Sparse keyframes are
 *   the usual reason scrubbing feels sticky.
 * - `-af aresample=async=1` to hold audio sync when the source drifts, which
 *   long phone recordings do.
 * - The scale expression only ever shrinks (`min(...)`), because upscaling a
 *   540p clip costs bytes and adds nothing — the pixels are not there to find.
 */
export function proxyArgs(
  input: string,
  output: string,
  options: ProxyOptions = DEFAULT_PROXY
): string[] {
  const { maxEdge, fps, crf } = options

  return [
    "-i",
    input,
    "-vf",
    `scale='if(gt(iw,ih),min(${maxEdge},iw),-2)':'if(gt(iw,ih),-2,min(${maxEdge},ih))':flags=bicubic`,
    "-r",
    String(fps),
    "-vsync",
    "cfr",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-preset",
    "veryfast",
    "-crf",
    String(crf),
    "-g",
    String(fps * 2),
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-ac",
    "2",
    "-ar",
    "48000",
    "-af",
    "aresample=async=1",
    "-movflags",
    "+faststart",
    "-y",
    output,
  ]
}

/**
 * Mono 16kHz PCM, which is what speech recognition wants and nothing else.
 *
 * Sending the proxy to Deepgram instead would upload a video file to transcribe
 * its audio. This is roughly two orders of magnitude smaller and transcribes no
 * worse, because the model downsamples to this anyway.
 */
export function audioExtractArgs(input: string, output: string): string[] {
  return [
    "-i",
    input,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    "-y",
    output,
  ]
}

/**
 * The voice, cleaned: rumble under 80 Hz cut, steady noise (fans, hum, room)
 * taken down, and the level brought to -16 LUFS, which is where speech sits
 * on a phone and a laptop without anyone reaching for the volume.
 *
 * The resampler leads, as it does on the proxy: it fills gaps and corrects
 * drift against the timestamps and starts the track at source time 0, so the
 * voice stays on the lips the proxy shows. Without it a phone take with an
 * audio offset plays its cleaned voice a beat early or late.
 *
 * Every filter is ffmpeg's own, so it costs function time and nothing
 * bought. AAC, mono, 128k: the track plays beside the proxy in
 * the preview and the export, never instead of the picture.
 *
 * This is the plain chain, and since the speech model below it is the
 * fallback: what a take gets when the model file is missing, when the
 * model run fails, or when the model took the voice down with the noise.
 * Its output is stored under `storageKeys.voicePlain`.
 */
export const VOICE_FILTER =
  "aresample=async=1:first_pts=0,highpass=f=80,afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11"

/** The encode both chains share. Mono AAC that plays beside the proxy. */
const VOICE_OUTPUT = [
  "-ac",
  "1",
  "-ar",
  "48000",
  "-c:a",
  "aac",
  "-b:a",
  "128k",
  "-movflags",
  "+faststart",
] as const

export function voiceCleanArgs(input: string, output: string): string[] {
  return [
    "-i",
    input,
    "-vn",
    "-af",
    VOICE_FILTER,
    ...VOICE_OUTPUT,
    "-y",
    output,
  ]
}

/**
 * The voice, cleaned with a speech model in front of the spectral filter.
 *
 * `afftdn` learns one noise profile and subtracts it, so it handles what holds
 * still: a fan, hum, the room. It cannot touch noise that comes and goes —
 * typing, a car passing, dishes — because there is no steady profile to learn.
 * ffmpeg's `arnndn` is a small recurrent network that decides, band by band
 * and 10 ms at a time, how much of the signal is speech, and keeps that. It
 * runs on the CPU in the same pass and costs about a third more time than the
 * plain chain (measured: a 20-minute take, 22 s plain, 29 s with the model).
 *
 * The plain filters stay behind it: the model leaves a little steady hiss,
 * and `afftdn` is good at exactly that. Loudness last, as before, so the
 * level is set on what is left.
 *
 * **Measured both sides of the model, in the same pass.** A speech model has
 * one failure that matters here: on audio it does not recognise as speech it
 * removes the voice along with the noise. A synthetic voice on band-limited
 * audio went from -15 to -52 LUFS through it, where a real voice with
 * typing and traffic over it lost 2.7 LU and the noise floor dropped 18 dB
 * further than the plain chain managed. So the graph splits after the
 * high-pass: one branch is metered dry, one through the model, and the
 * transcoder compares the two integrated loudnesses (`denoiseKeptVoice`). A
 * drop too large to be noise alone means the take is made again on the plain
 * chain. `loudnorm` would hide the drop, which is why the meter sits before
 * it.
 *
 * The meters write to files because ffmpeg's stderr is dropped on success
 * (transcoder-ffmpeg.ts), and a file is the one output that survives it.
 */
export function voiceDenoiseArgs(
  input: string,
  output: string,
  paths: { model: string; dryMeter: string; wetMeter: string }
): string[] {
  const meter = (file: string) =>
    `ebur128=metadata=1,ametadata=mode=print:key=lavfi.r128.I:file=${filterValue(file)},anullsink`

  const graph = [
    "[0:a]aresample=async=1:first_pts=0,highpass=f=80,asplit=2[dry][pre]",
    `[pre]arnndn=m=${filterValue(paths.model)},asplit=2[wet][keep]`,
    `[dry]${meter(paths.dryMeter)}`,
    `[wet]${meter(paths.wetMeter)}`,
    "[keep]afftdn=nf=-25,loudnorm=I=-16:TP=-1.5:LRA=11[voice]",
  ].join(";")

  return [
    "-i",
    input,
    "-vn",
    "-filter_complex",
    graph,
    "-map",
    "[voice]",
    ...VOICE_OUTPUT,
    "-y",
    output,
  ]
}

/**
 * A path as a value inside a filter graph.
 *
 * Paths reach the graph as text, where `:` separates options, `,` and `;`
 * separate filters and `[` `]` name pads. A temp dir or a deploy path with any
 * of those in it would otherwise end the option early and fail the whole pass
 * with an error about a filter nobody wrote.
 *
 * ffmpeg reads the text twice, so it is escaped twice, innermost first: once
 * for the option parser (`\`, `'`, `:`), then once for the graph parser
 * (`\`, `'`, `[`, `]`, `,`, `;`). Quoting instead looks right and is not: the
 * graph parser takes the quotes off and the option parser then splits on the
 * colon that was inside them.
 */
export function filterValue(value: string): string {
  const option = value.replace(/[\\':]/g, (c) => `\\${c}`)
  return option.replace(/[\\'[\],;]/g, (c) => `\\${c}`)
}

/**
 * The integrated loudness the meter settled on, in LUFS.
 *
 * `ametadata=print` writes a line per frame with the running value. The last
 * one is the whole track's. Null when there is no reading at all — a silent
 * track never opens the meter's gate — which the caller treats as nothing to
 * compare, not as a failure.
 */
export function parseLoudnessMeter(text: string): number | null {
  const values = [...text.matchAll(/lavfi\.r128\.I=(-?[\d.]+|-inf)/g)]
  const last = values.at(-1)?.[1]
  if (last === undefined || last === "-inf") return null
  const value = Number(last)
  return Number.isFinite(value) ? value : null
}

/**
 * The most the model may lower a take's loudness before it is believed to
 * have taken the voice. Integrated loudness is gated on the loud parts, so
 * on a talking head it is the voice, and removing noise moves it little: the
 * real voice under typing and traffic lost 2.7 LU. A voice the model did not
 * recognise lost 37. Twelve sits well clear of both.
 */
export const DENOISE_MAX_DROP_LU = 12

/**
 * Whether the model's pass kept the voice, from the two meter readings.
 *
 * A missing dry reading is a take too quiet to meter, where nothing can be
 * said either way and the model's output is kept. A missing wet reading with
 * a dry one is the model having silenced it, which is the failure itself.
 */
export function denoiseKeptVoice(
  dryLufs: number | null,
  wetLufs: number | null
): boolean {
  if (dryLufs === null) return true
  if (wetLufs === null) return false
  return dryLufs - wetLufs <= DENOISE_MAX_DROP_LU
}

/**
 * Where a take's cleaned voice may already be, best first.
 *
 * The model's track, then the plain one. A take cleaned before the model has
 * only the plain one and keeps playing it: a finished cut does not change
 * sound because the filter did.
 */
export function voiceKeys(contentHash: string): string[] {
  return [storageKeys.voice(contentHash), storageKeys.voicePlain(contentHash)]
}

export function thumbnailArgs(
  input: string,
  output: string,
  atUs: Us = us(0)
): string[] {
  return [
    // Before -i, so ffmpeg seeks rather than decoding up to the point. On a
    // long file that is the difference between instant and thirty seconds.
    "-ss",
    (atUs / 1_000_000).toFixed(3),
    "-i",
    input,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    "-y",
    output,
  ]
}

/* ── Filmstrip ────────────────────────────────────────────────────────────
   The frames the spine draws, as one sprite sheet.

   One image, not N. A clip on a zoomed timeline shows dozens of thumbnails and
   a request each would be dozens of requests for one lane — the sheet is a
   single fetch, and every tile after the first is a `background-position`.

   Every tile is the same shape, 16:9, centre-cropped from whatever the source
   is. This went back and forth several times and the deciding evidence was
   measurement, so the method is written down here rather than the conclusion
   alone: a filmstrip spine renders as a canvas, so the pixels were read
   directly and autocorrelated across the column-difference profile. The
   dominant pitch is 79px in a 44px lane, with a harmonic at 156 confirming it.
   79/44 is 1.795. It crops to 16:9, on the same portrait footage this is for,
   and keeps the middle band — which on a talking head is the face.

   Counting tiles by eye off a screenshot put this at 1.6 and before that at
   1.4, both wrong, and one of those screenshots was retina so every number in
   it was double. Measure the pixels.

   The alternative is honest and does not work at this size. Keeping the
   source's own aspect truncates nothing, and at a 44px lane a 9:16 frame is 24
   pixels across: about two characters, with nothing in it to recognise. A strip
   you cannot read is worth less than a frame that is cropped. The way to have
   both is a taller lane, which costs the preview more than the crop costs the
   strip.

   Uniform tiles have a second payoff: the sheet's geometry no longer depends on
   the footage, so a project mixing portrait and landscape draws one strip
   rather than lanes that step in height.
   ──────────────────────────────────────────────────────────────────────── */

/** Tile height in the sheet. Twice the 44px a clip renders at, for retina. */
export const FILMSTRIP_TILE_HEIGHT = 88

/** 16:9 at that height — 78px in the lane, against the 79 measured above. */
export const FILMSTRIP_TILE_WIDTH = 156

/**
 * A ceiling on frames per sheet, well above what the budget usually allows.
 *
 * This used to be forty, and forty was the reason a clip drew the same picture
 * four times in a row: a fifteen-second take got thirty frames, a clip a third
 * of it got ten, and a lane wide enough for twenty repeated every one of them.
 */
export const FILMSTRIP_TILES = 240

/**
 * No denser than five a second.
 *
 * Was two, which is a frame every 500ms — on a clip of a second and a half that
 * is three pictures, and a strip of three pictures across a lane is the same
 * picture repeated. Five a second is past the point where consecutive frames of
 * a talking head differ anyway.
 */
const FILMSTRIP_MIN_INTERVAL_US = 200_000

/**
 * A ceiling on the whole sheet, spent on fewer frames rather than smaller ones.
 *
 * Comfortably inside what a browser will hold as a texture, and it is the
 * constraint that should bind on a long talk — not a frame count chosen when
 * tiles were a different size.
 */
const FILMSTRIP_MAX_SHEET_WIDTH = 12288

export type FilmstripPlan = {
  /** Seconds between frames, as ffmpeg's `fps` filter wants it. */
  intervalUs: number
  count: number
  tileWidth: number
  tileHeight: number
}

/**
 * Plan a sheet for a clip of this length.
 *
 * Takes no aspect: the tile is a fixed shape and ffmpeg crops whatever it is
 * given to fit, so a portrait clip loses its top and bottom and an ultrawide
 * loses its sides, both to the same 1.6:1 window.
 */
export function planFilmstrip(durationUs: number): FilmstripPlan {
  const duration = Math.max(1, durationUs)

  const affordable = Math.max(
    1,
    Math.min(
      FILMSTRIP_TILES,
      Math.floor(FILMSTRIP_MAX_SHEET_WIDTH / FILMSTRIP_TILE_WIDTH)
    )
  )

  const intervalUs = Math.max(
    FILMSTRIP_MIN_INTERVAL_US,
    Math.ceil(duration / affordable)
  )

  return {
    intervalUs,
    // At least one: a clip shorter than the interval still has a first frame,
    // and a sheet of zero tiles is an ffmpeg command that produces no file.
    count: Math.max(1, Math.min(affordable, Math.ceil(duration / intervalUs))),
    tileWidth: FILMSTRIP_TILE_WIDTH,
    tileHeight: FILMSTRIP_TILE_HEIGHT,
  }
}

export function filmstripArgs(
  input: string,
  output: string,
  plan: FilmstripPlan
): string[] {
  const fps = 1_000_000 / plan.intervalUs

  return [
    "-i",
    input,
    "-vf",
    [
      // One frame every interval, in source time.
      `fps=${fps.toFixed(6)}`,
      // Cover the tile, then take the middle of it. `increase` and not
      // `decrease`: decrease fits the whole frame inside and letterboxes it,
      // which on portrait footage is a strip of mostly black bars.
      `scale=${plan.tileWidth}:${plan.tileHeight}:force_original_aspect_ratio=increase`,
      `crop=${plan.tileWidth}:${plan.tileHeight}`,
      // One row. `tile` emits a frame once it has this many inputs, and pads
      // the last one when the video runs out first.
      `tile=${plan.count}x1`,
    ].join(","),
    "-frames:v",
    "1",
    "-q:v",
    "4",
    "-y",
    output,
  ]
}

/**
 * Downsample raw PCM to the peaks the timeline draws and the cut refiner reads.
 *
 * Peak amplitude per bucket, not RMS: the waveform is there to show where sound
 * is, and RMS flattens transients until a percussive talk looks like a flat bar.
 */
export function peaksFromPcm(
  pcm: Int16Array,
  sampleRate: number,
  intervalUs: Us = us(20_000)
): AudioPeaks {
  const samplesPerBucket = Math.max(
    1,
    Math.round((sampleRate * intervalUs) / 1_000_000)
  )
  const values: number[] = []

  for (let start = 0; start < pcm.length; start += samplesPerBucket) {
    let peak = 0
    const end = Math.min(pcm.length, start + samplesPerBucket)
    for (let i = start; i < end; i++) {
      const magnitude = Math.abs(pcm[i])
      if (magnitude > peak) peak = magnitude
    }
    values.push(Math.min(1, peak / 32768))
  }

  return { intervalUs, values }
}

/**
 * `xxh3-128:<bytes>:<hash>` — content-addressed, and the reason a
 * re-upload is free. Size is in the key so two files can only collide if they
 * are both the same length and the same hash.
 */
export function contentKey(sizeBytes: number, hash: string): string {
  return `xxh3-128:${sizeBytes}:${hash}`
}

/**
 * The content key an upload is stored under: the user's own, never shared.
 *
 * The digest comes from the browser and is never checked against the bytes,
 * so a key built from it alone is a key anyone who learns a digest can be
 * handed an upload URL for, and every derived file (proxy, thumbnail, voice)
 * is named after it. With the user in it, a claimed digest can only ever
 * reach that user's own files. Re-uploading stays free for the same person,
 * which is all the dedupe was for.
 */
export function userContentKey(
  userId: string,
  sizeBytes: number,
  hash: string
): string {
  const scope = userId.replace(/[^A-Za-z0-9_-]/g, "")
  if (!scope) throw new Error("A content key needs a user.")
  return `u/${scope}/${contentKey(sizeBytes, hash)}`
}

export const storageKeys = {
  original: (contentHash: string) => `assets/${contentHash}`,
  /**
   * v2 is the 1920-long-edge proxy. The version is in the path so a rebuilt
   * proxy lands on a new object rather than overwriting the old one at a URL
   * something may already be holding — and so an asset keeps playing its v1
   * proxy until the backfill has actually replaced it, instead of pointing at
   * bytes that are not there yet.
   */
  proxy: (contentHash: string) => `derived/proxy/v2/${contentHash}.mp4`,
  /** Peaks and keyframe offsets together. See SeekIndex. */
  seekIndex: (contentHash: string) => `derived/seek/v1/${contentHash}.json`,
  thumbnail: (contentHash: string) => `derived/thumb/v1/${contentHash}.jpg`,
  /** The sprite sheet the spine tiles across its clips. */
  filmstrip: (contentHash: string) => `derived/strip/v1/${contentHash}.jpg`,
  /**
   * The cleaned voice, through the speech model (voiceDenoiseArgs).
   * Content-addressed and versioned like the proxy, so a change to the filter
   * is a new key and never a surprise in a cut someone already finished.
   */
  voice: (contentHash: string) => `derived/voice/v3/${contentHash}.m4a`,
  /**
   * The cleaned voice on the plain chain (voiceCleanArgs). Every take cleaned
   * before the speech model has one, and a take still gets one when the
   * model is missing or did not keep the voice. Keyed by what it is, so the
   * two are never mistaken for each other.
   */
  voicePlain: (contentHash: string) => `derived/voice/v2/${contentHash}.m4a`,
}

/**
 * Everything the timeline needs to draw and to seek, in one object.
 *
 * One fetch rather than two, because both halves are read on the same frame:
 * the waveform is drawn from `values` and a click is snapped to the nearest
 * entry in `keyframesUs`. Splitting them would put a second round trip in front
 * of the first render for no gain — they are derived together, expire together,
 * and are addressed by the same content hash.
 *
 * `keyframesUs` describes the **proxy**, not the original, because the proxy is
 * what the browser plays. Seeking to a keyframe of a source file that nothing
 * decodes would land the playhead somewhere near the right place, which is the
 * kind of near-right that reads as a bug.
 */
export type SeekIndex = AudioPeaks & {
  /** Offsets into the proxy where a seek lands exactly. Ascending. */
  keyframesUs: Us[]
}

/**
 * The keyframe at or before an instant — where a decoder would start from.
 *
 * **Not for the playhead.** An earlier timeline snapped every click to the
 * nearest keyframe, and it was wrong twice over: on a short clip with one
 * keyframe it swallowed the click entirely, and on any clip it moves the
 * playhead somewhere the user did not click, which the whole editor is built
 * against. `video.currentTime` already decodes forward from the preceding
 * keyframe on its own.
 *
 * What this is for is the cut path. Cutting on a keyframe can be done by
 * copying the stream; cutting between two means re-encoding the span. That is a
 * real decision with a real cost, and this is the question behind it.
 *
 * At or *before*, never after: a decoder cannot start from a keyframe it has
 * not reached, so rounding up would name a boundary that costs a re-encode
 * while claiming it is free.
 */
export function keyframeAtOrBefore(
  timeUs: Us,
  seekIndex: Pick<SeekIndex, "keyframesUs"> | null
): Us | null {
  const keyframes = seekIndex?.keyframesUs
  if (!keyframes || keyframes.length === 0) return null

  let best: number | null = null
  for (const offset of keyframes) {
    if (offset <= timeUs && (best === null || offset > best)) best = offset
  }

  return best === null ? null : us(best)
}
