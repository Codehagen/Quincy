"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { draftFromAngle, type DraftAngleResult } from "@/lib/angle-draft"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { listConnections } from "@/lib/channels"
import { renderBrainForUser } from "@/lib/brain"
import {
  ADAPT_MODEL,
  ADAPT_SPEND,
  asAngleKind,
  generateChannelAngle,
  generateSteeredAngle,
  parseSourceInput,
} from "@/lib/adapt"
import {
  channelGaps,
  CHANNEL_LABELS,
  MAX_TRANSCRIPT_CHARS,
  createRiffFromPost,
  createRiffFromSaid,
  getOwnedAngle,
  getOwnedRiff,
  newAngleId,
  shapesForChannel,
  shapesForChannels,
  type Riff,
} from "@/lib/riffs"
import { getSession } from "@/lib/session"
import { riff, riffAngle } from "@/lib/schema-app"
import { recordUsage, spendCooldown } from "@/lib/usage"

/**
 * Turn an angle into a draft, written in the user's voice.
 *
 * The work is in lib/angle-draft.ts. What stays here is the half a server
 * action owns and a cron must not have: the session, the entitlement gate, and
 * the two paths that have to be revalidated because a person is looking at
 * them. See the header there for why the split exists — Week Plan and Ship Log
 * write drafts with no cookie to read, and a second writer of `draft` rows was
 * the alternative.
 */
export async function draftAngle(input: {
  /** The `riff_angle` row id. Everything else is read from the database. */
  angleId: string
}): Promise<DraftAngleResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, reason: "auth", message: "Not signed in." }
  }

  /**
   * The cooldown, which this action went without for longer than it should
   * have. AGENTS.md, "Money": a ceiling and a cooldown, not either.
   *
   * `MCP_DRAFTS_PER_DAY` is the ceiling and it is a day wide, so between here
   * and there sat twenty presses at whatever rate a script could manage — and
   * `draft_angle` is the most expensive call in the product. The idempotency
   * guard inside `draftFromAngle` does not close it either: it refuses a second
   * draft of the *same* angle, and an agent asked to "draft everything waiting"
   * sends a different angle id every time.
   *
   * Same tag and same fifteen seconds as the three adapt buttons, because they
   * spend from one wallet and a rate limit split per button is one a caller
   * gets around by alternating. The spend below is tagged `ADAPT_SPEND` too —
   * a cooldown that reads a tag nothing writes never fires.
   */
  const cooldown = await spendCooldown(session.user.id, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      reason: "cooldown",
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const result = await draftFromAngle({
    userId: session.user.id,
    angleId: input.angleId,
    spendTag: ADAPT_SPEND,
    /**
     * Called immediately before the spend, which is where it was.
     *
     * `resolveEntitlementForRequest` rather than the pure resolver, because
     * this is a request and a trial may start on it. The order the checks run
     * in is lib/angle-draft.ts's, unchanged: ownership and "nothing you have
     * connected takes this shape" both answer before anybody is told their
     * free day is over.
     */
    gate: async () => {
      const entitlement = await resolveEntitlementForRequest(session.user)
      if (isEntitled(entitlement)) return { ok: true }

      return {
        ok: false,
        message:
          entitlement.state === "lapsed"
            ? "Your subscription is no longer active."
            : "Your free day is over.",
      }
    },
  })

  // Only when something was actually written. The `existing` path returns a
  // draft that was already there and already rendered, and revalidating for it
  // would throw two caches away to show the same rows again.
  if (result.ok && !result.existing) {
    revalidatePath("/riffs")
    revalidatePath("/drafts")
  }

  return result
}

/**
 * "Nothing here goes to LinkedIn — make me one."
 *
 * Decided from /prototypes/riffs on 2026-08-08 (Shipped / Channels / Faults).
 * `CHANNELS_FOR_SHAPE` has known which shape lands where since it was written
 * and nothing ever showed it, so a riff could produce three good angles, none
 * of which could reach X, and the page had no way to say so and no way for the
 * user to ask. This is `Steer` made concrete: same idea — tell Quincy it read
 * the material wrong — but one tap instead of guessing the phrasing.
 *
 * **Coming back empty is a success, not an error.** The material may genuinely
 * not carry a second post, and a model asked for a LinkedIn angle will always
 * invent one rather than refuse — see `CHANNEL_RULES` in lib/adapt.ts. So
 * `found: false` is an `ok: true` outcome and the card says "Quincy could not
 * find one" rather than showing a failure. The alternative is the user drafting
 * a reworded duplicate of an angle they already have and publishing the same
 * post to two platforms.
 *
 * Money patterns are plan 012's, in that order: session, ownership,
 * entitlement, *then* spend, and a result object rather than a throw once
 * anything has been spent.
 */
