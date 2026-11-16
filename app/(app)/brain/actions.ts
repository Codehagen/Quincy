"use server"

import { revalidatePath } from "next/cache"

import { getSession } from "@/lib/session"
import { applyCorrection, BrainInvariantError, putPage } from "@/lib/brain"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { resolveTimeZone } from "@/lib/timezone"
import { previewVoice, type PreviewResult } from "@/lib/voice-preview"
import { proposeStrategy, saveStrategy, strategyNotice } from "@/lib/strategy"
import type { Strategy } from "@/lib/strategy-format"
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
    return {
      ok: false,
      error: "Could not save. The change is still on screen.",
    }
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
    return {
      ok: false,
      error: "Could not save. The change is still on screen.",
    }
  }
}

/**
 * "Show the difference": the voice page's demonstration of itself.
 *
 * The money order from lib/adapt-draft.ts and `adaptPost`, unchanged, because
 * this is a button a person presses that spends: session, then entitlement,
 * then spend, then a result object rather than a throw. The ceiling, the
 * cooldown and the `usage_event` row all live in lib/voice-preview.ts — this
 * is the door, not the guard.
 *
 * No `revalidatePath`. The comparison is never persisted, so there is nothing
 * on the server for a refresh to find.
 */
export async function showTheDifference(channel = "x"): Promise<PreviewResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, reason: "failed", message: "Not signed in." }
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      reason: "failed",
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  return previewVoice({
    userId: session.user.id,
    channel,
    // The cooldown is reported as a clock time, and a clock time in the wrong
    // zone is worse than no time at all.
    timezone: resolveTimeZone(session.user.timezone),
  })
}

/**
 * "Propose from my posts": the first strategy an account has ever had.
 *
 * Same money order as `showTheDifference` above and as `adaptPost` before it —
 * session, entitlement, then the library, which owns the cooldown, the input
 * ceiling and the `usage_event` row. This is the door, not the guard.
 *
 * `revalidatePath` because the page *is* persisted: `/channels/[platform]`
 * renders the same row from the server and would otherwise go on saying there
 * is no strategy. The client invalidates its own cache separately, which is
 * what moves the tree without a reload.
 *
 * The cooldown notice is computed here rather than on the client: it is a
 * clock time, and a clock time in the wrong zone is worse than no time at all.
 */
export async function proposeStrategyAction(
  channel: string
): Promise<
  | { ok: true; slug: string; notice: string | null }
  | { ok: false; error: string }
> {
  const session = await getSession()
  if (!session) return { ok: false, error: "Not signed in." }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      error:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const result = await proposeStrategy(session.user.id, channel)
  if (!result.ok) return { ok: false, error: result.message }

  revalidatePath("/brain")
  revalidatePath(`/channels/${channel}`)

  return {
    ok: true,
    slug: result.slug,
    notice: await strategyNotice(session.user.id, session.user.timezone),
  }
}

/**
 * An edit to a strategy page.
 *
 * Separate from `savePage` because a strategy has arithmetic in it: the
 * weights are balanced on the way in rather than refused, so a split typed as
 * 30/30/30 is saved as one. `putPage`'s invariant still runs behind it and
 * still rejects anything that gets past.
 */
export async function saveStrategyPage(
  channel: string,
  strategy: Strategy
): Promise<SaveResult> {
  try {
    const userId = await requireUser()
    await saveStrategy(userId, channel, strategy)
    revalidatePath("/brain")
    revalidatePath(`/channels/${channel}`)
    return { ok: true }
  } catch (cause) {
    if (cause instanceof BrainInvariantError) {
      return { ok: false, error: cause.message }
    }
    console.error("[brain] strategy save failed:", cause)
    return {
      ok: false,
      error: "Could not save. The change is still on screen.",
    }
  }
}
