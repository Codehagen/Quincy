"use server"

import { revalidatePath } from "next/cache"
import { createIdGenerator } from "ai"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { isValidCadence, nextRunAfter } from "@/lib/rhythm-schedule"
import { runRhythmOnce } from "@/lib/rhythm-run"
import { DEFAULT_CADENCE, isRunnable, RHYTHMS } from "@/lib/rhythms"
import { rhythmSubscription } from "@/lib/schema-app"
import { getSession } from "@/lib/session"
import { resolveTimeZone } from "@/lib/timezone"

/**
 * Mutations for /rhythm. See plans/016.
 *
 * Every one of these proves three things before it writes: that there is a
 * session, that the rhythm exists in the catalogue, and that it is `isRunnable`
 * — which reads the handler registry rather than the catalogue's `available`
 * flag. A rhythm id arrives from the client and is untrusted, and switching on
 * a rhythm with no handler would create a row the dispatcher can only ever skip.
 */

const newSubscriptionId = createIdGenerator({ prefix: "rs", size: 16 })

export type RhythmActionResult =
  { ok: true; message?: string } | { ok: false; message: string }

type Session = NonNullable<Awaited<ReturnType<typeof getSession>>>

/**
 * Discriminated on `ok` rather than on the presence of `error`, so the callers
 * below narrow. An optional property is not a discriminant in TypeScript, and
 * the version of this that read `if (checked.error)` compiled to a type where
 * `session` did not exist on either branch.
 */
type Guarded =
  | { ok: false; message: string }
  | { ok: true; session: Session; rhythm: (typeof RHYTHMS)[number] }

async function guard(rhythmId: string): Promise<Guarded> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const rhythm = RHYTHMS.find((r) => r.id === rhythmId)
  if (!rhythm) return { ok: false, message: "No such rhythm." }

  if (!isRunnable(rhythm)) {
    return { ok: false, message: "That rhythm cannot run yet." }
  }

  return { ok: true, session, rhythm }
}

/**
 * Switch a rhythm on, at a time.
 *
 * Creates the row if there is none and re-enables it if there is, which is why
 * `disableRhythm` keeps the row rather than deleting it: switching off and on
 * again has to come back at the hour the user chose, not at the default.
 *
 * **The cursor is computed here, not by the dispatcher.** A row inserted
 * without one would either be immediately due or never due, depending on the
 * column's default, and both are wrong in a way that is invisible until the
 * next tick.
 */
export async function enableRhythm(input: {
  rhythmId: string
  hour?: number
  minute?: number
  weekday?: number | null
}): Promise<RhythmActionResult> {
  const checked = await guard(input.rhythmId)
  if (!checked.ok) return checked

  const { session } = checked
  const fallback = DEFAULT_CADENCE[input.rhythmId] ?? {
    hour: 9,
    minute: 0,
    weekday: null,
  }

  const cadence = {
    hour: input.hour ?? fallback.hour,
    minute: input.minute ?? fallback.minute,
    weekday: input.weekday === undefined ? fallback.weekday : input.weekday,
  }

  // Refused at the boundary rather than trusted. An hour of 25 produces an
  // instant that never matches, and the symptom is a rhythm that silently
  // never runs — a support ticket six weeks later rather than an error now.
  if (!isValidCadence(cadence)) {
    return { ok: false, message: "That is not a time." }
  }

  const zone = resolveTimeZone(session.user.timezone)
  const next = nextRunAfter(cadence, zone, new Date())

  if (!next) return { ok: false, message: "That is not a time." }

  await db
    .insert(rhythmSubscription)
    .values({
      id: newSubscriptionId(),
      userId: session.user.id,
      rhythmId: input.rhythmId,
      ...cadence,
      enabled: true,
      nextRunAt: next,
    })
    .onConflictDoUpdate({
      target: [rhythmSubscription.userId, rhythmSubscription.rhythmId],
      set: {
        ...cadence,
        enabled: true,
        nextRunAt: next,
        updatedAt: new Date(),
      },
    })

  revalidatePath("/rhythm")
  return { ok: true }
}

/**
 * Switch it off, keeping the time.
 *
 * Deleting the row would work and would also throw away the hour the user
 * chose. `runningSince` is deliberately not cleared: a run in flight owns its
 * claim and will release it, and clearing it here would let a second run start
 * beside the first.
 */
export async function disableRhythm(
  rhythmId: string
): Promise<RhythmActionResult> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  await db
    .update(rhythmSubscription)
    .set({ enabled: false, updatedAt: new Date() })
    .where(
      and(
        eq(rhythmSubscription.userId, session.user.id),
        eq(rhythmSubscription.rhythmId, rhythmId)
      )
    )

  revalidatePath("/rhythm")
  return { ok: true }
}

/** Move the time. Recomputes the cursor in the same write — see decision 3 in
 *  plans/016 for why a stale `next_run_at` is the trap here. */
export async function setRhythmTime(input: {
  rhythmId: string
  hour: number
  minute: number
  weekday: number | null
}): Promise<RhythmActionResult> {
  return enableRhythm(input)
}

/**
 * Run it now.
 *
 * A spend surface reachable by a button, so it carries the money patterns from
 * plan 012 in that order: session, entitlement, then spend, then a result
 * object rather than a throw once anything has been spent.
 *
 * The claim inside `runRhythmOnce` is what stops this racing the clock, and it
 * deliberately does not advance `next_run_at` — pressing the button must not
 * quietly cancel tomorrow's run.
 */
export async function runRhythmNow(
  rhythmId: string
): Promise<RhythmActionResult> {
  const checked = await guard(rhythmId)
  if (!checked.ok) return checked

  const { session } = checked

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

  const [subscription] = await db
    .select({ id: rhythmSubscription.id })
    .from(rhythmSubscription)
    .where(
      and(
        eq(rhythmSubscription.userId, session.user.id),
        eq(rhythmSubscription.rhythmId, rhythmId)
      )
    )
    .limit(1)

  if (!subscription) {
    return { ok: false, message: "Switch it on first." }
  }

  const result = await runRhythmOnce({
    subscriptionId: subscription.id,
    userId: session.user.id,
  })

  revalidatePath("/rhythm")
  // Drafts is where two of the three handlers leave their work, so the page
  // the user is about to look at has to be re-read rather than served stale.
  revalidatePath("/drafts")

  return result.ok
    ? { ok: true, message: result.summary }
    : { ok: false, message: result.summary }
}
