import { readdirSync, statSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import {
  ACCOUNT_NAV,
  ALL_NAV,
  CONVERSATIONS_HREF,
  NAV,
  SETUP_NAV,
  isActive,
  navItemFor,
} from "./nav"

describe("isActive", () => {
  it("keeps Studio lit inside a conversation, not on the index", () => {
    expect(isActive("/studio", "/studio")).toBe(true)
    expect(isActive("/c/abc", "/studio")).toBe(true)
    expect(isActive("/conversations", "/studio")).toBe(false)
    expect(isActive("/conversations-old", "/studio")).toBe(false)
  })

  it("matches on a path boundary, not a prefix", () => {
    expect(isActive("/rhythm", "/rhythm")).toBe(true)
    expect(isActive("/rhythm/edit", "/rhythm")).toBe(true)
    expect(isActive("/rhythm-grid", "/rhythm")).toBe(false)
  })

  it("never lights Settings and Billing together", () => {
    expect(isActive("/settings/billing", "/settings")).toBe(false)
    expect(isActive("/settings/billing", "/settings/billing")).toBe(true)
    expect(isActive("/settings", "/settings")).toBe(true)
  })
})

describe("the route model (Desk)", () => {
  it("is one flat sidebar list, Studio first, Sources last", () => {
    expect(NAV.map((i) => i.label)).toEqual([
      "Studio",
      "Ideas",
      "Drafts",
      "Lineup",
      "Numbers",
      "Sources",
    ])
  })

  it("puts setup and the account in the menu, not the sidebar", () => {
    expect(SETUP_NAV.map((i) => i.href)).toEqual(["/brain", "/channels", "/rhythm"])
    expect(ACCOUNT_NAV.map((i) => i.href)).toEqual(["/credits", "/settings/billing", "/settings"])
  })

  it("links every route once", () => {
    const hrefs = ALL_NAV.map((i) => i.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
  })

  it("gives every row an icon", () => {
    for (const item of ALL_NAV) expect(item.icon).toBeTruthy()
  })

  it("never says riff to a person", () => {
    for (const item of ALL_NAV) expect(item.label.toLowerCase()).not.toContain("riff")
    expect(ALL_NAV.find((i) => i.href === "/riffs")?.label).toBe("Ideas")
  })

  it("lights at most one row for any route", () => {
    const routes = [
      "/studio",
      "/c/x",
      "/riffs",
      "/settings",
      "/settings/billing",
      "/brain",
      "/channels/x",
      "/rhythm/abc",
    ]
    for (const route of routes) {
      expect(ALL_NAV.filter((i) => isActive(route, i.href)).length).toBe(1)
    }
  })

  it("lights nothing on the conversation index", () => {
    expect(ALL_NAV.filter((i) => isActive(CONVERSATIONS_HREF, i.href))).toEqual([])
  })

  it("names the page a route belongs to", () => {
    expect(navItemFor("/c/x")?.label).toBe("Studio")
    expect(navItemFor("/settings/billing")?.label).toBe("Billing")
    expect(navItemFor("/nowhere")).toBeUndefined()
  })
})

/**
 * Every page in app/(app) has a way in from the shell: a sidebar row, a menu
 * row, or a parent it lives under. A page added later fails here until it is
 * placed, or named below with the reason it has no row.
 */
describe("every app route is reachable", () => {
  // Not linked on purpose: /cuts is unfinished (nav.ts, plans/031).
  const UNLINKED = new Set(["/cuts"])

  function pages(dir: string, base = ""): string[] {
    const found: string[] = []
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        // A route group adds nothing to the path.
        const segment = name.startsWith("(") ? "" : `/${name}`
        found.push(...pages(full, base + segment))
      } else if (name === "page.tsx") {
        found.push(base || "/")
      }
    }
    return found
  }

  const appDir = join(__dirname, "../../../app/(app)")
  // A dynamic segment is reached through its parent page.
  const routes = pages(appDir)
    .map((route) => route.replace(/\/\[[^\]]+\].*$/, ""))
    .filter((route) => route !== "/c")

  it("finds the pages", () => {
    expect(routes).toContain("/studio")
  })

  it("links each one", () => {
    const linked = new Set([...ALL_NAV.map((i) => i.href), CONVERSATIONS_HREF])
    for (const route of new Set(routes)) {
      if (UNLINKED.has(route)) continue
      expect(linked, route).toContain(route)
    }
  })
})
