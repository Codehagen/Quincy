import { afterEach, describe, expect, it } from "vitest"

import { checkEnvironment, describeEnvironment } from "./env"

/**
 * The variables these tests move, restored afterwards.
 *
 * A test that leaves `DATABASE_URL` deleted would break every db-touching
 * suite that ran after it in the same process, and the failure would look
 * like a connection problem rather than like this file.
 */
const TOUCHED = [
  "DATABASE_URL",
  "BETTER_AUTH_SECRET",
  "BETTER_AUTH_URL",
  "CRON_SECRET",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
]

const original = new Map(TOUCHED.map((name) => [name, process.env[name]]))

afterEach(() => {
  for (const [name, value] of original) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
})

function set(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) {
    if (value === undefined) {
      delete process.env[name]
    } else {
      process.env[name] = value
    }
  }
}

describe("checkEnvironment", () => {
  it("reports a required variable that is absent", () => {
    set({ DATABASE_URL: undefined })

    const report = checkEnvironment()

    expect(report.missing.map((m) => m.name)).toContain("DATABASE_URL")
  })

  it("treats whitespace as absent", () => {
    set({ DATABASE_URL: "   " })

    expect(checkEnvironment().missing.map((m) => m.name)).toContain(
      "DATABASE_URL"
    )
  })

  it("says nothing is missing when the three required are set", () => {
    set({
      DATABASE_URL: "postgres://x",
      BETTER_AUTH_SECRET: "s",
      BETTER_AUTH_URL: "http://localhost:3000",
    })

    expect(checkEnvironment().missing).toEqual([])
  })

  it("switches a capability off when only half of it is configured", () => {
    set({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: undefined })

    const billing = checkEnvironment().off.find((c) => c.name === "Billing")

    expect(billing?.missing).toEqual(["STRIPE_WEBHOOK_SECRET"])
    expect(checkEnvironment().on).not.toContain("Billing")
  })

  it("counts a capability as on when every variable is present", () => {
    set({ STRIPE_SECRET_KEY: "sk_test_x", STRIPE_WEBHOOK_SECRET: "whsec_x" })

    expect(checkEnvironment().on).toContain("Billing")
  })

  /**
   * The one the report exists for. A missing CRON_SECRET is silent everywhere
   * else — the routes answer 503 to a scheduler that treats it as a response —
   * so the boot line has to name the consequence, not the variable.
   */
  it("names what stops when CRON_SECRET is absent", () => {
    set({ CRON_SECRET: undefined })

    const scheduled = checkEnvironment().off.find(
      (c) => c.name === "Scheduled work"
    )

    expect(scheduled?.without).toMatch(/nothing publishes/)
  })
})

describe("describeEnvironment", () => {
  it("marks a missing required variable differently from a switched-off capability", () => {
    set({ DATABASE_URL: undefined, CRON_SECRET: undefined })

    const lines = describeEnvironment(checkEnvironment())

    expect(lines.some((l) => l.includes("MISSING") && l.includes("DATABASE_URL"))).toBe(true)
    expect(lines.some((l) => l.includes("off") && l.includes("Scheduled work"))).toBe(true)
  })

  it("says why a required variable is required", () => {
    set({ BETTER_AUTH_SECRET: undefined })

    const line = describeEnvironment(checkEnvironment()).find((l) =>
      l.includes("BETTER_AUTH_SECRET")
    )

    // The rotation hazard is the fact worth carrying to whoever reads the log.
    expect(line).toMatch(/invalidates every X and LinkedIn grant/)
  })
})
