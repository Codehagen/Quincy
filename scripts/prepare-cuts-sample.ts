import { createHash } from "node:crypto"
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { basename, extname, join } from "node:path"

import { runIngest, type Storage } from "../lib/editor/ingest"
import { peaksFromPcm, storageKeys } from "../lib/editor/media"
import {
  parseSampleManifest,
  SAMPLE_DIR_SEGMENTS,
  SAMPLE_MANIFEST_FILE,
  sampleContentHash,
  type SampleManifest,
} from "../lib/editor/sample-manifest"
import { createFfmpegTranscoder } from "../lib/editor/transcoder-ffmpeg"
import {
  createDeepgramTranscriber,
  isDeepgramConfigured,
  readDeepgramOptions,
} from "../lib/transcription/deepgram"
import { wordsFromTranscript } from "../lib/editor/transcript"

/**
 * Prepare the Cuts sample recording, once.
 *
 *   npx tsx --env-file=.env.local scripts/prepare-cuts-sample.ts <video> --yes
 *
 * Runs the real ingest pipeline — probe, proxy transcode, audio peaks, seek
 * index, poster, filmstrip, Deepgram — against a local file, and writes what
 * it produces into `public/samples/cuts/` with a manifest. Commit that folder,
 * and /cuts offers "Try it with a sample recording", which makes a project
 * from these files without running ingest again (lib/editor/sample.ts).
 *
 * **This spends.** It is the one place the sample calls Deepgram: a few cents
 * at most for a 10–20 second clip. So it refuses to run without `--yes`, and
 * refuses a clip over `MAX_SAMPLE_SECONDS` before any audio is sent.
 *
 * No database, no bucket, no user. Use a recording you own, with speech in it.
 */

/** A sample is a short clip. Anything longer is the wrong file. */
const MAX_SAMPLE_SECONDS = 60

