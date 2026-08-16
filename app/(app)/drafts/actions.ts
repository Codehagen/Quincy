"use server"

import { revalidatePath } from "next/cache"
import { and, eq, inArray } from "drizzle-orm"

import { parseSourceInput } from "@/lib/adapt"
import { createAdaptedDraft } from "@/lib/adapt-draft"
import { db } from "@/lib/db"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { nextFreeSlot, type ApprovalPlacement } from "@/lib/scheduling"
import { getSession } from "@/lib/session"
import { draft, draftVersion, scheduledPost } from "@/lib/schema-app"

/**
 * Mutations for /drafts.
 *
 * A version id arrives from the client and is untrusted, and `draft_version`
 * has no `user_id` of its own — ownership lives on the piece. So every write
 * below proves the chain version → draft → user before it touches anything,
 * rather than trusting that a caller checked. Denormalising a `user_id` onto
 * the version would make the check cheaper and give two rows the chance to
 * disagree about who owns the writing; the join is the safer trade.
 */

async function ownedVersion(versionId: string) {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")

  const [row] = await db
    .select({
      id: draftVersion.id,
      draftId: draftVersion.draftId,
      channel: draftVersion.channel,
      state: draftVersion.state,
    })
    .from(draftVersion)
    .innerJoin(draft, eq(draftVersion.draftId, draft.id))
    .where(
      and(eq(draftVersion.id, versionId), eq(draft.userId, session.user.id))
    )
    .limit(1)

  if (!row) throw new Error("No such version")
  return { ...row, user: session.user }
}

/**
 * Approve one version, with whatever the text says at the moment you press it,
 * and put it in the next free slot for its channel.
 *
 * The body travels with the approval rather than being saved separately,
 * because approving writing you have edited but not saved is the one way this
 * page could lie: the row would say approved and hold the text you rejected.
 *
 * **The scheduling half is not a convenience.** With lib/publish-run.ts live,
 * a `scheduled_post` row is what eventually sends, so this function is where a
 * human decision becomes a future post. It stays honest by only ever using a
 * time the person already chose: the slot is theirs, made deliberately at
 * /lineup, and this picks which occurrence of it. There is no branch that
 * invents a time — see the `no-slot` case, which writes nothing.
 *
 * Approving is still reversible. `reopenVersion` deletes the row this creates.
 */
