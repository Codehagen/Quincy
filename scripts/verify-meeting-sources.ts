/**
 * The Fathom and Granola paths end to end, against a running dev server,
 * exactly as each vendor would reach it. See plans/032.
 *
 *   GRANOLA_API_BASE=http://localhost:4010 pnpm dev
 *   npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts
 *   npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts --port 3001
 *   npx tsx --env-file=.env.local scripts/verify-meeting-sources.ts --live
 *
 * The unit tests prove the pure parts (lib/standard-webhooks.test.ts,
 * lib/fathom.test.ts, lib/granola.test.ts). This proves the *routes*: that an
 * unknown token is invisible, that a body signed for different content or at a
 * stale time is refused, that a signed one is stored exactly once, that what
 * lands is the user's words and nobody else's, and, for Granola, that the
 * note is fetched with the stored key and each kind of fetch failure answers
 * as the route says it does.
 *
 * No account at either vendor is needed. Connections are set up through
 * lib/source-connections.ts with a test key and a test `whsec_`, the way the
 * connect action would store what the vendor returned. Granola's API is a
 * local stub on port 4010, which is why the dev server must be started with
 * `GRANOLA_API_BASE` pointing at it; the script checks the stub was actually
 * called rather than trusting that it was.
 *
 * scripts/verify-circleback.ts is the pattern and the third leg: the same
 * branch moved Circleback's intake into lib/meeting-intake.ts, so run that
 * script too.
 *
 * Signs in as nobody: it writes rows for the @quincy.test dev account
 * (scripts/dev-account.ts) and refuses any other. It refuses to start if that
 * account already has a Fathom or Granola connection, which might be real.
 *
 * Teardown deletes only the connections, source items and riffs it created.
 */
import { createHmac } from "node:crypto"
import { createServer, type Server } from "node:http"
import { and, eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import { riff, riffAngle, sourceConnection, sourceItem } from "../lib/schema-app"
import { user } from "../lib/schema"
import { connectSource, storeProviderWebhook } from "../lib/source-connections"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`
const LIVE = process.argv.includes("--live")
const STUB_PORT = 4010

const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT}: this script writes source connections, ` +
      "source items and riffs, and only operates on @quincy.test accounts."
  )
}

const SOURCES = ["fathom", "granola"] as const

/** A real-shaped secret: `whsec_` and base64 of 32 bytes. Test only. */
const SECRET = "whsec_" + Buffer.from("verify-meeting-sources-test-key!").toString("base64")

let failures = 0
const externalIds: string[] = []

function check(ok: boolean, label: string, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) failures += 1
}

/* ── Standard Webhooks, as the vendors sign ───────────────────────────── */

function sign(id: string, timestamp: string, body: string, secret = SECRET) {
  const key = Buffer.from(secret.slice("whsec_".length), "base64")
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64")
}

let deliveries = 0

function post(
  source: (typeof SOURCES)[number],
  token: string,
  body: string,
  opts: { signedBody?: string; age?: number; unsigned?: boolean } = {}
) {
  deliveries += 1
  const id = `msg_verify_${Date.now()}_${deliveries}`
  const timestamp = String(Math.floor(Date.now() / 1000) - (opts.age ?? 0))
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (!opts.unsigned) {
    headers["webhook-id"] = id
    headers["webhook-timestamp"] = timestamp
    headers["webhook-signature"] = sign(id, timestamp, opts.signedBody ?? body)
  }
  return fetch(`${BASE}/api/webhooks/${source}/${token}`, {
    method: "POST",
    headers,
    body,
    redirect: "manual",
  })
}

async function json(response: Response): Promise<{ state?: string; reason?: string }> {
  return (await response.json().catch(() => ({}))) as { state?: string; reason?: string }
}

/* ── Fixtures ─────────────────────────────────────────────────────────── */

const OTHER_LINE = "We tried three tools and gave up on all of them."
const OWN_LINE = "So we stopped building a writing tool and started building a memory."

