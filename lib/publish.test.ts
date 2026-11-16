import { describe, expect, it } from "vitest"

// `idFromBody` moved to lib/publisher.ts with the two first-party publishers
// that parse a response with it (plan 027 item 4f). Only the import path
// changed; every assertion below is the one that pinned the bug when the parse
// lived in lib/publish.ts.
import { idFromBody } from "./publisher"

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
