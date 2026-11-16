/**
 * The adapt path and the rhythms cron, against a running dev server, as a
 * browser and Vercel Cron would actually reach them.
 *
 *   npx tsx --env-file=.env.local scripts/verify-adapt-e2e.ts
 *   npx tsx --env-file=.env.local scripts/verify-adapt-e2e.ts --port 3001
 *
 * scripts/verify-rhythms.ts proves the dispatcher's logic. This proves the
 * *product*: that the cron endpoint refuses an unauthenticated caller, that
 * the pages render the new controls, and that a draft made from somebody
 * else's post actually reaches the screen carrying the provenance that says so.
 *
 * The model is stubbed — `createAdaptedDraft` takes an injected adapter — so
 * this costs nothing and cannot be flaky on a provider. What is NOT covered is
 * whether a real adaptation is any good; that needs a human reading it, and
 * the PR body says so.
 *
 * Signs in as the @quincy.test dev account, the same guard
 * scripts/dev-account.ts enforces. Run that first if sign-in fails.
 *
 * Teardown deletes only what it created.
 */
import { eq } from "drizzle-orm"

import { createAdaptedDraft } from "../lib/adapt-draft"
import { db } from "../lib/db"
import { draft, draftVersion } from "../lib/schema-app"
import { user } from "../lib/schema"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`

const ACCOUNT = process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test"

if (!ACCOUNT.endsWith("@quincy.test")) {
  throw new Error(
    `Refusing to touch ${ACCOUNT} — this script writes drafts and only ` +
      "operates on @quincy.test accounts."
  )
}

/** A post nobody wrote, with specifics the adaptation must not carry over. */
const SOURCE = {
  body: "We went from $40k to $180k MRR in nine months after killing per-seat pricing. The seat model punished our best customers.",
  handle: "verifybot",
  url: `https://x.com/verifybot/status/${Date.now()}`,
}

let failures = 0

