/**
 * Does the emoji fix actually change what the model writes?
 *
 *   npx tsx --env-file=.env.local scripts/verify-draft-variety.ts
 *   npx tsx --env-file=.env.local scripts/verify-draft-variety.ts --runs 4
 *
 * Every other check on this change is structural — tsc, three unit tests over
 * `describeRecent`, a hand-run of the join. None of them can tell you whether
 * a draft still opens on a claim plus 🤯, because that is a fact about a model
 * reading a prompt, not about the code that builds it. So this runs both
 * prompts, real gateway, real brain, and counts.
 *
 * **Read-only.** It reads the user's brain pages and their recent drafts and
 * writes nothing, meters nothing. The generation is thrown away after it is
 * counted.
 *
 * The control arm reconstructs the prompt as it stood before this change: the
 * old "follow the observed habit" rule, and `renderBrain`'s old flattening of
 * every voice page under one unlabelled `## Voice` heading. It is a copy, and
 * a copy can drift from the thing it copies — but the alternative is comparing
 * against nothing and calling the new numbers good.
 *
 * Hooks are stripped of their own emoji on purpose. A hook that arrives
 * carrying 🤯 proves nothing about the drafting prompt: the model would be
 * echoing the input. These ask the narrower question — left alone, does it
 * reach for the same emoji anyway?
 */
import { generateObject, jsonSchema } from "ai"

import { getBrain, renderBrain, type BrainPage } from "../lib/brain"
import { recentlyWritten } from "../lib/drafts"
import { describeConstraints, generateDraft, targetsFor } from "../lib/drafting"
import { unwrapStringifiedObject } from "../lib/structured-output"

const USER = process.env.VARIETY_USER_ID ?? "QrlBbyNzRMiTlktXU8WFFQFaTUTUNVWz"
const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

const runsFlag = process.argv.indexOf("--runs")
const RUNS = runsFlag > -1 ? Number(process.argv[runsFlag + 1]) : 4

/** Real angles from riff_angle, with the trailing 🤯 removed. See above. */
const HOOKS = [
  "building alone in silence is where projects go to quietly die",
  "everyone wants the exit story. nobody wants the years before it that looked like nothing",
  "i sell real estate by day and ship products by night, here's what one actually taught me about the other",
  "88% failure rate sounds brutal until you say the real number out loud",
  "follower count is about to stop mattering. interest media is coming for social media",
  "my GitHub contributions went from 2410 to 6126 year over year. same person, same hours in a day",
].slice(0, Math.max(1, RUNS))

const CHANNELS = targetsFor("Short post", ["x", "linkedin"])

/* ── The control: the prompt as it stood before 2026-08-09 ──────────────── */

const OLD_IDENTITY = `You are Quincy, an AI Head of Content. Someone has already picked the angle — the hook below is the opening line they chose, and the whole bet on any platform. Your job is to write it out as a finished post. The post goes out under the writer's own name, not yours: match how they actually write, not how a generic ghostwriter would.`

const OLD_RULES = `Rules:
- Write in the user's voice as described below. If it names an observed habit, follow it; if it says the user never does something, never do it.
- Adapt each version to its own channel. Two versions of the same idea must not be the same text with different line breaks — the platform, the fold and the reader are different each time.
- Whatever the idea's shape (short post, thread, carousel, essay), write exactly one post per channel — never a numbered list of parts, thread markers like "1/", or a script for a multi-post sequence. If the idea needs more than one post's worth of space, write the strongest single post that carries it rather than splitting it.
- Never invent a fact, number, date or outcome that is not in the material below or the brain's story pages.
- Write in English unless the brain instructs otherwise.
- Output the post text only: no preamble, no "Here's your post", no surrounding quotes, and no hashtags unless the brain shows the user actually uses them.`

/** `renderBrain` before this change: every voice page flattened under one
 *  unlabelled heading, with no line saying a habit is not an instruction. */
