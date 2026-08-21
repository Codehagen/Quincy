import type { UIMessage } from "ai"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "./db"
import { conversation, message } from "./schema-app"

/**
 * The sidebar shows recents, not everything. An unbounded list beside nine
 * fixed surfaces makes the fixed ones harder to find — the thing that grows
 * wins by volume. Seven is enough to cover "the one I was just in"; the rest
 * belongs on /conversations, which is built for browsing.
 */
export const SIDEBAR_CONVERSATION_LIMIT = 7
const TITLE_MAX_LENGTH = 60

/**
 * Every read and write takes a userId and filters on it. Ownership is not
 * checked once at the route and then trusted — a query that forgets the filter
 * would happily hand one person another's transcript, and that mistake is
 * invisible until it is not.
 */

export type ConversationSummary = {
  id: string
  title: string | null
  updatedAt: Date
}

function selectSummaries(userId: string) {
  return db
    .select({
      id: conversation.id,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    })
    .from(conversation)
    .where(eq(conversation.userId, userId))
    .orderBy(desc(conversation.updatedAt))
}

/** Sidebar recents. */
export async function listConversations(
  userId: string
): Promise<ConversationSummary[]> {
  return selectSummaries(userId).limit(SIDEBAR_CONVERSATION_LIMIT)
}

/**
 * The full index. Unbounded for now, which is honest at this size — when it
 * stops being, this is the one query that needs paging, not the sidebar's.
 */
export async function listAllConversations(
  userId: string
): Promise<ConversationSummary[]> {
  return selectSummaries(userId)
}

export async function getConversation(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
    .limit(1)

  return row ?? null
}

/** Raw rows. The caller runs them through validateUIMessages to get types back. */
export async function getMessageRows(conversationId: string) {
  return db
    .select({
      id: message.id,
      role: message.role,
      parts: message.parts,
    })
    .from(message)
    .where(eq(message.conversationId, conversationId))
    .orderBy(asc(message.createdAt))
}

export async function deleteConversation(id: string, userId: string) {
  // Messages go with it via the cascade on the foreign key.
  await db
    .delete(conversation)
    .where(and(eq(conversation.id, id), eq(conversation.userId, userId)))
}

/**
 * First user message, trimmed on a word boundary. A model-generated title is a
 * second round trip for something the opening line already answers.
 */
export function deriveTitle(messages: UIMessage[]): string | null {
  const first = messages.find((m) => m.role === "user")

  if (!first) {
    return null
  }

  const text = first.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim()

  if (!text) {
    return null
  }

  if (text.length <= TITLE_MAX_LENGTH) {
    return text
  }

  const cut = text.slice(0, TITLE_MAX_LENGTH)
  const lastSpace = cut.lastIndexOf(" ")

  return `${lastSpace > 20 ? cut.slice(0, lastSpace) : cut}…`
}

/**
 * Writes the whole turn. Called from the stream's onEnd, where the SDK hands
 * back the full message list rather than just the new reply.
 *
 * The neon-http driver has no transactions, so this is a sequence of
 * statements, ordered so a failure part-way leaves something coherent: the
 * conversation exists before any message references it, and messages are
 * upserted on their own ids so a retry updates rather than duplicates.
 */
export async function saveTurn({
  conversationId,
  userId,
  messages,
}: {
  conversationId: string
  userId: string
  messages: UIMessage[]
}) {
  const now = new Date()

  // Ownership is checked before anything is written.
  //
  // The upsert below conflicts on the id alone, and its update clause never
  // touches user_id — so without this, posting a conversation id belonging to
  // someone else would take the conflict path, leave their ownership intact,
  // and then write the caller's messages into their thread. The id is
  // attacker-supplied; it proves nothing on its own.
  const [existing] = await db
    .select({ userId: conversation.userId })
    .from(conversation)
    .where(eq(conversation.id, conversationId))
    .limit(1)

  if (existing && existing.userId !== userId) {
    throw new Error("Conversation belongs to another user.")
  }

  await db
    .insert(conversation)
    .values({
      id: conversationId,
      userId,
      title: deriveTitle(messages),
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: conversation.id,
      set: { updatedAt: now },
    })

  if (messages.length === 0) {
    return
  }

  await db
    .insert(message)
    .values(
      messages.map((m, index) => ({
        id: m.id,
        conversationId,
        role: m.role,
        parts: m.parts,
        // Index-derived so ordering survives a batch written in the same
        // millisecond, which is exactly what happens on the first turn.
        createdAt: new Date(now.getTime() + index),
      }))
    )
    .onConflictDoUpdate({
      target: message.id,
      // `excluded` is the row Postgres was about to insert. Referencing it is
      // how an upsert writes the incoming value rather than keeping the stored
      // one — which matters when a turn is saved again after a retry.
      set: { parts: sql`excluded.parts` },
    })
}
