import { execFile } from "node:child_process"
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import ffmpegPath from "ffmpeg-static"
import ffprobeStatic from "ffprobe-static"

import type { MediaSource, Transcoder } from "./ingest"
import {
  audioExtractArgs,
  probeArgs,
  proxyArgs,
  filmstripArgs,
  thumbnailArgs,
  type ProxyOptions,
} from "./media"
import { us, type Us } from "./time"

/**
 * The transcoder, as ffmpeg on the local filesystem.
 *
 * `lib/editor/media.ts` decides *what* to ask ffmpeg for and this decides
 * *how to run it*. Keeping them apart is what makes every flag in the proxy
 * command testable without a binary, and it is why swapping this for a durable
 * worker later is a one-file change: the argument lists come with it.
 *
 * Three things here are not obvious and all three are load-bearing.
 *
 * **Everything runs against a file path, never a pipe.** ffmpeg seeks — `-ss`
 * jumps rather than decoding, `+faststart` rewrites the moov atom at the end of
 * the encode, and reading an MP4 at all means finding that atom first. A pipe
 * cannot seek, so bytes are spilled to a temp file once and every step reads
 * that same path. Piping would work for exactly one of the four calls.
 *
 * **Every run has a deadline.** ffmpeg on a pathological file will sit there,
 * and a serverless function with no timeout of its own gets killed by the
 * platform at the ceiling with no error worth reading. A budget here fails with
 * a sentence instead.
 *
 * **stderr is kept on failure and dropped on success.** ffmpeg writes its
 * banner, progress and warnings to stderr on a perfectly good run, so treating
 * output as a signal is noise — but when the exit code is non-zero the last few
 * lines are the only place the actual reason appears.
 */

/** Milliseconds. Generous: a 4K talk on a cold function is genuinely slow. */
const PROBE_TIMEOUT = 60_000
const TRANSCODE_TIMEOUT = 15 * 60_000

/** ffprobe's JSON on a many-stream file clears execFile's 1MB default. */
const MAX_OUTPUT = 64 * 1024 * 1024

export class TranscoderUnavailableError extends Error {
  constructor(what: string) {
    super(
      `${what} binary is missing. It is downloaded by a postinstall script, ` +
        `so this usually means the install ran with build scripts blocked — ` +
        `check ffmpeg-static in pnpm-workspace.yaml under allowBuilds.`
    )
    this.name = "TranscoderUnavailableError"
  }
}

function ffmpegBinary(): string {
  // The package declares its export as `string`, optimistically: it resolves to
  // null on a platform it has no build for, and to a path that does not exist
  // when the postinstall was skipped. The compiler believes neither can happen,
  // so this guard is the only thing standing between that and a bare ENOENT.
  if (!ffmpegPath) throw new TranscoderUnavailableError("ffmpeg")
  return ffmpegPath
}

function ffprobeBinary(): string {
  if (!ffprobeStatic?.path) throw new TranscoderUnavailableError("ffprobe")
  return ffprobeStatic.path
}

/**
 * Run a binary and hand back stdout, or throw with what it actually said.
 *
 * Not `promisify(execFile)`, because that rejects with an Error whose `message`
 * is "Command failed" and buries stderr on a property nothing prints. The
 * reason a transcode failed is always in the last lines of stderr, so it goes
 * in the message where a log and a `warnings` entry will both carry it.
 */
function run(
  binary: string,
  args: string[],
  { timeout, encoding }: { timeout: number; encoding: "utf8" | "buffer" }
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      { timeout, maxBuffer: MAX_OUTPUT, encoding: encoding as "utf8" },
      (error, stdout, stderr) => {
        if (!error) return resolve(stdout)

        const { killed, code } = error as { killed?: boolean; code?: string }

        // A spawn failure has an empty stderr, because nothing ever ran to
        // write to it. Reporting that as "failed with no output" describes the
        // symptom and hides the cause — ENOENT here means the binary is not
        // where the package said it would be, which is a different problem
        // from a file ffmpeg could not read.
        const detail =
          code === "ENOENT"
            ? `not found at ${binary} — the path the package resolved to does not exist`
            : killed
              ? `timed out after ${Math.round(timeout / 1000)}s`
              : lastLines(String(stderr), 4)

        reject(new Error(`${basename(binary)}: ${detail}`))
      }
    )
  })
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1)
}

