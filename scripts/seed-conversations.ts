/** Seeds two threads so the read path can be exercised without a model. */
import type { UIMessage } from "ai"

import { eq } from "drizzle-orm"

import { db } from "../lib/db"
import { saveTurn } from "../lib/conversations"
import { conversation } from "../lib/schema-app"
import { user } from "../lib/schema"

const text = (id: string, role: "user" | "assistant", body: string) =>
  ({ id, role, parts: [{ type: "text", text: body }] }) as UIMessage

async function main() {
  // Explicit, because "the first row" quietly seeded the wrong account once.
  const email = process.argv[2]
  if (!email) throw new Error("Usage: seed-conversations.ts <email>")

  const [owner] = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1)

  if (!owner) throw new Error(`No user with email ${email}`)

  // Re-runnable. saveTurn now refuses to write into someone else's thread, so
  // re-seeding to a different account has to clear the old rows first.
  for (const id of ["conv-seed-tailwind", "conv-seed-scroll"]) {
    await db.delete(conversation).where(eq(conversation.id, id))
  }

  await saveTurn({
    conversationId: "conv-seed-tailwind",
    userId: owner.id,
    messages: [
      text("seed-a-1", "user", "What did I ship this week that is worth writing about?"),
      text("seed-a-2", "assistant", "The Tailwind comment-scanning find. It is specific and a reader can check it in their own bundle."),
    ],
  })

  await saveTurn({
    conversationId: "conv-seed-scroll",
    userId: owner.id,
    messages: [
      text("seed-b-1", "user", "Why did the transcript stop scrolling after the sidebar rework?"),
      text("seed-b-2", "assistant", "The shell had a min-height, so the scroller's percentage heights had nothing to resolve against."),
    ],
  })

  console.log("seeded 2 conversations for user", owner.id)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
