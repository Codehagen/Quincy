import { createIdGenerator } from "ai"
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm"

import {
  ADAPT_MODEL,
  ADAPT_SPEND,
  asAngleKind,
  generateAngles,
  generateAnglesFromSaid,
  type AngleGenerator,
  type SaidAngleGenerator,
  type SourcePost,
} from "./adapt"
import { renderBrainForUser } from "./brain"
import { listConnections } from "./channels"
import { db } from "./db"
import { recentKinds } from "./drafts"
import { formatConversationDate } from "./format-date"
import { draft, draftVersion, riff, riffAngle, sourceItem } from "./schema-app"
import type { ShippedOutcome } from "./shipped-outcome"
import { resolveTimeZone } from "./timezone"
import { recordUsage } from "./usage"
import { MAX_AUDIO_SECONDS } from "./voice-note"

const newRiffId = createIdGenerator({ prefix: "rif", size: 16 })

/**
 * Ids for angles added after their riff was written.
 *
 * The original angles take `${riffId}-a${position}`, which is fine for a set
 * inserted in one transaction and wrong for an append: position is not stable
 * once anything can be added or removed, so two appends could derive the same
 * id. A generated id has no such relationship to survive.
 */
export const newAngleId = createIdGenerator({ prefix: "ang", size: 16 })

/**
 * The step between raw material and a draft.
 *
 * A riff is one scrap plus the angles Quincy sees in it. It is not a post and
 * not a draft: it is where "I said something in a meeting" becomes "here are
 * three ways that could be written", and you decide which of them is worth
 * anything before a word gets committed to a platform.
 *
 * Without this step there is nothing between a chat box and a draft already
 * bound to a platform tab, so a half-formed thought is either an ephemeral
 * message or an obligation — nothing holds it in between. And inputs filed as
 * "integrations" rather than sources leave a draft unable to say where it came
 * from.
 *
 * **Provenance is the point.** Every riff names the source it came out of, and
 * `sourceId` is a real id from lib/sources.ts, so the chain
 * Sources → Riffs → Drafts is legible on screen rather than implied.
 */

/** What a riff could become. Never a finished post — a direction plus a hook. */
export type Angle = {
  id: string
  /** The opening line, which is the whole bet on any platform. */
  hook: string
  /** What it would turn into. Shape, not platform: the same angle can travel. */
  shape: "Short post" | "Thread" | "Carousel" | "Essay"
  /**
   * What the post *is* — one of `ANGLE_KINDS`, or "" when unknown.
   *
   * Not a union type, unlike `shape`. The values live in lib/adapt.ts, and
   * `riff_angle.kind` can also hold "" for every angle written before the
   * column existed, so a union here would be a claim the table cannot keep.
   */
  kind: string
  /** One line on why this angle is worth writing. Quincy's reasoning, visible. */
  why: string
  /**
   * Undefined while the angle is still a question.
   *
   * `drafted` is what "Draft this" leaves behind: the angle stops being a
   * choice and becomes a thing that exists elsewhere. It stays on the card
   * rather than vanishing, because a riff whose angles disappear one by one
   * gives you no way to see what you already decided — and deciding twice is
   * how a triage surface loses your trust.
   */
  status?: "drafted"
  /**
   * Set on a drafted angle whose draft is this hook repeated back.
   *
   * **A second field rather than a second `status` value**, and that is a
   * deliberate call about blast radius: six places count undecided angles with
   * `status !== "drafted"`, and a `"drafted-fallback"` state would quietly slip
   * past every one of them — a riff would go on advertising angles it had
   * already spent a model call on.
   *
   * Derived from the bodies on read, the same way `status` is derived from the
   * hooks, and it earns its keep by outliving the request. `draftAngle`
   * returns the same fact in its receipt, but the component holding that
   * receipt unmounts the instant `router.refresh()` lands — the angle becomes
   * decided and swaps its actions for `<Drafted />`. A client-held message for
   * this would be visible for one frame and then gone, which is exactly how a
   * hook ended up in /drafts on 2026-08-08 looking like a written post. Reading
   * it back from the row means it is still there tomorrow, and it *stops* being
   * there the moment you write over the draft yourself.
   */
  fellBack?: boolean
}

/**
 * Which channels an angle becomes when it is drafted.
 *
 * Shape, not platform — the same distinction `Angle.shape` already draws. A
 * thread is an X form; a carousel is a LinkedIn and Instagram form; an essay is
 * long-form. This is the one place the mapping lives, so changing what a
 * carousel means is one edit rather than a hunt.
 *
 * A first cut, deliberately: there is no channel connection model yet, so this
 * cannot know which of these you actually publish to. When /channels can answer
 * that, this narrows to the intersection instead of guessing.
 */
export const CHANNELS_FOR_SHAPE: Record<
  Angle["shape"],
  { id: string; label: string }[]
> = {
  "Short post": [
    { id: "x", label: "X" },
    { id: "linkedin", label: "LinkedIn" },
  ],
  Thread: [{ id: "x", label: "X" }],
  Carousel: [
    { id: "linkedin", label: "LinkedIn" },
    { id: "instagram", label: "Instagram" },
  ],
  Essay: [{ id: "substack", label: "Substack" }],
}

/**
 * The inverse: which shapes can reach a given channel.
 *
 * Derived from the table above rather than written out, so adding a channel to
 * a shape cannot leave the two disagreeing. Used when asking Quincy for an
 * angle aimed at a channel nothing on the riff currently reaches — the model is
 * told which shapes are on the table, and a shape that cannot land there is not
 * offered to it.
 */
export function shapesForChannel(channelId: string): Angle["shape"][] {
  return (Object.keys(CHANNELS_FOR_SHAPE) as Angle["shape"][]).filter((shape) =>
    CHANNELS_FOR_SHAPE[shape].some((c) => c.id === channelId)
  )
}

/**
 * Every shape that reaches at least one channel this account has connected.
 *
 * The plural of `shapesForChannel`, and the input to `describeShapes` — what
 * stops the angle generator offering a shape `targetsFor` will later refuse
 * to draft. An `Essay` angle on an account with no Substack is a card whose
 * only possible outcome is "Connect Substack to draft this one", and it was
 * about to become three times as common: giving the shape rule real criteria
 * took Essay from 8% to 23% of angles, measured 2026-08-09.
 *
 * **An empty list means every shape**, matching the widening `targetsFor`
 * makes on the same condition. A user who has connected nothing is a user we
 * know nothing about, and the answer to that is angles they might not be able
 * to draft yet — not no angles at all.
 *
 * A partial intersection still counts. `Carousel` reaches LinkedIn and
 * Instagram, so an account with only LinkedIn keeps it: `targetsFor` narrows
 * that to the one channel and drafts it there, which is a real outcome rather
 * than a dead end.
 */
