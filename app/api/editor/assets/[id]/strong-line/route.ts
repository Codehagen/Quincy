import { ceilingVerdict } from "@/lib/chat-guards"
import { getAsset } from "@/lib/editor/assets"
import { strongLineSlot } from "@/lib/editor/reading"
import { candidateSentences, fillStrongLine } from "@/lib/editor/strong-line"
import {
  isEntitled,
  paywallResponse,
  resolveEntitlementForRequest,
} from "@/lib/entitlement"
import { getSession } from "@/lib/session"
import { summariseUsage } from "@/lib/usage"

/**
 * The strong line of a take, chosen once per asset (lib/editor/strong-line.ts).
 *
 * Asked by the cut page when its reading has no strong line yet. A cached
 * line costs nothing; the one call per asset sits behind the entitlement
 * gate and the day's ceiling, and the claim in fillStrongLine makes it once.
 */

export const maxDuration = 30

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession()
  if (!session) return Response.json({ error: "Not signed in." }, { status: 401 })

  const { id } = await params
  const asset = await getAsset(id, session.user.id)
  if (!asset?.transcript) {
    return Response.json({ error: "No transcript for this recording." }, { status: 404 })
  }

  // A line already chosen, or a call already made: free, and no gate needed.
  const slot = strongLineSlot(asset.transcript)
  if (slot) return Response.json({ line: slot.state === "done" ? slot.line : null })

  // Development only: a scripted choice (the longest sentence), no model
  // call, nothing stored and nothing metered.
  const replay =
    process.env.NODE_ENV !== "production" &&
    new URL(request.url).searchParams.get("replay") === "1"
  if (replay) {
    const sentences = candidateSentences(asset.transcript)
    const line = sentences.length > 1
      ? sentences.reduce((a, b) => (b.length > a.length ? b : a))
      : null
    return Response.json({ line })
  }

  const entitlement = await resolveEntitlementForRequest(session.user)
  if (!isEntitled(entitlement)) return paywallResponse(entitlement)
  if (!process.env.AI_GATEWAY_API_KEY) {
    return Response.json({ error: "AI_GATEWAY_API_KEY is not set." }, { status: 503 })
  }

  const spent = await summariseUsage(
    session.user.id,
    new Date(Date.now() - 24 * 60 * 60 * 1000)
  )
  const ceiling = ceilingVerdict(spent.costMicros)
  if (!ceiling.ok) {
    return Response.json({ error: ceiling.error, state: "ceiling" }, { status: 429 })
  }

  const line = await fillStrongLine({
    id: asset.id,
    userId: session.user.id,
    transcript: asset.transcript,
  })
  return Response.json({ line })
}