/** `(condition, label, detail)`, matching scripts/verify-ingest-e2e.ts. */
function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) failures += 1
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

  let draftId: string | null = null

  try {
    console.log(`── the cron endpoint (${BASE}) ──`)
    {
      const anonymous = await fetch(`${BASE}/api/cron/rhythms`, {
        redirect: "manual",
      })
      // 404 rather than 401, deliberately: an unauthenticated caller must not
      // learn the path exists. A 401 here would be a regression.
      check(
        anonymous.status === 404,
        `unauthenticated caller gets 404 (not 401)`,
        String(anonymous.status)
      )

      const wrong = await fetch(`${BASE}/api/cron/rhythms`, {
        headers: { authorization: "Bearer definitely-not-the-secret" },
        redirect: "manual",
      })
      check(wrong.status === 404, "a wrong bearer gets 404", String(wrong.status))

      const secret = process.env.CRON_SECRET
      if (!secret) {
        check(false, "CRON_SECRET is set in this environment", "unset")
      } else {
        const authorised = await fetch(`${BASE}/api/cron/rhythms`, {
          headers: { authorization: `Bearer ${secret}` },
          redirect: "manual",
        })
        const body = await authorised.json()

        // 200 when clean, 500 when degraded. Both are the route working; a
        // 404 or a 503 here would mean the secret or the wiring is wrong.
        check(
          authorised.status === 200 || authorised.status === 500,
          "an authorised caller gets a real sweep",
          `${authorised.status} ${JSON.stringify(body).slice(0, 120)}`
        )
        check(
          typeof body.due === "number" && typeof body.outcomes === "object",
          "the sweep reports due and outcomes"
        )
      }
    }

    console.log("\n── sign in ──")
    const cookie = await signIn()
    check(Boolean(cookie), "session cookie issued")
    if (!cookie) throw new Error("cannot continue without a session")

    console.log("\n── the pages render their new controls ──")
    {
      const drafts = await page(`${BASE}/drafts`, cookie)
      check(drafts.status === 200, "/drafts renders", String(drafts.status))
      check(
        drafts.html.includes("Adapt a post"),
        "the paste-a-post control is on /drafts"
      )

      const rhythm = await page(`${BASE}/rhythm`, cookie)
      check(rhythm.status === 200, "/rhythm renders", String(rhythm.status))
      check(
        rhythm.html.includes("Bookmarks to Posts"),
        "the Bookmarks rhythm is in the catalogue"
      )
      // The switch is only meaningful if it is not disabled. A disabled
      // control renders `data-disabled`; the card for a runnable rhythm
      // must not.
      check(
        rhythm.html.includes("Bookmarks to Posts — off") ||
          rhythm.html.includes("Bookmarks to Posts — on"),
        "its switch has a live aria-label rather than 'not available yet'"
      )

      const detail = await page(`${BASE}/rhythm/bookmarks-to-posts`, cookie)
      check(detail.status === 200, "the detail page renders", String(detail.status))
      check(detail.html.includes("Run now"), "Run now is on the detail page")
    }

    console.log("\n── a foreign post becomes a draft ──")
    {
      /**
       * The model is stubbed and the stub deliberately returns a body that
       * carries NONE of the source's numbers. What is being verified here is
       * the plumbing — rows, provenance, per-channel versions — not the
       * model's judgment, which no automated check can settle.
       */
      const result = await createAdaptedDraft({
        userId: owner.id,
        source: SOURCE,
        note: "we did the opposite",
        sourceId: "pasted",
        sourceLabel: "Pasted post",
        deps: {
          adapt: async ({ channels }) => ({
            idea: "Why per-seat pricing punishes your best customer",
            groundedIn: "their own pricing rewrite",
            versions: channels.map((c) => ({
              channel: c.id,
              body: `Verification draft for ${c.label}. No borrowed numbers here.`,
            })),
          }),
        },
      })

      check(result.ok, "the draft was created", result.ok ? "" : result.message)
      if (!result.ok) throw new Error(result.message)

      draftId = result.draftId

      check(
        result.channels.length >= 1,
        "at least one channel version was written",
        result.channels.join(", ")
      )
      check(
        result.groundedIn.length > 0,
        "the receipt names what it leaned on",
        result.groundedIn
      )

      const [row] = await db
        .select()
        .from(draft)
        .where(eq(draft.id, result.draftId))
        .limit(1)

      // The provenance that makes this feature honest. Without it a borrowed
      // idea is indistinguishable from your own six months later.
      check(
        row?.adaptedFromUrl === SOURCE.url,
        "the source URL is stored on the draft",
        row?.adaptedFromUrl
      )
      check(
        row?.adaptedFromHandle === SOURCE.handle,
        "the source handle is stored",
        row?.adaptedFromHandle
      )

      const versions = await db
        .select()
        .from(draftVersion)
        .where(eq(draftVersion.draftId, result.draftId))

      check(
        versions.length === result.channels.length,
        "a row per channel",
        `${versions.length} rows`
      )
      check(
        versions.every((v) => v.state === "writing"),
        "every version starts unapproved — Quincy drafts, you send"
      )

      /* Idempotency: the Bookmarks rhythm re-reads the same bookmarks every
         run, so a second adaptation of one URL must return the first draft
         rather than buying another model call. */
      const again = await createAdaptedDraft({
        userId: owner.id,
        source: SOURCE,
        sourceId: "pasted",
        sourceLabel: "Pasted post",
        deps: {
          adapt: async () => {
            throw new Error("the model must not be called a second time")
          },
        },
      })

      check(
        again.ok && again.existing && again.draftId === result.draftId,
        "a second adaptation of the same URL returns the first draft",
        again.ok ? `existing=${again.existing}` : again.message
      )
    }

    console.log("\n── and it reaches the screen ──")
    {
      const drafts = await page(`${BASE}/drafts`, cookie)
      check(
        drafts.html.includes("Why per-seat pricing punishes your best customer"),
        "the draft's idea is on /drafts"
      )
      check(
        drafts.html.includes("Adapted from") &&
          drafts.html.includes(SOURCE.handle),
        "the card says whose post it came from"
      )
    }
  } finally {
    console.log("\n── teardown ──")
    if (draftId) {
      // draft_version cascades on delete.
      await db.delete(draft).where(eq(draft.id, draftId))
      console.log(`  removed draft ${draftId}`)
    } else {
      console.log("  nothing to remove")
    }
  }
}

async function page(url: string, cookie: string) {
  const response = await fetch(url, { headers: { cookie }, redirect: "manual" })
  return { status: response.status, html: await response.text() }
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
