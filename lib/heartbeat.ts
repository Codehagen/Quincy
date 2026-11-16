import { generateObject, jsonSchema } from "ai"
import { eq } from "drizzle-orm"

import { isEntitled, resolveEntitlement } from "./entitlement"
import { appendEvent, getEvents, getPage, putPage } from "./brain"
import { db } from "./db"
import {
  appendLedger,
  boundLedger,
  classifyCapture,
  LEDGER_COMPILE_BYTES,
  mergeLedger,
  renderLedgerLines,
  type LedgerEntry,
} from "./memory-ledger"
import { user } from "./schema"
import { brainPage } from "./schema-app"
import {
  retryMalformed,
  unwrapStringifiedObject,
  usageAccumulator,
  type StructuredUsage,
} from "./structured-output"
import { recordUsage } from "./usage"
import { REASONING } from "./model-options"

/**
 * Heartbeat: the maintenance loop. See docs/brain.md.
 *
 * Nothing is compiled during a conversation. Synthesis mid-turn writes down
 * what the model just invented rather than what the user confirmed, so capture
 * is cheap and inline and compilation is deliberate and scheduled.
 *
 * Deliberately a cron job and not a durable workflow. The property a workflow
 * would sell us — safe to interrupt and re-run — is already a property of the
 * schema: events are append-only and never consumed, and putPage snapshots
 * before it overwrites. A half-finished run costs nothing to repeat. Revisit
 * when one run stops fitting in one function invocation.
 */

/** Raw captures land here. Heartbeat is the only reader. */
export const INBOX_SLUG = "memory/inbox"

const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/** Enough to be worth a row. Below this it is "ok", "yes", "shorter". */
const MIN_CAPTURE_LENGTH = 24

const EXTRACT_PROMPT = `You maintain a writer's long-term memory.

Below are raw things the user said in chat since the last compaction. Extract
only what will still be true and useful in six months: how they work, what they
have built, stated preferences, recurring constraints.

Discard anything that is an instruction for the current task ("make it shorter"),
a passing reaction, or a question. Most input is not worth keeping. Returning an
empty list is the correct answer more often than not.

Never invent a detail. If a date, number or name is not stated, leave it out.
Write each fact as one sentence, in the language the user wrote it in.

A second block may follow, holding typed ledger lines from the last seven days.
They are already deduplicated. Read them as follows:

- "fact:" something that happened or is true. Keep it if it will still matter.
- "preference:" how this user wants the work done. Keep it as a preference.
- "correction:" the user overruling something. A correction wins: write it as a
  rule ("Never ...", "Always ..."), keep it even when the same week's other
  lines disagree, and discard whatever it contradicts.
- "question:" something Quincy asked and has not had answered. Never keep one as
  a fact — an unanswered question is not knowledge.`

const EXTRACTION_SCHEMA = jsonSchema<{
  facts: { topic: string; fact: string }[]
}>({
  type: "object",
  properties: {
    facts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          topic: {
            type: "string",
            description:
              "kebab-case grouping, e.g. 'working-style', 'shipped-work'",
          },
          fact: { type: "string" },
        },
        required: ["topic", "fact"],
        additionalProperties: false,
      },
    },
  },
  required: ["facts"],
  additionalProperties: false,
})

export type Extraction = { topic: string; fact: string }[]

/**
 * `facts` is `null` when the extraction came back malformed — see `factsFrom`.
 * `usage` rides along so `runHeartbeat` can meter, the same shape
 * `VoiceExtractor` uses in lib/voice.ts.
 *
 * **The malformed case is a value rather than a throw, and that is the point.**
 * The failure still has to end in a throw — `runHeartbeat` does that — but the
 * throw has to happen *after* metering, and only `runHeartbeat` knows the
 * userId to meter against. An extractor that threw would take two paid attempts
 * with it and record neither, which is precisely the invisible spend this
 * contract was widened to fix.
 *
 * `usage` is optional because a stub extractor — `scripts/verify-heartbeat.ts`
 * has one — spends nothing and should not have to pretend otherwise.
 */
export type Extractor = (
  captures: string[],
  ledger?: LedgerEntry[]
) => Promise<{ facts: Extraction | null; usage?: StructuredUsage }>

