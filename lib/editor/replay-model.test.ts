import { describe, expect, it } from "vitest"

import { FILLER_REQUEST, replayModel } from "./replay-model"

/**
 * The replay model's script, read by what it calls: the dev replay and the
 * mock both depend on a request's words picking the right tool.
 */
async function callsFor(said: string): Promise<{ toolName: string; input: unknown }[]> {
  const model = replayModel(undefined, { pace: "none" })
  const { stream } = await model.doStream({
    prompt: [{ role: "user", content: [{ type: "text", text: said }] }],
  } as unknown as Parameters<typeof model.doStream>[0])
  const calls: { toolName: string; input: unknown }[] = []
  const reader = stream.getReader()
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (value.type === "tool-call") calls.push({ toolName: value.toolName, input: JSON.parse(value.input) })
  }
  return calls
}

describe("replay model: fillers", () => {
  it("maps a request about fillers to remove_fillers", async () => {
    for (const said of ["Remove the ums", "cut the fillers", "fjern øh-ene"]) {
      expect(await callsFor(said)).toEqual([{ toolName: "remove_fillers", input: {} }])
    }
  })

  it("cuts liksom only when the request names it", async () => {
    expect(await callsFor("cut the fillers, liksom too")).toEqual([
      { toolName: "remove_fillers", input: { alsoCut: ["liksom"] } },
    ])
  })

  it("keeps tighten to the pauses", async () => {
    expect(await callsFor("Tighten the edit")).toEqual([{ toolName: "remove_silences", input: {} }])
  })

  it("does not read an um inside another word", () => {
    expect(FILLER_REQUEST.test("an umbrella and a number")).toBe(false)
    expect(FILLER_REQUEST.test("røh")).toBe(false)
  })
})