export function shapesForChannels(connected: string[]): Angle["shape"][] {
  const all = Object.keys(CHANNELS_FOR_SHAPE) as Angle["shape"][]
  if (connected.length === 0) return all

  const has = new Set(connected)
  const reachable = all.filter((shape) =>
    CHANNELS_FOR_SHAPE[shape].some((c) => has.has(c.id))
  )

  // A connection set that reaches no shape at all is not a state the channel
  // table can currently produce, but returning [] here would silently widen
  // in `describeShapes` anyway. Saying so is cheaper than tracing it later.
  return reachable.length > 0 ? reachable : all
}

/**
 * `shapesForChannels` against this account's live connections.
 *
 * The read is `active`-only, the same filter `channelGaps` and `draftAngle`
 * use: a connection that has expired cannot publish, so a shape that only
 * reaches it is a shape that leads nowhere today.
 *
 * Failure widens rather than narrows. A connections read that throws must not
 * silently produce a riff with fewer shapes on it than the account can use —
 * an angle you cannot draft is a bad card, and no angle at all is a worse one.
 */
async function publishableShapes(userId: string): Promise<Angle["shape"][]> {
  try {
    const connections = await listConnections(userId)
    return shapesForChannels(
      connections.filter((c) => c.state === "active").map((c) => c.channel)
    )
  } catch (cause) {
    console.error("[riffs] could not read connections for shapes:", cause)
    return Object.keys(CHANNELS_FOR_SHAPE) as Angle["shape"][]
  }
}

/**
 * Everything the three angle generators need to know about the account.
 *
 * One function because all three asked the same two questions already and now
 * ask a third, and three copies of a growing list is three places for one of
 * them to be forgotten — which here would not throw, it would silently generate
 * angles with no variety context and look exactly like working.
 *
 * Read together rather than in series. They were already sequential awaits
 * inside an object literal, so the connections read waited on the brain render
 * for no reason; a third would have made it three round trips deep on the path
 * a user is watching a spinner on.
 *
 * `recentKinds` cannot fail the riff. It steers a tie between two honest
 * answers — the same posture `recentlyWritten` takes at the drafting call site,
 * and for the same reason: it makes the set better and it is not what makes
 * the set.
 */
async function angleContext(userId: string) {
  const [brain, shapes, kinds] = await Promise.all([
    /**
     * Stories in full, because none of the generators this feeds has tools.
     *
     * The default index form renders four story titles and then instructs the
     * model to "call the story tool" before citing anything from one — and
     * there is no such tool in a single `generateObject`. Voice, meeting and
     * shipped angles are all that shape, so the correction belongs here rather
     * than at three call sites. `generateDraft` already passes this; see the
     * note on `renderBrain` for what the index form did to it.
     */
    renderBrainForUser(userId, { stories: "full" }),
    publishableShapes(userId),
    recentKinds(userId).catch((cause) => {
      console.error("[riffs] could not read recent kinds:", cause)
      return [] as string[]
    }),
  ])

  return { brain, shapes, recentKinds: kinds }
}

/**
 * Which of the user's channels no angle on this riff reaches.
 *
 * The gap the /riffs card offers to fill. Three rules, and each of them is the
 * difference between a useful prompt and a nag:
 *
 * - **Only channels they actually publish to.** `connected` comes from
 *   `listConnections`, filtered to `active`. An account connected to nothing
 *   has no gaps and the whole feature correctly disappears — Quincy has no
 *   business suggesting Instagram to somebody who has never mentioned it.
 * - **A drafted angle covers its channels.** A draft already exists for them,
 *   so offering another is offering to write the same post twice, which is the
 *   failure the `drafted` state was introduced to prevent.
 * - **Only a `ready` riff has gaps.** One still being read has no angles yet,
 *   so every channel would look like a gap and the card would sprout offers
 *   underneath a skeleton.
 */
export function channelGaps(
  riff: Pick<Riff, "state" | "angles">,
  connected: { id: string; label: string }[]
): { id: string; label: string }[] {
  if (riff.state !== "ready" || riff.angles.length === 0) return []

  const covered = new Set(
    riff.angles.flatMap((angle) =>
      (CHANNELS_FOR_SHAPE[angle.shape] ?? []).map((c) => c.id)
    )
  )

  return connected.filter((c) => !covered.has(c.id))
}

export type Riff = {
  id: string
  /** The raw material, close to verbatim. This is what you actually said. */
  scrap: string
  /** Source id from lib/sources.ts, so the tile and the chain stay honest. */
  sourceId: string
  sourceLabel: string
  /**
   * Pre-rendered relative text rather than a Date. These strings are read on
   * the server and handed to a client card; formatting on the client from a
   * timestamp would render a different string than the server did.
   */
  capturedAt: string
  /**
   * `working` — Quincy has the scrap and has not finished reading it. Renders
   * as a skeleton rather than a spinner: the card already knows its own shape,
   * and holding that shape is what stops the list jumping when angles land.
   *
   * `failed` — it tried and could not. Added with voice (plans/018), because
   * voice is what made `working` reachable by a row nobody is watching: a
   * pasted post is written `ready` in the same transaction as its angles, so
   * until now the skeleton was a state the schema allowed and nothing
   * produced. A card that can hang forever with no terminal state is worse
   * than a wait; this is the terminal state.
   */
  state: "working" | "ready" | "failed"
  /** Why it failed, for the card to show. Empty in every other state. */
  failure: string
  /**
   * `working` for longer than `RIFF_STUCK_AFTER_MS`.
   *
   * Computed on the server against the same clock that rendered `capturedAt`,
   * for the same reason: a client deciding this from a timestamp would answer
   * differently than the server did, and the two disagreeing across a hydration
   * boundary is a rendering mismatch rather than a slow riff.
   *
   * Always false unless the state is `working` — a finished riff cannot be
   * stuck, however long it took to get there.
   */
  stuck: boolean
  /**
   * The post somebody else wrote that prompted this, when there was one.
   *
   * On the riff rather than only on the draft, and that is the point of moving
   * the paste box here: "this idea is borrowed" is a fact you need at the
   * moment of *deciding*, not after the writing already exists. Null for your
   * own material.
   */
  adaptedFrom: { url: string; handle: string } | null
  angles: Angle[]
}