/**
 * An empty list is an answer; a non-array is a failure. The difference matters.
 *
 * "Most input is not worth keeping" is what `EXTRACT_PROMPT` asks for, so `[]`
 * is this extractor's most common *correct* result and must advance the
 * watermark like any other successful run. A non-array after two attempts is
 * the Gateway mangling, and treating it as `[]` would be silent data loss
 * rather than a degradation: `runHeartbeat` appends the watermark
 * unconditionally at the end, so the captures this run failed to read are
 * filtered out of the next one and never compiled at all.
 *
 * A throw is what the surrounding code already asks for. The watermark write is
 * last precisely so that "if anything above threw, the next run reads the same
 * captures again", and `runHeartbeatForEveryone` wraps each user in a try/catch
 * so one bad inbox cannot stop the rest. This failure just has to announce
 * itself to reach either — after the bill is recorded.
 *
 * Exported for the test, matching how the repo treats other internals.
 */
export function factsFrom(object: { facts: unknown }): Extraction | null {
  return Array.isArray(object.facts) ? object.facts : null
}

/**
 * The two blocks the compile reads, in one prompt.
 *
 * Two blocks and not one list. The captures are raw turns in the order they
 * were said; the ledger lines are typed, deduplicated and newest first.
 * Flattening them together would lose exactly the thing the types carry — a
 * `correction:` reads as one more sentence somebody typed, rather than as the
 * line that overrules the three above it.
 *
 * Exported for the test, like `factsFrom`: this is the only place the merged
 * ledger becomes something a model can act on, and it is pure.
 */
export function compilePrompt(
  captures: string[],
  ledger: LedgerEntry[] = []
): string {
  const raw = captures.length
    ? `Raw captures since the last compaction:\n${captures
        .map((c) => `- ${c}`)
        .join("\n")}`
    : ""

  return [raw, renderLedgerLines(ledger)].filter(Boolean).join("\n\n")
}

const modelExtractor: Extractor = async (captures, ledger = []) => {
  const spent = usageAccumulator()
  const prompt = compilePrompt(captures, ledger)

  const object = await retryMalformed(
    async () => {
      const { object, usage } = await generateObject({
        model: MODEL,
        providerOptions: REASONING,
        schema: EXTRACTION_SCHEMA,
        system: EXTRACT_PROMPT,
        prompt,
      })

      // Counted before the result is judged. A malformed answer costs exactly
      // what a good one costs.
      spent.add(usage)

      return unwrapStringifiedObject(object, ["facts"], ["facts"])
    },
    (object) => Array.isArray(object.facts),
    { label: "heartbeat/extract" }
  )

  return { facts: factsFrom(object), usage: spent.total }
}

/**
 * The inline write. One insert per turn, no model call, no judgment. Judgment
 * is Heartbeat's job, and it is cheaper to discard a row later than to decide
 * mid-conversation that something was not worth keeping.
 *
 * Two destinations since plan 027's 3c, and the order matters. The inbox event
 * is written first and is unchanged — it is what the watermark counts and what
 * the weekly compile reads, so nothing about the ledger may put it at risk.
 * The ledger line is written second, typed by `classifyCapture`, and its
 * failure is logged rather than thrown: a ledger that cannot be appended to is
 * a worse memory, while a capture that was never stored is a lost turn.
 *
 * The classifier is pure. A model call here would sit between the user pressing
 * enter and the turn being saved, to pick a label that is cheap to get wrong —
 * and "cannot classify" falls back to `fact`, which is what capture did before
 * this existed.
 */
export async function captureTurn({
  userId,
  source,
  text,
  at = new Date(),
  timezone,
}: {
  userId: string
  source: string
  text: string
  at?: Date
  timezone?: string | null
}) {
  const trimmed = text.replace(/\s+/g, " ").trim()
  if (trimmed.length < MIN_CAPTURE_LENGTH) {
    return null
  }

  let inbox = await getPage(userId, INBOX_SLUG)
  if (!inbox) {
    inbox = await putPage({
      userId,
      slug: INBOX_SLUG,
      kind: "memory",
      title: "Capture inbox",
      body: "",
      provenance: "inferred",
    })
  }

  const event = await appendEvent({
    pageId: inbox.id,
    source,
    summary: trimmed.slice(0, 2000),
  })

  try {
    await appendLedger(userId, {
      type: classifyCapture(trimmed),
      text: trimmed,
      source: "chat",
      at,
      timezone,
    })
  } catch (cause) {
    console.error(
      `[heartbeat] could not append the ledger for ${userId}:`,
      cause
    )
  }

  return event
}

export type HeartbeatResult = {
  userId: string
  captures: number
  factsWritten: number
  pagesTouched: string[]
  skipped: string[]
  /** Typed ledger lines the compile was shown, after dedupe and the cap. */
  ledgerLines: number
  /** Lines the dedupe rule merged away while reading the week. */
  ledgerDropped: number
  /** Lines the 12 KB ceiling cut, oldest first. */
  ledgerCut: number
}

