import { describe, expect, it } from "vitest"

import {
  MissingR2ConfigError,
  isR2Configured,
  r2Endpoint,
  readR2Config,
} from "./storage-r2"

const FULL = {
  R2_ACCOUNT_ID: "abc123",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "quincy-media",
}

describe("readR2Config", () => {
  it("reads a complete config", () => {
    expect(readR2Config(FULL)).toMatchObject({
      accountId: "abc123",
      bucket: "quincy-media",
    })
  })

  it("names every missing variable rather than the first", () => {
    // A 403 from S3 twenty minutes later is what a half-filled env file gives
    // you otherwise, and it names nothing.
    try {
      readR2Config({ R2_ACCOUNT_ID: "abc123" })
      throw new Error("should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(MissingR2ConfigError)
      const message = (error as Error).message
      expect(message).toContain("R2_ACCESS_KEY_ID")
      expect(message).toContain("R2_SECRET_ACCESS_KEY")
      expect(message).toContain("R2_BUCKET")
      expect(message).not.toContain("R2_ACCOUNT_ID")
    }
  })

  it("treats an empty string as missing", () => {
    // `R2_BUCKET=""` in an env file is the common half-filled shape, and it is
    // not a bucket named empty.
    expect(() => readR2Config({ ...FULL, R2_BUCKET: "" })).toThrow(
      MissingR2ConfigError
    )
  })

  it("leaves the public base URL optional", () => {
    expect(readR2Config(FULL).publicBaseUrl).toBeUndefined()
    expect(
      readR2Config({
        ...FULL,
        R2_PUBLIC_BASE_URL: "https://media.hirequincy.com",
      }).publicBaseUrl
    ).toBe("https://media.hirequincy.com")
  })
})

describe("isR2Configured", () => {
  it("is false before the env file is filled in", () => {
    // The ingest route branches on this to answer "storage is not set up yet"
    // instead of throwing at the first upload.
    expect(isR2Configured({})).toBe(false)
  })

  it("is true once it is", () => {
    expect(isR2Configured(FULL)).toBe(true)
  })
})

describe("r2Endpoint", () => {
  it("points at Cloudflare, not AWS", () => {
    expect(r2Endpoint("abc123")).toBe("https://abc123.r2.cloudflarestorage.com")
  })
})

describe("r2Endpoint", () => {
  it("uses the jurisdiction hostname for an EU bucket", () => {
    // Not a region. An EU bucket answers on a different host, and signing
    // against the default one fails with an error that never says why.
    expect(r2Endpoint("abc123", "eu")).toBe(
      "https://abc123.eu.r2.cloudflarestorage.com"
    )
  })
})

describe("jurisdiction", () => {
  it("defaults to default when unset", () => {
    expect(readR2Config(FULL).jurisdiction).toBe("default")
  })

  it("reads eu", () => {
    expect(readR2Config({ ...FULL, R2_JURISDICTION: "eu" }).jurisdiction).toBe(
      "eu"
    )
  })

  it("refuses a value it does not recognise", () => {
    // Falling back to default would put an EU bucket's traffic on the wrong
    // host and fail somewhere unrelated.
    expect(() => readR2Config({ ...FULL, R2_JURISDICTION: "europe" })).toThrow(
      /must be default, eu or fedramp/
    )
  })
})