/**
 * The riffs waiting on you.
 *
 * Reads the database, and nothing else. This used to return an empty list for
 * everyone outside a demo allowlist, honestly — there was no pipeline, nothing
 * read a source, and an empty list was the true answer. plans/017 gave it one:
 * pasting somebody else's post creates a riff with angles, which is the first
 * real input this page has ever had.
 *
 * The fixtures that sat behind the real rows are gone with lib/demo.ts. They
 * existed to show the built half of a page whose table did not exist yet; the
 * table exists, so the honest empty page is now also the useful one, and
 * scripts/seed-drafts.ts is how a populated account gets made.
 */
export async function getRiffs(user: {
  id: string
  email: string
  timezone?: string | null
}): Promise<Riff[]> {
  const zone = resolveTimeZone(user.timezone)
  const now = new Date()

  /**
   * Which angles have already been drafted, asked from the drafts side.
   *
   * `draft.riff_hook` records the angle a piece came from, so an angle is
   * drafted exactly when a draft carries its hook. Derived rather than stored,
   * which is why `riff_angle` has no status column — two rows able to disagree
   * about whether something was written is a worse problem than one join.
   */
  /**
   * …and which of those drafts is the hook repeated rather than a written post.
   *
   * `bool_and` over the versions, so a draft counts as fallen back only when
   * *every* channel body is the hook — a run that wrote X and lost LinkedIn is
   * a partial failure, and calling that "Quincy could not write it" would be
   * wrong in the direction that makes people ignore the message.
   *
   * `leftJoin`, not `inner`: a draft with no versions must still read as
   * drafted. Postgres skips nulls inside `bool_and` and returns null when they
   * are all it saw, which is what the `coalesce` is for — no versions means no
   * evidence of a fallback, not evidence of one.
   *
   * In one Promise.all with the riff select, because it never depended on it —
   * it is keyed on the user alone. Only the angle fetch genuinely has to wait
   * for the riff ids, so the function costs two round trips of waiting, not
   * three; RiffsRefresh re-pays this bill every four seconds while a voice
   * riff processes.
   */
  const [rows, draftedRows] = await Promise.all([
    db
      .select()
      .from(riff)
      // Archived riffs are decided, not deleted — see `RIFF_STATES`. They stay
      // in the table and leave the page.
      .where(and(eq(riff.userId, user.id), ne(riff.state, "archived")))
      .orderBy(desc(riff.createdAt)),
    db
      .select({
        riffHook: draft.riffHook,
        fellBack: sql<boolean>`coalesce(bool_and(${draftVersion.body} = ${draft.riffHook}), false)`,
      })
      .from(draft)
      .leftJoin(draftVersion, eq(draftVersion.draftId, draft.id))
      .where(eq(draft.userId, user.id))
      .groupBy(draft.riffHook),
  ])

  const angles =
    rows.length === 0
      ? []
      : await db
          .select()
          .from(riffAngle)
          .where(
            inArray(
              riffAngle.riffId,
              rows.map((r) => r.id)
            )
          )
          .orderBy(asc(riffAngle.position))

  const draftedHooks = new Map(draftedRows.map((d) => [d.riffHook, d.fellBack]))

  const real: Riff[] = rows.map((row) => ({
    id: row.id,
    scrap: row.scrap,
    sourceId: row.sourceId,
    sourceLabel: row.sourceLabel,
    // Rendered on the server, deliberately: the card is a client component and
    // formatting a timestamp there produces a different string than the server
    // did in the seconds either side of midnight.
    capturedAt: formatConversationDate(row.createdAt, zone, now),
    /**
     * Narrowed, because the query above already excluded `archived`.
     *
     * `Riff["state"]` deliberately stays the three states a card can render.
     * Widening it would push a fourth case into every consumer — the skeleton,
     * the failure card, `channelGaps` — for a value none of them can ever
     * receive, and a switch with an unreachable branch is worse documentation
     * than an assertion next to the filter that makes it true.
     */
    state: row.state as Riff["state"],
    failure: row.failure,
    stuck:
      row.state === "working" &&
      // `startedAt` is null for every riff the paste box made — those are
      // written `ready` in one transaction and never pass through `working`,
      // so a null here means "no background phase" and never "started at the
      // epoch". Falling back to createdAt would be the plausible wrong answer.
      row.startedAt !== null &&
      now.getTime() - row.startedAt.getTime() > RIFF_STUCK_AFTER_MS,
    adaptedFrom:
      row.adaptedFromUrl || row.adaptedFromHandle
        ? { url: row.adaptedFromUrl, handle: row.adaptedFromHandle }
        : null,
    angles: angles
      .filter((a) => a.riffId === row.id)
      .map((a) => ({
        id: a.id,
        hook: a.hook,
        shape: a.shape as Angle["shape"],
        kind: a.kind,
        why: a.why,
        ...(draftedHooks.has(a.hook)
          ? {
              status: "drafted" as const,
              ...(draftedHooks.get(a.hook) ? { fellBack: true } : {}),
            }
          : {}),
      })),
  }))

  return real
}

/**
 * What is still a question, which is not the same as what exists.
 *
 * A count that keeps saying seven after you have dealt with four is wrong in
 * the direction that matters — it is the number you glance at to decide whether
 * the page is worth opening.
 */
export function countOpen(riffs: Riff[]) {
  const angles = riffs.reduce(
    (n, r) => n + r.angles.filter((a) => a.status !== "drafted").length,
    0
  )
  /**
   * `failed` counts as open, like `working` does.
   *
   * It is unresolved either way — a riff that could not be read is a thing you
   * still have to decide about (record it again, or let it go), and a count
   * that skipped it would say "nothing waiting on you" while a card sat on
   * screen asking to be dealt with. `ready` is the only state whose openness
   * depends on its angles.
   */
  const open = riffs.filter((r) =>
    r.state === "ready" ? r.angles.some((a) => a.status !== "drafted") : true
  ).length

  return { riffs: open, angles }
}

/**
 * Somebody else's post becomes a riff of yours.
 *
 * The replacement for `createAdaptedDraft`'s straight-to-draft path, and the
 * reason plans/017 exists. That version went foreign post → finished writing in
 * one call, which left the user no moment to decide *which* idea to take —
 * structurally the same laundering the prompt in lib/adapt.ts spends three
 * paragraphs arguing against, moved out of the prose and into the flow.
 *
 * This stops at angles. Nothing is written until a human picks one, which is
 * what `draftAngle` is for.
 *
 * Deliberately a library function rather than server-action guts: the paste box
 * and (eventually) the Bookmarks rhythm both need it, and they disagree about
 * exactly what a server action owns — session versus cron, revalidation,
 * `resolveEntitlementForRequest` versus the pure resolver. So this owns what a
 * riff made from a foreign post *is*, and the caller owns who may ask for one.
 */