async function main() {
  const args = process.argv.slice(2)
  const input = args.find((arg) => !arg.startsWith("--"))

  if (!input) {
    console.error(
      "Usage: npx tsx --env-file=.env.local scripts/prepare-cuts-sample.ts <video> --yes"
    )
    process.exit(1)
  }

  console.log(
    "This transcodes the clip and sends its audio to Deepgram once.\n" +
      "That spends real money: a few cents for a 10–20 second clip, at most\n" +
      `two passes if the first transcript looks like the wrong language.\n`
  )

  if (!args.includes("--yes")) {
    console.error("Not run. Pass --yes to spend it.")
    process.exit(1)
  }

  if (!isDeepgramConfigured()) {
    console.error("DEEPGRAM_API_KEY is not set. The sample needs a transcript.")
    process.exit(1)
  }

  const bytes = await readFile(input)
  const sha256 = createHash("sha256").update(bytes).digest("hex")
  const contentHash = sampleContentHash(sha256)
  const sizeBytes = (await stat(input)).size

  const outDir = join(process.cwd(), ...SAMPLE_DIR_SEGMENTS)
  const work = await mkdtemp(join(tmpdir(), "prepare-cuts-sample-"))

  try {
    const storage = memoryStorage()

    const result = await runIngest(
      {
        assetId: "sample",
        filename: basename(input),
        mimeType: mimeTypeFor(input),
        sizeBytes,
        contentHash,
        source: { kind: "path", path: input },
      },
      {
        storage,
        transcoder: createFfmpegTranscoder({ workdir: work }),
        transcriber: createDeepgramTranscriber({
          ...readDeepgramOptions(),
          onRequest: async (seconds) =>
            console.log(`  deepgram: sending ${seconds.toFixed(1)}s of audio`),
        }),
        peaksFromPcm,
        onProgress: (step) => console.log(`  ${step}`),
        // The ceiling, before the transcode and before Deepgram.
        admit: (probe) => {
          const seconds = probe.durationUs / 1_000_000
          if (seconds > MAX_SAMPLE_SECONDS) {
            throw new Error(
              `The clip is ${Math.round(seconds)}s. A sample is at most ${MAX_SAMPLE_SECONDS}s; use a 10–20s clip.`
            )
          }
          if (!probe.hasAudio) {
            throw new Error("The clip has no audio. A sample needs speech in it.")
          }
        },
        admitTranscription: async (seconds) =>
          seconds > MAX_SAMPLE_SECONDS
            ? `The audio is ${Math.round(seconds)}s, over ${MAX_SAMPLE_SECONDS}s.`
            : null,
      }
    )

    if (result.warnings.length > 0) {
      console.log(`\nwarnings:\n  ${result.warnings.join("\n  ")}`)
    }

    if (!result.transcript) {
      throw new Error("No transcript came back. Nothing written.")
    }

    const proxy = storage.written.get(storageKeys.proxy(contentHash))
    const seekIndex = storage.written.get(storageKeys.seekIndex(contentHash))
    const thumbnail = storage.written.get(storageKeys.thumbnail(contentHash))
    const filmstrip = result.filmstrip
      ? storage.written.get(storageKeys.filmstrip(contentHash))
      : undefined

    if (!proxy || !seekIndex) {
      throw new Error("The pipeline did not produce a proxy and a seek index.")
    }

    const files: SampleManifest["files"] = {
      proxy: "proxy.mp4",
      seekIndex: "seek.json",
      thumbnail: thumbnail ? "thumb.jpg" : null,
      filmstrip: filmstrip ? "strip.jpg" : null,
      transcript: "transcript.json",
    }

    const manifest: SampleManifest = {
      version: 1,
      filename: basename(input),
      mimeType: mimeTypeFor(input),
      sizeBytes,
      contentHash,
      probe: {
        durationUs: result.probe.durationUs,
        width: result.probe.width,
        height: result.probe.height,
        fps: result.probe.fps,
        rotation: result.probe.rotation,
        hasAudio: result.probe.hasAudio,
      },
      filmstrip: filmstrip && result.filmstrip ? result.filmstrip : null,
      transcriptProvider: result.transcriptProvider,
      files,
    }

    // Checked with the same validator the server uses, so a manifest that
    // would hide the button is caught here and not on the deployment.
    if (!parseSampleManifest(JSON.parse(JSON.stringify(manifest)))) {
      throw new Error("The manifest did not validate. Nothing written.")
    }

    await mkdir(outDir, { recursive: true })
    await writeFile(join(outDir, files.proxy), proxy)
    await writeFile(join(outDir, files.seekIndex), seekIndex)
    if (thumbnail && files.thumbnail) {
      await writeFile(join(outDir, files.thumbnail), thumbnail)
    }
    if (filmstrip && files.filmstrip) {
      await writeFile(join(outDir, files.filmstrip), filmstrip)
    }
    await writeFile(
      join(outDir, "transcript.json"),
      JSON.stringify(result.transcript)
    )
    // Written last: the manifest is what makes the button appear, so it only
    // exists once everything it names does.
    await writeFile(
      join(outDir, SAMPLE_MANIFEST_FILE),
      `${JSON.stringify(manifest, null, 2)}\n`
    )

    const words = wordsFromTranscript(result.transcript)
    console.log(
      `\nWrote ${outDir}\n` +
        `  ${(result.probe.durationUs / 1_000_000).toFixed(1)}s, ` +
        `${result.probe.width}x${result.probe.height}, ${words.length} words\n` +
        `  "${words
          .slice(0, 12)
          .map((word) => word.text)
          .join(" ")}${words.length > 12 ? " …" : ""}"\n\n` +
        "Commit public/samples/cuts/ to ship it."
    )
  } finally {
    await rm(work, { recursive: true, force: true }).catch(() => {})
  }
}

/** Keeps every put in memory; the script picks out what it ships. */
function memoryStorage(): Storage & { written: Map<string, Uint8Array> } {
  const written = new Map<string, Uint8Array>()

  return {
    written,
    async put(key, body) {
      if (!(body instanceof Uint8Array)) {
        throw new Error(`expected bytes for ${key}`)
      }
      written.set(key, body)
    },
    async url(key) {
      return `memory://${key}`
    },
    async exists() {
      // Always build: the sample's derivatives must all be produced here.
      return false
    },
  }
}

function mimeTypeFor(path: string): string {
  const types: Record<string, string> = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".m4v": "video/x-m4v",
    ".webm": "video/webm",
    ".mkv": "video/x-matroska",
  }
  return types[extname(path).toLowerCase()] ?? "video/mp4"
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
