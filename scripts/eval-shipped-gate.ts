/**
 * Does the gate agree with a human about what is worth a post? See plans/021.
 *
 * ```
 * npx tsx --env-file=.env.local scripts/eval-shipped-gate.ts
 * npx tsx --env-file=.env.local scripts/eval-shipped-gate.ts --models openai/gpt-5.6-luna,anthropic/claude-sonnet-5
 * npx tsx --env-file=.env.local scripts/eval-shipped-gate.ts --only "The chat can put"
 * ```
 *
 * **Why this exists.** `selectShippedPassage` decides whether a merged pull
 * request becomes a riff, and until now the only way to learn that it decided
 * badly was to merge something and read three angles about a log line. That
 * happened on 2026-08-21 with a real installation. A prompt whose only test is
 * production is a prompt nobody can improve on purpose — every rewrite is an
 * opinion against another opinion.
 *
 * **The material is real and it is not embedded.** The fixture below is a list
 * of commit subjects and one boolean each; the descriptions are read out of
 * `git log` when this runs. A hand-written pull request body would agree with
 * whatever the prompt happens to do. These are the merges that actually landed,
 * with the prose that actually shipped with them.
 *
 * Keyed by subject rather than by SHA on purpose. A subject survives a rebase
 * and a history rewrite; a SHA does not, and a fixture that silently matches
 * nothing scores 100% on an empty set.
 *
 * **The label answers one question**: would somebody who *uses* Quincy notice
 * this? Not "is it interesting" — most of the `false` rows below are the most
 * interesting engineering in the repository. That distinction is the whole
 * point of the gate, and the rows where it is hardest are marked.
 *
 * No database and no network beyond the model. It spends: one call per fixture
 * row per model, on the cheapest call in the product.
 */
import { execFileSync } from "node:child_process"

import {
  descriptionBlocks,
  selectShippedPassage,
  SHIPPED_MODEL,
} from "../lib/shipped-work"

/**
 * One row per merge. `material` is the human answer.
 *
 * Marked `hard` where a reasonable person could argue the other way. Those are
 * the rows worth reading the disagreements on; a model that gets every easy row
 * right and every hard row wrong is a model that has learned "long description
 * means yes".
 */
type Row = { subject: string; material: boolean; hard?: true; note?: string }

const FIXTURE: Row[] = [
  // ── Changed something a user meets ──────────────────────────────────────
  { subject: "Voice rules now carry the frequency they were measured at.", material: true },
  { subject: "An angle now says what kind of post it is, not only how long.", material: true },
  { subject: "Quincy picks the posts that match the subject, and stops writing like a model.", material: true },
  { subject: "Quincy reads the user's posts before writing as them.", material: true },
  { subject: "First run stops asking and starts working.", material: true },
  { subject: "A stale cookie stops sending people back to the page they asked for.", material: true },
  { subject: "Quincy said it could see the account, not that it had read nothing of it.", material: true },
  { subject: "A capture that gets killed now leaves nothing instead of a corpse.", material: true },
  { subject: "The chat can put material on the desk, not only read it.", material: true },
  { subject: "The desk offered a scrap Quincy had lost 42 hours earlier.", material: true },
  { subject: "The chat can finally read the tables the pages read.", material: true },
  { subject: "Somebody hears about it when the scheduled work stops.", material: true },
  { subject: "A captured timezone takes effect on the next render.", material: true },
  { subject: "The editor says when the draft is your own hook.", material: true },
  { subject: "The activity graph comes alive.", material: true },
  {
    subject: "A merge that carries no post now says so, instead of going quiet.",
    material: true,
    hard: true,
    note: "Most of it is plumbing. The visible part is one sentence on /sources.",
  },

  // ── Changed only how the same behaviour is built ────────────────────────
  { subject: "The plans cite lessons, not the tool they came from.", material: false },
  { subject: "The connectors get their facts before they get their code.", material: false },
  { subject: "The first-run test walks the flow that actually shipped.", material: false },
  { subject: "Prettier and the Tailwind class sorter catch up with the tree.", material: false },
  { subject: "The log catches up with the two days it missed.", material: false },
  { subject: "Nobody but one laptop could install this repository.", material: false },
  { subject: "The old branches leave, and say where they went.", material: false },
  { subject: "The plan indexes say what is true again.", material: false },
  { subject: "Four high advisories leave, and the CLI stops shipping.", material: false },
  { subject: "Every mutating script now asks who it is about to touch.", material: false },
  { subject: "The fixtures go, now that the tables can answer.", material: false },
  { subject: "Every push now answers to typecheck, lint and tests.", material: false },
  { subject: "The lint baseline reaches zero so the gate can be honest.", material: false },
  {
    subject: "Luna at low effort, and the reason is measured rather than argued.",
    material: false,
    hard: true,
    note: "Excellent writing and a real measurement, and nothing a user meets. The clearest case of interesting-but-not-material in the repository.",
  },
  {
    subject: "A cheap model needs its price in the table before it needs a deploy.",
    material: false,
    hard: true,
    note: "It prevented a spend ceiling from locking accounts out — a bug no user ever hit.",
  },
  {
    subject: "A model that says nothing gets the second attempt it was promised.",
    material: false,
    hard: true,
    note: "Fewer failed riffs, but nothing is different on screen when it works.",
  },
]

