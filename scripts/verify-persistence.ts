/**
 * Exercises the real persistence path without a model in the loop.
 * Run with: npx tsx --env-file=.env.local scripts/verify-persistence.ts
 */
import type { UIMessage } from "ai"
import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import {
  deleteConversation,
  getMessageRows,
  listConversations,
  saveTurn,
} from "../lib/conversations"
import { conversation, message } from "../lib/schema-app"
import { user } from "../lib/schema"

function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`)
  if (!ok) process.exitCode = 1
}

const CONV = "conv-verify-0001"

const turn: UIMessage[] = [
  {
    id: "msg-verify-user",
    role: "user",
    parts: [{ type: "text", text: "What did I ship this week worth writing about?" }],
  },
  {
    id: "msg-verify-assistant",
    role: "assistant",
    parts: [
      { type: "reasoning", text: "Two candidates; the Tailwind one is checkable.", state: "done" },
      {
        type: "tool-searchSources",
        toolCallId: "call-1",
        state: "output-available",
        input: { since: "7d" },
        output: { commits: 24 },
      },
      { type: "text", text: "Three things landed. Only one is worth a post." },
    ],
  },
] as UIMessage[]

async function main() {
  const [owner] = await db.select({ id: user.id }).from(user).limit(1)
  if (!owner) throw new Error("No user rows — sign up first.")

  await db.delete(conversation).where(eq(conversation.id, CONV))

  console.log("=== write ===")
  await saveTurn({ conversationId: CONV, userId: owner.id, messages: turn })

  const rows = await getMessageRows(CONV)
  check("both messages saved", rows.length === 2, `got ${rows.length}`)
  check("order is user then assistant", rows[0]?.role === "user" && rows[1]?.role === "assistant")

  const parts = rows[1]?.parts as Array<{ type: string }>
  check("reasoning part round-tripped", parts?.some((p) => p.type === "reasoning"))
  check("tool part round-tripped", parts?.some((p) => p.type.startsWith("tool-")))
  check("text part round-tripped", parts?.some((p) => p.type === "text"))

  const [row] = await db.select().from(conversation).where(eq(conversation.id, CONV))
  check("title derived from the first user message", row?.title?.startsWith("What did I ship") === true, String(row?.title))

  console.log("\n=== idempotency: save the same turn again ===")
  await saveTurn({ conversationId: CONV, userId: owner.id, messages: turn })
  const again = await getMessageRows(CONV)
  check("still two rows, not four", again.length === 2, `got ${again.length}`)

  console.log("\n=== list ===")
  const list = await listConversations(owner.id)
  check("conversation appears in the list", list.some((c) => c.id === CONV))

  console.log("\n=== ownership ===")
  await deleteConversation(CONV, "someone-elses-user-id")
  const survived = await db.select().from(conversation).where(eq(conversation.id, CONV))
  check("another user cannot delete it", survived.length === 1)

  let hijackBlocked = false
  try {
    await saveTurn({ conversationId: CONV, userId: "someone-elses-user-id", messages: turn })
  } catch {
    hijackBlocked = true
  }
  check("another user cannot write into it", hijackBlocked)
  const ownerStill = await db
    .select({ userId: conversation.userId })
    .from(conversation)
    .where(eq(conversation.id, CONV))
  check("ownership unchanged after the attempt", ownerStill[0]?.userId === owner.id)

  console.log("\n=== delete + cascade ===")
  await deleteConversation(CONV, owner.id)
  const goneConv = await db.select().from(conversation).where(eq(conversation.id, CONV))
  const goneMsgs = await db.select().from(message).where(eq(message.conversationId, CONV))
  check("conversation deleted", goneConv.length === 0)
  check("messages cascaded", goneMsgs.length === 0, `${goneMsgs.length} left`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