export type CreateRiffResult =
  | {
      ok: true
      riffId: string
      angles: number
      /** Empty when the model found nothing of the user's to lean on. */
      groundedIn: string
      /** True when a riff for this URL already existed and was returned. */
      existing: boolean
    }
  | {
      ok: false
      reason: "empty" | "too-long" | "model-failed"
      message: string
    }

/** The most source text one riff reads. A long-form post's transferable idea is
 *  never in its last two thousand characters. */
export const MAX_SCRAP_CHARS = 6_000

export async function createRiffFromPost({
  userId,
  source,
  note = "",
  sourceId,
  sourceLabel,
  deps = { angles: generateAngles },
}: {
  userId: string
  source: SourcePost
  note?: string
  sourceId: string
  sourceLabel: string
  deps?: { angles: AngleGenerator }
}): Promise<CreateRiffResult> {
  const scrap = source.body.trim()

  if (!scrap) {
    return { ok: false, reason: "empty", message: "There is no post here." }
  }

  if (scrap.length > MAX_SCRAP_CHARS) {
    return {
      ok: false,
      reason: "too-long",
      message: `That post is ${scrap.length} characters. Paste at most ${MAX_SCRAP_CHARS}.`,
    }
  }

  /**
   * Idempotency, keyed on the source URL.
   *
   * Real work rather than a double-click guard: the Bookmarks rhythm re-reads
   * the same bookmarks every run, and without this a bookmark already riffed on
   * would produce a new riff — and a new model call — every day until the user
   * unbookmarked it.
   *
   * A pasted post with no URL is not deduplicated. Two pastes of the same text
   * are two deliberate presses, and refusing the second would be surprising in
   * a way the bookmark case is not.
   */
  if (source.url) {
    const [existing] = await db
      .select({ id: riff.id })
      .from(riff)
      .where(and(eq(riff.userId, userId), eq(riff.adaptedFromUrl, source.url)))
      .limit(1)

    if (existing) {
      return {
        ok: true,
        riffId: existing.id,
        angles: 0,
        groundedIn: "",
        existing: true,
      }
    }
  }

  let generation: Awaited<ReturnType<AngleGenerator>>
  try {
    generation = await deps.angles({
      source: { ...source, body: scrap },
      note,
      ...(await angleContext(userId)),
    })
  } catch (cause) {
    /**
     * No fallback riff, and no fallback angle.
     *
     * `draftAngle` falls back to the hook when its model call fails, because
     * the user chose that line and it is theirs. Here the only text to fall
     * back to is the stranger's post, and writing that into an angle under the
     * user's name is precisely what this file exists to prevent.
     */
    console.error("[riffs] angle generation failed:", cause)
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not find an angle in that. Try again in a moment.",
    }
  }

  // Metered here rather than inside lib/adapt.ts: this is the layer that knows
  // the userId, matching every other model call site. The call already ran, so
  // a bookkeeping failure logs and is dropped rather than undoing work.
  if (generation.usage) {
    try {
      await recordUsage({
        userId,
        model: ADAPT_MODEL,
        // Tags the row as this feature's spend, which is what the cooldown
        // counts. See ADAPT_SPEND in lib/adapt.ts.
        conversationId: ADAPT_SPEND,
        inputTokens: generation.usage.inputTokens,
        cachedInputTokens: generation.usage.cachedInputTokens,
        outputTokens: generation.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[riffs] could not record usage:", cause)
    }
  }

  if (generation.angles.length === 0) {
    return {
      ok: false,
      reason: "model-failed",
      message: "Quincy could not find an angle you could take from that one.",
    }
  }

  const id = newRiffId()

  await db.insert(riff).values({
    id,
    userId,
    scrap,
    sourceId,
    sourceLabel,
    adaptedFromUrl: source.url,
    adaptedFromHandle: source.handle,
    // `ready` immediately: the angles are written in the same transaction, so
    // there is no window in which this card would render as a skeleton.
    state: "ready",
  })

  await db.insert(riffAngle).values(
    generation.angles.map((angle, position) => ({
      id: `${id}-a${position}`,
      riffId: id,
      hook: angle.hook.trim(),
      shape: angle.shape,
      kind: asAngleKind(angle.kind),
      why: angle.why.trim(),
      position,
    }))
  )

  return {
    ok: true,
    riffId: id,
    angles: generation.angles.length,
    groundedIn: generation.groundedIn,
    existing: false,
  }
}

/* ── Voice notes ──────────────────────────────────────────────────────────
   Something you said out loud becomes a riff. See plans/018.

   Three functions rather than one, because unlike `createRiffFromPost` this
   pipeline outlives the request that starts it. The row is written first and
   filled in later, so "the riff exists" and "the riff has angles" are separate
   facts that a crash can land between — which is the whole reason it runs on
   Workflow and the reason `failed` exists.
   ───────────────────────────────────────────────────────────────────────── */

/** The source a voice riff files under. Matches lib/sources.ts, which has
 *  listed "Voice notes" since before anything could produce one. */
export const VOICE_SOURCE = { id: "voice", label: "Voice note" } as const

/**
 * The most transcript one voice riff stores. **Not `MAX_SCRAP_CHARS`.**
 *
 * That ceiling is 6,000 and is written for a pasted post, where the argument
 * holds: "a long-form post's transferable idea is never in its last two
 * thousand characters." Speech is the opposite. A rambling note circles and
 * lands its point at the end, which is exactly what a head-truncation throws
 * away.
 *
 * And it was reached in practice, not in theory. Measured from the live
 * verification run: 128 characters of transcript for 8.1 seconds of Norwegian,
 * so ~16 chars/second, so a note at the ten-minute `MAX_AUDIO_SECONDS` ceiling
 * is ~9,500 characters. At 6,000 that silently discarded 37% of what somebody
 * said — no error, no truncation notice, just a shorter scrap and angles drawn
 * from the half of the walk they happened to say first.
 *
 * Derived from the audio ceiling rather than picked, so raising one cannot
 * quietly leave the other behind. Doubled for headroom: 16 chars/second is one
 * measurement in one language, and a faster speaker or a denser one costs a
 * few hundred tokens here rather than the end of their thought.
 */
export const MAX_TRANSCRIPT_CHARS = MAX_AUDIO_SECONDS * 32

/**
 * The row that exists before the words do.
 *
 * Written synchronously, inside the request that received the audio, and this
 * is the load-bearing part of the whole design: the card appears the moment
 * the upload lands, so somebody who recorded a thought on a walk sees Quincy
 * holding it rather than an empty page that may or may not be doing something.
 * Everything after this point can fail without losing the fact that they spoke.
 *
 * `scrap` is empty here and that is honest — nothing has been transcribed. The
 * card renders a skeleton from `state`, not from the scrap's length.
 */
export async function startVoiceRiff(userId: string): Promise<string> {
  return startSpokenRiff(userId, VOICE_SOURCE)
}

/**
 * The atomic twin of `startVoiceRiff`.
 *
 * `voiceNoteCooldown` is a read followed by an act: N concurrent POSTs can
 * all observe "no recent riff", all pass, and each buys an R2 upload, a paid
 * transcription, and model calls before any of their writes land. This is
 * the single statement that closes that gap — the check and the insert run
 * as one conditional `INSERT ... SELECT ... WHERE NOT EXISTS`, so a second
 * claim inside the same instant cannot succeed once the first has landed.
 * Postgres supplies the atomicity; this is not a lock this code takes.
 *
 * Mirrors every column `startSpokenRiff` sets for a voice riff — same
 * `scrap`, `sourceId`, `sourceLabel`, `state`, `startedAt` — so a claimed row
 * is indistinguishable from one the old path created. `createdAt` is left to
 * its column default, same as `startSpokenRiff` leaves it.
 */
export async function claimVoiceRiff(
  userId: string,
  cooldownMs: number
): Promise<{ ok: true; riffId: string } | { ok: false }> {
  const id = newRiffId()

  const claimed = await db.execute<{ id: string }>(sql`
    insert into riff (id, user_id, scrap, source_id, source_label, state, started_at)
    select ${id}, ${userId}, '', ${VOICE_SOURCE.id}, ${VOICE_SOURCE.label}, 'working', now()
    where not exists (
      select 1 from riff
      where user_id = ${userId}
        and source_id = ${VOICE_SOURCE.id}
        and created_at > now() - make_interval(secs => ${cooldownMs / 1000})
    )
    returning id
  `)

  const row = claimed.rows[0]
  if (!row) return { ok: false }
  return { ok: true, riffId: row.id }
}

/**
 * The vendor is the id; the shape is the label. See plans/019.
 *
 * `sourceLabel` renders on the card and says "Meeting" rather than
 * "Circleback", because Granola and Fathom produce exactly the same card and a
 * user with two of them connected does not want to be told which SaaS company
 * transcribed a call they were on. `sourceId` keeps the vendor, so the chain
 * stays legible in the database and on `/sources`.
 */
export const MEETING_SOURCE = { id: "circleback", label: "Meeting" } as const

export async function startMeetingRiff(userId: string): Promise<string> {
  return startSpokenRiff(userId, MEETING_SOURCE)
}

/**
 * Material somebody typed straight into Quincy. First run's last question is
 * the only caller today. See plans/022.
 *
 * **Spoken, not pasted, and the distinction is the whole reason this exists.**
 * `createRiffFromPost` was the obvious reuse and is wrong here: it is built for
 * somebody else's post, it writes `adaptedFromUrl` / `adaptedFromHandle`, and
 * `generateAngles` prompts for the angle *you* could take on a stranger's
 * writing. First run asks what *you* shipped this week. Running that through
 * the adapt path would file a person's own work as borrowed on the first card
 * they ever see, and ask a model to find their angle on themselves.
 *
 * `completeSpokenRiff` is the completion, unchanged — its `emptyMessage` is
 * already parameterised because "that recording came back empty" is a lie for
 * every caller that did not record anything.
 *
 * Empty source, like a pasted riff. There is no row in lib/sources.ts for
 * "you typed it", and inventing one would put a source on /sources that
 * nothing connects to and no rhythm reads.
 */
export const TYPED_SOURCE = { id: "", label: "" } as const

export async function startTypedRiff(userId: string): Promise<string> {
  return startSpokenRiff(userId, TYPED_SOURCE)
}

/**
 * The same rule one step further. See plans/021.
 *
 * "Pull request" rather than "GitHub", because GitLab and Bitbucket produce
 * exactly the same card — and unlike Circleback, whose vendors all describe
 * themselves as note-takers, here the shape has a name everybody already uses.
 */
export const SHIPPED_SOURCE = { id: "github", label: "Pull request" } as const

/**
 * A merge's riff id, derived rather than generated. See `startShippedRiff` for
 * why it is derived; this exists so the two places that need it — the write and
 * the read that asks whether the write happened — cannot spell it differently.
 */
export function shippedRiffId(sourceItemId: string): string {
  return `rif_gh_${sourceItemId}`
}

/**
 * A riff for a merge, created **after** the selection said there was one.
 *
 * This is where the GitHub flow deliberately diverges from voice and meetings,
 * both of which write a `working` row first and fail it if nothing comes of it.
 * The argument for doing that is a card appearing the moment somebody presses
 * stop; nobody is watching a merge, so what remains is the failure story, and
 * the failure here is the *common* case. Twenty-seven merges landed in this
 * repository in one week and most of them are not posts — a failed card for
 * each would be a nag arriving several times a day, and `DRAFTS_PER_RUN`'s
 * comment already records where that ends: "a drafting surface with a backlog
 * on it stops being read at all."
 *
 * So a merge that carries nothing leaves a `source_item` and no riff. What
 * tells the user the connection is alive is `/sources` saying material is
 * arriving, which is exactly what that state is for.
 *
 * **The id is derived from the source item, and that is the idempotency.**
 * Creating the row inside the workflow means a retried step could otherwise
 * create a second riff for one pull request — `completeSpokenRiff`'s guard
 * protects the angles, not the row above them. A deterministic primary key
 * plus `onConflictDoNothing` makes the retry re-use the row it already made,
 * the same trick `${riffId}-a${position}` plays one level down.
 */
export async function startShippedRiff(
  userId: string,
  sourceItemId: string,
  /**
   * What the writer will need and the scrap does not carry — see
   * `riff.context`. Optional so a caller with nothing to say writes `{}`
   * rather than inventing a shape, which is also what every riff created
   * before this column existed has.
   *
   * Today that is `{ forUser, beats, facts }` from the shipped workflow. The
   * signature stays `Record<string, unknown>` deliberately: every read of this
   * column narrows field by field (`readShippedFacts`, `readShippedBeats`),
   * because what a row holds is decided by the deploy that wrote it and not by
   * the type on this parameter.
   */
  context: Record<string, unknown> = {}
): Promise<string> {
  const id = shippedRiffId(sourceItemId)

  await db
    .insert(riff)
    .values({
      id,
      userId,
      scrap: "",
      sourceId: SHIPPED_SOURCE.id,
      sourceLabel: SHIPPED_SOURCE.label,
      // The kind is in `sourceId`; this is the row. Written here rather than
      // recovered later, because the workflow is the only place that still
      // knows which `source_item` this riff came out of.
      sourceItemId,
      context,
      state: "working",
      startedAt: new Date(),
    })
    .onConflictDoNothing()

  return id
}

/** The two ways a merge can carry nothing. Both are ordinary, neither is an error. */
export type ShippedRefusal = "nothing-worth-keeping" | "empty"

/** Long enough for the model's sentence, short enough not to store an essay. */
const MAX_REFUSAL_CHARS = 500

/**
 * Why a merge left no riff, written where somebody can be told.
 *
 * The counterpart to `startShippedRiff`, and the argument above is exactly why
 * it had to exist. That comment is right that a merge carrying nothing deserves
 * no card — but the verdict then lived only in a server log, and `/sources`
 * offers a button that says "the riff will be on /riffs in a moment" before the
 * selection has run. When the answer was no, the sentence stayed on screen and
 * nothing ever contradicted it. A refusal is an answer, not a silence; it just
 * does not deserve a card.
 *
 * Kept on `source_item.meta` because that row is already the thing that
 * remembers this merge was read — it is what `onConflictDoNothing` consults to
 * make a redelivery or a second press free. One merge, one row, one record of
 * what came of it.
 *
 * `||` rather than a read-modify-write, so the provider's own facts underneath
 * survive: the merge's own numbers were written by whoever stored the row and
 * must not be overwritten by a copy this function never read.
 *
 * **Success is deliberately not recorded here.** The riff's row is the fact
 * that one was written and its id is derived from `sourceItemId`, so a second
 * field claiming the same thing is a second field that can disagree with it —
 * the mistake `setup.connected` was already fixed for on /sources.
 */
export async function recordShippedRefusal(input: {
  sourceItemId: string
  reason: ShippedRefusal
  why: string
}): Promise<void> {
  await db
    .update(sourceItem)
    .set({
      meta: sql`${sourceItem.meta} || ${JSON.stringify({
        refusal: input.reason,
        refusalWhy: input.why.slice(0, MAX_REFUSAL_CHARS),
      })}::jsonb`,
    })
    .where(eq(sourceItem.id, input.sourceItemId))
}

/**
 * What became of one merge, for the button that asked for it.
 *
 * Reads the riff first and the refusal second, in that order, because the riff
 * is the stronger fact: a row that exists settles the question, and the meta
 * field is only consulted when there is nothing to have settled it. The shape
 * of the answer lives in lib/shipped-outcome.ts, which the browser can import
 * and this file cannot be.
 */
export async function readShippedOutcome(input: {
  userId: string
  sourceItemId: string
}): Promise<ShippedOutcome | null> {
  const [item] = await db
    .select({ meta: sourceItem.meta })
    .from(sourceItem)
    .where(
      and(
        eq(sourceItem.id, input.sourceItemId),
        // The ownership check, and the reason this takes a userId at all: the
        // id travels to the browser and comes back, so a caller must not be
        // able to read somebody else's merge by editing it.
        eq(sourceItem.userId, input.userId)
      )
    )
    .limit(1)

  if (!item) return null

  const id = shippedRiffId(input.sourceItemId)

  const [row] = await db
    .select({ state: riff.state, failure: riff.failure })
    .from(riff)
    .where(and(eq(riff.id, id), eq(riff.userId, input.userId)))
    .limit(1)

  if (row) {
    if (row.state === "working") return { state: "writing", riffId: id }
    if (row.state === "failed") {
      return { state: "failed", message: row.failure }
    }
    // `ready`, and `archived` — which is a riff that existed and was filed
    // away. Both answer "there was a post in it", which is the question.
    return { state: "ready", riffId: id }
  }

  const refusal = item.meta?.refusal
  const why = item.meta?.refusalWhy

  if (typeof refusal === "string") {
    return { state: "refused", why: typeof why === "string" ? why : "" }
  }

  return { state: "pending" }
}

export async function startSpokenRiff(
  userId: string,
  source: { id: string; label: string }
): Promise<string> {
  const id = newRiffId()

  await db.insert(riff).values({
    id,
    userId,
    scrap: "",
    sourceId: source.id,
    sourceLabel: source.label,
    state: "working",
    // Distinct from createdAt on purpose — see the column comment in
    // lib/schema-app.ts. The same instant today; not necessarily tomorrow.
    startedAt: new Date(),
  })

  return id
}

export type CreateSaidRiffResult =
  | { ok: true; riffId: string; angles: number; groundedIn: string }
  | { ok: false; message: string }

/**
 * The user's own words, straight to a finished riff.
 *
 * **Angles first, row second, and that ordering is the whole point.** The
 * spoken path does the opposite — `startSpokenRiff` writes a `working` row and
 * `completeSpokenRiff` fills it in — and that is right where it is used: a
 * voice note runs inside a Workflow step that retries, and the transcript is
 * unrepeatable because the audio is deleted, so storing it before asking for
 * angles is what stops a walk being lost.
 *
 * Neither of those holds for text typed into the chat. Nothing retries it, and
 * the words are still sitting in the conversation the user can see. So the
 * expensive, unrepeatable artifact this ordering has to protect does not exist,
 * and what is left is the cost: a function killed mid-generation leaves a row
 * in `working` that nothing will ever finish.
 *
 * That is not hypothetical. On 2026-08-13 at 11:53 the first real capture from
 * the chat — a nine-thousand-character episode script — created exactly that
 * row: scrap stored, zero angles, no usage recorded, `working` forever. It was
 * the second riff on that account to end up in the state, and the first one had
 * already sat there for two days.
 *
 * Written this way, a kill at any point before the insert leaves nothing at
 * all, and the user simply sends the text again.
 */
export async function createRiffFromSaid({
  userId,
  text,
  sourceId,
  sourceLabel,
  deps = { angles: generateAnglesFromSaid },
}: {
  userId: string
  text: string
  sourceId: string
  sourceLabel: string
  deps?: { angles: SaidAngleGenerator }
}): Promise<CreateSaidRiffResult> {
  const scrap = text.trim().slice(0, MAX_TRANSCRIPT_CHARS)

  if (!scrap) {
    return { ok: false, message: "There is nothing here to capture." }
  }

  let generation: Awaited<ReturnType<SaidAngleGenerator>>
  try {
    generation = await deps.angles({
      scrap,
      note: "",
      ...(await angleContext(userId)),
    })
  } catch (cause) {
    console.error("[riffs] said angle generation failed:", cause)
    return {
      ok: false,
      message: "Quincy could not find an angle in that one.",
    }
  }

  // Metered whatever the answer was. A "found nothing" reply cost the same as
  // a good one, and the cooldown counts attempts rather than successes.
  if (generation.usage) {
    try {
      await recordUsage({
        userId,
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

  if (generation.angles.length === 0) {
    return {
      ok: false,
      message: "Quincy could not find an angle in that one.",
    }
  }

  const id = newRiffId()

  await db.insert(riff).values({
    id,
    userId,
    scrap,
    sourceId,
    sourceLabel,
    // `ready` immediately, like `createRiffFromPost`: the angles go in beside
    // it, so there is no window in which this renders as a skeleton and no
    // state for a dead run to leave behind.
    state: "ready",
  })

  await db.insert(riffAngle).values(
    generation.angles.map((angle, position) => ({
      id: `${id}-a${position}`,
      riffId: id,
      hook: angle.hook.trim(),
      shape: angle.shape,
      kind: asAngleKind(angle.kind),
      why: angle.why.trim(),
      position,
    }))
  )

  return {
    ok: true,
    riffId: id,
    angles: generation.angles.length,
    groundedIn: generation.groundedIn,
  }
}

/**
 * When a voice riff has been waiting long enough to call it stuck.
 *
 * Four minutes. A ten-minute note transcribes in well under one and angles
 * take eight seconds, so anything past this is not slow, it is gone — the
 * function died, the deploy rolled, the run was cancelled. Workflow retries
 * inside that window; this is the answer for when retrying has stopped
 * happening at all.
 *
 * The card reads this rather than a server sweep deciding it. A sweep would
 * need its own cron and would be wrong for exactly as long as the gap between
 * runs, whereas a page load already knows the current time and the row already
 * carries `startedAt`. If a *user-visible* state ever has to outlive the page
 * (a notification, say), that is when this earns a sweep.
 */
export const RIFF_STUCK_AFTER_MS = 4 * 60 * 1000

/**
 * The words arrived; find the angles and write them.
 *
 * Returns rather than throws for the reason `createRiffFromPost` does — by the
 * time this can fail there is a row on screen, and the caller needs to be able
 * to put a reason on it.
 *
 * **Spoken, not voice.** Renamed from `completeVoiceRiff` by plans/019, which
 * gave it a second caller: a passage selected out of a meeting transcript.
 * Those two are the user talking rather than writing, which is the property the
 * default `generateAnglesFromSaid` is built for — its rules are about false
 * starts and repetition, and they are as true of a call as of a walk. The old
 * name would have made the meeting workflow read like a mistake.
 *
 * **The third caller is not spoken, and it says so through `deps`.** A merged
 * pull request description is prose the user wrote and revised before merging
 * it, so plans/021's audit moved it onto `generateAnglesFromShipped`. Read as a
 * transcript it goes wrong in a specific way: the rules tell the model to read
 * through false starts to the thought underneath, and a deliberate sentence
 * read as a stumble gets discarded. Nothing in this function changes for it — a
 * closure that adds the merge's facts to what it is handed is still a
 * `SaidAngleGenerator`, which is the whole point of the seam.
 *
 * What the callers do *not* share is how they got here. A voice note's
 * transcript is the whole recording; a meeting's is one passage lib/meetings.ts
 * already chose, out of an hour this function never sees; a merge's is the
 * blocks the selection kept, reassembled by code.
 */
export type CompleteSpokenRiffResult =
  | { ok: true; angles: number; groundedIn: string }
  | { ok: false; message: string }

export async function completeSpokenRiff({
  riffId,
  userId,
  transcript,
  emptyMessage = "That recording came back empty.",
  deps = { angles: generateAnglesFromSaid },
}: {
  riffId: string
  userId: string
  transcript: string
  /**
   * What to say if there are no words at all. Parameterised because the two
   * callers arrive here from different places and "that recording came back
   * empty" is a lie about a meeting — nothing was recorded by us, and the
   * silence being reported is a selection that found nothing.
   */
  emptyMessage?: string
  deps?: { angles: SaidAngleGenerator }
}): Promise<CompleteSpokenRiffResult> {
  const scrap = transcript.trim().slice(0, MAX_TRANSCRIPT_CHARS)

  if (!scrap) {
    return { ok: false, message: emptyMessage }
  }

  /**
   * Already done, so do not do it again.
   *
   * A `"use step"` is retried by Workflow on any throw, and everything below
   * this line can throw: the angle insert and the state update are two
   * statements, so a connection blip between them leaves the angles written
   * and the riff still `working`. Without this guard the retry re-runs the
   * model — real money, for a second copy of an answer already in the table —
   * and then hits a primary-key collision on `${riffId}-a0`, throws again, and
   * the riff never leaves `working` at all. The stuck clock would eventually
   * tell the user something was wrong, which is a poor substitute for it
   * having worked.
   *
   * Reads the angles rather than the state, because the angles are the thing
   * that must not be paid for twice.
   */
  const [alreadyDone] = await db
    .select({ id: riffAngle.id })
    .from(riffAngle)
    .where(eq(riffAngle.riffId, riffId))
    .limit(1)

  if (alreadyDone) {
    await db
      .update(riff)
      .set({ state: "ready", failure: "", updatedAt: new Date() })
      .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))

    const existing = await db
      .select({ id: riffAngle.id })
      .from(riffAngle)
      .where(eq(riffAngle.riffId, riffId))

    return { ok: true, angles: existing.length, groundedIn: "" }
  }

  /**
   * The scrap is stored before the angles are asked for, not after.
   *
   * If angle generation then fails, the card can still show what was said —
   * which is the difference between "Quincy could not find an angle in this"
   * (annoying, and the words are safe) and "your walk is gone" (unforgivable).
   * The transcript is the expensive, unrepeatable artifact here: the audio is
   * deleted, and nobody can say the same thing twice.
   */
  await db
    .update(riff)
    .set({ scrap, updatedAt: new Date() })
    .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))

  let generation: Awaited<ReturnType<SaidAngleGenerator>>
  try {
    generation = await deps.angles({
      scrap,
      note: "",
      ...(await angleContext(userId)),
    })
  } catch (cause) {
    console.error("[riffs] voice angle generation failed:", cause)
    return {
      ok: false,
      message:
        "Quincy could not find an angle in that. The transcript is here.",
    }
  }

  // Metered at this layer for the reason `createRiffFromPost` gives: it is the
  // one that knows the userId. A bookkeeping failure logs and is dropped —
  // the call already ran and the money is already spent.
  if (generation.usage) {
    try {
      await recordUsage({
        userId,
        model: ADAPT_MODEL,
        // Tags the row as this feature's spend, which is what the cooldown
        // counts. See ADAPT_SPEND in lib/adapt.ts.
        conversationId: ADAPT_SPEND,
        inputTokens: generation.usage.inputTokens,
        cachedInputTokens: generation.usage.cachedInputTokens,
        outputTokens: generation.usage.outputTokens,
      })
    } catch (cause) {
      console.error("[riffs] could not record usage:", cause)
    }
  }

  if (generation.angles.length === 0) {
    return {
      ok: false,
      message:
        "Quincy could not find an angle in that. The transcript is here.",
    }
  }

  // Belt to the guard above's braces: the ids are deterministic, so a retry
  // that somehow reaches here writes nothing rather than throwing on the
  // primary key and stranding the riff on `working`.
  await db
    .insert(riffAngle)
    .values(
      generation.angles.map((angle, position) => ({
        id: `${riffId}-a${position}`,
        riffId,
        hook: angle.hook.trim(),
        shape: angle.shape,
        kind: asAngleKind(angle.kind),
        why: angle.why.trim(),
        position,
      }))
    )
    .onConflictDoNothing()

  await db
    .update(riff)
    .set({ state: "ready", failure: "", updatedAt: new Date() })
    .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))

  return {
    ok: true,
    angles: generation.angles.length,
    groundedIn: generation.groundedIn,
  }
}