/**
 * Compile one user's inbox into memory pages.
 *
 * Idempotent by construction: the watermark is the newest `compile` event on
 * the inbox, so a re-run after a crash reads the same captures and rewrites the
 * same pages. Nothing is consumed.
 */
export async function runHeartbeat({
  userId,
  extract = modelExtractor,
  now = new Date(),
}: {
  userId: string
  extract?: Extractor
  now?: Date
}): Promise<HeartbeatResult> {
  const result: HeartbeatResult = {
    userId,
    captures: 0,
    factsWritten: 0,
    pagesTouched: [],
    skipped: [],
    ledgerLines: 0,
    ledgerDropped: 0,
    ledgerCut: 0,
  }

  const inbox = await getPage(userId, INBOX_SLUG)
  if (!inbox) return result

  const events = await getEvents(inbox.id)
  const watermark = events
    .filter((e) => e.kind === "compile")
    .at(-1)?.observedAt

  const captures = events.filter(
    (e) => e.kind === "observation" && (!watermark || e.observedAt > watermark)
  )

  result.captures = captures.length
  if (captures.length === 0) return result

  /**
   * The week's ledger, merged before the model sees it.
   *
   * Every ledger line came from a capture, so a run with no new captures has
   * nothing new in the ledger either — which is why this sits after the early
   * return rather than before it, and why "no captures" still costs nothing.
   *
   * Deduped across days with the same rule `appendLedger` uses within a day: a
   * preference said on Monday and again on Thursday is one line, not two votes.
   * Then bounded, newest first, so a talkative fortnight cannot decide what one
   * compile costs. The compile note below says what was cut.
   */
  const merged = await mergeLedger(userId, { now })
  const bounded = boundLedger(merged.lines)

  result.ledgerLines = bounded.lines.length
  result.ledgerDropped = merged.dropped
  result.ledgerCut = bounded.cut

  const { facts, usage } = await extract(
    captures.map((c) => c.summary),
    bounded.lines
  )

  /**
   * Metered here rather than inside `modelExtractor`, matching every other
   * model call site in the product: this is the layer that knows the userId.
   * The call already happened, so a bookkeeping failure logs and is dropped
   * rather than undoing work — and rather than throwing, which here would also
   * hold the watermark back and re-read captures that were compiled fine.
   *
   * Before this, heartbeat was the one model call in the product that spent
   * without leaving a `usage_event` row, so /credits could not account for it.
   * A cron that spends per user with nobody present is the last place that
   * should be invisible.
   */
  if (usage) {
    try {
      await recordUsage({
        userId,
        model: MODEL,
        inputTokens: usage.inputTokens,
        cachedInputTokens: usage.cachedInputTokens,
        outputTokens: usage.outputTokens,
      })
    } catch (cause) {
      console.error("[heartbeat] could not record usage:", cause)
    }
  }

  /**
   * After metering, deliberately.
   *
   * Two attempts were generated and charged whether or not either was usable,
   * so the bill is recorded first and the run abandoned second. Throwing here
   * leaves the watermark unwritten, which is the whole point: these captures
   * are read again on the next run instead of being skipped forever.
   */
  if (facts === null) {
    throw new Error(
      "[heartbeat] extraction came back malformed twice — leaving the watermark unmoved so the next run retries"
    )
  }

  // Group first: one page write per topic rather than one per fact, so a topic
  // that picked up three facts this week is rewritten once.
  const byTopic = new Map<string, string[]>()
  for (const { topic, fact } of facts) {
    const slug = `memory/${topic.replace(/[^a-z0-9-]/gi, "-").toLowerCase()}`
    byTopic.set(slug, [...(byTopic.get(slug) ?? []), fact])
  }

  for (const [slug, topicFacts] of byTopic) {
    const existing = await getPage(userId, slug)

    // What makes "your corrections stick" a property rather than a promise.
    //
    // The test is provenance, not timestamps. Comparing a correction's time
    // against the newest capture reads at page level, and at page level you
    // cannot tell "the user revised this exact claim" from "the user mentioned
    // something else on the same topic". The first version of this rule let a
    // contradiction be appended under a correction, which is worse than being
    // out of date: a page asserting both halves gives the model no way to pick.
    //
    // So: once the user has edited a memory page it is theirs, and Heartbeat
    // stops writing to it. Deliberately stubborn. The facts are not lost — they
    // land as events on the page, where a review surface can show them — and
    // the watermark still advances, so nothing is retried forever.
    if (existing?.provenance === "user") {
      for (const fact of topicFacts) {
        await appendEvent({
          pageId: existing.id,
          source: "heartbeat",
          confidence: "low",
          summary: fact,
          detail: "Not written: this page is user-owned. Needs review.",
        })
      }
      result.skipped.push(slug)
      continue
    }

    // Append rather than replace. A compiled memory page is a list of facts,
    // and re-deriving the whole list from an inbox that only holds new captures
    // would drop everything learned before the last watermark.
    const kept = existing?.body ? `${existing.body.trim()}\n` : ""
    const page = await putPage({
      userId,
      slug,
      kind: "memory",
      title: existing?.title ?? titleFor(slug),
      body: `${kept}${topicFacts.map((f) => `- ${f}`).join("\n")}`,
      provenance: "inferred",
    })

    await appendEvent({
      pageId: page.id,
      kind: "compile",
      source: "heartbeat",
      summary: `Compiled ${topicFacts.length} fact(s) from ${captures.length} capture(s)`,
    })

    result.pagesTouched.push(slug)
    result.factsWritten += topicFacts.length
  }

  // The watermark, written last. If anything above threw, the next run reads
  // the same captures again — which is exactly what we want.
  //
  // It is also the compile note, and it says what the model was not shown. A
  // ceiling that silently drops the oldest half of a fortnight is the kind of
  // thing that is only ever noticed as "it forgot".
  await appendEvent({
    pageId: inbox.id,
    kind: "compile",
    source: "heartbeat",
    summary: ledgerNote(
      `Processed ${captures.length} capture(s) at ${now.toISOString()}`,
      result
    ),
  })

  return result
}

