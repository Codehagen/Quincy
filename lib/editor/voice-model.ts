import { access } from "node:fs/promises"
import { join } from "node:path"

/**
 * Where the speech model for the cleaned voice lives, or null to go without.
 *
 * The model is a 300 KB text file that ffmpeg's `arnndn` filter reads
 * (media.ts `voiceDenoiseArgs`). It ships in the repository so a deploy has it
 * with no download step, and next.config.ts traces it into the two functions
 * that clean a voice: nothing in the module graph points at it, so without
 * that the route deploys cleanly and finds no file on the first upload.
 *
 * Read from the working directory, which is the project root in `next dev`,
 * in scripts, and in a deployed function, where traced files keep their
 * repository paths.
 *
 * Two settings, both optional:
 *
 * - `VOICE_DENOISE=off` turns the model off and every take gets the plain
 *   chain, for when a recording sounds worse through it and the fix is not
 *   ready yet.
 * - `VOICE_DENOISE_MODEL` points at another model file, to try one without a
 *   commit. A path, absolute or from the project root.
 *
 * A missing file is not an error. It returns null and the take is cleaned the
 * way it was before the model existed, because the cleaned voice is a nicer
 * sound and never a reason for an upload to fail.
 */
export const DEFAULT_VOICE_MODEL = "lib/editor/models/speech.rnnn"

export async function voiceModelPath(
  env: Record<string, string | undefined> = process.env,
  cwd: string = process.cwd()
): Promise<string | null> {
  if (env.VOICE_DENOISE?.trim().toLowerCase() === "off") return null

  const configured = env.VOICE_DENOISE_MODEL?.trim() || DEFAULT_VOICE_MODEL
  const path = configured.startsWith("/") ? configured : join(cwd, configured)

  try {
    await access(path)
    return path
  } catch {
    return null
  }
}