function renderBrainOldWay(pages: BrainPage[]): string {
  const rendered = renderBrain(pages)
  const voiceRules = pages
    .filter((p) => p.kind === "voice")
    .flatMap((p) => ((p.data as { rules?: string[] }).rules ?? []))
    .map((r) => `- ${r}`)
    .join("\n")

  // Everything the new render produces except its voice sections, then the
  // old flat one bolted back on in their place.
  const withoutVoice = rendered
    .split("\n\n## ")
    .filter((section) => !section.startsWith("Voice"))
    .join("\n\n## ")

  return voiceRules ? `## Voice\n\n${voiceRules}\n\n${withoutVoice}` : withoutVoice
}

const SCHEMA = jsonSchema<{ versions: { channel: string; body: string }[] }>({
  type: "object",
  properties: {
    versions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          channel: { type: "string", enum: CHANNELS.map((c) => c.id) },
          body: { type: "string" },
        },
        required: ["channel", "body"],
        additionalProperties: false,
      },
    },
  },
  required: ["versions"],
  additionalProperties: false,
})

/**
 * One control generation, or an empty list.
 *
 * The control has no `retryMalformed` around it — it is the old call as it
 * stood — so a `NoObjectGeneratedError` reaches this frame and would
 * otherwise abort the whole run and lose the arm that already succeeded.
 * A lost control run is a smaller sample, not a failed experiment.
 */
async function generateOldWay(hook: string, brain: string) {
  let object: { versions: unknown }
  try {
    ;({ object } = await generateObject({
      model: MODEL,
      schema: SCHEMA,
      system: `${OLD_IDENTITY}\n\n${OLD_RULES}\n\n${brain}`,
      prompt: [
        `Hook: ${hook}`,
        `Shape: Short post`,
        `Source: Pasted`,
        `Write one post for each of these channels, matching its own constraints:\n${describeConstraints(CHANNELS)}`,
      ].join("\n\n"),
    }))
  } catch (cause) {
    console.warn(
      `\n  control run threw, skipping it: ${cause instanceof Error ? cause.message : cause}`
    )
    return []
  }
  /**
   * The control gets the unwrap too, deliberately.
   *
   * It is testing the old *prompt*, not the old parse. Without this the two
   * arms lose a different number of runs to the Gateway mangling and the
   * emoji percentages are computed over samples selected on different
   * grounds — which is an argument nobody should have to have with a number.
   */
  const unwrapped = unwrapStringifiedObject(object, ["versions"], ["versions"])
  return Array.isArray(unwrapped.versions) ? unwrapped.versions : []
}

/* ── Counting ───────────────────────────────────────────────────────────── */

/** Matches emoji presentation characters. Not exhaustive over all of Unicode;
 *  exhaustive over what a voice rule is likely to mandate. */
const EMOJI = /\p{Extended_Pictographic}/gu
/** The same class without `g`. A global regex carries `lastIndex` across
 *  `.test()` calls and would answer false every other time. */
const HAS_EMOJI = /\p{Extended_Pictographic}/u

function emojiIn(text: string): string[] {
  return text.match(EMOJI) ?? []
}

type Tally = {
  posts: number
  withEmoji: number
  totalEmoji: number
  counts: Map<string, number>
  /** Posts whose last non-empty line ends in an emoji — the ✨ sign-off. */
  emojiSignoff: number
  /** Posts where the first line ends in an emoji — the 🤯 opener. */
  emojiOpener: number
}

function newTally(): Tally {
  return {
    posts: 0,
    withEmoji: 0,
    totalEmoji: 0,
    counts: new Map(),
    emojiSignoff: 0,
    emojiOpener: 0,
  }
}