/**
 * What the compile saw of the ledger, in one sentence, appended to the note.
 *
 * Exported for the test: the cut is the only part of a heartbeat run that a
 * later reader cannot reconstruct from the pages, because the lines that were
 * cut are exactly the ones that left no trace.
 */
export function ledgerNote(
  prefix: string,
  result: Pick<HeartbeatResult, "ledgerLines" | "ledgerDropped" | "ledgerCut">
): string {
  if (
    result.ledgerLines === 0 &&
    result.ledgerDropped === 0 &&
    result.ledgerCut === 0
  ) {
    return prefix
  }

  const parts = [`${result.ledgerLines} ledger line(s)`]
  if (result.ledgerDropped > 0) {
    parts.push(`${result.ledgerDropped} merged as duplicates`)
  }
  if (result.ledgerCut > 0) {
    parts.push(
      `${result.ledgerCut} cut at the ${LEDGER_COMPILE_BYTES / 1024} KB cap`
    )
  }

  return `${prefix} — ${parts.join(", ")}`
}

function titleFor(slug: string) {
  const leaf = slug.split("/").at(-1) ?? slug
  return leaf.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase())
}

/** Every user with something waiting. Serial on purpose: see the note above. */
export async function runHeartbeatForEveryone(extract?: Extractor) {
  // Joined to `user` for one reason: entitlement. The inbox alone cannot tell
  // us whether this account is still allowed to cost money.
  const rows = await db
    .selectDistinct({ userId: brainPage.userId, trialEndsAt: user.trialEndsAt })
    .from(brainPage)
    .innerJoin(user, eq(user.id, brainPage.userId))
    .where(eq(brainPage.slug, INBOX_SLUG))

  const results: HeartbeatResult[] = []
  const unentitled: string[] = []

  for (const { userId, trialEndsAt } of rows) {
    /**
     * The gate the request path cannot reach.
     *
     * Nothing here runs inside a request, so no amount of checking in
     * app/api/chat or in the app layout touches it. Without this line an
     * account whose free day ended in March keeps making a model call every
     * Monday at 22:17, forever, and the only symptom is the bill.
     *
     * Compaction is also the one place where skipping is nearly free: the
     * inbox is append-only and the watermark is unmoved, so a user who starts
     * paying later gets their whole backlog compiled on the next run rather
     * than losing it.
     *
     * `resolveEntitlement` here is the pure resolver from lib/entitlement.ts —
     * it never writes, so this cron can never start anybody's trial while
     * they are asleep.
     */
    const entitlement = await resolveEntitlement({ id: userId, trialEndsAt })

    if (!isEntitled(entitlement)) {
      unentitled.push(userId)
      continue
    }

    try {
      results.push(await runHeartbeat({ userId, extract }))
    } catch (cause) {
      // One user's bad inbox must not stop the rest. The watermark for this
      // user is unmoved, so the next run picks them up again.
      console.error(`[heartbeat] ${userId} failed:`, cause)
    }
  }

  return { results, unentitled }
}
