"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/session"
import { applyCorrection, BrainInvariantError, putPage } from "@/lib/brain"
import type { BrainKind } from "@/lib/schema-app"

/**
 * The brain's write path from the browser.
 *
 * Everything routes through lib/brain.ts rather than touching the tables, so
 * the caps, the pillar-weight sum and the proof rule hold here exactly as they
 * hold for the model. The form cannot save a brain the agent would reject.
 *
 * The user id comes from the session, never from the form. A slug in a POST
 * body proves nothing about who may write to it.
 */

export type SaveResult = { ok: true } | { ok: false; error: string }

async function requireUser() {
  const session = await getSession()
  if (!session) {
    throw new Error("Not signed in.")
  }
  return session.user.id
}

export async function savePage(input: {
  slug: string
  kind: BrainKind
  title: string
  body?: string
  data?: Record<string, unknown>
}): Promise<SaveResult> {
  try {
    const userId = await requireUser()
    await putPage({ ...input, userId, provenance: "user" })
    revalidatePath("/brain")
    return { ok: true }
  } catch (cause) {
    // Invariant failures are the useful half of this: they carry a sentence
    // written for a person ("16 rules, over the 15 cap — drop one to add one").
    // Anything else is ours and should not be shown verbatim.
    if (cause instanceof BrainInvariantError) {
      return { ok: false, error: cause.message }
    }
    console.error("[brain] save failed:", cause)
    return { ok: false, error: "Could not save. The change is still on screen." }
  }
}

/**
 * Editing a compiled page is a correction, not a save. It takes the page away
 * from Heartbeat permanently — see docs/brain.md — so it goes through the
 * function that records why, rather than quietly overwriting.
 */
export async function correctPage(input: {
  slug: string
  body?: string
  data?: Record<string, unknown>
  note: string
}): Promise<SaveResult> {
  try {
    const userId = await requireUser()
    await applyCorrection({
      userId,
      slug: input.slug,
      patch: { body: input.body, data: input.data },
      note: input.note,
    })
    revalidatePath("/brain")
    return { ok: true }
  } catch (cause) {
    if (cause instanceof BrainInvariantError) {
      return { ok: false, error: cause.message }
    }
    console.error("[brain] correction failed:", cause)
    return { ok: false, error: "Could not save. The change is still on screen." }
  }
}
