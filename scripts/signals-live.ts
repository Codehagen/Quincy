/**
 * The dry run for Trend Alerts, in two steps, so the reading and the judgment
 * can be looked at separately:
 *
 *   scan     Read Hacker News and GitHub and print what came back. Free —
 *            both origins cost nothing and no model is called. This is the
 *            "is the data right?" gate before any spend.
 *   select   One real model call: the scan, judged against a real brain, with
 *            the picks and the reasoning printed so they can be argued with.
 *            Writes nothing — no source_item rows, no riffs.
 *
 * Usage:
 *   npx tsx --env-file=.env.local scripts/signals-live.ts scan
 *   npx tsx --env-file=.env.local scripts/signals-live.ts select --email=you@example.com
 *
 * **Neither step writes.** That is the whole point of the file: the handler in
 * lib/rhythm-handlers.ts stores rows and creates riffs, and a dry run that did
 * the same would leave a real account holding riffs about whatever the
 * internet was loud about while somebody was testing. The step this cannot
 * exercise is therefore `createRiffFromPost`, which lib/riffs.ts already
 * covers — what is worth watching here is the selection, because it is the
 * only part whose failure looks like success.
 *
 * The STOP condition, borrowed from scripts/corpus-x-live.ts: if `select`
 * returns picks on topics you have no first-hand claim on, the prompt is
 * wrong and no amount of downstream drafting fixes it. Zero picks is a pass,
 * not a failure — see the note it prints.
 */
import { eq } from "drizzle-orm"

import { renderStandingBrain } from "../lib/brain"
import { db } from "../lib/db"
import { user } from "../lib/schema"
import {
  ORIGIN_LABEL,
  readSignals,
  selectSignals,
  type Signal,
} from "../lib/signals"

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`))
  return hit?.slice(name.length + 3)
}

function line(signal: Signal, index: number) {
  const where = ORIGIN_LABEL[signal.origin]
  return [
    `${String(index + 1).padStart(2)}. [${where}] ${signal.title}`,
    `    ${signal.heat}`,
    signal.blurb ? `    ${signal.blurb.slice(0, 110)}` : "",
    `    ${signal.url}`,
  ]
    .filter(Boolean)
    .join("\n")
}

async function scan() {
  const started = Date.now()
  const signals = await readSignals()
  const took = ((Date.now() - started) / 1000).toFixed(1)

  const byOrigin = new Map<string, number>()
  for (const signal of signals) {
    byOrigin.set(signal.origin, (byOrigin.get(signal.origin) ?? 0) + 1)
  }

  console.log(`\n${signals.length} signals in ${took}s`)
  for (const [origin, count] of byOrigin) {
    console.log(`  ${ORIGIN_LABEL[origin as Signal["origin"]]}: ${count}`)
  }

  // An origin missing entirely is the failure worth seeing, and it is silent
  // by design — `getJson` returns null so one API being down cannot cost the
  // other. Named here because a dry run is where you want it loud.
  if (!byOrigin.has("hacker-news")) console.log("  ⚠ Hacker News returned nothing")
  if (!byOrigin.has("github-repo")) {
    console.log(
      "  ⚠ GitHub returned nothing — rate limit, if GITHUB_TOKEN is unset"
    )
  }

  console.log("")
  signals.forEach((signal, index) => console.log(line(signal, index)))

  return signals
}

async function select() {
  const email = arg("email")

  const rows = email
    ? await db.select().from(user).where(eq(user.email, email)).limit(1)
    : await db.select().from(user).limit(2)

  if (rows.length === 0) {
    throw new Error(email ? `No user ${email}.` : "No users in this database.")
  }

  // Refuses to guess, matching corpus-x-live.ts: a brain is the input being
  // tested, and running against the wrong one produces a plausible answer
  // about the wrong person.
  if (!email && rows.length > 1) {
    throw new Error("More than one user — pass --email=.")
  }

  const target = rows[0]
  const signals = await scan()

  if (signals.length === 0) {
    console.log("\nNothing to select from.")
    return
  }

  const brain = await renderStandingBrain(target.id)

  console.log(`\nBrain for ${target.email}: ${brain.length} characters`)

  if (brain.length === 0) {
    // Worth stopping on rather than reporting as a clean zero: with no brain
    // there is no standing to test against, so "nothing qualified" would be
    // true for a reason that has nothing to do with the prompt.
    console.log(
      "⚠ Empty brain — the selection has nothing to judge standing against."
    )
  }

  console.log("One model call, judging standing…")

  const started = Date.now()
  const selection = await selectSignals({
    candidates: signals.map((signal, index) => ({
      // The row id in production; the index here, because nothing is stored.
      id: String(index),
      origin: signal.origin,
      text: [signal.title, signal.blurb].filter(Boolean).join("\n"),
      heat: signal.heat,
    })),
    brain,
    limit: 2,
  })
  const took = ((Date.now() - started) / 1000).toFixed(1)

  const usage = selection.usage
  console.log(
    `\nAnswered in ${took}s` +
      (usage
        ? ` — ${usage.inputTokens} in, ${usage.outputTokens} out`
        : "")
  )

  if (selection.picks.length === 0) {
    console.log(
      "\nNo picks. That is a pass, not a failure — most days nothing the\n" +
        "world is loud about is something this person has earned the right to\n" +
        "add to. Judge it by reading the list above and disagreeing."
    )
    return
  }

  console.log(`\n${selection.picks.length} would become riffs:\n`)

  for (const pick of selection.picks) {
    const signal = signals[Number(pick.id)]
    if (!signal) continue
    console.log(`  [${ORIGIN_LABEL[signal.origin]}] ${signal.title}`)
    console.log(`  ${signal.heat} — ${signal.url}`)
    console.log(`  why: ${pick.why}\n`)
  }

  console.log(
    "Nothing was written. In a real run each of these would be read in full\n" +
      "— the discussion or the README — and turned into a riff on /riffs."
  )
}

async function main() {
  const step = process.argv[2]

  if (step === "scan") {
    await scan()
    return
  }

  if (step === "select") {
    await select()
    return
  }

  console.log(
    "Usage:\n" +
      "  npx tsx --env-file=.env.local scripts/signals-live.ts scan\n" +
      "  npx tsx --env-file=.env.local scripts/signals-live.ts select --email=you@example.com"
  )
  process.exitCode = 1
}

main().then(
  () => process.exit(0),
  (cause) => {
    console.error(cause)
    process.exit(1)
  }
)
