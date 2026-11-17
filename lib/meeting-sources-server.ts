import { createFathomWebhook, deleteFathomWebhook } from "./fathom"
import { createGranolaWebhook, deleteGranolaWebhook } from "./granola"
import type { KeySource } from "./meeting-sources"

/**
 * The vendor API calls behind each key-connected meeting source, kept out of
 * lib/meeting-sources.ts so the client never bundles them. Server action only.
 * (No `server-only` import: the repo does not use that package.)
 */

export type VendorWebhook = {
  id: string
  secret: string
  /** What the connection keeps in `meta`: always the webhook id, and what the vendor said about the account. */
  meta: Record<string, unknown>
}

type CreateResult = { ok: true; value: VendorWebhook } | { ok: false; message: string }

export const KEY_SOURCE_API: Record<
  KeySource,
  {
    create(apiKey: string, url: string): Promise<CreateResult>
    remove(apiKey: string, webhookId: string): Promise<boolean>
  }
> = {
  fathom: {
    async create(apiKey, url) {
      const r = await createFathomWebhook(apiKey, url)
      if (!r.ok) return { ok: false, message: r.message }
      return { ok: true, value: { id: r.value.id, secret: r.value.secret, meta: { webhookId: r.value.id } } }
    },
    remove: (apiKey, webhookId) => deleteFathomWebhook(apiKey, webhookId),
  },
  granola: {
    async create(apiKey, url) {
      const r = await createGranolaWebhook(apiKey, url)
      if (!r.ok) return { ok: false, message: r.message }
      return {
        ok: true,
        value: {
          id: r.value.id,
          secret: r.value.secret,
          meta: { webhookId: r.value.id, accountEmail: r.value.account.email, accountName: r.value.account.name },
        },
      }
    },
    remove: (apiKey, webhookId) => deleteGranolaWebhook(apiKey, webhookId),
  },
}
