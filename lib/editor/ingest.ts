import {
  parseProbe,
  planFilmstrip,
  storageKeys,
  type FilmstripPlan,
  type ProbeResult,
  type ProxyOptions,
  type SeekIndex,
} from "./media"
import type { Us } from "./time"
import { voicedSeconds } from "./transcript-quality"
import type { AudioPeaks } from "./transcript"

/**
 * Ingest: everything that has to happen to a file before the editor can open it.
 *
 * The order matters more than the steps. Upload kicks all of this off, and by
 * the time the user has read the chips and typed a prompt, the proxy and the
 * transcript are already sitting there. That front-loading is the whole reason
 * "remove the silences" lands in a couple hundred milliseconds — the expensive
 * work happened while they were reading.
 *
 * Written against ports rather than a specific vendor. Two reasons: the storage
 * decision (R2 versus Blob) and the transcode host (Vercel function versus a
 * durable worker) are the two things most likely to change once real files hit
 * it, and neither should reach into the orchestration. It also means this whole
 * pipeline is testable without credentials.
 */

export type Storage = {
  put(
    key: string,
    body: Uint8Array | ReadableStream,
    contentType: string
  ): Promise<void>
  /** Presigned and short-lived. The browser reads proxies directly from here. */
  url(key: string, expiresInSeconds?: number): Promise<string>
  exists(key: string): Promise<boolean>
}

export type Transcoder = {
  probe(source: MediaSource): Promise<unknown>
  /** Returns the encoded proxy. */
  proxy(source: MediaSource, options: ProxyOptions): Promise<Uint8Array>
  /** Mono 16kHz PCM, for both the transcript and the waveform. */
  audio(source: MediaSource): Promise<{ pcm: Int16Array; sampleRate: number }>
  thumbnail(source: MediaSource): Promise<Uint8Array>
  /** One sprite sheet of frames, for the spine to tile across its clips. */
  filmstrip(source: MediaSource, plan: FilmstripPlan): Promise<Uint8Array>
  /**
   * Offsets where a seek lands exactly, read from the proxy.
   *
   * Optional so a transcoder that cannot cheaply answer is still a transcoder —
   * without it the timeline seeks approximately, which is worse but not broken.
   */
  keyframes?(source: MediaSource): Promise<Us[]>
}

export type Transcriber = {
  /** The provider's response, stored verbatim. See videoAsset.transcript. */
  transcribe(
    pcm: Int16Array,
    sampleRate: number,
    /**
     * What the audio looks like, for a provider that can act on it.
     *
     * Ingest measures the waveform from this same PCM a line earlier, so
     * handing it over costs nothing — and without it a transcriber has no way
     * to tell a short recording from a failed transcription.
     */
    hints?: { voicedSeconds: number }
  ): Promise<unknown>
  name: string
}

export type VisionUploader = {
  upload(
    source: MediaSource,
    mimeType: string
  ): Promise<{
    uri: string
    expiresAt: Date
  }>
}

/** A handle the transcoder can read. Path on a worker, bytes in a function. */
export type MediaSource =
  { kind: "path"; path: string } | { kind: "bytes"; bytes: Uint8Array }

export type IngestInput = {
  assetId: string
  filename: string
  mimeType: string
  sizeBytes: number
  contentHash: string
  source: MediaSource
}

export type IngestResult = {
  probe: ProbeResult
  keys: {
    original: string
    proxy: string
    seekIndex: string
    thumbnail: string
    filmstrip: string
  }
  seekIndex: SeekIndex
  /** The sheet's geometry, or null when it could not be made. */
  filmstrip: FilmstripPlan | null
  transcript: unknown | null
  transcriptProvider: string | null
  vision: { uri: string; expiresAt: Date } | null
  /** Steps that failed without failing the asset. See the note on runIngest. */
  warnings: string[]
}

export type IngestPorts = {
  storage: Storage
  transcoder: Transcoder
  transcriber: Transcriber
  vision?: VisionUploader
  peaksFromPcm: (pcm: Int16Array, sampleRate: number) => AudioPeaks
  proxyOptions?: ProxyOptions
  onProgress?: (step: IngestStep) => void
}

export type IngestStep =
  | "probing"
  | "transcoding"
  | "extracting-audio"
  | "transcribing"
  | "indexing"
  | "thumbnailing"
  | "vision"
  | "done"

/**
 * Run the pipeline for one asset.
 *
 * Two failure policies, deliberately different:
 *
 * **Probe and proxy are fatal.** Without them there is nothing to edit, so the
 * asset fails and says why.
 *
 * **Transcript, thumbnail and vision are not.** They come back as warnings and
 * the asset still goes `ready`. Deepgram being down should not stop you
 * scrubbing footage, and an asset with no speech has no transcript by
 * definition. Making the transcript fatal would mean music and b-roll could
 * never be ingested at all.
 */
