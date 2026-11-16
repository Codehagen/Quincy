import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { ADAPT_SPEND } from "./adapt"
import { renderBrainForUser } from "./brain"
import { db } from "./db"
import {
  revisedMessage,
  toDraftVersionRef,
  type DraftArtifactResult,
} from "./draft-artifact"
import { recentlyWritten } from "./drafts"
import {
  DRAFTING_MODEL,
  generateDraft,
  type DraftTarget,
} from "./drafting"
import { isEntitled, resolveEntitlementForRequest } from "./entitlement"
import { CHANNEL_RULES, measurePost } from "./post-length"
import { nextFreeSlot, type ApprovalPlacement } from "./scheduling"
import { draft, draftVersion, scheduledPost } from "./schema-app"
import { formatSlotTime } from "./slots"
import { GenerationFailed, hasSpend } from "./structured-output"
import { resolveTimeZone } from "./timezone"
import { recordUsage, spendCooldown } from "./usage"
import type { RuleOffer } from "./edit-classes"
import { noteApprovalEdit } from "./voice"
import { voiceExamples } from "./voice"

/**
 * Writes against an existing draft version, named by user id.
 *
 * Save is not a model call. Revise is, so it carries the same entitlement,
 * cooldown and spend gates as `draftAngleFor`. Approve is the human click
 * Studio and /drafts share — still not a chat tool.
 */

export type SaveVersionResult =
  | { ok: true; updatedAt: string; body: string }
  | { ok: false; message: string }

export type ApprovalPreview =
  | {
      ok: true
      timezone: string
      goingOut: string
      beyondThisWeek: boolean
    }
  | {
      ok: true
      timezone: string
      reason: "no-slot" | "slots-full"
    }
  | { ok: false; message: string }

function refresh(path: string) {
  try {
    revalidatePath(path)
  } catch {
    // Verify scripts call these writes outside a Next request.
  }
}

async function ownedVersion(userId: string, versionId: string) {
  const [row] = await db
    .select({
      id: draftVersion.id,
      draftId: draftVersion.draftId,
      channel: draftVersion.channel,
      label: draftVersion.label,
      body: draftVersion.body,
      state: draftVersion.state,
      updatedAt: draftVersion.updatedAt,
      idea: draft.idea,
      riffHook: draft.riffHook,
    })
    .from(draftVersion)
    .innerJoin(draft, eq(draftVersion.draftId, draft.id))
    .where(and(eq(draftVersion.id, versionId), eq(draft.userId, userId)))
    .limit(1)

  return row ?? null
}

export async function saveVersionBodyFor(
  userId: string,
  versionId: string,
  body: string
): Promise<SaveVersionResult> {
  const row = await ownedVersion(userId, versionId)
  if (!row) return { ok: false, message: "No such version." }
  if (row.state === "approved") {
    return { ok: false, message: "That version is already approved." }
  }

  const now = new Date()
  await db
    .update(draftVersion)
    .set({ body, updatedAt: now })
    .where(eq(draftVersion.id, versionId))

  refresh("/drafts")
  return { ok: true, updatedAt: now.toISOString(), body }
}

