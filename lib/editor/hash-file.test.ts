import { describe, expect, it } from "vitest"

import { hashFile } from "./hash-file"

describe("hashFile", () => {
  it("produces the xxh3-128 key format the storage layer expects", async () => {
    const { contentHash, hash, sizeBytes } = await hashFile(
      new Blob([new Uint8Array([1, 2, 3, 4])])
    )

    expect(sizeBytes).toBe(4)
    // 128 bits of digest is 32 hex characters, and the upload route's
    // validation accepts 16-64 — so a change in digest width would be caught
    // by the route rather than here, silently, as a 400.
    expect(hash).toMatch(/^[a-f0-9]{32}$/)
    expect(contentHash).toBe(`xxh3-128:4:${hash}`)
  })

  it("is stable for the same bytes", async () => {
    // The entire point. An unstable hash means a re-upload is never free and
    // the library fills with duplicates of one recording.
    const bytes = new Uint8Array([9, 8, 7, 6, 5])
    const a = await hashFile(new Blob([bytes]))
    const b = await hashFile(new Blob([bytes]))

    expect(a.contentHash).toBe(b.contentHash)
  })

  it("separates files that differ by one byte", async () => {
    const a = await hashFile(new Blob([new Uint8Array([1, 2, 3])]))
    const b = await hashFile(new Blob([new Uint8Array([1, 2, 4])]))

    expect(a.hash).not.toBe(b.hash)
  })

  it("separates same-digest files of different lengths by the size in the key", async () => {
    const a = await hashFile(new Blob([new Uint8Array(10)]))
    const b = await hashFile(new Blob([new Uint8Array(20)]))

    expect(a.contentHash).not.toBe(b.contentHash)
    expect(a.contentHash.split(":")[1]).toBe("10")
    expect(b.contentHash.split(":")[1]).toBe("20")
  })

  it("folds in every chunk of a multi-chunk stream", async () => {
    // The bug this catches is a reader loop that stops at the first chunk: on a
    // small test file there is only one, and everything looks fine until a real
    // upload hashes its first 64KB and calls it the file.
    const big = new Uint8Array(500_000).map((_, index) => index % 251)
    const whole = await hashFile(new Blob([big]))
    const truncated = await hashFile(new Blob([big.subarray(0, 65_536)]))

    expect(whole.sizeBytes).toBe(500_000)
    expect(whole.hash).not.toBe(truncated.hash)
  })

  it("reports progress as it reads", async () => {
    const seen: number[] = []
    await hashFile(new Blob([new Uint8Array(300_000)]), (bytes) =>
      seen.push(bytes)
    )

    expect(seen.at(-1)).toBe(300_000)
    // Monotonic, because it is wired to a progress bar and a number that goes
    // backwards reads as a stall.
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
  })

  it("can hash the same Blob twice without a locked stream", async () => {
    // releaseLock in a finally, not after the loop: a retry on the same File
    // object otherwise throws "already locked" instead of re-reading it.
    const blob = new Blob([new Uint8Array([4, 2])])

    await hashFile(blob)
    await expect(hashFile(blob)).resolves.toMatchObject({ sizeBytes: 2 })
  })

  it("hashes an empty file rather than throwing", async () => {
    const { sizeBytes, contentHash } = await hashFile(new Blob([]))

    expect(sizeBytes).toBe(0)
    expect(contentHash).toMatch(/^xxh3-128:0:[a-f0-9]{32}$/)
  })
})