export async function runIngest(
  input: IngestInput,
  ports: IngestPorts
): Promise<IngestResult> {
  const { storage, transcoder, transcriber, vision, onProgress } = ports
  const warnings: string[] = []

  const keys = {
    original: storageKeys.original(input.contentHash),
    proxy: storageKeys.proxy(input.contentHash),
    seekIndex: storageKeys.seekIndex(input.contentHash),
    thumbnail: storageKeys.thumbnail(input.contentHash),
    filmstrip: storageKeys.filmstrip(input.contentHash),
  }

  /** Set once the sheet is stored; null when the step failed. */
  let filmstrip: FilmstripPlan | null = null

  onProgress?.("probing")
  const probe = parseProbe(await transcoder.probe(input.source))

  onProgress?.("transcoding")
  // Content-addressed, so a second project cutting the same talk finds the
  // proxy already there. This check is the payoff for hashing on upload.
  const proxyExists = await storage.exists(keys.proxy)
  let proxy: Uint8Array | null = null

  if (!proxyExists) {
    proxy = await transcoder.proxy(
      input.source,
      ports.proxyOptions ?? DEFAULT_PROXY_FOR_FPS(probe.fps)
    )
    await storage.put(keys.proxy, proxy, "video/mp4")
  }

  let peaks: AudioPeaks = {
    intervalUs: 20_000 as AudioPeaks["intervalUs"],
    values: [],
  }
  let transcript: unknown | null = null
  let transcriptProvider: string | null = null

  if (probe.hasAudio) {
    onProgress?.("extracting-audio")
    try {
      const { pcm, sampleRate } = await transcoder.audio(input.source)
      peaks = ports.peaksFromPcm(pcm, sampleRate)

      onProgress?.("transcribing")
      transcript = await transcriber.transcribe(pcm, sampleRate, {
        voicedSeconds: voicedSeconds(peaks),
      })
      transcriptProvider = transcriber.name
    } catch (error) {
      warnings.push(`transcript: ${message(error)}`)
    }
  }

  /**
   * Keyframes come from the proxy, which is why this runs here and not next to
   * the transcode: the bytes have to exist first, and they only exist when this
   * run built them. A reused proxy already has an index beside it under the
   * same content hash, written by the run that made it — recomputing would
   * spend a transcode-sized read to produce identical bytes.
   */
  onProgress?.("indexing")
  const seekIndex: SeekIndex = { ...peaks, keyframesUs: [] }

  if (proxy) {
    if (transcoder.keyframes) {
      try {
        seekIndex.keyframesUs = await transcoder.keyframes({
          kind: "bytes",
          bytes: proxy,
        })
      } catch (error) {
        // Not fatal. Seeking falls back to whatever the browser does on its
        // own, which is approximate rather than absent.
        warnings.push(`seek index: ${message(error)}`)
      }
    }

    await storage.put(
      keys.seekIndex,
      new TextEncoder().encode(JSON.stringify(seekIndex)),
      "application/json"
    )
  }

  onProgress?.("thumbnailing")
  try {
    const thumbnail = await transcoder.thumbnail(input.source)
    await storage.put(keys.thumbnail, thumbnail, "image/jpeg")
  } catch (error) {
    warnings.push(`thumbnail: ${message(error)}`)
  }

  /**
   * The filmstrip, from the *proxy* where there is one.
   *
   * The proxy is conformed — upright, constant frame rate, one codec — and the
   * strip is a row of pictures of it. Read from the original instead, a phone
   * clip with a rotation matrix produces forty sideways tiles, because ffmpeg's
   * scale and crop filters work on the decoded frame and the matrix is applied
   * after them.
   *
   * Non-fatal like the poster. A spine with no pictures is the spine we had
   * yesterday; a failed upload with no editor is not.
   */
  try {
    const plan = planFilmstrip(probe.durationUs)
    const strip = await transcoder.filmstrip(
      proxy ? { kind: "bytes", bytes: proxy } : input.source,
      plan
    )
    await storage.put(keys.filmstrip, strip, "image/jpeg")
    filmstrip = plan
  } catch (error) {
    warnings.push(`filmstrip: ${message(error)}`)
  }

  /**
   * Nothing in the first cut reads this. Silence removal, captions and ducking
   * are transcript work; vision earns its place with b-roll and best-take.
   * The handle is fetched now anyway because the alternative is reprocessing
   * the library the day it is needed.
   */
  let visionHandle: IngestResult["vision"] = null
  if (vision) {
    onProgress?.("vision")
    try {
      visionHandle = await vision.upload(input.source, input.mimeType)
    } catch (error) {
      warnings.push(`vision: ${message(error)}`)
    }
  }

  onProgress?.("done")

  return {
    probe,
    keys,
    seekIndex,
    filmstrip,
    transcript,
    transcriptProvider,
    vision: visionHandle,
    warnings,
  }
}

/**
 * Conform to 30fps unless the source is slower.
 *
 * A 60fps phone clip does not need to drag the project rate up and double every
 * frame the compositor draws; short-form is watched at 30 and the difference is
 * invisible. A 24fps film-look source keeps its rate, because conforming *up*
 * duplicates frames and makes motion judder.
 */
export function DEFAULT_PROXY_FOR_FPS(sourceFps: number): ProxyOptions {
  const fps = sourceFps > 0 && sourceFps < 30 ? Math.round(sourceFps) : 30
  return { maxEdge: 720, fps, crf: 26 }
}

/**
 * Whether the Gemini handle is still usable.
 *
 * The Files API expires uploads after 48 hours. Treating a stored handle as
 * live is the bug that turns "add b-roll" into a 403 a couple of days after
 * upload, so every read checks first and re-uploads rather than assuming.
 */
export function visionHandleIsLive(
  expiresAt: Date | null | undefined,
  now: Date = new Date()
): boolean {
  if (!expiresAt) return false
  // A minute of headroom, because a handle that expires mid-request is the
  // same failure as one that expired an hour ago.
  return expiresAt.getTime() - now.getTime() > 60_000
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
