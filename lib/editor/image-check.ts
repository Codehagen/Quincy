/**
 * What an uploaded picture really is, from its first bytes.
 *
 * An image never goes through ffmpeg, so nothing else reads it before it is
 * served back into the editor. The upload URL binds the content type but not
 * the size or the bytes, so both are checked against what was stored.
 */

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

export type ImageType = "image/png" | "image/jpeg" | "image/webp" | "image/gif"

export function sniffImage(head: Uint8Array): ImageType | null {
  const at = (index: number) => head[index]
  const ascii = (start: number, text: string) =>
    [...text].every((char, i) => at(start + i) === char.charCodeAt(0))
  if (at(0) === 0x89 && ascii(1, "PNG")) return "image/png"
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg"
  if (ascii(0, "GIF8")) return "image/gif"
  if (ascii(0, "RIFF") && ascii(8, "WEBP")) return "image/webp"
  return null
}

/** Why a stored picture is refused, or null when it is what it says. */
export function imageProblem(
  stored: { sizeBytes: number; head: Uint8Array } | null,
  declaredType: string
): { status: number; error: string } | null {
  if (!stored) return { status: 409, error: "The picture has not finished uploading." }
  if (stored.sizeBytes > MAX_IMAGE_BYTES)
    return { status: 413, error: `Images are limited to ${MAX_IMAGE_BYTES / 1024 ** 2}MB.` }
  const actual = sniffImage(stored.head)
  if (!actual) return { status: 415, error: "That file is not a PNG, JPEG, WebP or GIF picture." }
  if (actual !== declaredType)
    return { status: 415, error: "The picture is not the kind of file it was uploaded as." }
  return null
}
