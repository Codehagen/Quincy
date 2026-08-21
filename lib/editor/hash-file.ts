// XXH3's 128-bit variant, which is what `xxh3-128` in the key means.
// hash-wasm's `createXXHash3` is the 64-bit one — half the digest, and a
// silent doubling of the collision surface if it were picked by name alone.
import { createXXHash128 } from "hash-wasm"

import { contentKey } from "./media"

/**
 * The identity of a file, computed in the browser before a byte is uploaded.
 *
 * This is what makes a re-upload free. The hash goes to the server first, the
 * server answers "already have it" or "here is somewhere to put it", and the
 * common case of dragging in a file you already have costs one round trip
 * instead of a gigabyte.
 *
 * **Streamed, never buffered.** `file.stream()` hands over chunks and the
 * hasher folds each one in, so a 4GB take is hashed in a few megabytes of
 * memory. The obvious alternative — `crypto.subtle.digest` over an ArrayBuffer
 * — has no incremental form, so it would mean reading the entire file into
 * memory to get a number out. On a phone that is the tab dying.
 *
 * **xxh3-128 rather than SHA-256.** This is a content address, not a security
 * boundary: it answers "have I seen these bytes" and nothing about trust.
 * xxh3 runs at multiple GB/s against SHA-256's few hundred MB/s, which on a
 * gigabyte take is the difference between imperceptible and a progress bar.
 * Nothing downstream treats a matching hash as proof of anything but identity,
 * and the key is scoped per user besides.
 */
export async function hashFile(
  file: Blob,
  onProgress?: (bytesRead: number) => void
): Promise<{ hash: string; contentHash: string; sizeBytes: number }> {
  const hasher = await createXXHash128()
  hasher.init()

  const reader = file.stream().getReader()
  let bytesRead = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue

      hasher.update(value)
      bytesRead += value.length
      onProgress?.(bytesRead)
    }
  } finally {
    // Without this the stream stays locked, and a retry on the same File
    // object throws "already locked" rather than re-reading it.
    reader.releaseLock()
  }

  const hash = hasher.digest()

  return {
    hash,
    // Size is in the key as well as the hash, so two files can only collide if
    // they are the same length *and* the same digest.
    contentHash: contentKey(bytesRead, hash),
    sizeBytes: bytesRead,
  }
}
