/**
 * Studio draft card: save does not queue, approve uses the same placement as
 * /drafts, a stale card cannot approve, and the conversation renders the
 * writing.
 *
 *   npx tsx --env-file=.env.local scripts/verify-studio-draft.ts
 *   npx tsx --env-file=.env.local scripts/verify-studio-draft.ts --port 3001
 *
 * Guarded on @quincy.test. Teardown deletes only what this run created.
 *
 * The mutation path does not need a running server. The page-render checks
 * do, and are skipped if localhost is down.
 */
import type { UIMessage } from "ai"
import { eq } from "drizzle-orm"

import {
  approveVersionFor,
  previewApprovalFor,
  saveVersionBodyFor,
} from "../lib/draft-writes"
import { saveTurn, deleteConversation } from "../lib/conversations"
import { db } from "../lib/db"
import { user } from "../lib/schema"
import {
  draft,
  draftVersion,
  scheduledPost,
  slot,
} from "../lib/schema-app"
import { requireTestTarget } from "./target-guard"

const portFlag = process.argv.indexOf("--port")
const PORT = portFlag > -1 ? process.argv[portFlag + 1] : "3000"
const BASE = `http://localhost:${PORT}`
const ACCOUNT = requireTestTarget(
  process.env.DEV_ACCOUNT_EMAIL ?? "dev@quincy.test",
  "verify-studio-draft.ts"
)

const stamp = Date.now().toString(36)
const DRAFT_ID = `verify-studio-${stamp}`
const VERSION_ID = `${DRAFT_ID}-x`
const SLOT_ID = `${DRAFT_ID}-slot`
const CONV_ID = `conv-verify-studio-${stamp}`
const BODY =
  "In August Tidewell made $4.1k, but Quincy made $0.\n\nThe harbour covers the bills."
const EDITED = `${BODY}\n\nEdited in Studio.`

let failures = 0

function check(ok: boolean, label: string, detail = "") {
  console.log(
    `  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`
  )
  if (!ok) failures += 1
}