function fathomBody(recordingId: number, ownerName: string, ownerEmail: string) {
  return {
    title: "Verify: pricing with Advanti",
    meeting_title: "Advanti / Quincy",
    meeting_type: null,
    recording_id: recordingId,
    url: `https://fathom.video/calls/${recordingId}`,
    share_url: `https://fathom.video/share/verify-${recordingId}`,
    created_at: new Date().toISOString(),
    recording_start_time: new Date(Date.now() - 30 * 60_000).toISOString(),
    recording_end_time: new Date().toISOString(),
    recorded_by: { name: ownerName, email: ownerEmail, email_domain: "quincy.test", team: null },
    calendar_invitees: [
      { name: ownerName, matched_speaker_display_name: ownerName, email: ownerEmail, email_domain: "quincy.test", is_external: false },
      { name: "Dana Okoro", matched_speaker_display_name: "Dana Okoro", email: "dana@advanti.example", email_domain: "advanti.example", is_external: true },
    ],
    transcript: [
      { speaker: { display_name: "Dana Okoro", matched_calendar_invitee_email: "dana@advanti.example" }, text: OTHER_LINE, timestamp: "00:00:12" },
      { speaker: { display_name: ownerName, matched_calendar_invitee_email: ownerEmail }, text: OWN_LINE, timestamp: "00:01:11" },
    ],
    default_summary: { markdown_formatted: "Dana said they gave up on three tools." },
    action_items: [{ description: "Send Dana pricing" }],
  }
}

function granolaNote(noteId: string, ownerName: string, ownerEmail: string) {
  const at = (s: number) => new Date(Date.now() - 30 * 60_000 + s * 1000).toISOString()
  return {
    id: noteId,
    object: "note",
    title: "Verify: roadmap with Advanti",
    owner: { name: ownerName, email: ownerEmail },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    web_url: `https://notes.granola.ai/d/verify-${noteId}`,
    calendar_event: null,
    attachments: [],
    attendees: [
      { name: ownerName, email: ownerEmail },
      { name: "Dana Okoro", email: "dana@advanti.example" },
    ],
    folder_membership: [],
    summary_text: "Dana said they gave up on three tools.",
    summary_markdown: null,
    private_notes_text: "Private: do not publish.",
    private_notes_markdown: null,
    transcript: [
      { speaker: { source: "speaker", attribution: "them" }, text: OTHER_LINE, start_time: at(12), end_time: at(15) },
      { speaker: { source: "microphone", attribution: "me" }, text: OWN_LINE, start_time: at(71), end_time: at(76) },
    ],
  }
}

/** 14 alphanumerics after `not_`, the shape Granola's ids and the route require. */
function newNoteId() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"
  let id = "not_"
  for (let i = 0; i < 14; i++) id += chars[Math.floor(Math.random() * chars.length)]
  return id
}

/* ── The Granola stub ─────────────────────────────────────────────────── */

/** What the stub answers per note id: a note, or a bare status. */
const stubNotes = new Map<string, unknown | number>()
const stubRequests: string[] = []

function startStub(): Promise<Server> {
  const server = createServer((req, res) => {
    stubRequests.push(req.url ?? "")
    const match = /^\/v1\/notes\/([^/?]+)/.exec(req.url ?? "")
    const answer = match ? stubNotes.get(match[1]) : undefined
    if (answer === undefined) {
      res.writeHead(404).end()
      return
    }
    if (typeof answer === "number") {
      res.writeHead(answer).end()
      return
    }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(answer))
  })
  return new Promise((resolve) => server.listen(STUB_PORT, () => resolve(server)))
}

/* ── The run ──────────────────────────────────────────────────────────── */