export type AskChannelAngleResult =
  | { ok: true; found: true; angleId: string; hook: string }
  | { ok: true; found: false }
  | { ok: false; message: string }

export async function askForChannelAngle(input: {
  /** The riff to find another angle in. Everything else is read server-side. */
  riffId: string
  /** The channel to fill, by id: "x", "linkedin". */
  channel: string
}): Promise<AskChannelAngleResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  const owned = await getOwnedRiff(session.user.id, input.riffId)
  if (!owned) {
    return { ok: false, message: "No such riff." }
  }

  /**
   * The connection has to be real, and it is checked here rather than trusted
   * from the button.
   *
   * The client sends a channel id, and without this a caller could ask for an
   * angle aimed at a platform this account has never connected — spending a
   * model call on a gap that does not exist. It also decides the label the
   * prompt is given, so the name in the prompt is the one the platform is
   * actually called rather than whatever arrived in the request.
   */
  const connections = await listConnections(session.user.id)
  const connection = connections.find(
    (c) => c.channel === input.channel && c.state === "active"
  )
  if (!connection) {
    return { ok: false, message: "That channel is not connected." }
  }

  const channel = CHANNEL_LABELS[input.channel] ?? {
    id: input.channel,
    label: input.channel,
  }

  /**
   * Re-check the gap against the database before spending anything.
   *
   * The client already hides the button once a channel is covered, which is
   * not a guard — two clicks landing before the first returns would buy two
   * angles for the same gap. Answering `found: false` here costs nothing and
   * closes that window, and it is the same instinct as `getOwnedAngle`: the
   * browser saying a gap exists is not a reason to believe one does.
   */
  const gaps = channelGaps(
    { state: owned.state as Riff["state"], angles: owned.angles },
    [channel]
  )
  if (gaps.length === 0) {
    return { ok: true, found: false }
  }

  /**
   * A channel no shape can reach cannot be filled, so do not pay to find out.
   *
   * `shapes` is what the prompt offers and what the result is filtered against,
   * so an empty list means the generation is guaranteed to return nothing —
   * a model call whose only possible outcome is `found: false`. Unreachable
   * today, because `CONNECTABLE_CHANNELS` is x and linkedin and both are in
   * `CHANNELS_FOR_SHAPE`. It becomes reachable the moment somebody adds a
   * channel to one list and not the other, and the failure is silent: money
   * spent, nothing returned, nobody told.
   */
  const shapes = shapesForChannel(channel.id)
  if (shapes.length === 0) {
    return { ok: true, found: false }
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

  // Shared across the whole adapt-model family, `draftAngle` included since it
  // started tagging its own spend with `ADAPT_SPEND`. A press on any of them
  // holds the rest for 15s. Acceptable, and intended: they spend from the same
  // budget, and this is the "found nothing" gap this cooldown exists to close.
  const cooldown = await spendCooldown(session.user.id, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const brain = await renderBrainForUser(session.user.id)

  let generation
  try {
    generation = await generateChannelAngle({
      scrap: owned.scrap,
      existing: owned.angles.map((a) => a.hook),
      channelLabel: channel.label,
      shapes,
      brain,
    })
  } catch (cause) {
    console.error("[riffs] channel angle generation failed:", cause)
    return { ok: false, message: "Quincy could not read that one. Try again." }
  }

  // Metered before the result is judged, and before the early return below:
  // the call ran and the gateway charged for it whether or not it came back
  // with an angle. A refusal that meters as free is the same class of silently
  // wrong number as the transcription that metered as zero.
  if (generation.usage) {
    try {
      await recordUsage({
        userId: session.user.id,
        model: ADAPT_MODEL,
        // Same tag as `createRiffFromPost`, because the two share one
        // cooldown — see ADAPT_SPEND. A spend that is rate-limited together
        // has to be counted together.
        conversationId: ADAPT_SPEND,
        inputTokens: generation.usage.inputTokens,
        cachedInputTokens: generation.usage.cachedInputTokens,
        outputTokens: generation.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[riffs] could not record usage:", cause)
    }
  }

  const [angle] = generation.angles
  if (!angle) {
    return { ok: true, found: false }
  }

  const id = newAngleId()

  await db.insert(riffAngle).values({
    id,
    riffId: owned.id,
    // Trimmed, matching `createRiffFromPost`. Model output routinely carries
    // leading or trailing whitespace, and an untrimmed hook is one that renders
    // with a stray space at the front of a card and gets copied into a post.
    hook: angle.hook.trim(),
    shape: angle.shape,
    /**
     * Missing until 2026-08-23, so every channel angle stored `""` and its
     * card read "Short post" where the others read "Announcement · Short
     * post". `asAngleKind`'s own comment says the guard belongs on every
     * `riff_angle` insert because a caller can inject a generator; this was
     * the one insert that had neither the guard nor the column.
     */
    kind: asAngleKind(angle.kind),
    why: (angle.why ?? "").trim(),
    // Last, so an angle you asked for lands under the ones you were given
    // rather than jumping the queue you were already reading.
    position: owned.angles.length,
  })

  revalidatePath("/riffs")

  return { ok: true, found: true, angleId: id, hook: angle.hook }
}

/**
 * "None of these is the post I meant — here is what I want."
 *
 * The free-text twin of `askForChannelAngle`, and the other half of a control
 * the product decided on and never finished. `Steer` in
 * components/riffs/riff-parts.tsx has rendered a labelled field and an Ask
 * button since /riffs shipped, with `onSubmit={(e) => e.preventDefault()}` as
 * the entire handler — `name="steer"` appeared exactly once in the codebase
 * and nothing read it. `app/(app)/drafts/page.tsx` states the rule the form
 * was drawn for: steering belongs upstream on /riffs, because Riffs is where
 * you judge and Drafts is where you write.
 *
 * Why it is worth the model call, when a riff already comes with several
 * angles: the alternative is take one or discard the riff. On a merge that
 * carried four angles on 2026-08-23, the strongest one for this user's voice —
 * "28 assertions, a green production build, zero lint warnings, and 214
 * passing tests" — sat beside the one they pressed, and there was no way to
 * say "more like the numbers" short of throwing the riff away and starting
 * again.
 *
 * **Coming back empty is a success, not an error**, and the argument is
 * stronger here than on the channel path. There the model invents a duplicate
 * to fill a gap; here it invents one to please the person who asked, whose
 * note it will read as a commission. See `STEER_ANGLE_RULES`. An angle you
 * requested is the one you are least likely to check.
 *
 * Money patterns are plan 012's, in the order `askForChannelAngle` uses:
 * session, ownership, the free refusals, entitlement, *then* spend.
 */
export type AskAngleResult =
  | { ok: true; found: true; angleId: string; hook: string }
  | { ok: true; found: false }
  | { ok: false; message: string }

/** Long enough to be a direction, short enough that nobody is drafting in it.
 *  The field is one line and this is the sentence it can hold; anything past
 *  it is somebody using the steer as an editor, which is the thing /riffs
 *  exists to keep out. */
const MAX_STEER_CHARS = 280

export async function askForAngle(input: {
  /** The riff to find another angle in. Everything else is read server-side. */
  riffId: string
  /** What the user typed. */
  note: string
}): Promise<AskAngleResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, message: "Not signed in." }
  }

  /**
   * A blank steer is not a cheap version of "surprise me".
   *
   * Without the note the prompt has no question in it — the model would be
   * asked to find "one more angle following the user's note" with no note,
   * and would answer by rewording an angle already on the card. Refused here
   * rather than defaulted, and before anything is spent.
   */
  const note = input.note.trim().slice(0, MAX_STEER_CHARS)
  if (!note) {
    return {
      ok: false,
      message: "Say what you want instead, and Quincy will look again.",
    }
  }

  const owned = await getOwnedRiff(session.user.id, input.riffId)
  if (!owned) {
    return { ok: false, message: "No such riff." }
  }

  /**
   * Every shape this account can publish, not one channel's worth.
   *
   * `askForChannelAngle` narrows to `shapesForChannel` because it is filling a
   * named gap. A steer names no channel, so the constraint is only the one
   * `targetsFor` will enforce later anyway: do not offer a shape this account
   * cannot draft. `shapesForChannels` widens to everything for an account with
   * nothing connected, which is the same answer `targetsFor` gives.
   */
  const connections = await listConnections(session.user.id)
  const shapes = shapesForChannels(
    connections.filter((c) => c.state === "active").map((c) => c.channel)
  )

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

  // The same 15s the rest of the adapt-model family shares — see the note on
  // `askForChannelAngle`. A steer is the press most likely to be repeated in
  // frustration, which is exactly the spend this cooldown is for.
  const cooldown = await spendCooldown(session.user.id, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const brain = await renderBrainForUser(session.user.id)

  let generation
  try {
    generation = await generateSteeredAngle({
      scrap: owned.scrap,
      existing: owned.angles.map((a) => a.hook),
      note,
      shapes,
      brain,
    })
  } catch (cause) {
    console.error("[riffs] steered angle generation failed:", cause)
    return { ok: false, message: "Quincy could not read that one. Try again." }
  }

  // Metered before the result is judged, for the reason `askForChannelAngle`
  // gives: the gateway charged for the call whether or not an angle came back.
  if (generation.usage) {
    try {
      await recordUsage({
        userId: session.user.id,
        model: ADAPT_MODEL,
        conversationId: ADAPT_SPEND,
        inputTokens: generation.usage.inputTokens,
        cachedInputTokens: generation.usage.cachedInputTokens,
        outputTokens: generation.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[riffs] could not record usage:", cause)
    }
  }

  const [angle] = generation.angles
  if (!angle) {
    return { ok: true, found: false }
  }

  const id = newAngleId()

  await db.insert(riffAngle).values({
    id,
    riffId: owned.id,
    hook: angle.hook.trim(),
    shape: angle.shape,
    kind: asAngleKind(angle.kind),
    why: (angle.why ?? "").trim(),
    // Last, so the angle you asked for lands under the ones you were given.
    position: owned.angles.length,
  })

  revalidatePath("/riffs")

  return { ok: true, found: true, angleId: id, hook: angle.hook }
}

/**
 * Paste somebody else's post; get angles you could take from it.
 *
 * The entry point that used to live on /drafts and produce finished writing.
 * plans/017 moved it here and stopped it one step earlier, for the reason
 * `createRiffFromPost` gives: going straight to a draft left no moment to
 * decide *which* idea to take, which is the whole job this page exists to do.
 *
 * Money patterns are plan 012's, in that order: session, entitlement, spend,
 * then a result object rather than a throw once anything has been spent.
 */

export type CaptureResult =
  | { ok: true; riffId: string; angles: number; groundedIn: string }
  | { ok: false; message: string }

/**
 * The user's own material, typed or pasted, turned into a riff with angles.
 *
 * **Not `adaptPostToRiff`, and the difference is the whole point.** That one
 * runs `generateAngles`, whose system prompt opens "Below is a post somebody
 * else wrote" and whose rules forbid reusing the source's numbers — correct
 * for a stranger's post, and exactly wrong for your own. Given a person's own
 * account of their own decision it has nothing to adapt, so it honestly returns
 * no angles. Measured on 2026-08-13: a nine-sentence paste with a number in it
 * came back empty twice through that path.
 *
 * This one runs `generateAnglesFromSaid` through `completeSpokenRiff`, which is
 * built for the user talking — a voice note, a passage from a meeting, and now
 * something they wrote in the chat. The numbers in it are theirs to keep.
 *
 * **No row exists until the angles do**, which is `createRiffFromSaid`'s whole
 * shape and the reason this does not call `completeSpokenRiff`. The first real
 * capture from the chat, on 2026-08-13, was killed mid-generation and left a
 * `working` row with the script in it and nothing else — the second riff on
 * that account to end up stranded. Nothing retries a chat tool, so the only
 * safe ordering is the one where a kill leaves nothing behind.
 */
export async function captureToRiff(input: {
  /** Their words, verbatim. */
  text: string
}): Promise<CaptureResult> {
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

  // The same family and the same window as the two adapt calls: all three are
  // one model call started by one press, and a person capturing twice in ten
  // seconds is a double submit rather than a second thought.
  const cooldown = await spendCooldown(session.user.id, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
    }
  }

  const text = input.text.trim()

  if (!text) {
    return { ok: false, message: "There is nothing here to capture." }
  }

  if (text.length > MAX_TRANSCRIPT_CHARS) {
    return {
      ok: false,
      message: `That is ${text.length} characters. Send at most ${MAX_TRANSCRIPT_CHARS} — the transferable idea is never in the last thousand.`,
    }
  }

  // `notes`/`Pasted`, matching what `adaptPostToRiff` writes for a paste with
  // no URL behind it. The tile says where the words came from, and these came
  // from the person.
  const result = await createRiffFromSaid({
    userId: session.user.id,
    text,
    sourceId: "notes",
    sourceLabel: "Pasted",
  })

  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  revalidatePath("/riffs")

  return {
    ok: true,
    riffId: result.riffId,
    angles: result.angles,
    groundedIn: result.groundedIn,
  }
}

export type AdaptPostResult =
  | {
      ok: true
      riffId: string
      angles: number
      /** Empty when the model found nothing of yours to lean on. */
      groundedIn: string
      existing: boolean
    }
  | { ok: false; message: string }

export async function adaptPostToRiff(input: {
  /** The post's text, or text with the link it came from. */
  text: string
  /** Your own steer. Optional and usually empty. */
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

  // Shared across the adapt-model family with `askForChannelAngle` — see the
  // comment there. A pasted post with no URL was not deduplicated at all
  // before this; the cooldown is the backstop for that gap.
  const cooldown = await spendCooldown(session.user.id, ADAPT_SPEND, 15_000)
  if (!cooldown.ready) {
    return {
      ok: false,
      message: `Give Quincy a moment — ${cooldown.secondsLeft}s before the next one.`,
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

  const result = await createRiffFromPost({
    userId: session.user.id,
    source,
    note: input.note ?? "",
    // `x` rather than a "pasted" pseudo-source: the material is an X post, and
    // SourceMark already has a brand mark for it. lib/sources.ts deliberately
    // does not list channels as sources, but the tile is about where the words
    // came from, not about a connection you configured.
    sourceId: source.url ? "x" : "notes",
    // Short, because the provenance line already carries the handle and the
    // time: "X · 2 minutes ago · @someone" rather than "A post on X · ...".
    sourceLabel: source.url ? "X" : "Pasted",
  })

  if (!result.ok) {
    return { ok: false, message: result.message }
  }

  revalidatePath("/riffs")

  return {
    ok: true,
    riffId: result.riffId,
    angles: result.angles,
    groundedIn: result.groundedIn,
    existing: result.existing,
  }
}

/**
 * Discarding, which is the other half of judging.
 *
 * **Both of these shipped as dead buttons.** The card has carried a "Discard"
 * on every angle and a "Nothing here" under the riff since /riffs was built,
 * and neither had a click handler or an action behind it — the exact thing
 * /channels and /sources exist not to ship. A triage surface where you can only
 * say yes is not a triage surface; it is a queue that grows.
 *
 * Neither spends, so neither is gated on entitlement or a cooldown. They only
 * ever remove work, and refusing to let somebody clear their own page because a
 * trial ended would be indefensible.
 */
export type DiscardResult = { ok: true } | { ok: false; message: string }

/**
 * One angle, gone.
 *
 * Deleted rather than archived, and the asymmetry with `archiveRiff` below is
 * deliberate: an angle is Quincy's suggestion about the material, not the
 * material. Losing one costs a model call to make again — `askForChannelAngle`
 * is right there — while losing a scrap costs somebody a thought they cannot
 * reproduce.
 *
 * Scoped through `getOwnedAngle` for the reason `draftAngle` gives: a row id
 * arriving from a browser proves nothing about who owns it.
 */
export async function discardAngle(input: {
  angleId: string
}): Promise<DiscardResult> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const angle = await getOwnedAngle(session.user.id, input.angleId)
  if (!angle) {
    // Already gone is the outcome the press was asking for. Saying "no such
    // angle" to somebody who double-pressed would report a failure that is
    // indistinguishable from success.
    revalidatePath("/riffs")
    return { ok: true }
  }

  await db.delete(riffAngle).where(eq(riffAngle.id, input.angleId))
  revalidatePath("/riffs")
  return { ok: true }
}

/**
 * The whole riff, off the page and still in the table.
 *
 * `archived` rather than a delete: `getRiffs` filters it out, so the card goes,
 * and the scrap survives. See `RIFF_STATES` for why those are different things.
 * That is also what makes this safe without a confirmation dialog — nothing is
 * destroyed, so there is nothing to warn about.
 */
export async function archiveRiff(input: {
  riffId: string
}): Promise<DiscardResult> {
  const session = await getSession()
  if (!session) return { ok: false, message: "Not signed in." }

  const updated = await db
    .update(riff)
    .set({ state: "archived", updatedAt: new Date() })
    .where(and(eq(riff.id, input.riffId), eq(riff.userId, session.user.id)))
    .returning({ id: riff.id })

  if (updated.length === 0) {
    return { ok: false, message: "No such riff." }
  }

  revalidatePath("/riffs")
  return { ok: true }
}
