"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"

import { db } from "@/lib/db"
import { DRAFTING_MODEL, generateDraft, targetsFor } from "@/lib/drafting"
import { isEntitled, resolveEntitlementForRequest } from "@/lib/entitlement"
import { describeRepo, readRepoContext } from "@/lib/repo-context"
import {
  MAX_FOR_USER_CHARS,
  readShippedBeats,
  type ShippedBeats,
} from "@/lib/shipped-work"
import { listConnections } from "@/lib/channels"
import { renderBrainForUser } from "@/lib/brain"
import { recentlyWritten } from "@/lib/drafts"
import { voiceExamples } from "@/lib/voice"
import { measurePost } from "@/lib/post-length"
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
  CHANNELS_FOR_SHAPE,
  createRiffFromPost,
  createRiffFromSaid,
  getOwnedAngle,
  getOwnedRiff,
  newAngleId,
  shapesForChannel,
  shapesForChannels,
  type Angle,
  type Riff,
} from "@/lib/riffs"
import { getSession } from "@/lib/session"
import { GenerationFailed, hasSpend } from "@/lib/structured-output"
import { draft, draftVersion, riff, riffAngle } from "@/lib/schema-app"
import { recordUsage, spendCooldown } from "@/lib/usage"

/** "Substack", or "LinkedIn or Instagram" — the channels that would unblock a
 *  shape, in a sentence. `Intl` rather than `join(" or ")` so a third channel
 *  reads as a list and not as a chant. */
const OR = new Intl.ListFormat("en", { style: "long", type: "disjunction" })

/** Only ever applied to a `Angle["shape"]`, all four of which are ASCII words,
 *  so the vowel test is the whole rule and there is no exception to hardcode. */
function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/**
 * What the writer needs to know about the material that the material never
 * says. See `riff.context` and `DraftGenerator.about`.
 *
 * **Every read is a narrowing, and that is not defensive coding for its own
 * sake.** The column is jsonb and its comment says it is never parsed for logic
 * — so a riff written before it existed holds `{}`, a riff from a voice note
 * holds `{}`, and a shape the workflow stops writing next month has to come out
 * of here as a shorter prompt rather than as a throw on the page somebody
 * pressed Draft on. There is no version field to check because there is nothing
 * a version would let this function do differently.
 *
 * Deliberately three lines at most. `describeFacts` exists and reads well, but
 * it is written for the selection prompt, where the merge's counts are the
 * evidence; here it would sit above a pull request description competing with
 * the material for the model's attention. The commit count is not what makes
 * the post — what the product is, and what somebody using it got, is.
 *
 * **A private repository's description reaches the writer, and that is the
 * intended behaviour rather than an oversight.** The selection rules refuse to
 * *return* anything a private repository would not want disclosed; this is one
 * step further on, and what it produces is a draft on the user's own /riffs
 * page. Nothing in Quincy publishes without them pressing Approve — the whole
 * product rests on that, per docs/vision.md — so the question is not "may the
 * model see this" but "may this reach a channel", and the answer to the second
 * is no by construction. Withholding it instead would leave the writer doing
 * what the 2026-08-24 audit measured: writing around a subject it cannot name.
 * The private line below is what tells it to keep the naming inside what the
 * material already says out loud.
 */
function describeMaterial(context: unknown): string {
  if (!context || typeof context !== "object") return ""

  const row = context as Record<string, unknown>
  const facts =
    row.facts && typeof row.facts === "object"
      ? (row.facts as Record<string, unknown>)
      : null

  const lines: string[] = []

  // Narrowed rather than cast: this is jsonb, and `repo.topics.length` on a row
  // whose `topics` an older deploy stored as a string is a TypeError inside the
  // server action somebody pressed Draft on.
  const repo = describeRepo(readRepoContext(facts?.repo)).trim()
  if (repo) lines.push(repo)

  if (facts && typeof facts.private === "boolean") {
    // Said out loud because the writer is about to be told to prefer the
    // specific detail. On a private repository the only thing already public is
    // what the description itself says, and the model has to know which case
    // it is in before it decides how much to name.
    lines.push(
      facts.private
        ? `The repository is private. Nothing about it is public except what the material below already says.`
        : `The repository is public.`
    )
  }

  // Bounded again on the way out, not only on the way in. The value stored was
  // one line of at most `MAX_FOR_USER_CHARS`; this is a jsonb column, and the
  // cost of proving that twice is one `replace`.
  const forUser =
    typeof row.forUser === "string"
      ? row.forUser.replace(/\s+/g, " ").trim().slice(0, MAX_FOR_USER_CHARS)
      : ""
  if (forUser) lines.push(`What changed for a user: ${forUser}`)

  return lines.join("\n")
}