const argv = process.argv.slice(2)

function flag(name: string): string | undefined {
  const at = argv.indexOf(`--${name}`)
  return at > -1 ? argv[at + 1] : undefined
}

const MODELS = (flag("models") ?? SHIPPED_MODEL).split(",").map((m) => m.trim())
const ONLY = flag("only")

/**
 * The description as it was written, straight out of the history.
 *
 * `-1` and `--fixed-strings` on the subject: several of these read like
 * sentences and one of them contains a full stop that is a regex wildcard away
 * from matching a different commit.
 */
function bodyFor(subject: string): { title: string; body: string } | null {
  const raw = execFileSync(
    "git",
    [
      "log",
      "-1",
      `--grep=${subject}`,
      "--fixed-strings",
      "--format=%s%n---BODY---%n%b",
      "main",
    ],
    { encoding: "utf8" }
  ).trim()

  if (!raw) return null

  const [title, body = ""] = raw.split("\n---BODY---\n")

  return {
    title,
    // The trailer is not part of what was written about the change, and it
    // appears on every row, so leaving it in teaches nothing and costs tokens.
    // `[\s\S]` rather than the `s` flag, which this tsconfig's target rejects.
    body: body.replace(/\n*Co-Authored-By:[\s\S]*$/, "").trim(),
  }
}

type Score = { right: number; wrong: number; missing: number }

async function runModel(model: string): Promise<Score> {
  const score: Score = { right: 0, wrong: 0, missing: 0 }
  const disagreements: string[] = []

  console.log(`\n${"═".repeat(72)}\n  ${model}\n${"═".repeat(72)}`)

  for (const row of FIXTURE) {
    if (ONLY && !row.subject.includes(ONLY)) continue

    const commit = bodyFor(row.subject)

    if (!commit) {
      // Loud rather than skipped. A fixture that has drifted off the history
      // is a fixture that scores well by measuring nothing.
      console.log(`  ????  not in the history — ${row.subject}`)
      score.missing++
      continue
    }

    const blocks = descriptionBlocks(commit)

    const selection = await selectShippedPassage({
      blocks,
      repository: "Codehagen/Quincy",
      // Deliberately empty. The brain carries a voice, and a voice must not be
      // able to change the answer to "did this change anything".
      brain: "",
      model,
    })

    const said = selection.passage.length > 0
    const agrees = said === row.material

    if (agrees) score.right++
    else score.wrong++

    const mark = agrees ? "pass" : "FAIL"
    const hard = row.hard ? " (hard)" : ""
    console.log(`  ${mark}  ${row.material ? "post    " : "not-post"}${hard}  ${row.subject}`)

    if (!agrees) {
      disagreements.push(
        [
          `  ${row.subject}`,
          `    human: ${row.material ? "post" : "not a post"}${row.note ? ` — ${row.note}` : ""}`,
          `    model: ${said ? "post" : "not a post"} — ${selection.why}`,
          said ? `    claim: ${selection.claim || "(none)"}` : "",
        ]
          .filter(Boolean)
          .join("\n")
      )
    } else if (said) {
      console.log(`        claim: ${selection.claim || "(none)"}`)
    }
  }

  const total = score.right + score.wrong

  console.log(
    `\n  ${score.right}/${total} agree` +
      (score.missing ? `, ${score.missing} not found in the history` : "")
  )

  if (disagreements.length) {
    console.log(`\n  ── where it disagreed ──\n`)
    console.log(disagreements.join("\n\n"))
  }

  return score
}

async function main() {
  console.log(
    `Reading ${FIXTURE.length} real merges out of git log.` +
      (ONLY ? ` Filtered to "${ONLY}".` : "")
  )

  const results: [string, Score][] = []

  for (const model of MODELS) {
    results.push([model, await runModel(model)])
  }

  if (results.length > 1) {
    console.log(`\n${"═".repeat(72)}\n  summary\n${"═".repeat(72)}`)
    for (const [model, s] of results) {
      console.log(`  ${s.right}/${s.right + s.wrong}  ${model}`)
    }
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