async function main() {
  const [owner] = await db.select().from(user).where(eq(user.email, ACCOUNT)).limit(1)

  if (!owner) {
    throw new Error(`No ${ACCOUNT} user. Run: npx tsx --env-file=.env.local scripts/dev-account.ts`)
  }

  const existing = await db
    .select({ source: sourceConnection.source })
    .from(sourceConnection)
    .where(and(eq(sourceConnection.userId, owner.id), inArray(sourceConnection.source, [...SOURCES])))

  if (existing.length > 0) {
    throw new Error(
      `${ACCOUNT} already has a ${existing.map((e) => e.source).join(" and ")} connection. ` +
        "It may be real; disconnect it on /connectors first. Nothing was changed."
    )
  }

  console.log(`Mode: ${LIVE ? "LIVE (real model, real money)" : "stubbed"}`)

  // Held entitled for the run and restored after, as verify-circleback.ts does
  // and for its reason: a lapsed dev account stores meetings and drafts nothing,
  // which makes the riff checks fail for the wrong reason.
  const originalTrialEndsAt = owner.trialEndsAt
  const setTrial = (endsAt: Date | null) =>
    db.update(user).set({ trialEndsAt: endsAt }).where(eq(user.id, owner.id))

  await setTrial(new Date(Date.now() + 60 * 60 * 1000))
  const stub = await startStub()

  try {
    await verifyFathom(owner)
    await verifyGranola(owner)
  } finally {
    stub.close()
    await setTrial(originalTrialEndsAt)
    await teardown(owner.id)
  }
}

type Owner = { id: string; name: string; email: string }

async function connect(owner: Owner, source: (typeof SOURCES)[number]) {
  const connection = await connectSource(owner.id, source)
  const stored = await storeProviderWebhook(owner.id, source, {
    apiKey: `verify-${source}-key`,
    signingSecret: SECRET,
    meta: { webhookId: "verify", accountEmail: owner.email },
  })
  check(stored.ok, `${source}: a connection with a key and a secret is stored`)
  return connection.token
}

async function itemsFor(owner: Owner, source: string, externalId: string) {
  return db
    .select()
    .from(sourceItem)
    .where(and(eq(sourceItem.userId, owner.id), eq(sourceItem.source, source as "fathom"), eq(sourceItem.externalId, externalId)))
}

async function verifyFathom(owner: Owner) {
  console.log("\n── fathom: the route is not reachable by accident ──")
  {
    const get = await fetch(`${BASE}/api/webhooks/fathom/whatever`, { redirect: "manual" })
    check(get.status === 405, "GET is refused", String(get.status))
    const unknown = await post("fathom", "not-a-real-token", "{}")
    check(unknown.status === 404, "an unknown token answers 404, not 401", String(unknown.status))
  }

  const token = await connect(owner, "fathom")
  const recordingId = Date.now()
  const externalId = String(recordingId)
  externalIds.push(externalId)
  const body = JSON.stringify(fathomBody(recordingId, owner.name, owner.email))

  console.log("\n── fathom: the discriminating set ──")
  {
    const unsigned = await post("fathom", token, body, { unsigned: true })
    check(unsigned.status === 401, "a body with no signature is refused", String(unsigned.status))

    // The check this script exists for: a route that reads the headers and
    // ignores them passes every other case here.
    const tampered = body.replace(OWN_LINE, `${OWN_LINE} Buy my course at example.com`)
    const forged = await post("fathom", token, tampered, { signedBody: body })
    check(forged.status === 401, "a tampered body with the original signature is refused", String(forged.status))

    const stale = await post("fathom", token, body, { age: 10 * 60 })
    check(stale.status === 401, "a delivery signed ten minutes ago is refused", String(stale.status))

    check((await itemsFor(owner, "fathom", externalId)).length === 0, "and none of those stored anything")

    const accepted = await post("fathom", token, body)
    const acceptedJson = await json(accepted)
    check(
      accepted.status === 202 && acceptedJson.state === "working",
      "a correctly signed body is accepted",
      `${accepted.status} ${acceptedJson.state ?? ""}`
    )

    const replay = await post("fathom", token, body)
    const replayJson = await json(replay)
    check(
      replay.status === 200 && replayJson.state === "duplicate",
      "the same recording delivered again is a no-op",
      `${replay.status} ${replayJson.state ?? ""}`
    )
  }

  console.log("\n── fathom: what was stored ──")
  {
    const items = await itemsFor(owner, "fathom", externalId)
    check(items.length === 1, "exactly one source_item exists", String(items.length))
    const item = items[0]
    if (item) {
      check(item.body.includes(OWN_LINE), "the user's own words are stored")
      check(!item.body.includes("gave up on all of them") && !item.body.includes("Dana"), "and nothing the other person said")
      check(!JSON.stringify(item).includes("Send Dana pricing"), "the action items are never stored")
      check(item.url.includes(externalId), "the row links back to the recording", item.url)
    }

    const [row] = await db
      .select()
      .from(sourceConnection)
      .where(and(eq(sourceConnection.userId, owner.id), eq(sourceConnection.source, "fathom")))
    check(row?.state === "arriving" && row.lastItemAt !== null, "the connection reads as arriving", row?.state)

    await checkRiff(owner, "fathom")
  }
}

