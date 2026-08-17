/**
 * The voice path end to end, against a running dev server, as a browser would
 * actually reach it.
 *
 *   npx tsx --env-file=.env.local scripts/verify-voice-e2e.ts
 *   npx tsx --env-file=.env.local scripts/verify-voice-e2e.ts --port 3001
 *   npx tsx --env-file=.env.local scripts/verify-voice-e2e.ts --live
 *
 * lib/voice-note.test.ts proves the guards in isolation. This proves the
 * *product*: that the route refuses what it should, that a real upload creates
 * a working riff, that the workflow fills it in, and that the page then renders
 * angles rather than a skeleton.
 *
 * **Two modes.** By default the model is stubbed end to end, so this costs
 * nothing and cannot be flaky on a provider — what it verifies is the plumbing.
 * `--live` runs the real pipeline against the real Gateway with a real audio
 * file, which is the only way to learn whether Norwegian actually comes back as
 * Norwegian. The PR body should say which one was run.
 *
 * Signs in as the @quincy.test dev account, the same guard
 * scripts/dev-account.ts enforces. Run that first if sign-in fails.
 *
 * Teardown deletes only the riffs it created.
 */
import { eq, inArray } from "drizzle-orm"

import { db } from "../lib/db"
import {
  completeSpokenRiff,
  startVoiceRiff,
  voiceNoteCooldown,
  VOICE_SOURCE,
} from "../lib/riffs"
import { riff, riffAngle } from "../lib/schema-app"
import { user } from "../lib/schema"
import { transcribeVoiceNote, VOICE_NOTE_COOLDOWN_MS } from "../lib/voice-note"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`
const LIVE = process.argv.includes("--live")

const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script writes riffs and only ` +
      "operates on @quincy.test accounts."
  )
}

/**
 * A transcript with the user's own specifics in it.
 *
 * Deliberately disfluent — a false start, a restart, a repetition — because
 * that is what speech is and the prompt claims to read through it. Written as
 * something the *user* said, not something a stranger wrote: the whole point
 * of the second angle generator is that these numbers are theirs to keep.
 */
const TRANSCRIPT =
  "okay so the thing about — right, per-seat pricing. We looked at it again " +
  "last week and the problem is, the problem is it punishes the exact customer " +
  "we want. One person doing the work for a company of forty. We'd charge them " +
  "forty times for one seat's worth of value, which is backwards."

let failures = 0
const created: string[] = []

/** `(condition, label, detail)`, matching scripts/verify-adapt-e2e.ts. */
function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) failures += 1
}

/**
 * A short, real WAV of silence.
 *
 * A handful of zero samples with a valid RIFF header. Enough to be accepted as
 * `audio/wav` and to prove the upload path; not enough to say anything, which
 * is why the stubbed mode never asks a model to read it. `--live` uses a real
 * recording instead if one is given.
 */
function silentWav(seconds = 1, rate = 8000): Uint8Array {
  const samples = seconds * rate
  const bytes = new Uint8Array(44 + samples * 2)
  const view = new DataView(bytes.buffer)
  const ascii = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i++) bytes[offset + i] = text.charCodeAt(i)
  }

  ascii(0, "RIFF")
  view.setUint32(4, 36 + samples * 2, true)
  ascii(8, "WAVEfmt ")
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, rate, true)
  view.setUint32(28, rate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  ascii(36, "data")
  view.setUint32(40, samples * 2, true)

  return bytes
}

