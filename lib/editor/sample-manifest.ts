/**
 * The sample recording's manifest: what `scripts/prepare-cuts-sample.ts`
 * writes into `public/samples/cuts/`, and what `lib/editor/sample.ts` reads to
 * make a project without running ingest.
 *
 * Pure, so the script, the server and the tests share one definition and one
 * validator. A manifest that does not parse is treated as absent: the sample
 * button does not render, rather than rendering and failing on press.
 */

export const SAMPLE_DIR_SEGMENTS = ["public", "samples", "cuts"] as const
export const SAMPLE_MANIFEST_FILE = "manifest.json"

/**
 * The sample's content hash, as it goes into the storage keys.
 *
 * Its own prefix rather than the browser's `xxh3-128:` form, so a sample key
 * can never collide with a real upload's, and so a glance at a bucket listing
 * says which objects belong to the sample.
 */
export function sampleContentHash(sha256: string): string {
  return `sample-cuts:${sha256.slice(0, 32)}`
}

export type SampleManifest = {
  version: 1
  filename: string
  mimeType: string
  /** The original's size. Shown in the editor; the original is not shipped. */
  sizeBytes: number
  contentHash: string
  probe: {
    durationUs: number
    width: number
    height: number
    fps: number
    rotation: number
    hasAudio: boolean
  }
  filmstrip: {
    count: number
    intervalUs: number
    tileWidth: number
    tileHeight: number
  } | null
  transcriptProvider: string | null
  /** File names inside the sample directory. */
  files: {
    proxy: string
    seekIndex: string
    thumbnail: string | null
    filmstrip: string | null
    transcript: string | null
  }
}

const FILE_NAME = /^[a-z0-9][a-z0-9._-]*$/i

function isFileName(value: unknown): value is string {
  // A bare name, never a path: the manifest is read from disk and these are
  // joined onto the sample directory.
  return typeof value === "string" && FILE_NAME.test(value) && !value.includes("..")
}

function isOptionalFileName(value: unknown): value is string | null {
  return value === null || isFileName(value)
}

function isPositive(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
}

export function parseSampleManifest(json: unknown): SampleManifest | null {
  if (!json || typeof json !== "object") return null
  const m = json as Partial<SampleManifest>

  if (m.version !== 1) return null
  if (typeof m.filename !== "string" || !m.filename) return null
  if (typeof m.mimeType !== "string" || !/^(video|audio)\//.test(m.mimeType)) {
    return null
  }
  if (!isPositive(m.sizeBytes)) return null
  if (typeof m.contentHash !== "string" || !m.contentHash.startsWith("sample-cuts:")) {
    return null
  }

  const probe = m.probe
  if (
    !probe ||
    !isPositive(probe.durationUs) ||
    !isPositive(probe.width) ||
    !isPositive(probe.height) ||
    typeof probe.fps !== "number" ||
    typeof probe.rotation !== "number" ||
    typeof probe.hasAudio !== "boolean"
  ) {
    return null
  }

  const strip = m.filmstrip
  if (
    strip !== null &&
    (!strip ||
      !isPositive(strip.count) ||
      !isPositive(strip.intervalUs) ||
      !isPositive(strip.tileWidth) ||
      !isPositive(strip.tileHeight))
  ) {
    return null
  }

  const files = m.files
  if (
    !files ||
    !isFileName(files.proxy) ||
    !isFileName(files.seekIndex) ||
    !isOptionalFileName(files.thumbnail) ||
    !isOptionalFileName(files.filmstrip) ||
    !isOptionalFileName(files.transcript)
  ) {
    return null
  }

  // Geometry without a sheet, or a sheet without geometry, is a strip nothing
  // can slice — the same rule completeIngest keeps.
  if ((strip === null) !== (files.filmstrip === null)) return null

  if (m.transcriptProvider !== null && typeof m.transcriptProvider !== "string") {
    return null
  }

  return m as SampleManifest
}
