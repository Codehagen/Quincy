/**
 * The model A/B on the live merges. See plans/027 item 1f.
 *
 *   npx tsx --env-file=.env.local scripts/ab-shipped-models.ts [--limit N] [--budget-usd 5]
 *
 * Runs the whole shipped pipeline — brief, selection, angles, draft — twice per
 * merge: once on the model this deployment points at today (`DRAFTING_MODEL` /
 * `CHAT_MODEL`), once on `anthropic/claude-sonnet-5`. Every step of a run uses
 * the same model, so the comparison is the pipeline rather than one call.
 *
 * **It writes nothing.** The `source_item` rows and the brain are read with
 * `db.select`; no riff, angle, draft or `usage_event` row is created. That is
 * why it calls the pure pieces — `writeShippedBrief`, `selectShippedPassage`,
 * `generateAnglesFromShipped`, `generateDraft` — rather than the workflow that
 * orchestrates them, whose every step also stores what it bought.
 *
 * **Two child processes, one per model, and that is not an optimisation.**
 * Every call site in the product reads its model id from `process.env` at
 * module load (`MODEL` in lib/shipped-work.ts, lib/adapt.ts, lib/drafting.ts),
 * so a model cannot be overridden per call inside one process without
 * duplicating four prompts here — and a duplicated prompt is an A/B of this
 * file rather than of the product. The parent spawns itself with the env set
 * and reads the results back off disk.
 *
 * Output: /tmp/ab-shipped/{pr}-{A|B}.md, run-{A|B}.json, and summary.md.
 */
