import { describe, expect, it, vi } from "vitest"

import { DEFAULT_VOICE_MODEL } from "./voice-model"

/**
 * The speech model is read by path, so nothing in the module graph carries
 * it into a deployed function: `outputFileTracingIncludes` does. Lose it
 * there and every upload is cleaned without the model and filed under the
 * plain key for good, which no other test would notice.
 */
vi.mock("workflow/next", () => ({
  withWorkflow: (config: unknown) => config,
}))

describe("next.config tracing", () => {
  it("carries the speech model into both routes that clean a voice", async () => {
    const { default: config } = await import("../../next.config")
    const includes = (
      config as { outputFileTracingIncludes?: Record<string, string[]> }
    ).outputFileTracingIncludes

    for (const route of [
      "/api/editor/assets/[id]/ingest",
      "/api/editor/assets/[id]/voice",
    ]) {
      expect(includes?.[route]).toContain(`./${DEFAULT_VOICE_MODEL}`)
    }
  })
})