function lastLines(text: string, count: number): string {
  const lines = text.trim().split("\n").filter(Boolean)
  return lines.slice(-count).join(" / ") || "failed with no output"
}

/**
 * A working directory for one asset, and a promise it is cleaned up.
 *
 * Temp files on a warm function instance are not swept between invocations —
 * Fluid Compute reuses the instance, and a gigabyte of leftover source video
 * per run fills the disk in a handful of requests. `finally` rather than a
 * happy-path delete, because the failure case is exactly when the file is
 * largest.
 */
export async function withWorkspace<T>(
  body: (dir: string) => Promise<T>
): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "quincy-ingest-"))
  try {
    return await body(dir)
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * Resolve a source to a path ffmpeg can seek in.
 *
 * A `path` source is already one and is used in place — it is the worker case,
 * where the file was streamed to disk by whatever downloaded it. `bytes` is the
 * function case and gets written once, not once per step.
 */
async function materialise(
  source: MediaSource,
  dir: string,
  filename = "source"
): Promise<string> {
  if (source.kind === "path") return source.path

  const path = join(dir, filename)
  await writeFile(path, source.bytes)
  return path
}

export type FfmpegTranscoderOptions = {
  /** Where temp files go. One per asset; the caller owns its lifetime. */
  workdir: string
  /** Poster frame offset. Not zero — see the note on `thumbnail`. */
  thumbnailAtUs?: Us
}

/**
 * A frame a second in, rather than the first one.
 *
 * The first frame of real footage is a lens cap, a fade from black, or someone
 * reaching back to the record button. Any of those makes a poster frame that
 * says nothing about the clip. One second in is past all three on most takes
 * and costs nothing, because `-ss` before `-i` seeks rather than decodes.
 */
const DEFAULT_THUMBNAIL_AT = us(1_000_000)

export function createFfmpegTranscoder(
  options: FfmpegTranscoderOptions
): Transcoder {
  const { workdir } = options
  const thumbnailAt = options.thumbnailAtUs ?? DEFAULT_THUMBNAIL_AT

  return {
    async probe(source) {
      const input = await materialise(source, workdir)
      const stdout = await run(ffprobeBinary(), probeArgs(input), {
        timeout: PROBE_TIMEOUT,
        encoding: "utf8",
      })

      return JSON.parse(stdout) as unknown
    },

    async proxy(source, proxyOptions: ProxyOptions) {
      const input = await materialise(source, workdir)
      const output = join(workdir, "proxy.mp4")

      await run(ffmpegBinary(), proxyArgs(input, output, proxyOptions), {
        timeout: TRANSCODE_TIMEOUT,
        encoding: "buffer",
      })

      return new Uint8Array(await readFile(output))
    },

    async audio(source) {
      const input = await materialise(source, workdir)
      // `.wav` and not `.pcm`: ffmpeg picks the muxer from the extension, and
      // headerless PCM would need an `-f s16le` that audioExtractArgs has no
      // business carrying. The header is stripped on the way back in.
      const output = join(workdir, "audio.wav")

      await run(ffmpegBinary(), audioExtractArgs(input, output), {
        timeout: TRANSCODE_TIMEOUT,
        encoding: "buffer",
      })

      return pcmFromWav(new Uint8Array(await readFile(output)))
    },

    async thumbnail(source) {
      const input = await materialise(source, workdir)
      const output = join(workdir, "thumb.jpg")

      try {
        await run(ffmpegBinary(), thumbnailArgs(input, output, thumbnailAt), {
          timeout: PROBE_TIMEOUT,
          encoding: "buffer",
        })
      } catch {
        // Seeking past the end of a clip shorter than the offset produces no
        // frame at all. A two-second cut is a real thing to upload, so fall
        // back to the first frame rather than losing the poster entirely.
        await run(ffmpegBinary(), thumbnailArgs(input, output, us(0)), {
          timeout: PROBE_TIMEOUT,
          encoding: "buffer",
        })
      }

      return new Uint8Array(await readFile(output))
    },

    async filmstrip(source, plan) {
      const input = await materialise(source, workdir)
      const output = join(workdir, "strip.jpg")

      // Decodes the whole file, so it gets the transcode budget rather than the
      // probe one. `fps` has to walk every frame to know which to keep — there
      // is no seek that answers "one frame every 400ms" cheaply.
      await run(ffmpegBinary(), filmstripArgs(input, output, plan), {
        timeout: TRANSCODE_TIMEOUT,
        encoding: "buffer",
      })

      return new Uint8Array(await readFile(output))
    },

    async keyframes(source) {
      const input = await materialise(source, workdir, "keyframe-source.mp4")
      const stdout = await run(ffprobeBinary(), keyframeArgs(input), {
        timeout: PROBE_TIMEOUT,
        encoding: "utf8",
      })

      return parseKeyframes(stdout)
    },
  }
}

/**
 * Ask for packets, not frames.
 *
 * `-show_entries frame=...` decodes the video to answer, which on a long file
 * costs about what the transcode did. Packet headers carry the keyframe flag
 * already, so this is a read of the container and finishes in a second or two.
 */
export function keyframeArgs(input: string): string[] {
  return [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time,flags",
    "-of",
    "csv=print_section=0",
    input,
  ]
}

/**
 * Keyframe offsets, in microseconds, from ffprobe's CSV.
 *
 * Lines are `<pts_time>,<flags>` and a keyframe carries `K` in the flags field.
 * Packets are not guaranteed to arrive in presentation order — B-frames put
 * them out of it — so this sorts rather than trusting the file's order, because
 * a seek index that is not monotonic makes a binary search silently wrong.
 */
export function parseKeyframes(csv: string): Us[] {
  const offsets: Us[] = []

  for (const line of csv.split("\n")) {
    const [time, flags] = line.trim().split(",")
    if (!flags?.includes("K")) continue

    const seconds = Number(time)
    // "N/A" is what a container with no timestamps reports. Not an error —
    // just a packet that cannot anchor a seek.
    if (!Number.isFinite(seconds)) continue

    offsets.push(us(Math.round(seconds * 1_000_000)))
  }

  return offsets.sort((a, b) => a - b)
}

/**
 * Raw samples out of the WAV ffmpeg just wrote.
 *
 * The header is not reliably 44 bytes. ffmpeg writes a `LIST`/`INFO` chunk with
 * its own encoder name on some builds, which pushes the audio along by a
 * variable amount — slicing at a constant offset yields a few milliseconds of
 * metadata read as samples, which is a click at the head of every waveform and
 * a transcript that starts a hair late. So walk the chunks.
 */
export function pcmFromWav(wav: Uint8Array): {
  pcm: Int16Array
  sampleRate: number
} {
  const view = new DataView(wav.buffer, wav.byteOffset, wav.byteLength)

  if (wav.byteLength < 12 || ascii(wav, 0, 4) !== "RIFF") {
    throw new Error("audio extract did not produce a WAV")
  }

  let sampleRate = 0
  let offset = 12

  while (offset + 8 <= wav.byteLength) {
    const id = ascii(wav, offset, 4)
    const size = view.getUint32(offset + 4, true)
    const body = offset + 8

    if (id === "fmt ") {
      sampleRate = view.getUint32(body + 4, true)
    } else if (id === "data") {
      // The declared size can overrun the file when a write was interrupted;
      // trusting it would read past the buffer.
      const length = Math.min(size, wav.byteLength - body)
      return { pcm: readSamples(wav, body, length), sampleRate }
    }

    // Chunks are word-aligned and an odd size is followed by a pad byte.
    offset = body + size + (size % 2)
  }

  throw new Error("WAV has no data chunk")
}

/**
 * Copied rather than viewed in place. `new Int16Array(buffer, offset)` throws
 * unless the offset is even, and the data chunk lands wherever the preceding
 * chunks leave it — so half the files would work and half would not.
 */
function readSamples(
  bytes: Uint8Array,
  offset: number,
  length: number
): Int16Array {
  const samples = new Int16Array(Math.floor(length / 2))
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)

  for (let i = 0; i < samples.length; i++) {
    // Explicitly little-endian, which is what `pcm_s16le` means. Every platform
    // this runs on is little-endian too, so the byte order is only stated here
    // to keep the file's format and the reader's assumption in one place.
    samples[i] = view.getInt16(offset + i * 2, true)
  }

  return samples
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  return String.fromCharCode(...bytes.subarray(offset, offset + length))
}