import { spawnSync } from "node:child_process"
import { mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { performance } from "node:perf_hooks"

import { desc, eq } from "drizzle-orm"

import { generateAnglesFromShipped } from "../lib/adapt"
import { renderBrainForUser } from "../lib/brain"
import { db } from "../lib/db"
import { recentKinds, recentlyWritten } from "../lib/drafts"
import { generateDraft, targetsFor } from "../lib/drafting"
import { measurePost, CHANNEL_RULES } from "../lib/post-length"
import { estimateCostMicros } from "../lib/pricing"
import { shapesForChannels, type Angle } from "../lib/riffs"
import { user } from "../lib/schema"
import { channelConnection, sourceItem } from "../lib/schema-app"
import {
  descriptionBlocks,
  fillBeats,
  readShippedBeats,
  readShippedFacts,
  readShippedMaterial,
  selectionBlocks,
  selectShippedPassage,
  writeShippedBrief,
  type ShippedBeats,
} from "../lib/shipped-work"
import { voiceExamples } from "../lib/voice"

const OUT = "/tmp/ab-shipped"
const OWNER_EMAIL = "christer.hagen@gmail.com"

/* ── Arguments ───────────────────────────────────────────────────────────── */

function flag(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`)
  return at > -1 && process.argv[at + 1] ? process.argv[at + 1] : fallback
}

/**
 * An argument nobody recognises stops the script, and that is a money guard
 * rather than tidiness.
 *
 * `--help` reached `parent()` on 2026-08-28 and spawned both children — a full
 * paid run bought by a typo. AGENTS.md ("Money") asks for a ceiling on every
 * path that spends; a run this file did not understand is a run it must not
 * start.
 */
const KNOWN = new Set(["--limit", "--budget-usd", "--judge-only"])
for (let i = 2; i < process.argv.length; i++) {
  const arg = process.argv[i]
  if (!arg.startsWith("--")) continue
  if (!KNOWN.has(arg)) {
    console.error(
      `Unknown argument ${arg}. Usage: ab-shipped-models.ts [--limit N] ` +
        `[--budget-usd 5] [--judge-only]. Refusing to run: this script spends.`
    )
    process.exit(1)
  }
}

const LIMIT = Number(flag("limit", "10"))
const BUDGET_USD = Number(flag("budget-usd", "5"))

/** Set by the parent on the child's env. Its presence is what selects the mode. */
const LABEL = process.env.AB_LABEL ?? ""
/** What the other model already spent, so one ceiling covers both runs. */
const ALREADY_USD = Number(process.env.AB_SPENT_USD ?? "0")

const MODEL_A =
  process.env.DRAFTING_MODEL ??
  process.env.CHAT_MODEL ??
  "anthropic/claude-sonnet-5"
const MODEL_B = "anthropic/claude-sonnet-5"

/* ── The record ──────────────────────────────────────────────────────────── */

type Call = {
  step: string
  model: string
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  micros: number
  ms: number
}

type Run = {
  pr: number
  repository: string
  url: string
  sourceItemId: string
  title: string
  descriptionChars: number
  hasMaterial: boolean
  brief: string
  picked: number[]
  passage: string
  why: string
  forUser: string
  beats: ShippedBeats
  refused: boolean
  angleHook: string
  angleShape: string
  angleKind: string
  angleWhy: string
  groundedIn: string
  draft: string
  calls: Call[]
  stopped?: string
}

type RunFile = {
  label: string
  model: string
  runs: Run[]
  microsSpent: number
  ms: number
  stopped: boolean
}

/* ── One model over N merges ─────────────────────────────────────────────── */

async function child(): Promise<void> {
  const model = process.env.CHAT_MODEL ?? MODEL_B
  const started = performance.now()

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, OWNER_EMAIL))
    .limit(1)

  if (!owner) throw new Error(`No user for ${OWNER_EMAIL}.`)

  const rows = await db
    .select()
    .from(sourceItem)
    .where(eq(sourceItem.source, "github"))
    .orderBy(desc(sourceItem.postedAt))
    .limit(LIMIT)

  // Read once and reused across every merge, exactly as one workflow run would
  // read it per merge. Two forms, because the pipeline uses two: the brief gets
  // the index form (lib/brain.ts's default), everything downstream gets the
  // stories in full because none of these calls has tools.
  const [brainIndex, brainFull, connections, kinds, recent] = await Promise.all(
    [
      renderBrainForUser(owner.id),
      renderBrainForUser(owner.id, { stories: "full" }),
      /**
       * Two columns, not `listConnections`.
       *
       * `channel_connection.last_metrics_at` is in lib/schema-app.ts and not in
       * the database — plans/027 2c writes the migration and leaves it
       * unapplied — so `select()` on that table throws 42703 against the live
       * branch. This experiment may not apply a migration, and it only needs
       * which channels are live.
       */
      db
        .select({
          channel: channelConnection.channel,
          state: channelConnection.state,
        })
        .from(channelConnection)
        .where(eq(channelConnection.userId, owner.id)),
      recentKinds(owner.id).catch(() => [] as string[]),
      recentlyWritten(owner.id).catch(() => [] as string[]),
    ]
  )

  const shapes = shapesForChannels(
    connections.filter((c) => c.state === "active").map((c) => c.channel)
  )

  let micros = 0
  let stopped = false
  const budgetMicros = Math.round(BUDGET_USD * 1_000_000)
  const spentElsewhere = Math.round(ALREADY_USD * 1_000_000)

  /** The ceiling AGENTS.md asks for, checked before every call rather than after. */
  const room = (): boolean => spentElsewhere + micros < budgetMicros

  const runs: Run[] = []

  /**
   * Written after every merge, not only at the end.
   *
   * A crash on merge eight would otherwise throw away eight merges of real
   * spend — the same argument `completeSpokenRiff` makes about storing the
   * scrap before it asks for the angles.
   */
  const save = () =>
    writeFileSync(
      `${OUT}/run-${LABEL}.json`,
      JSON.stringify(
        {
          label: LABEL,
          model,
          runs,
          microsSpent: micros,
          ms: Math.round(performance.now() - started),
          stopped,
        } satisfies RunFile,
        null,
        2
      )
    )

  for (const row of rows) {
    const meta = row.meta as Record<string, unknown>
    const number = typeof meta.number === "number" ? meta.number : 0

    // The stored body is already `descriptionBlocks(payload).join("\n\n")` —
    // the title is block 0 in it — so the title is not passed again here.
    const blocks = descriptionBlocks({ title: "", body: row.body })
    const material = readShippedMaterial(meta.material)
    const facts = readShippedFacts({
      repository: meta.repository,
      number,
      private: meta.private,
      additions: meta.additions,
      deletions: meta.deletions,
      changedFiles: meta.changedFiles,
      commits: meta.commits,
      labels: meta.labels,
      mergedAt: row.postedAt ? row.postedAt.toISOString() : "",
      // The live rows carry no repository context: it is assembled at the edge
      // from a GitHub call the webhook makes, and never stored. Both models get
      // the same nothing.
      repo: null,
    })

    const run: Run = {
      pr: number,
      repository: typeof meta.repository === "string" ? meta.repository : "",
      url: row.url,
      sourceItemId: row.id,
      title: typeof meta.title === "string" ? meta.title : "",
      descriptionChars: row.body.length,
      hasMaterial: material.commits.length > 0 || material.files.length > 0,
      brief: "",
      picked: [],
      passage: "",
      why: "",
      forUser: "",
      beats: { did: "", happened: "", learned: "" },
      refused: false,
      angleHook: "",
      angleShape: "",
      angleKind: "",
      angleWhy: "",
      groundedIn: "",
      draft: "",
      calls: [],
    }

    const bill = (step: string, usage: unknown, ms: number) => {
      const u = (usage ?? {}) as Record<string, number>
      const call: Call = {
        step,
        model,
        inputTokens: u.inputTokens ?? 0,
        cachedInputTokens: u.cachedInputTokens ?? 0,
        outputTokens: u.outputTokens ?? 0,
        micros: 0,
        ms: Math.round(ms),
      }
      call.micros = estimateCostMicros(model, {
        inputTokens: call.inputTokens,
        cachedInputTokens: call.cachedInputTokens,
        outputTokens: call.outputTokens,
      })
      micros += call.micros
      run.calls.push(call)
    }

    if (!room()) {
      run.stopped = "budget"
      stopped = true
      runs.push(run)
      break
    }

    /* 1. The brief. `writeShippedBrief` without the step that stores it. */
    let t = performance.now()
    const brief = await writeShippedBrief({
      blocks,
      facts,
      material,
      brain: brainIndex,
    })
    bill("brief", brief.usage, performance.now() - t)
    run.brief = brief.brief

    if (!room()) {
      run.stopped = "budget"
      stopped = true
      runs.push(run)
      break
    }

    /* 2. The selection, over description + brief as one numbered list. */
    const reading = selectionBlocks(blocks, brief.brief)
    t = performance.now()
    const selection = await selectShippedPassage({
      blocks: reading.blocks,
      facts,
      brain: brainFull,
      briefFrom: reading.briefFrom,
      answerAt: reading.answerAt,
    })
    bill("selection", selection.usage, performance.now() - t)

    run.passage = selection.passage
    run.why = selection.why
    run.forUser = selection.forUser
    // The indices are not returned, only the reassembled passage — recovered
    // here by matching the blocks back, which is what the card would show.
    run.picked = reading.blocks
      .map((block, index) => (selection.passage.includes(block) ? index : -1))
      .filter((index) => index > -1)

    /* 3. The beats. No answer exists on these rows, so `fillBeats` is a no-op. */
    run.beats = fillBeats(
      readShippedBeats({
        did: selection.did,
        happened: selection.happened,
        learned: selection.learned,
      }),
      ""
    )

    // An empty passage is the refusal, and the workflow stops there — no riff,
    // no angles, no draft. Stopping here too is what makes the refusal rate
    // comparable and is also what makes the run cheaper.
    if (!selection.passage) {
      run.refused = true
      runs.push(run)
      write(run, model)
      save()
      continue
    }

    if (!room()) {
      run.stopped = "budget"
      stopped = true
      runs.push(run)
      break
    }

    /* 4. The angles, as `anglesStep` asks for them. */
    t = performance.now()
    const angles = await generateAnglesFromShipped({
      scrap: selection.passage,
      brain: brainFull,
      shapes,
      recentKinds: kinds,
      facts,
      forUser: selection.forUser,
      beats: run.beats,
    })
    bill("angles", angles.usage, performance.now() - t)
    run.groundedIn = angles.groundedIn

    const angle = angles.angles[0]
    if (!angle) {
      run.stopped = "no-angles"
      runs.push(run)
      write(run, model)
      save()
      continue
    }

    run.angleHook = angle.hook
    run.angleShape = angle.shape
    run.angleKind = angle.kind
    run.angleWhy = angle.why

    if (!room()) {
      run.stopped = "budget"
      stopped = true
      runs.push(run)
      break
    }

    /* 5. The draft, on X, as `draftFromAngle` feeds it. */
    const shape = angle.shape as Angle["shape"]
    const forX = targetsFor(shape, ["x"])
    const channels =
      forX.length > 0
        ? forX
        : // The angle took a shape X cannot carry. Drafted for X anyway, because
          // the comparison is one channel; noted in the record by `angleShape`.
          [{ id: "x", label: "X", rules: CHANNEL_RULES.x }]

    const examples = await voiceExamples({
      userId: owner.id,
      about: `${angle.hook} ${angle.why}`,
    }).catch(() => [] as string[])

    t = performance.now()
    const draft = await generateDraft({
      hook: angle.hook,
      shape,
      scrapOrIdea: selection.passage,
      sourceLabel: "Pull request",
      about: describeMaterial(facts, selection.forUser),
      beats: run.beats,
      channels,
      brain: brainFull,
      recent,
      examples,
    })
    bill("draft", draft.usage, performance.now() - t)

    run.draft =
      draft.versions.find((v) => v.channel === "x")?.body ??
      draft.versions[0]?.body ??
      ""

    runs.push(run)
    write(run, model)
    save()
  }

  save()
  console.log(
    `[${LABEL}] ${model}: ${runs.length} merges, $${(micros / 1_000_000).toFixed(4)}, ${Math.round((performance.now() - started) / 1000)}s`
  )
}

/**
 * `describeMaterial` from lib/angle-draft.ts, which is private to that file.
 *
 * Reproduced rather than exported, because exporting it would be a change to a
 * file this experiment is not allowed to touch. Same two facts in the same
 * order: whether the repository is public, and what changed for a user.
 */
function describeMaterial(
  facts: ReturnType<typeof readShippedFacts>,
  forUser: string
): string {
  const lines: string[] = []

  lines.push(
    facts.private
      ? `The repository is private. Nothing about it is public except what the material below already says.`
      : `The repository is public.`
  )

  const said = forUser.replace(/\s+/g, " ").trim()
  if (said) lines.push(`What changed for a user: ${said}`)

  return lines.join("\n")
}

function write(run: Run, model: string): void {
  const usd = (m: number) => `$${(m / 1_000_000).toFixed(4)}`
  const total = run.calls.reduce((sum, c) => sum + c.micros, 0)

  const lines = [
    `# PR ${run.pr} — ${LABEL} (${model})`,
    ``,
    `${run.repository} · ${run.url}`,
    `Title: ${run.title}`,
    `Description: ${run.descriptionChars} characters. Material at ingest: ${run.hasMaterial ? "yes" : "none (row predates plan 027 1a)"}.`,
    ``,
    `## Cost`,
    ``,
    `| step | in | cached | out | cost | ms |`,
    `|---|---|---|---|---|---|`,
    ...run.calls.map(
      (c) =>
        `| ${c.step} | ${c.inputTokens} | ${c.cachedInputTokens} | ${c.outputTokens} | ${usd(c.micros)} | ${c.ms} |`
    ),
    `| **total** | | | | **${usd(total)}** | |`,
    ``,
    `## Brief`,
    ``,
    run.brief || "_(empty)_",
    ``,
    `## Selection`,
    ``,
    `Picked blocks: ${run.picked.length ? run.picked.join(", ") : "none — refused"}`,
    `Why: ${run.why || "—"}`,
    `forUser: ${run.forUser || "—"}`,
    ``,
    `Beats:`,
    `- did: ${run.beats.did || "—"}`,
    `- happened: ${run.beats.happened || "—"}`,
    `- learned: ${run.beats.learned || "—"}`,
    ``,
    `## Passage`,
    ``,
    run.passage || "_(refused)_",
    ``,
    `## First angle`,
    ``,
    run.angleHook
      ? `${run.angleHook}\n\nShape: ${run.angleShape} · Kind: ${run.angleKind}\nWhy: ${run.angleWhy}\nGrounded in: ${run.groundedIn}`
      : "_(none)_",
    ``,
    `## Draft (X)`,
    ``,
    run.draft || "_(none)_",
    ``,
  ]

  writeFileSync(`${OUT}/${run.pr}-${LABEL}.md`, lines.join("\n"))
}

