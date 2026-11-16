import { describe, expect, it } from "vitest"

import { resolveReturnTo } from "./channels"

/**
 * The open-redirect guard on the connect callback. See plans/022, decision 4.
 *
 * This is the one function in first run where being wrong is a security bug
 * rather than a design one: the callback runs while the person holds a freshly
 * minted session, which is exactly when sending them somewhere else is worth
 * the most to an attacker.
 *
 * The cases below are not hypothetical. Every one of them defeats
 * `value.startsWith("/")`, which is the guard anyone writes first.
 */
describe("resolveReturnTo", () => {
  it("allows a published path", () => {
    expect(resolveReturnTo("/welcome")).toBe("/welcome")
  })

  it("refuses an absolute URL", () => {
    expect(resolveReturnTo("https://evil.example")).toBeNull()
  })

  it("refuses a protocol-relative URL", () => {
    // Passes startsWith("/"). Browsers treat it as https://evil.example.
    expect(resolveReturnTo("//evil.example")).toBeNull()
  })

  it("refuses a backslash-escaped protocol-relative URL", () => {
    // Passes startsWith("/") too, and several browsers normalise the
    // backslash to a slash before navigating.
    expect(resolveReturnTo("/\\evil.example")).toBeNull()
  })

  it("refuses a path that merely starts with a published one", () => {
    // The reason this is a literal comparison and not a prefix test.
    expect(resolveReturnTo("/welcome.evil.example")).toBeNull()
    expect(resolveReturnTo("/welcome/../../etc")).toBeNull()
  })

  it("refuses a published path carrying a query or fragment", () => {
    // Not dangerous today, but allowing it means the allowlist no longer
    // describes a fixed set of destinations.
    expect(resolveReturnTo("/welcome?x=1")).toBeNull()
    expect(resolveReturnTo("/welcome#x")).toBeNull()
  })

  it("refuses an unpublished internal path", () => {
    expect(resolveReturnTo("/studio")).toBeNull()
  })

  it("treats absent, empty and null as no preference", () => {
    expect(resolveReturnTo(null)).toBeNull()
    expect(resolveReturnTo(undefined)).toBeNull()
    expect(resolveReturnTo("")).toBeNull()
  })
})
