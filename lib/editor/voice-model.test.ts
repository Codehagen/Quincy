import { createHash } from "node:crypto"
import { readFile } from "node:fs/promises"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { DEFAULT_VOICE_MODEL, voiceModelPath } from "./voice-model"

describe("voiceModelPath", () => {
  it("finds the model that ships in the repository", async () => {
    expect(await voiceModelPath({})).toBe(
      join(process.cwd(), DEFAULT_VOICE_MODEL)
    )
  })

  it("is null when turned off", async () => {
    expect(await voiceModelPath({ VOICE_DENOISE: "off" })).toBeNull()
    expect(await voiceModelPath({ VOICE_DENOISE: " OFF " })).toBeNull()
  })

  it("is null, not a throw, when the file is not there", async () => {
    expect(
      await voiceModelPath({ VOICE_DENOISE_MODEL: "/nowhere/model.rnnn" })
    ).toBeNull()
    expect(await voiceModelPath({}, "/nowhere")).toBeNull()
  })

  it("takes another model from the environment", async () => {
    expect(
      await voiceModelPath({ VOICE_DENOISE_MODEL: DEFAULT_VOICE_MODEL })
    ).toBe(join(process.cwd(), DEFAULT_VOICE_MODEL))
  })

  /**
   * Pinned, so a change to the model is a deliberate edit that also moves
   * the voice key (media.ts `storageKeys.voice`), never a silent one.
   */
  it("ships the model it was measured with", async () => {
    const bytes = await readFile(join(process.cwd(), DEFAULT_VOICE_MODEL))
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      "70bb6685eb0c2a1d18e2918dca3fbfbd39317010b1802eb1b6ea73a92f3fdec0"
    )
  })
})