export async function reviseVersionFor(
  userId: string,
  versionId: string,
  instruction: string,
  expectedUpdatedAt?: string
): Promise<DraftArtifactResult> {
  const trimmed = instruction.trim()
  if (!trimmed) {
    return { ok: false, message: "Say what to change." }
  }

  const row = await ownedVersion(userId, versionId)
  if (!row) return { ok: false, message: "No such version." }
  if (row.state === "approved") {
    return {
      ok: false,
      message: "That version is already approved. Reopen it on /drafts first.",
    }
  }

  if (expectedUpdatedAt) {
    const expected = Date.parse(expectedUpdatedAt)
    if (
      Number.isFinite(expected) &&
      row.updatedAt.getTime() !== expected
    ) {
      return {
        ok: false,
        message:
          "That version has changed since this card was written. Use the current one.",
      }
    }
  }

  const cooldown = await spendCooldown(userId, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const entitlement = await resolveEntitlementForRequest({ id: userId })
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const rules = CHANNEL_RULES[row.channel] ?? {
    limit: null,
    fold: null,
    urlCost: null,
  }
  const target: DraftTarget = {
    id: row.channel,
    label: row.label,
    rules,
  }

  const meter = async (usage: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
  }) => {
    try {
      await recordUsage({
        userId,
        model: DRAFTING_MODEL,
        conversationId: ADAPT_SPEND,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      })
    } catch (cause) {
      console.error("[revise] could not record usage:", cause)
    }
  }

  const [brain, examples, recent] = await Promise.all([
    renderBrainForUser(userId, { stories: "full" }),
    voiceExamples({
      userId,
      about: `${row.idea} ${trimmed}`,
    }).catch((cause) => {
      console.error("[revise] could not read voice examples:", cause)
      return [] as string[]
    }),
    recentlyWritten(userId).catch((cause) => {
      console.error("[revise] could not read recent drafts:", cause)
      return [] as string[]
    }),
  ])

  let nextBody = row.body
  try {
    const generation = await generateDraft({
      hook: row.riffHook || row.idea,
      shape: "Short post",
      scrapOrIdea: row.body,
      sourceLabel: "Revision",
      about: `Revise this ${row.label} draft. Instruction: ${trimmed}\nKeep facts already in the draft. Do not add facts. Return only the revised ${row.label} body.`,
      channels: [target],
      brain,
      recent,
      examples,
    })
    if (generation.usage) await meter(generation.usage)
    const generated = Array.isArray(generation.versions)
      ? generation.versions.find((v) => v.channel === row.channel)?.body
      : undefined
    if (!generated?.trim()) {
      return {
        ok: false,
        message: "Quincy could not rewrite that version this time.",
      }
    }
    nextBody = generated
  } catch (cause) {
    console.error("[revise] generation failed:", cause)
    if (cause instanceof GenerationFailed && hasSpend(cause.usage)) {
      await meter(cause.usage)
    }
    return {
      ok: false,
      message: "Quincy could not rewrite that version this time.",
    }
  }

  const now = new Date()
  const updated = await db
    .update(draftVersion)
    .set({ body: nextBody, updatedAt: now })
    .where(
      and(
        eq(draftVersion.id, versionId),
        eq(draftVersion.updatedAt, row.updatedAt)
      )
    )
    .returning({
      id: draftVersion.id,
      channel: draftVersion.channel,
      label: draftVersion.label,
      body: draftVersion.body,
      state: draftVersion.state,
      updatedAt: draftVersion.updatedAt,
    })

  if (updated.length === 0) {
    return {
      ok: false,
      message:
        "That version has changed since this card was written. Use the current one.",
    }
  }

  const version = toDraftVersionRef(updated[0])
  const { over } = measurePost(version.body, version.channel)

  refresh("/drafts")

  return {
    ok: true,
    message: revisedMessage({
      label: version.label,
      overLimit: over > 0,
    }),
    pieceId: row.draftId,
    versions: [version],
    existing: false,
    fellBack: [],
    overLimit: over > 0 ? [version.channel] : [],
  }
}

export async function readVersionFor(
  userId: string,
  versionId: string
): Promise<
  | {
      ok: true
      body: string
      state: "writing" | "approved"
      updatedAt: string
    }
  | { ok: false; message: string }
> {
  const row = await ownedVersion(userId, versionId)
  if (!row) return { ok: false, message: "No such version." }
  return {
    ok: true,
    body: row.body,
    state: row.state === "approved" ? "approved" : "writing",
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function previewApprovalFor(
  userId: string,
  versionId: string,
  timezone?: string | null
): Promise<ApprovalPreview> {
  const row = await ownedVersion(userId, versionId)
  if (!row) return { ok: false, message: "No such version." }

  const zone = resolveTimeZone(timezone)
  const placement = await nextFreeSlot({
    userId,
    channel: row.channel,
    timezone,
  })

  if (!placement.ok) {
    return { ok: true, timezone: zone, reason: placement.reason }
  }

  return {
    ok: true,
    timezone: zone,
    goingOut: formatSlotTime(placement.at, zone, new Date()),
    beyondThisWeek: placement.beyondThisWeek,
  }
}

export async function approveVersionFor(
  userId: string,
  versionId: string,
  body: string,
  options: {
    timezone?: string | null
    expectedUpdatedAt?: string
  } = {}
): Promise<ApprovalPlacement & { ruleOffer?: RuleOffer }> {
  const row = await ownedVersion(userId, versionId)
  if (!row) throw new Error("No such version")

  if (options.expectedUpdatedAt) {
    const expected = Date.parse(options.expectedUpdatedAt)
    if (Number.isFinite(expected) && row.updatedAt.getTime() !== expected) {
      throw new Error(
        "That version has changed since this card was written. Use the current one."
      )
    }
  }

  const drafted = row.body

  await db
    .update(draftVersion)
    .set({
      state: "approved",
      body,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(draftVersion.id, versionId))

  let ruleOffer: RuleOffer | undefined
  try {
    ruleOffer = (await noteApprovalEdit({
      userId,
      channel: row.channel,
      before: drafted,
      after: body,
    })) ?? undefined
  } catch (cause) {
    console.error("[drafts] could not classify the edit:", cause)
  }

  const placement = await nextFreeSlot({
    userId,
    channel: row.channel,
    timezone: options.timezone,
  })

  if (placement.ok) {
    await db
      .insert(scheduledPost)
      .values({
        id: `sch_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        userId,
        draftVersionId: versionId,
        slotId: placement.slotId,
        scheduledFor: placement.at,
      })
      .onConflictDoNothing()
  }

  refresh("/drafts")
  refresh("/lineup")

  return {
    ...(placement.ok
      ? {
          scheduled: true as const,
          at: placement.at,
          beyondThisWeek: placement.beyondThisWeek,
        }
      : { scheduled: false as const, reason: placement.reason }),
    ...(ruleOffer ? { ruleOffer } : {}),
  }
}
