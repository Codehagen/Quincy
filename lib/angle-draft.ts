import { and, eq } from "drizzle-orm"

import { renderBrainForUser } from "./brain"
import { listConnections } from "./channels"
import { db } from "./db"
import { recentlyWritten } from "./drafts"
import {
  DRAFTING_MODEL,
  generateDraft,
  targetsFor,
  type DraftGenerator,
} from "./drafting"
import { measurePost } from "./post-length"
import { describeRepo, readRepoContext } from "./repo-context"
import { CHANNELS_FOR_SHAPE, getOwnedAngle, type Angle } from "./riffs"
import { draft, draftVersion } from "./schema-app"
import {
  MAX_FOR_USER_CHARS,
  readShippedBeats,
  type ShippedBeats,
} from "./shipped-work"
import { GenerationFailed, hasSpend } from "./structured-output"
import { recordUsage } from "./usage"
import { voiceExamples } from "./voice"

/**
 * An angle becomes a draft — the whole of it except who is allowed to ask.
 *
 * Lifted out of `app/(app)/riffs/actions.ts` unchanged, for the reason
 * lib/adapt-draft.ts was lifted out of the same file: it now has **two**
 * callers that disagree about exactly the things a server action owns. The
 * page has a session, revalidates two paths and resolves entitlement with
 * `resolveEntitlementForRequest`; the Week Plan and Ship Log rhythms have a
 * cron, revalidate nothing, and were gated by lib/rhythm-run.ts before the
 * handler was called at all. A server action cannot serve the second — it
 * reads `getSession()`, and a cron has no cookie — and a second writer of
 * `draft` rows was the alternative, which is how two subtly different drafts
 * of the same idea come to exist.
 *
 * So the split is: **this owns what a draft made from an angle is**, and the
 * caller owns who may ask for one. `draftAngle` in the action is now the
 * session, the gate and the two `revalidatePath` calls, and nothing else.
 *
 * Everything below this line is the code that was there, including its
 * comments, which are the record of what each guard cost to learn.
 */

/** "Substack", or "LinkedIn or Instagram" — the channels that would unblock a
 *  shape, in a sentence. `Intl` rather than `join(" or ")` so a third channel
 *  reads as a list and not as a chant. */
const OR = new Intl.ListFormat("en", { style: "long", type: "disjunction" })

/** Only ever applied to a `Angle["shape"]`, all four of which are ASCII words,
 *  so the vowel test is the whole rule and there is no exception to hardcode. */
function article(word: string) {
  return /^[aeiou]/i.test(word) ? "an" : "a"
}

/** What a gate answers. `ok: false` is refused, in words the UI can show. */
export type AngleDraftGate = { ok: true } | { ok: false; message: string }

/**
 * The generator, injectable — the same trade lib/adapt-draft.ts makes with
 * `adapt`. A test of the orchestration should not need a gateway, and a
 * rhythm's test should not spend money to prove it caps at five.
 */
export type AngleDraftDeps = { generate?: DraftGenerator }

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
 * **A model failure does not fail the call.** If the generator fails, the
 * draft is still created with each body falling back to the hook — the old
 * stub behaviour — and `fellBack` in the receipt names the channels it
 * happened to. Someone who pressed "Draft this" should get something they can
 * write themselves, never an error and nothing; the receipt is what lets the
 * UI tell the two apart later without lying about which one happened.
 *
 * `reason: "auth"` is in the union and is never returned from here — there is
 * no session in this file to be missing. It belongs to `draftAngle`, which is
 * the only caller that can be asked by somebody who is not signed in, and the
 * two share one result type so the UI branches on one shape.
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
       *
       * `cooldown` is in the union and, like `auth`, is never returned from
       * here. It belongs to the caller that holds a session — the `/riffs`
       * server action — and it is named here so the two share one result type
       * rather than the action widening it at its own call site.
       */
      reason: "auth" | "gone" | "entitlement" | "no-channel" | "cooldown"
      message: string
    }

export async function draftFromAngle({
  userId,
  angleId,
  gate,
  spendTag,
  deps = {},
}: {
  userId: string
  /** The `riff_angle` row id. Everything else is read from the database. */
  angleId: string
  /**
   * The entitlement check, supplied by whoever knows what kind of caller this
   * is — and called at the one moment it belongs, immediately before the spend.
   *
   * Not a boolean and not resolved here, for the reason lib/adapt-draft.ts
   * gives: a request resolves entitlement with `resolveEntitlementForRequest`,
   * which may start a trial, and a cron resolves it with the pure
   * `resolveEntitlement`, which may not. A cron that started somebody's trial
   * while they were asleep is exactly the bug lib/heartbeat.ts documents.
   *
   * Absent means the caller has already gated. lib/rhythm-run.ts checks
   * entitlement before it calls a handler at all, so a second check inside the
   * handler would ask the same question twice and answer it differently.
   */
  gate?: () => Promise<AngleDraftGate>
  /**
   * What `usage_event.conversation_id` is tagged with, when the caller shares a
   * cooldown with somebody else.
   *
   * Absent by default, and that is right for the two rhythm handlers: a draft
   * written by a cron at 07:00 must not hold a cooldown against the person
   * asleep beside it. The `/riffs` server action passes `ADAPT_SPEND`, because
   * a cooldown that is read and never written is not a cooldown — the check
   * would only ever see the *other* buttons' rows and two presses of this one
   * would both pass.
   */
  spendTag?: string
  deps?: AngleDraftDeps
}): Promise<DraftAngleResult> {
  const generate = deps.generate ?? generateDraft

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
  const angle = await getOwnedAngle(userId, angleId)
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
    .where(and(eq(draft.userId, userId), eq(draft.riffHook, angle.hook)))
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
  const connections = await listConnections(userId)
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

  const allowed = gate ? await gate() : { ok: true as const }
  if (!allowed.ok) {
    return { ok: false, reason: "entitlement", message: allowed.message }
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
    renderBrainForUser(userId, { stories: "full" }),
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
      userId: userId,
      about: `${angle.hook} ${angle.why}`,
    }).catch((cause) => {
      console.error("[drafting] could not read voice examples:", cause)
      return [] as string[]
    }),
    /**
     * A failed avoid-list must not cost the user their draft. It makes the
     * post less likely to repeat the last one; it is not what makes the post.
     */
    recentlyWritten(userId).catch((cause) => {
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
        userId: userId,
        model: DRAFTING_MODEL,
        conversationId: spendTag,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      })
    } catch (cause) {
      console.error("[drafting] could not record usage:", cause)
    }
  }

  try {
    const generation = await generate({
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
    userId: userId,
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