/**
 * Put a reason on a riff that could not be finished.
 *
 * Scoped by `userId` like every other write here, even though the only caller
 * is a workflow that was handed both ids by the route that created the row.
 * The scope costs nothing and means no future caller can fail somebody else's
 * riff by passing the wrong id.
 */
export async function failSpokenRiff({
  riffId,
  userId,
  message,
}: {
  riffId: string
  userId: string
  message: string
}): Promise<void> {
  await db
    .update(riff)
    .set({ state: "failed", failure: message, updatedAt: new Date() })
    .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))
}

/**
 * Whether this user may record right now.
 *
 * The cooldown AGENTS.md asks for beside every ceiling. Reads the newest voice
 * riff rather than a counter, so there is no state to keep in sync and no way
 * for a crash to leave somebody locked out — the worst a failure can do is let
 * one extra recording through.
 *
 * This is the cheap early refusal, checked before a single byte is read off
 * the wire. It is not the guard against concurrent requests — `claimVoiceRiff`,
 * taken later at riff creation, is the atomic claim that closes that race.
 */
export async function voiceNoteCooldown(
  userId: string,
  cooldownMs: number
): Promise<{ ready: true } | { ready: false; secondsLeft: number }> {
  const [recent] = await db
    .select({ createdAt: riff.createdAt })
    .from(riff)
    .where(and(eq(riff.userId, userId), eq(riff.sourceId, VOICE_SOURCE.id)))
    .orderBy(desc(riff.createdAt))
    .limit(1)

  if (!recent) return { ready: true }

  const elapsed = Date.now() - recent.createdAt.getTime()
  if (elapsed >= cooldownMs) return { ready: true }

  return {
    ready: false,
    secondsLeft: Math.ceil((cooldownMs - elapsed) / 1000),
  }
}

