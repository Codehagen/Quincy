import { readFileSync } from "node:fs"
import { join } from "node:path"

import { describe, expect, it } from "vitest"

import { cn } from "./utils"

/** Every `--text-<role>:` the theme defines, without the sub-properties. */
function themeTextRoles(): string[] {
  const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8")
  const roles = new Set<string>()
  for (const match of css.matchAll(/--text-([a-z0-9-]+):/g)) {
    if (!match[1].includes("--")) roles.add(match[1])
  }
  return [...roles]
}

describe("cn keeps a role size next to a colour", () => {
  it("knows every text role in the theme", () => {
    const roles = themeTextRoles()
    expect(roles.length).toBeGreaterThan(10)
    for (const role of roles) {
      // A size followed by a kit colour: both must survive.
      expect(cn(`text-${role}`, "text-kit-ink-muted"), role).toBe(
        `text-${role} text-kit-ink-muted`
      )
    }
  })

  it("still lets a later size replace an earlier one", () => {
    expect(cn("text-kit-body", "text-kit-small")).toBe("text-kit-small")
  })
})