export async function approveVersion(
  versionId: string,
  body: string
): Promise<ApprovalPlacement> {
  const version = await ownedVersion(versionId)

  await db
    .update(draftVersion)
    .set({
      state: "approved",
      body,
      approvedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(draftVersion.id, versionId))

  const placement = await nextFreeSlot({
    userId: version.user.id,
    channel: version.channel,
    timezone: version.user.timezone,
  })

  if (placement.ok) {
    await db
      .insert(scheduledPost)
      .values({
        id: `sch_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        userId: version.user.id,
        draftVersionId: versionId,
        slotId: placement.slotId,
        scheduledFor: placement.at,
      })
      /**
       * `scheduled_post_version_key` is unique on the version. Approving
       * something that is already scheduled — reopen, edit, approve again —
       * must keep the time it already has rather than throw at somebody who
       * did nothing wrong. The text is updated above either way, which is the
       * part that changed.
       */
      .onConflictDoNothing()
  }

  revalidatePath("/drafts")
  revalidatePath("/lineup")

  // Read by components/drafts/drafts-inbox.tsx so the done pane can say what
  // actually happened instead of always claiming a place in the Lineup.
  return placement.ok
    ? {
        scheduled: true,
        at: placement.at,
        beyondThisWeek: placement.beyondThisWeek,
      }
    : { scheduled: false, reason: placement.reason }
}

/**
 * Give an already-approved version a time.
 *
 * Placement happens at the moment of approval, and only then — so a version
 * approved before its channel had a slot stays approved with no time forever,
 * and adding the slot afterwards changes nothing. That is not a hypothetical:
 * it is what a real account ended up in, twice, on the day this shipped.
 *
 * The repair could have been "reopen and approve again", and that already
 * works. It routes a decision the person has made back through the state where
 * they have not made it, and it rewrites `approvedAt` — so the record would say
 * they approved it today when they approved it on Tuesday. This does the one
 * thing that is actually missing.
 *
 * Nothing about the writing changes and nothing new is approved. If the version
 * is not approved, or already has a time, this is a no-op — the caller cannot
 * use it to schedule something nobody said yes to.
 */
export async function placeApprovedVersion(
  versionId: string
): Promise<ApprovalPlacement> {
  const version = await ownedVersion(versionId)

  if (version.state !== "approved") {
    throw new Error("Only an approved version can be given a time")
  }

  const placement = await nextFreeSlot({
    userId: version.user.id,
    channel: version.channel,
    timezone: version.user.timezone,
  })

  if (placement.ok) {
    await db
      .insert(scheduledPost)
      .values({
        id: `sch_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`,
        userId: version.user.id,
        draftVersionId: versionId,
        slotId: placement.slotId,
        scheduledFor: placement.at,
      })
      // Already scheduled. Pressing this twice is not an error, and the unique
      // key on the version is what makes saying so unnecessary.
      .onConflictDoNothing()
  }

  revalidatePath("/drafts")
  revalidatePath("/lineup")

  return placement.ok
    ? {
        scheduled: true,
        at: placement.at,
        beyondThisWeek: placement.beyondThisWeek,
      }
    : { scheduled: false, reason: placement.reason }
}

/**
 * Put an approved version back in play. Its scheduled post, if any, goes.
 *
 * The comment said that before the row existed to delete. Now it has to be
 * true, and it is the half that matters: without it, Undo would return the
 * writing to Drafts and leave a queued post behind that lib/publish-run.ts
 * would happily send at 08:00 — text the person had just taken back.
 *
 * **A queued post only.** Deleting a `published` row would erase the record of
 * something that is on the internet right now, and a `sending` row is one whose
 * outcome nobody knows, which is precisely the state that must not be cleared
 * by a button. Undo reopens the writing in both cases; it does not claim to
 * reach through and unsend.
 */
export async function reopenVersion(versionId: string) {
  await ownedVersion(versionId)

  await db
    .update(draftVersion)
    .set({ state: "writing", approvedAt: null, updatedAt: new Date() })
    .where(eq(draftVersion.id, versionId))

  await db
    .delete(scheduledPost)
    .where(
      and(
        eq(scheduledPost.draftVersionId, versionId),
        inArray(scheduledPost.state, ["queued", "failed"])
      )
    )

  revalidatePath("/drafts")
  revalidatePath("/lineup")
}

/**
 * Delete a version outright.
 *
 * The one destructive action on the product, which is why it is the one with a
 * confirmation in front of it. `scheduled_post` cascades from the version, so
 * discarding something already in the Lineup takes it out of the Lineup too —
 * the alternative is a scheduled post pointing at writing that no longer
 * exists.
 *
 * A piece whose last version is discarded has nothing in it, so it goes as
 * well. The dialog says so before you commit.
 */
export async function discardVersion(versionId: string) {
  const row = await ownedVersion(versionId)

  await db.delete(draftVersion).where(eq(draftVersion.id, versionId))

  const remaining = await db
    .select({ id: draftVersion.id })
    .from(draftVersion)
    .where(eq(draftVersion.draftId, row.draftId))
    .limit(1)

  if (remaining.length === 0) {
    await db.delete(draft).where(eq(draft.id, row.draftId))
  }

  revalidatePath("/drafts")
  revalidatePath("/lineup")
}

/**
 * Paste somebody else's post; get one of yours.
 *
 * The entry point the product did not have. Until this, the only way material
 * reached `generateDraft` was an angle on a fixture riff — so a real account
 * had no way to hand Quincy anything at all. This is the smallest door that
 * changes: text in, a real draft out, with the chain visible on the card.
 *
 * What it is **not** is a restyler. See lib/adapt.ts for the argument; the
 * short version is that a post carrying a stranger's numbers under your name
 * is a claim you cannot back, and this is the one feature in the product where
 * that failure is one prompt away.
 *
 * The money patterns are plan 012's, in the order that file establishes:
 * session, then entitlement, then spend, then a result object rather than a
 * throw once anything has been spent.
 */
export type AdaptPostResult =
  | {
      ok: true
      draftId: string
      channels: string[]
      idea: string
      /** Empty when the model found nothing of the user's to lean on. */
      groundedIn: string
      overLimit: string[]
      existing: boolean
    }
  | { ok: false; message: string }

export async function adaptPost(input: {
  /** The post's text, or a URL to one. See `parseSourceInput`. */
  text: string
  /** The user's own steer. Optional and usually empty. */
  note?: string
}): Promise<AdaptPostResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  const source = parseSourceInput(input.text)

  if (!source.body) {
    return {
      ok: false,
      message: source.url
        ? "Paste the post's text rather than just the link — Quincy cannot read a post it has not been given."
        : "Paste a post first.",
    }
  }

  const result = await createAdaptedDraft({
    userId: session.user.id,
    source,
    note: input.note ?? "",
    sourceId: "pasted",
    sourceLabel: "Pasted post",
  })

  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  revalidatePath("/drafts")

  return {
    ok: true,
    draftId: result.draftId,
    channels: result.channels,
    idea: result.idea,
    groundedIn: result.groundedIn,
    overLimit: result.overLimit,
    existing: result.existing,
  }
}