/* ── Judging, with no model in it ────────────────────────────────────────── */

const NORWEGIAN = [
  "og", "ikke", "til", "av", "som", "det", "den", "jeg", "har", "ble",
  "fra", "når", "også", "kunne", "skulle", "må", "hvorfor", "seg", "sin",
  "noe", "mye", "gjort", "kjørt", "laget", "skrevet", "på", "å", "er",
  "en", "et", "med", "hva", "vi", "men", "eller", "etter", "før",
]

const ENGLISH = [
  "the", "and", "not", "to", "of", "that", "it", "is", "was", "from",
  "when", "i", "a", "in", "for", "with", "what", "we", "but", "or",
  "after", "before", "now", "so", "this", "my", "on", "at", "than",
]

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
}

function hits(list: string[], w: string[]): number {
  const set = new Set(list)
  return w.filter((x) => set.has(x)).length
}

function grams(w: string[], n: number): Set<string> {
  const out = new Set<string>()
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(" "))
  return out
}

type Judgement = {
  did: number
  happened: number
  meant: number
  language: number
  number: number
  ownWords: number
  score: number
  mixed: boolean
  overLimit: number
  used: number
  norwegian: number
  english: number
  numberOnOwnLine: boolean
  copied: string
}

/**
 * The three-beat checks from the plan, plus four the drafts kept failing on.
 *
 * Every one is a string test. A model judging a model is a second experiment
 * with its own error, and the owner is going to read the drafts himself
 * anyway — so this is a filter, not a verdict.
 */
