import { PgDialect } from "drizzle-orm/pg-core"
import type { SQL } from "drizzle-orm"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { ATTEMPT_ONLY_LABELS, isAttemptOnly } from "./usage-attempts"

/**
 * The editor's start-of-run attempt rows feed the cooldowns and nothing a
 * person reads: /credits neither lists them nor counts them as turns.
 */

const captured = vi.hoisted(() => ({ where: [] as unknown[], selects: [] as unknown[] }))

vi.mock("./db", () => {
  const chain = {
    from: () => chain,
    where: (clause: unknown) => {
      captured.where.push(clause)
      return chain
    },
    orderBy: () => chain,
    limit: () => Promise.resolve([]),
    then: (resolve: (rows: unknown[]) => void) => resolve([]),
  }
  return {
    db: {
      select: (fields: unknown) => {
        captured.selects.push(fields)
        return chain
      },
    },
  }
})

const { recentUsage, summariseUsage } = await import("./usage")

const dialect = new PgDialect()
const render = (clause: unknown) => dialect.sqlToQuery(clause as SQL)

beforeEach(() => {
  captured.where.length = 0
  captured.selects.length = 0
})

describe("attempt-only labels", () => {
  it("names the editor's two start-of-run rows and not the ingest", () => {
    expect(isAttemptOnly("editor:agent")).toBe(true)
    expect(isAttemptOnly("editor:three-cuts")).toBe(true)
    // The ingest's row is the only record of the ingest, so it stays.
    expect(isAttemptOnly("cuts:ingest")).toBe(false)
    expect(isAttemptOnly("anthropic/claude-sonnet-5")).toBe(false)
  })

  it("leaves them out of the recent list on /credits", async () => {
    await recentUsage("u-1")
    const { sql, params } = render(captured.where[0])
    expect(sql).toMatch(/not in/)
    expect(params).toEqual(expect.arrayContaining([...ATTEMPT_ONLY_LABELS]))
  })

  it("does not count them as turns", async () => {
    await summariseUsage("u-1", new Date(0))
    const fields = captured.selects[0] as { turns: SQL; costMicros: SQL }
    const turns = render(fields.turns)
    expect(turns.sql).toMatch(/filter \(where .*not in/)
    expect(turns.params).toEqual(expect.arrayContaining([...ATTEMPT_ONLY_LABELS]))
    // Cost is every row's: attempt rows cost nothing, and a ceiling that
    // skipped rows would be the wrong way to be wrong.
    expect(render(fields.costMicros).sql).not.toMatch(/not in/)
  })
})
