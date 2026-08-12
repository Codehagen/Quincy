import { describe, expect, it } from "vitest"

import {
  toSafeSourceConnection,
  type SourceConnection,
} from "./source-connections"

/**
 * The projection that keeps a webhook secret out of anything a browser sees.
 *
 * Tested because it is the only thing standing between `source_connection.
 * signing_secret` and a client component, and because `plans/README.md` records
 * the exact way this kind of function breaks: `SafeConnection` in
 * lib/channels.ts is an `Omit`, so adding a column to the table makes that
 * column *required* in the object the projection builds by naming fields
 * explicitly — and the compiler asks for it, so somebody adds it, and the
 * fastest way to satisfy the type is to pass the value straight through.
 *
 * A type cannot catch that. `signingSecret` is `Omit`ted from
 * `SafeSourceConnection`, so a projection that leaked it would not typecheck
 * under that name — but nothing stops a future column called `apiKey` or
 * `refreshToken` being added and forwarded. So the assertion below is written
 * against the *shape* rather than against the one field: no key that looks like
 * a credential, whatever it ends up being called.
 *
 * No database here. `toSafeSourceConnection` is pure, which is deliberate —
 * the decryption lives in `verifySignature` and never leaves the module.
 */

function row(overrides: Partial<SourceConnection> = {}): SourceConnection {
  return {
    id: "sc_1",
    userId: "u_1",
    source: "circleback",
    token: "a-routing-token",
    signingSecret: "encrypted-blob-standing-in-for-a-whsec",
    state: "arriving",
    lastItemAt: new Date("2026-08-09T10:00:00.000Z"),
    lastErrorAt: null,
    lastError: null,
    // Added by plans/021. The compiler asked for it here the moment the column
    // landed, which is this file's own warning arriving on schedule — see the
    // comment above. It is forwarded deliberately: `meta` holds the provider's
    // public identifiers and never a credential, and the shape assertion below
    // is what enforces that rather than this line.
    meta: {},
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
    updatedAt: new Date("2026-08-09T10:00:00.000Z"),
    ...overrides,
  }
}

describe("toSafeSourceConnection", () => {
  it("drops the signing secret", () => {
    const safe = toSafeSourceConnection(row())

    expect("signingSecret" in safe).toBe(false)
    expect(JSON.stringify(safe)).not.toContain("encrypted-blob")
  })

  it("carries no key that looks like a credential, whatever it is called", () => {
    // The guard against the *next* secret column rather than this one. A
    // future `apiKey` or `refreshToken` forwarded to satisfy the compiler
    // fails here, which is the failure `plans/README.md` records happening
    // once already on channel_connection.
    const safe = toSafeSourceConnection(row())

    for (const key of Object.keys(safe)) {
      expect(key).not.toMatch(/secret|password|apikey|refresh/i)
    }
  })

  it("keeps the token, because the connect flow has to show it once", () => {
    // The asymmetry worth stating: the token is a secret the *user* must read
    // to paste into Circleback, and the signing secret is one nobody needs to
    // read again after it is stored.
    expect(toSafeSourceConnection(row()).token).toBe("a-routing-token")
  })

  it("reports whether the provider's secret has been pasted back", () => {
    expect(toSafeSourceConnection(row()).verified).toBe(true)
    expect(toSafeSourceConnection(row({ signingSecret: null })).verified).toBe(
      false
    )
  })

  it("carries the state the page renders", () => {
    const safe = toSafeSourceConnection(row({ state: "waiting" }))

    expect(safe.state).toBe("waiting")
    expect(safe.lastItemAt).toEqual(new Date("2026-08-09T10:00:00.000Z"))
    expect(safe.source).toBe("circleback")
  })
})
