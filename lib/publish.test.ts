import { describe, expect, it } from "vitest"

// idFromBody is not exported. Export it for the test — add `export` to its
// declaration in lib/publish.ts and note in its doc comment that the export
// exists for the test, matching how the repo treats other internals.
import { idFromBody } from "./publish"

describe("idFromBody", () => {
  it("reads X's nested id", () => {
    expect(idFromBody('{"data":{"id":"123"}}')).toBe("123")
  })

  it("reads a top-level id", () => {
    expect(idFromBody('{"id":"urn:li:share:456"}')).toBe("urn:li:share:456")
  })

  it("returns undefined for an empty body rather than throwing", () => {
    expect(idFromBody("")).toBeUndefined()
  })

  it("returns undefined for an HTML interstitial rather than throwing", () => {
    // The bug this file exists for: a 2xx carrying non-JSON used to throw,
    // and the throw turned a published post into a reported failure.
    expect(() => idFromBody("<html><body>ok</body></html>")).not.toThrow()
    expect(idFromBody("<html><body>ok</body></html>")).toBeUndefined()
  })

  it("returns undefined for a plain-text acknowledgement", () => {
    expect(idFromBody("accepted")).toBeUndefined()
  })

  it("returns undefined when JSON parses but carries no id", () => {
    expect(idFromBody('{"data":{}}')).toBeUndefined()
  })
})