async function main() {
  const [owner] = await db
    .select()
    .from(user)
    .where(eq(user.email, ACCOUNT))
    .limit(1)

  if (!owner) {
    throw new Error(
      `No ${ACCOUNT} user. Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  console.log(`Mode: ${LIVE ? "LIVE (real model, real money)" : "stubbed"}`)

  try {
    console.log("\n── sign in ──")
    const cookie = await signIn()
    check(Boolean(cookie), "session cookie issued")
    if (!cookie) throw new Error("cannot continue without a session")

    console.log(`\n── the route refuses what it should (${BASE}) ──`)
    {
      const anonymous = await fetch(`${BASE}/api/voice-notes`, {
        method: "POST",
        headers: { "content-type": "audio/wav" },
        body: silentWav().slice().buffer as ArrayBuffer,
        redirect: "manual",
      })
      /**
       * 307, not 401 — and that is the proxy, not the route.
       *
       * `/api/voice-notes` is inside proxy.ts's matcher, so a request with no
       * session cookie is redirected to /login before the handler runs. Worth
       * pinning: if somebody later adds it to the matcher's exclusion list
       * (the way /api/cron and /api/webhooks are), this flips to 401 and that
       * change should be deliberate rather than discovered.
       */
      check(
        anonymous.status === 307 || anonymous.status === 401,
        "an unauthenticated upload never reaches the handler",
        String(anonymous.status)
      )

      const wrongType = await fetch(`${BASE}/api/voice-notes`, {
        method: "POST",
        headers: { cookie, "content-type": "application/pdf" },
        body: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
        redirect: "manual",
      })
      check(
        wrongType.status === 415,
        "a non-audio content type is refused with 415",
        String(wrongType.status)
      )

      const empty = await fetch(`${BASE}/api/voice-notes`, {
        method: "POST",
        headers: { cookie, "content-type": "audio/wav" },
        body: new ArrayBuffer(0),
        redirect: "manual",
      })
      check(
        empty.status === 400,
        "an empty body is refused with 400",
        String(empty.status)
      )
    }

    console.log("\n── the cooldown is real ──")
    {
      // Asked directly rather than through the route, so this does not depend
      // on having just uploaded something. A cooldown of zero must always be
      // ready; the configured one must refuse a second note straight after a
      // riff exists.
      const ready = await voiceNoteCooldown(owner.id, 0)
      check(ready.ready, "a zero cooldown is always ready")
      check(
        VOICE_NOTE_COOLDOWN_MS > 0,
        "the configured cooldown is not zero",
        `${VOICE_NOTE_COOLDOWN_MS}ms`
      )
    }

    console.log("\n── a voice note becomes a riff ──")
    {
      const riffId = await startVoiceRiff(owner.id)
      created.push(riffId)

      const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
      check(row?.state === "working", "the row lands working", row?.state)
      check(row?.scrap === "", "with no scrap yet")
      check(
        row?.sourceId === VOICE_SOURCE.id,
        "filed under the voice source",
        row?.sourceId
      )
      check(row?.startedAt !== null, "and a startedAt for the stuck clock")

      /**
       * The angle generator is stubbed by default for the reason
       * verify-adapt-e2e stubs its adapter: what is being verified is the
       * plumbing — rows, ordering, the state flip — not the model's judgment,
       * which no automated check can settle.
       */
      const result = await completeSpokenRiff({
        riffId,
        userId: owner.id,
        transcript: TRANSCRIPT,
        ...(LIVE
          ? {}
          : {
              deps: {
                angles: async () => ({
                  groundedIn: "their own pricing rewrite",
                  angles: [
                    {
                      hook: "Per-seat prising straffer kunden du helst vil ha.",
                      shape: "Short post",
                      kind: "Opinion",
                      why: "You have the arithmetic and nobody else publishes it.",
                    },
                    {
                      hook: "En person som gjør jobben for firma på førti.",
                      shape: "Thread",
                      kind: "Behind the scenes",
                      why: "The specific ratio is the whole argument.",
                    },
                  ],
                }),
              },
            }),
      })

      check(result.ok, "completeSpokenRiff succeeds", JSON.stringify(result))

      const [after] = await db.select().from(riff).where(eq(riff.id, riffId))
      check(after?.state === "ready", "the riff flips to ready", after?.state)
      check(
        after?.scrap.startsWith("okay so the thing"),
        "the transcript is stored verbatim"
      )

      const angles = await db
        .select()
        .from(riffAngle)
        .where(eq(riffAngle.riffId, riffId))

      check(angles.length > 0, "angles were written", `${angles.length}`)
      check(
        angles.every((a) => a.hook.trim().length > 0),
        "every angle has a hook"
      )
      check(
        angles
          .map((a) => a.position)
          .sort()
          .join(",") === angles.map((_, i) => i).join(","),
        "positions are dense and start at zero"
      )

      /**
       * The check that matters most in LIVE mode.
       *
       * The user's own specifics must SURVIVE — this is the inverse of
       * verify-adapt-e2e, where the source's numbers must not. An angle
       * generator accidentally pointed at `generateAngles` would strip "forty"
       * out as somebody else's number, and the result would read as fine while
       * being the wrong prompt entirely.
       */
      if (LIVE) {
        const all = angles.map((a) => `${a.hook} ${a.why}`).join(" ")
        check(
          /forty|40|per-seat|seat/i.test(all),
          "the user's own specifics survive into the angles",
          all.slice(0, 120)
        )
      }
    }

    console.log("\n── the page renders it ──")
    {
      const page = await fetch(`${BASE}/riffs`, {
        headers: { cookie },
        redirect: "manual",
      })
      const html = await page.text()

      check(page.status === 200, "/riffs renders", String(page.status))
      check(
        html.includes("Record a thought"),
        "the record control is on /riffs"
      )
      check(
        html.includes("Per-seat prising") || html.includes("per-seat"),
        "the new riff's angles are on the page"
      )
    }

    console.log("\n── a failed riff says why ──")
    {
      const riffId = await startVoiceRiff(owner.id)
      created.push(riffId)

      // The transcription guard, reached through the real function with a
      // stubbed model that answers confidently with nothing — the silent-mic
      // case, which is the one that looks like success from the outside.
      const outcome = await transcribeVoiceNote({
        audio: silentWav(),
        deps: { transcribe: async () => ({ text: "", durationInSeconds: 1 }) },
      })

      check(!outcome.ok, "a silent recording is refused")
      if (!outcome.ok) {
        const { failSpokenRiff } = await import("../lib/riffs")
        await failSpokenRiff({
          riffId,
          userId: owner.id,
          message: outcome.message,
        })
      }

      const [row] = await db.select().from(riff).where(eq(riff.id, riffId))
      check(row?.state === "failed", "the riff lands failed", row?.state)
      check(
        (row?.failure ?? "").length > 0,
        "carrying a reason a person can read",
        row?.failure
      )

      const page = await fetch(`${BASE}/riffs`, {
        headers: { cookie },
        redirect: "manual",
      })
      const html = await page.text()
      check(
        html.includes(row?.failure ?? " "),
        "and the reason reaches the screen"
      )
    }
  } finally {
    if (created.length > 0) {
      console.log(`\n── teardown (${created.length} riffs) ──`)
      /**
       * Scoped to the ids this run created, and nothing else.
       *
       * Deleting by userId would be simpler and would also delete riffs the
       * dev account made by hand — including the one from a live
       * angle-generation test that is deliberately kept there. Against the one
       * database this repo has, "delete everything belonging to the test
       * account" is not a safe default.
       */
      await db.delete(riffAngle).where(inArray(riffAngle.riffId, created))
      await db.delete(riff).where(inArray(riff.id, created))
      console.log("  cleaned")
    }
  }
}

async function signIn(): Promise<string> {
  const password = process.env.DEV_ACCOUNT_PASSWORD

  if (!password) {
    throw new Error(
      "DEV_ACCOUNT_PASSWORD is not set. See scripts/dev-account.ts."
    )
  }

  let response = await signInOnce(ACCOUNT, password)

  // Better Auth rate-limits sign-in at 5 per 60s, and a script meant to be run
  // repeatedly hits that honestly. Waiting it out beats reporting it as a bad
  // password, which is a different status code entirely (401 vs 429).
  for (let attempt = 0; response.status === 429 && attempt < 6; attempt++) {
    console.log("  rate limited, waiting 15s")
    await new Promise((resolve) => setTimeout(resolve, 15_000))
    response = await signInOnce(ACCOUNT, password)
  }

  if (!response.ok) {
    throw new Error(
      `sign-in failed (${response.status}): ${await response.text()}. ` +
        `Run: npx tsx --env-file=.env.local scripts/dev-account.ts`
    )
  }

  return (response.headers.getSetCookie?.() ?? [])
    .map((entry) => entry.split(";")[0])
    .join("; ")
}

function signInOnce(email: string, password: string) {
  // Origin is not optional. Better Auth rejects a state-changing request
  // without one as CSRF, and node's fetch does not add it the way a browser
  // does — so omitting it fails with MISSING_OR_NULL_ORIGIN and looks like bad
  // credentials. It must match the configured BETTER_AUTH_URL.
  return fetch(`${BASE}/api/auth/sign-in/email`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ email, password }),
  })
}

main().then(
  () => {
    console.log(
      failures ? `\nFAILED — ${failures} check(s)` : "\nEverything holds."
    )
    process.exit(failures ? 1 : 0)
  },
  (error) => {
    console.error(error)
    process.exit(1)
  }
)