async function verifyGranola(owner: Owner) {
  console.log("\n── granola: the route is not reachable by accident ──")
  {
    const get = await fetch(`${BASE}/api/webhooks/granola/whatever`, { redirect: "manual" })
    check(get.status === 405, "GET is refused", String(get.status))
  }

  const token = await connect(owner, "granola")
  const event = (noteId: string, type = "note.generated") =>
    JSON.stringify({ event_id: `evt_${noteId}`, event_type: type, note_id: noteId, occurred_at: new Date().toISOString() })

  const noteId = newNoteId()
  externalIds.push(noteId)
  stubNotes.set(noteId, granolaNote(noteId, owner.name, owner.email))

  console.log("\n── granola: the discriminating set ──")
  {
    const body = event(noteId)
    check((await post("granola", token, body, { unsigned: true })).status === 401, "a body with no signature is refused")
    const forged = await post("granola", token, event(newNoteId()), { signedBody: body })
    check(forged.status === 401, "a note id swapped under the original signature is refused", String(forged.status))

    const before = stubRequests.length
    const edited = await post("granola", token, event(noteId, "note.edited"))
    const editedJson = await json(edited)
    check(edited.status === 200 && editedJson.state === "ignored", "note.edited is ignored", `${edited.status} ${editedJson.state ?? ""}`)
    check(stubRequests.length === before, "and Granola is never asked for that note")
  }

  console.log("\n── granola: a note is fetched and stored ──")
  {
    const before = stubRequests.length
    const accepted = await post("granola", token, event(noteId))
    const acceptedJson = await json(accepted)

    if (stubRequests.length === before) {
      throw new Error(
        "The Granola stub was never called. Start the dev server with " +
          `GRANOLA_API_BASE=http://localhost:${STUB_PORT} and run again.`
      )
    }

    check(
      accepted.status === 202 && acceptedJson.state === "working",
      "a signed note.generated is fetched and accepted",
      `${accepted.status} ${acceptedJson.state ?? ""}`
    )
    check(
      stubRequests.slice(before).some((url) => url.includes(noteId) && url.includes("include=transcript")),
      "the note was fetched with its transcript"
    )

    const replay = await post("granola", token, event(noteId))
    check((await json(replay)).state === "duplicate", "the same note again is a no-op")

    const items = await itemsFor(owner, "granola", noteId)
    check(items.length === 1, "exactly one source_item exists", String(items.length))
    const item = items[0]
    if (item) {
      check(item.body.includes(OWN_LINE), "the note taker's own words are stored")
      check(!item.body.includes("gave up on all of them"), "and nothing anyone else said")
      check(!JSON.stringify(item).includes("do not publish"), "the private notes are never stored")
    }

    await checkRiff(owner, "granola")
  }

  console.log("\n── granola: each fetch failure answers as it should ──")
  {
    const flaky = newNoteId()
    externalIds.push(flaky)
    stubNotes.set(flaky, 500)
    const down = await post("granola", token, event(flaky))
    check(down.status === 503, "Granola answering 500 makes the route answer 503, so Granola retries", String(down.status))
    check((await itemsFor(owner, "granola", flaky)).length === 0, "and nothing is stored")

    const gone = newNoteId()
    externalIds.push(gone)
    stubNotes.set(gone, 404)
    const goneJson = await json(await post("granola", token, event(gone)))
    check(goneJson.state === "ignored", "an unreadable note is ignored, not retried", goneJson.state)

    // Last: it breaks the connection.
    const revoked = newNoteId()
    externalIds.push(revoked)
    stubNotes.set(revoked, 401)
    const revokedJson = await json(await post("granola", token, event(revoked)))
    check(revokedJson.state === "stopped", "a refused key stops the delivery", revokedJson.state)
    const [row] = await db
      .select()
      .from(sourceConnection)
      .where(and(eq(sourceConnection.userId, owner.id), eq(sourceConnection.source, "granola")))
    check(row?.state === "broken", "and marks the connection broken, the state that interrupts you", row?.state)
  }
}