/**
 * The three beats off `riff.context`, or three empty strings.
 *
 * Beside `describeMaterial` rather than inside it, because the two say
 * different kinds of thing to the writer and land in different parts of the
 * prompt: `about` is what the material is about, and this is the order the post
 * goes in. Folding the beats into the "About the material" block would turn a
 * form into three more facts, which is precisely the reading that produced a
 * paragraph instead of three lines.
 *
 * Narrowed field by field for the reason `describeMaterial` gives at length:
 * this is jsonb, every riff written before 2026-08-25 has no `beats` key, and a
 * voice note will never have one. `readShippedBeats` answers all three cases
 * with `NO_BEATS`, and `describeBeats` prints nothing for that.
 */
function readMaterialBeats(context: unknown): ShippedBeats {
  if (!context || typeof context !== "object") return readShippedBeats(null)

  return readShippedBeats((context as Record<string, unknown>).beats)
}

/**
 * Turn an angle into a draft, written in the user's voice.
 *
 * This is the one link in the chain that was never wired: `AngleActions` shipped
 * with no handler because /drafts was a placeholder and there was nowhere for a
 * drafted angle to land. There is now, and — as of plans/015 — Quincy actually
 * writes it: one `generateDraft` call (lib/drafting.ts) sees every channel the
 * angle can become at once, reads the brain (voice rules, hard rules, story
 * bank) via `renderBrainForUser`, and produces a version per channel rather
 * than repeating the hook.
 *
 * **No riff table, and none needed.** A riff is still a fixture in lib/riffs.ts,
 * so "which angles have I already drafted" has nowhere of its own to live — but
 * `draft.riff_hook` already stores the angle it came from, for provenance. That
 * makes the question answerable from the drafts side: an angle is drafted when a
 * draft exists carrying its hook. The state is derived rather than stored, which
 * is also why it survives without anything to migrate later. The same field
 * doubles as the idempotency key below: a double click must not buy a second
 * model call.
 *
 * **A model failure does not fail the action.** If `generateDraft` fails, the
 * draft is still created with each body falling back to the hook — the old
 * stub behaviour — and `fellBack` in the receipt names the channels it
 * happened to. Someone who pressed "Draft this" should get something they can
 * write themselves, never an error and nothing; the receipt is what lets the
 * UI tell the two apart later without lying about which one happened.
 */
export type DraftAngleResult =
  | {
      ok: true
      draftId: string
      /** Channels written, in order. */
      channels: string[]
      /**
       * False when any channel body is the hook rather than a written post.
       *
       * **Derived from the bodies, never from whether the call threw**, and
       * that distinction is the whole bug. This used to be set to `true` at
       * the end of the `try`, which made it mean "`generateDraft` did not
       * throw" — and the failure that actually reached a user does not throw.
       * Two malformed attempts return `versions: []`, so on 2026-08-08 an
       * Essay angle came back with `written: true` and a Substack body that
       * was its own hook, 89 characters, verbatim. The one field built to
       * tell a written post from a repeated hook reported the wrong one for
       * exactly the case it exists for.
       */
      written: boolean
      /** Channels whose body is the hook because the model gave us nothing. */
      fellBack: string[]
      /** Channels whose generated body exceeds the platform ceiling. */
      overLimit: string[]
      /** True when an existing draft for this hook was returned instead. */
      existing: boolean
    }
  | {
      ok: false
      /**
       * Why, as a value the UI can branch on. `completeSpokenRiff` already
       * returns one of these, for the same reason: the message is written for a
       * person to read, and a component that has to `startsWith("Your")` to
       * decide whether to offer a plan link is one copy edit away from either
       * selling to somebody whose angle was simply deleted, or not selling to
       * somebody whose trial just ended.
       */
      reason: "auth" | "gone" | "entitlement" | "no-channel"
      message: string
    }

