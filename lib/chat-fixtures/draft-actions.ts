import type { StudioDraftActions } from "../studio-draft-actions"

/**
 * The draft card's actions, in memory: Approve places the version in a slot
 * a day ahead, Undo reopens it, Save keeps the words. For the scripted
 * transport, the kit lab and tests. Nothing reaches the database.
 *
 * `latency` makes the pending labels observable; 0 in tests.
 */
export function fixtureDraftActions({
  latency = 450,
  now = () => new Date(),
}: { latency?: number; now?: () => Date } = {}): StudioDraftActions {
  const rows = new Map<string, { body: string; state: "writing" | "approved"; updatedAt: string }>()
  const wait = () => new Promise<void>((resolve) => setTimeout(resolve, latency))
  const tomorrow = () => {
    const at = new Date(now())
    at.setDate(at.getDate() + 1)
    at.setHours(8, 30, 0, 0)
    return at
  }

  return {
    async read(versionId) {
      const row = rows.get(versionId)
      // A version the script made and nobody touched: no row to report.
      if (!row) return { ok: false, message: "No such version." }
      return { ok: true, ...row }
    },
    async preview() {
      return { ok: true, timezone: "Europe/Oslo", goingOut: "tomorrow at 08:30", beyondThisWeek: false }
    },
    async save(versionId, body) {
      await wait()
      const updatedAt = now().toISOString()
      rows.set(versionId, { body, state: "writing", updatedAt })
      return { ok: true, body, updatedAt }
    },
    async approve(versionId, body) {
      await wait()
      rows.set(versionId, { body, state: "approved", updatedAt: now().toISOString() })
      return { ok: true, placement: { scheduled: true, at: tomorrow(), beyondThisWeek: false } }
    },
    async reopen(versionId) {
      await wait()
      const row = rows.get(versionId)
      if (row) rows.set(versionId, { ...row, state: "writing", updatedAt: now().toISOString() })
    },
  }
}