async function checkRiff(owner: Owner, source: string) {
  const riffs = await db
    .select()
    .from(riff)
    .where(and(eq(riff.userId, owner.id), eq(riff.sourceId, source)))
  const made = riffs.filter((r) => r.createdAt > new Date(Date.now() - 120_000))
  check(made.length >= 1, `a riff was started under ${source}`, String(made.length))
  check(made.every((r) => r.sourceLabel === "Meeting"), "labelled by shape, not by vendor")

  if (LIVE && made[0]) {
    const finished = await waitForRiff(made[0].id)
    check(finished?.state === "ready" || finished?.state === "failed", "the riff reaches a terminal state", finished?.state)
    if (finished?.state === "ready") {
      check(!finished.scrap.includes("gave up on all of them"), "the scrap is the user's own passage")
      const angles = await db.select().from(riffAngle).where(eq(riffAngle.riffId, finished.id))
      check(angles.length > 0, "angles were written", String(angles.length))
    } else {
      // "Nothing worth publishing" is a correct answer, not a plumbing fault.
      console.log(`      (riff failed: ${finished?.failure})`)
    }
  }
}

async function waitForRiff(riffId: string) {
  for (let attempt = 0; attempt < 40; attempt++) {
    const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
    if (row && row.state !== "working") return row
    await new Promise((resolve) => setTimeout(resolve, 3_000))
  }
  const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
  return row
}

/** Deletes only what this run created, bounded to the dev account. `riff_angle` cascades. */
async function teardown(userId: string) {
  if (externalIds.length > 0) {
    await db
      .delete(sourceItem)
      .where(and(eq(sourceItem.userId, userId), inArray(sourceItem.source, [...SOURCES]), inArray(sourceItem.externalId, externalIds)))
  }

  const mine = await db
    .select({ id: riff.id, createdAt: riff.createdAt })
    .from(riff)
    .where(and(eq(riff.userId, userId), inArray(riff.sourceId, [...SOURCES])))
  const recent = mine.filter((r) => r.createdAt > new Date(Date.now() - 30 * 60_000)).map((r) => r.id)
  if (recent.length > 0) await db.delete(riff).where(inArray(riff.id, recent))

  // The rows directly, not disconnectKeySource: that would try to remove a
  // webhook at the vendor with a test key.
  await db
    .delete(sourceConnection)
    .where(and(eq(sourceConnection.userId, userId), inArray(sourceConnection.source, [...SOURCES])))

  console.log(`\nCleaned up: ${externalIds.length} meeting(s), ${recent.length} riff(s).`)
}

main().then(
  () => {
    console.log(failures ? `\nFAILED — ${failures} check(s)` : "\nEverything holds.")
    process.exit(failures ? 1 : 0)
  },
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