export async function draftAngle(input: {
  /** The `riff_angle` row id. Everything else is read from the database. */
  angleId: string
}): Promise<DraftAngleResult> {
  const session = await getSession()
  if (!session) {
    return { ok: false, reason: "auth", message: "Not signed in." }
  }

  /**
   * The angle, proved to belong to this user.
   *
   * It used to arrive from the client as `{id, hook, shape}` and was trusted —
   * which meant a caller could put any hook they liked through `generateDraft`
   * and get it written under their own name. Harmless in practice, since it is
   * their account and their bill, but "the client says so" is not a basis for
   * deciding what the model writes. plans/017 gave riffs a table, so there is
   * now a row to join back to a user.
   */
  const angle = await getOwnedAngle(session.user.id, input.angleId)
  if (!angle) {
    return { ok: false, reason: "gone", message: "No such angle." }
  }

  // Idempotency first, and before the entitlement gate: a re-press of a
  // successful draft costs nothing and should not be refused just because a
  // trial ended in the meantime. Guarded on `riffHook` rather than a riff id
  // because there is no riff table yet — see the doc comment above.
  const [existing] = await db
    .select({ id: draft.id })
    .from(draft)
    .where(
      and(eq(draft.userId, session.user.id), eq(draft.riffHook, angle.hook))
    )
    .limit(1)

  if (existing) {
    const existingVersions = await db
      .select({ channel: draftVersion.channel })
      .from(draftVersion)
      .where(eq(draftVersion.draftId, existing.id))

    return {
      ok: true,
      draftId: existing.id,
      channels: existingVersions.map((v) => v.channel),
      // Nothing was written *by this call*, which is what the field reports.
      // Whether the draft already sitting there was written or fell back is a
      // question about that draft, and /riffs answers it from the bodies —
      // see `status`/`fellBack` in lib/riffs.ts. `existing` is what the UI
      // branches on first, so these two never have to be read together.
      written: false,
      fellBack: [],
      overLimit: [],
      existing: true,
    }
  }

  /**
   * Where this angle could land, checked before anything is spent.
   *
   * Above the entitlement gate on purpose, and `askForChannelAngle` below
   * already draws the order this way: the checks that cost nothing and can
   * only answer "there is nothing to do here" come first. An Essay on an
   * account with no long-form channel is not going to produce a draft whether
   * or not the subscription is live, and telling that user their free day is
   * over would be answering a question they did not ask.
   */
  const connections = await listConnections(session.user.id)
  const connectedChannels = connections
    .filter((c) => c.state === "active")
    .map((c) => c.channel)
  const shape = angle.shape as Angle["shape"]
  const targets = targetsFor(shape, connectedChannels)

  /**
   * No target is a refusal, not a reason to pick one.
   *
   * `targetsFor` used to widen to the shape's full channel list here, which is
   * how an account live on X and LinkedIn ended up with a Substack draft it
   * could never send. The honest answer names the channel that would fix it —
   * the shape table is the only thing that knows which one that is, so the
   * sentence is built from it rather than written out and left to drift.
   */
  if (targets.length === 0) {
    const needed = CHANNELS_FOR_SHAPE[shape].map((c) => c.label)
    return {
      ok: false,
      reason: "no-channel",
      message: `Nothing you have connected takes ${article(shape)} ${shape.toLowerCase()}. Connect ${OR.format(needed)} to draft this one.`,
    }
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) {
    return {
      ok: false,
      reason: "entitlement",
      message:
        entitlement.state === "lapsed"
          ? "Your subscription is no longer active."
          : "Your free day is over.",
    }
  }

  /**
   * The brain says how this user writes; `recent` says what they have just
   * been given. Read together, not in series — neither is on the critical
   * path of the other, and the drafting call waits for both.
   *
   * **The names have to follow the array order, and once they did not.** This
   * read `[brain, recent, examples]` against a list whose second entry is
   * `voiceExamples` and whose third is `recentlyWritten`, so the two arrived
   * in each other's slots — and both are `Promise<string[]>`, so nothing in
   * the type system had an opinion. `describeExamples` says "this is how the
   * user writes, match it" and `describeRecent` says "these already went out,
   * do not repeat them", which meant every draft this account ever produced
   * was told to imitate its own last draft and to steer clear of 8 of the 76
   * real posts the corpus holds. It is the exact inversion `describeExamples`
   * warns about in lib/drafting.ts, and it is invisible from the output: the
   * drafts came back fluent, on-length and plausible, just not in anybody's
   * voice. Keep these three names in the order the calls below appear.
   */
  const [brain, examples, recent] = await Promise.all([
    /**
     * Stories in full, because `generateDraft` has no tools.
     *
     * The default index form tells the model to "call the story tool" before
     * citing anything from a story, and no such tool exists — least of all in a
     * single `generateObject` call. It was reading four titles it could not
     * open while being forbidden from inventing anything, and writing around
     * the subject was the only honest move left to it. Full text costs a few
     * hundred tokens and is the difference between a post about your week and a
     * post that quotes it.
     */
    renderBrainForUser(session.user.id, { stories: "full" }),
    /**
     * Their own posts, verbatim, as the thing to match.
     *
     * `about` is the hook plus the angle's reasoning, which is everything known
     * about the subject at this point — the same pair handed to the model
     * below. Half the examples come back topically matched to it, so the block
     * shows how this person writes about *this*, not only how they wrote most
     * recently. See `voiceExamples`.
     *
     * Same "must not cost the user their draft" reasoning as the avoid-list
     * below: without examples the draft is what it has always been, which is
     * worse and not broken.
     */
    voiceExamples({
      userId: session.user.id,
      about: `${angle.hook} ${angle.why}`,
    }).catch((cause) => {
      console.error("[drafting] could not read voice examples:", cause)
      return [] as string[]
    }),
    /**
     * A failed avoid-list must not cost the user their draft. It makes the
     * post less likely to repeat the last one; it is not what makes the post.
     */
    recentlyWritten(session.user.id).catch((cause) => {
      console.error("[drafting] could not read recent drafts:", cause)
      return [] as string[]
    }),
  ])

  // The riff pipeline is still a fixture (lib/riffs.ts), so the hook is the
  // only material there is — there is no separate scrap text to hand the
  // model beyond what `describeConstraints` already turns into per-channel
  // instructions.
  let versions: { channel: string; body: string }[] = []

  /**
   * One place to bill from, because there are now two paths that owe.
   *
   * The success path has always metered here — this is the layer that knows
   * the userId, and the chat route's posture applies unchanged: the generation
   * already ran, so a bookkeeping failure logs and is dropped rather than
   * undoing work that happened. The failure path owes exactly the same way and
   * paid nothing until now; see `GenerationFailed`.
   */
  const meter = async (usage: {
    inputTokens: number
    cachedInputTokens: number
    outputTokens: number
  }) => {
    try {
      await recordUsage({
        userId: session.user.id,
        model: DRAFTING_MODEL,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      })
    } catch (cause) {
      console.error("[drafting] could not record usage:", cause)
    }
  }

  try {
    const generation = await generateDraft({
      hook: angle.hook,
      shape: angle.shape as Angle["shape"],
      /**
       * Your own material in full; an adapted riff's reasoning only.
       *
       * The rule this replaces was **never the riff's scrap**, and the reason
       * given was sound for exactly one case: for an adapted riff the scrap is
       * a stranger's post, `DRAFTING_RULES` tells the model it may use anything
       * in the material, and handing it their numbers would launder precisely
       * what lib/adapt.ts exists to prevent — one layer further down, where the
       * adapt rules no longer apply. That case is still refused below.
       *
       * It fired on every other case too, and those are the majority. A merge
       * you wrote and a voice note you recorded are not a stranger's post; they
       * are the material. Blocking them left `angle.why` as the whole of what
       * `generateDraft` ever saw — 208 characters of summary standing in for
       * the 998-character pull request body it was summarising, measured on the
       * draft written from PR #2 on 2026-08-23. `TELLS` then did its job
       * correctly and made the situation worse: told to prefer the specific
       * detail and to write short when there is none, and given a material
       * block containing no specific detail, it wrote the general version. The
       * post came back true, fluent and about nothing in particular, because
       * every concrete thing in that merge — the atomic claim, "there is no
       * unsend", "Quincy drafts, you send" — had been filtered out one step
       * upstream.
       *
       * `adaptedFromUrl` is the discriminator, and it is the one the original
       * comment was already describing in prose. It is non-empty exactly when
       * the scrap belongs to somebody else, so this narrows the ban to the case
       * it was written for rather than weakening it. The scrap is bounded at
       * `MAX_TRANSCRIPT_CHARS` when the riff is created, so there is no second
       * ceiling to impose here.
       */
      scrapOrIdea: angle.adaptedFromUrl
        ? angle.why || angle.hook
        : angle.scrap || angle.why || angle.hook,
      sourceLabel: angle.sourceLabel,
      /**
       * The other half of the same fix as `scrapOrIdea` above.
       *
       * That one gave the writer the pull request description; this gives it
       * the product the description assumes. Empty for every riff that has no
       * context — a voice note says what it is about, so there is nothing to
       * add and nothing is added.
       */
      about: describeMaterial(angle.context),
      /**
       * The order the post goes in, when the material is a merge.
       *
       * `about` and `scrapOrIdea` between them gave the writer the product and
       * the description, and the drafts that came back were still one
       * paragraph with the pull request as the subject. This is the third
       * thing: what he did, what happened, what it meant — his own form, off
       * `riff.context`. Empty for a voice note and for every riff written
       * before the beats existed, and empty prints nothing.
       */
      beats: readMaterialBeats(angle.context),
      channels: targets,
      brain,
      recent,
      examples,
    })
    /**
     * Guarded even though `DraftGeneration` types this as an array.
     *
     * `generateDraft` is injectable, and the type is what the *default*
     * generator now promises rather than what this line receives. This is the
     * assignment that took /riffs down on 2026-08-08: a mangled result made
     * `versions` a string, which reaches `versions.map` below — two statements
     * past the end of this try — and throws there, uncaught, as a 500 over the
     * whole route. Inside the try it becomes the empty-versions case, which is
     * the fallback-to-hook path directly underneath.
     */
    versions = Array.isArray(generation.versions) ? generation.versions : []

    if (generation.usage) await meter(generation.usage)
  } catch (cause) {
    console.error("[drafting] generation failed:", cause)

    /**
     * A call that threw still ran, and still cost.
     *
     * On 2026-08-08 a `NoObjectGeneratedError` reached this catch and the
     * 3,156 input tokens behind it left no `usage_event` row — the user saw a
     * failure, /credits saw nothing at all. `generateDraft` now rewraps its
     * throw with the bill attached so the same `catch` can pay it. `instanceof`
     * rather than a duck-type because a genuinely unexpected error (a DB blip
     * inside the try, a bug in this file) owes nothing and must not invent a
     * charge.
     *
     * `hasSpend` is the second half of that same argument. A `GenerationFailed`
     * whose bill is `{0, 0, 0}` is a throw that never reached the model, and
     * carrying it out through the exception does not make it a charge. Writing
     * the row anyway would put a turn on /credits that nobody took — the fix
     * for one under-report becoming an over-report in the other direction.
     */
    if (cause instanceof GenerationFailed && hasSpend(cause.usage)) {
      await meter(cause.usage)
    }
  }

  const bodies = new Map(versions.map((v) => [v.channel, v.body]))
  const overLimit: string[] = []
  /**
   * The channels that got the hook back instead of a post.
   *
   * Collected in the same pass that decides each body, which is the only place
   * that actually knows — a channel falls back when the model skipped it, and
   * whether the call threw is a different question with a different answer.
   * `written` is read off this rather than set in the `try`; see the type above
   * for the draft that shipped claiming to be written and was not.
   */
  const fellBack: string[] = []

  const channelBodies = targets.map((target) => {
    const generated = bodies.get(target.id)

    // Falls back to the hook per channel, not just on a total failure — a
    // model that answered for some channels and not others (a schema the
    // provider could not satisfy) should not lose the channels it did write.
    const body = generated ?? angle.hook
    if (generated === undefined) fellBack.push(target.id)

    const { over } = measurePost(body, target.id)
    if (over > 0) overLimit.push(target.id)
    return { target, body }
  })

  const id = `draft-${angle.id}-${Date.now().toString(36)}`

  await db.insert(draft).values({
    id,
    userId: session.user.id,
    idea: angle.hook,
    // The provenance that makes the angle read as drafted next time /riffs
    // loads, and the idempotency key above. Not decoration — it is the only
    // record that the two are related.
    riffHook: angle.hook,
    // Carried from the angle rather than joined back to it later. See the
    // column note: this is what `recentKinds` reads, and it must survive the
    // riff being archived.
    kind: angle.kind,
    sourceId: angle.sourceId,
    sourceLabel: angle.sourceLabel,
    // The borrowed half of the chain, carried from the riff so a draft can
    // still say whose post prompted it after the riff is gone.
    adaptedFromUrl: angle.adaptedFromUrl,
    adaptedFromHandle: angle.adaptedFromHandle,
  })

  await db.insert(draftVersion).values(
    channelBodies.map(({ target, body }) => ({
      id: `${id}-${target.id}`,
      draftId: id,
      channel: target.id,
      label: target.label,
      body,
      state: "writing" as const,
    }))
  )

  revalidatePath("/riffs")
  revalidatePath("/drafts")

  return {
    ok: true,
    draftId: id,
    channels: targets.map((t) => t.id),
    written: fellBack.length === 0,
    fellBack,
    overLimit,
    existing: false,
  }
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

  // Shared across the adapt-model family with `adaptPostToRiff` — a
  // `draftAngle` press does not count against it (different model), but a
  // press on either of these two can hold both for 15s. Acceptable: they
  // spend from the same budget, and this is the "found nothing" gap this
  // whole cooldown exists to close.
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