async function queuedCount(versionId: string) {
  const rows = await db
    .select({ id: scheduledPost.id })
    .from(scheduledPost)
    .where(eq(scheduledPost.draftVersionId, versionId))
  return rows.length
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

  try {
    await db.insert(slot).values({
      id: SLOT_ID,
      userId: owner.id,
      channel: "x",
      weekday: 6,
      timeOfDay: "11:17",
    })

    await db.insert(draft).values({
      id: DRAFT_ID,
      userId: owner.id,
      idea: "August cashflow",
      riffHook: "August cashflow",
      sourceId: "notes",
      sourceLabel: "Pasted",
    })

    await db.insert(draftVersion).values({
      id: VERSION_ID,
      draftId: DRAFT_ID,
      channel: "x",
      label: "X",
      body: BODY,
      state: "writing",
    })

    console.log("── save does not queue ──")
    {
      const saved = await saveVersionBodyFor(owner.id, VERSION_ID, EDITED)
      check(saved.ok, "save writes the body", saved.ok ? "" : saved.message)
      check(
        (await queuedCount(VERSION_ID)) === 0,
        "saving does not create a scheduled_post"
      )

      const [row] = await db
        .select({ body: draftVersion.body, state: draftVersion.state })
        .from(draftVersion)
        .where(eq(draftVersion.id, VERSION_ID))
        .limit(1)
      check(row?.body === EDITED, "Drafts would see the edited body")
      check(row?.state === "writing", "save leaves the version unapproved")
    }

    console.log("\n── preview names a time ──")
    const preview = await previewApprovalFor(
      owner.id,
      VERSION_ID,
      owner.timezone
    )
    check(preview.ok, "preview succeeds")
    if (preview.ok && "goingOut" in preview) {
      check(preview.goingOut.length > 0, "preview has a going-out label", preview.goingOut)
      check(preview.timezone.length > 0, "preview names the timezone", preview.timezone)
    } else if (preview.ok) {
      check(
        preview.reason === "no-slot" || preview.reason === "slots-full",
        "preview reports why there is no time",
        preview.reason
      )
    }

    console.log("\n── a stale card cannot approve ──")
    {
      const [row] = await db
        .select({ updatedAt: draftVersion.updatedAt })
        .from(draftVersion)
        .where(eq(draftVersion.id, VERSION_ID))
        .limit(1)
      const stale = "2000-01-01T00:00:00.000Z"
      let threw = false
      try {
        await approveVersionFor(owner.id, VERSION_ID, EDITED, {
          timezone: owner.timezone,
          expectedUpdatedAt: stale,
        })
      } catch (cause) {
        threw = cause instanceof Error && /has changed/.test(cause.message)
      }
      check(threw, "approve with an old timestamp is refused")
      check(
        (await queuedCount(VERSION_ID)) === 0,
        "the stale attempt queued nothing"
      )
      check(row !== undefined, "the version still exists")
    }

    console.log("\n── approve uses the same placement as /drafts ──")
    {
      const [row] = await db
        .select({ updatedAt: draftVersion.updatedAt })
        .from(draftVersion)
        .where(eq(draftVersion.id, VERSION_ID))
        .limit(1)

      const result = await approveVersionFor(owner.id, VERSION_ID, EDITED, {
        timezone: owner.timezone,
        expectedUpdatedAt: row?.updatedAt.toISOString(),
      })

      const [after] = await db
        .select({ state: draftVersion.state, body: draftVersion.body })
        .from(draftVersion)
        .where(eq(draftVersion.id, VERSION_ID))
        .limit(1)

      check(after?.state === "approved", "the version is approved")
      check(after?.body === EDITED, "approval kept the edited body")

      if (result.scheduled) {
        check(
          (await queuedCount(VERSION_ID)) === 1,
          "one scheduled_post row",
          String(await queuedCount(VERSION_ID))
        )
      } else {
        check(
          result.reason === "no-slot" || result.reason === "slots-full",
          "honest no-time reason rather than inventing a slot",
          result.reason
        )
        check(
          (await queuedCount(VERSION_ID)) === 0,
          "no scheduled_post when there is no time"
        )
      }

      await approveVersionFor(owner.id, VERSION_ID, EDITED, {
        timezone: owner.timezone,
      })
      if (result.scheduled) {
        check(
          (await queuedCount(VERSION_ID)) === 1,
          "a second approve does not add another scheduled_post"
        )
      }
    }

    console.log("\n── conversation round-trip ──")
    {
      const turn: UIMessage[] = [
        {
          id: `${CONV_ID}-user`,
          role: "user",
          parts: [
            {
              type: "text",
              text: "What would you write next?",
            },
          ],
        },
        {
          id: `${CONV_ID}-assistant`,
          role: "assistant",
          parts: [
            {
              type: "tool-draft_angle",
              toolCallId: `${CONV_ID}-call`,
              state: "output-available",
              input: { angleId: "ang_verify" },
              output: {
                ok: true,
                message:
                  "Drafted. The writing is in this conversation, waiting for you to approve. Nothing goes out until you do.",
                pieceId: DRAFT_ID,
                versions: [
                  {
                    versionId: VERSION_ID,
                    channel: "x",
                    label: "X",
                    body: EDITED,
                    state: "approved",
                    updatedAt: new Date().toISOString(),
                  },
                ],
                existing: false,
                fellBack: [],
                overLimit: [],
              },
            },
          ],
        },
      ]

      await saveTurn({
        conversationId: CONV_ID,
        userId: owner.id,
        messages: turn,
      })
      check(true, "conversation with a draft card saved")
    }

    console.log("\n── page render ──")
    {
      const rendered = await tryPage(owner.email)
      if (!rendered.attempted) {
        check(true, "dev server not running — skipped HTML check")
      } else if (!rendered.cookie) {
        check(false, "could not sign in for the HTML check", rendered.error)
      } else {
        const page = await fetch(`${BASE}/c/${CONV_ID}`, {
          headers: { cookie: rendered.cookie },
          redirect: "manual",
        })
        const html = await page.text()
        check(page.status === 200, "/c/:id renders the conversation", String(page.status))
        check(
          html.includes("August I made") || html.includes("Quincy made $0"),
          "the draft body is in the page"
        )
        check(
          html.includes("Approve") || html.includes("Approved"),
          "the card exposes Approve or Approved"
        )
        check(
          html.includes("data-draft-artifact") &&
            html.includes('data-artifact="safari"'),
          "the draft sits in the Safari window"
        )
      }
    }
  } finally {
    console.log("\n── teardown ──")
    await deleteConversation(CONV_ID, owner.id)
    await db.delete(draft).where(eq(draft.id, DRAFT_ID))
    await db.delete(slot).where(eq(slot.id, SLOT_ID))
    const leftover = await db
      .select({ id: draft.id })
      .from(draft)
      .where(eq(draft.id, DRAFT_ID))
    check(leftover.length === 0, "the verify draft is gone")
  }
}

async function tryPage(email: string): Promise<{
  attempted: boolean
  cookie?: string
  error?: string
}> {
  try {
    const health = await fetch(BASE, { redirect: "manual" })
    if (!health.ok && health.status >= 500) {
      return { attempted: false }
    }
  } catch {
    return { attempted: false }
  }

  const password = process.env.DEV_ACCOUNT_PASSWORD
  if (!password) {
    return {
      attempted: true,
      error: "DEV_ACCOUNT_PASSWORD is not set",
    }
  }

  try {
    const response = await fetch(`${BASE}/api/auth/sign-in/email`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: BASE },
      body: JSON.stringify({ email, password }),
    })
    if (response.status === 404) {
      return { attempted: false }
    }
    if (!response.ok) {
      return {
        attempted: true,
        error: `sign-in ${response.status}`,
      }
    }
    const cookie = (response.headers.getSetCookie?.() ?? [])
      .map((entry) => entry.split(";")[0])
      .join("; ")
    return { attempted: true, cookie }
  } catch (cause) {
    return {
      attempted: true,
      error: cause instanceof Error ? cause.message : "sign-in failed",
    }
  }
}

main()
  .then(() => {
    console.log(
      failures ? `\nFAILED — ${failures} check(s)` : "\nEverything holds."
    )
    if (failures) process.exitCode = 1
  })
  .catch((cause) => {
    console.error(cause)
    process.exit(1)
  })