function judge(draft: string, description: string): Judgement {
  const body = draft.trim()
  const paras = body.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const first = paras[0] ?? ""
  const rest = paras.slice(1).join("\n")
  const last = paras[paras.length - 1] ?? ""

  // did: the opening block has the user as its subject and an action in it.
  const firstPerson = /(^|[^A-Za-z])I([^A-Za-z]|$)|(^|\s)I'|(^|\s)my\s|(^|\s)we\s/
  const action =
    /\b(built|shipped|wrote|added|removed|cut|fixed|made|moved|changed|replaced|merged|rewrote|split|killed|turned|gave|told|asked|started|stopped|spent|found|traced|measured|pushed|deleted|swapped|dropped)\b/i
  const did = firstPerson.test(first) && action.test(first) ? 1 : 0

  // happened: an observable result after the opening — a number, or a
  // result verb with something concrete attached.
  const result =
    /\b(now|went from|dropped|fell|rose|climbed|stopped|no longer|instead|came back|works|passes|failed|broke)\b/i
  const happened = /\d/.test(rest) || result.test(rest) ? 1 : 0

  // meant: a short closing line that is not the result restated.
  const meant =
    paras.length >= 3 && last.length <= 220 && !last.endsWith("?") ? 1 : 0

  const w = words(body)
  const nb = hits(NORWEGIAN, w)
  const en = hits(ENGLISH, w)
  const mixed = nb >= 2 && en >= 2
  const language = mixed ? 0 : 1

  const onOwnLine = body
    .split("\n")
    .some((line) => /^\s*[^A-Za-zÆØÅæøå]*\d[^A-Za-z]*$/.test(line) && /\d/.test(line))
  const num = onOwnLine ? 1 : /\d/.test(body) ? 0.5 : 0

  // No eight-word run shared with what the repository was told.
  const source = grams(words(description), 8)
  const mine = [...grams(w, 8)]
  const copied = mine.find((g) => source.has(g)) ?? ""
  const ownWords = copied ? 0 : 1

  const { used, over } = measurePost(body, "x")

  return {
    did,
    happened,
    meant,
    language,
    number: num,
    ownWords,
    score: did + happened + meant + language + num + ownWords,
    mixed,
    overLimit: over,
    used,
    norwegian: nb,
    english: en,
    numberOnOwnLine: onOwnLine,
    copied,
  }
}

