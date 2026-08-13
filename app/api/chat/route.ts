import {
  convertToModelMessages,
  createIdGenerator,
  createUIMessageStreamResponse,
  isStepCount,
  smoothStream,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from "ai"

import { auth } from "@/lib/auth"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { ceilingVerdict, inputVerdict } from "@/lib/chat-guards"
import { chatTools, MAX_CHAT_STEPS } from "@/lib/chat-tools"
import { renderBrainForUser } from "@/lib/brain"
import { saveTurn } from "@/lib/conversations"
import { captureTurn } from "@/lib/heartbeat"
import { recordUsage, summariseUsage } from "@/lib/usage"

/**
 * Sixty, not thirty.
 *
 * It was thirty when a turn was one model call. A turn is now up to
 * `MAX_CHAT_STEPS` calls with database reads between them, and `draft_angle`
 * makes a model call of its own inside one of those steps — so the old ceiling
 * would cut a working turn off mid-draft, after the money was spent and before
 * the user was told what happened.
 *
 * Still well under the editor agent's 120: that one edits video and this one
 * writes sentences.
 */
export const maxDuration = 60

/**
 * Model id is a Vercel AI Gateway slug, not a provider SDK. The gateway
 * resolves `provider/model` and bills through one key, so switching models is
 * an env change rather than a new dependency and a new client.
 */
const MODEL = process.env.CHAT_MODEL ?? "anthropic/claude-sonnet-5"

/**
 * The reply's primary key. Prefixed like the conversation id, so a server-made
 * id is distinguishable from the client's at a glance in the database — which
 * is exactly the tell that would have caught this sooner.
 */
const generateMessageId = createIdGenerator({ prefix: "msg", size: 16 })

const BASE_PROMPT = `You are Quincy, an AI Head of Content.

You take someone's raw material — shipped work, half-thoughts, essays, meetings —
and turn it into writing in their voice. You are a producer: the work goes out
under their name, not yours.

Be direct and concrete. Lead with the point. No preamble, no "great question",
no summarising the request back. When you do not have enough to work with, ask
the one question that unblocks you rather than guessing at length.

You have tools that read this person's own state — their riffs, drafts, lineup,
channels and sources — and two that write: capture_riff and draft_angle. Rules
that matter:

- Look before you answer. A question about what is waiting, what is scheduled,
  or what to write next is answered from the tools, never from memory or from
  what was said earlier in the conversation. State changes between turns.
- Never invent a riff, a draft, a hook or a time. If a tool did not return it,
  it does not exist.
- When they give you material — pasted, dictated, described — put it through
  capture_riff. That is how anything becomes something the product can work on.
  Do not write the post directly in the conversation instead: writing that
  never becomes a draft never reaches /drafts and can never be published, so it
  is a dead end however good it is. Capture it, then draft from an angle.
- You draft, they send. A draft waits on /drafts until they approve it. You
  cannot approve, schedule or publish, and you must not imply otherwise — say
  "it is waiting for you".
- Both writes cost money. Do them when asked, on the thing they chose, not
  speculatively and not several at once to be helpful.
- If a tool refuses, say what it said and what would fix it. A ceiling, a
  cooldown and text that is too long are three different problems.`

export async function POST(request: Request) {
  // The session is read here, not taken from the body. A conversation id in a
  // request proves nothing about who is allowed to write to it.
  const session = await auth.api.getSession({ headers: request.headers })

  if (!session) {
    return Response.json({ error: "Not signed in." }, { status: 401 })
  }

  /**
   * The money gate. Every model call in the product goes through this handler,
   * so if this check is right, no unpaid request can cost anything — which is
   * why it sits above the key check and above the body parse rather than
   * somewhere deeper in the flow.
   *
   * Read-only accounts still reach their conversations, their brain and their
   * drafts; what they lose is the ability to spend. See docs/billing.md.
   */
  const entitlement = await resolveEntitlementForRequest(session.user)

  if (!isEntitled(entitlement)) {
    return paywallResponse(entitlement)
  }

  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json(
      {
        error:
          "AI_GATEWAY_API_KEY is not set. Add it to .env.local, or run the scripted transport with NEXT_PUBLIC_CHAT_TRANSPORT=scripted.",
      },
      { status: 503 }
    )
  }

  const { id, messages }: { id: string; messages: UIMessage[] } =
    await request.json()

  // Ordering from here is deliberate: entitlement (cheap, cookie-adjacent)
  // → gateway key → parse → input verdict (free, in-process) → ceiling (one
  // query) → brain render (one query) → model call. Each step costs more
  // than the last, so a request that fails early never pays for a later
  // check.
  const verdict = inputVerdict(messages)
  if (!verdict.ok) {
    return Response.json({ error: verdict.error }, { status: 413 })
  }

  // The ceiling, before the brain render — one aggregate query against
  // usage_event. Reads the last 24 hours rather than the calendar day so a
  // midnight-adjacent session cannot double-spend.
  const spent = await summariseUsage(
    session.user.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )
  const ceiling = ceilingVerdict(spent.costMicros)
  if (!ceiling.ok) {
    return Response.json(
      { error: ceiling.error, state: "ceiling" },
      { status: 429 }
    )
  }

  // The brain, whole. No retrieval: identity, voice, rules and strategy are a
  // few thousand tokens together, and the story bank goes in as a catalogue of
  // titles rather than full text. Searching a corpus this small would cost an
  // embedding call to find what already fits. See docs/brain.md.
  //
  // Read from the session's user, never from the request body — the same rule
  // the conversation id follows, for the same reason.
  const brain = await renderBrainForUser(session.user.id)

  const result = streamText({
    model: MODEL,
    system: brain ? `${BASE_PROMPT}\n\n${brain}` : BASE_PROMPT,
    messages: await convertToModelMessages(messages),
    /**
     * The chat can finally read the tables the pages read. See lib/chat-tools.ts
     * for what they are and why only one of them writes.
     *
     * The user comes from the session resolved above, never from the body — the
     * same rule the conversation id and the brain render already follow, and it
     * is what stops a tool being asked to read somebody else's riffs.
     */
    tools: chatTools(session.user),
    /**
     * A tool loop is a spending path, and AGENTS.md asks every spending path
     * for a ceiling. Without this a model that cannot make progress calls the
     * cheapest read it has until the function times out, and every call is
     * billed. See `MAX_CHAT_STEPS`.
     */
    stopWhen: isStepCount(MAX_CHAT_STEPS),
    // The gateway delivers whatever chunk sizes the provider felt like sending
    // — a clause, then forty characters, then a single token. Each arrival
    // rewraps the paragraph, so the transcript lurches rather than writes.
    // Word chunking on a fixed interval spends the same total time and lands
    // every reflow on a word boundary, which is where the eye expects one.
    experimental_transform: smoothStream({ chunking: "word" }),
  })

  // toUIMessageStream + createUIMessageStreamResponse rather than
  // toUIMessageStreamResponse, and onEnd rather than onFinish — both of the
  // latter are deprecated in ai@7 and slated for removal.
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      // Passing the originals puts the stream in persistence mode, so onEnd
      // hands back the whole conversation rather than just the new reply.
      originalMessages: messages,
      // Not optional, despite what persistence mode implies. originalMessages
      // supplies an id for the response only when the last original is itself
      // an assistant message — the regenerate case. On an ordinary turn the
      // last original is the user's, so without this the reply is saved under
      // the empty string. Every assistant message in the database then shares
      // one primary key, and the second turn dies on "ON CONFLICT DO UPDATE
      // cannot affect row a second time" because the same key appears twice in
      // one insert.
      generateMessageId,
      sendReasoning: true,
      onEnd: async ({ messages: finalMessages, isAborted }) => {
        /**
         * Usage first, and deliberately above the `isAborted` return.
         *
         * A stopped generation still spent tokens — the model produced them,
         * we were billed for them, and the only thing the abort changed is
         * that we throw the text away. Recording below the early return would
         * make every cancelled turn invisible and quietly understate what a
         * user costs.
         *
         * Same failure posture as the two writes below it: the answer has
         * already reached the browser, so a bookkeeping failure logs and is
         * dropped rather than throwing into the stream's teardown.
         */
        try {
          const usage = await result.usage

          await recordUsage({
            userId: session.user.id,
            conversationId: id,
            model: MODEL,
            inputTokens: usage.inputTokens ?? 0,
            cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
            outputTokens: usage.outputTokens ?? 0,
          })
        } catch (cause) {
          console.error("[chat] could not record usage:", cause)
        }

        // A stopped generation leaves a half-written reply. Saving it would
        // mean reloading the page restores a sentence that trails off.
        if (isAborted) {
          return
        }

        // The answer has already streamed to the browser by now. A failed write
        // should cost the user their history, not their reply — so this logs
        // rather than throwing into the stream's teardown. saveTurn throws on
        // an ownership mismatch, and that is exactly a case worth seeing.
        try {
          await saveTurn({
            conversationId: id,
            userId: session.user.id,
            messages: finalMessages,
          })
        } catch (cause) {
          // The whole error, not just its message. Drizzle's outermost message
          // is "Failed query: insert into ..." and the actual Postgres reason
          // lives on the cause underneath it — logging only the message is why
          // a save that had been failing on every second turn looked like
          // nothing at all in the terminal.
          console.error(`[chat] could not save conversation ${id}:`, cause)
        }

        // Capture, not compaction. One insert per turn with no judgment applied
        // — Heartbeat decides weekly what was worth keeping. Deciding here
        // would mean writing down the model's reading of a sentence before the
        // user has had a chance to correct it.
        //
        // Only the user's own words. The assistant's reply is Quincy quoting
        // itself, and feeding that back as memory is how a brain drifts.
        try {
          const lastUser = [...finalMessages]
            .reverse()
            .find((m) => m.role === "user")

          const text = (lastUser?.parts ?? [])
            .filter((part) => part.type === "text")
            .map((part) => part.text)
            .join(" ")

          if (text) {
            await captureTurn({
              userId: session.user.id,
              source: `conversation:${id}`,
              text,
            })
          }
        } catch (cause) {
          console.error(`[chat] could not capture turn for ${id}:`, cause)
        }
      },
    }),
  })
}
