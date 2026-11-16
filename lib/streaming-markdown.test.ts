import { describe, expect, it } from "vitest"

import { closeOpenMarkers } from "./streaming-markdown"

describe("closeOpenMarkers", () => {
  it("leaves balanced text alone", () => {
    const text = "**Done.** Here is `code` and a plain sentence."
    expect(closeOpenMarkers(text)).toBe(text)
  })

  it("closes bold that has opened but not shut", () => {
    expect(closeOpenMarkers("**Vil du at jeg")).toBe("**Vil du at jeg**")
  })

  it("closes inline code mid-word", () => {
    expect(closeOpenMarkers("Set `transition")).toBe("Set `transition`")
  })

  it("closes a fence and stops there", () => {
    // Everything inside a fence is literal, so an unbalanced `**` below the
    // opening line must not also be closed — that would put stray asterisks
    // inside the code block the reader is watching arrive.
    expect(closeOpenMarkers("```ts\nconst a = 1 ** 2")).toBe(
      "```ts\nconst a = 1 ** 2\n```"
    )
  })

  it("does not touch a closed fence", () => {
    const text = "```ts\nconst a = 1\n```\nAnd then."
    expect(closeOpenMarkers(text)).toBe(text)
  })

  it("ignores underscores, which are identifiers more often than emphasis", () => {
    const text = 'exec: read_story("Broker by day, builder by night")'
    expect(closeOpenMarkers(text)).toBe(text)
  })

  it("ignores a lone asterisk, which is multiplication more often than italic", () => {
    expect(closeOpenMarkers("roughly 3 * 4 tokens")).toBe("roughly 3 * 4 tokens")
  })

  it("counts backticks outside fences without being confused by them", () => {
    const text = "```ts\nconst a = 1\n```\nNow set `flag"
    expect(closeOpenMarkers(text)).toBe("```ts\nconst a = 1\n```\nNow set `flag`")
  })

  it("closes both a bold and an inline span in one pass", () => {
    expect(closeOpenMarkers("**Note:** run `pnpm")).toBe(
      "**Note:** run `pnpm`"
    )
  })
})