/** One riff's angle, with the ownership chain proved. Used by `draftAngle`,
 *  which is handed an id by a browser and may not trust it. */
/**
 * Every channel any shape can reach, by id.
 *
 * Derived from `CHANNELS_FOR_SHAPE` so the display name a prompt is given is
 * the same string the card renders, and neither can drift from the table that
 * decides which shapes reach it.
 */
export const CHANNEL_LABELS: Record<string, { id: string; label: string }> =
  Object.fromEntries(
    Object.values(CHANNELS_FOR_SHAPE)
      .flat()
      .map((channel) => [channel.id, channel])
  )

/**
 * One riff with its angles, proved to belong to this user.
 *
 * The sibling of `getOwnedAngle`, and it exists for the same reason: a browser
 * hands `askForChannelAngle` a riff id, and a row that can be joined back to a
 * user is the difference between proving ownership and letting a caller spend
 * somebody else's model budget on somebody else's material.
 */
export async function getOwnedRiff(userId: string, riffId: string) {
  const [row] = await db
    .select({
      id: riff.id,
      scrap: riff.scrap,
      state: riff.state,
    })
    .from(riff)
    .where(and(eq(riff.id, riffId), eq(riff.userId, userId)))
    .limit(1)

  if (!row) return null

  const angles = await db
    .select({
      id: riffAngle.id,
      hook: riffAngle.hook,
      shape: riffAngle.shape,
      kind: riffAngle.kind,
      why: riffAngle.why,
    })
    .from(riffAngle)
    .where(eq(riffAngle.riffId, row.id))
    .orderBy(asc(riffAngle.position))

  return {
    ...row,
    angles: angles.map((angle) => ({
      ...angle,
      shape: angle.shape as Angle["shape"],
    })),
  }
}