function tally(t: Tally, body: string) {
  const found = emojiIn(body)
  t.posts += 1
  t.totalEmoji += found.length
  if (found.length > 0) t.withEmoji += 1
  for (const e of found) t.counts.set(e, (t.counts.get(e) ?? 0) + 1)

  const lines = body.split("\n").map((l) => l.trim()).filter(Boolean)
  const first = lines[0] ?? ""
  const last = lines[lines.length - 1] ?? ""
  if (HAS_EMOJI.test(first.slice(-3))) t.emojiOpener += 1
  if (HAS_EMOJI.test(last.slice(-3))) t.emojiSignoff += 1
}

function report(label: string, t: Tally) {
  const pct = (n: number) => `${Math.round((n / Math.max(1, t.posts)) * 100)}%`
  const top = [...t.counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([e, n]) => `${e}×${n}`)
    .join("  ")

  console.log(`\n  ${label}`)
  console.log(`    posts                ${t.posts}`)
  console.log(`    with any emoji       ${t.withEmoji} (${pct(t.withEmoji)})`)
  console.log(`    emoji per post       ${(t.totalEmoji / Math.max(1, t.posts)).toFixed(2)}`)
  console.log(`    emoji-tipped opener  ${t.emojiOpener} (${pct(t.emojiOpener)})`)
  console.log(`    emoji sign-off       ${t.emojiSignoff} (${pct(t.emojiSignoff)})`)
  console.log(`    distinct emoji       ${t.counts.size}${top ? `  —  ${top}` : ""}`)
}

async function main() {
  const pages = await getBrain(USER)
  if (pages.length === 0) throw new Error(`No brain pages for ${USER}`)

  const newBrain = renderBrain(pages)
  const oldBrain = renderBrainOldWay(pages)
  const recent = await recentlyWritten(USER)

  console.log(`Model: ${MODEL}`)
  console.log(`Hooks: ${HOOKS.length}, channels: ${CHANNELS.map((c) => c.id).join(", ")}`)
  console.log(`Avoid-list: ${recent.length} recent post(s)`)
  console.log(
    `Voice rules in play: ${
      pages
        .filter((p) => p.kind === "voice")
        .flatMap((p) => ((p.data as { rules?: string[] }).rules ?? [])).length
    }`
  )

  const before = newTally()
  const after = newTally()
  const samples: { arm: string; hook: string; body: string }[] = []

  for (const hook of HOOKS) {
    const [oldVersions, fresh] = await Promise.all([
      generateOldWay(hook, oldBrain),
      generateDraft({
        hook,
        shape: "Short post",
        scrapOrIdea: hook,
        sourceLabel: "Pasted",
        channels: CHANNELS,
        brain: newBrain,
        recent,
      }),
    ])

    for (const v of oldVersions) {
      tally(before, v.body)
      samples.push({ arm: "before", hook, body: v.body })
    }
    for (const v of fresh.versions) {
      tally(after, v.body)
      samples.push({ arm: "after", hook, body: v.body })
    }
    process.stdout.write(".")
  }

  console.log("")
  report("BEFORE  (old rules, flat voice section, no avoid-list)", before)
  report("AFTER   (new rules, labelled voice section, avoid-list)", after)

  console.log("\n  ── samples ──")
  for (const s of samples) {
    const oneLine = s.body.replace(/\n+/g, " ⏎ ").slice(0, 150)
    console.log(`  [${s.arm.padEnd(6)}] ${oneLine}`)
  }

  const failures: string[] = []
  if (after.emojiOpener > before.emojiOpener) {
    failures.push("emoji-tipped openers did not go down")
  }
  if (after.totalEmoji > before.totalEmoji) {
    failures.push("emoji per post did not go down")
  }
  if (after.counts.size > 0 && after.counts.size < before.counts.size) {
    // Fewer distinct emoji is only bad if the volume did not also fall.
    if (after.totalEmoji >= before.totalEmoji) {
      failures.push("emoji got less varied without getting rarer")
    }
  }

  console.log("")
  if (failures.length) {
    console.log(`FAIL — ${failures.join("; ")}`)
    process.exitCode = 1
  } else {
    console.log("PASS — the new prompt reaches for the signature less often")
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