/* ── The parent ──────────────────────────────────────────────────────────── */

function spawnChild(label: string, model: string, spentUsd: number): void {
  console.log(`\n── ${label}: ${model} ──`)

  const result = spawnSync(
    "node_modules/.bin/tsx",
    ["scripts/ab-shipped-models.ts", "--limit", String(LIMIT), "--budget-usd", String(BUDGET_USD)],
    {
      cwd: process.cwd(),
      stdio: "inherit",
      env: {
        ...process.env,
        // No `--env-file` on the child: it would reload .env.local over these.
        CHAT_MODEL: model,
        DRAFTING_MODEL: model,
        AB_LABEL: label,
        AB_SPENT_USD: String(spentUsd),
      },
    }
  )

  if (result.status !== 0) {
    throw new Error(`${label} exited ${result.status}`)
  }
}

function read(label: string): RunFile {
  return JSON.parse(readFileSync(`${OUT}/run-${label}.json`, "utf8")) as RunFile
}

async function parent(): Promise<void> {
  mkdirSync(OUT, { recursive: true })

  /**
   * `--judge-only` re-reads what a previous run bought and rewrites the
   * summary. The checks are pure, so re-scoring must never be a reason to pay
   * for the drafts a second time.
   */
  if (!process.argv.includes("--judge-only")) {
    spawnChild("A", MODEL_A, 0)
    spawnChild("B", MODEL_B, read("A").microsSpent / 1_000_000)
  }

  const a = read("A")
  const b = read("B")

  // The descriptions, for the copied-quote check. Read here rather than carried
  // through the JSON so the two children stay small.
  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, OWNER_EMAIL))
    .limit(1)

  const rows = await db
    .select({ id: sourceItem.id, body: sourceItem.body })
    .from(sourceItem)
    .where(eq(sourceItem.source, "github"))
    .orderBy(desc(sourceItem.postedAt))
    .limit(LIMIT)

  void owner
  const bodies = new Map(rows.map((r) => [r.id, r.body]))

  const byPr = new Map<number, { a?: Run; b?: Run }>()
  for (const run of a.runs) byPr.set(run.pr, { ...byPr.get(run.pr), a: run })
  for (const run of b.runs) byPr.set(run.pr, { ...byPr.get(run.pr), b: run })

  const usd = (m: number) => `$${(m / 1_000_000).toFixed(4)}`
  const cost = (run?: Run) =>
    run ? run.calls.reduce((sum, c) => sum + c.micros, 0) : 0

  const table: string[] = [
    `| PR | A score | B score | A cost | B cost | refused A/B | mixed A/B | over X limit A/B |`,
    `|---|---|---|---|---|---|---|---|`,
  ]

  const detail: string[] = [
    `| PR | model | did | happened | meant | one language | number | own words | graphemes |`,
    `|---|---|---|---|---|---|---|---|---|`,
  ]

  const judged: {
    pr: number
    a?: Run
    b?: Run
    ja?: Judgement
    jb?: Judgement
  }[] = []

  for (const [pr, pair] of byPr) {
    const description = bodies.get(pair.a?.sourceItemId ?? pair.b?.sourceItemId ?? "") ?? ""
    const ja = pair.a?.draft ? judge(pair.a.draft, description) : undefined
    const jb = pair.b?.draft ? judge(pair.b.draft, description) : undefined

    judged.push({ pr, a: pair.a, b: pair.b, ja, jb })

    for (const [label, j] of [
      ["A", ja],
      ["B", jb],
    ] as const) {
      if (!j) continue
      detail.push(
        `| ${pr} | ${label} | ${j.did} | ${j.happened} | ${j.meant} | ${j.language} | ${j.number}${j.numberOnOwnLine ? " (own line)" : ""} | ${j.ownWords}${j.copied ? ` (copied: "${j.copied}")` : ""} | ${j.used} |`
      )
    }

    table.push(
      `| ${pr} | ${ja ? ja.score : pair.a?.refused ? "refused" : "—"} | ${jb ? jb.score : pair.b?.refused ? "refused" : "—"} | ${usd(cost(pair.a))} | ${usd(cost(pair.b))} | ${pair.a?.refused ? "yes" : "no"}/${pair.b?.refused ? "yes" : "no"} | ${ja?.mixed ? "yes" : "no"}/${jb?.mixed ? "yes" : "no"} | ${ja?.overLimit ?? 0}/${jb?.overLimit ?? 0} |`
    )
  }

  const scored = judged.filter((j) => j.ja && j.jb)
  const best = [...scored].sort(
    (x, y) => Math.max(y.ja!.score, y.jb!.score) - Math.max(x.ja!.score, x.jb!.score)
  )[0]
  const worst = [...scored].sort(
    (x, y) => Math.min(x.ja!.score, x.jb!.score) - Math.min(y.ja!.score, y.jb!.score)
  )[0]

  const overlap = (x: string, y: string) => {
    const sx = new Set(words(x))
    const sy = new Set(words(y))
    const shared = [...sx].filter((t) => sy.has(t)).length
    return shared / Math.max(1, new Set([...sx, ...sy]).size)
  }
  const different = [...scored].sort(
    (x, y) =>
      overlap(x.a!.draft, x.b!.draft) - overlap(y.a!.draft, y.b!.draft)
  )[0]

  const excerpt = (label: string, pick?: (typeof judged)[number]) =>
    pick
      ? [
          `### ${label}: PR ${pick.pr} — ${pick.a?.title ?? pick.b?.title ?? ""}`,
          ``,
          `**A (${a.model}), score ${pick.ja?.score}, ${usd(cost(pick.a))}**`,
          ``,
          "```",
          pick.a?.draft ?? "(none)",
          "```",
          ``,
          `**B (${b.model}), score ${pick.jb?.score}, ${usd(cost(pick.b))}**`,
          ``,
          "```",
          pick.b?.draft ?? "(none)",
          "```",
          ``,
        ].join("\n")
      : `### ${label}: none\n`

  const summary = [
    `# Model A/B on the live merges — plans/027 item 1f`,
    ``,
    `Run ${new Date().toISOString()}. ${LIMIT} merges, both models, four calls each.`,
    ``,
    `- A = \`${a.model}\` — what \`DRAFTING_MODEL\`/\`CHAT_MODEL\` resolve to today.`,
    `- B = \`${b.model}\`.`,
    `- Reasoning effort: \`${process.env.REASONING_EFFORT ?? "low"}\` for both.`,
    `- Nothing was written to any table. No \`usage_event\` row exists for this run.`,
    `- The rows predate plan 027 item 1a, so \`meta.material\` is empty on every one:`,
    `  the brief read the title, the description and the counts in \`meta\`, and no`,
    `  commit messages, file list, linked issues or patch sample.`,
    ``,
    `## Score`,
    ``,
    `Six points, all string tests, no model:`,
    `did (first person + an action in the opening block), happened (a number or a`,
    `result verb after it), meant (a short closing line, three blocks or more),`,
    `one language only, a number (1 on its own line, 0.5 present, 0 absent), and`,
    `own words (no eight-word run copied out of the description).`,
    ``,
    ...table,
    ``,
    `### Check by check`,
    ``,
    ...detail,
    ``,
    `## Spend`,
    ``,
    `| | model | cost | wall time |`,
    `|---|---|---|---|`,
    `| A | ${a.model} | ${usd(a.microsSpent)} | ${Math.round(a.ms / 1000)}s |`,
    `| B | ${b.model} | ${usd(b.microsSpent)} | ${Math.round(b.ms / 1000)}s |`,
    `| **total** | | **${usd(a.microsSpent + b.microsSpent)}** | |`,
    ``,
    a.stopped || b.stopped
      ? `**The budget stopped the run.**`
      : `The budget of $${BUDGET_USD} was not reached.`,
    ``,
    `## Three side by side`,
    ``,
    excerpt("Best", best),
    excerpt("Worst", worst),
    excerpt("Most different", different),
  ].join("\n")

  writeFileSync(`${OUT}/summary.md`, summary)

  console.log(`\n${table.join("\n")}`)
  console.log(
    `\nA ${a.model}: ${usd(a.microsSpent)} · B ${b.model}: ${usd(b.microsSpent)} · total ${usd(a.microsSpent + b.microsSpent)}`
  )
  console.log(`\nWritten to ${OUT}/summary.md`)
}

const run = LABEL ? child : parent

run()
  .then(() => process.exit(0))
  .catch((cause) => {
    console.error(cause)
    process.exit(1)
  })