export async function getOwnedAngle(userId: string, angleId: string) {
  const [row] = await db
    .select({
      id: riffAngle.id,
      hook: riffAngle.hook,
      shape: riffAngle.shape,
      kind: riffAngle.kind,
      why: riffAngle.why,
      riffId: riff.id,
      sourceId: riff.sourceId,
      sourceLabel: riff.sourceLabel,
      /**
       * The material itself, for the writer — see `draftAngle`.
       *
       * This join was already here for `adaptedFromUrl`, and the scrap was the
       * one column it did not take. That made the angle's own `why` the only
       * thing `generateDraft` ever saw: a hundred-odd characters of summary
       * standing in for a merge description or a voice note that runs to a
       * thousand. `TELLS` tells the model to prefer the specific detail and to
       * write short when there is none, so it correctly wrote the general
       * version of a post whose specifics were sitting in a column nobody
       * selected.
       */
      scrap: riff.scrap,
      /**
       * What the scrap is *about*, for the same reader — see `riff.context`.
       *
       * The scrap above fixed half of the drafting problem: the writer could
       * finally see the pull request description. It still could not see what
       * the product was, so a merge described in its own vocabulary produced a
       * post that could have been about any repository. This column carries the
       * sentence the selection wrote about what changed for a user, the
       * repository's own description, and — since 2026-08-25 — the three beats
       * of the event, which are what tell the writer the order the post goes
       * in rather than only what it is about. See `ShippedBeats`.
       */
      context: riff.context,
      adaptedFromUrl: riff.adaptedFromUrl,
      adaptedFromHandle: riff.adaptedFromHandle,
    })
    .from(riffAngle)
    .innerJoin(riff, eq(riffAngle.riffId, riff.id))
    .where(and(eq(riffAngle.id, angleId), eq(riff.userId, userId)))
    .limit(1)

  return row ?? null
}
