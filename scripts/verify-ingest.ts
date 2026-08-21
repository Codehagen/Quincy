import { execFile } from "node:child_process"
import { mkdtemp, rm, stat, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { promisify } from "node:util"

import ffmpegPath from "ffmpeg-static"

import { runIngest, type Storage } from "../lib/editor/ingest"
import { peaksFromPcm } from "../lib/editor/media"
import { createR2Storage, isR2Configured } from "../lib/editor/storage-r2"
import { createFfmpegTranscoder } from "../lib/editor/transcoder-ffmpeg"
import {
  createDeepgramTranscriber,
  isDeepgramConfigured,
  readDeepgramOptions,
} from "../lib/editor/transcriber-deepgram"
import { wordsFromDeepgram } from "../lib/editor/transcript"

/**
 * The ingest pipeline, against real binaries and real providers.
 *
 * Unit tests cover the decisions; this covers the parts that only fail in
 * contact with the world — whether the binaries are actually on disk, whether
 * ffmpeg accepts the argument lists as written, whether Deepgram takes headerless
 * PCM at the rate we claim, and whether R2 will hold the derivatives.
 *
 *   npx tsx --env-file=.env.local scripts/verify-ingest.ts
 *   npx tsx --env-file=.env.local scripts/verify-ingest.ts --keep-remote
 *
 * Nothing touches the database and nothing touches a user. The fixture is
 * synthesised here rather than committed, so the repo carries no video and the
 * script has no setup step. Uploads go to a `verify/` prefix and are deleted
 * afterwards unless --keep-remote is passed.
 */

const run = promisify(execFile)
const keepRemote = process.argv.includes("--keep-remote")

/** Spoken words, so the transcript has something to be right or wrong about. */
const SCRIPT = "Quincy turns one recording into a week of posts."

async function main() {
  const dir = await mkdtemp(join(tmpdir(), "verify-ingest-"))
  const failures: string[] = []

  try {
    const fixture = await makeFixture(dir)
    console.log(`fixture: ${fixture} (${(await stat(fixture)).size} bytes)\n`)

    const storage = memoryStorage()
    const transcoderWorkdir = join(dir, "work")
    await run("mkdir", ["-p", transcoderWorkdir])

    if (!isDeepgramConfigured()) {
      failures.push("DEEPGRAM_API_KEY is not set — transcript step unverified")
    }

    const result = await runIngest(
      {
        assetId: "verify",
        filename: "fixture.mp4",
        mimeType: "video/mp4",
        sizeBytes: (await stat(fixture)).size,
        contentHash: `verify-${Date.now()}`,
        source: { kind: "path", path: fixture },
      },
      {
        storage,
        transcoder: createFfmpegTranscoder({ workdir: transcoderWorkdir }),
        transcriber: isDeepgramConfigured()
          ? createDeepgramTranscriber(readDeepgramOptions())
          : neverTranscribes(),
        peaksFromPcm,
        onProgress: (step) => console.log(`  ${step}`),
      }
    )

    console.log("\n── probe ──")
    console.log(
      `  ${result.probe.width}x${result.probe.height} @ ${result.probe.fps}fps, ` +
        `${(result.probe.durationUs / 1_000_000).toFixed(2)}s, ` +
        `audio: ${result.probe.hasAudio}, codec: ${result.probe.videoCodec}`
    )

    if (result.probe.width !== 640) failures.push("probe read the wrong width")
    if (!result.probe.hasAudio) failures.push("probe missed the audio stream")

    console.log("\n── derivatives ──")
    for (const [key, bytes] of storage.written) {
      console.log(`  ${key} — ${bytes} bytes`)
    }

    const proxy = storage.written.get(result.keys.proxy) ?? 0
    if (proxy < 1000) failures.push("proxy is implausibly small")
    if (!storage.written.has(result.keys.thumbnail)) {
      failures.push("no thumbnail was written")
    }

    console.log("\n── seek index ──")
    console.log(
      `  ${result.seekIndex.values.length} peaks at ${result.seekIndex.intervalUs}us, ` +
        `${result.seekIndex.keyframesUs.length} keyframes`
    )
    console.log(
      `  keyframes: ${result.seekIndex.keyframesUs
        .slice(0, 6)
        .map((offset) => (offset / 1_000_000).toFixed(2))
        .join("s, ")}s`
    )

    if (result.seekIndex.values.length === 0) failures.push("no audio peaks")
    if (result.seekIndex.keyframesUs.length === 0) failures.push("no keyframes")
    if (result.seekIndex.keyframesUs[0] !== 0) {
      failures.push("first keyframe is not at zero")
    }
    // Peaks must land on real audio, not silence read out of a WAV header.
    if (Math.max(...result.seekIndex.values) < 0.05) {
      failures.push("peaks are silent — check the WAV header walk")
    }

    console.log("\n── transcript ──")
    if (result.transcript) {
      const words = wordsFromDeepgram(result.transcript)
      console.log(`  ${result.transcriptProvider}: ${words.length} words`)
      console.log(`  "${words.map((word) => word.text).join(" ")}"`)

      if (words.length === 0)
        failures.push("transcript came back with no words")
      if (words.some((word) => word.endUs <= word.startUs)) {
        failures.push("a word ends before it starts")
      }
      // The rate we declare in the query string decides the scale of every
      // timestamp. A wrong one still returns plausible words.
      const last = words.at(-1)
      if (last && last.endUs > result.probe.durationUs * 1.1) {
        failures.push("timestamps run past the clip — sample rate mismatch")
      }
    } else {
      console.log(`  none. warnings: ${result.warnings.join("; ")}`)
    }

    console.log("\n── warnings ──")
    console.log(
      result.warnings.length ? `  ${result.warnings.join("\n  ")}` : "  none"
    )

    await verifyR2(dir, failures)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }

  console.log("\n────────────────────────")
  if (failures.length === 0) {
    console.log("PASS — the pipeline works end to end.")
    return
  }

  console.log(`FAIL — ${failures.length} problem(s):`)
  for (const failure of failures) console.log(`  - ${failure}`)
  process.exitCode = 1
}

/**
 * A short clip with real speech in it.
 *
 * `say` rather than a tone, because a transcript of a sine wave proves the
 * request was accepted and nothing about whether the audio arrived intact.
 * Falls back to a tone where `say` does not exist, and the transcript check
 * is skipped rather than failing on a machine that cannot speak.
 */
async function makeFixture(dir: string): Promise<string> {
  const speech = join(dir, "speech.aiff")
  const output = join(dir, "fixture.mp4")

  let haveSpeech = true
  try {
    await run("say", ["-o", speech, SCRIPT])
  } catch {
    haveSpeech = false
    console.log("note: `say` unavailable, falling back to a tone\n")
  }

  const audio = haveSpeech
    ? ["-i", speech]
    : ["-f", "lavfi", "-i", "sine=frequency=440:duration=6"]

  await run(ffmpegPath!, [
    "-f",
    "lavfi",
    "-i", // Moving picture, so the encoder has something to make keyframes about.
    "testsrc=size=640x360:rate=30:duration=6",
    ...audio,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-shortest",
    "-y",
    output,
  ])

  return output
}

/** Counts bytes instead of uploading. R2 is exercised separately below. */
function memoryStorage(): Storage & { written: Map<string, number> } {
  const written = new Map<string, number>()

  return {
    written,
    async put(key, body) {
      written.set(key, (body as Uint8Array).byteLength)
    },
    async url(key) {
      return `memory://${key}`
    },
    async exists() {
      return false
    },
  }
}

function neverTranscribes() {
  return {
    name: "none",
    transcribe: () => {
      throw new Error("DEEPGRAM_API_KEY is not set")
    },
  }
}

/**
 * A real round trip through the bucket.
 *
 * Small and separate from the pipeline run above: the point is to prove the
 * credentials in this environment can write, be found, be read back and
 * deleted — not to push a proxy through the network on every verify.
 */
async function verifyR2(dir: string, failures: string[]) {
  console.log("\n── R2 ──")

  if (!isR2Configured()) {
    console.log("  not configured — skipped")
    failures.push("R2 is not configured — storage unverified")
    return
  }

  const storage = createR2Storage()
  const key = `verify/ingest-${Date.now()}.json`
  const body = new TextEncoder().encode(JSON.stringify({ hello: "quincy" }))

  await storage.put(key, body, "application/json")
  console.log(`  put ${key}`)

  if (!(await storage.exists(key))) {
    failures.push("object was not found after a successful put")
  } else {
    console.log("  exists: yes")
  }

  const url = await storage.url(key, 60)
  const response = await fetch(url)
  const text = await response.text()

  if (!response.ok || !text.includes("quincy")) {
    failures.push(`signed URL did not read back (${response.status})`)
  } else {
    console.log("  signed URL reads back the bytes")
  }

  if (!keepRemote) {
    const { deleteObject } = await import("../lib/editor/storage-r2")
    await deleteObject(key)
    console.log("  deleted")
  }

  await writeFile(join(dir, ".r2-ok"), "")
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
